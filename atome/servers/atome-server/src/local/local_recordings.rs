// A person's recordings: their deletion and their download.
use super::*;

// A take discarded after the native recorder already wrote its file (a voicemail the
// caller cancels): only the signed-in user's own recordings directory is touched.
pub(super) async fn delete_recording_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MediaTokenQuery>,
    AxumPath(recording_id): AxumPath<String>,
) -> impl IntoResponse {
    if sanitize_recording_id(&recording_id).is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Invalid recording id" })),
        )
            .into_response();
    }
    let Some(auth_state) = &state.auth_state else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": "Auth state not initialized" })),
        )
            .into_response();
    };
    let Some(user_id) = resolve_media_authenticated_user(&headers, &query, auth_state) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    };
    let recordings_dir =
        match resolve_user_storage_dir(&state, &user_id, LocalStorageRoot::Recordings).await {
            Ok(dir) => dir,
            Err(_) => {
                return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({ "success": false, "error": "Failed to resolve recordings directory" }),
                ),
            )
                .into_response();
            }
        };
    let path = recordings_dir.join(sanitize_file_name(&recording_id));
    if !path.starts_with(&recordings_dir) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Invalid recording id" })),
        )
            .into_response();
    }
    match tokio::fs::remove_file(&path).await {
        Ok(()) => Json(json!({ "success": true, "deleted": true })).into_response(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Json(json!({ "success": true, "deleted": false })).into_response()
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": "Recording delete failed" })),
        )
            .into_response(),
    }
}

