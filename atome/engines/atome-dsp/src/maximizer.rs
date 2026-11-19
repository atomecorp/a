// Mastering maximizer: a true-peak brickwall limiter with a constant
// lookahead. The gain needed by every 4× oversampled peak is held over the
// lookahead, then ramped by a moving average of the same length, so the gain
// is already down when the peak leaves: the output never passes the ceiling
// in true peak, with no clipping. The loudness of the output is measured.

use crate::delay::DelayLine;
use crate::dynamics::time_coefficient;
use crate::loudness::{LoudnessMeter, TruePeak};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, amplitude_to_db, db_to_amplitude};

pub const TARGET: u32 = 0;
pub const TARGET_LUFS: u32 = 1;
pub const CEILING_DBTP: u32 = 2;
pub const GAIN_DB: u32 = 3;
pub const RELEASE_MS: u32 = 4;
pub const TARGETS: [&str; 4] = ["streaming", "cd", "club", "podcast"];
pub const PARAMS: [ParamSpec; 5] = [
    ParamSpec::choice(TARGET, "target", &TARGETS, 0),
    ParamSpec::new(
        TARGET_LUFS,
        "target_lufs",
        -24.0,
        -6.0,
        -14.0,
        Unit::Decibels,
    ),
    ParamSpec::new(
        CEILING_DBTP,
        "ceiling_dbtp",
        -3.0,
        0.0,
        -1.0,
        Unit::Decibels,
    ),
    ParamSpec::new(GAIN_DB, "gain_db", 0.0, 24.0, 0.0, Unit::Decibels),
    ParamSpec::new(
        RELEASE_MS,
        "release_ms",
        1.0,
        1000.0,
        89.0,
        Unit::Milliseconds,
    ),
];
// Reduction in positive dB; loudness and true peak (held since the reset) of
// the output.
pub const READINGS: [&str; 4] = [
    "reduction_db",
    "lufs_integrated",
    "lufs_short",
    "true_peak_db",
];

// The loudness each target aims at (the streaming services' −14, a loud CD,
// a club master, the podcasts' −16 LUFS).
pub fn target_lufs(index: usize) -> f32 {
    [-14.0, -9.0, -6.0, -16.0][index.min(3)]
}

const LOOKAHEAD_MS: f32 = 3.0;
// The hold reaches this many frames on each side of a peak, more than the
// interpolator's half length, so a gain change never lifts its neighbours.
const SPAN: usize = 8;
// What the gain aims under the ceiling (the interpolator's own error).
const MARGIN_DB: f32 = 0.05;

// Sliding minimum over the last `window` values (a monotonic queue).
struct MinHold {
    values: Vec<f32>,
    stamps: Vec<u64>,
    head: usize,
    length: usize,
    window: u64,
    time: u64,
}

impl MinHold {
    fn new() -> Self {
        Self {
            values: Vec::new(),
            stamps: Vec::new(),
            head: 0,
            length: 0,
            window: 1,
            time: 0,
        }
    }

    fn allocate(&mut self, window: usize) {
        self.values = vec![1.0; window + 1];
        self.stamps = vec![0; window + 1];
        self.window = window as u64;
        self.clear();
    }

    fn clear(&mut self) {
        self.head = 0;
        self.length = 0;
        self.time = 0;
    }

    #[inline]
    fn push(&mut self, value: f32) -> f32 {
        let capacity = self.values.len();
        while self.length > 0 {
            let back = (self.head + self.length - 1) % capacity;
            if self.values[back] >= value {
                self.length -= 1;
            } else {
                break;
            }
        }
        let slot = (self.head + self.length) % capacity;
        self.values[slot] = value;
        self.stamps[slot] = self.time;
        self.length += 1;
        while self.stamps[self.head] + self.window <= self.time {
            self.head = (self.head + 1) % capacity;
            self.length -= 1;
        }
        self.time += 1;
        self.values[self.head]
    }
}

// Moving average over the last `length` values.
struct BoxAverage {
    ring: Vec<f32>,
    index: usize,
    sum: f64,
}

impl BoxAverage {
    fn allocate(&mut self, length: usize) {
        self.ring = vec![1.0; length.max(1)];
        self.clear();
    }

    fn clear(&mut self) {
        self.ring.fill(1.0);
        self.index = 0;
        self.sum = self.ring.len() as f64;
    }

    #[inline]
    fn push(&mut self, value: f32) -> f32 {
        self.sum += value as f64 - self.ring[self.index] as f64;
        self.ring[self.index] = value;
        self.index = (self.index + 1) % self.ring.len();
        (self.sum / self.ring.len() as f64) as f32
    }
}

