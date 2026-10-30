// The sampler: a generator `Processor` whose input is notes. Events scheduled
// for the next block are applied at their frame (the block is split there);
// every voice, player and buffer exists before the first block.
//
// Priming a stretched voice costs 0.3–0.6 ms of an M1 core (its window is fed
// and its latency rendered at the note), so a block primes at most one per
// millisecond it lasts: the events from the first one over that budget move, in
// order, to the start of the next block. At 256 frames and 48 kHz a 16-note
// stretched chord spreads over four blocks (16 ms) instead of overrunning one.
//
// A multitimbral instrument has several stereo outputs (D-S2): each zone sounds
// on its own, side by side in one planar buffer (`process_outputs`); played as
// a plain `Processor`, every output is summed into the one block.
//
// Markers that name a command are reported to `actions` (action_queue.rs),
// which the host drains off the audio thread; `generation` names the build
// that reported them (the host's marker table of that build).

use crate::action_queue::ActionQueue;
use crate::event::{EventKind, EventList, NoteEvent};
use crate::interp::SincTables;
use crate::keymap::Keymap;
use crate::pool::VoicePool;
use crate::sample::SampleBank;
use crate::voice::Shape;
use crate::zone::MAX_PLAYERS;
use atome_dsp::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use std::sync::Arc;

pub const GAIN_DB: u32 = 0;
pub const ATTACK_MS: u32 = 1;
pub const DECAY_MS: u32 = 2;
pub const SUSTAIN: u32 = 3;
pub const RELEASE_MS: u32 = 4;
pub const VELOCITY_SENSE: u32 = 5;
pub const TUNE_CENTS: u32 = 6;
pub const GLIDE_MS: u32 = 7;
pub const POLYPHONY: u32 = 8;
pub const MODE: u32 = 9;
pub const BEND_RANGE: u32 = 10;
pub const PARAMS: [ParamSpec; 11] = [
    ParamSpec::new(GAIN_DB, "gain_db", -60.0, 12.0, 0.0, Unit::Decibels),
    ParamSpec::new(ATTACK_MS, "attack_ms", 0.1, 10000.0, 1.0, Unit::Milliseconds),
    ParamSpec::new(DECAY_MS, "decay_ms", 1.0, 10000.0, 144.0, Unit::Milliseconds),
    ParamSpec::new(SUSTAIN, "sustain", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::new(RELEASE_MS, "release_ms", 1.0, 20000.0, 89.0, Unit::Milliseconds),
    ParamSpec::new(VELOCITY_SENSE, "velocity_sense", 0.0, 1.0, 0.89, Unit::Percent),
    ParamSpec::new(TUNE_CENTS, "tune_cents", -1200.0, 1200.0, 0.0, Unit::Plain),
    ParamSpec::new(GLIDE_MS, "glide_ms", 0.0, 5000.0, 55.0, Unit::Milliseconds),
    ParamSpec::new(POLYPHONY, "polyphony", 1.0, 128.0, 21.0, Unit::Plain),
    ParamSpec::new(MODE, "mode", 0.0, 2.0, 0.0, Unit::Plain),
    ParamSpec::new(BEND_RANGE, "bend_range", 0.0, 48.0, 2.0, Unit::Plain),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoiceMode {
    Poly,
    // One note at a time, each new note restarts the sound.
    Mono,
    // One note at a time, a new note held over the last glides without restarting.
    Legato,
}

const HELD_NOTES: usize = 16;

// Stretched voices a block of `frames` may prime: one per millisecond, at least one.
pub fn priming_budget(sample_rate: f32, frames: usize) -> usize {
    ((frames as f32 / (sample_rate * 0.001)) as usize).max(1)
}
const EVENT_CAPACITY: usize = 512;

// The outputs rendered: bus `b` is samples [b * frames, (b + 1) * frames) of each side.
struct Buses<'a> {
    left: &'a mut [f32],
    right: &'a mut [f32],
    frames: usize,
}

impl Buses<'_> {
    fn count(&self) -> usize {
        self.left.len() / self.frames.max(1)
    }
}
const ACTION_CAPACITY: usize = 256;

// What a voice reads and reports to; a macro so the voices can be borrowed beside it.
macro_rules! context {
    ($sampler:ident) => {
        $crate::voice::Context { bank: &$sampler.bank, tables: &$sampler.tables, keymap: &mut $sampler.keymap, actions: &$sampler.actions,
            generation: $sampler.generation, controllers: &$sampler.controllers, now: $sampler.now }
    };
}

// What a note on or off does to the voices (poly, mono, legato; cuts; release takes).
mod notes;

