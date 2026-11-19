// One chain module at render time. The graph that runs it owns it; the next
// compiled graph adopts it from the one before (graph.rs), so effect state
// (reverb tails, envelopes) survives structural edits with no lock at all.
// A module of a wider strip (R-191) runs one processor per pair, all with the
// same settings; its state (active, draining, bypassed) is the module's.

use crate::dsp::{self, AtomicParam, SmoothedGain};
use crate::dsp_module::DspRuntime;
use crate::modulation::{ParamMod, Target};
use crate::record_tap::RecordTap;
use kira::Frame;
use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};

// Bypass request written by the control thread.
pub const REQUEST_ACTIVE: u8 = 0;
pub const REQUEST_BYPASS: u8 = 1;
pub const REQUEST_CUT: u8 = 2;

// Observable render state of a module.
pub const STATE_ACTIVE: u8 = 0;
pub const STATE_DRAINING: u8 = 1;
pub const STATE_BYPASSED: u8 = 2;

// A tail ends once its output stays under -80 dBFS for 250 ms (decision D7).
const TAIL_SILENCE_AMPLITUDE: f32 = 1.0e-4;
const TAIL_SILENCE_SECONDS: f32 = 0.25;

#[derive(Debug)]
pub struct ModuleControls {
    pub value: AtomicParam,
    pub request: AtomicU8,
    pub state: AtomicU8,
    // A `dsp` module's parameters, in its kind's table order.
    pub parameters: Vec<AtomicParam>,
    // A `dsp` module's live measurements (its kind's `readings` keys), written
    // by the render thread after each block, read by the control thread.
    pub readings: Vec<AtomicParam>,
}

impl ModuleControls {
    pub fn new(
        value: f32,
        bypass: bool,
        parameters: Vec<AtomicParam>,
        readings: Vec<AtomicParam>,
    ) -> Arc<Self> {
        Arc::new(Self {
            value: AtomicParam::new(value),
            request: AtomicU8::new(if bypass {
                REQUEST_BYPASS
            } else {
                REQUEST_ACTIVE
            }),
            state: AtomicU8::new(if bypass { STATE_BYPASSED } else { STATE_ACTIVE }),
            parameters,
            readings,
        })
    }
}

pub enum Processor {
    Volume(SmoothedGain),
    Pan,
    Mono,
    Send(SmoothedGain),
    // An IN module: its source mixed into the chain at its level (graph.rs).
    Input(SmoothedGain),
    Dsp(Box<DspRuntime>),
    // A REC point: the signal passes unchanged, copied while armed (record_tap.rs).
    Record(Arc<RecordTap>),
}

pub struct ModuleRuntime {
    pub controls: Arc<ModuleControls>,
    // One per pair of the strip, pair 0 first.
    processors: Vec<Processor>,
    pub sample_rate: u32,
    state: u8,
    has_tail: bool,
    silent_frames: usize,
    peak: f32,
}

pub type ModuleBox = Box<ModuleRuntime>;

// The values of the module's primary value this step, when modulated.
fn value_frames(mods: &[ParamMod]) -> Option<&[f32]> {
    mods.iter()
        .find(|read| read.target == Target::Value)
        .map(|read| read.values.as_slice())
}

impl ModuleRuntime {
    pub fn new(
        controls: Arc<ModuleControls>,
        processors: Vec<Processor>,
        sample_rate: u32,
    ) -> ModuleBox {
        let has_tail =
            matches!(processors.first(), Some(Processor::Dsp(runtime)) if runtime.has_tail);
        let state = controls.state.load(Ordering::Relaxed);
        Box::new(Self {
            controls,
            processors,
            sample_rate,
            state,
            has_tail,
            silent_frames: 0,
            peak: 0.0,
        })
    }

    // Resolves the request against the current state, once per step.
    pub fn begin(&mut self) {
        let request = self.controls.request.load(Ordering::Relaxed);
        let current = self.controls.state.load(Ordering::Relaxed);
        let next = match (request, current) {
            (REQUEST_ACTIVE, _) => STATE_ACTIVE,
            (REQUEST_CUT, _) => STATE_BYPASSED,
            (_, STATE_ACTIVE) if self.has_tail => STATE_DRAINING,
            (_, STATE_DRAINING) => STATE_DRAINING,
            _ => STATE_BYPASSED,
        };
        if next != current {
            self.silent_frames = 0;
            if next == STATE_BYPASSED {
                for processor in &mut self.processors {
                    if let Processor::Dsp(runtime) = processor {
                        runtime.reset();
                    }
                }
            }
            self.controls.state.store(next, Ordering::Relaxed);
        }
        self.state = next;
        self.peak = 0.0;
    }

