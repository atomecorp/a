use super::local_atome::{LocalAtomeState, RemoteSyncCredential};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};

fn local_media_path(
    storage_root: &Path,
    local_user_id: &str,
    properties: &serde_json::Map<String, JsonValue>,
) -> Option<PathBuf> {
    let raw = ["file_path", "filePath", "path"]
        .iter()
        .find_map(|key| properties.get(*key).and_then(JsonValue::as_str))?
        .trim();
    if raw.is_empty() {
        return None;
    }
    let normalized = raw.replace('\\', "/");
    let user_prefix = format!("data/users/{local_user_id}/");
    let relative = normalized
        .split_once(&user_prefix)
        .map(|(_, suffix)| suffix)
        .unwrap_or(normalized.trim_start_matches('/'));
    let relative_path = Path::new(relative);
    if relative_path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return None;
    }
    Some(
        storage_root
            .join("data")
            .join("users")
            .join(local_user_id)
            .join(relative_path),
    )
}

fn rewrite_remote_media_properties(
    properties: &mut serde_json::Map<String, JsonValue>,
    remote_url: &str,
    remote_user_id: &str,
    file_name: &str,
    file_path: &str,
) {
    let encoded_name = urlencoding::encode(file_name);
    let encoded_owner = urlencoding::encode(remote_user_id);
    let media_url = format!(
        "{}/api/uploads/{}?media_user_id={}",
        remote_url.trim_end_matches('/'),
        encoded_name,
        encoded_owner
    );
    properties.insert("file_name".to_string(), JsonValue::String(file_name.to_string()));
    properties.insert("file_path".to_string(), JsonValue::String(file_path.to_string()));
    properties.insert("media_url".to_string(), JsonValue::String(media_url.clone()));
    properties.insert(
        "media_user_id".to_string(),
        JsonValue::String(remote_user_id.to_string()),
    );
    for (alias, value) in [
        ("fileName", file_name),
        ("filePath", file_path),
        ("mediaUserId", remote_user_id),
    ] {
        if properties.contains_key(alias) {
            properties.insert(alias.to_string(), JsonValue::String(value.to_string()));
        }
    }
    for key in ["mediaUrl", "src", "url", "stable_media_url"] {
        if properties
            .get(key)
            .and_then(JsonValue::as_str)
            .is_some_and(|value| value.contains("/api/uploads/") || value.contains("127.0.0.1:3000"))
        {
            properties.insert(key.to_string(), JsonValue::String(media_url.clone()));
        }
    }
}

pub(super) async fn upload_outbound_media(
    state: &LocalAtomeState,
    remote_url: &str,
    local_user_id: &str,
    credential: &RemoteSyncCredential,
    event: &mut JsonValue,
) -> Result<(), String> {
    let atome_id = event
        .get("atome_id")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .to_string();
    let Some(properties) = event
        .pointer_mut("/payload/props")
        .and_then(JsonValue::as_object_mut)
    else {
        return Ok(());
    };
    let already_remote = properties
        .get("media_url")
        .or_else(|| properties.get("mediaUrl"))
        .and_then(JsonValue::as_str)
        .is_some_and(|value| {
            value.starts_with(remote_url.trim_end_matches('/'))
                && value.contains("/api/uploads/")
        })
        && properties
            .get("media_user_id")
            .or_else(|| properties.get("mediaUserId"))
            .and_then(JsonValue::as_str)
            == Some(credential.remote_user_id.as_str());
    if already_remote {
        return Ok(());
    }
    let Some(path) = local_media_path(state.storage_root(), local_user_id, properties) else {
        return Ok(());
    };
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|error| format!("media_read_failed:{}:{}", path.display(), error))?;
    let file_name = properties
        .get("file_name")
        .or_else(|| properties.get("fileName"))
        .and_then(JsonValue::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| path.file_name().and_then(|value| value.to_str()).map(str::to_string))
        .ok_or_else(|| "media_file_name_missing".to_string())?;
    let mime_type = properties
        .get("mime_type")
        .or_else(|| properties.get("mimeType"))
        .and_then(JsonValue::as_str)
        .unwrap_or("application/octet-stream");
    let atome_type = properties
        .get("kind")
        .or_else(|| properties.get("type"))
        .and_then(JsonValue::as_str)
        .unwrap_or("generic");
    let mut upload = reqwest::Client::new()
        .post(format!("{}/api/uploads", remote_url.trim_end_matches('/')))
        .bearer_auth(&credential.token)
        .header("Content-Type", "application/octet-stream")
        .header("X-Filename", urlencoding::encode(&file_name).to_string())
        .header("X-Mime-Type", mime_type)
        .header("X-Atome-Id", &atome_id)
        .header("X-Atome-Type", atome_type);
    let user_media_root = state
        .storage_root()
        .join("data")
        .join("users")
        .join(local_user_id);
    if let Ok(relative_path) = path.strip_prefix(user_media_root) {
        upload = upload.header(
            "X-File-Path",
            relative_path.to_string_lossy().replace('\\', "/"),
        );
    }
    let response = upload
        .body(bytes)
        .send()
        .await
        .map_err(|error| format!("media_upload_failed:{error}"))?;
    let status = response.status();
    let payload: JsonValue = response
        .json()
        .await
        .map_err(|error| format!("media_upload_response_invalid:{error}"))?;
    if !status.is_success() || payload.get("success").and_then(JsonValue::as_bool) != Some(true) {
        return Err(payload
            .get("error")
            .and_then(JsonValue::as_str)
            .unwrap_or("media_upload_rejected")
            .to_string());
    }
    let remote_file_name = payload
        .get("file_name")
        .and_then(JsonValue::as_str)
        .unwrap_or(&file_name);
    let remote_file_path = payload
        .get("file_path")
        .and_then(JsonValue::as_str)
        .unwrap_or(remote_file_name);
    rewrite_remote_media_properties(
        properties,
        remote_url,
        &credential.remote_user_id,
        remote_file_name,
        remote_file_path,
    );
    if event
        .get("id")
        .and_then(JsonValue::as_str)
        .is_some_and(|id| id.starts_with("remote-state-bootstrap"))
    {
        let mut canonical = event.clone();
        canonical.as_object_mut().map(|object| object.remove("id"));
        let digest = hex::encode(Sha256::digest(canonical.to_string().as_bytes()));
        event["id"] = JsonValue::String(format!("remote-media-bootstrap:{atome_id}:{digest}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{local_media_path, rewrite_remote_media_properties};
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn media_paths_are_scoped_to_the_local_user_and_rewritten_for_fastify() {
        let properties = json!({
            "kind": "image",
            "file_path": "data/users/local-user/Downloads/photo été.png"
        });
        assert_eq!(
            local_media_path(
                Path::new("/workspace"),
                "local-user",
                properties.as_object().unwrap(),
            ),
            Some(Path::new("/workspace/data/users/local-user/Downloads/photo été.png").to_path_buf())
        );
        assert_eq!(
            local_media_path(
                Path::new("/workspace"),
                "local-user",
                json!({ "file_path": "../../secret" }).as_object().unwrap(),
            ),
            None
        );

        let mut rewritten = properties.as_object().unwrap().clone();
        rewrite_remote_media_properties(
            &mut rewritten,
            "https://atome.one/",
            "remote-user",
            "photo été.png",
            "Downloads/photo été.png",
        );
        assert_eq!(rewritten.get("media_user_id"), Some(&json!("remote-user")));
        assert_eq!(
            rewritten.get("media_url"),
            Some(&json!("https://atome.one/api/uploads/photo%20%C3%A9t%C3%A9.png?media_user_id=remote-user"))
        );
    }
}
