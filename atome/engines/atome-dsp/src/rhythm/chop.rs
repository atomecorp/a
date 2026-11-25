// The chopper (a trance gate): turned on, it cuts the sound in rhythm, step by
// step on the beat grid, after one of its patterns of sixteen steps. Each
// open step sounds for its `length`, the closed ones fall by `depth`, every
// edge softened over `smooth_ms`. Turned off, the sound passes whole.

use super::{DIVISIONS, SWITCH, division_beats};
use crate::transport::{BeatClock, Transport};
use crate::{ParamSpec, Processor, StereoBlock, Unit};

pub const ACTIVE: u32 = 0;
pub const DIVISION: u32 = 1;
pub const PATTERN: u32 = 2;
pub const LENGTH: u32 = 3;
pub const DEPTH: u32 = 4;
pub const SMOOTH_MS: u32 = 5;
pub const PARAMS: [ParamSpec; 6] = [
    ParamSpec::choice(ACTIVE, "active", &SWITCH, 0),
    ParamSpec::choice(DIVISION, "division", &DIVISIONS, 4),
    ParamSpec::choice(PATTERN, "pattern", &PATTERN_KEYS, 0),
    // The part of an open step that sounds.
    ParamSpec::new(LENGTH, "length", 0.05, 1.0, 0.55, Unit::Percent),
    ParamSpec::new(DEPTH, "depth", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::new(SMOOTH_MS, "smooth_ms", 0.1, 55.0, 3.0, Unit::Milliseconds),
];

const PATTERN_KEYS: [&str; 8] = [
    "straight", "half", "offbeat", "gallop", "dotted", "tresillo", "build", "stairs",
];
// Sixteen steps each, the first step in the lowest bit.
const PATTERNS: [u16; 8] = [
    0b1111_1111_1111_1111,
    0b0101_0101_0101_0101,
    0b1010_1010_1010_1010,
    0b1101_1101_1101_1101,
    0b1001_0010_0100_1001,
    0b0100_1001_0100_1001,
    0b1111_0101_0001_0001,
    0b0001_0011_0111_1111,
];

pub struct Chop {
    values: [f32; 6],
    clock: BeatClock,
    sample_rate: f32,
    gain: f32,
    glide: f32,
}

impl Chop {
    pub fn new() -> Self {
        let mut chop = Self {
            values: PARAMS.map(|spec| spec.default),
            clock: BeatClock::new(),
            sample_rate: 48000.0,
            gain: 1.0,
            glide: 1.0,
        };
        chop.prepare(48000.0, 0);
        chop
    }

    fn value(&self, id: u32) -> f32 {
        self.values[id as usize]
    }

    fn design_glide(&mut self) {
        let frames = (self.value(SMOOTH_MS) * 0.001 * self.sample_rate).max(1.0);
        self.glide = 1.0 - (-1.0 / frames).exp();
    }

    // The gain the pattern asks for at the clock's beat.
    fn target(&self) -> f32 {
        if self.value(ACTIVE) < 0.5 {
            return 1.0;
        }
        let step_beats = division_beats(PARAMS[DIVISION as usize].index(self.value(DIVISION)));
        let steps = self.clock.beat() / step_beats;
        let step = steps.floor();
        let pattern = PATTERNS[PARAMS[PATTERN as usize].index(self.value(PATTERN))];
        let open = ((pattern >> (step.rem_euclid(16.0) as u32)) & 1) == 1;
        let sounding = open && (steps - step) < f64::from(self.value(LENGTH));
        if sounding {
            1.0
        } else {
            1.0 - self.value(DEPTH)
        }
    }
}

impl Default for Chop {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Chop {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.clock.prepare(sample_rate);
        self.design_glide();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            self.gain += self.glide * (self.target() - self.gain);
            block.left[index] *= self.gain;
            block.right[index] *= self.gain;
            self.clock.advance();
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        self.values[id as usize] = spec.clamp(value);
        if id == SMOOTH_MS {
            self.design_glide();
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn set_transport(&mut self, transport: &Transport) {
        self.clock.sync(transport);
    }

    fn reset(&mut self) {
        self.gain = 1.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_cuts_the_closed_steps_of_its_pattern() {
        let mut chop = Chop::new();
        chop.prepare(1000.0, 512);
        // 1/4 steps at 120 bpm: 500 frames each, the « half » pattern open on even steps.
        chop.set_param(DIVISION, 2.0);
        chop.set_param(PATTERN, 1.0);
        chop.set_param(LENGTH, 1.0);
        chop.set_param(SMOOTH_MS, 0.1);
        chop.set_param(ACTIVE, 1.0);
        let mut left = vec![1.0; 1000];
        let mut right = vec![1.0; 1000];
        chop.process(&mut StereoBlock::new(&mut left, &mut right));
        assert!((left[250] - 1.0).abs() < 1e-3);
        assert!(left[750].abs() < 1e-3);
    }

    #[test]
    fn off_lets_everything_through() {
        let mut chop = Chop::new();
        chop.prepare(1000.0, 512);
        let mut left = vec![1.0; 100];
        let mut right = vec![1.0; 100];
        chop.process(&mut StereoBlock::new(&mut left, &mut right));
        assert!(left.iter().all(|sample| (sample - 1.0).abs() < 1e-6));
    }
}
