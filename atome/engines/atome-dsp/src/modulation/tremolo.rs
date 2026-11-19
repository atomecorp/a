// Tremolo and auto-pan: the oscillator moves the level (both sides
// together) or the side (one side down while the other stays), in a sine, a
// triangle or a rounded square.

use super::{Lfo, LfoShape};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const RATE_HZ: u32 = 0;
pub const DEPTH: u32 = 1;
pub const SHAPE: u32 = 2;
pub const MODE: u32 = 3;
pub const PARAMS: [ParamSpec; 4] = [
    ParamSpec::new(RATE_HZ, "rate_hz", 0.1, 21.0, 5.0, Unit::Hertz),
    ParamSpec::new(DEPTH, "depth", 0.0, 1.0, 0.55, Unit::Percent),
    ParamSpec::choice(SHAPE, "shape", &["sine", "triangle", "square"], 0),
    ParamSpec::choice(MODE, "mode", &["tremolo", "auto_pan"], 0),
];

const SHAPES: [LfoShape; 3] = [LfoShape::Sine, LfoShape::Triangle, LfoShape::Square];

pub struct Tremolo {
    lfo: Lfo,
    rate: Smoothed,
    depth: Smoothed,
    shape: LfoShape,
    // 0 = tremolo, 1 = auto-pan, ramped so a change never clicks.
    pan: Smoothed,
    // The two gains glide over a millisecond: a change of shape never clicks.
    gains: [f32; 2],
    glide: f32,
}

const GLIDE_MS: f32 = 1.0;

impl Tremolo {
    pub fn new() -> Self {
        Self {
            lfo: Lfo::new(),
            rate: Smoothed::new(PARAMS[0].default, 55.0),
            depth: Smoothed::new(PARAMS[1].default, 20.0),
            shape: SHAPES[PARAMS[2].default as usize],
            pan: Smoothed::new(PARAMS[3].default, 34.0),
            gains: [1.0; 2],
            glide: 1.0,
        }
    }
}

impl Default for Tremolo {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Tremolo {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.lfo.prepare(sample_rate);
        for smoothed in [&mut self.rate, &mut self.depth, &mut self.pan] {
            smoothed.prepare(sample_rate);
        }
        self.glide = 1.0 - (-1.0 / (GLIDE_MS * 0.001 * sample_rate)).exp();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            self.lfo.set_rate(self.rate.tick());
            self.lfo.advance();
            let depth = self.depth.tick();
            let pan = self.pan.tick();
            let wave = self.lfo.value(self.shape, 0.0);
            // Tremolo: the level dips by `depth` at the wave's trough.
            let level = 1.0 - depth * 0.5 * (1.0 - wave);
            // Auto-pan: the side away from the wave goes down, the other stays.
            let side = depth * wave;
            let (pan_left, pan_right) = (1.0 - side.max(0.0), 1.0 + side.min(0.0));
            let left = level + pan * (pan_left - level);
            let right = level + pan * (pan_right - level);
            self.gains[0] += self.glide * (left - self.gains[0]);
            self.gains[1] += self.glide * (right - self.gains[1]);
            block.left[index] *= self.gains[0];
            block.right[index] *= self.gains[1];
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            RATE_HZ => self.rate.set(value),
            DEPTH => self.depth.set(value),
            SHAPE => self.shape = SHAPES[spec.index(value)],
            MODE => self.pan.set(spec.index(value) as f32),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        for smoothed in [&mut self.rate, &mut self.depth, &mut self.pan] {
            smoothed.settle();
        }
        self.lfo.reset();
        self.gains = [1.0; 2];
    }
}
