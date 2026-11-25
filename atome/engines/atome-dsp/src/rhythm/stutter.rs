// Stutter and ratchet: turned on, it takes the next slice of the sound (one
// beat division long, from the next division of the grid or at once), lets
// it through, then plays it again and again while it stays on. A ramp makes
// each repeat shorter (a ratchet rushing) or longer; each repeat can go up or
// down in pitch, lose level, play backwards, or sound only for part of its
// length. Turned off, the live sound comes back with a short crossfade.

use super::{DIVISIONS, EDGE_MS, MEMORY_SECONDS, RETURN_MS, SWITCH, division_beats, edge_gain};
use crate::transport::{BeatClock, Transport};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, db_to_amplitude};

pub const ACTIVE: u32 = 0;
pub const DIVISION: u32 = 1;
pub const REPEATS: u32 = 2;
pub const RAMP: u32 = 3;
pub const PITCH: u32 = 4;
pub const DECAY_DB: u32 = 5;
pub const REVERSE: u32 = 6;
pub const GATE: u32 = 7;
pub const START: u32 = 8;
pub const MIX: u32 = 9;
pub const PARAMS: [ParamSpec; 10] = [
    ParamSpec::choice(ACTIVE, "active", &SWITCH, 0),
    ParamSpec::choice(DIVISION, "division", &DIVISIONS, 4),
    // 0: as long as it stays on.
    ParamSpec::new(REPEATS, "repeats", 0.0, 64.0, 0.0, Unit::Count),
    // +1 halves each repeat (a ratchet rushing), −1 doubles it.
    ParamSpec::new(RAMP, "ramp", -1.0, 1.0, 0.0, Unit::Plain),
    // Semitones added at each repeat.
    ParamSpec::new(PITCH, "pitch", -12.0, 12.0, 0.0, Unit::Semitones),
    // Level lost at each repeat.
    ParamSpec::new(DECAY_DB, "decay_db", -24.0, 0.0, 0.0, Unit::Decibels),
    ParamSpec::choice(REVERSE, "reverse", &["off", "on", "alternate"], 0),
    // The part of each repeat that sounds.
    ParamSpec::new(GATE, "gate", 0.05, 1.0, 1.0, Unit::Percent),
    ParamSpec::choice(START, "start", &["grid", "now"], 0),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];

// The shortest repeat a ramp reaches.
const SHORTEST_FRAMES: f32 = 32.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Idle,
    // Waiting for the next division of the grid.
    Armed,
    Capturing,
    Repeating,
    // Its repeats played: the live sound until it is turned off and on again.
    Spent,
}

pub struct Stutter {
    values: [f32; 10],
    clock: BeatClock,
    slice: Vec<[f32; 2]>,
    slice_len: usize,
    captured: usize,
    phase: Phase,
    slot: i64,
    repeat: u32,
    repeat_len: f32,
    position: f32,
    rate: f32,
    gain: f32,
    reversed: bool,
    wet: f32,
    fade_step: f32,
    edge: f32,
    mix: Smoothed,
}

impl Stutter {
    pub fn new() -> Self {
        let mut stutter = Self {
            values: PARAMS.map(|spec| spec.default),
            clock: BeatClock::new(),
            slice: Vec::new(),
            slice_len: 0,
            captured: 0,
            phase: Phase::Idle,
            slot: 0,
            repeat: 0,
            repeat_len: 0.0,
            position: 0.0,
            rate: 1.0,
            gain: 1.0,
            reversed: false,
            wet: 0.0,
            fade_step: 1.0,
            edge: 0.0,
            mix: Smoothed::new(PARAMS[MIX as usize].default, 21.0),
        };
        stutter.prepare(48000.0, 0);
        stutter
    }

    fn value(&self, id: u32) -> f32 {
        self.values[id as usize]
    }

    fn division(&self) -> f64 {
        division_beats(PARAMS[DIVISION as usize].index(self.value(DIVISION)))
    }

    fn slot_now(&self) -> i64 {
        (self.clock.beat() / self.division()).floor() as i64
    }

    fn start_capture(&mut self) {
        let frames = self.clock.frames_of(self.division()).round() as usize;
        self.slice_len = frames.clamp(SHORTEST_FRAMES as usize, self.slice.len().max(1));
        self.captured = 0;
        self.phase = Phase::Capturing;
    }

    fn begin_repeat(&mut self) {
        let limit = self.value(REPEATS).round() as u32;
        if limit > 0 && self.repeat > limit {
            self.phase = Phase::Spent;
            return;
        }
        let n = self.repeat as f32;
        let factor = (-self.value(RAMP) * n).exp2();
        self.repeat_len =
            (self.slice_len as f32 * factor).clamp(SHORTEST_FRAMES, self.slice.len().max(1) as f32);
        self.rate = (self.value(PITCH) * n / 12.0).exp2();
        self.gain = db_to_amplitude(self.value(DECAY_DB) * n);
        self.reversed = match PARAMS[REVERSE as usize].index(self.value(REVERSE)) {
            1 => true,
            2 => self.repeat % 2 == 1,
            _ => false,
        };
        self.position = 0.0;
    }

    // The repeat's sample at its current position.
    fn repeated(&self) -> (f32, f32) {
        let sounding = self.repeat_len * self.value(GATE);
        if self.position >= sounding {
            return (0.0, 0.0);
        }
        let source = self.repeat_len.min(self.slice_len as f32).max(1.0);
        let mut at = (self.position * self.rate) % source;
        if self.reversed {
            at = (source - 1.0 - at).max(0.0);
        }
        let whole = at.floor() as usize;
        let fraction = at - whole as f32;
        let next = (whole + 1) % source as usize;
        let [l0, r0] = self.slice[whole.min(self.slice_len - 1)];
        let [l1, r1] = self.slice[next.min(self.slice_len - 1)];
        let gain = self.gain * edge_gain(self.position, sounding, self.edge);
        (
            (l0 + (l1 - l0) * fraction) * gain,
            (r0 + (r1 - r0) * fraction) * gain,
        )
    }

