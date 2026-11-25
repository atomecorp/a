// Speed: turned on, the sound slows down (or, behind the live signal, speeds
// up) to `target` along a ramp — free in milliseconds or a length of beats —
// on a linear, exponential or S curve. « tape » lets the pitch follow the
// speed (a tape stop at 0); « stretch » keeps it, the slowed sound passing
// through the pitch shifter by the inverse ratio (pitch.rs). A live signal
// cannot be played ahead of itself: it plays faster only to catch up the time
// a slowing put it behind. Turned off, it comes back to the live signal as
// `return` says: « ramp » speeds up until it has caught up, « jump » crossfades
// at once, « stop » slows down to silence first.

use super::{History, MEMORY_SECONDS, RETURN_MS, SWITCH};
use crate::pitch::{PitchShifter, SEGMENT};
use crate::transport::{BeatClock, Transport};
use crate::{ParamSpec, Processor, StereoBlock, Unit};

pub const ACTIVE: u32 = 0;
pub const TARGET: u32 = 1;
pub const RAMP_MS: u32 = 2;
pub const SYNC: u32 = 3;
pub const CURVE: u32 = 4;
pub const MODE: u32 = 5;
pub const RETURN: u32 = 6;
pub const PARAMS: [ParamSpec; 7] = [
    ParamSpec::choice(ACTIVE, "active", &SWITCH, 0),
    ParamSpec::new(TARGET, "target", 0.0, 2.0, 0.5, Unit::Ratio),
    ParamSpec::new(RAMP_MS, "ramp_ms", 1.0, 8000.0, 610.0, Unit::Milliseconds),
    // `free` follows `ramp_ms`; a length of beats follows the tempo.
    ParamSpec::choice(SYNC, "sync", &SYNC_KEYS, 0),
    ParamSpec::choice(CURVE, "curve", &["linear", "exponential", "s_curve"], 0),
    ParamSpec::choice(MODE, "mode", &["tape", "stretch"], 0),
    ParamSpec::choice(RETURN, "return", &["ramp", "jump", "stop"], 0),
];

const SYNC_KEYS: [&str; 8] = ["free", "1_16", "1_8", "1_4", "1_2", "1_1", "2_1", "4_1"];
const SYNC_BEATS: [f64; 8] = [0.0, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0];
// The pitch shifter keeps a voice clean within two octaves down, one up.
const STRETCH_SLOWEST: f64 = 0.25;
// Under this speed the sound fades out (no tape ever freezes on one sample).
const SILENT_BELOW: f64 = 0.125;
// The fastest catching up of a « ramp » return.
const CATCH_UP: f64 = 2.0;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Phase {
    Idle,
    // From `from` to the target, `progress` 0..1 along the curve.
    Going { from: f64, progress: f64 },
    Holding,
    CatchingUp,
    Stopping { from: f64, progress: f64 },
    // Crossfading to the live signal, `progress` 0..1.
    ToLive { progress: f64 },
}

pub struct Speed {
    values: [f32; 7],
    clock: BeatClock,
    sample_rate: f64,
    history: History,
    shifters: [PitchShifter; 2],
    phase: Phase,
    speed: f64,
    // Frames the read lags the live signal by.
    delay: f64,
    stretch: f32,
    fade_step: f32,
    segment: usize,
}

impl Speed {
    pub fn new() -> Self {
        let mut speed = Self {
            values: PARAMS.map(|spec| spec.default),
            clock: BeatClock::new(),
            sample_rate: 48000.0,
            history: History::new(),
            shifters: [PitchShifter::new(48000.0, 1), PitchShifter::new(48000.0, 1)],
            phase: Phase::Idle,
            speed: 1.0,
            delay: 0.0,
            stretch: 0.0,
            fade_step: 1.0,
            segment: 0,
        };
        speed.prepare(48000.0, 0);
        speed
    }

    fn value(&self, id: u32) -> f32 {
        self.values[id as usize]
    }

    fn index(&self, id: u32) -> usize {
        PARAMS[id as usize].index(self.value(id))
    }

    fn stretching(&self) -> bool {
        self.index(MODE) == 1
    }

    fn ramp_frames(&self) -> f64 {
        let frames = match self.index(SYNC) {
            0 => f64::from(self.value(RAMP_MS)) * 0.001 * self.sample_rate,
            sync => self.clock.frames_of(SYNC_BEATS[sync]),
        };
        frames.max(1.0)
    }

