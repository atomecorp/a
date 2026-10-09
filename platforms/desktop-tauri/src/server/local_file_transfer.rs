//! Resource byte transfers; canonical Atome state stays on /ws/api.
use super::*;

pub(super) async fn upload_handler(
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
    let token_user_id =
        local_auth::extract_user_id_from_token(auth_state, token.as_deref());
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

    let decoded: Cow<'_, str> =
        urlencoding::decode(file_name_raw).unwrap_or_else(|_| Cow::from(file_name_raw));
    let (file_name, file_path) =
        match resolve_user_upload_path(&state, &user_id, decoded.as_ref()).await {
            Ok(path) => path,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": err.to_string() })),
                );
            }
        };

    if let Err(err) = fs::write(&file_path, &body).await {
        eprintln!("Erreur écriture upload {:?}: {}", file_path, err);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    finish_uploaded_file(&state, &user_id, file_name, file_path, body.len() as u64).await
}


pub(super) async fn local_file_read_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LocalFileQuery>,
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

    let user_id = match resolve_authenticated_user(&headers, auth_state) {
        Some(id) => id,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            )
                .into_response();
        }
    };

    let raw_path = query
        .path
        .or_else(|| {
            headers
                .get("x-file-path")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.to_string())
        })
        .unwrap_or_default();
    if raw_path.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        )
            .into_response();
    }

    let (root, relative) = match normalize_local_relative_path(&raw_path, &user_id) {
        Some(path) => path,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "success": false, "error": "Invalid file path" })),
            )
                .into_response();
        }
    };
    if relative.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        )
            .into_response();
    }

    let base_dir = match resolve_user_storage_dir(&state, &user_id, root).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            )
                .into_response();
        }
    };

    let file_path = base_dir.join(&relative);
    let data = match fs::read(&file_path).await {
        Ok(bytes) => bytes,
        Err(err) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": err.to_string() })),
            )
                .into_response();
        }
    };

    let file_name = Path::new(&relative)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let mime = guess_mime_from_ext(file_name);

    let mut response = Response::new(Body::from(data));
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("inline; filename=\"{}\"", file_name))
            .unwrap_or_else(|_| HeaderValue::from_static("inline")),
    );
    response
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ClipboardFileRequest {
    revision: i64,
    indexes: Vec<usize>,
}

// A client cannot supply a disk path. Reacquire the host snapshot inside Axum.
pub(super) async fn clipboard_import_handler(
    State(state): State<AppState>, headers: HeaderMap, Json(request): Json<ClipboardFileRequest>,
) -> impl IntoResponse {
    let Some(auth) = state.auth_state.as_ref() else {
        return (StatusCode::UNAUTHORIZED, Json(json!({"success": false, "error": "clipboard_auth_required"})));
    };
    let token = extract_bearer_token(&headers);
    let owner = local_auth::extract_user_id_from_token(auth, token.as_deref());
    if owner == "anonymous" {
        return (StatusCode::UNAUTHORIZED, Json(json!({"success": false, "error": "clipboard_auth_required"})));
    }
    let result = import_clipboard_files(&state, &owner, request).await;
    match result {
        Ok(files) => (StatusCode::OK, Json(json!({"success": true, "files": files}))),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"success": false, "error": error}))),
    }
}

async fn import_clipboard_files(state: &AppState, owner: &str, request: ClipboardFileRequest) -> Result<Vec<JsonValue>, String> {
    let snapshot = tokio::task::spawn_blocking(crate::native_clipboard::read_snapshot)
        .await.map_err(|_| "clipboard_snapshot_failed")??;
    if snapshot["success"] != true || snapshot["revision"].as_i64() != Some(request.revision) {
        return Err("clipboard_changed".into());
    }
    let paths = selected_clipboard_paths(&snapshot, &request)?;
    let mut files = Vec::new();
    for path in paths {
        let mut input = fs::File::open(&path).await.map_err(|_| "clipboard_file_unreadable")?;
        let info = input.metadata().await.map_err(|_| "clipboard_file_unreadable")?;
        if !info.is_file() || info.len() > MAX_UPLOAD_BYTES as u64 || info.len() == 0 {
            return Err("clipboard_file_size_invalid".into());
        }
        let name = path.file_name().and_then(|name| name.to_str()).ok_or("clipboard_file_invalid")?;
        let stored_name = format!("{}_{}", Uuid::new_v4(), sanitize_file_name(name));
        let (file_name, destination) = resolve_user_upload_path(state, owner, &stored_name).await.map_err(|_| "clipboard_store_failed")?;
        let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&destination).await.map_err(|_| "clipboard_store_failed")?;
        let copied = tokio::io::copy(&mut (&mut input).take(MAX_UPLOAD_BYTES as u64 + 1), &mut output).await;
        if copied.as_ref().map_or(true, |length| *length != info.len()) {
            drop(output);
            fs::remove_file(&destination).await.map_err(|_| "clipboard_cleanup_failed")?;
            return Err("clipboard_file_changed".into());
        }
        output.flush().await.map_err(|_| "clipboard_store_failed")?;
        drop(output);
        let mime = guess_mime_from_ext(name);
        let mut result = json!({"file_name": file_name, "original_name": name, "owner_id": owner,
            "file_path": format!("Downloads/{file_name}"), "mime_type": mime, "size": info.len()});
        if mime.starts_with("text/") || mime == "application/json" {
            if info.len() > 1024 * 1024 { return Err("clipboard_text_too_large".into()); }
            let text = fs::read_to_string(&destination).await.map_err(|_| "clipboard_text_invalid")?;
            result["text"] = JsonValue::String(text);
        }
        let (status, Json(stored)) = finish_uploaded_file(state, owner, file_name, destination, info.len()).await;
        if status != StatusCode::OK { return Err("clipboard_store_failed".into()); }
        result["file_name"] = stored["file"].clone();
        result["file_path"] = JsonValue::String(format!("Downloads/{}", stored["file"].as_str().ok_or("clipboard_store_failed")?));
        result["mime_type"] = stored["mime_type"].clone();
        result["size"] = stored["size"].clone();
        files.push(result);
    }
    Ok(files)
}

