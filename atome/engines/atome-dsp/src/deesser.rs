// De-esser: the Linkwitz-Riley band above `frequency_hz` (the split of
// `crossover.rs`) is what it listens to; while it passes the threshold,
// either that band alone is turned down (split: the rest of the voice
// untouched) or the whole signal (wide). Both bands sum back flat at rest.

use crate::crossover::Bands;
use crate::detector::knee_reduction_db;
use crate::dynamics::time_coefficient;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, amplitude_to_db, db_to_amplitude};

pub const FREQUENCY_HZ: u32 = 0;
pub const THRESHOLD_DB: u32 = 1;
pub const RANGE_DB: u32 = 2;
pub const MODE: u32 = 3;
pub const MODES: [&str; 2] = ["split", "wide"];
pub const PARAMS: [ParamSpec; 4] = [
    ParamSpec::new(
        FREQUENCY_HZ,
        "frequency_hz",
        2000.0,
        16000.0,
        6000.0,
        Unit::Hertz,
    ),
    ParamSpec::new(
        THRESHOLD_DB,
        "threshold_db",
        -60.0,
        0.0,
        -30.0,
        Unit::Decibels,
    ),
    // The deepest reduction, as the gate's range: −9 turns down 9 dB at most.
    ParamSpec::new(RANGE_DB, "range_db", -24.0, 0.0, -9.0, Unit::Decibels),
    ParamSpec::choice(MODE, "mode", &MODES, 0),
];
// The reduction now, in positive dB.
pub const READINGS: [&str; 1] = ["reduction_db"];

const RATIO: f32 = 5.0;
const KNEE_DB: f32 = 3.0;
const ATTACK_MS: f32 = 1.0;
const RELEASE_MS: f32 = 55.0;

pub struct Deesser {
    split: Bands,
    high: [Vec<f32>; 2],
    // 0 = split, 1 = wide, crossfaded so a change never clicks.
    wide: Smoothed,
    threshold: Smoothed,
    range: Smoothed,
    attack: f32,
    release: f32,
    envelope_db: f32,
    readings: [f32; 1],
}

impl Deesser {
    pub fn new() -> Self {
        let mut split = Bands::new(2);
        split.set_param(0, PARAMS[FREQUENCY_HZ as usize].default);
        Self {
            split,
            high: Default::default(),
            wide: Smoothed::new(PARAMS[MODE as usize].default, 21.0),
            threshold: Smoothed::new(PARAMS[THRESHOLD_DB as usize].default, 21.0),
            range: Smoothed::new(PARAMS[RANGE_DB as usize].default, 21.0),
            attack: 0.0,
            release: 0.0,
            envelope_db: 0.0,
            readings: [0.0],
        }
    }

    fn smoothers(&mut self) -> [&mut Smoothed; 3] {
        [&mut self.wide, &mut self.threshold, &mut self.range]
    }
}

impl Default for Deesser {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Deesser {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.split.prepare(sample_rate, max_block);
        for buffer in &mut self.high {
            *buffer = vec![0.0; max_block];
        }
        for smoothed in self.smoothers() {
            smoothed.prepare(sample_rate);
            smoothed.settle();
        }
        self.attack = time_coefficient(ATTACK_MS, sample_rate);
        self.release = time_coefficient(RELEASE_MS, sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let slope = 1.0 - 1.0 / RATIO;
        let [high_left, high_right] = &mut self.high;
        let mut high = [StereoBlock::new(
            &mut high_left[..frames],
            &mut high_right[..frames],
        )];
        self.split.process_ports(block, &mut high);
        let [high] = &high;
        for index in 0..frames {
            let threshold = self.threshold.tick();
            let deepest = -self.range.tick();
            let wide = self.wide.tick();
            let (sibilant_left, sibilant_right) = (high.left[index], high.right[index]);
            let level = amplitude_to_db(sibilant_left.abs().max(sibilant_right.abs()));
            let target = knee_reduction_db(level - threshold, slope, KNEE_DB).min(deepest);
            let coefficient = if target > self.envelope_db {
                self.attack
            } else {
                self.release
            };
            self.envelope_db = target + coefficient * (self.envelope_db - target);
            let gain = db_to_amplitude(-self.envelope_db);
            // The low band follows the high one's gain only in wide mode.
            let low_gain = 1.0 + wide * (gain - 1.0);
            block.left[index] = block.left[index] * low_gain + sibilant_left * gain;
            block.right[index] = block.right[index] * low_gain + sibilant_right * gain;
        }
        self.readings[0] = self.envelope_db;
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            FREQUENCY_HZ => self.split.set_param(0, value),
            THRESHOLD_DB => self.threshold.set(value),
            RANGE_DB => self.range.set(value),
            MODE => self.wide.set(spec.index(value) as f32),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        self.split.reset();
        for smoothed in self.smoothers() {
            smoothed.settle();
        }
        self.envelope_db = 0.0;
        self.readings = [0.0];
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
