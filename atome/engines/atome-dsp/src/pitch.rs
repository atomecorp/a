// Real-time pitch shifting with formant control. `PitchShifter` is the phase
// vocoder core the harmonizer and the tuner embed: one analysis feeds several
// voices, each with its own pitch and formant ratio. Peaks keep their
// neighbours' phases (identity phase locking, Laroche–Dolson) and a cepstral
// envelope keeps the formants where the voice had them, unless a formant
// shift moves them on purpose.

use crate::delay::DelayLine;
use crate::stft::{Overlap, Stft, wrap_phase};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use realfft::num_complex::Complex;
use std::f32::consts::{PI, TAU};

// The whitening gain is limited so a silent region is never boosted into noise.
const ENVELOPE_GAIN_LIMIT: f32 = 2.76; // ±24 dB, natural log
const ENVELOPE_FLOOR: f32 = 1.0e-3; // −60 dB under the frame's peak
const PEAK_FLOOR: f32 = 1.0e-4; // −80 dB under the frame's peak

struct ShiftVoice {
    ratio: f32,
    formant: f32,
    rotation: Vec<f32>,
    next_rotation: Vec<f32>,
    spectrum: Vec<Complex<f32>>,
    overlap: Overlap,
}

pub struct PitchShifter {
    stft: Stft,
    spectrum: Vec<Complex<f32>>,
    magnitude: Vec<f32>,
    phase: Vec<f32>,
    previous_phase: Vec<f32>,
    frequency: Vec<f32>,
    peaks: Vec<usize>,
    region_start: Vec<usize>,
    log_envelope: Vec<f32>,
    cepstrum: Vec<f32>,
    cepstrum_spectrum: Vec<Complex<f32>>,
    lifter: usize,
    voices: Vec<ShiftVoice>,
}

impl PitchShifter {
    // Allocates everything for `voices` outputs fed by one analysis.
    pub fn new(sample_rate: f32, voices: usize) -> Self {
        let stft = Stft::new(sample_rate);
        let bins = stft.bins();
        let size = stft.size();
        let voices = (0..voices)
            .map(|_| ShiftVoice {
                ratio: 1.0,
                formant: 1.0,
                rotation: vec![0.0; bins],
                next_rotation: vec![0.0; bins],
                spectrum: stft.spectrum(),
                overlap: Overlap::new(&stft),
            })
            .collect();
        Self {
            spectrum: stft.spectrum(),
            magnitude: vec![0.0; bins],
            phase: vec![0.0; bins],
            previous_phase: vec![0.0; bins],
            frequency: vec![0.0; bins],
            peaks: Vec::with_capacity(bins),
            region_start: Vec::with_capacity(bins + 1),
            log_envelope: vec![0.0; bins],
            cepstrum: vec![0.0; size],
            cepstrum_spectrum: stft.spectrum(),
            // Quefrencies under 1.5 ms: the formants, not the harmonics.
            lifter: ((sample_rate * 0.0015) as usize).clamp(8, size / 4),
            voices,
            stft,
        }
    }

    pub fn latency(&self) -> usize {
        self.stft.latency()
    }

    pub fn size(&self) -> usize {
        self.stft.size()
    }

    pub fn hop(&self) -> usize {
        self.stft.hop()
    }

    // Applied from the next frame on; the caller smooths the values.
    pub fn set_voice(&mut self, voice: usize, ratio: f32, formant_ratio: f32) {
        if let Some(voice) = self.voices.get_mut(voice) {
            voice.ratio = ratio.clamp(0.125, 8.0);
            voice.formant = formant_ratio.clamp(0.25, 4.0);
        }
    }

    // One input sample in, one sample per voice out, `latency()` frames late.
    #[inline]
    pub fn push(&mut self, sample: f32, outputs: &mut [f32]) {
        if self.stft.push(sample) {
            self.frame();
        }
        let index = self.stft.read_index();
        for (voice, output) in self.voices.iter().zip(outputs.iter_mut()) {
            *output = voice.overlap.read(index);
        }
    }

    pub fn reset(&mut self) {
        self.stft.reset();
        self.previous_phase.fill(0.0);
        for voice in &mut self.voices {
            voice.rotation.fill(0.0);
            voice.overlap.clear();
        }
    }

