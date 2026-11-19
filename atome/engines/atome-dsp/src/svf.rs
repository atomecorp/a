// State-variable filter (topology-preserving transform, Zavalishin): low,
// high, band pass and notch from one structure that stays stable under fast
// modulation. Cutoff and resonance are audio-rate parameters: given a value
// per frame (`process_modulated`) the coefficients follow every frame; set
// by `set_param` they glide on their smoothers. The biquad stays for the
// fixed EQ shapes.

use crate::{ParamBuffer, ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use std::f32::consts::{FRAC_1_SQRT_2, PI};

pub const CUTOFF_HZ: u32 = 0;
pub const RESONANCE: u32 = 1;
pub const MODE: u32 = 2;
pub const PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(CUTOFF_HZ, "cutoff_hz", 20.0, 20000.0, 987.0, Unit::Hertz),
    ParamSpec::new(
        RESONANCE,
        "resonance",
        0.5,
        21.0,
        FRAC_1_SQRT_2,
        Unit::Ratio,
    ),
    ParamSpec::choice(
        MODE,
        "mode",
        &["low_pass", "high_pass", "band_pass", "notch"],
        0,
    ),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    LowPass,
    HighPass,
    BandPass,
    Notch,
}

const MODES: [Mode; 4] = [Mode::LowPass, Mode::HighPass, Mode::BandPass, Mode::Notch];

#[derive(Debug, Clone, Copy, Default)]
struct State {
    ic1: f32,
    ic2: f32,
}

#[derive(Debug, Clone, Copy)]
struct Coefficients {
    a1: f32,
    a2: f32,
    a3: f32,
    k: f32,
}

impl Coefficients {
    #[inline]
    fn design(sample_rate: f32, cutoff: f32, resonance: f32) -> Self {
        let cutoff = cutoff.clamp(PARAMS[0].min, (sample_rate * 0.49).min(PARAMS[0].max));
        let g = (PI * cutoff / sample_rate).tan();
        let k = 1.0 / resonance.max(PARAMS[1].min);
        let a1 = 1.0 / (1.0 + g * (g + k));
        Self {
            a1,
            a2: g * a1,
            a3: g * g * a1,
            k,
        }
    }
}

impl State {
    #[inline]
    fn tick(&mut self, c: &Coefficients, mode: Mode, input: f32) -> f32 {
        let v3 = input - self.ic2;
        let v1 = c.a1 * self.ic1 + c.a2 * v3;
        let v2 = self.ic2 + c.a2 * self.ic1 + c.a3 * v3;
        self.ic1 = 2.0 * v1 - self.ic1;
        self.ic2 = 2.0 * v2 - self.ic2;
        match mode {
            Mode::LowPass => v2,
            Mode::BandPass => v1,
            Mode::HighPass => input - c.k * v1 - v2,
            Mode::Notch => input - c.k * v1,
        }
    }
}

pub struct Svf {
    sample_rate: f32,
    cutoff: Smoothed,
    resonance: Smoothed,
    mode: Mode,
    coefficients: Coefficients,
    left: State,
    right: State,
}

impl Svf {
    pub fn new() -> Self {
        let sample_rate = 48000.0;
        Self {
            sample_rate,
            cutoff: Smoothed::new(PARAMS[0].default, 13.0),
            resonance: Smoothed::new(PARAMS[1].default, 13.0),
            mode: MODES[PARAMS[2].default as usize],
            coefficients: Coefficients::design(sample_rate, PARAMS[0].default, PARAMS[1].default),
            left: State::default(),
            right: State::default(),
        }
    }

    #[inline]
    fn filter(&mut self, block: &mut StereoBlock, index: usize, c: &Coefficients) {
        block.left[index] = self.left.tick(c, self.mode, block.left[index]);
        block.right[index] = self.right.tick(c, self.mode, block.right[index]);
    }
}

impl Default for Svf {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Svf {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.cutoff.prepare(sample_rate);
        self.resonance.prepare(sample_rate);
        self.cutoff.settle();
        self.resonance.settle();
        self.coefficients =
            Coefficients::design(sample_rate, self.cutoff.target(), self.resonance.target());
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            if !(self.cutoff.is_settled() && self.resonance.is_settled()) {
                self.coefficients = Coefficients::design(
                    self.sample_rate,
                    self.cutoff.tick(),
                    self.resonance.tick(),
                );
            }
            let c = self.coefficients;
            self.filter(block, index, &c);
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        match id {
            CUTOFF_HZ => self.cutoff.set(spec.clamp(value)),
            RESONANCE => self.resonance.set(spec.clamp(value)),
            MODE => self.mode = MODES[spec.index(value)],
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        self.cutoff.settle();
        self.resonance.settle();
        self.coefficients = Coefficients::design(
            self.sample_rate,
            self.cutoff.target(),
            self.resonance.target(),
        );
        self.left = State::default();
        self.right = State::default();
    }

    fn audio_rate(&self, id: u32) -> bool {
        id == CUTOFF_HZ || id == RESONANCE
    }

    // A modulated cutoff or resonance is the signal itself: no smoothing, the
    // coefficients follow every frame. The other one keeps its smoother.
    fn process_modulated(&mut self, block: &mut StereoBlock, params: &[ParamBuffer]) {
        let mut cutoff: &[f32] = &[];
        let mut resonance: &[f32] = &[];
        for param in params {
            match param.id {
                CUTOFF_HZ => cutoff = param.values,
                RESONANCE => resonance = param.values,
                id => {
                    if let Some(value) = param.values.first() {
                        self.set_param(id, *value);
                    }
                }
            }
        }
        for index in 0..block.frames() {
            let frequency = cutoff
                .get(index)
                .copied()
                .unwrap_or_else(|| self.cutoff.tick());
            let q = resonance
                .get(index)
                .copied()
                .unwrap_or_else(|| self.resonance.tick());
            let c = Coefficients::design(self.sample_rate, frequency, q);
            self.filter(block, index, &c);
        }
        if let Some(last) = cutoff.last() {
            self.cutoff.snap(*last);
        }
        if let Some(last) = resonance.last() {
            self.resonance.snap(*last);
        }
        self.coefficients = Coefficients::design(
            self.sample_rate,
            self.cutoff.target(),
            self.resonance.target(),
        );
    }
}
