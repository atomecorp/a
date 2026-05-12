// Tauri command handlers for the audio engine
// Exposes Kira playback + CPAL recording as Tauri commands.

use super::{metering, playback, recorder};
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::warn;

const MTRACK_FILE_TRACE_TAG: &str = "MTRACK_FILE_TRACE_V1";

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

fn file_probe_json(path: &Path) -> Value {
    let metadata = fs::metadata(path).ok();
    let first_bytes = fs::File::open(path)
        .ok()
        .and_then(|mut file| {
            let mut buffer = [0u8; 16];
            file.read(&mut buffer)
                .ok()
                .map(|count| buffer[..count].to_vec())
        })
        .unwrap_or_default();
    let signature = first_bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join("");
    json!({
        "exists": path.exists(),
        "is_file": metadata.as_ref().map(|m| m.is_file()).unwrap_or(false),
        "size": metadata.as_ref().map(|m| m.len()).unwrap_or(0),
        "extension": path.extension().and_then(|value| value.to_str()).unwrap_or(""),
        "signature": signature
    })
}

fn trace_audio_file(stage: &str, data: Value) {
    warn!(
        message = MTRACK_FILE_TRACE_TAG,
        stage = stage,
        data = ?data
    );
}

fn lower_file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

fn is_video_container_requiring_native_audio_extract(path: &Path) -> bool {
    matches!(lower_file_extension(path).as_str(), "webm" | "mkv" | "avi")
}

fn native_audio_cache_path(source_path: &Path) -> Result<PathBuf, String> {
    let parent = source_path.parent().ok_or_else(|| {
        format!(
            "Missing parent directory for native audio source {}",
            source_path.display()
        )
    })?;
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Missing file stem for {}", source_path.display()))?;
    Ok(parent.join(".audio_cache").join(format!("{stem}.aac.m4a")))
}

fn extract_native_video_audio(source_path: &Path, output_path: &Path) -> Result<(), String> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Unable to create native audio cache {}: {error}",
                parent.display()
            )
        })?;
    }
    let output = Command::new("ffmpeg")
        .arg("-v")
        .arg("error")
        .arg("-y")
        .arg("-i")
        .arg(source_path)
        .arg("-vn")
        .arg("-map")
        .arg("0:a:0")
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("192k")
        .arg("-ac")
        .arg("2")
        .arg("-ar")
        .arg("48000")
        .arg("-movflags")
        .arg("+faststart")
        .arg(output_path)
        .output()
        .map_err(|error| format!("native_audio_extract_spawn_failed: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "native_audio_extract_failed: {}",
        stderr.trim().chars().take(320).collect::<String>()
    ))
}

fn prepare_native_audio_decode_path(id: &str, source_path: &Path) -> Result<PathBuf, String> {
    if !is_video_container_requiring_native_audio_extract(source_path) {
        return Ok(source_path.to_path_buf());
    }
    let cached_audio_path = native_audio_cache_path(source_path)?;
    if cached_audio_path.exists() {
        trace_audio_file(
            "tauri_audio_video_extract_cache_hit",
            json!({
                "trace_id": id,
                "id": id,
                "source_path": source_path.to_string_lossy().to_string(),
                "prepared_path": cached_audio_path.to_string_lossy().to_string(),
                "source_probe": file_probe_json(source_path),
                "prepared_probe": file_probe_json(&cached_audio_path)
            }),
        );
        return Ok(cached_audio_path);
    }
    trace_audio_file(
        "tauri_audio_video_extract_before",
        json!({
            "trace_id": id,
            "id": id,
            "source_path": source_path.to_string_lossy().to_string(),
            "prepared_path": cached_audio_path.to_string_lossy().to_string(),
            "source_probe": file_probe_json(source_path)
        }),
    );
    extract_native_video_audio(source_path, &cached_audio_path)?;
    trace_audio_file(
        "tauri_audio_video_extract_after",
        json!({
            "trace_id": id,
            "id": id,
            "source_path": source_path.to_string_lossy().to_string(),
            "prepared_path": cached_audio_path.to_string_lossy().to_string(),
            "prepared_probe": file_probe_json(&cached_audio_path)
        }),
    );
    Ok(cached_audio_path)
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
    let input_path_was_absolute = Path::new(&path).is_absolute();
    trace_audio_file(
        "tauri_audio_load_clip_before_resolve",
        json!({
            "trace_id": &id,
            "id": &id,
            "input_path": &path,
            "input_path_was_absolute": input_path_was_absolute,
            "project_root": paths.project_root.to_string_lossy().to_string()
        }),
    );
    let resolved_path = resolve_audio_clip_path(&paths.project_root, &path)?;
    trace_audio_file(
        "tauri_audio_load_clip_before_decode",
        json!({
            "trace_id": &id,
            "id": &id,
            "input_path": &path,
            "resolved_path": resolved_path.to_string_lossy().to_string(),
            "probe": file_probe_json(&resolved_path)
        }),
    );
    let decode_path = prepare_native_audio_decode_path(&id, &resolved_path)?;
    if decode_path != resolved_path {
        trace_audio_file(
            "tauri_audio_load_clip_prepared_decode_path",
            json!({
                "trace_id": &id,
                "id": &id,
                "input_path": &path,
                "resolved_path": resolved_path.to_string_lossy().to_string(),
                "decode_path": decode_path.to_string_lossy().to_string(),
                "decode_probe": file_probe_json(&decode_path)
            }),
        );
    }
    let metadata = playback::load_clip(&id, &decode_path.to_string_lossy())?;
    trace_audio_file(
        "tauri_audio_load_clip_after_decode",
        json!({
            "trace_id": &id,
            "id": &id,
            "input_path": &path,
            "resolved_path": resolved_path.to_string_lossy().to_string(),
            "decode_path": decode_path.to_string_lossy().to_string(),
            "sample_rate": metadata.sample_rate,
            "frame_count": metadata.frame_count,
            "duration_seconds": metadata.duration_seconds
        }),
    );
    Ok(json!({
        "success": true,
        "id": id,
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
pub fn audio_load_clip_from_bytes(id: String, bytes: Vec<u8>) -> Result<Value, String> {
    let byte_len = bytes.len();
    trace_audio_file(
        "tauri_audio_load_clip_from_bytes_before_decode",
        json!({
            "trace_id": &id,
            "id": &id,
            "bytes_len": byte_len,
            "signature": bytes.iter().take(16).map(|byte| format!("{byte:02x}")).collect::<Vec<_>>().join("")
        }),
    );
    // Pass owned Vec to avoid an extra .to_vec() copy inside playback
    let metadata = playback::load_clip_from_bytes(&id, bytes)?;
    trace_audio_file(
        "tauri_audio_load_clip_from_bytes_after_decode",
        json!({
            "trace_id": &id,
            "id": &id,
            "bytes_len": byte_len,
            "sample_rate": metadata.sample_rate,
            "frame_count": metadata.frame_count,
            "duration_seconds": metadata.duration_seconds
        }),
    );
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
    trace_audio_file(
        "tauri_audio_play_instance_before",
        json!({
            "trace_id": &asset_id,
            "asset_id": &asset_id,
            "voice_id": &voice_id,
            "start_seconds": start_seconds,
            "duration_seconds": duration_seconds,
            "gain": gain,
            "rate": rate,
            "loop_start_seconds": loop_start_seconds,
            "loop_end_seconds": loop_end_seconds
        }),
    );
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
    trace_audio_file(
        "tauri_audio_play_instance_after",
        json!({
            "trace_id": &asset_id,
            "asset_id": &asset_id,
            "voice_id": &voice_id
        }),
    );
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
