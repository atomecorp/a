// Tauri commands of the audio engine: each wraps the shared command of
// atome-audio-engine (`commands`), the one the iOS app dispatches by name.

use super::commands;
use atome_mix_graph::voice::{ScheduledVoice, VoiceRequest};
use serde_json::Value;

#[tauri::command]
pub fn audio_init() -> Result<Value, String> {
    commands::init()
}

#[tauri::command]
pub async fn audio_load_clip(paths: tauri::State<'_, crate::ProjectPaths>, id: String, path: String) -> Result<Value, String> {
    let project_root = paths.project_root.clone();
    tauri::async_runtime::spawn_blocking(move || commands::load_clip(Some(&project_root), &id, &path))
        .await
        .map_err(|error| format!("audio_load_clip_task_failed: {error}"))?
}

#[tauri::command]
pub async fn audio_load_clip_from_bytes(id: String, bytes: Vec<u8>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || commands::load_clip_from_bytes(&id, bytes))
        .await
        .map_err(|error| format!("audio_load_clip_from_bytes_task_failed: {error}"))?
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
    asset_id: String, voice_id: String, start_seconds: f64, duration_seconds: Option<f64>, gain: f64, pan: f64, rate: f64,
    loop_start_seconds: Option<f64>, loop_end_seconds: Option<f64>, strip_id: Option<String>,
) -> Result<Value, String> {
    let request = VoiceRequest { start_seconds, duration_seconds, gain, pan, rate, loop_start_seconds, loop_end_seconds, envelope: None };
    commands::play_instance(&asset_id, &voice_id, &request, strip_id.as_deref())
}

// Many voices in one call (one IPC round trip); returns each one's start frame.
#[tauri::command]
pub fn audio_schedule_instances(voices: Vec<ScheduledVoice>) -> Result<Value, String> {
    commands::schedule_instances(&voices)
}

#[tauri::command]
pub fn audio_set_voice_end(voice_id: String, end_frame: u64, release_frames: u64) -> Result<Value, String> {
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
pub fn audio_mix_apply(program: Value) -> Result<Value, String> {
    commands::mix_apply(program)
}

#[tauri::command]
pub fn audio_mix_levels() -> Result<Value, String> {
    commands::mix_levels()
}

#[tauri::command]
pub fn audio_mix_devices() -> Result<Value, String> {
    commands::mix_devices()
}

#[tauri::command]
pub fn audio_mix_cut_tail(module_id: String) -> Result<Value, String> {
    commands::mix_cut_tail(&module_id)
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
    paths: tauri::State<crate::ProjectPaths>, session_id: String, file_path: String, sample_rate: u32, channels: u16,
    input_device_name: Option<String>,
) -> Result<Value, String> {
    commands::record_start(Some(&paths.project_root), &session_id, &file_path, sample_rate, channels, input_device_name)
}

#[tauri::command]
pub fn audio_record_stop(session_id: String) -> Result<Value, String> {
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
pub fn audio_wake_start(sample_rate: u32) -> Result<Value, String> { super::wake_capture::start(sample_rate) }
#[tauri::command]
pub fn audio_wake_stop() -> Result<Value, String> { super::wake_capture::stop() }
#[tauri::command]
pub fn audio_wake_read() -> Result<Value, String> { super::wake_capture::read() }

// The native voice engine, through the shared `dispatch` (the iOS app sends the same names).
#[tauri::command]
pub async fn audio_voice_start(paths: tauri::State<'_, crate::ProjectPaths>, models_root: String) -> Result<Value, String> {
    let project_root = paths.project_root.clone();
    tauri::async_runtime::spawn_blocking(move || commands::dispatch("voice_start", &serde_json::json!({ "modelsRoot": models_root, "ownCapture": true }), Some(&project_root)))
        .await
        .map_err(|error| format!("audio_voice_start_task_failed: {error}"))?
}
#[tauri::command]
pub fn audio_voice_stop() -> Result<Value, String> { commands::dispatch("voice_stop", &serde_json::json!({}), None) }
#[tauri::command]
pub fn audio_voice_set_phrases(phrases: Vec<String>) -> Result<Value, String> { commands::dispatch("voice_set_phrases", &serde_json::json!({ "phrases": phrases }), None) }
#[tauri::command]
pub fn audio_voice_set_speaking(speaking: bool) -> Result<Value, String> { commands::dispatch("voice_set_speaking", &serde_json::json!({ "speaking": speaking }), None) }
#[tauri::command]
pub fn audio_voice_set_listening(listening: String) -> Result<Value, String> { commands::dispatch("voice_set_listening", &serde_json::json!({ "listening": listening }), None) }
#[tauri::command]
pub fn audio_voice_set_wake_verifier(verifier: Option<String>) -> Result<Value, String> { commands::dispatch("voice_set_wake_verifier", &serde_json::json!({ "verifier": verifier }), None) }
#[tauri::command]
pub fn audio_voice_read() -> Result<Value, String> { commands::dispatch("voice_read", &serde_json::json!({}), None) }
