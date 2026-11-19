// Loudness after ITU-R BS.1770-4 / EBU R128: K-weighting designed at any
// sample rate, momentary (400 ms) and short-term (3 s) loudness, integrated
// loudness gated at −70 LUFS absolute and −10 LU relative, and the true peak
// estimated by 4× oversampling. Everything is sized in `new`/`prepare`; the
// meter can live inside another processor (the maximizer measures its output).

use crate::{ParamSpec, Processor, SILENCE_DB, StereoBlock, amplitude_to_db};
use std::f64::consts::PI;

// Gating blocks of 400 ms overlap by 75 %: one block ends every 100 ms.
const STEP_MS: f64 = 100.0;
const MOMENTARY_STEPS: usize = 4;
const SHORT_TERM_STEPS: usize = 30;
const ABSOLUTE_GATE_LUFS: f64 = -70.0;
const RELATIVE_GATE_LU: f64 = -10.0;
// The histogram of gating blocks: 0.1 LU bins from −70 to +10 LUFS. Each bin
// keeps the exact energy of its blocks; only the relative gate is quantised.
const HISTOGRAM_STEP_LU: f64 = 0.1;
const HISTOGRAM_BINS: usize = 800;

#[inline]
fn lufs(energy: f64) -> f64 {
    if energy <= 1.0e-12 {
        SILENCE_DB as f64
    } else {
        -0.691 + 10.0 * energy.log10()
    }
}

#[derive(Clone, Copy, Default)]
struct Coefficients64 {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}

#[derive(Clone, Copy, Default)]
struct Section64 {
    z1: f64,
    z2: f64,
}

impl Section64 {
    #[inline]
    fn tick(&mut self, c: &Coefficients64, input: f64) -> f64 {
        let output = c.b0 * input + self.z1;
        self.z1 = c.b1 * input - c.a1 * output + self.z2;
        self.z2 = c.b2 * input - c.a2 * output;
        output
    }
}

// The two K-weighting stages (head shelf, then the RLB high-pass), from the
// analog prototypes of BS.1770 by the bilinear transform at `sample_rate`.
fn k_weighting(sample_rate: f64) -> (Coefficients64, Coefficients64) {
    let (f0, gain_db, q) = (1681.974450955533, 3.999843853973347, 0.7071752369554196);
    let k = (PI * f0 / sample_rate).tan();
    let vh = 10f64.powf(gain_db / 20.0);
    let vb = vh.powf(0.4996667741545416);
    let a0 = 1.0 + k / q + k * k;
    let shelf = Coefficients64 {
        b0: (vh + vb * k / q + k * k) / a0,
        b1: 2.0 * (k * k - vh) / a0,
        b2: (vh - vb * k / q + k * k) / a0,
        a1: 2.0 * (k * k - 1.0) / a0,
        a2: (1.0 - k / q + k * k) / a0,
    };
    let (f0, q) = (38.13547087602444, 0.5003270373238773);
    let k = (PI * f0 / sample_rate).tan();
    let a0 = 1.0 + k / q + k * k;
    let high_pass = Coefficients64 {
        b0: 1.0,
        b1: -2.0,
        b2: 1.0,
        a1: 2.0 * (k * k - 1.0) / a0,
        a2: (1.0 - k / q + k * k) / a0,
    };
    (shelf, high_pass)
}

const TAPS: usize = 12;

// 4× polyphase interpolator (49-tap windowed sinc): for each input frame it
// gives the largest magnitude among the frame `DELAY` frames back and the
// three points between it and the next one, over both channels.
pub struct TruePeak {
    phases: [[f32; TAPS]; 3],
    history: [[f32; TAPS]; 2],
}

impl TruePeak {
    pub const DELAY: usize = 6;

