// Tauri command handlers for the audio engine
// Exposes Kira playback + CPAL recording as Tauri commands.

use super::{metering, playback, recorder};
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
pub fn audio_load_clip(
    paths: tauri::State<crate::ProjectPaths>,
    id: String,
    path: String,
) -> Result<Value, String> {
    let resolved_path = resolve_audio_clip_path(&paths.project_root, &path)?;
    let metadata = playback::load_clip(&id, &resolved_path.to_string_lossy())?;
    Ok(json!({
        "success": true,
        "id": id,
        "path": resolved_path.to_string_lossy().to_string(),
        "input_path": path,
        "input_path_was_absolute": Path::new(&path).is_absolute(),
        "metadata": clip_metadata_json(&metadata),
        "sample_rate": metadata.sample_rate,
        "frame_count": metadata.frame_count,
        "duration_seconds": metadata.duration_seconds
    }))
}

#[tauri::command]
pub fn audio_load_clip_from_bytes(id: String, bytes: Vec<u8>) -> Result<Value, String> {
    let byte_len = bytes.len();
    // Pass owned Vec to avoid an extra .to_vec() copy inside playback
    let metadata = playback::load_clip_from_bytes(&id, bytes)?;
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
    rate: f64,
    loop_start_seconds: Option<f64>,
    loop_end_seconds: Option<f64>,
) -> Result<Value, String> {
    playback::play_instance(
        &asset_id,
        &voice_id,
        start_seconds,
        duration_seconds,
        gain,
        rate,
        loop_start_seconds,
        loop_end_seconds,
    )?;
    Ok(json!({
        "success": true,
        "asset_id": asset_id,
        "voice_id": voice_id
    }))
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
    recorder::start(&session_id, &abs_path, sample_rate, channels)?;
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
        "duration_sec": result.duration_sec,
        "frame_count": result.frame_count,
        "sample_rate": result.sample_rate,
        "channels": result.channels,
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
pub fn audio_shutdown() -> Result<Value, String> {
    playback::shutdown()?;
    Ok(json!({ "success": true }))
}