    fn target(&self) -> f64 {
        let target = f64::from(self.value(TARGET));
        if self.stretching() {
            target.max(STRETCH_SLOWEST)
        } else {
            target
        }
    }

    fn shape(&self, progress: f64) -> f64 {
        let p = progress.clamp(0.0, 1.0);
        match self.index(CURVE) {
            1 => p * p,
            2 => p * p * (3.0 - 2.0 * p),
            _ => p,
        }
    }

    fn start_return(&mut self) {
        self.phase = match self.index(RETURN) {
            1 => Phase::ToLive { progress: 0.0 },
            2 => Phase::Stopping {
                from: self.speed,
                progress: 0.0,
            },
            _ => Phase::CatchingUp,
        };
    }

    // The speed of this frame, the phase moved on.
    fn advance_phase(&mut self) {
        let active = self.value(ACTIVE) >= 0.5;
        let step = 1.0 / self.ramp_frames();
        match self.phase {
            Phase::Idle if active => {
                self.phase = Phase::Going {
                    from: self.speed,
                    progress: 0.0,
                };
            }
            Phase::Going { .. } | Phase::Holding if !active => self.start_return(),
            Phase::CatchingUp | Phase::Stopping { .. } | Phase::ToLive { .. } if active => {
                self.phase = Phase::Going {
                    from: self.speed,
                    progress: 0.0,
                };
            }
            _ => {}
        }
        match self.phase {
            Phase::Idle => self.speed = 1.0,
            Phase::Going { from, progress } => {
                let target = self.target();
                self.speed = from + (target - from) * self.shape(progress);
                self.phase = if progress >= 1.0 {
                    Phase::Holding
                } else {
                    Phase::Going {
                        from,
                        progress: progress + step,
                    }
                };
            }
            Phase::Holding => self.speed = self.target(),
            Phase::CatchingUp => {
                // Faster while far behind, back to 1 as it lands on the live signal.
                let wanted = 1.0 + (self.delay * step).min(1.0) * (CATCH_UP - 1.0);
                self.speed += (wanted - self.speed) * (4.0 * step).min(1.0);
                if self.delay < 1.0 && self.speed >= 1.0 {
                    self.phase = Phase::ToLive { progress: 0.0 };
                }
            }
            Phase::Stopping { from, progress } => {
                self.speed = from * (1.0 - self.shape(progress));
                self.phase = if progress >= 1.0 {
                    Phase::ToLive { progress: 0.0 }
                } else {
                    Phase::Stopping {
                        from,
                        progress: progress + step,
                    }
                };
            }
            Phase::ToLive { progress } => {
                let next = progress + f64::from(self.fade_step);
                self.phase = if next >= 1.0 {
                    self.delay = 0.0;
                    self.speed = 1.0;
                    Phase::Idle
                } else {
                    Phase::ToLive { progress: next }
                };
            }
        }
        if self.stretching() && !matches!(self.phase, Phase::Stopping { .. }) {
            self.speed = self.speed.max(STRETCH_SLOWEST);
        }
        let room = (self.history.capacity() as f64 - 4.0).max(0.0);
        self.delay = (self.delay + 1.0 - self.speed).clamp(0.0, room);
    }

    fn level(&self) -> f32 {
        let fade = if self.stretching() {
            STRETCH_SLOWEST
        } else {
            SILENT_BELOW
        };
        let level = match self.phase {
            // A stretched stop fades over its whole ramp: the shifter goes no slower.
            Phase::Stopping { progress, .. } if self.stretching() => 1.0 - progress,
            _ => (self.speed / fade).min(1.0),
        };
        let level = level.clamp(0.0, 1.0) as f32;
        level * level * (3.0 - 2.0 * level)
    }
}

