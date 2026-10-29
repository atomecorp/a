//! eVe mixer signal graph hosted inside a Kira `AudioManager`.
//!
//! Every mixer strip owns a Kira sub-track whose voices are captured by a
//! `StripCapture` effect; the `MixGraphEffect` on the main track then runs the
//! whole graph in the same block: ordered module chains, sends from any chain
//! position, buses, latency compensation, bypass with effect
//! tails, meters, main output on/off and extra hardware channel pairs; split
//! modules whose bands leave for other strips, sidechain keys, and loops that
//! close through a guarded return. Instruments expose several outputs, each
//! playable on its own strip, and IN modules mix another source into a chain.

pub mod automation;
pub mod direct_render;
pub mod dsp;
pub mod dsp_module;
pub mod graph;
pub mod graph_order;
pub mod host;
pub mod instrument;
pub mod instrument_actions;
pub mod instrument_command;
pub mod instrument_notes;
pub mod instrument_spec;
pub mod module;
pub mod program;
pub mod resample;
pub mod return_ring;
pub mod round_trip;
pub mod shared;
pub mod source_bus;
pub mod voice;
pub mod voice_control;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod automation_tests;
#[cfg(test)]
mod dsp_tests;
#[cfg(test)]
mod instrument_tests;
#[cfg(test)]
mod instrument_notes_tests;
#[cfg(test)]
mod port_tests;
#[cfg(test)]
mod routing_tests;
#[cfg(test)]
mod voice_tests;

use dsp_module::{AssetStore, DspRuntime, StoredAsset};
use graph::{Graph, StepModule, StripParts};
use instrument::Instruments;
use source_bus::Feeds;
pub use instrument_spec::InstrumentSpec;
pub use atome_instrument::{EventKind, SampleData};
use module::{ModuleBox, ModuleControls, ModuleRuntime, Processor, REQUEST_ACTIVE, REQUEST_BYPASS, REQUEST_CUT};
pub use program::{InputSpec, KeySource, MixSource, ModuleSpec, PortRoute, Program, StripSpec, Target};
use shared::{CaptureSlot, GraphShared, LiveInput, StripMeter};
pub use shared::{AuxOutputs, MixGraphEffect, MixGraphEffectBuilder, StripCapture, StripCaptureBuilder};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::Ordering;
use std::sync::Arc;

// The control thread's view of a module. Its runtime lives in a graph: in the
// one the render thread runs (`active`), and in the one last sent (`sent`),
// which it adopts on the swap. A module built for a graph not yet taken waits
// in `fresh` until the next graph carries it.
struct ModuleEntry {
    spec: ModuleSpec,
    controls: Arc<ModuleControls>,
    latency: usize,
    fresh: Option<ModuleBox>,
    active: Option<(usize, usize)>,
    sent: Option<(usize, usize)>,
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
    // Frames a live input's ring holds; its reader keeps the backlog under half.
    live_capacity: usize,
    assets: AssetStore,
    instruments: Instruments,
    transports: automation::Transports,
}

const LIVE_CAPACITY_FRAMES: usize = 16_384;

// A module whose identity changes is built again; anything else is retuned live.
fn module_identity(spec: &ModuleSpec) -> (String, Option<String>, bool, Option<String>) {
    let asset = spec.text(dsp_module::ASSET_PARAM).map(str::to_string);
    (spec.kind.clone(), spec.effect.clone(), spec.key.is_some(), asset)
}

fn primary_value(spec: &ModuleSpec) -> f32 {
    automation::primary_param(&spec.kind).map_or(0.0, |param| spec.number(param, 0.0) as f32)
}

