// Keyed dynamics. The gate opens on its key (or on its own input when none is
// wired); the ducker turns its block down while its key plays (voice over
// music) and passes its block untouched without a key.

use crate::dynamics::time_coefficient;
use crate::{amplitude_to_db, db_to_amplitude, KeyBlock, ParamSpec, Processor, StereoBlock, Unit};

#[inline]
fn level(left: &[f32], right: &[f32], index: usize) -> f32 {
    left[index].abs().max(right[index].abs())
}

pub const GATE_THRESHOLD_DB: u32 = 0;
pub const GATE_RANGE_DB: u32 = 1;
pub const GATE_ATTACK_MS: u32 = 2;
pub const GATE_HOLD_MS: u32 = 3;
pub const GATE_RELEASE_MS: u32 = 4;
pub const GATE_PARAMS: [ParamSpec; 5] = [
    ParamSpec::new(GATE_THRESHOLD_DB, "threshold_db", -80.0, 0.0, -45.0, Unit::Decibels),
    ParamSpec::new(GATE_RANGE_DB, "range_db", -80.0, 0.0, -60.0, Unit::Decibels),
    ParamSpec::new(GATE_ATTACK_MS, "attack_ms", 0.1, 50.0, 1.0, Unit::Milliseconds),
    ParamSpec::new(GATE_HOLD_MS, "hold_ms", 0.0, 500.0, 55.0, Unit::Milliseconds),
    ParamSpec::new(GATE_RELEASE_MS, "release_ms", 5.0, 2000.0, 144.0, Unit::Milliseconds),
];
// It closes 3 dB under where it opened, so a level hovering there never chatters.
const HYSTERESIS_DB: f32 = 3.0;

pub struct Gate {
    sample_rate: f32,
    values: [f32; 5],
    attack: f32,
    release: f32,
    hold_frames: usize,
    holding: usize,
    open: bool,
    gain: f32,
}

impl Gate {
    pub fn new() -> Self {
        Self { sample_rate: 48000.0, values: GATE_PARAMS.map(|spec| spec.default), attack: 0.0, release: 0.0, hold_frames: 0, holding: 0, open: false, gain: 1.0 }
    }

    fn update(&mut self) {
        self.attack = time_coefficient(self.values[GATE_ATTACK_MS as usize], self.sample_rate);
        self.release = time_coefficient(self.values[GATE_RELEASE_MS as usize], self.sample_rate);
        self.hold_frames = (self.values[GATE_HOLD_MS as usize] * 0.001 * self.sample_rate) as usize;
    }

    fn run(&mut self, block: &mut StereoBlock, key: Option<KeyBlock>) {
        let threshold = self.values[GATE_THRESHOLD_DB as usize];
        let closed = db_to_amplitude(self.values[GATE_RANGE_DB as usize]);
        for index in 0..block.frames() {
            let level_db = amplitude_to_db(match key {
                Some(key) => level(key.left, key.right, index),
                None => level(block.left, block.right, index),
            });
            if level_db >= threshold {
                self.open = true;
                self.holding = self.hold_frames;
            } else if level_db < threshold - HYSTERESIS_DB {
                if self.holding > 0 {
                    self.holding -= 1;
                } else {
                    self.open = false;
                }
            }
            let target = if self.open { 1.0 } else { closed };
            let coefficient = if target > self.gain { self.attack } else { self.release };
            self.gain = target + coefficient * (self.gain - target);
            block.left[index] *= self.gain;
            block.right[index] *= self.gain;
        }
    }
}

impl Default for Gate {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Gate {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.update();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        self.run(block, None);
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = GATE_PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
            self.update();
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &GATE_PARAMS
    }

    fn reset(&mut self) {
        self.open = false;
        self.holding = 0;
        self.gain = 1.0;
    }

    fn takes_key(&self) -> bool {
        true
    }

    fn process_keyed(&mut self, block: &mut StereoBlock, key: KeyBlock) {
        self.run(block, Some(key));
    }
}

pub const DUCK_AMOUNT_DB: u32 = 0;
pub const DUCK_THRESHOLD_DB: u32 = 1;
pub const DUCK_ATTACK_MS: u32 = 2;
pub const DUCK_RELEASE_MS: u32 = 3;
pub const DUCKER_PARAMS: [ParamSpec; 4] = [
    ParamSpec::new(DUCK_AMOUNT_DB, "amount_db", 0.0, 60.0, 12.0, Unit::Decibels),
    ParamSpec::new(DUCK_THRESHOLD_DB, "threshold_db", -60.0, 0.0, -33.0, Unit::Decibels),
    ParamSpec::new(DUCK_ATTACK_MS, "attack_ms", 0.1, 200.0, 13.0, Unit::Milliseconds),
    ParamSpec::new(DUCK_RELEASE_MS, "release_ms", 5.0, 3000.0, 233.0, Unit::Milliseconds),
];
// The full amount is reached over a 6 dB knee centred on the threshold.
const DUCK_KNEE_DB: f32 = 6.0;

pub struct Ducker {
    sample_rate: f32,
    values: [f32; 4],
    attack: f32,
    release: f32,
    reduction_db: f32,
}

impl Ducker {
    pub fn new() -> Self {
        Self { sample_rate: 48000.0, values: DUCKER_PARAMS.map(|spec| spec.default), attack: 0.0, release: 0.0, reduction_db: 0.0 }
    }

    fn update(&mut self) {
        self.attack = time_coefficient(self.values[DUCK_ATTACK_MS as usize], self.sample_rate);
        self.release = time_coefficient(self.values[DUCK_RELEASE_MS as usize], self.sample_rate);
    }
}

impl Default for Ducker {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Ducker {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.update();
    }

    // Nothing to duck against: the block passes as it came, and the ducker
    // lets go of any reduction it held.
    fn process(&mut self, _block: &mut StereoBlock) {
        self.reduction_db = 0.0;
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = DUCKER_PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
            self.update();
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &DUCKER_PARAMS
    }

    fn reset(&mut self) {
        self.reduction_db = 0.0;
    }

    fn takes_key(&self) -> bool {
        true
    }

    fn process_keyed(&mut self, block: &mut StereoBlock, key: KeyBlock) {
        let amount = self.values[DUCK_AMOUNT_DB as usize];
        let threshold = self.values[DUCK_THRESHOLD_DB as usize];
        for index in 0..block.frames() {
            let over = amplitude_to_db(level(key.left, key.right, index)) - threshold + DUCK_KNEE_DB * 0.5;
            let target = amount * (over / DUCK_KNEE_DB).clamp(0.0, 1.0);
            let coefficient = if target > self.reduction_db { self.attack } else { self.release };
            self.reduction_db = target + coefficient * (self.reduction_db - target);
            let gain = db_to_amplitude(-self.reduction_db);
            block.left[index] *= gain;
            block.right[index] *= gain;
        }
    }
}
