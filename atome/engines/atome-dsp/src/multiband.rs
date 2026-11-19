// Three-band compressor: the Linkwitz-Riley split of `crossover.rs` (its bands
// sum back flat), one stereo-linked peak compressor per band, then the bands
// summed again. The mix blends each band with itself untouched, so the dry
// share keeps the split's phase and never combs against the compressed one.

use crate::crossover::Bands;
use crate::detector::{PeakHold, knee_reduction_db};
use crate::dynamics::time_coefficient;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, amplitude_to_db, db_to_amplitude};

pub const LOW_HZ: u32 = 0;
pub const HIGH_HZ: u32 = 1;
pub const LOW_THRESHOLD_DB: u32 = 2;
pub const LOW_RATIO: u32 = 3;
pub const LOW_GAIN_DB: u32 = 4;
pub const MID_THRESHOLD_DB: u32 = 5;
pub const MID_RATIO: u32 = 6;
pub const MID_GAIN_DB: u32 = 7;
pub const HIGH_THRESHOLD_DB: u32 = 8;
pub const HIGH_RATIO: u32 = 9;
pub const HIGH_GAIN_DB: u32 = 10;
pub const ATTACK_MS: u32 = 11;
pub const RELEASE_MS: u32 = 12;
pub const MIX: u32 = 13;

const fn threshold(id: u32, key: &'static str) -> ParamSpec {
    ParamSpec::new(id, key, -60.0, 0.0, -18.0, Unit::Decibels)
}

const fn ratio(id: u32, key: &'static str) -> ParamSpec {
    ParamSpec::new(id, key, 1.0, 20.0, 2.0, Unit::Ratio)
}

const fn gain(id: u32, key: &'static str) -> ParamSpec {
    ParamSpec::new(id, key, -24.0, 24.0, 0.0, Unit::Decibels)
}

