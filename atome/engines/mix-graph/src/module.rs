// One chain module at render time, shared between successive compiled graphs
// so effect state (reverb tails, envelopes) survives structural edits.

use crate::dsp::{self, AtomicParam, CompressorSettings, SidechainCompressor, SmoothedGain};
use kira::effect::Effect;
use kira::info::Info;
use kira::Frame;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};

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
    pub compressor: [AtomicParam; 6],
}

impl ModuleControls {
    pub fn new(value: f32, bypass: bool) -> Arc<Self> {
        Arc::new(Self {
            value: AtomicParam::new(value),
            request: AtomicU8::new(if bypass { REQUEST_BYPASS } else { REQUEST_ACTIVE }),
            state: AtomicU8::new(if bypass { STATE_BYPASSED } else { STATE_ACTIVE }),
            compressor: std::array::from_fn(|_| AtomicParam::new(0.0)),
        })
    }

    pub fn compressor_settings(&self) -> CompressorSettings {
        let [threshold, ratio, attack, release, makeup, mix] = &self.compressor;
        CompressorSettings {
            threshold_db: threshold.get(),
            ratio: ratio.get(),
            attack_ms: attack.get(),
            release_ms: release.get(),
            makeup_db: makeup.get(),
            mix: mix.get(),
        }
    }
}

pub enum Processor {
    Volume(SmoothedGain),
    Pan,
    Mono,
    Send(SmoothedGain),
    Effect { effects: Vec<Box<dyn Effect>>, has_tail: bool, scratch: Vec<Frame>, silent_frames: usize },
    Sidechain(SidechainCompressor),
}

pub struct ModuleRuntime {
    pub controls: Arc<ModuleControls>,
    pub processor: Processor,
    // Fresh effect instance delivered by a tail cut (control thread builds it).
    pub replacement: Arc<Mutex<Option<Vec<Box<dyn Effect>>>>>,
    pub sample_rate: u32,
}

pub type ModuleCell = Arc<Mutex<ModuleRuntime>>;

impl ModuleRuntime {
    pub fn new(controls: Arc<ModuleControls>, processor: Processor, sample_rate: u32) -> ModuleCell {
        Arc::new(Mutex::new(Self { controls, processor, replacement: Arc::new(Mutex::new(None)), sample_rate }))
    }

    pub fn effect(effects: Vec<Box<dyn Effect>>, has_tail: bool, block: usize) -> Processor {
        Processor::Effect { effects, has_tail, scratch: vec![Frame::ZERO; block], silent_frames: 0 }
    }

    fn adopt_replacement(&mut self) {
        let Ok(mut slot) = self.replacement.try_lock() else { return };
        let Some(fresh) = slot.take() else { return };
        if let Processor::Effect { effects, silent_frames, .. } = &mut self.processor {
            // The old instance goes back to the slot so the control thread drops it.
            *slot = Some(std::mem::replace(effects, fresh));
            *silent_frames = 0;
        }
    }

    // Resolve the request against the current state; returns whether the
    // module processes its input normally this block.
    fn resolve_state(&mut self) -> u8 {
        let request = self.controls.request.load(Ordering::Relaxed);
        let current = self.controls.state.load(Ordering::Relaxed);
        let has_tail = matches!(self.processor, Processor::Effect { has_tail: true, .. });
        let next = match (request, current) {
            (REQUEST_ACTIVE, _) => STATE_ACTIVE,
            (REQUEST_CUT, _) => STATE_BYPASSED,
            (_, STATE_ACTIVE) if has_tail => STATE_DRAINING,
            (_, STATE_DRAINING) => STATE_DRAINING,
            _ => STATE_BYPASSED,
        };
        if next != current {
            if let Processor::Effect { silent_frames, .. } = &mut self.processor {
                *silent_frames = 0;
            }
            self.controls.state.store(next, Ordering::Relaxed);
        }
        next
    }

    pub fn is_active(&self) -> bool {
        self.controls.state.load(Ordering::Relaxed) == STATE_ACTIVE
    }

    // Processes everything except sends (routing belongs to the graph).
    pub fn process(&mut self, buffer: &mut [Frame], dt: f64, info: &Info, key: Option<&[Frame]>) {
        self.adopt_replacement();
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
            Processor::Send(_) => {}
            Processor::Sidechain(compressor) => {
                if state == STATE_ACTIVE {
                    let settings = self.controls.compressor_settings();
                    compressor.process(buffer, key.unwrap_or(&[]), &settings);
                } else {
                    compressor.reset();
                }
            }
            Processor::Effect { effects, scratch, silent_frames, .. } => {
                for effect in effects.iter_mut() {
                    effect.on_start_processing();
                }
                if state == STATE_ACTIVE {
                    for effect in effects.iter_mut() {
                        effect.process(buffer, dt, info);
                    }
                } else if state == STATE_DRAINING {
                    // Feed silence and let the tail ring out over the dry signal.
                    let tail = &mut scratch[..buffer.len()];
                    tail.fill(Frame::ZERO);
                    for effect in effects.iter_mut() {
                        effect.process(tail, dt, info);
                    }
                    for (out, ring) in buffer.iter_mut().zip(tail.iter()) {
                        *out += *ring;
                    }
                    if dsp::peak(tail) < TAIL_SILENCE_AMPLITUDE {
                        *silent_frames += buffer.len();
                    } else {
                        *silent_frames = 0;
                    }
                    if *silent_frames as f32 >= TAIL_SILENCE_SECONDS * sample_rate as f32 {
                        self.controls.state.store(STATE_BYPASSED, Ordering::Relaxed);
                    }
                }
            }
        }
    }

    // Adds the send's share of `source` into `destination`.
    pub fn send_into(&mut self, source: &[Frame], destination: &mut [Frame]) {
        let state = self.resolve_state();
        let level = dsp::db_to_amplitude(self.controls.value.get());
        if let Processor::Send(gain) = &mut self.processor {
            gain.add_into(source, destination, if state == STATE_ACTIVE { level } else { 0.0 });
        }
    }

    pub fn is_send(&self) -> bool {
        matches!(self.processor, Processor::Send(_))
    }
}
