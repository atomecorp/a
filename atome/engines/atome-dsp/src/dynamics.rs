// Dynamics: the compressor (five hardware characters) and the output limiter
// that is always on the direct path (audio safety, decision D13). Both are
// zero-latency (no lookahead).

use crate::biquad::{Coefficients, Section, Shape};
use crate::detector::{DcBlocker, PeakHold, knee_reduction_db};
use crate::{
    KeyBlock, ParamSpec, Processor, Smoothed, StereoBlock, Unit, amplitude_to_db, db_to_amplitude,
};

pub(crate) fn time_coefficient(time_ms: f32, sample_rate: f32) -> f32 {
    (-1.0 / (time_ms.max(0.01) * 0.001 * sample_rate)).exp()
}

pub const THRESHOLD_DB: u32 = 0;
pub const RATIO: u32 = 1;
pub const ATTACK_MS: u32 = 2;
pub const RELEASE_MS: u32 = 3;
pub const MAKEUP_DB: u32 = 4;
pub const CHARACTER: u32 = 5;
pub const KNEE_DB: u32 = 6;
pub const MIX: u32 = 7;
pub const KEY_HPF_HZ: u32 = 8;
pub const CHARACTERS: [&str; 5] = ["clean", "opto", "fet", "tube", "bus"];
// At its minimum (20 Hz) the detector's high-pass is off: the detector then
// hears the full band, DC included.
pub const KEY_HPF_OFF_HZ: f32 = 20.0;
pub const COMPRESSOR_PARAMS: [ParamSpec; 9] = [
    ParamSpec::new(
        THRESHOLD_DB,
        "threshold_db",
        -60.0,
        0.0,
        -18.0,
        Unit::Decibels,
    ),
    ParamSpec::new(RATIO, "ratio", 1.0, 20.0, 3.0, Unit::Ratio),
    ParamSpec::new(ATTACK_MS, "attack_ms", 0.1, 200.0, 9.0, Unit::Milliseconds),
    ParamSpec::new(
        RELEASE_MS,
        "release_ms",
        5.0,
        2000.0,
        144.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(MAKEUP_DB, "makeup_db", 0.0, 24.0, 0.0, Unit::Decibels),
    ParamSpec::choice(CHARACTER, "character", &CHARACTERS, 0),
    ParamSpec::new(KNEE_DB, "knee_db", 0.0, 24.0, 6.0, Unit::Decibels),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::new(
        KEY_HPF_HZ,
        "key_hpf_hz",
        KEY_HPF_OFF_HZ,
        500.0,
        89.0,
        Unit::Hertz,
    ),
];
// The gain reduction now, in positive dB (0 = untouched, 6 = turned down 6 dB).
pub const COMPRESSOR_READINGS: [&str; 1] = ["reduction_db"];

const REDESIGN_FRAMES: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Character {
    // VCA, feed-forward peak detector: exact and neutral.
    Clean,
    // Optical cell: slow-ish attack, gentle curve, two-stage program release.
    Opto,
    // FET: very fast feedback detector, a touch of odd harmonics.
    Fet,
    // Vari-mu tube: the ratio rises with the level, soft, even-harmonic warmth.
    Tube,
    // Bus (glue): RMS detector and an automatic, program-dependent release.
    Bus,
}

impl Character {
    pub fn from_index(index: usize) -> Self {
        match index {
            1 => Self::Opto,
            2 => Self::Fet,
            3 => Self::Tube,
            4 => Self::Bus,
            _ => Self::Clean,
        }
    }

    fn rms_detector(self) -> bool {
        matches!(self, Self::Tube | Self::Bus)
    }
}

// Stereo-linked; a key, when wired, is what it listens to (sidechain) while
// it turns the block down. The mix blends the dry signal (parallel use).
pub struct Compressor {
    sample_rate: f32,
    character: Character,
    attack_ms: f32,
    release_ms: f32,
    threshold: Smoothed,
    ratio: Smoothed,
    makeup_db: Smoothed,
    knee: Smoothed,
    mix: Smoothed,
    key_hpf: Smoothed,
    attack: f32,
    release: f32,
    slow_attack: f32,
    slow_release: f32,
    rms: f32,
    dc_pole: f32,
    hpf: Coefficients,
    detector: [Section; 2],
    mean_square: f32,
    hold: PeakHold,
    envelope_db: f32,
    slow_db: f32,
    dc: [DcBlocker; 2],
    readings: [f32; 1],
}

impl Compressor {
    pub fn new() -> Self {
        let default = |id: u32| COMPRESSOR_PARAMS[id as usize].default;
        Self {
            sample_rate: 48000.0,
            character: Character::from_index(default(CHARACTER) as usize),
            attack_ms: default(ATTACK_MS),
            release_ms: default(RELEASE_MS),
            threshold: Smoothed::new(default(THRESHOLD_DB), 21.0),
            ratio: Smoothed::new(default(RATIO), 21.0),
            makeup_db: Smoothed::new(default(MAKEUP_DB), 21.0),
            knee: Smoothed::new(default(KNEE_DB), 21.0),
            mix: Smoothed::new(default(MIX), 21.0),
            key_hpf: Smoothed::new(default(KEY_HPF_HZ), 34.0),
            attack: 0.0,
            release: 0.0,
            slow_attack: 0.0,
            slow_release: 0.0,
            rms: 0.0,
            dc_pole: 0.0,
            hpf: Coefficients::default(),
            detector: [Section::default(); 2],
            mean_square: 0.0,
            hold: PeakHold::default(),
            envelope_db: 0.0,
            slow_db: 0.0,
            dc: [DcBlocker::default(); 2],
            readings: [0.0],
        }
    }

    // Each character sets its own ballistics from the attack and the release.
    fn update_times(&mut self) {
        let rate = self.sample_rate;
        let (attack, release) = (self.attack_ms, self.release_ms);
        let (fast_attack, fast_release, slow_attack, slow_release, rms_ms) = match self.character {
            Character::Clean => (attack, release, attack, release, 0.0),
            Character::Opto => (attack.max(10.0), release, 987.0, release * 13.0, 0.0),
            Character::Fet => (attack * 0.2, release, attack, release, 0.0),
            Character::Tube => (attack * 2.0, release * 1.5, attack, release, 21.0),
            Character::Bus => (attack, release * 0.5, 377.0, release * 5.0, 13.0),
        };
        self.attack = time_coefficient(fast_attack, rate);
        self.release = time_coefficient(fast_release, rate);
        self.slow_attack = time_coefficient(slow_attack, rate);
        self.slow_release = time_coefficient(slow_release, rate);
        self.rms = time_coefficient(rms_ms, rate);
        self.dc_pole = 1.0 - std::f32::consts::TAU * 5.0 / rate;
    }

    fn redesign(&mut self, frames: usize) {
        let mut frequency = self.key_hpf.target();
        for _ in 0..frames.max(1) {
            frequency = self.key_hpf.tick();
        }
        self.hpf = Coefficients::design(
            Shape::HighPass,
            self.sample_rate,
            frequency,
            std::f32::consts::FRAC_1_SQRT_2,
            0.0,
        );
    }

    // Detector level in dB (a sine reads its peak whatever the detector).
    #[inline]
    fn level_db(&mut self, left: f32, right: f32) -> f32 {
        if self.character.rms_detector() {
            let square = 0.5 * (left * left + right * right);
            self.mean_square = square + self.rms * (self.mean_square - square);
            if self.mean_square < 1.0e-20 {
                self.mean_square = 0.0;
            }
            amplitude_to_db((2.0 * self.mean_square).sqrt())
        } else {
            amplitude_to_db(self.hold.tick(left.abs().max(right.abs())))
        }
    }

    #[inline]
    fn follow(&mut self, target: f32, attack: f32, release: f32) {
        let coefficient = if target > self.envelope_db {
            attack
        } else {
            release
        };
        self.envelope_db = target + coefficient * (self.envelope_db - target);
    }

    #[inline]
    fn follow_slow(&mut self, target: f32) {
        let coefficient = if target > self.slow_db {
            self.slow_attack
        } else {
            self.slow_release
        };
        self.slow_db = target + coefficient * (self.slow_db - target);
    }

    // One frame of the detector and the gain computer: the reduction in dB.
    #[inline]
    fn reduction_db(
        &mut self,
        level_db: f32,
        threshold: f32,
        ratio: f32,
        knee: f32,
        keyed: bool,
    ) -> f32 {
        let slope = 1.0 - 1.0 / ratio;
        let over = level_db - threshold;
        match self.character {
            Character::Clean => {
                let target = knee_reduction_db(over, slope, knee);
                self.follow(target, self.attack, self.release);
                self.envelope_db
            }
            Character::Opto => {
                let target = knee_reduction_db(over, slope, knee.max(12.0));
                self.follow(target, self.attack, self.release);
                self.follow_slow(target);
                0.6 * self.envelope_db + 0.4 * self.slow_db
            }
            Character::Fet if !keyed => {
                // Feedback: it listens to its own output, whose excess above
                // the threshold is turned down by (ratio − 1): the same static
                // curve, the transient ballistics of a FET. The coefficients
                // keep the loop from overshooting at high ratios.
                let floor = 1.0 - 1.0 / ratio;
                let over_out = over - self.envelope_db;
                let target = knee_reduction_db(over_out, ratio - 1.0, knee);
                self.follow(target, self.attack.max(floor), self.release.max(floor));
                self.envelope_db
            }
            Character::Fet => {
                let target = knee_reduction_db(over, slope, knee);
                self.follow(target, self.attack, self.release);
                self.envelope_db
            }
            Character::Tube => {
                let soft = knee.max(9.0);
                let excess = (over + soft * 0.5).max(0.0);
                let target = knee_reduction_db(over, slope, soft) * excess / (excess + 9.0);
                self.follow(target, self.attack, self.release);
                self.envelope_db
            }
            Character::Bus => {
                let target = knee_reduction_db(over, slope, knee);
                self.follow(target, self.attack, self.release);
                self.follow_slow(target);
                self.envelope_db.max(self.slow_db)
            }
        }
    }

    #[inline]
    fn colour(&mut self, channel: usize, sample: f32) -> f32 {
        match self.character {
            Character::Fet => (sample * 0.7).tanh() / 0.7,
            Character::Tube => {
                let warm = sample + 0.05 * sample * sample;
                self.dc[channel].tick(self.dc_pole, warm)
            }
            Character::Clean | Character::Opto | Character::Bus => sample,
        }
    }

    fn run(&mut self, block: &mut StereoBlock, key: Option<KeyBlock>) {
        let frames = block.frames();
        let filtered = self.key_hpf.target() > KEY_HPF_OFF_HZ;
        let mut reduction = 0.0;
        let mut start = 0;
        while start < frames {
            let end = (start + REDESIGN_FRAMES).min(frames);
            if !self.key_hpf.is_settled() {
                self.redesign(end - start);
            }
            for index in start..end {
                let threshold = self.threshold.tick();
                let ratio = self.ratio.tick();
                let knee = self.knee.tick();
                let makeup = self.makeup_db.tick();
                let mix = self.mix.tick();
                let (mut left, mut right) = match key {
                    Some(key) => (key.left[index], key.right[index]),
                    None => (block.left[index], block.right[index]),
                };
                if filtered {
                    let hpf = self.hpf;
                    left = self.detector[0].tick(&hpf, left);
                    right = self.detector[1].tick(&hpf, right);
                }
                let level = self.level_db(left, right);
                reduction = self.reduction_db(level, threshold, ratio, knee, key.is_some());
                let gain = db_to_amplitude(makeup - reduction);
                let dry_left = block.left[index];
                let dry_right = block.right[index];
                let wet_left = self.colour(0, dry_left * gain);
                let wet_right = self.colour(1, dry_right * gain);
                block.left[index] = dry_left + mix * (wet_left - dry_left);
                block.right[index] = dry_right + mix * (wet_right - dry_right);
            }
            start = end;
        }
        if frames > 0 {
            self.readings[0] = reduction;
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
        for smoothed in [
            &mut self.threshold,
            &mut self.ratio,
            &mut self.makeup_db,
            &mut self.knee,
            &mut self.mix,
            &mut self.key_hpf,
        ] {
            smoothed.prepare(sample_rate);
            smoothed.settle();
        }
        self.hold.prepare(sample_rate);
        self.update_times();
        self.redesign(1);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        self.run(block, None);
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = COMPRESSOR_PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            THRESHOLD_DB => self.threshold.set(value),
            RATIO => self.ratio.set(value),
            ATTACK_MS => self.attack_ms = value,
            RELEASE_MS => self.release_ms = value,
            MAKEUP_DB => self.makeup_db.set(value),
            CHARACTER => self.character = Character::from_index(spec.index(value)),
            KNEE_DB => self.knee.set(value),
            MIX => self.mix.set(value),
            KEY_HPF_HZ => self.key_hpf.set(value),
            _ => {}
        }
        self.update_times();
    }

    fn params(&self) -> &'static [ParamSpec] {
        &COMPRESSOR_PARAMS
    }

    fn reset(&mut self) {
        for smoothed in [
            &mut self.threshold,
            &mut self.ratio,
            &mut self.makeup_db,
            &mut self.knee,
            &mut self.mix,
            &mut self.key_hpf,
        ] {
            smoothed.settle();
        }
        self.redesign(1);
        for section in &mut self.detector {
            section.reset();
        }
        self.dc = [DcBlocker::default(); 2];
        self.mean_square = 0.0;
        self.hold.reset();
        self.envelope_db = 0.0;
        self.slow_db = 0.0;
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

pub const CEILING_DB: u32 = 0;
pub const LIMITER_PARAMS: [ParamSpec; 1] = [ParamSpec::new(
    CEILING_DB,
    "ceiling_db",
    -12.0,
    0.0,
    -1.0,
    Unit::Decibels,
)];

// Instant-attack peak limiter followed by a hard ceiling: nothing ever leaves
// above the ceiling, whatever a chain or a feedback mistake produces.
pub struct Limiter {
    ceiling: f32,
    release: f32,
    gain: f32,
}

impl Limiter {
    pub fn new() -> Self {
        Self {
            ceiling: db_to_amplitude(LIMITER_PARAMS[0].default),
            release: 0.0,
            gain: 1.0,
        }
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
            self.gain = if needed < self.gain {
                needed
            } else {
                1.0 + self.release * (self.gain - 1.0)
            }
            .min(1.0);
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
