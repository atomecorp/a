// The local file routes of a person's storage: write, metadata and listing.
use super::*;

#[derive(Deserialize)]
pub(super) struct LocalFileQuery {
    pub(super) path: Option<String>,
}

pub(super) async fn local_file_write_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LocalFileQuery>,
    body: Bytes,
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

    let user_id = match resolve_authenticated_user(&headers, auth_state) {
        Some(id) => id,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            );
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
        );
    }

    let (root, relative) = match normalize_local_relative_path(&raw_path, &user_id) {
        Some(path) => path,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "success": false, "error": "Invalid file path" })),
            );
        }
    };
    if relative.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        );
    }

    let base_dir = match resolve_user_storage_dir(&state, &user_id, root).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    };

    let file_path = base_dir.join(&relative);
    if let Some(parent) = file_path.parent()
        && let Err(err) = fs::create_dir_all(parent).await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    if let Err(err) = fs::write(&file_path, &body).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    let relative_path = match root {
        LocalStorageRoot::Downloads => format!("Downloads/{}", relative),
        LocalStorageRoot::Recordings => format!("recordings/{}", relative),
    };
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "file": file_path.file_name().and_then(|s| s.to_str()).unwrap_or("file"),
            "path": relative_path,
            "owner": user_id,
            "owner_id": user_id,
            "ownerId": user_id
        })),
    )
}

pub(super) async fn local_file_meta_handler(
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
            );
        }
    };

    let user_id = match resolve_authenticated_user(&headers, auth_state) {
        Some(id) => id,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            );
        }
    };

    let raw_path = query.path.unwrap_or_default();
    if raw_path.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        );
    }

    let (root, relative) = match normalize_local_relative_path(&raw_path, &user_id) {
        Some(path) => path,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "success": false, "error": "Invalid file path" })),
            );
        }
    };
    if relative.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        );
    }

    let base_dir = match resolve_user_storage_dir(&state, &user_id, root).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    };

    let file_path = base_dir.join(&relative);
    match fs::metadata(&file_path).await {
        Ok(meta) => (
            StatusCode::OK,
            Json(json!({
                "success": true,
                "exists": true,
                "size": meta.len(),
                "path": match root {
                    LocalStorageRoot::Downloads => format!("Downloads/{}", relative),
                    LocalStorageRoot::Recordings => format!("recordings/{}", relative)
                }
            })),
        ),
        Err(err) => (
            StatusCode::OK,
            Json(json!({
                "success": false,
                "exists": false,
                "error": err.to_string()
            })),
        ),
    }
}

pub(super) async fn local_file_list_handler(
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
            );
        }
    };

    let user_id = match resolve_authenticated_user(&headers, auth_state) {
        Some(id) => id,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            );
        }
    };

    let (root, relative) = if let Some(raw_path) = query.path {
        normalize_local_relative_path(&raw_path, &user_id)
            .unwrap_or((LocalStorageRoot::Downloads, String::new()))
    } else {
        (LocalStorageRoot::Downloads, String::new())
    };

    let base_dir = match resolve_user_storage_dir(&state, &user_id, root).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    };

    let target_dir = if relative.trim().is_empty() {
        base_dir.clone()
    } else {
        let candidate = base_dir.join(&relative);
        match fs::metadata(&candidate).await {
            Ok(meta) if meta.is_dir() => candidate,
            _ => candidate.parent().unwrap_or(&base_dir).to_path_buf(),
        }
    };

    let mut entries = Vec::new();
    match fs::read_dir(&target_dir).await {
        Ok(mut dir) => {
            while let Ok(Some(entry)) = dir.next_entry().await {
                let file_name = entry.file_name().to_string_lossy().to_string();
                let file_type = entry.file_type().await.ok();
                let is_file = file_type.as_ref().map(|ft| ft.is_file()).unwrap_or(false);
                let is_dir = file_type.as_ref().map(|ft| ft.is_dir()).unwrap_or(false);
                let size = if is_file {
                    entry
                        .metadata()
                        .await
                        .ok()
                        .map(|meta| meta.len())
                        .unwrap_or(0)
                } else {
                    0
                };
                entries.push(json!({
                    "name": file_name,
                    "isFile": is_file,
                    "isDir": is_dir,
                    "size": size
                }));
            }
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "dir": target_dir.to_string_lossy().to_string(),
            "entries": entries
        })),
    )
}
