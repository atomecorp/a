// The import of files copied in the system clipboard (`/api/clipboard/files`).
use super::*;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ClipboardFileRequest {
    revision: i64,
    indexes: Vec<usize>,
}

// A client cannot supply a disk path. Reacquire the host snapshot inside Axum.
pub(super) async fn clipboard_import_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ClipboardFileRequest>,
) -> impl IntoResponse {
    let Some(auth) = state.auth_state.as_ref() else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "clipboard_auth_required"})),
        );
    };
    let token = extract_bearer_token(&headers);
    let owner = local_auth::extract_user_id_from_token(auth, token.as_deref());
    if owner == "anonymous" {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "clipboard_auth_required"})),
        );
    }
    let result = import_clipboard_files(&state, &owner, request).await;
    match result {
        Ok(files) => (
            StatusCode::OK,
            Json(json!({"success": true, "files": files})),
        ),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": error})),
        ),
    }
}

async fn import_clipboard_files(
    state: &AppState,
    owner: &str,
    request: ClipboardFileRequest,
) -> Result<Vec<JsonValue>, String> {
    let snapshot = tokio::task::spawn_blocking(crate::native_clipboard::read_snapshot)
        .await
        .map_err(|_| "clipboard_snapshot_failed")??;
    if snapshot["success"] != true || snapshot["revision"].as_i64() != Some(request.revision) {
        return Err("clipboard_changed".into());
    }
    let paths = selected_clipboard_paths(&snapshot, &request)?;
    let mut files = Vec::new();
    for path in paths {
        let mut input = fs::File::open(&path)
            .await
            .map_err(|_| "clipboard_file_unreadable")?;
        let info = input
            .metadata()
            .await
            .map_err(|_| "clipboard_file_unreadable")?;
        if !info.is_file() || info.len() > MAX_UPLOAD_BYTES as u64 || info.len() == 0 {
            return Err("clipboard_file_size_invalid".into());
        }
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("clipboard_file_invalid")?;
        let stored_name = format!("{}_{}", Uuid::new_v4(), sanitize_file_name(name));
        let (file_name, destination) = resolve_user_upload_path(state, owner, &stored_name)
            .await
            .map_err(|_| "clipboard_store_failed")?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination)
            .await
            .map_err(|_| "clipboard_store_failed")?;
        let copied = tokio::io::copy(
            &mut (&mut input).take(MAX_UPLOAD_BYTES as u64 + 1),
            &mut output,
        )
        .await;
        if copied.as_ref().map_or(true, |length| *length != info.len()) {
            drop(output);
            fs::remove_file(&destination)
                .await
                .map_err(|_| "clipboard_cleanup_failed")?;
            return Err("clipboard_file_changed".into());
        }
        output.flush().await.map_err(|_| "clipboard_store_failed")?;
        drop(output);
        let mime = guess_mime_from_ext(name);
        let mut result = json!({"file_name": file_name, "original_name": name, "owner_id": owner,
            "file_path": format!("Downloads/{file_name}"), "mime_type": mime, "size": info.len()});
        if mime.starts_with("text/") || mime == "application/json" {
            if info.len() > 1024 * 1024 {
                return Err("clipboard_text_too_large".into());
            }
            let text = fs::read_to_string(&destination)
                .await
                .map_err(|_| "clipboard_text_invalid")?;
            result["text"] = JsonValue::String(text);
        }
        let (status, Json(stored)) =
            finish_uploaded_file(state, owner, file_name, destination, info.len()).await;
        if status != StatusCode::OK {
            return Err("clipboard_store_failed".into());
        }
        result["file_name"] = stored["file"].clone();
        result["file_path"] = JsonValue::String(format!(
            "Downloads/{}",
            stored["file"].as_str().ok_or("clipboard_store_failed")?
        ));
        result["mime_type"] = stored["mime_type"].clone();
        result["size"] = stored["size"].clone();
        files.push(result);
    }
    Ok(files)
}

fn selected_clipboard_paths(
    snapshot: &JsonValue,
    request: &ClipboardFileRequest,
) -> Result<Vec<PathBuf>, String> {
    if snapshot["success"] != true || snapshot["revision"].as_i64() != Some(request.revision) {
        return Err("clipboard_changed".into());
    }
    let items = snapshot["items"]
        .as_array()
        .ok_or("clipboard_snapshot_invalid")?;
    let mut seen = std::collections::HashSet::new();
    request
        .indexes
        .iter()
        .map(|index| {
            if !seen.insert(index) {
                return Err("clipboard_duplicate_index".into());
            }
            let item = items
                .get(*index)
                .filter(|item| item["native_file"] == true)
                .ok_or("clipboard_file_invalid")?;
            let url = item["file_url"].as_str().ok_or("clipboard_file_invalid")?;
            tauri::Url::parse(url)
                .map_err(|_| "clipboard_file_invalid".to_string())?
                .to_file_path()
                .map_err(|_| "clipboard_file_invalid".into())
        })
        .collect()
}

#[cfg(test)]
mod clipboard_tests {
    use super::*;
    #[test]
    fn clients_cannot_supply_disk_paths() {
        assert!(
            serde_json::from_value::<ClipboardFileRequest>(
                json!({"revision": 1, "indexes": [0], "path": "/private/secret"})
            )
            .is_err()
        );
    }
    #[test]
    fn stale_or_duplicate_references_cannot_import() {
        let snapshot = json!({"success": true, "revision": 2, "items": [{"native_file": true, "file_url": "file:///tmp/movie.mov"}]});
        assert!(
            selected_clipboard_paths(
                &snapshot,
                &ClipboardFileRequest {
                    revision: 1,
                    indexes: vec![0]
                }
            )
            .is_err()
        );
        assert!(
            selected_clipboard_paths(
                &snapshot,
                &ClipboardFileRequest {
                    revision: 2,
                    indexes: vec![0, 0]
                }
            )
            .is_err()
        );
        assert!(
            selected_clipboard_paths(
                &snapshot,
                &ClipboardFileRequest {
                    revision: 2,
                    indexes: vec![1]
                }
            )
            .is_err()
        );
        assert_eq!(
            selected_clipboard_paths(
                &snapshot,
                &ClipboardFileRequest {
                    revision: 2,
                    indexes: vec![0]
                }
            )
            .unwrap(),
            vec![PathBuf::from("/tmp/movie.mov")]
        );
    }
    #[test]
    fn non_file_urls_and_text_representations_cannot_be_read_as_files() {
        let request = ClipboardFileRequest {
            revision: 3,
            indexes: vec![0],
        };
        for item in [
            json!({"native_file": true, "file_url": "https://example.com/movie.mov"}),
            json!({"kind": "text", "file_url": "file:///tmp/movie.mov"}),
        ] {
            assert!(
                selected_clipboard_paths(
                    &json!({"success": true, "revision": 3, "items": [item]}),
                    &request
                )
                .is_err()
            );
        }
    }
}
