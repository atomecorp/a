// Noise generator brick: white, or pink (−3 dB per octave, Paul Kellett's
// economy filter). Like the oscillator it writes the block instead of
// processing it. Its sequence is seeded, so a render is reproducible.

use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, db_to_amplitude};

pub const COLOR: u32 = 0;
pub const LEVEL_DB: u32 = 1;
pub const PARAMS: [ParamSpec; 2] = [
    ParamSpec::choice(COLOR, "color", &["white", "pink"], 0),
    ParamSpec::new(LEVEL_DB, "level_db", -120.0, 0.0, -12.0, Unit::Decibels),
];

const SEED: u32 = 0x9E37_79B9;

pub struct Noise {
    pink: bool,
    level: Smoothed,
    state: u32,
    filter: [f32; 3],
}

impl Noise {
    pub fn new() -> Self {
        Self {
            pink: false,
            level: Smoothed::new(db_to_amplitude(PARAMS[1].default), 10.0),
            state: SEED,
            filter: [0.0; 3],
        }
    }

    // A xorshift sample in −1..1.
    #[inline]
    fn white(&mut self) -> f32 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 17;
        self.state ^= self.state << 5;
        (self.state >> 8) as f32 / 8_388_608.0 - 1.0
    }

    #[inline]
    fn sample(&mut self) -> f32 {
        let white = self.white();
        if !self.pink {
            return white;
        }
        let [b0, b1, b2] = &mut self.filter;
        *b0 = 0.99765 * *b0 + white * 0.099_046;
        *b1 = 0.963 * *b1 + white * 0.296_516_4;
        *b2 = 0.57 * *b2 + white * 1.052_691_3;
        (*b0 + *b1 + *b2 + white * 0.1848) * 0.25
    }
}

impl Default for Noise {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Noise {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.level.prepare(sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            let value = self.sample() * self.level.tick();
            block.left[index] = value;
            block.right[index] = value;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        match id {
            COLOR => self.pink = spec.index(value) == 1,
            LEVEL_DB => self.level.set(db_to_amplitude(spec.clamp(value))),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        self.level.settle();
        self.state = SEED;
        self.filter = [0.0; 3];
    }
}