pub const PARAMS: [ParamSpec; 14] = [
    ParamSpec::new(LOW_HZ, "low_hz", 21.0, 2000.0, 144.0, Unit::Hertz),
    ParamSpec::new(HIGH_HZ, "high_hz", 200.0, 16000.0, 2584.0, Unit::Hertz),
    threshold(LOW_THRESHOLD_DB, "low_threshold_db"),
    ratio(LOW_RATIO, "low_ratio"),
    gain(LOW_GAIN_DB, "low_gain_db"),
    threshold(MID_THRESHOLD_DB, "mid_threshold_db"),
    ratio(MID_RATIO, "mid_ratio"),
    gain(MID_GAIN_DB, "mid_gain_db"),
    threshold(HIGH_THRESHOLD_DB, "high_threshold_db"),
    ratio(HIGH_RATIO, "high_ratio"),
    gain(HIGH_GAIN_DB, "high_gain_db"),
    ParamSpec::new(ATTACK_MS, "attack_ms", 0.1, 200.0, 13.0, Unit::Milliseconds),
    ParamSpec::new(
        RELEASE_MS,
        "release_ms",
        5.0,
        2000.0,
        144.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];
// Gain reduction of each band now, in positive dB.
pub const READINGS: [&str; 3] = ["low_reduction_db", "mid_reduction_db", "high_reduction_db"];

const BANDS: usize = 3;
const KNEE_DB: f32 = 6.0;

struct Band {
    threshold: Smoothed,
    ratio: Smoothed,
    gain_db: Smoothed,
    hold: PeakHold,
    envelope_db: f32,
}

impl Band {
    fn new() -> Self {
        Self {
            threshold: Smoothed::new(PARAMS[2].default, 21.0),
            ratio: Smoothed::new(PARAMS[3].default, 21.0),
            gain_db: Smoothed::new(PARAMS[4].default, 21.0),
            hold: PeakHold::default(),
            envelope_db: 0.0,
        }
    }

    fn smoothers(&mut self) -> [&mut Smoothed; 3] {
        [&mut self.threshold, &mut self.ratio, &mut self.gain_db]
    }

    // The band's gain for one frame of peak `level`.
    #[inline]
    fn gain(&mut self, level: f32, attack: f32, release: f32, mix: f32) -> f32 {
        let threshold = self.threshold.tick();
        let slope = 1.0 - 1.0 / self.ratio.tick();
        let makeup = self.gain_db.tick();
        let level = self.hold.tick(level);
        let target = knee_reduction_db(amplitude_to_db(level) - threshold, slope, KNEE_DB);
        let coefficient = if target > self.envelope_db {
            attack
        } else {
            release
        };
        self.envelope_db = target + coefficient * (self.envelope_db - target);
        let wet = db_to_amplitude(makeup - self.envelope_db);
        1.0 + mix * (wet - 1.0)
    }
}

pub struct Multiband {
    sample_rate: f32,
    split: Bands,
    scratch: [Vec<f32>; 4],
    bands: [Band; BANDS],
    attack_ms: f32,
    release_ms: f32,
    attack: f32,
    release: f32,
    mix: Smoothed,
    readings: [f32; BANDS],
}

impl Multiband {
    pub fn new() -> Self {
        let mut split = Bands::new(BANDS);
        split.set_param(0, PARAMS[LOW_HZ as usize].default);
        split.set_param(1, PARAMS[HIGH_HZ as usize].default);
        Self {
            sample_rate: 48000.0,
            split,
            scratch: Default::default(),
            bands: [Band::new(), Band::new(), Band::new()],
            attack_ms: PARAMS[ATTACK_MS as usize].default,
            release_ms: PARAMS[RELEASE_MS as usize].default,
            attack: 0.0,
            release: 0.0,
            mix: Smoothed::new(PARAMS[MIX as usize].default, 21.0),
            readings: [0.0; BANDS],
        }
    }

    fn update_times(&mut self) {
        self.attack = time_coefficient(self.attack_ms, self.sample_rate);
        self.release = time_coefficient(self.release_ms, self.sample_rate);
    }
}

impl Default for Multiband {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Multiband {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.sample_rate = sample_rate;
        self.split.prepare(sample_rate, max_block);
        for buffer in &mut self.scratch {
            *buffer = vec![0.0; max_block];
        }
        for band in &mut self.bands {
            for smoothed in band.smoothers() {
                smoothed.prepare(sample_rate);
                smoothed.settle();
            }
            band.hold.prepare(sample_rate);
        }
        self.mix.prepare(sample_rate);
        self.mix.settle();
        self.update_times();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let [mid_left, mid_right, high_left, high_right] = &mut self.scratch;
        let mut ports = [
            StereoBlock::new(&mut mid_left[..frames], &mut mid_right[..frames]),
            StereoBlock::new(&mut high_left[..frames], &mut high_right[..frames]),
        ];
        self.split.process_ports(block, &mut ports);
        let [mid, high] = &mut ports;
        let (attack, release) = (self.attack, self.release);
        for index in 0..frames {
            let mix = self.mix.tick();
            let mut sum_left = 0.0;
            let mut sum_right = 0.0;
            for (band, (left, right)) in self.bands.iter_mut().zip([
                (block.left[index], block.right[index]),
                (mid.left[index], mid.right[index]),
                (high.left[index], high.right[index]),
            ]) {
                let gain = band.gain(left.abs().max(right.abs()), attack, release, mix);
                sum_left += left * gain;
                sum_right += right * gain;
            }
            block.left[index] = sum_left;
            block.right[index] = sum_right;
        }
        for (reading, band) in self.readings.iter_mut().zip(&self.bands) {
            *reading = band.envelope_db;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            LOW_HZ => self.split.set_param(0, value),
            HIGH_HZ => self.split.set_param(1, value),
            LOW_THRESHOLD_DB..=HIGH_GAIN_DB => {
                let offset = (id - LOW_THRESHOLD_DB) as usize;
                let band = &mut self.bands[offset / 3];
                band.smoothers()[offset % 3].set(value);
            }
            ATTACK_MS => {
                self.attack_ms = value;
                self.update_times();
            }
            RELEASE_MS => {
                self.release_ms = value;
                self.update_times();
            }
            MIX => self.mix.set(value),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        self.split.reset();
        for band in &mut self.bands {
            for smoothed in band.smoothers() {
                smoothed.settle();
            }
            band.hold.reset();
            band.envelope_db = 0.0;
        }
        self.mix.settle();
        self.readings = [0.0; BANDS];
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