    fn frame(&mut self) {
        self.stft.analyse(&mut self.spectrum);
        let bins = self.spectrum.len();
        let expected = TAU * self.stft.hop() as f32 / self.stft.size() as f32;
        let mut loudest = 0.0f32;
        for k in 0..bins {
            let value = self.spectrum[k];
            let magnitude = value.norm();
            let phase = value.im.atan2(value.re);
            let delta = wrap_phase(phase - self.previous_phase[k] - k as f32 * expected);
            self.frequency[k] = (k as f32 + delta / expected).clamp(0.0, bins as f32);
            self.previous_phase[k] = phase;
            self.phase[k] = phase;
            self.magnitude[k] = magnitude;
            loudest = loudest.max(magnitude);
        }
        self.find_peaks(loudest);
        let shaping = self
            .voices
            .iter()
            .any(|voice| voice.ratio != 1.0 || voice.formant != 1.0);
        if shaping && !self.peaks.is_empty() {
            self.envelope(loudest);
        }
        let Self {
            stft,
            magnitude,
            phase,
            frequency,
            peaks,
            region_start,
            log_envelope,
            voices,
            ..
        } = self;
        for voice in voices.iter_mut() {
            voice.spectrum.fill(Complex::default());
            let ratio = voice.ratio;
            let formant = voice.formant;
            let shaped = ratio != 1.0 || formant != 1.0;
            for (index, &peak) in peaks.iter().enumerate() {
                let low = region_start[index];
                let high = region_start[index + 1];
                let shift = (frequency[peak] * (ratio - 1.0)).round() as isize;
                let rotation =
                    wrap_phase(voice.rotation[peak] + expected * (ratio - 1.0) * frequency[peak]);
                voice.next_rotation[low..high].fill(rotation);
                for k in low..high {
                    let target = k as isize + shift;
                    if target < 0 || target >= bins as isize {
                        continue;
                    }
                    let target = target as usize;
                    let mut level = magnitude[k];
                    if shaped {
                        let wanted = envelope_at(log_envelope, target as f32 / formant);
                        let gain = (wanted - log_envelope[k])
                            .clamp(-ENVELOPE_GAIN_LIMIT, ENVELOPE_GAIN_LIMIT)
                            .exp();
                        level *= gain;
                    }
                    voice.spectrum[target] += Complex::from_polar(level, phase[k] + rotation);
                }
            }
            if !peaks.is_empty() {
                std::mem::swap(&mut voice.rotation, &mut voice.next_rotation);
            }
            stft.synthesize(&mut voice.spectrum, &mut voice.overlap);
        }
    }

    // Local maxima over ±2 bins; each owns the bins down to the deepest
    // trough before the next one.
    fn find_peaks(&mut self, loudest: f32) {
        self.peaks.clear();
        self.region_start.clear();
        let bins = self.magnitude.len();
        if loudest <= 1.0e-9 {
            return;
        }
        let floor = loudest * PEAK_FLOOR;
        let m = &self.magnitude;
        for k in 2..bins - 2 {
            if m[k] > floor
                && m[k] >= m[k - 1]
                && m[k] > m[k + 1]
                && m[k] >= m[k - 2]
                && m[k] > m[k + 2]
            {
                self.peaks.push(k);
            }
        }
        if self.peaks.is_empty() {
            return;
        }
        self.region_start.push(0);
        for pair in self.peaks.windows(2) {
            let mut trough = pair[0] + 1;
            for k in pair[0] + 1..=pair[1] {
                if m[k] < m[trough] {
                    trough = k;
                }
            }
            self.region_start.push(trough);
        }
        self.region_start.push(bins);
    }

    // Smoothed log-magnitude envelope by liftering the real cepstrum.
    fn envelope(&mut self, loudest: f32) {
        let floor = (loudest * ENVELOPE_FLOOR).max(1.0e-12);
        for (value, magnitude) in self.cepstrum_spectrum.iter_mut().zip(&self.magnitude) {
            *value = Complex::new(magnitude.max(floor).ln(), 0.0);
        }
        self.stft
            .inverse(&mut self.cepstrum_spectrum, &mut self.cepstrum);
        let size = self.cepstrum.len();
        let lifter = self.lifter;
        let scale = 1.0 / size as f32;
        self.cepstrum[0] *= scale;
        for n in 1..size / 2 + 1 {
            let weight = if n < lifter {
                scale * 0.5 * (1.0 + (PI * n as f32 / lifter as f32).cos())
            } else {
                0.0
            };
            self.cepstrum[n] *= weight;
            if n < size - n {
                self.cepstrum[size - n] *= weight;
            }
        }
        self.stft
            .forward(&mut self.cepstrum, &mut self.cepstrum_spectrum);
        for (envelope, value) in self.log_envelope.iter_mut().zip(&self.cepstrum_spectrum) {
            *envelope = value.re;
        }
    }
}

