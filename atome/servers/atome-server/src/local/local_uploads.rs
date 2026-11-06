// A person's uploads: their list and their download.
use super::*;

pub(super) async fn list_uploads_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            );
        }
    };

    let token = extract_bearer_token(&headers);
    let token_user_id = local_auth::extract_user_id_from_token(auth_state, token.as_deref());
    let user_id = if token_user_id != "anonymous" {
        token_user_id
    } else if let Some(header_user_id) = extract_user_id_from_headers(&headers) {
        header_user_id
    } else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "success": false, "error": "Unauthorized" })),
        );
    };

    let downloads_dir = match resolve_user_downloads_dir(&state, &user_id).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    };

    let mut files: Vec<(String, u64, u64)> = Vec::new();
    match fs::read_dir(&downloads_dir).await {
        Ok(mut dir) => {
            while let Ok(Some(entry)) = dir.next_entry().await {
                if !entry
                    .file_type()
                    .await
                    .map(|ft| ft.is_file())
                    .unwrap_or(false)
                {
                    continue;
                }
                let file_name = entry.file_name().to_string_lossy().to_string();
                let safe_name = sanitize_file_name(&file_name);
                let path = downloads_dir.join(&safe_name);
                match fs::metadata(&path).await {
                    Ok(meta) => {
                        let modified = meta
                            .modified()
                            .ok()
                            .and_then(|mtime| mtime.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|duration| duration.as_secs())
                            .unwrap_or_default();
                        files.push((safe_name, meta.len(), modified));
                    }
                    Err(err) => {
                        eprintln!("Erreur métadonnées upload {:?}: {}", path, err);
                    }
                }
            }
        }
        Err(err) => {
            eprintln!(
                "Erreur lecture dossier uploads {:?}: {}",
                downloads_dir, err
            );
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    }

    files.sort_by_key(|file| std::cmp::Reverse(file.2));

    let json_files: Vec<_> = files
        .into_iter()
        .map(|(name, size, modified)| {
            json!({
                "name": name,
                "size": size,
                "modified": modified,
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({ "success": true, "files": json_files })),
    )
}

pub(super) async fn download_upload_handler(
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

    let safe_name = sanitize_file_name(&file);
    let file_path = downloads_dir.join(&safe_name);
    let verbose_logs = download_verbose_logs_enabled();
    if verbose_logs {
        println!(
            "[download_upload_handler] user_id={}, file={}, safe_name={}, downloads_dir={:?}, file_path={:?}, exists={}",
            user_id,
            file,
            safe_name,
            downloads_dir,
            file_path,
            file_path.exists()
        );
    }

    if let Err(err) = fs::metadata(&file_path).await {
        if verbose_logs {
            println!(
                "[download_upload_handler] ❌ Metadata not found: {:?}, error: {}",
                file_path, err
            );
        }
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "success": false, "error": "File not found", "path": file_path.to_string_lossy() })),
        )
            .into_response();
    }

    let (served_path, content_type, served_name) = match resolve_playback_media_file(
        &file_path, &safe_name,
    )
    .await
    {
        Ok(value) => value,
        Err(err) => {
            if verbose_logs {
                println!(
                    "[download_upload_handler] ❌ Playback media resolution failed: {:?}, error: {}",
                    file_path, err
                );
            }
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err })),
            )
                .into_response();
        }
    };

    let metadata = match fs::metadata(&served_path).await {
        Ok(value) => value,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": format!("Playback file missing: {err}") })),
            )
                .into_response();
        }
    };
    let file_size = metadata.len();
    let modified_epoch = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0);
    let etag_value = format!("W/\"{}-{}\"", file_size, modified_epoch);
    let if_none_match = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
        .unwrap_or_default();

    if !if_none_match.is_empty() && if_none_match == etag_value {
        let mut response_headers = HeaderMap::new();
        if let Ok(header_value) = HeaderValue::from_str(&etag_value) {
            response_headers.insert(header::ETAG, header_value);
        }
        response_headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, max-age=300"),
        );
        return (StatusCode::NOT_MODIFIED, response_headers).into_response();
    }

    match serve_file_with_range(
        &served_path,
        content_type,
        &etag_value,
        &headers,
        &format!("inline; filename=\"{}\"", served_name),
    )
    .await
    {
        Ok(response) => {
            if verbose_logs {
                println!(
                    "[download_upload_handler] ✅ Serving file: {:?}",
                    served_path
                );
            }
            response
        }
        Err(err) => {
            if verbose_logs {
                println!(
                    "[download_upload_handler] ❌ File not found: {:?}, error: {}",
                    served_path, err
                );
            }
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "File not found", "path": served_path.to_string_lossy() })),
            )
                .into_response()
        }
    }
}
