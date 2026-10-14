// Tauri command handlers for the audio engine
// Exposes Kira playback + CPAL recording as Tauri commands.

use super::{metering, playback, recorder, transcode};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn clip_metadata_json(metadata: &playback::ClipMetadata) -> Value {
    json!({
        "sample_rate": metadata.sample_rate,
        "frame_count": metadata.frame_count,
        "duration_seconds": metadata.duration_seconds
    })
}

fn resolve_audio_clip_path(project_root: &Path, clip_path: &str) -> Result<PathBuf, String> {
    let raw = String::from(clip_path).trim().to_string();
    if raw.is_empty() {
        return Err("Missing clip path".to_string());
    }
    let candidate = if Path::new(&raw).is_absolute() {
        PathBuf::from(&raw)
    } else {
        project_root.join(&raw)
    };
    if candidate.exists() {
        return candidate.canonicalize().map_err(|e| {
            format!(
                "Unable to canonicalize audio clip path {}: {e}",
                candidate.display()
            )
        });
    }
    Err(format!(
        "Audio clip path does not exist: {}",
        candidate.display()
    ))
}

#[tauri::command]
pub fn audio_init() -> Result<Value, String> {
    playback::init()?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn audio_load_clip(
    paths: tauri::State<'_, crate::ProjectPaths>,
    id: String,
    path: String,
) -> Result<Value, String> {
    let project_root = paths.project_root.clone();
    let asset_id = id.clone();
    let input_path = path.clone();
    let input_path_was_absolute = Path::new(&input_path).is_absolute();
    let load_result = tauri::async_runtime::spawn_blocking(move || {
        let resolved_path = resolve_audio_clip_path(&project_root, &input_path)?;
        let decode_path = transcode::prepare_native_audio_decode_path(&resolved_path)?;
        let metadata = match playback::load_clip(&id, &decode_path.to_string_lossy()) {
            Ok(metadata) => metadata,
            Err(first_error)
                if decode_path != resolved_path
                    && transcode::is_video_container_requiring_native_audio_extract(&resolved_path) =>
            {
                let rebuilt_decode_path = transcode::rebuild_native_audio_decode_path(&resolved_path)?;
                playback::load_clip(&id, &rebuilt_decode_path.to_string_lossy()).map_err(|retry_error| {
                    format!(
                        "native_audio_decode_failed_after_cache_rebuild: first={first_error}; retry={retry_error}"
                    )
                })?
            }
            Err(error) => return Err(error),
        };
        Ok::<_, String>((resolved_path, decode_path, metadata))
    })
    .await
    .map_err(|error| format!("audio_load_clip_task_failed: {error}"))?;
    let (resolved_path, decode_path, metadata) = load_result?;
    Ok(json!({
        "success": true,
        "id": asset_id,
        "path": resolved_path.to_string_lossy().to_string(),
        "decode_path": decode_path.to_string_lossy().to_string(),
        "input_path": path,
        "input_path_was_absolute": input_path_was_absolute,
        "metadata": clip_metadata_json(&metadata),
        "sample_rate": metadata.sample_rate,
        "frame_count": metadata.frame_count,
        "duration_seconds": metadata.duration_seconds
    }))
}

#[tauri::command]
pub async fn audio_load_clip_from_bytes(id: String, bytes: Vec<u8>) -> Result<Value, String> {
    let byte_len = bytes.len();
    let asset_id = id.clone();
    let metadata = tauri::async_runtime::spawn_blocking(move || {
        // Pass owned Vec to avoid an extra .to_vec() copy inside playback
        playback::load_clip_from_bytes(&asset_id, bytes)
    })
    .await
    .map_err(|error| format!("audio_load_clip_from_bytes_task_failed: {error}"))??;
    Ok(json!({
        "success": true,
        "id": id,
        "bytes_len": byte_len,
        "metadata": clip_metadata_json(&metadata),
        "sample_rate": metadata.sample_rate,
        "frame_count": metadata.frame_count,
        "duration_seconds": metadata.duration_seconds
    }))
}

#[tauri::command]
pub fn audio_has_clip(id: String) -> Result<Value, String> {
    let loaded = playback::has_clip(&id)?;
    Ok(json!({
        "success": true,
        "id": id,
        "loaded": loaded
    }))
}

#[tauri::command]
pub fn audio_play(id: String) -> Result<Value, String> {
    playback::play(&id)?;
    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
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
    playback::play_instance(
        &asset_id,
        &voice_id,
        start_seconds,
        duration_seconds,
        gain,
        pan,
        rate,
        loop_start_seconds,
        loop_end_seconds,
        strip_id.as_deref(),
    )?;
    Ok(json!({
        "success": true,
        "asset_id": asset_id,
        "voice_id": voice_id
    }))
}

// Starts a voice exactly on a rendered frame; returns the frame it starts on.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn audio_schedule_instance(
    asset_id: String,
    voice_id: String,
    start_seconds: f64,
    duration_seconds: Option<f64>,
    gain: f64,
    pan: f64,
    rate: f64,
    start_render_frame: u64,
    strip_id: Option<String>,
) -> Result<Value, String> {
    let frame = super::playback_schedule::schedule_instance(
        &asset_id, &voice_id, start_seconds, duration_seconds, gain, pan, rate, start_render_frame, strip_id.as_deref(),
    )?;
    Ok(json!({ "success": true, "voice_id": voice_id, "start_render_frame": frame }))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRequest {
    asset_id: String,
    voice_id: String,
    start_seconds: f64,
    duration_seconds: Option<f64>,
    gain: f64,
    pan: f64,
    rate: f64,
    start_render_frame: u64,
    #[serde(default)]
    strip_id: Option<String>,
}

// Many voices in one call (one IPC round trip); returns each one's start frame.
#[tauri::command]
pub fn audio_schedule_instances(voices: Vec<ScheduleRequest>) -> Result<Value, String> {
    let frames = voices
        .iter()
        .map(|voice| super::playback_schedule::schedule_instance(
            &voice.asset_id, &voice.voice_id, voice.start_seconds, voice.duration_seconds,
            voice.gain, voice.pan, voice.rate, voice.start_render_frame, voice.strip_id.as_deref(),
        ))
        .collect::<Result<Vec<u64>, String>>()?;
    Ok(json!({ "success": true, "start_render_frames": frames }))
}

// The render clock: rendered frames, and which one the device plays at which host instant.
#[tauri::command]
pub fn audio_render_clock() -> Result<Value, String> {
    Ok(json!({ "success": true, "clock": super::playback_schedule::render_clock() }))
}

// Mixer graph: program compiled from the canonical timeline mix.
#[tauri::command]
pub fn audio_mix_apply(program: Value) -> Result<Value, String> {
    let program: atome_mix_graph::Program = serde_json::from_value(program).map_err(|error| format!("mix program invalid: {error}"))?;
    let strips = super::mix::apply_program(program)?;
    Ok(json!({ "success": true, "strips": strips }))
}

#[tauri::command]
pub fn audio_mix_levels() -> Result<Value, String> {
    let levels: Vec<Value> = super::mix::levels()?.into_iter()
        .map(|level| json!({ "strip_id": level.strip_id, "peak": level.peak, "rms": level.rms }))
        .collect();
    Ok(json!({ "success": true, "levels": levels }))
}

#[tauri::command]
pub fn audio_mix_devices() -> Result<Value, String> {
    Ok(json!({ "success": true, "devices": super::mix::devices() }))
}

#[tauri::command]
pub fn audio_mix_cut_tail(module_id: String) -> Result<Value, String> {
    super::mix::cut_tail(&module_id)?;
    Ok(json!({ "success": true, "module_id": module_id }))
}

#[tauri::command]
pub fn audio_mix_module_state(module_id: String) -> Result<Value, String> {
    let state = super::mix::module_state(&module_id)?;
    Ok(json!({ "success": true, "module_id": module_id, "state": state }))
}

#[tauri::command]
pub fn audio_stop(id: String) -> Result<Value, String> {
    playback::stop(&id)?;
    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
pub fn audio_stop_instance(voice_id: String) -> Result<Value, String> {
    playback::stop_instance(&voice_id)?;
    Ok(json!({ "success": true, "voice_id": voice_id }))
}

#[tauri::command]
pub fn audio_destroy_clip(id: String) -> Result<Value, String> {
    playback::destroy_clip(&id)?;
    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
pub fn audio_set_volume(id: String, db: f64) -> Result<Value, String> {
    playback::set_volume(&id, db)?;
    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
pub fn audio_set_pan(id: String, pan: f64) -> Result<Value, String> {
    playback::set_pan(&id, pan)?;
    Ok(json!({ "success": true, "id": id, "pan": pan }))
}

#[tauri::command]
pub fn audio_set_playback_rate(id: String, rate: f64) -> Result<Value, String> {
    playback::set_playback_rate(&id, rate)?;
    Ok(json!({ "success": true, "id": id }))
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
    // Resolve path relative to project root if not absolute
    let abs_path = if std::path::Path::new(&file_path).is_absolute() {
        file_path.clone()
    } else {
        paths
            .project_root
            .join(&file_path)
            .to_string_lossy()
            .to_string()
    };

    metering::reset();
    recorder::start_on_device(&session_id, &abs_path, sample_rate, channels, input_device_name)?;
    Ok(json!({
        "success": true,
        "session_id": session_id,
        "file_path": file_path,
        "absolute_file_path": abs_path
    }))
}

#[tauri::command]
pub fn audio_record_stop(session_id: String) -> Result<Value, String> {
    let result = recorder::stop(&session_id)?;
    Ok(json!({
        "success": true,
        "session_id": result.session_id,
        "absolute_file_path": result.file_path,
        "size_bytes": result.size_bytes,
        "duration_sec": result.duration_sec,
        "frame_count": result.frame_count,
        "overrun_frames": result.overrun_frames,
        "sample_rate": result.sample_rate,
        "channels": result.channels,
        "capture_clock": result.capture_clock,
        "output_format": result.output_format
    }))
}

#[tauri::command]
pub fn audio_get_levels() -> Result<Value, String> {
    let levels = metering::get_levels();
    Ok(json!({
        "rms": levels.rms,
        "peak": levels.peak,
        "rms_db": levels.rms_db,
        "peak_db": levels.peak_db,
        "smoothed_rms": levels.smoothed_rms,
        "smoothed_rms_db": levels.smoothed_rms_db,
        "clip_count": levels.clip_count
    }))
}

#[tauri::command]
pub fn audio_get_scope() -> Result<Value, String> {
    let scope = metering::get_scope();
    let levels = metering::get_levels();
    Ok(json!({
        "available": scope.available,
        "sequence": scope.sequence,
        "sample_rate": scope.sample_rate,
        "channels": scope.channels,
        "pairs": scope.pairs,
        "rms": levels.rms,
        "peak": levels.peak
    }))
}

#[tauri::command]
pub fn audio_shutdown() -> Result<Value, String> {
    super::wake_capture::stop()?;
    playback::shutdown()?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn audio_wake_start(sample_rate: u32) -> Result<Value, String> { super::wake_capture::start(sample_rate) }
#[tauri::command]
pub fn audio_wake_stop() -> Result<Value, String> { super::wake_capture::stop() }
#[tauri::command]
pub fn audio_wake_read() -> Result<Value, String> { super::wake_capture::read() }
