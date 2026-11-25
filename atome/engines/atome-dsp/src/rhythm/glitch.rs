// Chaos: turned on, each slice of the beat grid may be thrown about — the
// slice before repeated in pieces, played backwards, cut, an octave up or
// down, or a slice further back played again in its place. Which slices and
// how is drawn from the seed and the slice's place in the song (rhythm::draw):
// the same song sounds the same on every playback and in every export; another
// seed draws another chaos. `density` says how many slices are touched, the
// five weights how often each throw comes.

use super::{
    DIVISIONS, EDGE_MS, History, MEMORY_SECONDS, RETURN_MS, SWITCH, division_beats, draw, edge_gain,
};
use crate::transport::{BeatClock, Transport};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const ACTIVE: u32 = 0;
pub const DIVISION: u32 = 1;
pub const DENSITY: u32 = 2;
pub const SEED: u32 = 3;
pub const REPEAT: u32 = 4;
pub const REVERSE: u32 = 5;
pub const CUT: u32 = 6;
pub const OCTAVE: u32 = 7;
pub const JUMP: u32 = 8;
pub const MIX: u32 = 9;
pub const PARAMS: [ParamSpec; 10] = [
    ParamSpec::choice(ACTIVE, "active", &SWITCH, 0),
    ParamSpec::choice(DIVISION, "division", &DIVISIONS, 4),
    ParamSpec::new(DENSITY, "density", 0.0, 1.0, 0.34, Unit::Percent),
    ParamSpec::new(SEED, "seed", 0.0, 999.0, 1.0, Unit::Count),
    ParamSpec::new(REPEAT, "repeat", 0.0, 1.0, 0.34, Unit::Percent),
    ParamSpec::new(REVERSE, "reverse", 0.0, 1.0, 0.21, Unit::Percent),
    ParamSpec::new(CUT, "cut", 0.0, 1.0, 0.21, Unit::Percent),
    ParamSpec::new(OCTAVE, "octave", 0.0, 1.0, 0.13, Unit::Percent),
    ParamSpec::new(JUMP, "jump", 0.0, 1.0, 0.13, Unit::Percent),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];

// How far back a jump reaches, in slices.
const LONGEST_JUMP: u32 = 4;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Throw {
    Pass,
    // The slice before, its first 1/n played n times.
    Repeat(u32),
    Reverse,
    Cut,
    OctaveUp,
    OctaveDown,
    // The slice `n` slices back.
    Jump(u32),
}

pub struct Glitch {
    values: [f32; 10],
    clock: BeatClock,
    history: History,
    slot: Option<i64>,
    throw: Throw,
    slice_frames: f32,
    on: f32,
    fade_step: f32,
    edge: f32,
    mix: Smoothed,
}

impl Glitch {
    pub fn new() -> Self {
        let mut glitch = Self {
            values: PARAMS.map(|spec| spec.default),
            clock: BeatClock::new(),
            history: History::new(),
            slot: None,
            throw: Throw::Pass,
            slice_frames: 1.0,
            on: 0.0,
            fade_step: 1.0,
            edge: 0.0,
            mix: Smoothed::new(PARAMS[MIX as usize].default, 21.0),
        };
        glitch.prepare(48000.0, 0);
        glitch
    }

    fn value(&self, id: u32) -> f32 {
        self.values[id as usize]
    }

    // The throw of slice `slot`, the same for the same seed and slot.
    fn throw_of(&self, slot: i64) -> Throw {
        let seed = self.value(SEED).round() as u64;
        if draw(seed, slot, 0) >= f64::from(self.value(DENSITY)) {
            return Throw::Pass;
        }
        let weights = [REPEAT, REVERSE, CUT, OCTAVE, JUMP].map(|id| f64::from(self.value(id)));
        let total: f64 = weights.iter().sum();
        if total <= 0.0 {
            return Throw::Pass;
        }
        let mut pick = draw(seed, slot, 1) * total;
        let variant = draw(seed, slot, 2);
        for (index, weight) in weights.iter().enumerate() {
            if pick < *weight {
                return match index {
                    0 => Throw::Repeat(if variant < 0.5 { 2 } else { 4 }),
                    1 => Throw::Reverse,
                    2 => Throw::Cut,
                    3 if variant < 0.5 => Throw::OctaveUp,
                    3 => Throw::OctaveDown,
                    _ => Throw::Jump(1 + (variant * f64::from(LONGEST_JUMP)) as u32 % LONGEST_JUMP),
                };
            }
            pick -= weight;
        }
        Throw::Pass
    }

