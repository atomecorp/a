//! eVe mixer signal graph hosted inside a Kira `AudioManager`.
//!
//! Every mixer strip owns a Kira sub-track whose voices are captured by a
//! `StripCapture` effect; the `MixGraphEffect` on the main track then runs the
//! whole graph in the same block: ordered module chains, sends from any chain
//! position, buses, sidechain keys, latency compensation, bypass with effect
//! tails, meters, main output on/off and extra hardware channel pairs.

pub mod dsp;
pub mod effects;
pub mod graph;
pub mod host;
pub mod module;
pub mod program;
pub mod shared;
#[cfg(test)]
mod tests;

use effects::{build_effect, requires_rebuild, retune, EffectHandle};
use graph::{Graph, StripParts};
use module::{ModuleCell, ModuleControls, ModuleRuntime, Processor, REQUEST_ACTIVE, REQUEST_BYPASS, REQUEST_CUT};
pub use program::{InputSpec, ModuleSpec, Program, StripSpec, Target};
use shared::{CaptureSlot, GraphShared, LiveInput, StripMeter};
pub use shared::{AuxOutputs, MixGraphEffect, MixGraphEffectBuilder, StripCapture, StripCaptureBuilder};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::Ordering;
use std::sync::Arc;

struct ModuleEntry {
    spec: ModuleSpec,
    cell: ModuleCell,
    controls: Arc<ModuleControls>,
    handle: Option<EffectHandle>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StripLevel {
    pub strip_id: String,
    pub peak: f32,
    pub rms: f32,
}

pub struct MixGraph {
    shared: Arc<GraphShared>,
    modules: HashMap<String, ModuleEntry>,
    captures: HashMap<String, Arc<CaptureSlot>>,
    meters: HashMap<String, Arc<StripMeter>>,
    live_inputs: HashMap<String, Arc<LiveInput>>,
}

const LIVE_CAPACITY_FRAMES: usize = 16_384;

fn module_identity(spec: &ModuleSpec) -> (String, Option<String>, bool) {
    (spec.kind.clone(), spec.effect.clone(), spec.text("sidechain_strip_id").is_some())
}

fn primary_value(spec: &ModuleSpec) -> f32 {
    match spec.kind.as_str() {
        "volume" => spec.number("gain_db", 0.0) as f32,
        "pan" => spec.number("pan", 0.0) as f32,
        "send" => spec.number("level_db", 0.0) as f32,
        _ => 0.0,
    }
}

fn write_controls(controls: &ModuleControls, spec: &ModuleSpec) {
    controls.value.set(primary_value(spec));
    let compressor = [
        spec.number("threshold_db", -18.0), spec.number("ratio", 4.0), spec.number("attack_ms", 10.0),
        spec.number("release_ms", 150.0), spec.number("makeup_db", 0.0), spec.number("mix", 1.0),
    ];
    for (param, value) in controls.compressor.iter().zip(compressor) {
        param.set(value as f32);
    }
    let request = controls.request.load(Ordering::Relaxed);
    if !spec.bypass {
        controls.request.store(REQUEST_ACTIVE, Ordering::Relaxed);
    } else if request == REQUEST_ACTIVE {
        controls.request.store(REQUEST_BYPASS, Ordering::Relaxed);
    }
}

impl MixGraph {
    pub fn new(sample_rate: u32) -> Self {
        Self { shared: GraphShared::new(sample_rate), modules: HashMap::new(), captures: HashMap::new(), meters: HashMap::new(), live_inputs: HashMap::new() }
    }

    pub fn effect_builder(&self) -> MixGraphEffectBuilder {
        MixGraphEffectBuilder { shared: self.shared.clone() }
    }

    pub fn capture_builder(&mut self, strip_id: &str) -> StripCaptureBuilder {
        StripCaptureBuilder { slot: self.capture_slot(strip_id) }
    }

    pub fn capture_slot(&mut self, strip_id: &str) -> Arc<CaptureSlot> {
        self.captures.entry(strip_id.to_string()).or_insert_with(CaptureSlot::new).clone()
    }

    fn sample_rate(&self) -> u32 {
        self.shared.sample_rate.load(Ordering::Relaxed).max(1)
    }

    fn block(&self) -> usize {
        graph::MAX_BLOCK
    }

    fn build_module(&self, spec: &ModuleSpec) -> Result<ModuleEntry, String> {
        let controls = ModuleControls::new(primary_value(spec), spec.bypass);
        write_controls(&controls, spec);
        let sample_rate = self.sample_rate();
        let (processor, handle) = match spec.kind.as_str() {
            "volume" => (Processor::Volume(dsp::SmoothedGain::new(dsp::db_to_amplitude(primary_value(spec)))), None),
            "pan" => (Processor::Pan, None),
            "mono" => (Processor::Mono, None),
            "send" => (Processor::Send(dsp::SmoothedGain::new(dsp::db_to_amplitude(primary_value(spec)))), None),
            "fx" if spec.effect.as_deref() == Some("compressor") && spec.text("sidechain_strip_id").is_some() => {
                (Processor::Sidechain(dsp::SidechainCompressor::new(sample_rate)), None)
            }
            "fx" => {
                let EffectParts { processor, handle } = split_built(build_effect(spec, sample_rate, self.block())?, self.block());
                (processor, Some(handle))
            }
            other => return Err(format!("mix module type {other} is not an audio module")),
        };
        let cell = ModuleRuntime::new(controls.clone(), processor, sample_rate);
        Ok(ModuleEntry { spec: spec.clone(), cell, controls, handle })
    }