pub(super) async fn download_recording_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MediaTokenQuery>,
    AxumPath(recording_id): AxumPath<String>,
) -> impl IntoResponse {
    let Some(safe_id) = sanitize_recording_id(&recording_id) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Invalid recording id" })),
        )
            .into_response();
    };

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

    // First, try to find the file directly in the user's recordings directory (like downloads)
    // This handles recordings synced from Fastify that may not be in the local DB
    let recordings_dir =
        match resolve_user_storage_dir(&state, &user_id, LocalStorageRoot::Recordings).await {
            Ok(dir) => dir,
            Err(err) => {
                println!(
                    "[download_recording_handler] Failed to resolve recordings dir: {}",
                    err
                );
                return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({ "success": false, "error": "Failed to resolve recordings directory" }),
                ),
            )
                .into_response();
            }
        };

    // Try direct file lookup first (by sanitized recording_id as filename)
    let safe_name = sanitize_file_name(&recording_id);
    let direct_path = recordings_dir.join(&safe_name);

    println!(
        "[download_recording_handler] Trying direct lookup: user_id={}, recording_id={}, safe_name={}, recordings_dir={:?}, direct_path={:?}, exists={}",
        user_id,
        recording_id,
        safe_name,
        recordings_dir,
        direct_path,
        direct_path.exists()
    );

    if direct_path.exists() {
        let (served_path, content_type, served_name) =
            match resolve_playback_media_file(&direct_path, &safe_name).await {
                Ok(value) => value,
                Err(err) => {
                    println!(
                        "[download_recording_handler] Playback media resolution failed: {}",
                        err
                    );
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": err })),
                    )
                        .into_response();
                }
            };
        let disposition = format!("inline; filename=\"{}\"", served_name);
        match serve_file_with_range(&served_path, content_type, "", &headers, &disposition).await {
            Ok(response) => {
                println!(
                    "[download_recording_handler] ✅ Serving recording (direct): {:?}",
                    served_path
                );
                return response;
            }
            Err(err) => {
                println!("[download_recording_handler] Direct read failed: {}", err);
                // Fall through to the canonical recording metadata lookup.
            }
        }
    }

    // Secondary: find the canonical persisted recording metadata.
    let rel = {
        let atome_state = match &state.atome_state {
            Some(s) => s,
            None => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": "Atome state not initialized" })),
                )
                    .into_response();
            }
        };

        let db = match atome_state.db.lock() {
            Ok(lock) => lock,
            Err(_) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": "Database lock failed" })),
                )
                    .into_response();
            }
        };

        // Debug: First check if the atome exists at all
        let exists: bool = db
            .query_row(
                "SELECT 1 FROM atomes WHERE atome_id = ?1",
                params![safe_id],
                |_| Ok(true),
            )
            .unwrap_or_default();
        println!(
            "[download_recording_handler] Atome exists check: id={}, exists={}",
            safe_id, exists
        );

        // Recording binaries must remain retrievable by id even when the atome is soft-deleted.
        // Soft-delete hides it from normal lists, but linked media atomes can still reference it.
        let owner_id: Option<String> = match db.query_row(
        "SELECT owner_id FROM atomes WHERE atome_id = ?1 AND atome_type IN ('audio_recording', 'video_recording')",
        params![safe_id],
        |row| row.get(0),
    ) {
            Ok(val) => val,
            Err(e) => {
                println!("[download_recording_handler] Recording not found in DB: id={}, error={}", safe_id, e);
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "success": false, "error": "Recording not found" })),
                )
                    .into_response();
            }
        };

        println!(
            "[download_recording_handler] Owner check: recording_id={}, owner_id={:?}, user_id={}",
            safe_id, owner_id, user_id
        );

        let owner = match owner_id {
            Some(id) if id == user_id => id,
            Some(id) if !id.is_empty() => {
                println!(
                    "[download_recording_handler] Owner mismatch denied: owner={}, user={}",
                    id, user_id
                );
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "success": false, "error": "Recording access denied" })),
                )
                    .into_response();
            }
            _ => {
                // No owner set - allow authenticated user to access
                println!(
                    "[download_recording_handler] ⚠️ No owner set, allowing authenticated access: user={}",
                    user_id
                );
                user_id.clone()
            }
        };

        let mut file_path: Option<String> = None;
        let mut file_name: Option<String> = None;

        if let Ok(mut stmt) =
            db.prepare("SELECT particle_key, particle_value FROM particles WHERE atome_id = ?1")
            && let Ok(rows) = stmt.query_map(params![safe_id], |row| {
                let key: String = row.get(0)?;
                let value: String = row.get(1)?;
                Ok((key, value))
            })
        {
            for row in rows.flatten() {
                let (key, raw) = row;
                let parsed = serde_json::from_str::<serde_json::Value>(&raw).ok();
                let as_str = parsed
                    .as_ref()
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or(raw.clone());
                if key == "file_path" {
                    file_path = Some(as_str);
                } else if key == "file_name" {
                    file_name = Some(as_str);
                }
            }
        }

        let prefix = format!("data/users/{}/recordings/", owner);
        if let Some(path) = file_path {
            let trimmed = path.trim().trim_start_matches('/');
            if !trimmed.starts_with(&prefix) || trimmed.contains("..") {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "success": false, "error": "Access denied" })),
                )
                    .into_response();
            }
            trimmed.to_string()
        } else if let Some(name) = file_name {
            let safe_name = sanitize_file_name(&name);
            format!("{}{}", prefix, safe_name)
        } else {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "Recording path missing" })),
            )
                .into_response();
        }
    };

    let target_path = state.project_root.join(&rel);
    println!(
        "[download_recording_handler] recording_id={}, user_id={}, rel={}, project_root={:?}, target_path={:?}, exists={}",
        recording_id,
        user_id,
        rel,
        state.project_root,
        target_path,
        target_path.exists()
    );

    let target_name = Path::new(&rel)
        .file_name()
        .and_then(|value| value.to_str())
        .map(sanitize_file_name)
        .unwrap_or_else(|| sanitize_file_name(&rel));
    let (served_path, content_type, served_name) = match resolve_playback_media_file(
        &target_path,
        &target_name,
    )
    .await
    {
        Ok(value) => value,
        Err(err) => {
            println!(
                "[download_recording_handler] ❌ Playback media resolution failed: {:?}, error: {}",
                target_path, err
            );
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err })),
            )
                .into_response();
        }
    };
    let disposition = format!("inline; filename=\"{}\"", served_name);
    match serve_file_with_range(&served_path, content_type, "", &headers, &disposition).await {
        Ok(response) => {
            println!(
                "[download_recording_handler] ✅ Serving recording: {:?}",
                served_path
            );
            response
        }
        Err(err) => {
            println!(
                "[download_recording_handler] ❌ File not found: {:?}, error: {}",
                served_path, err
            );
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "File not found", "path": served_path.to_string_lossy() })),
            )
                .into_response()
        }
    }
}

// =============================================================================
// WEBSOCKET HANDLERS
// =============================================================================