    // A draining tail ends once every pair has stayed silent long enough.
    pub fn finish(&mut self, frames: usize) {
        if self.state != STATE_DRAINING {
            return;
        }
        if self.peak < TAIL_SILENCE_AMPLITUDE {
            self.silent_frames += frames;
        } else {
            self.silent_frames = 0;
        }
        if self.silent_frames as f32 >= TAIL_SILENCE_SECONDS * self.sample_rate as f32 {
            self.controls.state.store(STATE_BYPASSED, Ordering::Relaxed);
        }
    }

    pub fn is_active(&self) -> bool {
        self.state == STATE_ACTIVE
    }

    // Signals the module writes (port 0 continues the chain).
    pub fn ports(&self) -> usize {
        match self.processors.first() {
            Some(Processor::Dsp(runtime)) => runtime.ports(),
            _ => 1,
        }
    }

    // A modulator's control of the step just processed (pair 0).
    pub fn control(&self, output: usize) -> &[f32] {
        match self.processors.first() {
            Some(Processor::Dsp(runtime)) => runtime.control(output),
            _ => &[],
        }
    }

    // Processes pair `pair` (everything except sends: routing belongs to the
    // graph). `split` keeps a split module's ports 1.. apart; returns whether
    // they hold signal (false when bypassed: `buffer` holds all).
    pub fn process(
        &mut self,
        pair: usize,
        buffer: &mut [Frame],
        key: Option<&[Frame]>,
        split: bool,
        mods: &[ParamMod],
    ) -> bool {
        let state = self.state;
        let value = self.controls.value.get();
        let controls = &self.controls;
        match &mut self.processors[pair] {
            Processor::Volume(gain) if state == STATE_ACTIVE => match value_frames(mods) {
                Some(values) => {
                    for (frame, db) in buffer.iter_mut().zip(values) {
                        *frame *= dsp::db_to_amplitude(*db);
                    }
                    gain.hold(dsp::db_to_amplitude(values[buffer.len() - 1]));
                }
                None => gain.apply(buffer, dsp::db_to_amplitude(value)),
            },
            Processor::Pan if state == STATE_ACTIVE => match value_frames(mods) {
                Some(values) => {
                    for (frame, pan) in buffer.iter_mut().zip(values) {
                        dsp::apply_pan(std::slice::from_mut(frame), *pan);
                    }
                }
                None => dsp::apply_pan(buffer, value),
            },
            Processor::Mono if state == STATE_ACTIVE => dsp::apply_mono(buffer),
            Processor::Record(tap) => tap.write(buffer),
            Processor::Dsp(runtime) => match state {
                STATE_ACTIVE => {
                    runtime.process(buffer, &controls.parameters, key, split, mods);
                    if pair == 0 {
                        runtime.publish(&controls.readings);
                    }
                    return split;
                }
                STATE_DRAINING => {
                    let peak = runtime.drain(buffer, &controls.parameters);
                    self.peak = self.peak.max(peak);
                }
                _ => runtime.pass(buffer),
            },
            _ => {}
        }
        false
    }

    // Adds port `port` (1..) of pair `pair`'s last split block into `out`.
    pub fn add_port(&self, pair: usize, port: usize, out: &mut [Frame]) {
        if let Processor::Dsp(runtime) = &self.processors[pair] {
            runtime.add_port(port, out);
        }
    }

    // Adds `source` at the module's level into `destination`: a send's share
    // leaving the chain, or what an IN mixes into it.
    pub fn send_into(
        &mut self,
        pair: usize,
        source: &[Frame],
        destination: &mut [Frame],
        mods: &[ParamMod],
    ) {
        let active = self.state == STATE_ACTIVE;
        let level = dsp::db_to_amplitude(self.controls.value.get());
        if let Processor::Send(gain) | Processor::Input(gain) = &mut self.processors[pair] {
            match (value_frames(mods), active) {
                (Some(values), true) => {
                    for ((out, input), db) in destination.iter_mut().zip(source).zip(values) {
                        *out += *input * dsp::db_to_amplitude(*db);
                    }
                    gain.hold(dsp::db_to_amplitude(values[source.len() - 1]));
                }
                _ => gain.add_into(source, destination, if active { level } else { 0.0 }),
            }
        }
    }

    pub fn is_send(&self) -> bool {
        matches!(self.processors.first(), Some(Processor::Send(_)))
    }
}