async fn finish_uploaded_file(state: &AppState, user_id: &str, file_name: String, file_path: PathBuf, expected_size: u64) -> (StatusCode, Json<JsonValue>) {
    let mut stored_file_name = file_name;
    let mut stored_file_path = file_path;
    let mut converted_from: Option<String> = None;
    if should_serve_webm_video_as_mp4(&stored_file_name) {
        let output_name = replace_file_extension(&stored_file_name, "mp4");
        let output_path = stored_file_path.with_file_name(&output_name);
        if let Err(error) = transcode_video_to_mp4(&stored_file_path, &output_path).await {
            let _ = fs::remove_file(&stored_file_path).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": error })),
            );
        }
        if let Err(error) = fs::remove_file(&stored_file_path).await {
            eprintln!(
                "Erreur suppression source WebM après transcodage {:?}: {}",
                stored_file_path, error
            );
        }
        converted_from = Some(stored_file_name);
        stored_file_name = output_name;
        stored_file_path = output_path;
    }

    let rel_path = stored_file_path
        .strip_prefix(&*state.project_root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| stored_file_path.to_string_lossy().replace('\\', "/"));
    let size = fs::metadata(&stored_file_path)
        .await
        .ok()
        .map(|metadata| metadata.len())
        .unwrap_or(expected_size);
    let stored_mime_type = guess_mime_from_ext(&stored_file_name);

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "file": stored_file_name,
            "owner": user_id,
            "owner_id": user_id,
            "ownerId": user_id,
            "path": rel_path,
            "mime_type": stored_mime_type,
            "size": size,
            "converted_from": converted_from
        })),
    )
}

fn selected_clipboard_paths(snapshot: &JsonValue, request: &ClipboardFileRequest) -> Result<Vec<PathBuf>, String> {
    if snapshot["success"] != true || snapshot["revision"].as_i64() != Some(request.revision) {
        return Err("clipboard_changed".into());
    }
    let items = snapshot["items"].as_array().ok_or("clipboard_snapshot_invalid")?;
    let mut seen = std::collections::HashSet::new();
    request.indexes.iter().map(|index| {
        if !seen.insert(index) { return Err("clipboard_duplicate_index".into()); }
        let item = items.get(*index).filter(|item| item["native_file"] == true).ok_or("clipboard_file_invalid")?;
        let url = item["file_url"].as_str().ok_or("clipboard_file_invalid")?;
        tauri::Url::parse(url).map_err(|_| "clipboard_file_invalid".to_string())?
            .to_file_path().map_err(|_| "clipboard_file_invalid".into())
    }).collect()
}

#[cfg(test)]
mod clipboard_tests {
    use super::*;
    #[test]
    fn clients_cannot_supply_disk_paths() {
        assert!(serde_json::from_value::<ClipboardFileRequest>(json!({"revision": 1, "indexes": [0], "path": "/private/secret"})).is_err());
    }
    #[test]
    fn stale_or_duplicate_references_cannot_import() {
        let snapshot = json!({"success": true, "revision": 2, "items": [{"native_file": true, "file_url": "file:///tmp/movie.mov"}]});
        assert!(selected_clipboard_paths(&snapshot, &ClipboardFileRequest { revision: 1, indexes: vec![0] }).is_err());
        assert!(selected_clipboard_paths(&snapshot, &ClipboardFileRequest { revision: 2, indexes: vec![0, 0] }).is_err());
        assert!(selected_clipboard_paths(&snapshot, &ClipboardFileRequest { revision: 2, indexes: vec![1] }).is_err());
        assert_eq!(selected_clipboard_paths(&snapshot, &ClipboardFileRequest { revision: 2, indexes: vec![0] }).unwrap(), vec![PathBuf::from("/tmp/movie.mov")]);
    }
    #[test]
    fn non_file_urls_and_text_representations_cannot_be_read_as_files() {
        let request = ClipboardFileRequest { revision: 3, indexes: vec![0] };
        for item in [json!({"native_file": true, "file_url": "https://example.com/movie.mov"}), json!({"kind": "text", "file_url": "file:///tmp/movie.mov"})] {
            assert!(selected_clipboard_paths(&json!({"success": true, "revision": 3, "items": [item]}), &request).is_err());
        }
    }
}
