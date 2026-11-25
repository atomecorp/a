// A strip whose source is an instrument (todo/sampler_cahier_des_charges §14):
// the sampler or the synth of `atome-instrument` (instrument_synth.rs builds it). Notes reach the render thread through two single-producer rings
// of atomics: one played now (the start of the next block), one dated on the
// instrument's own rendered-frame count. A rebuilt sampler is handed over like
// a graph (`pending`, taken with `try_lock`), the replaced one goes back to the
// control thread to be dropped there; `active` is only ever locked by render.
// Command markers come back through each instrument's action book. A
// multitimbral instrument renders all its outputs at once (D-S2), once per
// chunk, into the graph's buses (source_bus.rs) every strip and IN reads.

use crate::dsp::AtomicParam;
use crate::graph::MAX_BLOCK;
use crate::instrument_actions::{ActionBook, DrainedActions};
use crate::instrument_spec::InstrumentSpec;
use crate::instrument_synth::{Engine, build_engine, plays_param};
use atome_instrument::sampler::PARAMS;
use atome_instrument::synth::BrickKind;
use atome_instrument::{EventKind, NoteEvent, SampleData};
use kira::Frame;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

const RING_EVENTS: usize = 1024;

// A note event in one word: a second byte (8 bits, a brick's parameter), kind (8 bits), note (8 bits), value (f32 bits).
fn pack(kind: EventKind) -> u64 {
    let (code, extra, note, value) = match kind {
        EventKind::NoteOn { note, velocity } => (1u64, 0u8, note, velocity),
        EventKind::NoteOff { note } => (2, 0, note, 0.0),
        EventKind::Sustain { down } => (3, 0, 0, if down { 1.0 } else { 0.0 }),
        EventKind::PitchBend { semitones } => (4, 0, 0, semitones),
        EventKind::AllNotesOff => (5, 0, 0, 0.0),
        EventKind::Controller { number, value } => (6, 0, number, value),
        EventKind::Pressure { value } => (7, 0, 0, value),
        EventKind::Tempo { bpm } => (8, 0, 0, bpm),
        EventKind::BrickParam {
            brick,
            param,
            value,
        } => (9, param, brick, value),
    };
    (u64::from(extra) << 48) | (code << 40) | (u64::from(note) << 32) | u64::from(value.to_bits())
}

fn unpack(word: u64) -> Option<EventKind> {
    let note = ((word >> 32) & 0xff) as u8;
    let extra = ((word >> 48) & 0xff) as u8;
    let value = f32::from_bits(word as u32);
    match (word >> 40) & 0xff {
        1 => Some(EventKind::NoteOn {
            note,
            velocity: value,
        }),
        2 => Some(EventKind::NoteOff { note }),
        3 => Some(EventKind::Sustain { down: value > 0.5 }),
        4 => Some(EventKind::PitchBend { semitones: value }),
        5 => Some(EventKind::AllNotesOff),
        6 => Some(EventKind::Controller {
            number: note,
            value,
        }),
        7 => Some(EventKind::Pressure { value }),
        8 => Some(EventKind::Tempo { bpm: value }),
        9 => Some(EventKind::BrickParam {
            brick: note,
            param: extra,
            value,
        }),
        _ => None,
    }
}

// Single producer (the control thread), single consumer (render): neither waits.
struct EventRing {
    words: Box<[AtomicU64]>,
    frames: Box<[AtomicU64]>,
    written: AtomicUsize,
    read: AtomicUsize,
}

impl EventRing {
    fn new() -> Self {
        Self {
            words: (0..RING_EVENTS).map(|_| AtomicU64::new(0)).collect(),
            frames: (0..RING_EVENTS).map(|_| AtomicU64::new(0)).collect(),
            written: AtomicUsize::new(0),
            read: AtomicUsize::new(0),
        }
    }

    fn push(&self, frame: u64, kind: EventKind) -> Result<(), String> {
        let written = self.written.load(Ordering::Relaxed);
        if written.wrapping_sub(self.read.load(Ordering::Acquire)) >= RING_EVENTS {
            return Err("instrument event ring is full".to_string());
        }
        let slot = written % RING_EVENTS;
        self.words[slot].store(pack(kind), Ordering::Relaxed);
        self.frames[slot].store(frame, Ordering::Relaxed);
        self.written
            .store(written.wrapping_add(1), Ordering::Release);
        Ok(())
    }

