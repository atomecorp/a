// Spectral noise reduction. The noise floor is learnt on its own: per bin, the
// minimum of the smoothed power over the last ~1.5 s (minimum statistics,
// Martin), then opened across frequency so a steady tone is never taken for
// noise. A decision-directed Wiener gain (Ephraim–Malah), held above the
// `reduction_db` floor and smoothed across bins, keeps musical noise away.

use crate::stft::{Overlap, Stft};
use crate::{ParamSpec, Processor, StereoBlock, Unit, amplitude_to_db, db_to_amplitude};
use realfft::num_complex::Complex;

pub const REDUCTION_DB: u32 = 0;
pub const SENSITIVITY: u32 = 1;
pub const SMOOTHING: u32 = 2;
pub const PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(
        REDUCTION_DB,
        "reduction_db",
        0.0,
        34.0,
        13.0,
        Unit::Decibels,
    ),
    ParamSpec::new(SENSITIVITY, "sensitivity", 0.0, 1.0, 0.5, Unit::Percent),
    ParamSpec::new(SMOOTHING, "smoothing", 0.0, 1.0, 0.5, Unit::Percent),
];

pub const READINGS: [&str; 1] = ["noise_floor_db"];

// Power smoothing before the minimum search.
const POWER_SMOOTHING: f32 = 0.85;
// The minimum of a smoothed periodogram sits under the mean noise power.
const MINIMUM_BIAS: f32 = 3.0;
// Sub-windows of the minimum search, each about 0.19 s: ~1.5 s in all.
const SUBWINDOWS: usize = 8;
const SUBWINDOW_SECONDS: f32 = 0.19;
// Half-width, in bins, of the opening that removes tones from the floor.
const OPENING: usize = 8;

struct Settings {
    floor: f32,
    oversubtraction: f32,
    prior_weight: f32,
    spread: f32,
}

struct SpectralDenoiser {
    stft: Stft,
    overlap: Overlap,
    spectrum: Vec<Complex<f32>>,
    smoothed: Vec<f32>,
    minimum: Vec<f32>,
    history: Vec<f32>,
    raw: Vec<f32>,
    eroded: Vec<f32>,
    noise: Vec<f32>,
    prior: Vec<f32>,
    gain: Vec<f32>,
    subwindow_frames: usize,
    frames: usize,
    slot: usize,
    // Mean noise power per sample, from the learnt floor (Parseval).
    noise_power: f32,
}

impl SpectralDenoiser {
    fn new(sample_rate: f32) -> Self {
        let stft = Stft::new(sample_rate);
        let bins = stft.bins();
        let subwindow_frames =
            ((SUBWINDOW_SECONDS * sample_rate / stft.hop() as f32).ceil() as usize).max(1);
        let mut denoiser = Self {
            overlap: Overlap::new(&stft),
            spectrum: stft.spectrum(),
            smoothed: vec![0.0; bins],
            minimum: vec![0.0; bins],
            history: vec![0.0; bins * SUBWINDOWS],
            raw: vec![0.0; bins],
            eroded: vec![0.0; bins],
            noise: vec![0.0; bins],
            prior: vec![0.0; bins],
            gain: vec![1.0; bins],
            subwindow_frames,
            frames: 0,
            slot: 0,
            noise_power: 0.0,
            stft,
        };
        denoiser.reset();
        denoiser
    }

    fn reset(&mut self) {
        self.stft.reset();
        self.overlap.clear();
        self.history.fill(f32::MAX);
        self.minimum.fill(f32::MAX);
        self.prior.fill(0.0);
        self.frames = 0;
        self.slot = 0;
        self.noise_power = 0.0;
    }

    #[inline]
    fn push(&mut self, sample: f32, settings: &Settings) -> f32 {
        if self.stft.push(sample) {
            self.frame(settings);
        }
        self.overlap.read(self.stft.read_index())
    }

