// The OTA store and contract the routes read (scripts/ios/ota-store.mjs, scripts/ios/ota-contract.mjs,
// the parts the server uses): `settings.json` (the capability secret, the testers by the SHA-256 of
// their token), `current.json`/`previous.json`, the releases and the uploads under way, the
// publication lock (a `.publish-lock` directory), the retention sweep, the signed download
// capabilities and the install manifest. Publication itself stays the build Mac's script.
use crate::http::fastify_reply::{NodeError, node_fs_error};
use crate::vault_router::js;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ring::hmac;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub const DOWNLOAD_TTL_MS: i64 = 2 * 60 * 60 * 1000;
pub const CURRENT_MANIFEST_PATH: &str = "/ios/current/manifest.plist";
const UPLOAD_KEPT_MS: f64 = 24.0 * 60.0 * 60.0 * 1000.0;
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

fn thrown(message: impl Into<String>) -> NodeError {
    NodeError {
        code: None,
        message: message.into(),
    }
}

/// `validId`: a release's UUID.
pub fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id
            .bytes()
            .all(|b| matches!(b, b'a'..=b'f' | b'0'..=b'9' | b'-'))
}

/// `tokenHash`.
pub fn token_hash(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn hex64(text: &str) -> bool {
    text.len() == 64 && text.bytes().all(|b| matches!(b, b'a'..=b'f' | b'0'..=b'9'))
}

/// `readJson`.
pub fn read_json(file: &Path) -> Result<JsonValue, NodeError> {
    let text = std::fs::read_to_string(file).map_err(|e| node_fs_error(&e, "open", file))?;
    serde_json::from_str(&text).map_err(|e| thrown(e.to_string()))
}

/// `current(root)`: the published release, `null` when none is.
pub fn current(root: &Path) -> Result<JsonValue, NodeError> {
    let file = root.join("current.json");
    if file.exists() {
        read_json(&file)
    } else {
        Ok(JsonValue::Null)
    }
}

/// `storePath(root, folder, id)`: refused when a path on the way is a symbolic link to something
/// (`fs.existsSync` follows it: a link to nothing passes).
pub fn store_path(root: &Path, folder: &str, id: &str) -> Result<PathBuf, NodeError> {
    if !valid_id(id) || ![".incoming", "releases"].contains(&folder) {
        return Err(thrown("invalid_release_path"));
    }
    let target = root.join(folder).join(id);
    for file in [root.to_path_buf(), root.join(folder), target.clone()] {
        if std::fs::metadata(&file).is_ok()
            && std::fs::symlink_metadata(&file).is_ok_and(|meta| meta.file_type().is_symlink())
        {
            return Err(thrown("ota_symlink_forbidden"));
        }
    }
    Ok(target)
}

/// Why the store's lock was not had.
pub enum Unlocked {
    Busy,
    Failed(NodeError),
}

/// `withStoreLock(root, work)`: `work` alone in the store, or `Busy`.
pub fn with_lock<T>(
    root: &Path,
    work: impl FnOnce() -> Result<T, NodeError>,
) -> Result<T, Unlocked> {
    let lock = root.join(".publish-lock");
    match std::fs::create_dir(&lock) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err(Unlocked::Busy);
        }
        Err(error) => return Err(Unlocked::Failed(node_fs_error(&error, "mkdir", &lock))),
    }
    let done = work();
    let released = std::fs::remove_dir(&lock).map_err(|e| node_fs_error(&e, "rmdir", &lock));
    match (done, released) {
        (_, Err(error)) | (Err(error), _) => Err(Unlocked::Failed(error)),
        (Ok(done), Ok(())) => Ok(done),
    }
}

// `<record>?.id` as a release name (`keep.has(id)` matches a text only).
fn id_of(record: &JsonValue) -> Option<String> {
    record
        .get("id")
        .and_then(JsonValue::as_str)
        .map(str::to_string)
}

/// `cleanup(root, active, now)`: every release but the current, the previous and those being
/// downloaded, and every upload left for a day; the names removed.
pub fn cleanup(
    root: &Path,
    active: &HashSet<String>,
    now_ms: f64,
) -> Result<Vec<String>, NodeError> {
    let previous_file = root.join("previous.json");
    let previous = if previous_file.exists() {
        read_json(&previous_file)?
    } else {
        JsonValue::Null
    };
    let mut keep: HashSet<String> = active.clone();
    keep.extend(id_of(&current(root)?));
    keep.extend(id_of(&previous));
    let mut removed = Vec::new();
    for folder in ["releases", ".incoming"] {
        let listed = root.join(folder);
        let entries =
            std::fs::read_dir(&listed).map_err(|e| node_fs_error(&e, "scandir", &listed))?;
        for entry in entries {
            let entry = entry.map_err(|e| node_fs_error(&e, "scandir", &listed))?;
            let id = entry.file_name().to_string_lossy().into_owned();
            if !valid_id(&id) || keep.contains(&id) {
                continue;
            }
            let directory = store_path(root, folder, &id)?;
            let expired = folder == "releases" || {
                let meta = std::fs::metadata(&directory)
                    .map_err(|e| node_fs_error(&e, "stat", &directory))?;
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0.0, |elapsed| elapsed.as_secs_f64() * 1000.0);
                modified + UPLOAD_KEPT_MS < now_ms
            };
            if expired {
                std::fs::remove_dir_all(&directory)
                    .map_err(|e| node_fs_error(&e, "rm", &directory))?;
                removed.push(id);
            }
        }
    }
    Ok(removed)
}