    // Every event due before `until`, at its offset from `from` (an event already late plays at 0).
    fn drain(&self, from: u64, until: u64, engine: &mut Engine) {
        let written = self.written.load(Ordering::Acquire);
        let mut read = self.read.load(Ordering::Relaxed);
        while read != written {
            let slot = read % RING_EVENTS;
            let frame = self.frames[slot].load(Ordering::Relaxed);
            if frame >= until {
                break;
            }
            if let Some(kind) = unpack(self.words[slot].load(Ordering::Relaxed)) {
                engine.schedule(NoteEvent {
                    offset: frame.saturating_sub(from) as u32,
                    kind,
                });
            }
            read = read.wrapping_add(1);
        }
        self.read.store(read, Ordering::Release);
    }

    // Every event due before `until` let pass unplayed (an instrument heard only through stems, R-370).
    fn discard(&self, until: u64) {
        let written = self.written.load(Ordering::Acquire);
        let mut read = self.read.load(Ordering::Relaxed);
        while read != written && self.frames[read % RING_EVENTS].load(Ordering::Relaxed) < until {
            read = read.wrapping_add(1);
        }
        self.read.store(read, Ordering::Release);
    }
}

// Its outputs side by side: bus `b` of a block of `frames` is [b * frames, (b + 1) * frames).
pub struct Playing {
    engine: Engine,
    values: [f32; PARAMS.len()],
    outputs: usize,
    left: Vec<f32>,
    right: Vec<f32>,
}

pub struct InstrumentSlot {
    now: EventRing,
    dated: EventRing,
    params: Box<[AtomicParam]>,
    rendered: AtomicU64,
    // Its notes passed unplayed since it was last rendered (skip): its voices are released when it plays again.
    resting: AtomicBool,
    pending: Mutex<Option<Box<Playing>>>,
    active: Mutex<Option<Box<Playing>>>,
    // Boxes, not values: the render thread hands a retired player over by its
    // pointer and never frees it; its memory is released off the audio thread.
    #[allow(
        clippy::vec_box,
        reason = "real-time hand-over: no move, no free on the audio thread"
    )]
    retired: Mutex<Vec<Box<Playing>>>,
}

impl InstrumentSlot {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            now: EventRing::new(),
            dated: EventRing::new(),
            params: PARAMS
                .iter()
                .map(|param| AtomicParam::new(param.default))
                .collect(),
            rendered: AtomicU64::new(0),
            resting: AtomicBool::new(false),
            pending: Mutex::new(None),
            active: Mutex::new(None),
            retired: Mutex::new(Vec::with_capacity(4)),
        })
    }

    fn offer(
        &self,
        engine: Engine,
        values: [f32; PARAMS.len()],
        outputs: usize,
    ) -> Result<(), String> {
        for (slot, value) in self.params.iter().zip(values) {
            slot.set(value);
        }
        if let Ok(mut retired) = self.retired.lock() {
            retired.clear();
            retired.reserve(4);
        }
        let samples = MAX_BLOCK * outputs;
        let playing = Box::new(Playing {
            engine,
            values,
            outputs,
            left: vec![0.0; samples],
            right: vec![0.0; samples],
        });
        *self
            .pending
            .lock()
            .map_err(|error| format!("instrument lock: {error}"))? = Some(playing);
        Ok(())
    }

    // Frames this instrument has rendered: the clock dated notes are set on.
    pub fn rendered_frames(&self) -> u64 {
        self.rendered.load(Ordering::Acquire)
    }

    fn adopt(&self, active: &mut Option<Box<Playing>>) {
        let Ok(mut retired) = self.retired.try_lock() else {
            return;
        };
        if retired.len() >= retired.capacity() {
            return;
        }
        let Ok(mut pending) = self.pending.try_lock() else {
            return;
        };
        let Some(next) = pending.take() else { return };
        if let Some(previous) = active.replace(next) {
            retired.push(previous);
        }
    }

    // A block of `frames` frames nobody hears live (R-370: every strip reading it is frozen): its clock moves on and
    // its notes pass, so dated notes keep their frames and the ring never fills; nothing is computed.
    pub fn skip(&self, frames: usize) {
        let rendered = self.rendered.load(Ordering::Relaxed);
        self.now.discard(u64::MAX);
        self.dated.discard(rendered + frames as u64);
        self.resting.store(true, Ordering::Relaxed);
        self.rendered
            .store(rendered + frames as u64, Ordering::Release);
    }

    // One block of `frames` frames of the instrument, output `b` into `buses[b]`
    // (render thread; the graph holds a bus per output its program reads).
    pub fn render(&self, buses: &mut [Vec<Frame>], frames: usize) {
        let frames = frames.min(MAX_BLOCK);
        for bus in buses.iter_mut() {
            bus[..frames].fill(Frame::ZERO);
        }
        let Ok(mut active) = self.active.try_lock() else {
            return;
        };
        self.adopt(&mut active);
        let Some(playing) = active.as_mut() else {
            return;
        };
        let Playing {
            engine,
            values,
            outputs,
            left,
            right,
        } = &mut **playing;
        for (id, (slot, value)) in self.params.iter().zip(values.iter_mut()).enumerate() {
            let next = slot.get();
            if next != *value {
                *value = next;
                engine.set_param(id as u32, next);
            }
        }
        let rendered = self.rendered.load(Ordering::Relaxed);
        if self.resting.swap(false, Ordering::Relaxed) {
            // Voices left held while it rested would never hear their note's end.
            engine.schedule(NoteEvent {
                offset: 0,
                kind: EventKind::AllNotesOff,
            });
        }
        self.now.drain(u64::MAX, u64::MAX, engine);
        self.dated.drain(rendered, rendered + frames as u64, engine);
        let span = frames * *outputs;
        engine.process_outputs(&mut left[..span], &mut right[..span], frames);
        for (bus, out) in buses.iter_mut().enumerate().take(*outputs) {
            let at = bus * frames;
            for (frame, (left, right)) in out[..frames].iter_mut().zip(
                left[at..at + frames]
                    .iter()
                    .zip(right[at..at + frames].iter()),
            ) {
                *frame = Frame::new(*left, *right);
            }
        }
        self.rendered
            .store(rendered + frames as u64, Ordering::Release);
    }
}

