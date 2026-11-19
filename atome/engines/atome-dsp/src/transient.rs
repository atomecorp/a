// Transient shaper, level-independent: two envelope pairs of the stereo-linked
// peak. A fast and a slow attack differ only while a note starts (the attack
// share); a fast and a slow release differ only while it dies (the sustain
// share). Each share, in dB, is scaled by its amount (−1…1) and applied.

use crate::dynamics::time_coefficient;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, db_to_amplitude};

pub const ATTACK: u32 = 0;
pub const SUSTAIN: u32 = 1;
pub const OUTPUT_DB: u32 = 2;
pub const MIX: u32 = 3;
pub const PARAMS: [ParamSpec; 4] = [
    ParamSpec::new(ATTACK, "attack", -1.0, 1.0, 0.0, Unit::Percent),
    ParamSpec::new(SUSTAIN, "sustain", -1.0, 1.0, 0.0, Unit::Percent),
    ParamSpec::new(OUTPUT_DB, "output_db", -24.0, 24.0, 0.0, Unit::Decibels),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];

// The largest change the shaper ever applies, either way.
const MAX_SHAPE_DB: f32 = 18.0;
const FLOOR: f32 = 1.0e-9;

#[derive(Clone, Copy, Default)]
struct Follower {
    attack: f32,
    release: f32,
    value: f32,
}

impl Follower {
    fn set(&mut self, attack_ms: f32, release_ms: f32, sample_rate: f32) {
        self.attack = time_coefficient(attack_ms, sample_rate);
        self.release = time_coefficient(release_ms, sample_rate);
    }

    #[inline]
    fn tick(&mut self, level: f32) -> f32 {
        let coefficient = if level > self.value {
            self.attack
        } else {
            self.release
        };
        self.value = level + coefficient * (self.value - level);
        if self.value < 1.0e-20 {
            self.value = 0.0;
        }
        self.value
    }
}

pub struct TransientShaper {
    attack: Smoothed,
    sustain: Smoothed,
    output_db: Smoothed,
    mix: Smoothed,
    // [fast attack, slow attack, fast release, slow release]
    followers: [Follower; 4],
}

impl TransientShaper {
    pub fn new() -> Self {
        Self {
            attack: Smoothed::new(PARAMS[0].default, 21.0),
            sustain: Smoothed::new(PARAMS[1].default, 21.0),
            output_db: Smoothed::new(PARAMS[2].default, 21.0),
            mix: Smoothed::new(PARAMS[3].default, 21.0),
            followers: [Follower::default(); 4],
        }
    }

    fn smoothers(&mut self) -> [&mut Smoothed; 4] {
        [
            &mut self.attack,
            &mut self.sustain,
            &mut self.output_db,
            &mut self.mix,
        ]
    }
}

impl Default for TransientShaper {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for TransientShaper {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        for smoothed in self.smoothers() {
            smoothed.prepare(sample_rate);
            smoothed.settle();
        }
        let [fast_attack, slow_attack, fast_release, slow_release] = &mut self.followers;
        fast_attack.set(1.0, 144.0, sample_rate);
        slow_attack.set(34.0, 144.0, sample_rate);
        fast_release.set(1.0, 21.0, sample_rate);
        slow_release.set(1.0, 377.0, sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            let attack = self.attack.tick();
            let sustain = self.sustain.tick();
            let output = self.output_db.tick();
            let mix = self.mix.tick();
            let (left, right) = (block.left[index], block.right[index]);
            let level = left.abs().max(right.abs());
            let [fast_attack, slow_attack, fast_release, slow_release] = self
                .followers
                .each_mut()
                .map(|follower| follower.tick(level));
            let onset_db = 20.0 * ((fast_attack + FLOOR) / (slow_attack + FLOOR)).log10();
            let decay_db = 20.0 * ((slow_release + FLOOR) / (fast_release + FLOOR)).log10();
            let shape_db =
                (attack * onset_db + sustain * decay_db).clamp(-MAX_SHAPE_DB, MAX_SHAPE_DB);
            let gain = 1.0 + mix * (db_to_amplitude(shape_db) - 1.0);
            let gain = gain * db_to_amplitude(output);
            block.left[index] = left * gain;
            block.right[index] = right * gain;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            ATTACK => self.attack.set(value),
            SUSTAIN => self.sustain.set(value),
            OUTPUT_DB => self.output_db.set(value),
            MIX => self.mix.set(value),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        for smoothed in self.smoothers() {
            smoothed.settle();
        }
        for follower in &mut self.followers {
            follower.value = 0.0;
        }
    }
}