    fn step(&mut self, left: f32, right: f32) -> (f32, f32) {
        let active = self.value(ACTIVE) >= 0.5;
        if !active {
            self.phase = Phase::Idle;
        } else if self.phase == Phase::Idle {
            if PARAMS[START as usize].index(self.value(START)) == 0 {
                self.phase = Phase::Armed;
                self.slot = self.slot_now();
            } else {
                self.start_capture();
            }
        }
        if self.phase == Phase::Armed && self.slot_now() != self.slot {
            self.start_capture();
        }
        let wet = match self.phase {
            Phase::Capturing => {
                self.slice[self.captured] = [left, right];
                self.captured += 1;
                if self.captured >= self.slice_len {
                    self.phase = Phase::Repeating;
                    self.repeat = 1;
                    self.begin_repeat();
                }
                (left, right)
            }
            Phase::Repeating => {
                let sample = self.repeated();
                self.position += 1.0;
                if self.position >= self.repeat_len {
                    self.repeat += 1;
                    self.begin_repeat();
                }
                sample
            }
            _ => (left, right),
        };
        let target = if matches!(self.phase, Phase::Capturing | Phase::Repeating) {
            1.0
        } else {
            0.0
        };
        self.wet += (target - self.wet).clamp(-self.fade_step, self.fade_step);
        let amount = self.wet * self.mix.tick();
        (
            left + (wet.0 - left) * amount,
            right + (wet.1 - right) * amount,
        )
    }
}

impl Default for Stutter {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Stutter {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.clock.prepare(sample_rate);
        self.slice = vec![[0.0; 2]; (MEMORY_SECONDS * sample_rate) as usize];
        self.fade_step = 1.0 / (RETURN_MS * 0.001 * sample_rate).max(1.0);
        self.edge = EDGE_MS * 0.001 * sample_rate;
        self.mix.prepare(sample_rate);
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            let (left, right) = self.step(block.left[index], block.right[index]);
            block.left[index] = left;
            block.right[index] = right;
            self.clock.advance();
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        self.values[id as usize] = spec.clamp(value);
        if id == MIX {
            self.mix.set(self.values[id as usize]);
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn set_transport(&mut self, transport: &Transport) {
        self.clock.sync(transport);
    }

    fn reset(&mut self) {
        self.phase = Phase::Idle;
        self.wet = 0.0;
        self.captured = 0;
        self.mix.settle();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: f32 = 1000.0;

    fn run(stutter: &mut Stutter, input: &[f32]) -> Vec<f32> {
        let mut left = input.to_vec();
        let mut right = input.to_vec();
        stutter.process(&mut StereoBlock::new(&mut left, &mut right));
        left
    }

    fn ramp_signal(frames: usize) -> Vec<f32> {
        (0..frames)
            .map(|frame| frame as f32 / frames as f32)
            .collect()
    }

    #[test]
    fn it_repeats_the_slice_it_took_while_on() {
        let mut stutter = Stutter::new();
        stutter.prepare(RATE, 512);
        // 1/4 at 120 bpm: 500 frames at 1 kHz, taken at once.
        stutter.set_param(DIVISION, 2.0);
        stutter.set_param(START, 1.0);
        stutter.set_param(ACTIVE, 1.0);
        let input = ramp_signal(1500);
        let output = run(&mut stutter, &input);
        // The slice passes, then comes back twice: frame 250 of each repeat is frame 250 of the slice.
        assert!((output[250] - input[250]).abs() < 1e-6);
        assert!((output[750] - input[250]).abs() < 1e-3);
        assert!((output[1250] - input[250]).abs() < 1e-3);
    }

    #[test]
    fn it_waits_for_the_next_division_of_the_grid() {
        let mut stutter = Stutter::new();
        stutter.prepare(RATE, 512);
        stutter.set_param(DIVISION, 2.0);
        stutter.set_transport(&Transport {
            playing: true,
            beat: 0.5,
            beats_per_second: 2.0,
        });
        stutter.set_param(ACTIVE, 1.0);
        let input = ramp_signal(1250);
        let output = run(&mut stutter, &input);
        // The grid's next beat is 250 frames away: the slice runs 250..750, its first repeat 750..1250.
        assert!((output[100] - input[100]).abs() < 1e-6);
        assert!((output[1000] - input[500]).abs() < 1e-3);
    }

    #[test]
    fn a_ramp_rushes_the_repeats_and_off_gives_the_live_sound_back() {
        let mut stutter = Stutter::new();
        stutter.prepare(RATE, 512);
        stutter.set_param(DIVISION, 2.0);
        stutter.set_param(START, 1.0);
        stutter.set_param(RAMP, 1.0);
        stutter.set_param(ACTIVE, 1.0);
        let input = ramp_signal(1000);
        let output = run(&mut stutter, &input);
        // The first repeat is half the slice (250 frames), the second a quarter.
        assert!((output[500 + 100] - input[100]).abs() < 1e-3);
        assert!((output[750 + 100] - input[100]).abs() < 1e-3);
        stutter.set_param(ACTIVE, 0.0);
        let tail = run(&mut stutter, &[0.5; 100]);
        assert!((tail[99] - 0.5).abs() < 1e-6);
    }
}
