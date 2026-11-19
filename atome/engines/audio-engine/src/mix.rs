// Mixer commands of the native engine (Tauri desktop and iOS): the program
// compiled from the canonical `timeline.mix`, meters and tail cuts.

use super::playback::ENGINE;
use atome_mix_graph::{Program, StripLevel};
use std::sync::atomic::{AtomicUsize, Ordering};

// The console graph's output latency (frames), read without the engine's lock.
static OUTPUT_LATENCY: AtomicUsize = AtomicUsize::new(0);

pub fn output_latency_frames() -> usize {
    OUTPUT_LATENCY.load(Ordering::Acquire)
}

fn with_engine<T>(
    action: impl FnOnce(&mut super::playback::PlaybackEngine) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = ENGINE
        .write()
        .map_err(|error| format!("Lock error: {error}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    action(engine)
}

pub fn apply_program(program: Program) -> Result<usize, String> {
    let (count, inputs) = with_engine(|engine| {
        let count = engine.mix.apply(&mut engine.manager, program)?;
        OUTPUT_LATENCY.store(
            engine.mix.graph().output_latency_frames(),
            Ordering::Release,
        );
        Ok((count, engine.mix.graph().live_inputs()))
    })?;
    super::live_input::sync_console(inputs)?;
    Ok(count)
}

// The real inputs and outputs a strip can use: the active output device
// (its channel pairs) and every input device.
pub fn devices() -> serde_json::Value {
    serde_json::json!({
        "outputs": super::aux_outputs::output_device().map(|device| vec![serde_json::json!({
            "id": device.id, "name": device.name, "channels": device.channels, "isDefault": true
        })]).unwrap_or_default(),
        "inputs": super::live_input::input_devices()
    })
}

// A `.nam` capture or a WAV impulse response, decoded once for every `dsp`
// module that names it.
pub fn load_asset(
    asset_id: &str,
    asset: atome_mix_graph::dsp_module::StoredAsset,
) -> Result<(), String> {
    // The direct path's graph gets the same decoded asset (shared, not copied).
    super::direct::load_asset(asset_id, asset.clone())?;
    with_engine(|engine| {
        engine.mix.load_asset(asset_id, asset);
        Ok(())
    })
}

pub fn unload_asset(asset_id: &str) -> Result<(), String> {
    super::direct::unload_asset(asset_id)?;
    with_engine(|engine| engine.mix.unload_asset(asset_id))
}

pub fn levels() -> Result<Vec<StripLevel>, String> {
    with_engine(|engine| Ok(engine.mix.levels()))
}

pub fn readings() -> Result<Vec<atome_mix_graph::ModuleReading>, String> {
    with_engine(|engine| Ok(engine.mix.readings()))
}

pub fn cut_tail(module_id: &str) -> Result<(), String> {
    with_engine(|engine| engine.mix.cut_tail(module_id))
}

pub fn module_state(module_id: &str) -> Result<Option<u8>, String> {
    with_engine(|engine| Ok(engine.mix.module_state(module_id)))
}

// A take on a strip's REC point (R-183, recorder_strip.rs): armed on the console graph, the strip hearing
// `device_id`; the graph's rate is the take's.
pub fn arm_record(
    strip_id: &str,
    device_id: Option<&str>,
) -> Result<(std::sync::Arc<atome_mix_graph::record_tap::RecordTap>, u32), String> {
    with_engine(|engine| {
        let graph = engine.mix.graph_mut();
        let tap = graph.arm_record(strip_id, device_id)?;
        Ok((tap, graph.sample_rate()))
    })
}

pub fn disarm_record(strip_id: &str) -> Result<(), String> {
    with_engine(|engine| engine.mix.graph_mut().disarm_record(strip_id))
}
