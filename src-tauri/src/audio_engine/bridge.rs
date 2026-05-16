// Tauri command handlers for the audio engine
// Exposes Kira playback + CPAL recording as Tauri commands.

use super::{metering, playback, recorder};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

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

fn lower_file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

fn is_video_container_requiring_native_audio_extract(path: &Path) -> bool {
    matches!(
        lower_file_extension(path).as_str(),
        "mp4" | "m4v" | "mov" | "3gp" | "3g2" | "webm" | "mkv" | "avi"
    )
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

fn file_modified_at(path: &Path) -> Option<SystemTime> {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
}

fn should_refresh_native_audio_cache(source_path: &Path, cached_audio_path: &Path) -> bool {
    let Ok(cache_metadata) = fs::metadata(cached_audio_path) else {
        return true;
    };
    if cache_metadata.len() == 0 {
        return true;
    }
    let Some(source_modified) = file_modified_at(source_path) else {
        return false;
    };
    let Some(cache_modified) = file_modified_at(cached_audio_path) else {
        return true;
    };
    source_modified > cache_modified
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

fn prepare_native_audio_decode_path(source_path: &Path) -> Result<PathBuf, String> {
    if !is_video_container_requiring_native_audio_extract(source_path) {
        return Ok(source_path.to_path_buf());
    }
    let cached_audio_path = native_audio_cache_path(source_path)?;
    if should_refresh_native_audio_cache(source_path, &cached_audio_path) {
        extract_native_video_audio(source_path, &cached_audio_path)?;
    }
    Ok(cached_audio_path)
}

fn rebuild_native_audio_decode_path(source_path: &Path) -> Result<PathBuf, String> {
    if !is_video_container_requiring_native_audio_extract(source_path) {
        return Ok(source_path.to_path_buf());
    }
    let cached_audio_path = native_audio_cache_path(source_path)?;
    if cached_audio_path.exists() {
        fs::remove_file(&cached_audio_path).map_err(|error| {
            format!(
                "Unable to remove stale native audio cache {}: {error}",
                cached_audio_path.display()
            )
        })?;
    }
    extract_native_video_audio(source_path, &cached_audio_path)?;
    Ok(cached_audio_path)
}

#[cfg(test)]
mod tests {
    use super::{
        is_video_container_requiring_native_audio_extract, should_refresh_native_audio_cache,
    };
    use std::fs;
    use std::path::Path;

    #[test]
    fn extracts_audio_from_video_containers_before_native_decode() {
        for file_name in [
            "clip.mp4",
            "clip.m4v",
            "clip.mov",
            "clip.3gp",
            "clip.3g2",
            "clip.webm",
            "clip.mkv",
            "clip.avi",
        ] {
            assert!(
                is_video_container_requiring_native_audio_extract(Path::new(file_name)),
                "{file_name} should be extracted before native audio decode"
            );
        }
    }

    #[test]
    fn keeps_audio_only_containers_on_direct_native_decode_route() {
        for file_name in ["clip.m4a", "clip.aac", "clip.mp3", "clip.wav", "clip.flac"] {
            assert!(
                !is_video_container_requiring_native_audio_extract(Path::new(file_name)),
                "{file_name} should stay on the direct native audio decode route"
            );
        }
    }

    #[test]
    fn refreshes_empty_native_audio_cache() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("recorded.webm");
        let cache = dir.path().join("recorded.aac.m4a");
        fs::write(&source, b"source").unwrap();
        fs::write(&cache, b"").unwrap();

        assert!(should_refresh_native_audio_cache(&source, &cache));
    }

    #[test]
    fn refreshes_stale_native_audio_cache() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("recorded.webm");
        let cache = dir.path().join("recorded.aac.m4a");
        fs::write(&cache, b"cache").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(&source, b"source").unwrap();

        assert!(should_refresh_native_audio_cache(&source, &cache));
    }
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
    let resolved_path = resolve_audio_clip_path(&paths.project_root, &path)?;
    let decode_path = prepare_native_audio_decode_path(&resolved_path)?;
    let metadata = match playback::load_clip(&id, &decode_path.to_string_lossy()) {
        Ok(metadata) => metadata,
        Err(first_error)
            if decode_path != resolved_path
                && is_video_container_requiring_native_audio_extract(&resolved_path) =>
        {
            let rebuilt_decode_path = rebuild_native_audio_decode_path(&resolved_path)?;
            playback::load_clip(&id, &rebuilt_decode_path.to_string_lossy()).map_err(|retry_error| {
                format!(
                    "native_audio_decode_failed_after_cache_rebuild: first={first_error}; retry={retry_error}"
                )
            })?
        }
        Err(error) => return Err(error),
    };
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