#[inline]
fn envelope_at(envelope: &[f32], position: f32) -> f32 {
    let last = envelope.len() - 1;
    let position = position.clamp(0.0, last as f32);
    let index = (position as usize).min(last - 1);
    let fraction = position - index as f32;
    envelope[index] + (envelope[index + 1] - envelope[index]) * fraction
}

pub fn semitones_to_ratio(semitones: f32) -> f32 {
    (semitones / 12.0).exp2()
}

pub const SEMITONES: u32 = 0;
pub const CENTS: u32 = 1;
pub const FORMANT: u32 = 2;
pub const MIX: u32 = 3;
pub const PARAMS: [ParamSpec; 4] = [
    ParamSpec::new(SEMITONES, "semitones", -24.0, 24.0, 0.0, Unit::Semitones),
    ParamSpec::new(CENTS, "cents", -100.0, 100.0, 0.0, Unit::Plain),
    // 0 keeps the voice's own formants whatever the pitch.
    ParamSpec::new(FORMANT, "formant", -12.0, 12.0, 0.0, Unit::Semitones),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];

// Ratios follow the smoothed values once per segment.
pub(crate) const SEGMENT: usize = 32;

// Stereo pitch shifter: one core per channel, the dry path delayed to match.
pub struct PitchShift {
    values: [f32; 4],
    shifters: [PitchShifter; 2],
    dry: [DelayLine; 2],
    pitch: Smoothed,
    formant: Smoothed,
    mix: Smoothed,
}

impl PitchShift {
    pub fn new() -> Self {
        let mut shift = Self {
            values: PARAMS.map(|spec| spec.default),
            shifters: [PitchShifter::new(48000.0, 1), PitchShifter::new(48000.0, 1)],
            dry: [DelayLine::new(), DelayLine::new()],
            pitch: Smoothed::new(0.0, 34.0),
            formant: Smoothed::new(0.0, 34.0),
            mix: Smoothed::new(1.0, 21.0),
        };
        shift.prepare(48000.0, 0);
        shift
    }

    fn targets(&mut self) {
        let v = self.values;
        self.pitch
            .set(v[SEMITONES as usize] + v[CENTS as usize] * 0.01);
        self.formant.set(v[FORMANT as usize]);
        self.mix.set(v[MIX as usize]);
    }
}

impl Default for PitchShift {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for PitchShift {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.shifters = [
            PitchShifter::new(sample_rate, 1),
            PitchShifter::new(sample_rate, 1),
        ];
        for dry in &mut self.dry {
            dry.allocate(self.shifters[0].latency() + 1);
        }
        // Smoothing advances once per segment, hence the segment rate.
        let segment_rate = sample_rate / SEGMENT as f32;
        for smoothed in [&mut self.pitch, &mut self.formant] {
            smoothed.prepare(segment_rate);
        }
        self.mix.prepare(sample_rate);
        self.targets();
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let latency = self.shifters[0].latency() as f32;
        let mut start = 0;
        while start < frames {
            let end = (start + SEGMENT).min(frames);
            let ratio = semitones_to_ratio(self.pitch.tick());
            let formant = semitones_to_ratio(self.formant.tick());
            for shifter in &mut self.shifters {
                shifter.set_voice(0, ratio, formant);
            }
            for index in start..end {
                let mix = self.mix.tick();
                for (channel, samples) in [&mut *block.left, &mut *block.right]
                    .into_iter()
                    .enumerate()
                {
                    let input = samples[index];
                    let dry = self.dry[channel].read(latency);
                    self.dry[channel].push(input);
                    let mut wet = [0.0];
                    self.shifters[channel].push(input, &mut wet);
                    samples[index] = dry + (wet[0] - dry) * mix;
                }
            }
            start = end;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
            self.targets();
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn latency_frames(&self) -> u32 {
        self.shifters[0].latency() as u32
    }

    fn tail_frames(&self) -> u32 {
        self.shifters[0].size() as u32
    }

    fn reset(&mut self) {
        for smoothed in [&mut self.pitch, &mut self.formant, &mut self.mix] {
            smoothed.settle();
        }
        for shifter in &mut self.shifters {
            shifter.reset();
        }
        for dry in &mut self.dry {
            dry.clear();
        }
    }
}
