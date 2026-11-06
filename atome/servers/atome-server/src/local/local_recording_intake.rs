// Recordings coming in: a recorded upload stored (and transcoded), the audio extracted from a video.
use super::*;

pub(super) async fn user_recordings_upload_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    if body.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Empty upload body" })),
        );
    }

    let Some(file_name_header) = headers.get("x-filename") else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing X-Filename header" })),
        );
    };

    let file_name_raw = match file_name_header.to_str() {
        Ok(v) if !v.is_empty() => v,
        _ => "upload.bin",
    };

    let decoded: Cow<'_, str> =
        urlencoding::decode(file_name_raw).unwrap_or_else(|_| Cow::from(file_name_raw));
    let safe_name = sanitize_file_name(decoded.as_ref());
    let mime_type = headers
        .get("x-mime-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .trim()
        .to_string();

    let user_id = match require_auth_user(&headers, &state) {
        Ok(user_id) => user_id,
        Err(response) => return response,
    };

    let recordings_dir = state
        .project_root
        .join("data")
        .join("users")
        .join(&user_id)
        .join("recordings");

    if let Err(err) = fs::create_dir_all(&recordings_dir).await {
        eprintln!(
            "Erreur création dossier recordings {:?}: {}",
            recordings_dir, err
        );
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    let file_path = recordings_dir.join(&safe_name);
    if let Err(err) = fs::write(&file_path, &body).await {
        eprintln!("Erreur écriture recording {:?}: {}", file_path, err);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    let mut stored_name = safe_name.clone();
    let mut stored_path = file_path;
    let mut stored_mime_type = if mime_type.is_empty() {
        guess_mime_from_ext(&safe_name).to_string()
    } else {
        mime_type.clone()
    };
    let mut converted_from: Option<String> = None;

    if should_transcode_recording_upload_to_mp4(&safe_name, &stored_mime_type) {
        let output_name = playback::replace_file_extension(&safe_name, "mp4");
        let output_path = recordings_dir.join(&output_name);
        if let Err(error) = playback::transcode_recording(&stored_path, &output_path).await {
            let _ = fs::remove_file(&stored_path).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": error })),
            );
        }
        if let Err(error) = fs::remove_file(&stored_path).await {
            eprintln!(
                "Erreur suppression source WebM après transcodage {:?}: {}",
                stored_path, error
            );
        }
        converted_from = Some(stored_name);
        stored_name = output_name;
        stored_path = output_path;
        stored_mime_type = "video/mp4".to_string();
    }

    let size = fs::metadata(&stored_path)
        .await
        .ok()
        .map(|metadata| metadata.len())
        .unwrap_or(body.len() as u64);
    let rel_path = format!("data/users/{}/recordings/{}", user_id, stored_name);
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "file": stored_name,
            "path": rel_path,
            "owner": user_id,
            "owner_id": user_id,
            "ownerId": user_id,
            "mime_type": stored_mime_type,
            "size": size,
            "converted_from": converted_from
        })),
    )
}

pub(super) async fn extract_audio_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MediaTokenQuery>,
    AxumPath(file): AxumPath<String>,
) -> impl IntoResponse {
    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            )
                .into_response();
        }
    };

    let user_id =
        if let Some(value) = resolve_media_authenticated_user(&headers, &query, auth_state) {
            value
        } else {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            )
                .into_response();
        };

    let downloads_dir = match resolve_user_downloads_dir(&state, &user_id).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            )
                .into_response();
        }
    };
    let recordings_dir =
        match resolve_user_storage_dir(&state, &user_id, LocalStorageRoot::Recordings).await {
            Ok(dir) => dir,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": err.to_string() })),
                )
                    .into_response();
            }
        };

    let safe_name = sanitize_file_name(&file);
    let recordings_path = recordings_dir.join(&safe_name);
    let downloads_path = downloads_dir.join(&safe_name);
    let (source_path, source_dir) = if fs::metadata(&recordings_path).await.is_ok() {
        (recordings_path, recordings_dir)
    } else if fs::metadata(&downloads_path).await.is_ok() {
        (downloads_path, downloads_dir)
    } else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({
                "success": false,
                "error": "Source file not found",
                "recordings_path": recordings_path.to_string_lossy(),
                "downloads_path": downloads_path.to_string_lossy()
            })),
        )
            .into_response();
    };

    let extension = Path::new(&safe_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(
        extension.as_str(),
        "mov" | "m4v" | "mp4" | "avi" | "mkv" | "webm"
    ) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Not a video file" })),
        )
            .into_response();
    }

    let cache_dir = source_dir.join(".audio_cache");
    if let Err(err) = fs::create_dir_all(&cache_dir).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": format!("Unable to create audio cache: {err}") })),
        )
            .into_response();
    }

    let base_name = Path::new(&safe_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| safe_name.clone());
    let cached_audio = cache_dir.join(format!("{}.aac.m4a", base_name));

    if fs::metadata(&cached_audio).await.is_err() {
        let source_path_for_ffmpeg = source_path.clone();
        let cached_audio_for_ffmpeg = cached_audio.clone();
        let extract_result = tokio::task::spawn_blocking(move || {
            let output = Command::new("ffmpeg")
                .arg("-v")
                .arg("error")
                .arg("-y")
                .arg("-i")
                .arg(&source_path_for_ffmpeg)
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
                .arg(&cached_audio_for_ffmpeg)
                .output()
                .map_err(|err| format!("ffmpeg_extract_failed: {err}"))?;
            if output.status.success() {
                return Ok(());
            }
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!(
                "ffmpeg_extract_failed: {}",
                stderr.trim().chars().take(240).collect::<String>()
            ))
        })
        .await
        .map_err(|err| format!("ffmpeg_task_failed: {err}"))
        .and_then(|inner| inner);

        if let Err(err) = extract_result {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err })),
            )
                .into_response();
        }
    }

    let metadata = match fs::metadata(&cached_audio).await {
        Ok(value) => value,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({ "success": false, "error": format!("Extracted audio missing: {err}") }),
                ),
            )
                .into_response();
        }
    };
    let modified_epoch = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0);
    let etag_value = format!("W/\"{}-{}\"", metadata.len(), modified_epoch);

    match serve_file_with_range(
        &cached_audio,
        "audio/mp4",
        &etag_value,
        &headers,
        &format!("inline; filename=\"{}.aac.m4a\"", base_name),
    )
    .await
    {
        Ok(response) => response,
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": format!("Unable to serve extracted audio: {err}") })),
        )
            .into_response(),
    }
}
