// Band-limited oscillator (polyBLEP), the first generator brick. It writes the
// block instead of processing it: a generator is an input node of a strip.

use crate::{db_to_amplitude, ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use std::f32::consts::TAU;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Waveform {
    Sine,
    Saw,
    Square,
    Triangle,
}

impl Waveform {
    fn from_index(value: f32) -> Self {
        match value.round() as i32 {
            1 => Self::Saw,
            2 => Self::Square,
            3 => Self::Triangle,
            _ => Self::Sine,
        }
    }
}

pub const FREQUENCY: u32 = 0;
pub const WAVEFORM: u32 = 1;
pub const LEVEL_DB: u32 = 2;
pub const PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(FREQUENCY, "frequency", 1.0, 20000.0, 440.0, Unit::Hertz),
    ParamSpec::new(WAVEFORM, "waveform", 0.0, 3.0, 1.0, Unit::Plain),
    ParamSpec::new(LEVEL_DB, "level_db", -120.0, 0.0, -12.0, Unit::Decibels),
];

// Residual that removes the aliasing step of a discontinuity at phase 0.
#[inline]
fn poly_blep(phase: f32, step: f32) -> f32 {
    if phase < step {
        let t = phase / step;
        t + t - t * t - 1.0
    } else if phase > 1.0 - step {
        let t = (phase - 1.0) / step;
        t * t + t + t + 1.0
    } else {
        0.0
    }
}

pub struct Oscillator {
    sample_rate: f32,
    waveform: Waveform,
    frequency: Smoothed,
    level: Smoothed,
    phase: f32,
    integrator: f32,
}

impl Oscillator {
    pub fn new(waveform: Waveform, frequency: f32) -> Self {
        Self {
            sample_rate: 48000.0,
            waveform,
            frequency: Smoothed::new(frequency, 5.0),
            level: Smoothed::new(db_to_amplitude(PARAMS[2].default), 10.0),
            phase: 0.0,
            integrator: 0.0,
        }
    }

    #[inline]
    fn sample(&mut self, step: f32) -> f32 {
        let phase = self.phase;
        match self.waveform {
            Waveform::Sine => (phase * TAU).sin(),
            Waveform::Saw => 2.0 * phase - 1.0 - poly_blep(phase, step),
            Waveform::Square | Waveform::Triangle => {
                let mut square = if phase < 0.5 { 1.0 } else { -1.0 };
                square += poly_blep(phase, step);
                square -= poly_blep((phase + 0.5) % 1.0, step);
                if self.waveform == Waveform::Square {
                    square
                } else {
                    // A leaky integral of the band-limited square is a clean triangle.
                    self.integrator = step * 4.0 * square + (1.0 - step * 0.01) * self.integrator;
                    self.integrator
                }
            }
        }
    }
}

impl Processor for Oscillator {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.frequency.prepare(sample_rate);
        self.level.prepare(sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            let step = (self.frequency.tick() / self.sample_rate).min(0.5);
            let value = self.sample(step) * self.level.tick();
            block.left[index] = value;
            block.right[index] = value;
            self.phase += step;
            if self.phase >= 1.0 {
                self.phase -= 1.0;
            }
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else { return };
        let value = spec.clamp(value);
        match id {
            FREQUENCY => self.frequency.set(value),
            WAVEFORM => self.waveform = Waveform::from_index(value),
            LEVEL_DB => self.level.set(db_to_amplitude(value)),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        self.frequency.settle();
        self.level.settle();
        self.phase = 0.0;
        self.integrator = 0.0;
    }
}