// `createHmac('sha256', secret)`: a text secret only.
fn key_of(secret: Option<&JsonValue>) -> Result<hmac::Key, NodeError> {
    let received = match secret {
        Some(JsonValue::String(secret)) => {
            return Ok(hmac::Key::new(hmac::HMAC_SHA256, secret.as_bytes()));
        }
        None => "undefined".to_string(),
        Some(JsonValue::Null) => "null".into(),
        Some(value @ (JsonValue::Number(_) | JsonValue::Bool(_))) => {
            let kind = if value.is_number() {
                "number"
            } else {
                "boolean"
            };
            format!("type {kind} ({})", js::string(value))
        }
        Some(JsonValue::Array(_)) => "an instance of Array".into(),
        Some(JsonValue::Object(_)) => "an instance of Object".into(),
    };
    Err(NodeError {
        code: Some("ERR_INVALID_ARG_TYPE"),
        message: format!(
            "The \"key\" argument must be of type string or an instance of ArrayBuffer, Buffer, TypedArray, DataView, KeyObject, or CryptoKey. Received {received}"
        ),
    })
}

/// `issueCapability(secret, payload)`.
pub fn issue(secret: Option<&JsonValue>, payload: &JsonValue) -> Result<String, NodeError> {
    let key = key_of(secret)?;
    let body = URL_SAFE_NO_PAD.encode(atome_store::intent::js_stringify(payload));
    let mac = URL_SAFE_NO_PAD.encode(hmac::sign(&key, body.as_bytes()));
    Ok(format!("{body}.{mac}"))
}

// `Buffer.from(text, 'base64url')`: either alphabet, other characters skipped, ended by `=`.
fn node_base64(text: &str) -> Vec<u8> {
    let (mut bytes, mut bits, mut count) = (Vec::new(), 0u32, 0u32);
    for c in text.chars() {
        let value = match c {
            'A'..='Z' => c as u32 - 'A' as u32,
            'a'..='z' => c as u32 - 'a' as u32 + 26,
            '0'..='9' => c as u32 - '0' as u32 + 52,
            '+' | '-' => 62,
            '/' | '_' => 63,
            '=' => break,
            _ => continue,
        };
        bits = (bits << 6) | value;
        count += 6;
        if count >= 8 {
            count -= 8;
            bytes.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
    }
    bytes
}

/// `verifyCapability(secret, token, now)`: its payload, or none when it is refused for any reason.
pub fn verify(
    secret: Option<&JsonValue>,
    token: Option<&JsonValue>,
    now_ms: i64,
) -> Option<JsonValue> {
    let token = token?
        .as_str()
        .filter(|token| token.encode_utf16().count() <= 2048)?;
    let mut parts = token.split('.');
    let (body, mac, extra) = (parts.next()?, parts.next()?, parts.next());
    if body.is_empty() || mac.is_empty() || extra.is_some_and(|extra| !extra.is_empty()) {
        return None;
    }
    let key = key_of(secret).ok()?;
    hmac::verify(&key, body.as_bytes(), &node_base64(mac)).ok()?;
    let payload: JsonValue =
        serde_json::from_str(&String::from_utf8_lossy(&node_base64(body))).ok()?;
    if payload.is_null() {
        return None;
    }
    let fields = payload.as_object();
    let field = |name: &str| fields.and_then(|fields| fields.get(name));
    if field("id").is_some_and(|id| !id.as_str().is_some_and(valid_id))
        || !hex64(&js::text(field("user")))
    {
        return None;
    }
    let expires = field("expires")?
        .as_f64()
        .filter(|ms| ms.fract() == 0.0 && ms.abs() <= MAX_SAFE_INTEGER)?;
    let now = now_ms as f64;
    (expires > now && expires <= now + DOWNLOAD_TTL_MS as f64).then_some(payload)
}

/// `config.users[hash]?.enabled === true`, which throws when the settings hold no `users`.
pub fn enabled_user(config: &JsonValue, hash: &JsonValue) -> Result<bool, NodeError> {
    let key = js::text(Some(hash));
    let users = match config {
        JsonValue::Null => return Err(thrown("Cannot read properties of null (reading 'users')")),
        JsonValue::Object(config) => config.get("users"),
        _ => None,
    };
    match users {
        None => Err(thrown(format!(
            "Cannot read properties of undefined (reading '{key}')"
        ))),
        Some(JsonValue::Null) => Err(thrown(format!(
            "Cannot read properties of null (reading '{key}')"
        ))),
        Some(JsonValue::Object(users)) => {
            Ok(users.get(&key).and_then(|user| user.get("enabled")) == Some(&json!(true)))
        }
        Some(_) => Ok(false),
    }
}

// `xml(value)`.
fn xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// `manifest(report, ipaUrl)`: the install manifest of the release (its IPA URL is always https).
pub fn manifest(report: &JsonValue, ipa_url: &str) -> Result<String, NodeError> {
    let field = |name: &str| js::text(report.as_object().and_then(|report| report.get(name)));
    let id_ok = report
        .get("id")
        .and_then(JsonValue::as_str)
        .is_some_and(valid_id);
    let version = field("version");
    let groups: Vec<&str> = version.split('.').collect();
    let digits = |text: &str| !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit());
    let build = field("build");
    if !id_ok || groups.len() < 2 || !groups.iter().all(|group| digits(group)) || !digits(&build) {
        return Err(thrown("invalid_manifest_input"));
    }
    Ok(format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>{}</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>one.atome.app</string>
<key>bundle-version</key><string>{}</string><key>kind</key><string>software</string>
<key>title</key><string>atome</string></dict></dict></array></dict></plist>
"#,
        xml(ipa_url),
        xml(&build)
    ))
}

#[cfg(test)]
#[path = "../../../../../tests/atome_server/ota_retention.rs"]
mod retention_parity;