pub struct Sampler {
    keymap: Keymap,
    bank: SampleBank,
    tables: SincTables,
    pool: VoicePool,
    events: EventList,
    // Events moved past the priming budget, applied at the next block's start.
    carried: EventList,
    carrying: EventList,
    primes: usize,
    values: [f32; PARAMS.len()],
    gain: Smoothed,
    sample_rate: f32,
    scratch_left: Vec<f32>,
    scratch_right: Vec<f32>,
    now: u64,
    triggers: u64,
    bend: f32,
    sustain_down: bool,
    held: [u8; HELD_NOTES],
    held_count: usize,
    held_velocity: f32,
    // The last keyswitch pressed (the keymap's default before any).
    switch: u8,
    controllers: [f32; 128],
    actions: Arc<ActionQueue>,
    generation: u16,
}

impl Sampler {
    // Built off the audio thread; `voices` bounds polyphony plus the voices fading out.
    // A bank with streamed samples is resided against `keymap` first (residency.rs):
    // each voice's players get their rings here.
    pub fn new(keymap: Keymap, mut bank: SampleBank, voices: usize) -> Self {
        bank.prepare_streams(voices.max(2) * MAX_PLAYERS);
        Self {
            switch: keymap.switches().map_or(0, |switches| switches.default),
            keymap,
            bank,
            tables: SincTables::new(),
            pool: VoicePool::new(voices.max(2)),
            events: EventList::with_capacity(EVENT_CAPACITY),
            carried: EventList::with_capacity(EVENT_CAPACITY),
            carrying: EventList::with_capacity(EVENT_CAPACITY),
            primes: 0,
            values: PARAMS.map(|spec| spec.default),
            gain: Smoothed::new(1.0, 21.0),
            sample_rate: 48_000.0,
            scratch_left: Vec::new(),
            scratch_right: Vec::new(),
            now: 0,
            triggers: 0,
            bend: 0.0,
            sustain_down: false,
            held: [0; HELD_NOTES],
            held_count: 0,
            held_velocity: 1.0,
            controllers: [0.0; 128],
            actions: Arc::new(ActionQueue::new(ACTION_CAPACITY)),
            generation: 0,
        }
    }

    // Fired command markers go to `queue`, marked with `generation` (a host
    // keeps one queue across the builds of an instrument).
    pub fn report_actions(&mut self, queue: Arc<ActionQueue>, generation: u16) {
        self.actions = queue;
        self.generation = generation;
    }

    pub fn actions(&self) -> &Arc<ActionQueue> {
        &self.actions
    }

    // Its rings, when a sample streams: the host has them filled (stream::serve).
    pub fn streams(&self) -> Option<&Arc<crate::stream::Streams>> {
        self.bank.streams()
    }

    // Queues an event for the next `process`, at `offset` frames into that block.
    pub fn schedule(&mut self, event: NoteEvent) {
        self.events.push(event);
    }

    pub fn dropped_events(&self) -> usize {
        self.events.dropped() + self.carried.dropped()
    }

    // Events waiting for the next block because this one spent its priming budget.
    pub fn carried_events(&self) -> usize {
        self.carried.as_slice().len()
    }

    pub fn sounding_voices(&self) -> usize {
        self.pool.sounding()
    }

    pub fn keymap(&self) -> &Keymap {
        &self.keymap
    }

    pub fn pool(&self) -> &VoicePool {
        &self.pool
    }

    pub fn mode(&self) -> VoiceMode {
        match self.values[MODE as usize].round() as u32 {
            1 => VoiceMode::Mono,
            2 => VoiceMode::Legato,
            _ => VoiceMode::Poly,
        }
    }

    fn shape(&self) -> Shape {
        let value = |id: u32| self.values[id as usize];
        Shape { attack_ms: value(ATTACK_MS), decay_ms: value(DECAY_MS), sustain: value(SUSTAIN), release_ms: value(RELEASE_MS), glide_ms: value(GLIDE_MS) }
    }

    fn velocity_level(&self, velocity: f32) -> f32 {
        let sense = self.values[VELOCITY_SENSE as usize];
        1.0 - sense * (1.0 - velocity * velocity)
    }

    fn apply(&mut self, kind: EventKind) {
        match kind {
            EventKind::NoteOn { note, velocity } => self.note_on(note, velocity),
            EventKind::NoteOff { note } => self.note_off(note),
            EventKind::Sustain { down } => {
                self.sustain_down = down;
                if !down {
                    for voice in self.pool.voices_mut().iter_mut().filter(|voice| voice.active && voice.sustained) {
                        voice.release();
                    }
                }
            }
            EventKind::PitchBend { semitones } => self.bend = semitones.clamp(-1.0, 1.0) * self.values[BEND_RANGE as usize],
            EventKind::Controller { number, value } => {
                self.controllers[number as usize & 127] = value.clamp(0.0, 1.0);
                for voice in self.pool.voices_mut().iter_mut().filter(|voice| voice.active) {
                    voice.controller_moved();
                }
            }
            EventKind::AllNotesOff => {
                self.held_count = 0;
                for voice in self.pool.voices_mut().iter_mut().filter(|voice| voice.active) {
                    voice.release();
                }
            }
        }
    }

