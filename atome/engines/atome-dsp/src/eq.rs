// Professional 8-band parametric EQ (kind `eq`): bells, shelves, passes and
// notches, each band optionally dynamic, with a live spectrum of the output.
//
// Topology: Andrew Simper's linear trapezoidal state-variable filter (TPT
// SVF). It is the bilinear transform of the analog prototype, prewarped at
// the band's frequency (the same magnitude as the RBJ cookbook), and unlike a
// direct-form biquad it stays clean while its coefficients move, which a
// dragged point and a dynamic band do every few frames. Bands are serial and
// stereo-linked (one set of coefficients, one detector for both channels).

use crate::db_to_amplitude;
use crate::spectrum::{self, Spectrum};
use crate::{ParamSpec, Processor, SILENCE_DB, Smoothed, StereoBlock, Unit};
use std::f32::consts::{FRAC_1_SQRT_2, PI};

mod band;
mod svf;

use band::{ATTACK_MS, Band, RELEASE_MS, SMOOTH_MS, SUB_BLOCK};
use svf::Design;

pub const BAND_COUNT: usize = 8;
pub const PER_BAND: u32 = 7;
// Slots of one band's parameters, in their order.
pub const ON: u32 = 0;
pub const TYPE: u32 = 1;
pub const FREQ_HZ: u32 = 2;
pub const GAIN_DB: u32 = 3;
pub const Q: u32 = 4;
pub const DYNAMIC_DB: u32 = 5;
pub const THRESHOLD_DB: u32 = 6;
pub const OUTPUT_DB: u32 = BAND_COUNT as u32 * PER_BAND;
pub const ANALYSE: u32 = OUTPUT_DB + 1;
pub const PARAM_COUNT: usize = ANALYSE as usize + 1;

// Id of `slot` for band `band` (0-based: band 0 is `band1_*`).
pub const fn band_param(band: usize, slot: u32) -> u32 {
    band as u32 * PER_BAND + slot
}