pub struct Maximizer {
    sample_rate: f32,
    target: usize,
    target_lufs: f32,
    ceiling: Smoothed,
    drive_db: Smoothed,
    release: f32,
    release_ms: f32,
    lookahead: usize,
    delay: usize,
    detector: TruePeak,
    hold: MinHold,
    average: BoxAverage,
    lines: [DelayLine; 2],
    gain: f32,
    meter: LoudnessMeter,
    readings: [f32; 4],
}

impl Maximizer {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            target: PARAMS[0].default as usize,
            target_lufs: PARAMS[1].default,
            ceiling: Smoothed::new(PARAMS[2].default, 21.0),
            drive_db: Smoothed::new(PARAMS[3].default, 21.0),
            release: 0.0,
            release_ms: PARAMS[4].default,
            lookahead: 1,
            delay: 0,
            detector: TruePeak::new(),
            hold: MinHold::new(),
            average: BoxAverage {
                ring: Vec::new(),
                index: 0,
                sum: 0.0,
            },
            lines: [DelayLine::new(), DelayLine::new()],
            gain: 1.0,
            meter: LoudnessMeter::new(),
            readings: [0.0, crate::SILENCE_DB, crate::SILENCE_DB, crate::SILENCE_DB],
        }
    }

    // The target chosen in the series, and the loudness it stands for.
    pub fn target(&self) -> (usize, f32) {
        (self.target, self.target_lufs)
    }
}

impl Default for Maximizer {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Maximizer {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.ceiling.prepare(sample_rate);
        self.ceiling.settle();
        self.drive_db.prepare(sample_rate);
        self.drive_db.settle();
        self.release = time_coefficient(self.release_ms, sample_rate);
        self.lookahead = ((LOOKAHEAD_MS * 0.001 * sample_rate).round() as usize).max(1);
        self.delay = TruePeak::DELAY + self.lookahead - 1 + SPAN;
        self.hold.allocate(self.lookahead + 2 * SPAN);
        self.average.allocate(self.lookahead);
        for line in &mut self.lines {
            line.allocate(self.delay + 1);
        }
        self.meter.prepare(sample_rate);
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let margin = db_to_amplitude(-MARGIN_DB);
        for index in 0..block.frames() {
            let drive = db_to_amplitude(self.drive_db.tick());
            let ceiling = db_to_amplitude(self.ceiling.tick());
            let mut left = block.left[index] * drive;
            let mut right = block.right[index] * drive;
            // A non-finite sample is silenced, never passed on.
            if !left.is_finite() || !right.is_finite() {
                left = 0.0;
                right = 0.0;
            }
            let peak = self.detector.push(left, right);
            let aim = ceiling * margin;
            let needed = if peak > aim { aim / peak } else { 1.0 };
            let ramped = self.average.push(self.hold.push(needed));
            self.gain = if ramped < self.gain {
                ramped
            } else {
                ramped + self.release * (self.gain - ramped)
            };
            self.lines[0].push(left);
            self.lines[1].push(right);
            let delay = (self.delay + 1) as f32;
            let out_left = (self.lines[0].read(delay) * self.gain).clamp(-ceiling, ceiling);
            let out_right = (self.lines[1].read(delay) * self.gain).clamp(-ceiling, ceiling);
            block.left[index] = out_left;
            block.right[index] = out_right;
            self.meter.push(out_left, out_right);
        }
        self.readings = [
            -amplitude_to_db(self.gain).min(0.0),
            self.meter.integrated_lufs(),
            self.meter.short_term_lufs(),
            self.meter.true_peak_db(),
        ];
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            TARGET => {
                self.target = spec.index(value);
                self.target_lufs = target_lufs(self.target);
            }
            TARGET_LUFS => self.target_lufs = value,
            CEILING_DBTP => self.ceiling.set(value),
            GAIN_DB => self.drive_db.set(value),
            RELEASE_MS => {
                self.release_ms = value;
                self.release = time_coefficient(value, self.sample_rate);
            }
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn latency_frames(&self) -> u32 {
        self.delay as u32
    }

    fn tail_frames(&self) -> u32 {
        self.delay as u32
    }

    fn reset(&mut self) {
        self.ceiling.settle();
        self.drive_db.settle();
        self.detector.reset();
        self.hold.clear();
        self.average.clear();
        for line in &mut self.lines {
            line.clear();
        }
        self.gain = 1.0;
        self.meter.reset();
        self.readings = [0.0, crate::SILENCE_DB, crate::SILENCE_DB, crate::SILENCE_DB];
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