fn write_controls(controls: &ModuleControls, spec: &ModuleSpec) {
    controls.value.set(primary_value(spec));
    if spec.kind == dsp_module::MODULE_TYPE {
        if let Ok(kind) = dsp_module::kind_of(spec) {
            dsp_module::write_parameters(kind, &controls.parameters, spec);
        }
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
        Self::with_live_capacity(sample_rate, LIVE_CAPACITY_FRAMES)
    }

    // A graph played in the device callback itself (the direct path) keeps its
    // live inputs a few device buffers deep, so their delay stays that small.
    pub fn with_live_capacity(sample_rate: u32, live_capacity: usize) -> Self {
        Self {
            shared: GraphShared::new(sample_rate), modules: HashMap::new(), captures: HashMap::new(), meters: HashMap::new(),
            live_inputs: HashMap::new(), live_capacity, assets: AssetStore::new(), instruments: Instruments::default(),
            transports: automation::Transports::default(),
        }
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

    // A capture or an impulse response, decoded once, then referred to by
    // `asset_id` from any `dsp` module of the program.
    pub fn load_asset(&mut self, asset_id: &str, asset: StoredAsset) {
        self.assets.insert(asset_id.to_string(), asset);
    }

    pub fn unload_asset(&mut self, asset_id: &str) -> Result<(), String> {
        self.assets.remove(asset_id).map(|_| ()).ok_or_else(|| format!("dsp asset {asset_id} is not loaded"))
    }

    fn build_module(&self, spec: &ModuleSpec) -> Result<ModuleEntry, String> {
        let parameters = if spec.kind == dsp_module::MODULE_TYPE {
            dsp_module::parameter_slots(dsp_module::kind_of(spec)?)
        } else {
            Vec::new()
        };
        let controls = ModuleControls::new(primary_value(spec), spec.bypass, parameters);
        write_controls(&controls, spec);
        let sample_rate = self.sample_rate();
        let mut latency = 0;
        let processor = match spec.kind.as_str() {
            "volume" => Processor::Volume(dsp::SmoothedGain::new(dsp::db_to_amplitude(primary_value(spec)))),
            "pan" => Processor::Pan,
            "mono" => Processor::Mono,
            "send" => Processor::Send(dsp::SmoothedGain::new(dsp::db_to_amplitude(primary_value(spec)))),
            "input" => Processor::Input(dsp::SmoothedGain::new(dsp::db_to_amplitude(primary_value(spec)))),
            dsp_module::MODULE_TYPE => {
                let runtime = DspRuntime::build(spec, &controls.parameters, &self.assets, sample_rate, graph::MAX_BLOCK)?;
                latency = runtime.latency();
                Processor::Dsp(Box::new(runtime))
            }
            other => return Err(format!("mix module type {other} is not an audio module")),
        };
        let fresh = ModuleRuntime::new(controls.clone(), processor, sample_rate);
        Ok(ModuleEntry { spec: spec.clone(), controls, latency, fresh: Some(fresh), active: None, sent: None })
    }

    fn drain_retired(&self) {
        if let Ok(mut retired) = self.shared.retired.lock() {
            retired.clear();
            retired.reserve(4);
        }
    }

    // Where every module runs now: a graph the render thread never took comes
    // back with the modules it carried fresh; one it took is the active graph.
    fn settle_locations(&mut self) -> Result<(), String> {
        let returned = self.shared.pending.lock().map_err(|error| format!("mix graph lock: {error}"))?.take();
        match returned {
            Some(mut graph) => {
                for (id, module) in graph.take_fresh() {
                    if let Some(entry) = self.modules.get_mut(&id) {
                        entry.fresh = Some(module);
                    }
                }
                for entry in self.modules.values_mut() {
                    entry.sent = None;
                }
            }
            None => {
                for entry in self.modules.values_mut() {
                    if let Some(location) = entry.sent.take() {
                        entry.active = Some(location);
                    }
                }
            }
        }
        Ok(())
    }

    pub fn apply(&mut self, program: Program) -> Result<(), String> {
        graph::dependency_order(&program)?;
        self.drain_retired();
        self.settle_locations()?;
        let sample_rate = self.sample_rate();
        let (live_inputs, live_capacity) = (&mut self.live_inputs, self.live_capacity);
        let feeds = Feeds::plan(&program, &mut |device| live_inputs.entry(device.to_string())
            .or_insert_with(|| LiveInput::new(live_capacity)).clone(), &mut self.instruments, sample_rate)?;
        let mut next_modules = HashMap::new();
        let mut parts = Vec::with_capacity(program.strips.len());
        for strip in &program.strips {
            let mut modules = Vec::with_capacity(strip.chain.len());
            for spec in &strip.chain {
                let mut entry = match self.modules.remove(&spec.id) {
                    Some(mut entry) if module_identity(&entry.spec) == module_identity(spec) => {
                        write_controls(&entry.controls, spec);
                        entry.spec = spec.clone();
                        entry
                    }
                    _ => self.build_module(spec)?,
                };
                let module = match (entry.fresh.take(), entry.active) {
                    (Some(fresh), _) => StepModule::Fresh(fresh),
                    (None, Some((at, index))) => StepModule::Adopt(at, index),
                    (None, None) => return Err(format!("mix module {} has no runtime", spec.id)),
                };
                modules.push(module);
                next_modules.insert(spec.id.clone(), entry);
            }
            parts.push(StripParts {
                id: strip.id.clone(),
                capture: self.capture_slot(&strip.id),
                source: feeds.strip_source(&strip.input),
                meter: self.meters.entry(strip.id.clone()).or_insert_with(StripMeter::new).clone(),
                modules,
            });
        }
        let devices: HashSet<String> = feeds.devices().map(str::to_string).collect();
        let routed = feeds.routed();
        let mut compiled = Graph::compile(&program, parts, feeds, &|spec| next_modules.get(&spec.id).map_or(0, |entry| entry.latency))?;
        self.transports.apply(&program, self.shared.frames.load(Ordering::Relaxed));
        compiled.automation = automation::Automation::bind(&program, &self.transports, &|id| next_modules.get(id).map(|entry| entry.controls.clone()))?;
        for (id, location) in compiled.locations() {
            if let Some(entry) = next_modules.get_mut(id) {
                entry.sent = Some(location);
            }
        }
        let live: HashSet<&str> = program.strips.iter().map(|strip| strip.id.as_str()).collect();
        self.captures.retain(|id, _| live.contains(id.as_str()));
        self.instruments.retain(routed);
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
        let entry = self.modules.get_mut(module_id).ok_or_else(|| format!("mix module {module_id} not found"))?;
        entry.controls.request.store(REQUEST_CUT, Ordering::Relaxed);
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

    // The instruments strips may play (instrument.rs): samples, descriptions, notes.
    pub fn instruments(&mut self) -> &mut Instruments {
        &mut self.instruments
    }

    pub fn instruments_ref(&self) -> &Instruments {
        &self.instruments
    }

    pub fn set_instrument(&mut self, spec: InstrumentSpec) -> Result<(), String> {
        let sample_rate = self.sample_rate();
        self.instruments.set(spec, sample_rate)
    }

    pub fn aux_outputs(&self) -> Arc<shared::AuxOutputs> {
        self.shared.aux.clone()
    }
}