const ON_OFF: &[&str] = &["off", "on"];
pub const TYPES: &[&str] = &[
    "bell",
    "low_shelf",
    "high_shelf",
    "high_pass",
    "low_pass",
    "notch",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BandType {
    Bell,
    LowShelf,
    HighShelf,
    HighPass,
    LowPass,
    Notch,
}

impl BandType {
    // The type a `band{n}_type` index designates (order of `TYPES`).
    pub const fn from_index(index: usize) -> Self {
        match index {
            0 => Self::Bell,
            1 => Self::LowShelf,
            2 => Self::HighShelf,
            3 => Self::HighPass,
            4 => Self::LowPass,
            _ => Self::Notch,
        }
    }

    // Only bells and shelves have a gain (and so a dynamic gain).
    pub const fn has_gain(self) -> bool {
        matches!(self, Self::Bell | Self::LowShelf | Self::HighShelf)
    }
}

// Rule 19: Fibonacci frequencies. Band 1 a high-pass and band 8 a low-pass,
// both off; band 2 a low shelf, 3–6 bells, band 7 a high shelf, on and flat.
// Q 1/√2 (the Butterworth standard: no bump) for passes and shelves;
// Q 1 for bells, about 1.4 octaves, the usual musical width, and a natural
// number where 1.3 would not be.
const DEFAULT_HZ: [f32; BAND_COUNT] = [34.0, 89.0, 233.0, 610.0, 1597.0, 4181.0, 10946.0, 17711.0];
const DEFAULT_TYPE: [usize; BAND_COUNT] = [3, 1, 0, 0, 0, 0, 2, 4];
const DEFAULT_ON: [usize; BAND_COUNT] = [0, 1, 1, 1, 1, 1, 1, 0];
const DEFAULT_Q: [f32; BAND_COUNT] = [
    FRAC_1_SQRT_2,
    FRAC_1_SQRT_2,
    1.0,
    1.0,
    1.0,
    1.0,
    FRAC_1_SQRT_2,
    FRAC_1_SQRT_2,
];
const DEFAULT_THRESHOLD_DB: f32 = -21.0;

macro_rules! band_keys {
    ($n:literal) => {
        [
            concat!("band", $n, "_on"),
            concat!("band", $n, "_type"),
            concat!("band", $n, "_freq_hz"),
            concat!("band", $n, "_gain_db"),
            concat!("band", $n, "_q"),
            concat!("band", $n, "_dynamic_db"),
            concat!("band", $n, "_threshold_db"),
        ]
    };
}

const KEYS: [[&str; PER_BAND as usize]; BAND_COUNT] = [
    band_keys!(1),
    band_keys!(2),
    band_keys!(3),
    band_keys!(4),
    band_keys!(5),
    band_keys!(6),
    band_keys!(7),
    band_keys!(8),
];

const fn build_params() -> [ParamSpec; PARAM_COUNT] {
    let mut params = [ParamSpec::new(0, "", 0.0, 0.0, 0.0, Unit::Plain); PARAM_COUNT];
    let mut band = 0;
    while band < BAND_COUNT {
        let keys = KEYS[band];
        let base = band_param(band, 0);
        let at = band * PER_BAND as usize;
        params[at] = ParamSpec::choice(base + ON, keys[0], ON_OFF, DEFAULT_ON[band]);
        params[at + 1] = ParamSpec::choice(base + TYPE, keys[1], TYPES, DEFAULT_TYPE[band]);
        params[at + 2] = ParamSpec::new(
            base + FREQ_HZ,
            keys[2],
            20.0,
            20000.0,
            DEFAULT_HZ[band],
            Unit::Hertz,
        );
        params[at + 3] = ParamSpec::new(base + GAIN_DB, keys[3], -24.0, 24.0, 0.0, Unit::Decibels);
        params[at + 4] = ParamSpec::new(base + Q, keys[4], 0.1, 18.0, DEFAULT_Q[band], Unit::Ratio);
        params[at + 5] =
            ParamSpec::new(base + DYNAMIC_DB, keys[5], -24.0, 24.0, 0.0, Unit::Decibels);
        params[at + 6] = ParamSpec::new(
            base + THRESHOLD_DB,
            keys[6],
            -60.0,
            0.0,
            DEFAULT_THRESHOLD_DB,
            Unit::Decibels,
        );
        band += 1;
    }
    params[OUTPUT_DB as usize] =
        ParamSpec::new(OUTPUT_DB, "output_db", -24.0, 24.0, 0.0, Unit::Decibels);
    params[ANALYSE as usize] = ParamSpec::choice(ANALYSE, "analyse", ON_OFF, 1);
    params
}

// `band{n}_freq_hz` is drawn on a logarithmic axis (Hertz).
pub const PARAMS: [ParamSpec; PARAM_COUNT] = build_params();

macro_rules! reading_keys {
    ([$($s:literal),*], [$($b:literal),*]) => {
        [$(concat!("spectrum_", $s),)* $(concat!("band", $b, "_gain_now")),*]
    };
}

// The output spectrum (34 bands, dBFS, `spectrum::band_centre_hz`), then each
// band's gain at this moment in dB (its static gain plus its dynamic move).
pub const READINGS: [&str; spectrum::BANDS + BAND_COUNT] = reading_keys!(
    [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30, 31, 32, 33
    ],
    [1, 2, 3, 4, 5, 6, 7, 8]
);

// Magnitude in dB of one band at `frequency`, static (no dynamic move).
pub fn band_response_db(
    kind: BandType,
    sample_rate: f32,
    centre_hz: f32,
    q: f32,
    gain_db: f32,
    frequency: f32,
) -> f32 {
    Design::new(kind, sample_rate, centre_hz, q, gain_db).magnitude_db(sample_rate, frequency)
}

// Static magnitude response of the whole EQ in dB at `frequency`: the sum of
// every band that is on, plus `output_db`. `params` holds one value per
// `PARAMS` entry, indexed by id (clamped to each range like `set_param`).
// Per band, with x = tan(π·f/fs) / g and the `Design` table (g = tan(π·f0/fs),
// k = 1/Q, A = 10^(gain/40); bell k/A; low shelf g/√A; high shelf g·√A):
// |H|² = ((m0·(1−x²) + m2)² + x²·(m0·k + m1)²) / ((1−x²)² + k²·x²).
pub fn response_db(params: &[f32], sample_rate: f32, frequency: f32) -> f32 {
    let value = |id: u32| PARAMS[id as usize].clamp(params[id as usize]);
    let mut total = value(OUTPUT_DB);
    for band in 0..BAND_COUNT {
        let id = |slot| band_param(band, slot);
        if PARAMS[id(ON) as usize].index(value(id(ON))) == 1 {
            let kind = BandType::from_index(PARAMS[id(TYPE) as usize].index(value(id(TYPE))));
            let (centre, q, gain) = (value(id(FREQ_HZ)), value(id(Q)), value(id(GAIN_DB)));
            total += band_response_db(kind, sample_rate, centre, q, gain, frequency);
        }
    }
    total
}

pub struct Equalizer {
    sample_rate: f32,
    bands: [Band; BAND_COUNT],
    output: Smoothed,
    analyse: bool,
    spectrum: Spectrum,
    envelope: (f32, f32),
    readings: [f32; READINGS.len()],
}

impl Default for Equalizer {
    fn default() -> Self {
        Self::new()
    }
}

impl Equalizer {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            bands: std::array::from_fn(Band::new),
            output: Smoothed::new(1.0, SMOOTH_MS),
            analyse: PARAMS[ANALYSE as usize].default == 1.0,
            spectrum: Spectrum::new(),
            envelope: (0.0, 0.0),
            readings: [SILENCE_DB; READINGS.len()],
        }
    }

    fn write_readings(&mut self) {
        let (spectrum, gains) = self.readings.split_at_mut(spectrum::BANDS);
        if self.analyse {
            spectrum.copy_from_slice(self.spectrum.bands());
        } else {
            spectrum.fill(SILENCE_DB);
        }
        for (gain, band) in gains.iter_mut().zip(&self.bands) {
            *gain = band.gain_now;
        }
    }
}

