// A zone covers a range of keys and of velocities and holds its takes (the
// sounds dropped on it). How the takes stack is the zone's « Pile »: they take
// turns (round-robin, drawn by a rule), they play together at their own levels
// (mix), or they share the zone's velocity range (layers, crossfaded at each
// seam). A zone cuts the zones it ticks (choke, one way; two ticks = a group).
// A zone may play a composed note instead of takes (composed.rs). A zone
// plays on one of the instrument's outputs (D-S2: a drum kit's parts, each
// routable to its own strip); output 0 unless it says another.
// Read from banks (SFZ): a one-shot zone plays its take to the end whatever the
// key does; a zone with a switch sounds only while that keyswitch is the last
// one pressed (keymap.rs); a zone's filter colours each of its voices.

use crate::composed::Composed;
use crate::segment::Segment;
use atome_dsp::biquad::Shape;

pub const MAX_PLAYERS: usize = 4;
// Stereo outputs an instrument may expose (one per MIDI channel of a multitimbral one).
pub const MAX_OUTPUTS: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Draw {
    Cycle,
    Random,
    RandomNoRepeat,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Stack {
    Alternate(Draw),
    // One level per take, 0..1.
    Mix(Vec<f32>),
    // Seam width in MIDI velocity steps, shared equally by both sides of a seam.
    Layers { crossfade: u8 },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Zone {
    pub key_low: u8,
    pub key_high: u8,
    pub velocity_low: u8,
    pub velocity_high: u8,
    pub gain_db: f32,
    pub takes: Vec<Segment>,
    pub stack: Stack,
    // Zones this one silences when it starts (indices in the keymap).
    pub cuts: Vec<usize>,
    // Played at the key's release (a damper, a fret noise), quieter the longer
    // the key was held: level = exp(-held / release_decay_s).
    pub release_takes: Vec<Segment>,
    pub release_decay_s: f32,
    // Round-robin with few takes: the neighbour zones' takes, transposed, join the draw.
    pub borrow_neighbours: bool,
    // Steps and transitions played instead of the takes (then empty).
    pub composed: Option<Composed>,
    // The instrument output its voices sound on (0..MAX_OUTPUTS).
    pub output: u8,
    // The key let go does not stop it: its takes play to their end.
    pub one_shot: bool,
    // The keyswitch (a key of the keymap's switch range) this zone answers to.
    pub switch: Option<u8>,
    pub filter: Option<ZoneFilter>,
}

// A voice filter, fixed for the note: its cutoff follows the key (cents per key
// from `key_center`) and the velocity (cents at full velocity).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ZoneFilter {
    pub shape: Shape,
    pub cutoff_hz: f32,
    pub q: f32,
    pub key_track_cents: f32,
    pub key_center: u8,
    pub velocity_track_cents: f32,
}

impl ZoneFilter {
    pub fn cutoff_for(&self, note: u8, velocity: f32) -> f32 {
        let cents = self.key_track_cents * (note as f32 - self.key_center as f32) + self.velocity_track_cents * velocity.clamp(0.0, 1.0);
        self.cutoff_hz * 2f32.powf(cents / 1200.0)
    }
}

impl Zone {
    pub fn new(key_low: u8, key_high: u8, takes: Vec<Segment>) -> Self {
        Self {
            key_low,
            key_high,
            velocity_low: 0,
            velocity_high: 127,
            gain_db: 0.0,
            takes,
            stack: Stack::Alternate(Draw::Cycle),
            cuts: Vec::new(),
            release_takes: Vec::new(),
            release_decay_s: 1.0,
            borrow_neighbours: false,
            composed: None,
            output: 0,
            one_shot: false,
            switch: None,
            filter: None,
        }
    }

    // A zone that plays a composed note.
    pub fn composed(key_low: u8, key_high: u8, composed: Composed) -> Self {
        Self { composed: Some(composed), ..Self::new(key_low, key_high, Vec::new()) }
    }

    // Every segment the zone may read: its takes, its release takes, its steps'.
    pub fn segments(&self) -> impl Iterator<Item = &Segment> {
        self.takes.iter().chain(self.release_takes.iter()).chain(self.composed.iter().flat_map(Composed::segments))
    }

    pub fn velocities(mut self, low: u8, high: u8) -> Self {
        self.velocity_low = low;
        self.velocity_high = high;
        self
    }

    pub fn output(mut self, output: u8) -> Self {
        self.output = output;
        self
    }

    pub fn stack(mut self, stack: Stack) -> Self {
        self.stack = stack;
        self
    }

    pub fn contains(&self, note: u8, velocity: u8) -> bool {
        (self.key_low..=self.key_high).contains(&note) && (self.velocity_low..=self.velocity_high).contains(&velocity)
    }
}

// MIDI velocity (1..127) of a normalized one.
pub fn midi_velocity(velocity: f32) -> u8 {
    (velocity.clamp(0.0, 1.0) * 127.0).round().max(1.0) as u8
}
