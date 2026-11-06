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

pub async fn finish_uploaded_file(
    state: &AppState,
    user_id: &str,
    file_name: String,
    file_path: PathBuf,
    expected_size: u64,
) -> (StatusCode, Json<JsonValue>) {
    let mut stored_file_name = file_name;
    let mut stored_file_path = file_path;
    let mut converted_from: Option<String> = None;
    if playback::should_serve_webm_as_mp4(&stored_file_name, "") {
        let output_name = playback::replace_file_extension(&stored_file_name, "mp4");
        let output_path = stored_file_path.with_file_name(&output_name);
        if let Err(error) = playback::transcode_recording(&stored_file_path, &output_path).await {
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