impl Processor for Equalizer {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        for band in &mut self.bands {
            for smoothed in band.smoothers() {
                smoothed.prepare(sample_rate / SUB_BLOCK as f32);
            }
            band.mix.prepare(sample_rate / SUB_BLOCK as f32);
            band.settle();
        }
        self.output.prepare(sample_rate);
        self.output.settle();
        let per_sample = |ms: f32| (-1.0 / (ms * 0.001 * sample_rate)).exp();
        self.envelope = (per_sample(ATTACK_MS), per_sample(RELEASE_MS));
        self.spectrum.prepare(sample_rate);
        self.write_readings();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let mut start = 0;
        while start < frames {
            let end = (start + SUB_BLOCK).min(frames);
            let (left, right) = (&mut block.left[start..end], &mut block.right[start..end]);
            for band in &mut self.bands {
                band.process(self.sample_rate, self.envelope, left, right);
            }
            start = end;
        }
        if !(self.output.is_settled() && self.output.target() == 1.0) {
            for (l, r) in block.left.iter_mut().zip(block.right.iter_mut()) {
                let gain = self.output.tick();
                *l *= gain;
                *r *= gain;
            }
        }
        if self.analyse {
            self.spectrum.push(block.left, block.right);
        }
        self.write_readings();
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        // A non-finite value is refused: it would poison every later sample.
        if !value.is_finite() {
            return;
        }
        let value = spec.clamp(value);
        match id {
            OUTPUT_DB => self.output.set(db_to_amplitude(value)),
            ANALYSE => {
                let analyse = spec.index(value) == 1;
                if analyse && !self.analyse {
                    self.spectrum.reset();
                }
                self.analyse = analyse;
            }
            _ => {
                let band = (id / PER_BAND) as usize;
                self.bands[band].set(id % PER_BAND, value);
            }
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    // A resonance decays to −60 dB in about 6.9 time constants, τ = 2Q/ω0.
    fn tail_frames(&self) -> u32 {
        let seconds = self
            .bands
            .iter()
            .filter(|band| band.on)
            .map(|band| 6.9 * 2.0 * band.q.target() / (2.0 * PI * band.log2_hz.target().exp2()))
            .fold(0.0, f32::max);
        (seconds * self.sample_rate).ceil() as u32
    }

    fn reset(&mut self) {
        for band in &mut self.bands {
            band.settle();
        }
        self.output.settle();
        self.spectrum.reset();
        self.write_readings();
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
