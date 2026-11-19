// Compiled mix graph: strips in dependency order, each with its module chain,
// its routes (sends, routed ports of a split, output) and their latency-
// compensation delays, plus the key lanes that carry sidechains. A route or a
// key reaching a strip already processed closes a loop, which is allowed
// (D27): it goes through a Return that delivers it RETURN_FRAMES later. An IN
// module (D-S3) mixes a source into its chain at its level: a live input or an
// instrument output from the chunk's source buses (source_bus.rs), or a
// strip's post-chain signal on a lane like a key's — the same chunk when that
// strip runs earlier, else through a return (a loop through IN is allowed).
// A strip is 1, 2, 4 or 8 channels wide (wide.rs); modulators write control
// lanes their targets read (modulation.rs). Compilation: graph_compile.rs;
// rendering: graph_render.rs.

use crate::dsp::SmoothedGain;
pub use crate::graph_order::{Compensation, compensation, dependency_order};
use crate::modulation::{ControlLane, ParamMod};
use crate::module::ModuleBox;
use crate::return_ring::ReturnRing;
pub use crate::route_delivery::{Route, RouteTarget};
use crate::shared::{CaptureSlot, StripMeter};
use crate::source_bus::{SourceBus, StripSource};
use crate::wide::Wide;
use kira::Frame;
use std::sync::Arc;

pub const MAX_BLOCK: usize = 4096;
// A loop closes through this fixed delay; a graph with a loop renders in
// chunks no longer than it, so a return always lands in a later chunk.
pub const RETURN_FRAMES: usize = 128;
// Where a key travels: a buffer filled earlier in the same chunk, or a return.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Lane {
    Direct(usize),
    Return(usize),
}

// What an IN module reads: a source bus (feed, output), or a strip on a lane.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MixIn {
    Bus(usize, usize),
    Lane(Lane),
}

pub struct ChainStep {
    pub module_id: String,
    pub module: Option<ModuleBox>,
    // Where the module runs in the graph before this one; taken on the swap.
    pub adopt: Option<(usize, usize)>,
    pub send: Option<Route>,
    // Routed ports (a port may go to several places) and which ports leave.
    pub ports: Vec<(usize, Route)>,
    pub routed: Vec<bool>,
    // Ports read as a key elsewhere (port 0 is the module's own output).
    pub taps: Vec<(usize, Lane)>,
    pub key: Option<Lane>,
    pub mix: Option<MixIn>,
    // The control lanes a modulator writes (output, lane), and the parameters
    // this module takes modulated.
    pub controls_out: Vec<(usize, usize)>,
    pub mods: Vec<ParamMod>,
}

pub struct StripRuntime {
    pub id: String,
    pub capture: Arc<CaptureSlot>,
    pub source: StripSource,
    pub meter: Arc<StripMeter>,
    pub chain: Vec<ChainStep>,
    pub output: Option<Route>,
    pub output_enabled: bool,
    pub muted: bool,
    pub channels: usize,
    pub(crate) mute_gain: Vec<SmoothedGain>,
    pub(crate) inbox: Wide,
    // The first of its returns (one per pair) when a route reaches it backwards.
    pub(crate) inbox_return: Option<usize>,
    // Taps of the strip's post-chain signal (a strip chosen as a key).
    pub(crate) post_taps: Vec<Lane>,
    pub(crate) work: Wide,
    pub(crate) scratch: Wide,
    pub(crate) key: Vec<Frame>,
}

pub struct Graph {
    pub strips: Vec<StripRuntime>,
    pub main: Vec<Frame>,
    pub aux: Vec<(u16, Vec<Frame>)>,
    pub(crate) feeds: Vec<SourceBus>,
    pub(crate) lanes: Vec<Vec<Frame>>,
    pub(crate) rings: Vec<ReturnRing>,
    pub(crate) controls: Vec<ControlLane>,
    pub(crate) clock: usize,
    pub(crate) chunk: usize,
    pub automation: crate::automation::Automation,
    // Frames the main mix arrives late by (its slowest compensated route).
    pub output_latency: usize,
}

pub enum StepModule {
    Fresh(ModuleBox),
    Adopt(usize, usize),
}

pub struct StripParts {
    pub id: String,
    pub capture: Arc<CaptureSlot>,
    pub source: StripSource,
    pub meter: Arc<StripMeter>,
    pub modules: Vec<StepModule>,
}

impl Graph {
    // Render thread: takes over the modules the previous graph ran, so their
    // state survives the edit. Moves boxes only, never allocates.
    pub fn adopt(&mut self, previous: &mut Graph) {
        for strip in &mut self.strips {
            for step in &mut strip.chain {
                if let Some((at, index)) = step.adopt.take() {
                    step.module = previous
                        .strips
                        .get_mut(at)
                        .and_then(|strip| strip.chain.get_mut(index))
                        .and_then(|step| step.module.take());
                }
            }
        }
    }

    // Where each module sits (position, step) once this graph runs.
    pub fn locations(&self) -> impl Iterator<Item = (&str, (usize, usize))> {
        self.strips.iter().enumerate().flat_map(|(at, strip)| {
            strip
                .chain
                .iter()
                .enumerate()
                .map(move |(index, step)| (step.module_id.as_str(), (at, index)))
        })
    }

    // Control thread: the fresh modules of a graph the render thread never took.
    pub fn take_fresh(&mut self) -> Vec<(String, ModuleBox)> {
        let mut fresh = Vec::new();
        for strip in &mut self.strips {
            for step in &mut strip.chain {
                if step.adopt.is_none()
                    && let Some(module) = step.module.take()
                {
                    fresh.push((step.module_id.clone(), module));
                }
            }
        }
        fresh
    }
}