    pub fn new() -> Self {
        let length = 4 * TAPS + 1;
        let centre = (length / 2) as f64;
        let prototype = |n: usize| {
            let x = (n as f64 - centre) / 4.0;
            let sinc = if x == 0.0 {
                1.0
            } else {
                (PI * x).sin() / (PI * x)
            };
            let w = 2.0 * PI * n as f64 / (length - 1) as f64;
            sinc * (0.42 - 0.5 * w.cos() + 0.08 * (2.0 * w).cos())
        };
        let mut phases = [[0.0f32; TAPS]; 3];
        for (p, phase) in phases.iter_mut().enumerate() {
            let taps: [f64; TAPS] = std::array::from_fn(|k| prototype(p + 1 + 4 * k));
            let sum: f64 = taps.iter().sum();
            for (tap, value) in phase.iter_mut().zip(taps) {
                *tap = (value / sum) as f32;
            }
        }
        Self {
            phases,
            history: [[0.0; TAPS]; 2],
        }
    }

    #[inline]
    pub fn push(&mut self, left: f32, right: f32) -> f32 {
        let mut peak = 0.0f32;
        for (history, sample) in self.history.iter_mut().zip([left, right]) {
            history.copy_within(0..TAPS - 1, 1);
            history[0] = sample;
            peak = peak.max(history[Self::DELAY].abs());
            for phase in &self.phases {
                let value: f32 = phase.iter().zip(history.iter()).map(|(h, x)| h * x).sum();
                peak = peak.max(value.abs());
            }
        }
        peak
    }

    pub fn reset(&mut self) {
        self.history = [[0.0; TAPS]; 2];
    }
}

impl Default for TruePeak {
    fn default() -> Self {
        Self::new()
    }
}

pub struct LoudnessMeter {
    shelf: Coefficients64,
    high_pass: Coefficients64,
    filters: [[Section64; 2]; 2],
    step_frames: usize,
    counted: usize,
    step_energy: f64,
    steps: [f64; SHORT_TERM_STEPS],
    step_index: usize,
    steps_done: usize,
    histogram_count: Vec<u32>,
    histogram_energy: Vec<f64>,
    momentary: f32,
    short_term: f32,
    integrated: f32,
    true_peak: TruePeak,
    peak_max: f32,
}

impl LoudnessMeter {
    pub fn new() -> Self {
        let mut meter = Self {
            shelf: Coefficients64::default(),
            high_pass: Coefficients64::default(),
            filters: Default::default(),
            step_frames: 4800,
            counted: 0,
            step_energy: 0.0,
            steps: [0.0; SHORT_TERM_STEPS],
            step_index: 0,
            steps_done: 0,
            histogram_count: vec![0; HISTOGRAM_BINS],
            histogram_energy: vec![0.0; HISTOGRAM_BINS],
            momentary: SILENCE_DB,
            short_term: SILENCE_DB,
            integrated: SILENCE_DB,
            true_peak: TruePeak::new(),
            peak_max: 0.0,
        };
        meter.prepare(48000.0);
        meter
    }

    pub fn prepare(&mut self, sample_rate: f32) {
        let sample_rate = sample_rate as f64;
        (self.shelf, self.high_pass) = k_weighting(sample_rate);
        self.step_frames = (STEP_MS * 0.001 * sample_rate).round().max(1.0) as usize;
        self.reset();
    }

    // Restarts every measure, the integration included.
    pub fn reset(&mut self) {
        self.filters = Default::default();
        self.counted = 0;
        self.step_energy = 0.0;
        self.steps = [0.0; SHORT_TERM_STEPS];
        self.step_index = 0;
        self.steps_done = 0;
        self.histogram_count.fill(0);
        self.histogram_energy.fill(0.0);
        self.momentary = SILENCE_DB;
        self.short_term = SILENCE_DB;
        self.integrated = SILENCE_DB;
        self.true_peak.reset();
        self.peak_max = 0.0;
    }

    #[inline]
    pub fn push(&mut self, left: f32, right: f32) {
        self.peak_max = self.peak_max.max(self.true_peak.push(left, right));
        let (shelf, high_pass) = (self.shelf, self.high_pass);
        let mut energy = 0.0;
        for (filters, sample) in self.filters.iter_mut().zip([left, right]) {
            let shelved = filters[0].tick(&shelf, sample as f64);
            let weighted = filters[1].tick(&high_pass, shelved);
            energy += weighted * weighted;
        }
        self.step_energy += energy;
        self.counted += 1;
        if self.counted == self.step_frames {
            self.end_step();
        }
    }

