// The `/ws/api` `file` family: uploads and downloads in chunks over the socket.
use super::*;

pub(super) fn json_string_field(data: &JsonValue, key: &str) -> Option<String> {
    data.get(key)
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn json_number_field(data: &JsonValue, key: &str) -> Option<i64> {
    data.get(key).and_then(|value| {
        value.as_i64().or_else(|| {
            value
                .as_str()
                .and_then(|raw| raw.trim().parse::<i64>().ok())
        })
    })
}

pub(super) fn ws_file_response(request_id: Option<String>, payload: JsonValue) -> JsonValue {
    let mut response = JsonMap::new();
    response.insert("type".to_string(), json!("file-response"));
    if let Some(id) = request_id {
        response.insert("requestId".to_string(), json!(id.clone()));
        response.insert("request_id".to_string(), json!(id));
    }
    if let Some(map) = payload.as_object() {
        for (key, value) in map {
            response.insert(key.clone(), value.clone());
        }
    }
    JsonValue::Object(response)
}

pub(super) fn resolve_ws_file_user_id(
    data: &JsonValue,
    state: &AppState,
) -> Result<String, String> {
    let explicit_user = json_string_field(data, "user_id")
        .or_else(|| json_string_field(data, "userId"))
        .or_else(|| json_string_field(data, "owner_id"))
        .map(|value| sanitize_user_segment(&value))
        .filter(|value| value != "anonymous");

    let token_user = state.auth_state.as_ref().map(|auth_state| {
        let token = json_string_field(data, "token");
        local_auth::extract_user_id_from_token(auth_state, token.as_deref())
    });

    if let Some(user_id) = explicit_user {
        return Ok(user_id);
    }
    if let Some(user_id) = token_user.filter(|value| value != "anonymous") {
        return Ok(user_id);
    }
    Err("Unauthorized".to_string())
}

pub(super) async fn resolve_ws_upload_target(
    state: &AppState,
    user_id: &str,
    raw_file_name: &str,
    raw_file_path: &str,
) -> Result<(String, PathBuf, String), String> {
    if !raw_file_path.trim().is_empty() {
        let (root, relative) = normalize_local_relative_path(raw_file_path, user_id)
            .ok_or_else(|| "Invalid file path".to_string())?;
        if relative.trim().is_empty() {
            return Err("Missing file path".to_string());
        }
        let base_dir = resolve_user_storage_dir(state, user_id, root)
            .await
            .map_err(|err| err.to_string())?;
        let file_path = base_dir.join(&relative);
        let file_name = file_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
            .to_string();
        let relative_path = match root {
            LocalStorageRoot::Downloads => format!("Downloads/{}", relative),
            LocalStorageRoot::Recordings => format!("recordings/{}", relative),
        };
        return Ok((file_name, file_path, relative_path));
    }

    let (file_name, file_path) = resolve_user_upload_path(state, user_id, raw_file_name)
        .await
        .map_err(|err| err.to_string())?;
    Ok((
        file_name.clone(),
        file_path,
        format!("Downloads/{}", file_name),
    ))
}

pub(super) async fn handle_ws_file_message(data: JsonValue, state: &AppState) -> JsonValue {
    let request_id =
        json_string_field(&data, "requestId").or_else(|| json_string_field(&data, "request_id"));
    let action = json_string_field(&data, "action").unwrap_or_default();
    let user_id = match resolve_ws_file_user_id(&data, state) {
        Ok(value) => value,
        Err(error) => {
            return ws_file_response(request_id, json!({ "success": false, "error": error }));
        }
    };

    if action == "upload-chunk" {
        let upload_id = match json_string_field(&data, "upload_id")
            .or_else(|| json_string_field(&data, "uploadId"))
            .and_then(|value| sanitize_upload_id(&value))
        {
            Some(value) => value,
            None => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": "Missing or invalid uploadId" }),
                );
            }
        };
        let chunk_index = match json_number_field(&data, "chunk_index")
            .or_else(|| json_number_field(&data, "chunkIndex"))
            .filter(|value| *value >= 0)
        {
            Some(value) => value,
            None => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": "Invalid chunk index" }),
                );
            }
        };
        let chunk_count = json_number_field(&data, "chunk_count")
            .or_else(|| json_number_field(&data, "chunkCount"))
            .unwrap_or(0);
        let Some(chunk_base64) = json_string_field(&data, "chunk_base64")
            .or_else(|| json_string_field(&data, "chunkBase64"))
            .or_else(|| json_string_field(&data, "chunk"))
        else {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": "Missing chunk data" }),
            );
        };
        let bytes = match general_purpose::STANDARD.decode(chunk_base64.as_bytes()) {
            Ok(value) => value,
            Err(error) => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": error.to_string() }),
                );
            }
        };
        let upload_dir = state
            .project_root
            .join("data")
            .join("uploads_tmp")
            .join(format!("user_{}", urlencoding::encode(&user_id)))
            .join(&upload_id);
        if let Err(error) = fs::create_dir_all(&upload_dir).await {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": error.to_string() }),
            );
        }
        let chunk_path = upload_dir.join(format!("{}.part", chunk_index));
        if let Err(error) = fs::write(&chunk_path, &bytes).await {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": error.to_string() }),
            );
        }
        return ws_file_response(
            request_id,
            json!({
                "success": true,
                "action": action,
                "upload_id": upload_id,
                "chunk_index": chunk_index,
                "chunk_count": chunk_count,
                "size_bytes": bytes.len()
            }),
        );
    }

    if action == "upload-complete" {
        let upload_id = match json_string_field(&data, "upload_id")
            .or_else(|| json_string_field(&data, "uploadId"))
            .and_then(|value| sanitize_upload_id(&value))
        {
            Some(value) => value,
            None => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": "Missing or invalid uploadId" }),
                );
            }
        };
        let chunk_count = match json_number_field(&data, "chunk_count")
            .or_else(|| json_number_field(&data, "chunkCount"))
            .filter(|value| *value >= 0)
        {
            Some(value) => value,
            None => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": "Invalid chunk count" }),
                );
            }
        };
        let raw_file_name = json_string_field(&data, "file_name")
            .or_else(|| json_string_field(&data, "fileName"))
            .unwrap_or_else(|| "upload.bin".to_string());
        let raw_file_path = json_string_field(&data, "file_path")
            .or_else(|| json_string_field(&data, "filePath"))
            .unwrap_or_default();

        let (file_name, file_path, relative_path) =
            match resolve_ws_upload_target(state, &user_id, &raw_file_name, &raw_file_path).await {
                Ok(value) => value,
                Err(error) => {
                    return ws_file_response(
                        request_id,
                        json!({ "success": false, "error": error }),
                    );
                }
            };

        if let Some(parent) = file_path.parent()
            && let Err(error) = fs::create_dir_all(parent).await
        {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": error.to_string() }),
            );
        }

        let upload_dir = state
            .project_root
            .join("data")
            .join("uploads_tmp")
            .join(format!("user_{}", urlencoding::encode(&user_id)))
            .join(&upload_id);
        let mut output = match fs::File::create(&file_path).await {
            Ok(file) => file,
            Err(error) => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": error.to_string() }),
                );
            }
        };
        for idx in 0..chunk_count {
            let chunk_path = upload_dir.join(format!("{}.part", idx));
            let chunk = match fs::read(&chunk_path).await {
                Ok(value) => value,
                Err(error) => {
                    return ws_file_response(
                        request_id,
                        json!({ "success": false, "error": error.to_string() }),
                    );
                }
            };
            if let Err(error) = output.write_all(&chunk).await {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": error.to_string() }),
                );
            }
        }
        if let Err(error) = output.flush().await {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": error.to_string() }),
            );
        }
        let _ = fs::remove_dir_all(&upload_dir).await;
        return ws_file_response(
            request_id,
            json!({
                "success": true,
                "action": action,
                "file_name": file_name,
                "owner_id": user_id,
                "file_path": relative_path,
                "path": format!("data/users/{}/{}", user_id, relative_path)
            }),
        );
    }

    ws_file_response(
        request_id,
        json!({ "success": false, "error": format!("Unknown file action: {}", action) }),
    )
}