    fn drain_retired(&self) {
        if let Ok(mut retired) = self.shared.retired.lock() {
            retired.clear();
            retired.reserve(4);
        }
    }

    pub fn apply(&mut self, program: Program) -> Result<(), String> {
        graph::dependency_order(&program)?;
        self.drain_retired();
        let mut next_modules = HashMap::new();
        let mut parts = Vec::with_capacity(program.strips.len());
        for strip in &program.strips {
            let mut cells = Vec::with_capacity(strip.chain.len());
            for spec in &strip.chain {
                let entry = match self.modules.remove(&spec.id) {
                    Some(mut entry) if module_identity(&entry.spec) == module_identity(spec) && !requires_rebuild(&entry.spec, spec) => {
                        write_controls(&entry.controls, spec);
                        if let Some(handle) = entry.handle.as_mut() {
                            retune(handle, spec);
                        }
                        entry.spec = spec.clone();
                        entry
                    }
                    _ => self.build_module(spec)?,
                };
                cells.push(entry.cell.clone());
                next_modules.insert(spec.id.clone(), entry);
            }
            let live = match &strip.input {
                InputSpec::LiveAudio { device_id } => Some(self.live_inputs.entry(device_id.clone())
                    .or_insert_with(|| LiveInput::new(LIVE_CAPACITY_FRAMES)).clone()),
                InputSpec::Track => None,
            };
            parts.push(StripParts {
                id: strip.id.clone(),
                capture: self.capture_slot(&strip.id),
                live,
                meter: self.meters.entry(strip.id.clone()).or_insert_with(StripMeter::new).clone(),
                cells,
            });
        }
        let compiled = Graph::compile(&program, parts, &|_| 0)?;
        let live: HashSet<&str> = program.strips.iter().map(|strip| strip.id.as_str()).collect();
        self.captures.retain(|id, _| live.contains(id.as_str()));
        let devices: HashSet<String> = program.strips.iter().filter_map(|strip| match &strip.input {
            InputSpec::LiveAudio { device_id } => Some(device_id.clone()),
            InputSpec::Track => None,
        }).collect();
        self.live_inputs.retain(|device, _| devices.contains(device));
        self.meters.retain(|id, _| live.contains(id.as_str()));
        self.modules = next_modules;
        *self.shared.pending.lock().map_err(|error| format!("mix graph lock: {error}"))? = Some(Box::new(compiled));
        Ok(())
    }

    pub fn set_bypass(&mut self, module_id: &str, bypass: bool) -> Result<(), String> {
        let entry = self.modules.get_mut(module_id).ok_or_else(|| format!("mix module {module_id} not found"))?;
        entry.spec.bypass = bypass;
        write_controls(&entry.controls, &entry.spec.clone());
        Ok(())
    }

    // Second left swipe while a tail rings: stop now and clear the effect state.
    pub fn cut_tail(&mut self, module_id: &str) -> Result<(), String> {
        let sample_rate = self.sample_rate();
        let block = self.block();
        let entry = self.modules.get_mut(module_id).ok_or_else(|| format!("mix module {module_id} not found"))?;
        entry.controls.request.store(REQUEST_CUT, Ordering::Relaxed);
        if entry.handle.is_some() {
            let built = build_effect(&entry.spec, sample_rate, block)?;
            let EffectParts { processor, handle } = split_built(built, block);
            if let Processor::Effect { effects, .. } = processor {
                let replacement = entry.cell.lock().map_err(|error| format!("mix module lock: {error}"))?.replacement.clone();
                *replacement.lock().map_err(|error| format!("mix module lock: {error}"))? = Some(effects);
            }
            entry.handle = Some(handle);
        }
        Ok(())
    }

    // Live inputs the current program monitors, by device id (the host opens them).
    pub fn live_inputs(&self) -> Vec<(String, Arc<LiveInput>)> {
        self.live_inputs.iter().map(|(device, input)| (device.clone(), input.clone())).collect()
    }

    pub fn module_state(&self, module_id: &str) -> Option<u8> {
        self.modules.get(module_id).map(|entry| entry.controls.state.load(Ordering::Relaxed))
    }

    pub fn levels(&self) -> Vec<StripLevel> {
        let mut levels: Vec<StripLevel> = self.meters.iter().map(|(strip_id, meter)| {
            let (peak, rms) = meter.read();
            StripLevel { strip_id: strip_id.clone(), peak, rms }
        }).collect();
        levels.sort_by(|left, right| left.strip_id.cmp(&right.strip_id));
        levels
    }

    pub fn aux_outputs(&self) -> Arc<shared::AuxOutputs> {
        self.shared.aux.clone()
    }
}

struct EffectParts {
    processor: Processor,
    handle: EffectHandle,
}

fn split_built(built: effects::BuiltEffect, block: usize) -> EffectParts {
    let effects::BuiltEffect { effects, handle, has_tail } = built;
    EffectParts { processor: ModuleRuntime::effect(effects, has_tail, block), handle }
}
