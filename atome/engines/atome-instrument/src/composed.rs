// The composed note (cahier sampler §7.3, plan synthé §11): a zone may play,
// instead of its takes, a note made of steps (Attack, Body, Release… as many as
// wanted). Each step is a list of segments and a draw rule; transitions
// (trigger → follow action + crossfade) lead from step to step. The follow
// vocabulary is the Timeline cells' (kernel/sample_follow_actions.js extends
// scene_schema.js#FOLLOW_ACTIONS), run here inside the voice, at the frame.
//
// Follow actions: next / previous step, stop (cut now), repeat (the same
// segment from its start), target (a named step), random (a step drawn by the
// seed), jump to a marker of the current segment (a jump: crossed markers do
// not fire), draw (the same step drawn again), note-off (as if the key were
// let go), fade (the note fades out over the transition's fade).

use crate::keymap::xorshift;
use crate::markers::MarkerTable;
use crate::segment::Segment;
use crate::zone::{midi_velocity, Zone};

pub const MAX_FADE_MS: f32 = 10_000.0;
pub const MAX_DURATION_MS: f32 = 600_000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepDraw {
    // The step's single segment.
    One,
    Cycle,
    Random,
    RandomNoRepeat,
    // The segments share the velocities 1..127 equally, softest first.
    Velocity,
    // The segment whose root lies nearest the note (the first on a tie).
    Note,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Step {
    pub segments: Vec<Segment>,
    pub draw: StepDraw,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Trigger {
    SegmentEnd,
    // A marker of this label crossed (and let fire by its « When »).
    Marker(u16),
    // The current segment's loop has run this many passes.
    Passes(u32),
    NoteOff,
    // A new note tied over this one (legato mode).
    Legato,
    // On entering the step: the note's MIDI velocity is at least this.
    Velocity(u8),
    // On entering the step or when the controller moves: its value (0..1) is at least `above`.
    Controller { number: u8, above: f32 },
    // Time spent in the step.
    Duration { ms: f32 },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Follow {
    Next,
    Previous,
    Stop,
    Repeat,
    Target(usize),
    Random,
    JumpMarker(u16),
    Draw,
    NoteOff,
    Fade,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Transition {
    // The step it leaves; None: any step.
    pub from: Option<usize>,
    pub trigger: Trigger,
    pub follow: Follow,
    // Equal-power crossfade between the two segments (two players in the voice).
    pub fade_ms: f32,
}

impl Transition {
    pub fn leaves(&self, step: usize) -> bool {
        self.from.is_none_or(|from| from == step)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Composed {
    pub steps: Vec<Step>,
    pub transitions: Vec<Transition>,
}

impl Composed {
    pub fn segments(&self) -> impl Iterator<Item = &Segment> {
        self.steps.iter().flat_map(|step| step.segments.iter())
    }

    // The steps a transition may leave.
    fn sources<'a>(&'a self, transition: &'a Transition) -> impl Iterator<Item = &'a Step> + 'a {
        self.steps.iter().enumerate().filter(move |(index, _)| transition.leaves(*index)).map(|(_, step)| step)
    }

    pub fn validate(&self, markers: &MarkerTable) -> Result<(), String> {
        if self.steps.is_empty() {
            return Err("a composed note has one step at least".into());
        }
        for (index, step) in self.steps.iter().enumerate() {
            if step.segments.is_empty() {
                return Err(format!("step {index} has no segment"));
            }
            if step.draw == StepDraw::One && step.segments.len() != 1 {
                return Err(format!("step {index} draws « one »: it holds a single segment"));
            }
        }
        let first = self.steps[0].segments[0].stretch;
        if self.segments().any(|segment| segment.stretch != first) {
            return Err("the segments of a composed note share one stretch (one stretcher per voice)".into());
        }
        let carries = |segment: &Segment, label: u16| markers.span(segment.markers).iter().any(|marker| marker.label == label);
        for (index, transition) in self.transitions.iter().enumerate() {
            let at = format!("transition {index}");
            let count = self.steps.len();
            if transition.from.is_some_and(|from| from >= count) || matches!(transition.follow, Follow::Target(target) if target >= count) {
                return Err(format!("{at} names a step the note does not have"));
            }
            if !(0.0..=MAX_FADE_MS).contains(&transition.fade_ms) {
                return Err(format!("{at}: fade_ms outside 0..{MAX_FADE_MS}"));
            }
            match transition.trigger {
                Trigger::Passes(0) => return Err(format!("{at}: passes count from 1")),
                Trigger::Velocity(above) if !(1..=127).contains(&above) => return Err(format!("{at}: velocity threshold outside 1..127")),
                Trigger::Controller { number, above } if number > 127 || !(0.0..=1.0).contains(&above) => {
                    return Err(format!("{at}: controller 0..127 above 0..1"));
                }
                Trigger::Duration { ms } if !(ms > 0.0 && ms <= MAX_DURATION_MS) => return Err(format!("{at}: duration outside 0..{MAX_DURATION_MS} ms")),
                Trigger::Marker(label) if !self.sources(transition).any(|step| step.segments.iter().any(|segment| carries(segment, label))) => {
                    return Err(format!("{at}: no segment of its steps carries that marker"));
                }
                _ => {}
            }
            if let Follow::JumpMarker(label) = transition.follow {
                if !self.sources(transition).all(|step| step.segments.iter().all(|segment| carries(segment, label))) {
                    return Err(format!("{at}: every segment of its steps must carry the marker it jumps to"));
                }
            }
        }
        Ok(())
    }
}

// The draw state of every step of every composed zone (round-robin counters,
// the last drawn, a seeded random), sized when the keymap is built: the same
// seed replays the same draws.
pub struct StepDraws {
    base: Vec<usize>,
    counters: Vec<usize>,
    last: Vec<usize>,
    random: u64,
}

impl StepDraws {
    pub fn new(zones: &[Zone], seed: u64) -> Self {
        let mut base = Vec::with_capacity(zones.len());
        let mut total = 0;
        for zone in zones {
            base.push(total);
            total += zone.composed.as_ref().map_or(0, |composed| composed.steps.len());
        }
        // A stream apart from the takes' round-robin, so adding a composed zone keeps their draws.
        Self { base, counters: vec![0; total], last: vec![usize::MAX; total], random: (seed ^ 0x9E37_79B9_7F4A_7C15).max(1) }
    }

    // The segment of step `step` of `zone` (index `zone_index`) this note plays.
    pub fn draw(&mut self, zone_index: usize, zone: &Zone, step: usize, note: u8, velocity: f32) -> usize {
        let segments = &zone.composed.as_ref().expect("a composed zone").steps[step];
        let count = segments.segments.len();
        let slot = self.base[zone_index] + step;
        let index = match segments.draw {
            StepDraw::One => 0,
            StepDraw::Cycle => {
                let index = self.counters[slot] % count;
                self.counters[slot] += 1;
                index
            }
            StepDraw::Random => self.below(count),
            StepDraw::RandomNoRepeat if count > 1 => {
                let mut index = self.below(count - 1);
                if index >= self.last[slot] {
                    index += 1;
                }
                index
            }
            StepDraw::RandomNoRepeat => 0,
            StepDraw::Velocity => ((midi_velocity(velocity) as usize - 1) * count / 127).min(count - 1),
            StepDraw::Note => (0..count).min_by_key(|&index| (segments.segments[index].root as i32 - note as i32).abs()).unwrap_or(0),
        };
        self.last[slot] = index;
        index
    }

    // A seeded draw in 0..count (a step drawn by a « random » follow action).
    pub fn below(&mut self, count: usize) -> usize {
        (xorshift(&mut self.random) % count.max(1) as u64) as usize
    }
}
