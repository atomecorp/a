use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

fn lower_file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

pub fn is_video_container_requiring_native_audio_extract(path: &Path) -> bool {
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

pub fn should_refresh_native_audio_cache(source_path: &Path, cached_audio_path: &Path) -> bool {
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

pub fn prepare_native_audio_decode_path(source_path: &Path) -> Result<PathBuf, String> {
    if !is_video_container_requiring_native_audio_extract(source_path) {
        return Ok(source_path.to_path_buf());
    }
    let cached_audio_path = native_audio_cache_path(source_path)?;
    if should_refresh_native_audio_cache(source_path, &cached_audio_path) {
        extract_native_video_audio(source_path, &cached_audio_path)?;
    }
    Ok(cached_audio_path)
}

pub fn rebuild_native_audio_decode_path(source_path: &Path) -> Result<PathBuf, String> {
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