    // Applies `event` at its frame, or carries it (and, through `carrying`, every
    // event after it) to the next block once the priming budget is spent.
    fn step(&mut self, out: &mut Buses, cursor: &mut usize, event: NoteEvent, carrying: bool) -> bool {
        let starts = matches!(event.kind, EventKind::NoteOn { .. } | EventKind::NoteOff { .. });
        if carrying || (starts && self.keymap.stretches() && self.primes >= priming_budget(self.sample_rate, out.frames)) {
            self.carried.push(NoteEvent { offset: 0, kind: event.kind });
            return true;
        }
        let at = (event.offset as usize).min(out.frames);
        self.render(out, *cursor, at);
        *cursor = at;
        self.apply(event.kind);
        false
    }

    // Each voice onto its zone's output; one bus only: every output summed there.
    fn render(&mut self, out: &mut Buses, start: usize, end: usize) {
        if start >= end {
            return;
        }
        let frames = end - start;
        let (stride, buses) = (out.frames, out.count());
        let transpose = self.bend + self.values[TUNE_CENTS as usize] / 100.0;
        let (scratch_left, scratch_right) = (&mut self.scratch_left[..frames], &mut self.scratch_right[..frames]);
        let mut context = context!(self);
        for voice in self.pool.voices_mut().iter_mut().filter(|voice| voice.active) {
            scratch_left.fill(0.0);
            scratch_right.fill(0.0);
            voice.render(&mut context, transpose, scratch_left, scratch_right);
            let bus = if buses == 1 { 0 } else { context.keymap.zone(voice.zone).output as usize };
            let span = bus * stride + start..bus * stride + end;
            for (sample, value) in out.left[span.clone()].iter_mut().zip(scratch_left.iter()) {
                *sample += value;
            }
            for (sample, value) in out.right[span].iter_mut().zip(scratch_right.iter()) {
                *sample += value;
            }
        }
        for frame in start..end {
            let gain = self.gain.tick();
            for bus in 0..buses {
                out.left[bus * stride + frame] *= gain;
                out.right[bus * stride + frame] *= gain;
            }
        }
        self.now += frames as u64;
    }

    // The outputs its zones sound on (Keymap::outputs).
    pub fn outputs(&self) -> usize {
        self.keymap.outputs()
    }

    // One block of `frames` frames on every output: `left` and `right` hold
    // `outputs()` buses (or more, left silent) of `frames` samples side by side.
    pub fn process_outputs(&mut self, left: &mut [f32], right: &mut [f32], frames: usize) {
        debug_assert!(frames > 0 && left.len() == right.len() && left.len() >= frames * self.outputs());
        self.run(&mut Buses { left, right, frames });
    }

    fn run(&mut self, out: &mut Buses) {
        let _flush = atome_dsp::denormal::FlushDenormals::new();
        let frames = out.frames;
        out.left.fill(0.0);
        out.right.fill(0.0);
        let mut cursor = 0;
        let mut carrying = false;
        self.primes = 0;
        std::mem::swap(&mut self.carried, &mut self.carrying);
        for index in 0..self.carrying.as_slice().len() {
            let event = self.carrying.as_slice()[index];
            carrying = self.step(out, &mut cursor, event, carrying);
        }
        self.carrying.clear();
        for index in 0..self.events.as_slice().len() {
            let event = self.events.as_slice()[index];
            carrying = self.step(out, &mut cursor, event, carrying);
        }
        self.events.clear();
        self.render(out, cursor, frames);
    }
}

impl Processor for Sampler {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.sample_rate = sample_rate;
        self.scratch_left = vec![0.0; max_block];
        self.scratch_right = vec![0.0; max_block];
        self.gain.prepare(sample_rate);
        let (stretch, markers) = (self.keymap.stretches(), self.keymap.markers().len());
        for voice in self.pool.voices_mut() {
            voice.prepare(sample_rate, max_block, stretch, markers);
        }
    }

    // Every output summed into the one block (the instrument heard whole).
    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        self.run(&mut Buses { left: &mut *block.left, right: &mut *block.right, frames });
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else { return };
        let value = spec.clamp(value);
        self.values[id as usize] = value;
        if id == GAIN_DB {
            self.gain.set(atome_dsp::db_to_amplitude(value));
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn tail_frames(&self) -> u32 {
        (self.values[RELEASE_MS as usize] * 0.001 * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        self.events.clear();
        self.carried.clear();
        self.held_count = 0;
        self.switch = self.keymap.switches().map_or(0, |switches| switches.default);
        self.sustain_down = false;
        self.bend = 0.0;
        self.controllers = [0.0; 128];
        self.keymap.markers_mut().reset();
        for voice in self.pool.voices_mut() {
            voice.active = false;
        }
        self.gain.settle();
    }
}