impl Default for Speed {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Speed {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = f64::from(sample_rate.max(1.0));
        self.clock.prepare(sample_rate);
        self.history
            .allocate((MEMORY_SECONDS * 2.0 * sample_rate) as usize);
        self.shifters = [
            PitchShifter::new(sample_rate, 1),
            PitchShifter::new(sample_rate, 1),
        ];
        self.fade_step = 1.0 / (RETURN_MS * 0.001 * sample_rate).max(1.0);
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            let (left, right) = (block.left[index], block.right[index]);
            self.history.push(left, right);
            self.advance_phase();
            let read = if self.phase == Phase::Idle {
                (left, right)
            } else if self.delay < 1.0 {
                self.history.read(1.0 + self.delay as f32)
            } else {
                self.history.read_smooth(1.0 + self.delay as f32)
            };
            let level = self.level();
            let mut out = [read.0 * level, read.1 * level];
            let stretching = self.stretching();
            let wanted = if stretching && self.phase != Phase::Idle {
                1.0
            } else {
                0.0
            };
            self.stretch += (wanted - self.stretch).clamp(-self.fade_step, self.fade_step);
            if stretching || self.stretch > 0.0 {
                if self.segment == 0 {
                    let ratio = (1.0 / self.speed.max(STRETCH_SLOWEST)) as f32;
                    for shifter in &mut self.shifters {
                        shifter.set_voice(0, ratio, 1.0);
                    }
                }
                for (channel, sample) in out.iter_mut().enumerate() {
                    let mut shifted = [0.0];
                    self.shifters[channel].push(*sample, &mut shifted);
                    *sample += (shifted[0] - *sample) * self.stretch;
                }
            }
            self.segment = (self.segment + 1) % SEGMENT;
            if let Phase::ToLive { progress } = self.phase {
                let x = progress as f32;
                out[0] += (left - out[0]) * x;
                out[1] += (right - out[1]) * x;
            }
            block.left[index] = out[0];
            block.right[index] = out[1];
            self.clock.advance();
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn set_transport(&mut self, transport: &Transport) {
        self.clock.sync(transport);
    }

    fn reset(&mut self) {
        self.history.clear();
        for shifter in &mut self.shifters {
            shifter.reset();
        }
        self.phase = Phase::Idle;
        self.speed = 1.0;
        self.delay = 0.0;
        self.stretch = 0.0;
        self.segment = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: f32 = 1000.0;

    fn run(speed: &mut Speed, frames: usize) -> Vec<f32> {
        let mut left: Vec<f32> = (0..frames).map(|frame| frame as f32).collect();
        let mut right = left.clone();
        speed.process(&mut StereoBlock::new(&mut left, &mut right));
        left
    }

    fn tape(target: f32, ret: f32) -> Speed {
        let mut speed = Speed::new();
        speed.prepare(RATE, 512);
        speed.set_param(TARGET, target);
        speed.set_param(RAMP_MS, 100.0);
        speed.set_param(RETURN, ret);
        speed.set_param(ACTIVE, 1.0);
        speed
    }

    #[test]
    fn it_slows_down_along_its_ramp_and_holds_the_target() {
        let mut speed = tape(0.5, 0.0);
        run(&mut speed, 200);
        // Held at half speed: the read lags by a half frame more at each frame.
        let before = speed.delay;
        run(&mut speed, 100);
        assert!((speed.delay - before - 50.0).abs() < 1.0);
        assert!((speed.speed - 0.5).abs() < 1e-9);
    }

    #[test]
    fn a_ramp_return_catches_up_then_plays_live() {
        let mut speed = tape(0.5, 0.0);
        run(&mut speed, 300);
        assert!(speed.delay > 50.0);
        speed.set_param(ACTIVE, 0.0);
        run(&mut speed, 20);
        assert!(speed.speed > 1.0);
        run(&mut speed, 2000);
        assert_eq!(speed.phase, Phase::Idle);
        assert_eq!(speed.delay, 0.0);
    }

    #[test]
    fn a_jump_return_is_live_after_its_crossfade() {
        let mut speed = tape(0.5, 1.0);
        run(&mut speed, 300);
        speed.set_param(ACTIVE, 0.0);
        let output = run(&mut speed, 100);
        assert_eq!(speed.phase, Phase::Idle);
        assert_eq!(output[99], 99.0);
    }

    #[test]
    fn a_stop_return_slows_to_silence_first() {
        let mut speed = tape(1.0, 2.0);
        run(&mut speed, 100);
        speed.set_param(ACTIVE, 0.0);
        run(&mut speed, 99);
        assert!(speed.speed < 0.1);
        assert!(speed.level() < 0.1);
    }

    #[test]
    fn a_live_signal_never_plays_ahead_of_itself() {
        let mut speed = tape(2.0, 0.0);
        let output = run(&mut speed, 300);
        assert_eq!(speed.delay, 0.0);
        assert!((output[299] - 299.0).abs() < 1e-3);
    }
}
