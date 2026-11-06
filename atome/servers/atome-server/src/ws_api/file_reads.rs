// The `file` family's reads and deletion on `/ws/api` (download-info, download-chunk and
// delete of server/wsFileOperations.js, ported): a file `Downloads::target` grants, described,
// sent chunk by chunk in base64, or removed by its owner, its bytes then its record.
use super::Connection;
use super::file_ops::{failed, response};
use crate::media::downloads::{Download, Missed};
use crate::vault_router::js;
use base64::Engine;
use serde_json::{Value as JsonValue, json};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

// `coerceWsChunkSize` (server/server_utils.js).
const CHUNK_DEFAULT: f64 = 256.0 * 1024.0;
const CHUNK_MIN: f64 = 8.0 * 1024.0;
const CHUNK_MAX: f64 = 1024.0 * 1024.0;

fn chunk_size(message: &JsonValue) -> f64 {
    let asked = js::number(js::first(message, &["chunk_size", "chunkSize"]));
    if !asked.is_finite() || asked <= 0.0 {
        CHUNK_DEFAULT
    } else {
        asked.clamp(CHUNK_MIN, CHUNK_MAX)
    }
}

// `data.chunk_index ?? data.chunkIndex ?? -1`.
fn chunk_index(message: &JsonValue) -> f64 {
    ["chunk_index", "chunkIndex"]
        .iter()
        .find_map(|key| message.get(*key).filter(|value| !value.is_null()))
        .map_or(-1.0, |value| js::number(Some(value)))
}

fn not_found(message: &JsonValue, extra: JsonValue) -> JsonValue {
    let mut payload = json!({ "success": false, "error": "File not found", "status": 404 });
    if let JsonValue::Object(fields) = extra {
        payload.as_object_mut().expect("payload").extend(fields);
    }
    response(message, payload)
}

// The target, else the reply its absence gives; `failure` names a thrown error with no message.
async fn found(
    connection: &Connection,
    message: &JsonValue,
    identifier: &JsonValue,
    user: &str,
    failure: &str,
    extra: JsonValue,
) -> Result<Download, JsonValue> {
    match connection
        .ws_api
        .downloads()
        .target(&js::string(identifier), user)
        .await
    {
        Ok(found) => Ok(found),
        Err(Missed::Refused(..)) => Err(not_found(message, extra)),
        Err(Missed::Failed(error)) => Err(failed(
            message,
            if error.is_empty() { failure } else { &error },
        )),
    }
}

async fn info(
    connection: &Connection,
    message: &JsonValue,
    identifier: &JsonValue,
    user: &str,
) -> JsonValue {
    let snapshot = if js::truthy(message.get("debug")) {
        connection.ws_api.storage.downloads_snapshot(user)
    } else {
        JsonValue::Null
    };
    let extra = json!({ "downloadsSnapshot": snapshot });
    let target = match found(
        connection,
        message,
        identifier,
        user,
        "download_info_failed",
        extra,
    )
    .await
    {
        Ok(target) => target,
        Err(reply) => return reply,
    };
    let size = match tokio::fs::metadata(&target.file_path).await {
        Ok(metadata) => metadata.len(),
        Err(error) => return failed(message, &error.to_string()),
    };
    let chunk = chunk_size(message);
    let count = if size == 0 {
        0.0
    } else {
        (size as f64 / chunk).ceil()
    };
    let meta = target.meta.unwrap_or(JsonValue::Null);
    let pick = |key: &str| {
        meta.get(key)
            .filter(|value| js::truthy(Some(value)))
            .cloned()
    };
    let named = |key: &str| {
        pick(key).unwrap_or_else(|| {
            json!(
                Some(target.download_name.clone())
                    .filter(|name| !name.is_empty())
                    .unwrap_or_else(|| js::string(identifier))
            )
        })
    };
    response(
        message,
        json!({ "success": true, "action": "download-info",
            "atome_id": pick("atome_id").unwrap_or_else(|| identifier.clone()),
            "file_name": named("file_name"), "original_name": named("original_name"),
            "file_path": pick("file_path"), "mime_type": pick("mime_type"),
            "size_bytes": size, "chunk_size": js::number_json(chunk), "chunk_count": js::number_json(count),
            "downloadsSnapshot": snapshot }),
    )
}

