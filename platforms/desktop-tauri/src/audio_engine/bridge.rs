// Tauri commands of the audio engine: each wraps the shared command of
// atome-audio-engine (`commands`), the one the iOS app dispatches by name.

use super::commands;
use atome_mix_graph::voice::{ScheduledVoice, VoiceRequest};
use base64::Engine;
use serde_json::Value;

#[tauri::command]
pub fn audio_init() -> Result<Value, String> {
    commands::init()
}

#[tauri::command]
pub async fn audio_load_clip(
    paths: tauri::State<'_, crate::ProjectPaths>,
    id: String,
    path: String,
) -> Result<Value, String> {
    let project_root = paths.project_root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        commands::load_clip(Some(&project_root), &id, &path)
    })
    .await
    .map_err(|error| format!("audio_load_clip_task_failed: {error}"))?
}

// The page sends a clip's bytes in base64 (`kira_audio_commands.js#buildNativeClipBytesPayload`), never a JSON array.
#[tauri::command]
pub async fn audio_load_clip_from_bytes(id: String, bytes_base64: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(bytes_base64)
            .map_err(|error| format!("audio_clip_bytes_base64_invalid: {error}"))?;
        commands::load_clip_from_bytes(&id, bytes)
    })
    .await
    .map_err(|error| format!("audio_load_clip_from_bytes_task_failed: {error}"))?
}

// A sound's length read from its container, never decoded (an upload's duration); its bytes in base64 as above.
#[tauri::command]
pub async fn audio_probe_duration_from_bytes(bytes_base64: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(bytes_base64)
            .map_err(|error| format!("audio_clip_bytes_base64_invalid: {error}"))?;
        commands::probe_duration_from_bytes(&bytes)
    })
    .await
    .map_err(|error| format!("audio_probe_duration_from_bytes_task_failed: {error}"))?
}

#[tauri::command]
pub fn audio_has_clip(id: String) -> Result<Value, String> {
    commands::has_clip(&id)
}

#[tauri::command]
pub fn audio_play(id: String) -> Result<Value, String> {
    commands::play(&id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn audio_play_instance(
    asset_id: String,
    voice_id: String,
    start_seconds: f64,
    duration_seconds: Option<f64>,
    gain: f64,
    pan: f64,
    rate: f64,
    loop_start_seconds: Option<f64>,
    loop_end_seconds: Option<f64>,
    strip_id: Option<String>,
) -> Result<Value, String> {
    let request = VoiceRequest {
        start_seconds,
        duration_seconds,
        gain,
        pan,
        rate,
        loop_start_seconds,
        loop_end_seconds,
        envelope: None,
        reverse: false,
        warp: None,
    };
    commands::play_instance(&asset_id, &voice_id, &request, strip_id.as_deref())
}

// Many voices in one call (one IPC round trip); returns each one's start frame.
#[tauri::command]
pub fn audio_schedule_instances(voices: Vec<ScheduledVoice>) -> Result<Value, String> {
    commands::schedule_instances(&voices)
}

#[tauri::command]
pub fn audio_set_voice_end(
    voice_id: String,
    end_frame: u64,
    release_frames: u64,
) -> Result<Value, String> {
    commands::set_voice_end(&voice_id, end_frame, release_frames)
}

#[tauri::command]
pub fn audio_measure_input_latency(device_name: Option<String>) -> Result<Value, String> {
    commands::measure_input_latency(device_name.as_deref())
}

#[tauri::command]
pub fn audio_render_clock() -> Result<Value, String> {
    commands::render_clock()
}

#[tauri::command]
pub fn audio_output_hold(owner: String, on: bool) -> Result<Value, String> {
    commands::output_hold(&owner, on)
}

#[tauri::command]
pub fn audio_mix_apply(program: Value) -> Result<Value, String> {
    commands::mix_apply(program)
}

// A shared project's proxy (R-349): its render plan played offline, its Ogg Opus file — or, with the page's coded
// picture (`video`), its MP4 — back in base64.
#[tauri::command]
pub async fn audio_render_proxy(
    plan: Value,
    bitrate: Option<u32>,
    video: Option<Value>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        super::render_proxy::command(
            &serde_json::json!({ "plan": plan, "bitrate": bitrate, "video": video }),
        )
    })
    .await
    .map_err(|error| format!("audio_render_proxy_task_failed: {error}"))?
}

// A plan rendered offline, uncoded (R-370 L11: a MIDI clip « Figer »), off the command thread.
#[tauri::command]
pub async fn audio_render_pcm(plan: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        super::render_proxy::render_pcm(&serde_json::json!({ "plan": plan }))
    })
    .await
    .map_err(|error| format!("audio_render_pcm_task_failed: {error}"))?
}

