// Names and places of a person's files: sanitized names, storage roots, uploads and recordings paths, MIME types.
use super::*;

pub fn sanitize_file_name(name: &str) -> String {
    if name.is_empty() {
        return "upload.bin".to_string();
    }
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => c,
            _ => '_',
        })
        .collect();
    if sanitized.trim().is_empty() {
        "upload.bin".to_string()
    } else {
        sanitized
    }
}

pub(super) fn should_transcode_recording_upload_to_mp4(file_name: &str, mime_type: &str) -> bool {
    playback::lower_file_extension(file_name) == "webm"
        && mime_type.trim().to_ascii_lowercase().starts_with("video/")
}

pub(super) async fn resolve_playback_media_file(
    source_path: &Path,
    file_name: &str,
) -> Result<(PathBuf, &'static str, String), String> {
    let mime_type = guess_mime_from_ext(file_name);
    // The iPhone has no ffmpeg, and its WebKit plays what its camera writes (HEVC in a `.mov`):
    // a file is served as it is (user, 8 Nov. 2026: « les vidéos… je peux pas les relire »).
    if cfg!(target_os = "ios") {
        return Ok((
            source_path.to_path_buf(),
            mime_type,
            sanitize_file_name(file_name),
        ));
    }
    Ok(
        match playback::ensure_cache(source_path, file_name, mime_type).await? {
            Some((cached_path, cached_name)) => (cached_path, "video/mp4", cached_name),
            None => (
                source_path.to_path_buf(),
                mime_type,
                sanitize_file_name(file_name),
            ),
        },
    )
}

pub(super) fn sanitize_upload_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

pub(super) fn download_verbose_logs_enabled() -> bool {
    static DOWNLOAD_VERBOSE_LOGS: OnceLock<bool> = OnceLock::new();
    *DOWNLOAD_VERBOSE_LOGS.get_or_init(|| {
        std::env::var("SQUIRREL_DOWNLOAD_LOG_VERBOSE")
            .ok()
            .map(|value| {
                let normalized = value.trim().to_lowercase();
                normalized == "1"
                    || normalized == "true"
                    || normalized == "yes"
                    || normalized == "on"
            })
            .unwrap_or(false)
    })
}

pub(super) fn sanitize_user_segment(value: &str) -> String {
    if value.is_empty() {
        return "anonymous".to_string();
    }
    let sanitized: String = value
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '_' | '-' => c,
            _ => '_',
        })
        .collect();
    if sanitized.trim().is_empty() {
        "anonymous".to_string()
    } else {
        sanitized
    }
}

pub(super) fn sanitize_recording_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return None;
    }
    // Apply sanitize_file_name first so that URL-decoded characters like spaces
    // are converted to underscores (consistent with upload handler behavior)
    // instead of rejecting the whole id as invalid.
    let sanitized = sanitize_file_name(trimmed);
    if sanitized.is_empty() {
        return None;
    }
    if !sanitized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return None;
    }
    Some(sanitized)
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub(super) enum LocalStorageRoot {
    Downloads,
    Recordings,
}

pub(super) fn normalize_local_relative_path(
    raw_path: &str,
    user_id: &str,
) -> Option<(LocalStorageRoot, String)> {
    let safe_user = sanitize_user_segment(user_id);
    let mut cleaned = raw_path.trim().replace('\\', "/");
    if cleaned.to_lowercase().starts_with("file://") {
        cleaned = cleaned.trim_start_matches("file://").to_string();
    }

    let anchor = format!("/data/users/{}/", safe_user);
    let alt_anchor = format!("data/users/{}/", safe_user);
    if let Some(idx) = cleaned.find(&anchor) {
        cleaned = cleaned[(idx + anchor.len())..].to_string();
    } else if cleaned.starts_with(&alt_anchor) {
        cleaned = cleaned[alt_anchor.len()..].to_string();
    } else if cleaned.starts_with(&format!("{}/", safe_user)) {
        cleaned = cleaned[(safe_user.len() + 1)..].to_string();
    }

    cleaned = cleaned.trim_start_matches('/').to_string();

    let raw_parts: Vec<&str> = cleaned
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .collect();
    if raw_parts.is_empty() {
        return None;
    }

    let first = raw_parts[0].to_lowercase();
    let (root, parts) = match first.as_str() {
        "downloads" => (LocalStorageRoot::Downloads, &raw_parts[1..]),
        "recordings" => (LocalStorageRoot::Recordings, &raw_parts[1..]),
        _ => (LocalStorageRoot::Downloads, raw_parts.as_slice()),
    };

    let last_idx = parts.len().saturating_sub(1);
    let mut safe_parts = Vec::with_capacity(raw_parts.len());
    for (idx, part) in parts.iter().enumerate() {
        if idx == last_idx {
            safe_parts.push(sanitize_file_name(part));
        } else {
            safe_parts.push(sanitize_user_segment(part));
        }
    }

    Some((root, safe_parts.join("/")))
}

pub fn guess_mime_from_ext(name: &str) -> &'static str {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "opus" => "audio/opus",
        "weba" => "audio/webm",
        "aif" | "aiff" => "audio/aiff",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "m4v" => "video/x-m4v",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "txt" | "md" | "markdown" | "log" => "text/plain",
        "csv" => "text/csv",
        "tsv" => "text/tab-separated-values",
        "json" => "application/json",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        _ => "application/octet-stream",
    }
}

pub(super) async fn resolve_user_storage_dir(
    state: &AppState,
    user_id: &str,
    root: LocalStorageRoot,
) -> Result<PathBuf, std::io::Error> {
    let safe_user = sanitize_user_segment(user_id);
    let base_dir = state
        .project_root
        .join("data")
        .join("users")
        .join(safe_user);
    let dir = match root {
        LocalStorageRoot::Downloads => base_dir.join("Downloads"),
        LocalStorageRoot::Recordings => base_dir.join("recordings"),
    };
    fs::create_dir_all(&dir).await?;
    Ok(dir)
}

pub(super) async fn resolve_user_downloads_dir(
    state: &AppState,
    user_id: &str,
) -> Result<PathBuf, std::io::Error> {
    resolve_user_storage_dir(state, user_id, LocalStorageRoot::Downloads).await
}

pub async fn resolve_user_upload_path(
    state: &AppState,
    user_id: &str,
    raw_name: &str,
) -> Result<(String, PathBuf), std::io::Error> {
    let sanitized = sanitize_file_name(raw_name);
    let downloads_dir = resolve_user_downloads_dir(state, user_id).await?;
    let mut candidate = sanitized.clone();
    let mut counter = 1u32;

    loop {
        let target = downloads_dir.join(&candidate);
        if fs::metadata(&target).await.is_err() {
            return Ok((candidate, target));
        }

        let path = Path::new(&sanitized);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("upload");
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

        if ext.is_empty() {
            candidate = format!("{}_{}", stem, counter);
        } else {
            candidate = format!("{}_{}.{}", stem, counter, ext);
        }
        counter += 1;
    }
}