// The instruments a mix graph can play: their samples, descriptions and slots.
#[derive(Default)]
pub struct Instruments {
    samples: HashMap<String, SampleData>,
    specs: HashMap<String, InstrumentSpec>,
    slots: HashMap<String, Arc<InstrumentSlot>>,
    books: HashMap<String, ActionBook>,
    // The outputs the applied program reads, per instrument: a description keeps them.
    routed: HashMap<String, usize>,
}

impl Instruments {
    pub fn load_sample(&mut self, sample_id: &str, data: SampleData) {
        self.samples.insert(sample_id.to_string(), data);
    }

    pub fn unload_sample(&mut self, sample_id: &str) -> Result<(), String> {
        self.samples
            .remove(sample_id)
            .map(|_| ())
            .ok_or_else(|| format!("instrument sample {sample_id} is not loaded"))
    }

    pub fn has_sample(&self, sample_id: &str) -> bool {
        self.samples.contains_key(sample_id)
    }

    // Every sample loaded, by id (an offline render plays them with its own instruments).
    pub fn samples(&self) -> &HashMap<String, SampleData> {
        &self.samples
    }

    // A new description: a strip already playing the instrument takes the rebuilt sampler.
    pub fn set(&mut self, spec: InstrumentSpec, sample_rate: u32) -> Result<(), String> {
        if let Some(&routed) = self
            .routed
            .get(&spec.id)
            .filter(|&&routed| routed > spec.outputs)
        {
            return Err(format!(
                "instrument {}: output {routed} plays on a strip, the description has {}",
                spec.id, spec.outputs
            ));
        }
        let (mut engine, values, infos) = build_engine(&spec, &self.samples, sample_rate)?;
        let book = self.books.entry(spec.id.clone()).or_default();
        engine.report_actions(book.queue(), book.record(infos));
        if let Some(slot) = self.slots.get(&spec.id) {
            slot.offer(engine, values, spec.outputs)?;
        }
        self.specs.insert(spec.id.clone(), spec);
        Ok(())
    }

    pub fn remove(&mut self, instrument_id: &str) {
        self.specs.remove(instrument_id);
        self.books.remove(instrument_id);
    }

    // The slot a strip plays, built the first time a program names the instrument.
    pub fn slot(
        &mut self,
        instrument_id: &str,
        sample_rate: u32,
    ) -> Result<Arc<InstrumentSlot>, String> {
        if let Some(slot) = self.slots.get(instrument_id) {
            return Ok(slot.clone());
        }
        let spec = self
            .specs
            .get(instrument_id)
            .ok_or_else(|| format!("instrument {instrument_id} is not loaded"))?;
        let (mut engine, values, _) = build_engine(spec, &self.samples, sample_rate)?;
        // The description's own build: its marker table was recorded when it was set.
        let book = self
            .books
            .get(instrument_id)
            .ok_or_else(|| format!("instrument {instrument_id} is not loaded"))?;
        engine.report_actions(book.queue(), book.generation());
        let slot = InstrumentSlot::new();
        slot.offer(engine, values, spec.outputs)?;
        self.slots.insert(instrument_id.to_string(), slot.clone());
        Ok(slot)
    }

