// Tauri command handlers for the audio engine
// Exposes Kira playback + CPAL recording as Tauri commands.

use serde_json::{json, Value};
use super::{playback, recorder, metering};

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
    playback::load_clip_from_bytes(&id, &bytes)?;
    Ok(json!({ "success": true, "id": id, "bytes_len": byte_len }))
}

#[tauri::command]
pub fn audio_play(id: String) -> Result<Value, String> {
    playback::play(&id)?;
    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
pub fn audio_stop(id: String) -> Result<Value, String> {
    playback::stop(&id)?;
    Ok(json!({ "success": true, "id": id }))
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
        "channels": result.channels
    }))
}

#[tauri::command]
pub fn audio_get_levels() -> Result<Value, String> {
    let levels = metering::get_levels();
    Ok(json!({
        "rms": levels.rms,
        "peak": levels.peak,
        "rms_db": levels.rms_db,
        "peak_db": levels.peak_db
    }))
}

#[tauri::command]
pub fn audio_shutdown() -> Result<Value, String> {
    playback::shutdown()?;
    Ok(json!({ "success": true }))
}
