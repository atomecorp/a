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
//! Strips are 1, 2, 4 or 8 channels wide with routes mapped channel by channel
//! (wide.rs); modulators move other modules' parameters, at every frame where
//! the parameter allows it (modulation.rs); a module may run at 2× or 4×.

pub mod automation;
#[cfg(test)]
mod automation_tests;
#[cfg(feature = "decode")]
pub mod clip_decode;
#[cfg(all(test, feature = "decode"))]
mod clip_decode_tests;
#[cfg(feature = "decode")]
mod clip_opus;
pub mod direct_render;
pub mod dsp;
pub mod dsp_module;
#[cfg(test)]
mod dsp_tests;
pub mod freeze;
mod freeze_graph;
#[cfg(feature = "freeze")]
pub mod freeze_plan;
#[cfg(feature = "freeze")]
pub mod freeze_store;
pub mod graph;
mod graph_compile;
pub mod graph_order;
mod graph_render;
pub mod host;
pub mod instrument;
pub mod instrument_actions;
#[cfg(test)]
mod instrument_bank_tests;
pub mod instrument_command;
pub mod instrument_notes;
#[cfg(test)]
mod instrument_notes_tests;
pub mod instrument_spec;
pub mod instrument_synth;
#[cfg(test)]
mod instrument_synth_tests;
#[cfg(test)]
mod instrument_tests;
pub mod load_meter;
mod mix_apply;
pub mod modulation;
#[cfg(test)]
mod modulation_tests;
pub mod module;
#[cfg(feature = "proxy")]
pub mod offline_proxy;
#[cfg(all(test, feature = "proxy", feature = "decode"))]
mod offline_proxy_tests;
pub mod offline_render;
#[cfg(test)]
mod offline_render_tests;
#[cfg(test)]
mod offline_rig;
#[cfg(test)]
mod port_tests;
pub mod program;
pub mod record_tap;
#[cfg(test)]
mod record_tap_tests;
pub mod resample;
pub mod return_ring;
#[cfg(test)]
mod rhythm_tests;
pub mod round_trip;
pub mod route_delivery;
#[cfg(test)]
mod routing_tests;
pub mod shared;
pub mod source_bus;
#[cfg(test)]
mod tests;
pub mod voice;
pub mod voice_control;
#[cfg(test)]
mod voice_tests;
pub mod warp_voice;
#[cfg(test)]
mod warp_voice_tests;
pub mod wide;
#[cfg(test)]
mod wide_tests;

pub use atome_instrument::{EventKind, FrameSource, SampleData, stream as sample_stream};
use dsp_module::{AssetStore, StoredAsset};
use instrument::Instruments;
pub use instrument_spec::InstrumentSpec;
use module::{ModuleBox, ModuleControls, REQUEST_ACTIVE, REQUEST_BYPASS, REQUEST_CUT};
pub use program::{
    InputSpec, KeySource, MixSource, ModulationRoute, ModuleSpec, PortRoute, Program, StripSpec,
    Target,
};
pub use shared::{
    AuxOutputs, MixGraphEffect, MixGraphEffectBuilder, StripCapture, StripCaptureBuilder,
};
use shared::{CaptureSlot, GraphShared, LiveInput, StripMeter};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::Ordering;

// The control thread's view of a module. Its runtime lives in a graph: in the
// one the render thread runs (`active`), and in the one last sent (`sent`),
// which it adopts on the swap. A module built for a graph not yet taken waits
// in `fresh` until the next graph carries it.
struct ModuleEntry {
    spec: ModuleSpec,
    controls: Arc<ModuleControls>,
    // The width of its strip: a module moved to a strip of another width is built anew.
    channels: usize,
    latency: usize,
    // It rings on long after its input stops (a reverb, an echo): never inside a frozen stem (R-370).
    long_tail: bool,
    fresh: Option<ModuleBox>,
    active: Option<(usize, usize)>,
    sent: Option<(usize, usize)>,
}

// A `dsp` module's live measurements, in its kind's `readings` order.
#[derive(Clone, Debug, PartialEq)]
pub struct ModuleReading {
    pub module_id: String,
    pub values: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StripLevel {
    pub strip_id: String,
    // The loudest sample of both channels, then of each (the console's edges, user 23 Nov. 2026, R-285).
    pub peak: f32,
    pub peak_left: f32,
    pub peak_right: f32,
    pub rms: f32,
}

pub struct MixGraph {
    shared: Arc<GraphShared>,
    modules: HashMap<String, ModuleEntry>,
    captures: HashMap<String, Arc<CaptureSlot>>,
    meters: HashMap<String, Arc<StripMeter>>,
    // Each strip's stem and load share (R-370, freeze_graph.rs).
    freezes: freeze_graph::Freezes,
    // By interface and the channels taken from it (R-286).
    live_inputs: HashMap<(String, Vec<u16>), Arc<LiveInput>>,
    record_taps: HashMap<String, Arc<record_tap::RecordTap>>,
    // Frames a live input's ring holds; its reader keeps the backlog under half.
    live_capacity: usize,
    assets: AssetStore,
    instruments: Instruments,
    transports: automation::Transports,
    output_latency: usize,
}

const LIVE_CAPACITY_FRAMES: usize = 16_384;

type Identity = (String, Option<String>, bool, Option<String>, Option<u8>);

// A module whose identity changes is built again; anything else is retuned live.
fn module_identity(spec: &ModuleSpec) -> Identity {
    let asset = spec.text(dsp_module::ASSET_PARAM).map(str::to_string);
    (
        spec.kind.clone(),
        spec.effect.clone(),
        spec.key.is_some(),
        asset,
        spec.oversample.filter(|factor| *factor > 1),
    )
}

fn primary_value(spec: &ModuleSpec) -> f32 {
    automation::primary_param(&spec.kind).map_or(0.0, |param| spec.number(param, 0.0) as f32)
}

fn write_controls(controls: &ModuleControls, spec: &ModuleSpec) {
    controls.value.set(primary_value(spec));
    if spec.kind == dsp_module::MODULE_TYPE
        && let Ok(kind) = dsp_module::kind_of(spec)
    {
        dsp_module::write_parameters(kind, &controls.parameters, spec);
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
            shared: GraphShared::new(sample_rate),
            modules: HashMap::new(),
            captures: HashMap::new(),
            meters: HashMap::new(),
            freezes: freeze_graph::Freezes::default(),
            live_inputs: HashMap::new(),
            record_taps: HashMap::new(),
            live_capacity,
            assets: AssetStore::new(),
            instruments: Instruments::default(),
            transports: automation::Transports::default(),
            output_latency: 0,
        }
    }

