// Modulators: bricks that leave the audio untouched and write a control
// signal, one value per frame, which the host adds to the parameters the
// modulator targets (`Processor::control`). An LFO and a macro are bipolar
// (−1..1), a follower unipolar (0..1); the host reads the range from the
// catalog. Buffers are sized by `prepare`; `process` never allocates.

use crate::modulation::{Lfo, LfoShape};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, db_to_amplitude};

// A modulator's single control output, sized once.
struct ControlOut {
    values: Vec<f32>,
    frames: usize,
}

impl ControlOut {
    fn new() -> Self {
        Self {
            values: Vec::new(),
            frames: 0,
        }
    }

    fn prepare(&mut self, max_block: usize) {
        self.values = vec![0.0; max_block.max(1)];
    }

    fn get(&self, output: usize) -> &[f32] {
        match output {
            0 => &self.values[..self.frames],
            _ => &[],
        }
    }
}

pub const LFO_RATE_HZ: u32 = 0;
pub const LFO_SHAPE: u32 = 1;
pub const LFO_PHASE: u32 = 2;
pub const LFO_PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(LFO_RATE_HZ, "rate_hz", 0.01, 89.0, 1.0, Unit::Hertz),
    ParamSpec::choice(
        LFO_SHAPE,
        "shape",
        &["sine", "triangle", "square", "saw", "random"],
        0,
    ),
    ParamSpec::new(LFO_PHASE, "phase_deg", 0.0, 360.0, 0.0, Unit::Degrees),
];
// The shapes a wave draws; the last choice, random, holds a value drawn at each period (sample and hold).
const LFO_SHAPES: [LfoShape; 4] = [
    LfoShape::Sine,
    LfoShape::Triangle,
    LfoShape::Square,
    LfoShape::Saw,
];
const LFO_RANDOM: usize = 4;

// A free-running low-frequency oscillator, −1..1.
pub struct LfoSource {
    lfo: Lfo,
    rate: f32,
    shape: usize,
    phase: f32,
    // The random shape's value and its generator (xorshift, the same draw on every run: replay is deterministic).
    held: f32,
    seed: u32,
    out: ControlOut,
}

const RANDOM_SEED: u32 = 0x9E37_79B9;

fn draw(seed: &mut u32) -> f32 {
    *seed ^= *seed << 13;
    *seed ^= *seed >> 17;
    *seed ^= *seed << 5;
    (*seed as f32 / u32::MAX as f32) * 2.0 - 1.0
}

impl LfoSource {
    pub fn new() -> Self {
        Self {
            lfo: Lfo::new(),
            rate: LFO_PARAMS[0].default,
            shape: 0,
            phase: 0.0,
            held: 0.0,
            seed: RANDOM_SEED,
            out: ControlOut::new(),
        }
    }
}

impl Default for LfoSource {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for LfoSource {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.lfo.prepare(sample_rate);
        self.lfo.set_rate(self.rate);
        self.out.prepare(max_block);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames().min(self.out.values.len());
        for value in &mut self.out.values[..frames] {
            *value = match LFO_SHAPES.get(self.shape) {
                Some(shape) => self.lfo.value(*shape, self.phase),
                None => self.held,
            };
            if self.lfo.advance() && self.shape == LFO_RANDOM {
                self.held = draw(&mut self.seed);
            }
        }
        self.out.frames = frames;
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = LFO_PARAMS.get(id as usize) else {
            return;
        };
        match id {
            LFO_RATE_HZ => {
                self.rate = spec.clamp(value);
                self.lfo.set_rate(self.rate);
            }
            LFO_SHAPE => self.shape = spec.index(value),
            LFO_PHASE => self.phase = spec.clamp(value) / 360.0,
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &LFO_PARAMS
    }

    fn reset(&mut self) {
        self.lfo.reset();
        self.seed = RANDOM_SEED;
        self.held = draw(&mut self.seed);
    }

    fn control_outputs(&self) -> usize {
        1
    }

