// Tauri command handlers for the audio engine
// Exposes Kira playback + CPAL recording as Tauri commands.

use serde_json::{json, Value};
use super::{playback, recorder, metering};
use std::path::{Path, PathBuf};
use std::io::Cursor;

fn resolve_debug_audio_path(project_root: &Path, file_path: &str) -> Result<PathBuf, String> {
    let raw = String::from(file_path).trim().to_string();
    if raw.is_empty() {
        return Err("Missing file path".to_string());
    }
    let candidate = if Path::new(&raw).is_absolute() {
        PathBuf::from(&raw)
    } else {
        project_root.join(&raw)
    };
    let canonical = candidate
        .canonicalize()
        .map_err(|e| format!("Unable to resolve debug audio path: {e}"))?;
    let canonical_root = project_root
        .canonicalize()
        .map_err(|e| format!("Unable to resolve project root: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Debug audio path is outside the project root".to_string());
    }
    Ok(canonical)
}

fn resolve_debug_audio_output_path(project_root: &Path, file_name: &str) -> Result<PathBuf, String> {
    let raw = String::from(file_name).trim().to_string();
    if raw.is_empty() {
        return Err("Missing file name".to_string());
    }
    let sanitized: String = raw
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => ch,
            _ => '_',
        })
        .collect();
    let safe_name = if sanitized.trim().is_empty() {
        "audio_debug.wav".to_string()
    } else {
        sanitized
    };
    Ok(project_root.join("tmp").join("audio_debug").join(safe_name))
}

#[allow(dead_code)] // Reached via the Tauri audio debug capture command.
fn decode_wav_to_interleaved_f32(bytes: &[u8]) -> Result<(u32, u16, Vec<f32>), String> {
    let cursor = Cursor::new(bytes);
    let mut reader = hound::WavReader::new(cursor)
        .map_err(|e| format!("Unable to decode loopback WAV bytes: {e}"))?;
    let spec = reader.spec();
    if spec.channels == 0 {
        return Err("Loopback WAV has no channels".to_string());
    }
    let sample_rate = spec.sample_rate;
    let channels = spec.channels;
    let samples = match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Int, 16) => reader
            .samples::<i16>()
            .map(|sample| {
                sample
                    .map(|value| value as f32 / 32768.0)
                    .map_err(|e| format!("Unable to read loopback WAV sample: {e}"))
            })
            .collect::<Result<Vec<f32>, String>>()?,
        (hound::SampleFormat::Float, 32) => reader
            .samples::<f32>()
            .map(|sample| sample.map_err(|e| format!("Unable to read loopback WAV sample: {e}")))
            .collect::<Result<Vec<f32>, String>>()?,
        _ => {
            return Err(format!(
                "Unsupported loopback WAV format: {:?} {} bits",
                spec.sample_format, spec.bits_per_sample
            ));
        }
    };
    Ok((sample_rate, channels, samples))
}

#[tauri::command]
pub fn audio_init() -> Result<Value, String> {
    playback::init()?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn audio_load_clip(id: String, path: String) -> Result<Value, String> {
    playback::load_clip(&id, &path)?;
    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
pub fn audio_load_clip_from_bytes(id: String, bytes: Vec<u8>) -> Result<Value, String> {
    let byte_len = bytes.len();
    // Pass owned Vec to avoid an extra .to_vec() copy inside playback
    playback::load_clip_from_bytes(&id, bytes)?;
    Ok(json!({ "success": true, "id": id, "bytes_len": byte_len }))
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
        paths.project_root.join(&file_path).to_string_lossy().to_string()
    };

    metering::reset();
    recorder::start(&session_id, &abs_path, sample_rate, channels)?;
    Ok(json!({
        "success": true,
        "session_id": session_id,
        "file_path": abs_path
    }))
}

#[tauri::command]
pub fn audio_record_stop(session_id: String) -> Result<Value, String> {
    let result = recorder::stop(&session_id)?;
    Ok(json!({
        "success": true,
        "session_id": result.session_id,
        "file_path": result.file_path,
        "duration_sec": result.duration_sec,
        "sample_rate": result.sample_rate,
        "channels": result.channels,
        "output_format": result.output_format
    }))
}

#[tauri::command]
pub fn audio_debug_read_file(
    paths: tauri::State<crate::ProjectPaths>,
    file_path: String,
) -> Result<Vec<u8>, String> {
    let resolved = resolve_debug_audio_path(&paths.project_root, &file_path)?;
    std::fs::read(&resolved).map_err(|e| format!("Unable to read debug audio file {}: {e}", resolved.display()))
}

#[tauri::command]
pub fn audio_debug_write_file(
    paths: tauri::State<crate::ProjectPaths>,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<Value, String> {
    let target = resolve_debug_audio_output_path(&paths.project_root, &file_name)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Unable to create debug audio directory {}: {e}", parent.display()))?;
    }
    std::fs::write(&target, &bytes)
        .map_err(|e| format!("Unable to write debug audio file {}: {e}", target.display()))?;
    Ok(json!({
        "success": true,
        "path": target.to_string_lossy().to_string(),
        "bytes_len": bytes.len()
    }))
}

#[tauri::command]
#[allow(dead_code)] // Registered through tauri::generate_handler!, which dead_code does not see reliably.
pub fn audio_debug_capture_loopback(
    paths: tauri::State<crate::ProjectPaths>,
    file_name: String,
    wav_bytes: Vec<u8>,
) -> Result<Value, String> {
    let target = resolve_debug_audio_output_path(&paths.project_root, &file_name)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Unable to create debug audio directory {}: {e}", parent.display()))?;
    }
    let (sample_rate, channels, interleaved) = decode_wav_to_interleaved_f32(&wav_bytes)?;
    let duration_sec = crate::native_recorder::debug_render_interleaved(
        target
            .to_str()
            .ok_or_else(|| "Loopback output path contains invalid UTF-8".to_string())?,
        sample_rate,
        channels,
        &interleaved,
    )?;
    Ok(json!({
        "success": true,
        "path": target.to_string_lossy().to_string(),
        "bytes_len": wav_bytes.len(),
        "sample_rate": sample_rate,
        "channels": channels,
        "duration_sec": duration_sec,
        "frame_count": interleaved.len() / usize::from(channels)
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