async fn chunk(
    connection: &Connection,
    message: &JsonValue,
    identifier: &JsonValue,
    user: &str,
) -> JsonValue {
    let index = chunk_index(message);
    if !index.is_finite() || index < 0.0 {
        return failed(message, "Invalid chunk index");
    }
    let chunk = chunk_size(message);
    let target = match found(
        connection,
        message,
        identifier,
        user,
        "download_chunk_failed",
        json!({}),
    )
    .await
    {
        Ok(target) => target,
        Err(reply) => return reply,
    };
    let read = async {
        let mut file = tokio::fs::File::open(&target.file_path).await?;
        let size = file.metadata().await?.len();
        let offset = index * chunk;
        if offset >= size as f64 {
            return Ok(None);
        }
        let length = chunk.min(size as f64 - offset) as usize;
        file.seek(std::io::SeekFrom::Start(offset as u64)).await?;
        let mut bytes = vec![0; length];
        let mut filled = 0;
        while filled < length {
            match file.read(&mut bytes[filled..]).await? {
                0 => break,
                read => filled += read,
            }
        }
        Ok::<_, std::io::Error>(Some((size, offset, length, bytes)))
    };
    match read.await {
        Ok(None) => failed(message, "Chunk out of range"),
        Ok(Some((size, offset, length, bytes))) => response(
            message,
            json!({ "success": true, "action": "download-chunk", "atome_id": identifier,
                "chunk_index": js::number_json(index), "chunk_size": js::number_json(chunk), "size_bytes": size,
                "chunk_base64": base64::engine::general_purpose::STANDARD.encode(bytes),
                "done": offset + length as f64 >= size as f64 }),
        ),
        Err(error) => failed(message, &error.to_string()),
    }
}

async fn delete(
    connection: &Connection,
    message: &JsonValue,
    identifier: Option<&JsonValue>,
    user: &str,
) -> JsonValue {
    let Some(identifier) = identifier else {
        return not_found(message, json!({}));
    };
    let target = match found(
        connection,
        message,
        identifier,
        user,
        "file_delete_failed",
        json!({}),
    )
    .await
    {
        Ok(target) => target,
        Err(reply) => return reply,
    };
    let meta = target.meta.unwrap_or(JsonValue::Null);
    if meta.get("owner_id") != Some(&json!(user)) {
        return response(
            message,
            json!({ "success": false, "error": "file_delete_owner_only", "status": 403 }),
        );
    }
    if let Err(error) = tokio::fs::remove_file(&target.file_path).await
        && error.kind() != std::io::ErrorKind::NotFound
    {
        return failed(message, &error.to_string());
    }
    let atome_id = js::text(meta.get("atome_id"));
    match connection
        .ws_api
        .downloads()
        .delete_record(&atome_id, user)
        .await
    {
        Ok(removed) => {
            let mut payload = json!({ "success": removed["success"] == json!(true), "action": "delete",
                "atome_id": meta["atome_id"] });
            if let Some(error) = removed.get("error") {
                payload["error"] = error.clone();
            }
            response(message, payload)
        }
        Err(error) => failed(message, &error),
    }
}

/// A `file` frame other than an upload, for the account `user` it acts for.
pub(super) async fn answer(connection: &Connection, message: &JsonValue, user: &str) -> JsonValue {
    if !js::truthy(message.get("action")) {
        return failed(message, "Missing file action");
    }
    let action = js::text(message.get("action"));
    let identifier = js::first(
        message,
        &["atome_id", "id", "file_id", "identifier", "file"],
    );
    match action.as_str() {
        "download-info" | "download-chunk" if identifier.is_none() => {
            failed(message, "Missing file identifier")
        }
        "download-info" => info(connection, message, identifier.expect("identifier"), user).await,
        "download-chunk" => chunk(connection, message, identifier.expect("identifier"), user).await,
        "delete" => delete(connection, message, identifier, user).await,
        other => failed(message, &format!("Unknown file action: {other}")),
    }
}
