// One chain module at render time. The graph that runs it owns it; the next
// compiled graph adopts it from the one before (graph.rs), so effect state
// (reverb tails, envelopes) survives structural edits with no lock at all.

use crate::dsp::{self, AtomicParam, SmoothedGain};
use crate::dsp_module::DspRuntime;
use kira::Frame;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;

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
}

impl ModuleControls {
    pub fn new(value: f32, bypass: bool, parameters: Vec<AtomicParam>) -> Arc<Self> {
        Arc::new(Self {
            value: AtomicParam::new(value),
            request: AtomicU8::new(if bypass { REQUEST_BYPASS } else { REQUEST_ACTIVE }),
            state: AtomicU8::new(if bypass { STATE_BYPASSED } else { STATE_ACTIVE }),
            parameters,
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
}

pub struct ModuleRuntime {
    pub controls: Arc<ModuleControls>,
    pub processor: Processor,
    pub sample_rate: u32,
}

pub type ModuleBox = Box<ModuleRuntime>;

impl ModuleRuntime {
    pub fn new(controls: Arc<ModuleControls>, processor: Processor, sample_rate: u32) -> ModuleBox {
        Box::new(Self { controls, processor, sample_rate })
    }

    // Resolve the request against the current state.
    fn resolve_state(&mut self) -> u8 {
        let request = self.controls.request.load(Ordering::Relaxed);
        let current = self.controls.state.load(Ordering::Relaxed);
        let has_tail = matches!(&self.processor, Processor::Dsp(runtime) if runtime.has_tail);
        let next = match (request, current) {
            (REQUEST_ACTIVE, _) => STATE_ACTIVE,
            (REQUEST_CUT, _) => STATE_BYPASSED,
            (_, STATE_ACTIVE) if has_tail => STATE_DRAINING,
            (_, STATE_DRAINING) => STATE_DRAINING,
            _ => STATE_BYPASSED,
        };
        if next != current {
            if let Processor::Dsp(runtime) = &mut self.processor {
                runtime.silent_frames = 0;
                if next == STATE_BYPASSED {
                    runtime.reset();
                }
            }
            self.controls.state.store(next, Ordering::Relaxed);
        }
        next
    }

    // Signals the module writes (port 0 continues the chain).
    pub fn ports(&self) -> usize {
        match &self.processor {
            Processor::Dsp(runtime) => runtime.ports(),
            _ => 1,
        }
    }

    // Processes everything except sends (routing belongs to the graph); a
    // split module folds its ports back into `buffer`.
    pub fn process(&mut self, buffer: &mut [Frame], key: Option<&[Frame]>) {
        self.run(buffer, key, false);
    }

    // A split module leaves port 0 in `buffer` and keeps its other ports for
    // `add_port`; returns false when it is bypassed (`buffer` holds all, the
    // other ports are silent).
    pub fn process_split(&mut self, buffer: &mut [Frame], key: Option<&[Frame]>) -> bool {
        self.run(buffer, key, true)
    }

    fn run(&mut self, buffer: &mut [Frame], key: Option<&[Frame]>, split: bool) -> bool {
        let state = self.resolve_state();
        let value = self.controls.value.get();
        let sample_rate = self.sample_rate;
        match &mut self.processor {
            Processor::Volume(gain) => {
                if state == STATE_ACTIVE {
                    gain.apply(buffer, dsp::db_to_amplitude(value));
                }
            }
            Processor::Pan => {
                if state == STATE_ACTIVE {
                    dsp::apply_pan(buffer, value);
                }
            }
            Processor::Mono => {
                if state == STATE_ACTIVE {
                    dsp::apply_mono(buffer);
                }
            }
            Processor::Send(_) | Processor::Input(_) => {}
            Processor::Dsp(runtime) => match state {
                STATE_ACTIVE => {
                    runtime.process(buffer, &self.controls.parameters, key, split);
                    return split;
                }
                STATE_DRAINING => {
                    let peak = runtime.drain(buffer, &self.controls.parameters);
                    if peak < TAIL_SILENCE_AMPLITUDE {
                        runtime.silent_frames += buffer.len();
                    } else {
                        runtime.silent_frames = 0;
                    }
                    if runtime.silent_frames as f32 >= TAIL_SILENCE_SECONDS * sample_rate as f32 {
                        self.controls.state.store(STATE_BYPASSED, Ordering::Relaxed);
                    }
                }
                _ => runtime.pass(buffer),
            },
        }
        false
    }

    // Adds port `port` (1..) of the last split block into `out`.
    pub fn add_port(&self, port: usize, out: &mut [Frame]) {
        if let Processor::Dsp(runtime) = &self.processor {
            runtime.add_port(port, out);
        }
    }

    // Adds `source` at the module's level into `destination`: a send's share
    // leaving the chain, or what an IN mixes into it.
    pub fn send_into(&mut self, source: &[Frame], destination: &mut [Frame]) {
        let state = self.resolve_state();
        let level = dsp::db_to_amplitude(self.controls.value.get());
        if let Processor::Send(gain) | Processor::Input(gain) = &mut self.processor {
            gain.add_into(source, destination, if state == STATE_ACTIVE { level } else { 0.0 });
        }
    }

    pub fn is_send(&self) -> bool {
        matches!(self.processor, Processor::Send(_))
    }
}