    pub fn effect_builder(&self) -> MixGraphEffectBuilder {
        MixGraphEffectBuilder {
            shared: self.shared.clone(),
        }
    }

    pub fn capture_builder(&mut self, strip_id: &str) -> StripCaptureBuilder {
        StripCaptureBuilder {
            slot: self.capture_slot(strip_id),
        }
    }

    pub fn capture_slot(&mut self, strip_id: &str) -> Arc<CaptureSlot> {
        self.captures
            .entry(strip_id.to_string())
            .or_insert_with(CaptureSlot::new)
            .clone()
    }

    pub fn sample_rate(&self) -> u32 {
        self.shared.sample_rate.load(Ordering::Relaxed).max(1)
    }

    // A capture or an impulse response, decoded once, then referred to by
    // `asset_id` from any `dsp` module of the program.
    pub fn load_asset(&mut self, asset_id: &str, asset: StoredAsset) {
        self.assets.insert(asset_id.to_string(), asset);
    }

    // The assets loaded, as an offline render of this engine's project reads them (R-349).
    pub fn assets(&self) -> &AssetStore {
        &self.assets
    }

    pub fn unload_asset(&mut self, asset_id: &str) -> Result<(), String> {
        self.assets
            .remove(asset_id)
            .map(|_| ())
            .ok_or_else(|| format!("dsp asset {asset_id} is not loaded"))
    }

    pub fn set_bypass(&mut self, module_id: &str, bypass: bool) -> Result<(), String> {
        let entry = self
            .modules
            .get_mut(module_id)
            .ok_or_else(|| format!("mix module {module_id} not found"))?;
        entry.spec.bypass = bypass;
        write_controls(&entry.controls, &entry.spec.clone());
        Ok(())
    }

    // Second left swipe while a tail rings: stop now and clear the effect state.
    pub fn cut_tail(&mut self, module_id: &str) -> Result<(), String> {
        let entry = self
            .modules
            .get_mut(module_id)
            .ok_or_else(|| format!("mix module {module_id} not found"))?;
        entry.controls.request.store(REQUEST_CUT, Ordering::Relaxed);
        Ok(())
    }

    // Live inputs the current program monitors, by device id (the host opens them); one device may appear for several
    // inputs, each taking its own channels (`LiveInput::channels`).
    pub fn live_inputs(&self) -> Vec<(String, Arc<LiveInput>)> {
        self.live_inputs
            .iter()
            .map(|((device, _), input)| (device.clone(), input.clone()))
            .collect()
    }

    pub fn module_state(&self, module_id: &str) -> Option<u8> {
        self.modules
            .get(module_id)
            .map(|entry| entry.controls.state.load(Ordering::Relaxed))
    }

    /// Frames the graph's main mix arrives late by (its latency-compensated routes).
    pub fn output_latency_frames(&self) -> usize {
        self.output_latency
    }

    pub fn levels(&self) -> Vec<StripLevel> {
        let mut levels: Vec<StripLevel> = self
            .meters
            .iter()
            .map(|(strip_id, meter)| {
                let reading = meter.read();
                StripLevel {
                    strip_id: strip_id.clone(),
                    peak: reading.left.max(reading.right),
                    peak_left: reading.left,
                    peak_right: reading.right,
                    rms: reading.rms,
                }
            })
            .collect();
        levels.sort_by(|left, right| left.strip_id.cmp(&right.strip_id));
        levels
    }

    // The measurements of every module that publishes some (gain reduction,
    // loudness, a spectrum), sorted by module id.
    pub fn readings(&self) -> Vec<ModuleReading> {
        let mut readings: Vec<ModuleReading> = self
            .modules
            .iter()
            .filter(|(_, entry)| !entry.controls.readings.is_empty())
            .map(|(module_id, entry)| ModuleReading {
                module_id: module_id.clone(),
                values: entry
                    .controls
                    .readings
                    .iter()
                    .map(|slot| slot.get())
                    .collect(),
            })
            .collect();
        readings.sort_by(|left, right| left.module_id.cmp(&right.module_id));
        readings
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
