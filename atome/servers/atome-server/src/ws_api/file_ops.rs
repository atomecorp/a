// The `file` family on `/ws/api` (server/wsFileOperations.js, ported): its uploads here
// (upload-chunk, upload-complete: a chunk kept under its uploader, then the chunks assembled
// into the caller's `Downloads` or a path it names, made playable and recorded as its file), its
// reads and deletion in file_reads.rs. The account a request acts for is the connection's
// (identity.rs `file_requester`).
use super::Connection;
use crate::media::playback;
use crate::media::storage::{self, Registration, normalize_user_relative_path};
use crate::vault_router::js;
use percent_encoding::utf8_percent_encode;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::os::unix::fs::DirBuilderExt;
use std::path::PathBuf;
use std::sync::Arc;

// `{ type: 'file-response', requestId, success, ...payload }`.
pub(super) fn response(message: &JsonValue, payload: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("file-response"));
    if let Some(request_id) = message.get("requestId") {
        reply.insert("requestId".into(), request_id.clone());
    }
    let success = js::truthy(payload.get("success"));
    reply.insert("success".into(), json!(success));
    if let JsonValue::Object(fields) = payload {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

pub(super) fn failed(message: &JsonValue, error: &str) -> JsonValue {
    response(message, json!({ "success": false, "error": error }))
}

// `String(value || '')`, a field's text when it is truthy.
fn field(message: &JsonValue, keys: &[&str]) -> String {
    js::first(message, keys).map(js::string).unwrap_or_default()
}

// `sanitizeUploadId(String(raw || ''))`.
fn upload_id(message: &JsonValue) -> Option<String> {
    let raw = field(message, &["upload_id"]);
    let value = js::trim(&raw);
    (!value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
    .then(|| value.to_string())
}

// `Number(value ?? fallback)`.
fn number_or(message: &JsonValue, key: &str, fallback: f64) -> f64 {
    match message.get(key) {
        None | Some(JsonValue::Null) => fallback,
        value => js::number(value),
    }
}

// `Buffer.from(text, 'base64')`: both alphabets, anything else skipped, up to the
// first `=`, a trailing partial group kept for the bytes it holds.
fn base64_bytes(text: &str) -> Vec<u8> {
    let sextets: Vec<u8> = text
        .bytes()
        .take_while(|&b| b != b'=')
        .filter_map(|b| match b {
            b'A'..=b'Z' => Some(b - b'A'),
            b'a'..=b'z' => Some(b - b'a' + 26),
            b'0'..=b'9' => Some(b - b'0' + 52),
            b'+' | b'-' => Some(62),
            b'/' | b'_' => Some(63),
            _ => None,
        })
        .collect();
    let mut bytes = Vec::with_capacity(sextets.len() * 3 / 4);
    for group in sextets.chunks(4) {
        let value = group
            .iter()
            .enumerate()
            .fold(0u32, |value, (index, &sextet)| {
                value | (u32::from(sextet) << (18 - 6 * index))
            });
        let whole = [(value >> 16) as u8, (value >> 8) as u8, value as u8];
        bytes.extend_from_slice(&whole[..group.len().saturating_sub(1)]);
    }
    bytes
}

fn chunks(connection: &Connection, user: &str, upload: &str) -> PathBuf {
    let owner = utf8_percent_encode(user, crate::http::uri::URI_COMPONENT).to_string();
    connection
        .ws_api
        .storage
        .uploads_tmp
        .join(format!("user_{owner}"))
        .join(upload)
}

async fn chunk(connection: &Connection, message: &JsonValue, user: &str) -> JsonValue {
    let Some(upload) = upload_id(message) else {
        return failed(message, "Missing or invalid uploadId");
    };
    let index = number_or(message, "chunk_index", -1.0);
    let count = number_or(message, "chunk_count", 0.0);
    if !index.is_finite() || index < 0.0 {
        return failed(message, "Invalid chunk index");
    }
    let encoded = field(message, &["chunk_base64", "chunk"]);
    if encoded.is_empty() {
        return failed(message, "Missing chunk data");
    }
    let bytes = base64_bytes(&encoded);
    let directory = chunks(connection, user, &upload);
    let index = js::number_json(index);
    let written = match std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&directory)
    {
        Ok(()) => {
            let part = directory.join(format!("{}.part", js::string(&index)));
            tokio::fs::write(part, &bytes).await
        }
        Err(error) => Err(error),
    };
    match written {
        Ok(()) => response(
            message,
            json!({ "success": true, "action": "upload-chunk", "upload_id": upload, "chunk_index": index,
                    "chunk_count": js::number_json(count), "size_bytes": bytes.len() }),
        ),
        Err(error) => failed(message, &error.to_string()),
    }
}

async fn complete(connection: &Connection, message: &JsonValue, user: &str) -> JsonValue {
    let Some(upload) = upload_id(message) else {
        return failed(message, "Missing or invalid uploadId");
    };
    let count = number_or(message, "chunk_count", 0.0);
    let name = field(message, &["file_name", "name"]);
    let path = field(message, &["file_path", "path"]);
    if name.is_empty() && path.is_empty() {
        return failed(message, "Missing fileName or filePath");
    }
    match completed(connection, message, user, &upload, count, name, &path).await {
        Ok(answer) => response(message, answer),
        Err(error) => failed(message, &error),
    }
}

async fn completed(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
    upload: &str,
    count: f64,
    name: String,
    path: &str,
) -> Result<JsonValue, String> {
    let store = &connection.ws_api.storage;
    let (file_name, file_path, relative_path) = if path.is_empty() {
        let placed = store
            .upload_path(user, if name.is_empty() { "upload.bin" } else { &name })
            .map_err(|e| e.to_string())?;
        (placed.file_name, placed.file_path, placed.relative_path)
    } else {
        let placed = store.asset_path(user, &normalize_user_relative_path(path, user))?;
        let file_name = if name.is_empty() {
            placed.file_name
        } else {
            name
        };
        (file_name, placed.file_path, placed.relative_path)
    };
    let directory = chunks(connection, user, upload);
    if count > 0.0 {
        storage::assemble(&directory, count.ceil() as u64, &file_path).await?;
    } else {
        tokio::fs::write(&file_path, b"")
            .await
            .map_err(|e| e.to_string())?;
    }
    let _ = tokio::fs::remove_dir_all(&directory).await;
    let mime = field(message, &["mime_type"]);
    playback::ensure_cache(&file_path, &file_name, &mime).await?;
    let size = tokio::fs::metadata(&file_path)
        .await
        .map_or(0, |meta| meta.len());
    let original = field(message, &["original_name", "file_name", "name"]);
    let kind = field(message, &["atome_type"]);
    let registration = Registration {
        atome_id: Some(field(message, &["atome_id"])),
        atome_type: Some(kind.as_str()).filter(|kind| !kind.is_empty()),
        original_name: original,
        mime_type: Some(mime).filter(|mime| !mime.is_empty()),
        size,
        file_path: Some(relative_path.clone()),
    };
    let central = connection.ws_api.sessions.central();
    storage::register(central, &file_name, user, registration).await?;
    let snapshot = if js::truthy(message.get("debug")) {
        store.downloads_snapshot(user)
    } else {
        JsonValue::Null
    };
    Ok(
        json!({ "success": true, "action": "upload-complete", "file_name": file_name, "owner_id": user,
               "file_path": relative_path, "downloadsSnapshot": snapshot }),
    )
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let front = connection.file_requester(&message).await;
    let reply = match front {
        Err(error) => failed(&message, &error),
        Ok(front) if front.get("session_error").is_some() => front["session_error"].clone(),
        Ok(front) => match front.get("userId").and_then(JsonValue::as_str) {
            None => failed(&message, &js::text(front.get("error"))),
            Some(user) if message["action"] == "upload-chunk" => {
                chunk(&connection, &message, user).await
            }
            Some(user) if message["action"] == "upload-complete" => {
                complete(&connection, &message, user).await
            }
            Some(user) => super::file_reads::answer(&connection, &message, user).await,
        },
    };
    connection.reply(reply).await;
}