    fn frame(&mut self, settings: &Settings) {
        self.stft.analyse(&mut self.spectrum);
        let bins = self.spectrum.len();
        let first = self.frames == 0;
        for k in 0..bins {
            let power = self.spectrum[k].norm_sqr();
            self.smoothed[k] = if first {
                power
            } else {
                POWER_SMOOTHING * self.smoothed[k] + (1.0 - POWER_SMOOTHING) * power
            };
            self.minimum[k] = self.minimum[k].min(self.smoothed[k]);
        }
        self.frames += 1;
        if self.frames.is_multiple_of(self.subwindow_frames) {
            let start = self.slot * bins;
            self.history[start..start + bins].copy_from_slice(&self.minimum);
            self.slot = (self.slot + 1) % SUBWINDOWS;
            self.minimum.copy_from_slice(&self.smoothed);
        }
        for k in 0..bins {
            let mut lowest = self.minimum[k];
            for slot in 0..SUBWINDOWS {
                lowest = lowest.min(self.history[slot * bins + k]);
            }
            self.raw[k] = lowest * MINIMUM_BIAS;
        }
        // Opening (erosion then dilation): peaks narrower than the window go.
        for k in 0..bins {
            let range = k.saturating_sub(OPENING)..(k + OPENING + 1).min(bins);
            self.eroded[k] = self.raw[range].iter().copied().fold(f32::MAX, f32::min);
        }
        for k in 0..bins {
            let range = k.saturating_sub(OPENING)..(k + OPENING + 1).min(bins);
            self.noise[k] = self.eroded[range].iter().copied().fold(0.0, f32::max);
        }
        for k in 0..bins {
            let power = self.spectrum[k].norm_sqr();
            let posterior = power / (self.noise[k] * settings.oversubtraction + 1.0e-20);
            let prior = settings.prior_weight * self.prior[k]
                + (1.0 - settings.prior_weight) * (posterior - 1.0).max(0.0);
            let gain = (prior / (1.0 + prior)).max(settings.floor);
            self.prior[k] = gain * gain * posterior;
            self.gain[k] = gain;
        }
        let spread = settings.spread;
        let mut previous = self.gain[0];
        for k in 0..bins {
            let here = self.gain[k];
            let next = self.gain[(k + 1).min(bins - 1)];
            let blurred = 0.25 * previous + 0.5 * here + 0.25 * next;
            previous = here;
            self.spectrum[k] *= (here + (blurred - here) * spread).max(settings.floor);
        }
        let size = self.stft.size() as f32;
        // One-sided bins count twice; Hann's Σw² is 3·size/8.
        self.noise_power = 2.0 * self.noise.iter().sum::<f32>() / (size * size * 0.375);
        self.stft.synthesize(&mut self.spectrum, &mut self.overlap);
    }
}

pub struct Denoise {
    values: [f32; 3],
    channels: [SpectralDenoiser; 2],
    readings: [f32; 1],
}

impl Denoise {
    pub fn new() -> Self {
        let mut denoise = Self {
            values: PARAMS.map(|spec| spec.default),
            channels: [
                SpectralDenoiser::new(48000.0),
                SpectralDenoiser::new(48000.0),
            ],
            readings: [crate::SILENCE_DB],
        };
        denoise.prepare(48000.0, 0);
        denoise
    }

    fn settings(&self) -> Settings {
        let v = self.values;
        let smoothing = v[SMOOTHING as usize];
        Settings {
            floor: db_to_amplitude(-v[REDUCTION_DB as usize]),
            // From half the floor (gentle) to eight times it (aggressive).
            oversubtraction: (4.0 * v[SENSITIVITY as usize] - 1.0).exp2(),
            prior_weight: 0.92 + 0.07 * smoothing,
            spread: smoothing,
        }
    }
}

impl Default for Denoise {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Denoise {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.channels = [
            SpectralDenoiser::new(sample_rate),
            SpectralDenoiser::new(sample_rate),
        ];
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let settings = self.settings();
        let [left, right] = &mut self.channels;
        for sample in block.left.iter_mut() {
            *sample = left.push(*sample, &settings);
        }
        for sample in block.right.iter_mut() {
            *sample = right.push(*sample, &settings);
        }
        let power = 0.5 * (left.noise_power + right.noise_power);
        self.readings[0] = amplitude_to_db(power.sqrt());
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn latency_frames(&self) -> u32 {
        self.channels[0].stft.latency() as u32
    }

    fn tail_frames(&self) -> u32 {
        self.channels[0].stft.size() as u32
    }

    fn reset(&mut self) {
        for channel in &mut self.channels {
            channel.reset();
        }
        self.readings = [crate::SILENCE_DB];
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
