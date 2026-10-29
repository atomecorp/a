// Direct path (todo/effets_generateurs_audio L2): a second mix graph played
// inside the device's output callback itself, not rendered ahead of it, for
// what is played live (a standalone effect, a monitored input). Its live inputs
// are rings a few device buffers deep, read in the same cycle; its output
// passes a limiter that is always on; while it has strips the device runs with
// small buffers. The timeline keeps its own graph, rendered ahead.

use super::{live_input, output_idle};
use atome_mix_graph::direct_render::{DirectRender, LIVE_RING_FRAMES};
pub use atome_mix_graph::direct_render::BUFFER_FRAMES;
use atome_mix_graph::dsp_module::StoredAsset;
use atome_mix_graph::round_trip;
use atome_mix_graph::{MixGraph, Program, StripLevel};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub type SharedDirect = Arc<Mutex<DirectRender>>;

struct DirectGraph {
    graph: MixGraph,
    // The program last applied, put back after a measurement.
    program: Program,
}

static GRAPH: Mutex<Option<DirectGraph>> = Mutex::new(None);
static ACTIVE: AtomicBool = AtomicBool::new(false);
// The device stream must be opened again with the buffer the path now needs.
static REBUILD: AtomicBool = AtomicBool::new(false);
// The buffers the devices really use (last callback), whatever was asked.
static OUTPUT_QUANTUM: AtomicUsize = AtomicUsize::new(0);
static INPUT_QUANTUM: AtomicUsize = AtomicUsize::new(0);

pub(crate) fn note_output_quantum(frames: usize) {
    OUTPUT_QUANTUM.store(frames, Ordering::Relaxed);
}

pub(crate) fn note_input_quantum(frames: usize) {
    INPUT_QUANTUM.store(frames, Ordering::Relaxed);
}

// A started backend's direct path: an empty graph and the render its device callback owns.
pub(crate) fn install(sample_rate: u32) -> SharedDirect {
    let graph = MixGraph::with_live_capacity(sample_rate, LIVE_RING_FRAMES);
    let render = Arc::new(Mutex::new(DirectRender::new(graph.effect_builder().into_effect(), sample_rate)));
    if let Ok(mut slot) = GRAPH.lock() {
        *slot = Some(DirectGraph { graph, program: Program::default() });
    }
    ACTIVE.store(false, Ordering::Release);
    render
}

pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Acquire)
}

pub(crate) fn take_rebuild() -> bool {
    REBUILD.swap(false, Ordering::AcqRel)
}

// The buffer the device is asked for: the direct path's when it plays, within
// what the device accepts, else the device's own. On iOS a stream takes no
// buffer size: the app sets the session's IO buffer duration instead
// (AppNativeKiraEngine.swift#applyDirectBuffer). On Windows the exclusive
// stream always runs at its smallest period (wasapi_duplex.rs).
#[cfg(target_os = "ios")]
pub(crate) fn buffer_size(_supported: &cpal::SupportedBufferSize) -> cpal::BufferSize {
    cpal::BufferSize::Default
}

#[cfg(not(any(target_os = "ios", target_os = "windows")))]
pub(crate) fn buffer_size(supported: &cpal::SupportedBufferSize) -> cpal::BufferSize {
    match supported {
        cpal::SupportedBufferSize::Range { min, max } if is_active() => cpal::BufferSize::Fixed(BUFFER_FRAMES.clamp(*min, *max)),
        _ => cpal::BufferSize::Default,
    }
}

fn with_direct<T>(action: impl FnOnce(&mut DirectGraph) -> Result<T, String>) -> Result<T, String> {
    let mut guard = GRAPH.lock().map_err(|error| format!("Lock error: {error}"))?;
    action(guard.as_mut().ok_or("Audio engine not initialized")?)
}

pub(crate) fn with_graph<T>(action: impl FnOnce(&mut MixGraph) -> Result<T, String>) -> Result<T, String> {
    with_direct(|direct| action(&mut direct.graph))
}

pub fn apply(program: Program) -> Result<usize, String> {
    with_direct(|direct| {
        direct.program = program.clone();
        Ok(())
    })?;
    play(program)
}

fn play(program: Program) -> Result<usize, String> {
    let count = program.strips.len();
    let inputs = with_graph(|graph| {
        graph.apply(program)?;
        Ok(graph.live_inputs())
    })?;
    if ACTIVE.swap(count > 0, Ordering::AcqRel) != (count > 0) {
        REBUILD.store(true, Ordering::Release);
    }
    if count > 0 {
        output_idle::note_activity();
    }
    live_input::sync_direct(inputs)?;
    Ok(count)
}

pub fn load_asset(asset_id: &str, asset: StoredAsset) -> Result<(), String> {
    with_graph(|graph| {
        graph.load_asset(asset_id, asset);
        Ok(())
    })
}

pub fn unload_asset(asset_id: &str) -> Result<(), String> {
    with_graph(|graph| graph.unload_asset(asset_id))
}

pub fn levels() -> Result<Vec<StripLevel>, String> {
    with_graph(|graph| Ok(graph.levels()))
}

pub fn cut_tail(module_id: &str) -> Result<(), String> {
    with_graph(|graph| graph.cut_tail(module_id))
}

pub fn module_state(module_id: &str) -> Result<Option<u8>, String> {
    with_graph(|graph| Ok(graph.module_state(module_id)))
}

// Measures the round trip of the direct path through `device_id` (see
// `direct_latency.rs`), then puts the program back.
pub fn measure_round_trip(device_id: &str, sample_rate: u32) -> Result<serde_json::Value, String> {
    let probe: Program = serde_json::from_value(serde_json::json!({ "strips": [{
        "id": "direct_round_trip", "input": { "kind": "live_audio", "device_id": device_id }, "output": { "kind": "main" }
    }] })).map_err(|error| format!("direct probe program: {error}"))?;
    let previous = with_direct(|direct| Ok(direct.program.clone()))?;
    play(probe)?;
    // The device opens again with the small buffer before the probe starts.
    std::thread::sleep(Duration::from_millis(600));
    let inputs = with_graph(|graph| Ok(graph.live_inputs()))?;
    round_trip::arm();
    let started = Instant::now();
    // The frames waiting in the input ring between two output callbacks.
    let mut backlog = 0;
    let results = loop {
        backlog = inputs.iter().map(|(_, input)| input.available()).fold(backlog, usize::max);
        if let Some(results) = round_trip::results() {
            break Ok(results);
        }
        if started.elapsed() > Duration::from_secs(5) {
            break Err("direct_round_trip_timeout".to_string());
        }
        std::thread::sleep(Duration::from_millis(1));
    };
    play(previous)?;
    let results = results?;
    let mut heard: Vec<u32> = results.iter().flatten().copied().collect();
    heard.sort_unstable();
    let median = heard.get(heard.len() / 2).copied();
    Ok(serde_json::json!({
        "device_id": device_id,
        "frames": results,
        "median_frames": median,
        "median_ms": median.map(|frames| f64::from(frames) * 1000.0 / f64::from(sample_rate.max(1))),
        "requested_buffer_frames": BUFFER_FRAMES,
        "output_buffer_frames": OUTPUT_QUANTUM.load(Ordering::Relaxed),
        "input_buffer_frames": INPUT_QUANTUM.load(Ordering::Relaxed),
        "max_ring_backlog_frames": backlog,
        "sample_rate": sample_rate,
        "heard": heard.len(),
        "sent": round_trip::IMPULSES,
    }))
}