    fn control(&self, output: usize) -> &[f32] {
        self.out.get(output)
    }
}

pub const FOLLOWER_ATTACK_MS: u32 = 0;
pub const FOLLOWER_RELEASE_MS: u32 = 1;
pub const FOLLOWER_GAIN_DB: u32 = 2;
pub const FOLLOWER_PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(
        FOLLOWER_ATTACK_MS,
        "attack_ms",
        0.1,
        1000.0,
        5.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(
        FOLLOWER_RELEASE_MS,
        "release_ms",
        1.0,
        5000.0,
        144.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(
        FOLLOWER_GAIN_DB,
        "gain_db",
        -24.0,
        24.0,
        0.0,
        Unit::Decibels,
    ),
];

// The level of the audio passing through (peak, attack and release), 0..1.
pub struct Follower {
    sample_rate: f32,
    attack: f32,
    release: f32,
    gain: Smoothed,
    level: f32,
    values: [f32; 3],
    out: ControlOut,
}

impl Follower {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            attack: 0.0,
            release: 0.0,
            gain: Smoothed::new(1.0, 10.0),
            level: 0.0,
            values: FOLLOWER_PARAMS.map(|spec| spec.default),
            out: ControlOut::new(),
        }
    }

    fn coefficients(&mut self) {
        let coefficient = |ms: f32, rate: f32| (-1.0 / (ms * 0.001 * rate).max(1.0)).exp();
        self.attack = coefficient(self.values[0], self.sample_rate);
        self.release = coefficient(self.values[1], self.sample_rate);
    }
}

impl Default for Follower {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Follower {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.sample_rate = sample_rate;
        self.gain.prepare(sample_rate);
        self.coefficients();
        self.out.prepare(max_block);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames().min(self.out.values.len());
        for index in 0..frames {
            let input = block.left[index].abs().max(block.right[index].abs()) * self.gain.tick();
            let coefficient = if input > self.level {
                self.attack
            } else {
                self.release
            };
            self.level = input + coefficient * (self.level - input);
            self.out.values[index] = self.level.min(1.0);
        }
        self.out.frames = frames;
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = FOLLOWER_PARAMS.get(id as usize) else {
            return;
        };
        self.values[id as usize] = spec.clamp(value);
        match id {
            FOLLOWER_GAIN_DB => self.gain.set(db_to_amplitude(self.values[2])),
            _ => self.coefficients(),
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &FOLLOWER_PARAMS
    }

    fn reset(&mut self) {
        self.gain.settle();
        self.level = 0.0;
    }

    fn control_outputs(&self) -> usize {
        1
    }

    fn control(&self, output: usize) -> &[f32] {
        self.out.get(output)
    }
}

pub const CONSTANT_VALUE: u32 = 0;
pub const CONSTANT_PARAMS: [ParamSpec; 1] = [ParamSpec::new(
    CONSTANT_VALUE,
    "value",
    -1.0,
    1.0,
    0.0,
    Unit::Plain,
)];

// A macro: one value, smoothed, sent to every target at its own depth.
pub struct Constant {
    value: Smoothed,
    out: ControlOut,
}

impl Constant {
    pub fn new() -> Self {
        Self {
            value: Smoothed::new(CONSTANT_PARAMS[0].default, 10.0),
            out: ControlOut::new(),
        }
    }
}

impl Default for Constant {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Constant {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.value.prepare(sample_rate);
        self.out.prepare(max_block);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames().min(self.out.values.len());
        for value in &mut self.out.values[..frames] {
            *value = self.value.tick();
        }
        self.out.frames = frames;
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if id == CONSTANT_VALUE {
            self.value.set(CONSTANT_PARAMS[0].clamp(value));
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &CONSTANT_PARAMS
    }

    fn reset(&mut self) {
        self.value.settle();
    }

    fn control_outputs(&self) -> usize {
        1
    }

    fn control(&self, output: usize) -> &[f32] {
        self.out.get(output)
    }
}
