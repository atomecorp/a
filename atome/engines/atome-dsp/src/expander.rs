// Downward expander: under the threshold, every dB the level falls takes
// `ratio` dB away from the output, down to `range_db` at most (a gentler,
// continuous gate). A key, when wired, is what it listens to.

use crate::detector::{PeakHold, knee_reduction_db};
use crate::dynamics::time_coefficient;
use crate::{
    KeyBlock, ParamSpec, Processor, Smoothed, StereoBlock, Unit, amplitude_to_db, db_to_amplitude,
};

pub const THRESHOLD_DB: u32 = 0;
pub const RATIO: u32 = 1;
pub const ATTACK_MS: u32 = 2;
pub const RELEASE_MS: u32 = 3;
pub const RANGE_DB: u32 = 4;
pub const PARAMS: [ParamSpec; 5] = [
    ParamSpec::new(
        THRESHOLD_DB,
        "threshold_db",
        -80.0,
        0.0,
        -45.0,
        Unit::Decibels,
    ),
    ParamSpec::new(RATIO, "ratio", 1.0, 8.0, 2.0, Unit::Ratio),
    ParamSpec::new(ATTACK_MS, "attack_ms", 0.1, 50.0, 3.0, Unit::Milliseconds),
    ParamSpec::new(
        RELEASE_MS,
        "release_ms",
        5.0,
        2000.0,
        144.0,
        Unit::Milliseconds,
    ),
    // The deepest attenuation, as the gate's range.
    ParamSpec::new(RANGE_DB, "range_db", -80.0, 0.0, -21.0, Unit::Decibels),
];
// The attenuation now, in positive dB.
pub const READINGS: [&str; 1] = ["reduction_db"];

const KNEE_DB: f32 = 6.0;

pub struct Expander {
    sample_rate: f32,
    attack_ms: f32,
    release_ms: f32,
    attack: f32,
    release: f32,
    threshold: Smoothed,
    ratio: Smoothed,
    range: Smoothed,
    hold: PeakHold,
    envelope_db: f32,
    readings: [f32; 1],
}

impl Expander {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            attack_ms: PARAMS[2].default,
            release_ms: PARAMS[3].default,
            attack: 0.0,
            release: 0.0,
            threshold: Smoothed::new(PARAMS[0].default, 21.0),
            ratio: Smoothed::new(PARAMS[1].default, 21.0),
            range: Smoothed::new(PARAMS[4].default, 21.0),
            hold: PeakHold::default(),
            envelope_db: 0.0,
            readings: [0.0],
        }
    }

    fn update_times(&mut self) {
        self.attack = time_coefficient(self.attack_ms, self.sample_rate);
        self.release = time_coefficient(self.release_ms, self.sample_rate);
    }

    fn smoothers(&mut self) -> [&mut Smoothed; 3] {
        [&mut self.threshold, &mut self.ratio, &mut self.range]
    }

    fn run(&mut self, block: &mut StereoBlock, key: Option<KeyBlock>) {
        for index in 0..block.frames() {
            let threshold = self.threshold.tick();
            let slope = self.ratio.tick() - 1.0;
            let deepest = -self.range.tick();
            let level = self.hold.tick(match key {
                Some(key) => key.left[index].abs().max(key.right[index].abs()),
                None => block.left[index].abs().max(block.right[index].abs()),
            });
            let target =
                knee_reduction_db(threshold - amplitude_to_db(level), slope, KNEE_DB).min(deepest);
            // Opening (less attenuation) follows the attack, closing the release.
            let coefficient = if target < self.envelope_db {
                self.attack
            } else {
                self.release
            };
            self.envelope_db = target + coefficient * (self.envelope_db - target);
            let gain = db_to_amplitude(-self.envelope_db);
            block.left[index] *= gain;
            block.right[index] *= gain;
        }
        self.readings[0] = self.envelope_db;
    }
}

impl Default for Expander {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Expander {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        for smoothed in self.smoothers() {
            smoothed.prepare(sample_rate);
            smoothed.settle();
        }
        self.hold.prepare(sample_rate);
        self.update_times();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        self.run(block, None);
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            THRESHOLD_DB => self.threshold.set(value),
            RATIO => self.ratio.set(value),
            ATTACK_MS => {
                self.attack_ms = value;
                self.update_times();
            }
            RELEASE_MS => {
                self.release_ms = value;
                self.update_times();
            }
            RANGE_DB => self.range.set(value),
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
        self.hold.reset();
        self.envelope_db = 0.0;
        self.readings = [0.0];
    }

    fn takes_key(&self) -> bool {
        true
    }

    fn process_keyed(&mut self, block: &mut StereoBlock, key: KeyBlock) {
        self.run(block, Some(key));
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
