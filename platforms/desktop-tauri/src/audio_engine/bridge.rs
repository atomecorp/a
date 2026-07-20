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
        "overrun_frames": result.overrun_frames,
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
    playback::shutdown()?;
    Ok(json!({ "success": true }))
}