    // Its declared outputs; reading output `output` must lie within them.
    pub fn check_output(&self, instrument_id: &str, output: usize) -> Result<(), String> {
        let spec = self
            .specs
            .get(instrument_id)
            .ok_or_else(|| format!("instrument {instrument_id} is not loaded"))?;
        match output < spec.outputs {
            true => Ok(()),
            false => Err(format!(
                "instrument {instrument_id} has no output {} (it has {})",
                output + 1,
                spec.outputs
            )),
        }
    }

    // What the applied program plays: slots read by none are dropped, the
    // outputs read are kept by every later description.
    pub fn retain(&mut self, routed: HashMap<String, usize>) {
        self.slots.retain(|id, _| routed.contains_key(id));
        self.routed = routed;
    }

    fn played(&self, instrument_id: &str) -> Result<&Arc<InstrumentSlot>, String> {
        self.slots
            .get(instrument_id)
            .ok_or_else(|| format!("instrument {instrument_id} is on no strip"))
    }

    // A note now (the start of the next block), or at `frame` of the instrument's own clock.
    pub fn event(
        &self,
        instrument_id: &str,
        kind: EventKind,
        frame: Option<u64>,
    ) -> Result<(), String> {
        let slot = self.played(instrument_id)?;
        match frame {
            Some(frame) => slot.dated.push(frame, kind),
            None => slot.now.push(0, kind),
        }
    }

    pub fn set_param(&self, instrument_id: &str, name: &str, value: f32) -> Result<(), String> {
        let param = PARAMS
            .iter()
            .find(|param| param.key == name)
            .ok_or_else(|| format!("instrument param {name} is unknown"))?;
        if let Some(spec) = self.specs.get(instrument_id)
            && !plays_param(spec, name)
        {
            return Err(format!(
                "instrument {instrument_id}: {name} belongs to the sampler; a synth's voice is its patch"
            ));
        }
        self.played(instrument_id)?.params[param.id as usize].set(param.clamp(value));
        Ok(())
    }

    // One parameter of a synth brick, heard at once (R-186: a module's value dragged); the description is written by
    // the next `set`. Refused for a sampler, an unknown brick or parameter, and an envelope's gate (it follows the note).
    pub fn set_brick_param(
        &self,
        instrument_id: &str,
        module_id: &str,
        name: &str,
        value: f32,
    ) -> Result<(), String> {
        let synth = self
            .specs
            .get(instrument_id)
            .ok_or_else(|| format!("instrument {instrument_id} is not loaded"))?
            .synth
            .as_ref()
            .ok_or_else(|| format!("instrument {instrument_id} is a sampler: it has no bricks"))?;
        let (brick, desc) = synth
            .bricks
            .iter()
            .enumerate()
            .find(|(_, brick)| brick.id == module_id)
            .ok_or_else(|| {
                format!("instrument {instrument_id}: synth brick {module_id} is not in the voice")
            })?;
        let kind = BrickKind::from_key(&desc.kind)?;
        let spec = kind
            .params()
            .iter()
            .find(|spec| spec.key == name)
            .filter(|spec| kind.patchable(spec.id))
            .ok_or_else(|| format!("synth brick {module_id} has no parameter {name} to set"))?;
        if !value.is_finite() {
            return Err(format!("synth brick {module_id}: {name} is not a number"));
        }
        self.played(instrument_id)?.now.push(
            0,
            EventKind::BrickParam {
                brick: brick as u8,
                param: spec.id as u8,
                value: spec.clamp(value),
            },
        )
    }

    pub fn rendered_frames(&self, instrument_id: &str) -> Result<u64, String> {
        Ok(self.played(instrument_id)?.rendered_frames())
    }

    // The command markers the instrument fired since the last drain (control thread).
    pub fn drain_actions(&self, instrument_id: &str) -> Result<DrainedActions, String> {
        Ok(self
            .books
            .get(instrument_id)
            .ok_or_else(|| format!("instrument {instrument_id} is not loaded"))?
            .drain())
    }
}