    pub fn process(&mut self, left: &[f32], right: &[f32]) {
        for (&l, &r) in left.iter().zip(right) {
            self.push(l, r);
        }
    }

    fn end_step(&mut self) {
        self.steps[self.step_index] = self.step_energy / self.step_frames as f64;
        self.step_index = (self.step_index + 1) % SHORT_TERM_STEPS;
        self.steps_done += 1;
        self.step_energy = 0.0;
        self.counted = 0;
        // Flush the filter states' denormal tails during silence.
        for section in self.filters.iter_mut().flatten() {
            if section.z1.abs() < 1.0e-30 && section.z2.abs() < 1.0e-30 {
                *section = Section64::default();
            }
        }
        let recent = |count: usize| {
            let sum: f64 = (1..=count)
                .map(|back| {
                    self.steps[(self.step_index + SHORT_TERM_STEPS - back) % SHORT_TERM_STEPS]
                })
                .sum();
            sum / count as f64
        };
        let momentary = recent(MOMENTARY_STEPS);
        self.momentary = lufs(momentary) as f32;
        self.short_term = lufs(recent(SHORT_TERM_STEPS)) as f32;
        if self.steps_done >= MOMENTARY_STEPS {
            let loudness = lufs(momentary);
            if loudness > ABSOLUTE_GATE_LUFS {
                let bin = self.bin(loudness);
                self.histogram_count[bin] += 1;
                self.histogram_energy[bin] += momentary;
                self.integrated = self.gated() as f32;
            }
        }
    }

    fn bin(&self, loudness: f64) -> usize {
        (((loudness - ABSOLUTE_GATE_LUFS) / HISTOGRAM_STEP_LU) as usize).min(HISTOGRAM_BINS - 1)
    }

    fn gated(&self) -> f64 {
        let blocks: u64 = self.histogram_count.iter().map(|&c| c as u64).sum();
        if blocks == 0 {
            return SILENCE_DB as f64;
        }
        let energy: f64 = self.histogram_energy.iter().sum();
        let relative = lufs(energy / blocks as f64) + RELATIVE_GATE_LU;
        // A bin passes when its centre lies above the relative gate.
        let first = ((relative - ABSOLUTE_GATE_LUFS) / HISTOGRAM_STEP_LU - 0.5)
            .ceil()
            .max(0.0) as usize;
        let first = first.min(HISTOGRAM_BINS);
        let count: u64 = self.histogram_count[first..]
            .iter()
            .map(|&c| c as u64)
            .sum();
        if count == 0 {
            return SILENCE_DB as f64;
        }
        let energy: f64 = self.histogram_energy[first..].iter().sum();
        lufs(energy / count as f64)
    }

    pub fn momentary_lufs(&self) -> f32 {
        self.momentary
    }

    pub fn short_term_lufs(&self) -> f32 {
        self.short_term
    }

    pub fn integrated_lufs(&self) -> f32 {
        self.integrated
    }

    // The largest true peak since the last reset, in dBTP.
    pub fn true_peak_db(&self) -> f32 {
        amplitude_to_db(self.peak_max)
    }
}

impl Default for LoudnessMeter {
    fn default() -> Self {
        Self::new()
    }
}

pub const PARAMS: [ParamSpec; 0] = [];
pub const READINGS: [&str; 4] = [
    "lufs_momentary",
    "lufs_short",
    "lufs_integrated",
    "true_peak_db",
];

// The meter as a module: it passes its block untouched and reads it.
pub struct Loudness {
    meter: LoudnessMeter,
    readings: [f32; 4],
}

impl Loudness {
    pub fn new() -> Self {
        Self {
            meter: LoudnessMeter::new(),
            readings: [SILENCE_DB; 4],
        }
    }
}

impl Default for Loudness {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Loudness {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.meter.prepare(sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        self.meter.process(block.left, block.right);
        self.readings = [
            self.meter.momentary_lufs(),
            self.meter.short_term_lufs(),
            self.meter.integrated_lufs(),
            self.meter.true_peak_db(),
        ];
    }

    fn set_param(&mut self, _id: u32, _value: f32) {}

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        self.meter.reset();
        self.readings = [SILENCE_DB; 4];
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
