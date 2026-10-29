// Dynamics: compressor and the output limiter that is always on the direct
// path (audio safety, decision D13). Both are zero-latency (no lookahead).

use crate::{amplitude_to_db, db_to_amplitude, KeyBlock, ParamSpec, Processor, StereoBlock, Unit};

pub(crate) fn time_coefficient(time_ms: f32, sample_rate: f32) -> f32 {
    (-1.0 / (time_ms.max(0.01) * 0.001 * sample_rate)).exp()
}

pub const THRESHOLD_DB: u32 = 0;
pub const RATIO: u32 = 1;
pub const ATTACK_MS: u32 = 2;
pub const RELEASE_MS: u32 = 3;
pub const MAKEUP_DB: u32 = 4;
pub const COMPRESSOR_PARAMS: [ParamSpec; 5] = [
    ParamSpec::new(THRESHOLD_DB, "threshold_db", -60.0, 0.0, -18.0, Unit::Decibels),
    ParamSpec::new(RATIO, "ratio", 1.0, 20.0, 3.0, Unit::Ratio),
    ParamSpec::new(ATTACK_MS, "attack_ms", 0.1, 200.0, 9.0, Unit::Milliseconds),
    ParamSpec::new(RELEASE_MS, "release_ms", 5.0, 2000.0, 144.0, Unit::Milliseconds),
    ParamSpec::new(MAKEUP_DB, "makeup_db", 0.0, 24.0, 0.0, Unit::Decibels),
];

// Feed-forward, stereo-linked, soft knee of 6 dB; a key, when wired, is what
// it listens to (sidechain) while it turns the block down.
pub struct Compressor {
    sample_rate: f32,
    values: [f32; 5],
    attack: f32,
    release: f32,
    envelope_db: f32,
}

impl Compressor {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            values: COMPRESSOR_PARAMS.map(|spec| spec.default),
            attack: 0.0,
            release: 0.0,
            envelope_db: 0.0,
        }
    }

    fn update_times(&mut self) {
        self.attack = time_coefficient(self.values[ATTACK_MS as usize], self.sample_rate);
        self.release = time_coefficient(self.values[RELEASE_MS as usize], self.sample_rate);
    }

    fn gain_reduction_db(&self, level_db: f32) -> f32 {
        const KNEE: f32 = 6.0;
        let threshold = self.values[THRESHOLD_DB as usize];
        let slope = 1.0 - 1.0 / self.values[RATIO as usize];
        let over = level_db - threshold;
        if over <= -KNEE * 0.5 {
            0.0
        } else if over >= KNEE * 0.5 {
            over * slope
        } else {
            let x = over + KNEE * 0.5;
            slope * x * x / (2.0 * KNEE)
        }
    }
}

impl Compressor {
    fn run(&mut self, block: &mut StereoBlock, key: Option<KeyBlock>) {
        let makeup = db_to_amplitude(self.values[MAKEUP_DB as usize]);
        for index in 0..block.frames() {
            let level = match key {
                Some(key) => key.left[index].abs().max(key.right[index].abs()),
                None => block.left[index].abs().max(block.right[index].abs()),
            };
            let target = self.gain_reduction_db(amplitude_to_db(level));
            let coefficient = if target > self.envelope_db { self.attack } else { self.release };
            self.envelope_db = target + coefficient * (self.envelope_db - target);
            let gain = db_to_amplitude(-self.envelope_db) * makeup;
            block.left[index] *= gain;
            block.right[index] *= gain;
        }
    }
}

impl Default for Compressor {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Compressor {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.update_times();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        self.run(block, None);
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = COMPRESSOR_PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
            self.update_times();
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &COMPRESSOR_PARAMS
    }

    fn reset(&mut self) {
        self.envelope_db = 0.0;
    }

    fn takes_key(&self) -> bool {
        true
    }

    fn process_keyed(&mut self, block: &mut StereoBlock, key: KeyBlock) {
        self.run(block, Some(key));
    }
}

pub const CEILING_DB: u32 = 0;
pub const LIMITER_PARAMS: [ParamSpec; 1] = [ParamSpec::new(CEILING_DB, "ceiling_db", -12.0, 0.0, -1.0, Unit::Decibels)];

// Instant-attack peak limiter followed by a hard ceiling: nothing ever leaves
// above the ceiling, whatever a chain or a feedback mistake produces.
pub struct Limiter {
    ceiling: f32,
    release: f32,
    gain: f32,
}

impl Limiter {
    pub fn new() -> Self {
        Self { ceiling: db_to_amplitude(LIMITER_PARAMS[0].default), release: 0.0, gain: 1.0 }
    }
}

impl Default for Limiter {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Limiter {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.release = time_coefficient(89.0, sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let ceiling = self.ceiling;
        for (left, right) in block.left.iter_mut().zip(block.right.iter_mut()) {
            // A non-finite sample (a broken effect) is silenced, never passed on.
            if !left.is_finite() || !right.is_finite() {
                *left = 0.0;
                *right = 0.0;
            }
            let peak = left.abs().max(right.abs());
            let needed = if peak > ceiling { ceiling / peak } else { 1.0 };
            self.gain = if needed < self.gain { needed } else { 1.0 + self.release * (self.gain - 1.0) }.min(1.0);
            *left = (*left * self.gain).clamp(-ceiling, ceiling);
            *right = (*right * self.gain).clamp(-ceiling, ceiling);
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if id == CEILING_DB {
            self.ceiling = db_to_amplitude(LIMITER_PARAMS[0].clamp(value));
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &LIMITER_PARAMS
    }

    fn reset(&mut self) {
        self.gain = 1.0;
    }
}