// Track freeze (R-370): `freeze_render` only queues the stem (the engine renders it on its own thread); the others
// read or swap at once.
#[tauri::command(rename_all = "snake_case")]
pub fn audio_freeze_render(plan: Value, strip_id: String) -> Result<Value, String> {
    commands::dispatch_freeze(
        "freeze_render",
        &serde_json::json!({ "plan": plan, "strip_id": strip_id }),
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn audio_freeze_apply(strip_id: String, key: String) -> Result<Value, String> {
    commands::dispatch_freeze(
        "freeze_apply",
        &serde_json::json!({ "strip_id": strip_id, "key": key }),
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn audio_freeze_thaw(strip_id: String) -> Result<Value, String> {
    commands::dispatch_freeze("freeze_thaw", &serde_json::json!({ "strip_id": strip_id }))
}

#[tauri::command]
pub fn audio_freeze_status() -> Result<Value, String> {
    commands::dispatch_freeze("freeze_status", &Value::Null)
}

#[tauri::command]
pub fn audio_freeze_reset_peak() -> Result<Value, String> {
    commands::dispatch_freeze("freeze_reset_peak", &Value::Null)
}

#[tauri::command]
pub fn audio_freeze_retain(keys: Vec<String>) -> Result<Value, String> {
    commands::dispatch_freeze("freeze_retain", &serde_json::json!({ "keys": keys }))
}

#[tauri::command]
pub fn audio_mix_levels() -> Result<Value, String> {
    commands::mix_levels()
}

#[tauri::command]
pub fn audio_mix_readings() -> Result<Value, String> {
    commands::mix_readings()
}

#[tauri::command]
pub fn audio_mix_devices() -> Result<Value, String> {
    commands::mix_devices()
}

// The driver the engine plays through (Windows: WASAPI exclusive or an ASIO driver).
#[tauri::command]
pub fn audio_driver() -> Result<Value, String> {
    atome_audio_engine::audio_driver::state()
}

#[tauri::command]
pub fn audio_driver_set(driver: String, driver_name: Option<String>) -> Result<Value, String> {
    atome_audio_engine::audio_driver::set(&driver, driver_name.as_deref())
}

// Reading and decoding a capture or a long impulse response stays off the UI thread.
#[tauri::command]
pub async fn audio_mix_asset_load(
    paths: tauri::State<'_, crate::ProjectPaths>,
    asset_id: String,
    path: String,
) -> Result<Value, String> {
    let project_root = paths.project_root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        commands::mix_asset_load(Some(&project_root), &asset_id, &path)
    })
    .await
    .map_err(|error| format!("audio_mix_asset_load_task_failed: {error}"))?
}

#[tauri::command]
pub fn audio_mix_asset_unload(asset_id: String) -> Result<Value, String> {
    commands::mix_asset_unload(&asset_id)
}

#[tauri::command]
pub fn audio_mix_cut_tail(module_id: String) -> Result<Value, String> {
    commands::mix_cut_tail(&module_id)
}

// A Sampler's sample, decoded off the UI thread; then the instrument commands
// (description, notes, settings) for the timeline's and the direct path's graphs.
#[tauri::command]
pub async fn audio_instrument_sample_load(
    paths: tauri::State<'_, crate::ProjectPaths>,
    sample_id: String,
    path: String,
) -> Result<Value, String> {
    let project_root = paths.project_root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        commands::instrument_sample_load(Some(&project_root), &sample_id, &path)
    })
    .await
    .map_err(|error| format!("audio_instrument_sample_load_task_failed: {error}"))?
}

#[tauri::command]
pub fn audio_instrument(command: Value) -> Result<Value, String> {
    commands::instrument_run(command)
}

// The direct path: live inputs and standalone effects played in the device callback.
#[tauri::command]
pub fn audio_direct_apply(program: Value) -> Result<Value, String> {
    commands::direct_apply(program)
}

#[tauri::command]
pub fn audio_direct_levels() -> Result<Value, String> {
    commands::direct_levels()
}

#[tauri::command]
pub fn audio_direct_readings() -> Result<Value, String> {
    commands::direct_readings()
}

#[tauri::command]
pub fn audio_direct_cut_tail(module_id: String) -> Result<Value, String> {
    commands::direct_cut_tail(&module_id)
}

#[tauri::command]
pub fn audio_direct_module_state(module_id: String) -> Result<Value, String> {
    commands::direct_module_state(&module_id)
}

// The measure plays and listens for a few seconds: off the UI thread.
#[tauri::command]
pub async fn audio_direct_measure_latency(device_name: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        commands::direct_measure_latency(device_name.as_deref())
    })
    .await
    .map_err(|error| format!("audio_direct_measure_latency_task_failed: {error}"))?
}

#[tauri::command]
pub fn audio_mix_module_state(module_id: String) -> Result<Value, String> {
    commands::mix_module_state(&module_id)
}

#[tauri::command]
pub fn audio_stop(id: String) -> Result<Value, String> {
    commands::stop(&id)
}

