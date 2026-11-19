// Band-limited oscillator (polyBLEP), the first generator brick. It writes the
// block instead of processing it: a generator is an input node of a strip.

use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, db_to_amplitude};
use std::f32::consts::TAU;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Waveform {
    Sine,
    Saw,
    Square,
    Triangle,
    // A pulse of `width` (Oscillator::set_width): a synth's own wave, outside the catalogue's 0..3.
    Pulse,
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
    // The pulse's high part, a fraction of the period.
    width: f32,
}

// A pulse narrower or wider than this has no audible width left.
// A per-frame buffer for process_modulated (not a parameter): a frame above 0.5 starts the period again (hard sync).
pub const SYNC_TRIGGER: u32 = 1000;
pub const PULSE_WIDTH_MIN: f32 = 0.03;
pub const PULSE_WIDTH_MAX: f32 = 0.97;

impl Oscillator {
    pub fn new(waveform: Waveform, frequency: f32) -> Self {
        Self {
            sample_rate: 48000.0,
            waveform,
            frequency: Smoothed::new(frequency, 5.0),
            level: Smoothed::new(db_to_amplitude(PARAMS[2].default), 10.0),
            phase: 0.0,
            integrator: 0.0,
            width: 0.5,
        }
    }

    // A wave outside the catalogue's choices (the pulse).
    pub fn set_waveform(&mut self, waveform: Waveform) {
        self.waveform = waveform;
    }

    // The pulse's width, clamped to what still sounds as a pulse.
    pub fn set_width(&mut self, width: f32) {
        self.width = width.clamp(PULSE_WIDTH_MIN, PULSE_WIDTH_MAX);
    }

    // Hard sync: the wave starts its period again (a master oscillator's period began).
    pub fn hard_sync(&mut self) {
        self.phase = 0.0;
    }

    #[inline]
    fn sample(&mut self, step: f32) -> f32 {
        let phase = self.phase;
        match self.waveform {
            Waveform::Sine => (phase * TAU).sin(),
            Waveform::Saw => 2.0 * phase - 1.0 - poly_blep(phase, step),
            Waveform::Pulse => {
                let width = self.width;
                let mut pulse = if phase < width { 1.0 } else { -1.0 };
                pulse += poly_blep(phase, step);
                pulse -= poly_blep((phase + 1.0 - width) % 1.0, step);
                // Centred: a narrow pulse keeps no DC offset.
                pulse - (2.0 * width - 1.0)
            }
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
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
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

    fn audio_rate(&self, id: u32) -> bool {
        id == FREQUENCY
    }

    // A frequency given per frame (pitch or FM modulation) is followed exactly.
    fn process_modulated(&mut self, block: &mut StereoBlock, params: &[crate::ParamBuffer]) {
        let mut frequency: &[f32] = &[];
        let mut sync: &[f32] = &[];
        for param in params {
            match param.id {
                FREQUENCY => frequency = param.values,
                SYNC_TRIGGER => sync = param.values,
                id => {
                    if let Some(value) = param.values.first() {
                        self.set_param(id, *value);
                    }
                }
            }
        }
        for index in 0..block.frames() {
            let hertz = frequency
                .get(index)
                .copied()
                .unwrap_or_else(|| self.frequency.tick());
            let step = (PARAMS[0].clamp(hertz) / self.sample_rate).min(0.5);
            if sync.get(index).is_some_and(|trigger| *trigger > 0.5) {
                self.hard_sync();
            }
            let value = self.sample(step) * self.level.tick();
            block.left[index] = value;
            block.right[index] = value;
            self.phase += step;
            if self.phase >= 1.0 {
                self.phase -= 1.0;
            }
        }
        if let Some(last) = frequency.last() {
            self.frequency.snap(*last);
        }
    }
}