    // How many frames back the throw reads at `t` frames into a slice of `length`
    // (1: the frame just pushed); none for a cut.
    fn delay_of(&self, t: f32, length: f32) -> Option<f32> {
        let from_before = |j: f32| Some(1.0 + t + length - j);
        match self.throw {
            Throw::Pass => Some(1.0),
            Throw::Repeat(n) => from_before(t % (length / n as f32)),
            Throw::Reverse => from_before((length - 1.0 - t).max(0.0)),
            Throw::Cut => None,
            Throw::OctaveUp => from_before((2.0 * t) % length),
            Throw::OctaveDown => from_before(t * 0.5),
            Throw::Jump(n) => Some(1.0 + n as f32 * length),
        }
    }
}

impl Default for Glitch {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Glitch {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.clock.prepare(sample_rate);
        self.history
            .allocate((MEMORY_SECONDS * sample_rate) as usize);
        self.fade_step = 1.0 / (RETURN_MS * 0.001 * sample_rate).max(1.0);
        self.edge = EDGE_MS * 0.001 * sample_rate;
        self.mix.prepare(sample_rate);
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let division = division_beats(PARAMS[DIVISION as usize].index(self.value(DIVISION)));
        // A jump reads LONGEST_JUMP slices back: the slice fits the memory that many times.
        let longest = self.history.capacity() as f32 / (LONGEST_JUMP + 2) as f32;
        for index in 0..block.frames() {
            let (left, right) = (block.left[index], block.right[index]);
            self.history.push(left, right);
            let slices = self.clock.beat() / division;
            let slot = slices.floor() as i64;
            if self.slot != Some(slot) {
                self.slot = Some(slot);
                self.throw = self.throw_of(slot);
                self.slice_frames = (self.clock.frames_of(division) as f32).clamp(2.0, longest);
            }
            let length = self.slice_frames;
            let t = ((slices - slot as f64) as f32 * length).min(length - 1.0);
            let target = if self.value(ACTIVE) >= 0.5 { 1.0 } else { 0.0 };
            self.on += (target - self.on).clamp(-self.fade_step, self.fade_step);
            let mix = self.mix.tick();
            let amount = if self.throw == Throw::Pass {
                0.0
            } else {
                self.on * mix * edge_gain(t, length, self.edge)
            };
            if amount > 0.0 {
                let (wet_left, wet_right) = self
                    .delay_of(t, length)
                    .map_or((0.0, 0.0), |delay| self.history.read(delay));
                block.left[index] = left + (wet_left - left) * amount;
                block.right[index] = right + (wet_right - right) * amount;
            }
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
        // A new seed, density or weight draws the slice under way again.
        self.slot = None;
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn set_transport(&mut self, transport: &Transport) {
        self.clock.sync(transport);
    }

    fn reset(&mut self) {
        self.history.clear();
        self.slot = None;
        self.on = 0.0;
        self.mix.settle();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(seed: f32, start_beat: f64, frames: usize) -> Vec<f32> {
        let mut glitch = Glitch::new();
        glitch.prepare(1000.0, 512);
        glitch.set_param(SEED, seed);
        glitch.set_param(DENSITY, 1.0);
        glitch.set_param(ACTIVE, 1.0);
        glitch.set_transport(&Transport {
            playing: true,
            beat: start_beat,
            beats_per_second: 2.0,
        });
        let mut left: Vec<f32> = (0..frames)
            .map(|frame| (frame as f32 * 0.37).sin())
            .collect();
        let mut right = left.clone();
        glitch.process(&mut StereoBlock::new(&mut left, &mut right));
        left
    }

    #[test]
    fn the_same_seed_throws_the_same_chaos() {
        assert_eq!(render(3.0, 0.0, 2000), render(3.0, 0.0, 2000));
        assert_ne!(render(3.0, 0.0, 2000), render(4.0, 0.0, 2000));
    }

    #[test]
    fn a_throw_depends_on_the_slice_not_on_where_playback_began() {
        let mut glitch = Glitch::new();
        glitch.set_param(DENSITY, 1.0);
        glitch.set_param(SEED, 9.0);
        let early = glitch.throw_of(12);
        glitch.set_param(DENSITY, 1.0);
        assert_eq!(early, glitch.throw_of(12));
        glitch.set_param(DENSITY, 0.0);
        assert_eq!(glitch.throw_of(12), Throw::Pass);
    }
}