#[tauri::command]
pub fn audio_stop_instance(voice_id: String) -> Result<Value, String> {
    commands::stop_instance(&voice_id)
}

#[tauri::command]
pub fn audio_destroy_clip(id: String) -> Result<Value, String> {
    commands::destroy_clip(&id)
}

#[tauri::command]
pub fn audio_set_volume(id: String, db: f64) -> Result<Value, String> {
    commands::set_volume(&id, db)
}

#[tauri::command]
pub fn audio_set_pan(id: String, pan: f64) -> Result<Value, String> {
    commands::set_pan(&id, pan)
}

#[tauri::command]
pub fn audio_set_playback_rate(id: String, rate: f64) -> Result<Value, String> {
    commands::set_playback_rate(&id, rate)
}

#[tauri::command]
pub fn audio_record_start(
    paths: tauri::State<crate::ProjectPaths>,
    session_id: String,
    file_path: String,
    sample_rate: u32,
    channels: u16,
    input_device_name: Option<String>,
) -> Result<Value, String> {
    commands::record_start(
        Some(&paths.project_root),
        &session_id,
        &file_path,
        sample_rate,
        channels,
        input_device_name,
    )
}

#[tauri::command]
pub fn audio_record_stop(session_id: String) -> Result<Value, String> {
    commands::record_stop(&session_id)
}

// A take of a strip's REC point (R-183), stopped by `audio_record_strip_stop`.
#[tauri::command]
pub fn audio_record_strip_start(
    paths: tauri::State<crate::ProjectPaths>,
    session_id: String,
    file_path: String,
    strip_id: String,
    device_id: Option<String>,
) -> Result<Value, String> {
    commands::dispatch(
        "record_strip_start",
        &serde_json::json!({ "sessionId": session_id, "filePath": file_path, "stripId": strip_id, "deviceId": device_id }),
        Some(&paths.project_root),
    )
}

#[tauri::command]
pub fn audio_record_strip_stop(session_id: String) -> Result<Value, String> {
    commands::record_stop(&session_id)
}

#[tauri::command]
pub fn audio_get_levels() -> Result<Value, String> {
    commands::get_levels()
}

#[tauri::command]
pub fn audio_get_scope() -> Result<Value, String> {
    commands::get_scope()
}

#[tauri::command]
pub fn audio_shutdown() -> Result<Value, String> {
    commands::shutdown()
}

#[tauri::command]
pub fn audio_wake_start(sample_rate: u32) -> Result<Value, String> {
    super::wake_capture::start(sample_rate)
}
#[tauri::command]
pub fn audio_wake_stop() -> Result<Value, String> {
    super::wake_capture::stop()
}
#[tauri::command]
pub fn audio_wake_read() -> Result<Value, String> {
    super::wake_capture::read()
}
#[tauri::command]
pub fn audio_wake_state() -> Result<Value, String> {
    super::wake_capture::state()
}

// The native voice engine, through the shared `dispatch` (the iOS app sends the same names).
#[tauri::command]
pub async fn audio_voice_start(
    paths: tauri::State<'_, crate::ProjectPaths>,
    models_root: String,
    listening: String,
) -> Result<Value, String> {
    let project_root = paths.project_root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        commands::dispatch(
            "voice_start",
            &serde_json::json!({ "modelsRoot": models_root, "ownCapture": true, "listening": listening }),
            Some(&project_root),
        )
    })
    .await
    .map_err(|error| format!("audio_voice_start_task_failed: {error}"))?
}
#[tauri::command]
pub fn audio_voice_stop() -> Result<Value, String> {
    commands::dispatch("voice_stop", &serde_json::json!({}), None)
}
#[tauri::command]
pub fn audio_voice_set_phrases(phrases: Vec<String>) -> Result<Value, String> {
    commands::dispatch(
        "voice_set_phrases",
        &serde_json::json!({ "phrases": phrases }),
        None,
    )
}
#[tauri::command]
pub fn audio_voice_set_speaking(speaking: bool) -> Result<Value, String> {
    commands::dispatch(
        "voice_set_speaking",
        &serde_json::json!({ "speaking": speaking }),
        None,
    )
}
#[tauri::command]
pub fn audio_voice_set_listening(listening: String) -> Result<Value, String> {
    commands::dispatch(
        "voice_set_listening",
        &serde_json::json!({ "listening": listening }),
        None,
    )
}
#[tauri::command]
pub fn audio_voice_set_wake_verifier(verifier: Option<String>) -> Result<Value, String> {
    commands::dispatch(
        "voice_set_wake_verifier",
        &serde_json::json!({ "verifier": verifier }),
        None,
    )
}
#[tauri::command]
pub fn audio_voice_read(record: bool) -> Result<Value, String> {
    commands::dispatch("voice_read", &serde_json::json!({ "record": record }), None)
}
