// The registry of device keys (server/auth_devices.js, ported): one account × one
// device holds a silent `session` key and, where the platform verifies its user, an
// `approve` key. Only public halves are stored. Approve-class purposes are decided
// here, never on the client.
use super::proof::Proof;
use crate::vault_router::central::{row_json, sql_value};
use crate::vault_router::js;
use indexmap::IndexMap;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub const APPROVE_ASSURANCE: &str = "hardware_uv";
pub const PROBATION_MS: i64 = 72 * 3_600_000;
const ASSURANCES: [&str; 3] = ["hardware_uv", "hardware", "software"];
// An MCP client's seat (scripts/mcp/atome_mcp_stdio.mjs), its key paired like a device's.
pub const PROGRAM_PLATFORM: &str = "mcp_program";
const PLATFORMS: [&str; 10] = [
    "ios",
    "ipados",
    "android",
    "macos",
    "windows",
    "linux",
    "freebsd",
    "chromeos",
    "web",
    PROGRAM_PLATFORM,
];
const ALWAYS_PERSONAL: [&str; 3] = ["ios", "ipados", "android"];
// `enrolled_by` of a device opened by a recovery (code or SMS link).
const RECOVERY_CHANNELS: [&str; 2] = ["recovery_code", "phone_recovery"];

fn text<'a>(row: &'a JsonValue, key: &str) -> &'a str {
    row.get(key).and_then(JsonValue::as_str).unwrap_or_default()
}

// `String(value || '')` without control characters, trimmed, 64 UTF-16 units at most.
fn clean(value: Option<&JsonValue>) -> String {
    let text = value
        .filter(|value| js::truthy(Some(value)))
        .map(|value| js::text(Some(value)))
        .unwrap_or_default();
    let kept: String = text
        .chars()
        .filter(|c| !matches!(*c as u32, 0..=0x1f | 0x7f))
        .collect();
    js::slice(js::trim(&kept), 64)
}

/// `normalizeDeviceMeta`: a known platform (a program's only when `program`), a clean
/// label, and for a program the machine it runs on.
pub fn normalize_meta(meta: Option<&JsonValue>, program: bool) -> JsonValue {
    let meta = meta.unwrap_or(&JsonValue::Null);
    let asked = meta.get("platform").and_then(JsonValue::as_str);
    let platform = asked
        .filter(|platform| {
            PLATFORMS.contains(platform) && (program || *platform != PROGRAM_PLATFORM)
        })
        .unwrap_or("web");
    let mut normalized = JsonMap::new();
    normalized.insert("platform".into(), json!(platform));
    normalized.insert("label".into(), json!(clean(meta.get("label"))));
    if platform == PROGRAM_PLATFORM {
        normalized.insert("host".into(), json!(clean(meta.get("host"))));
    }
    JsonValue::Object(normalized)
}

/// `resolveDeviceClass`: phones and tablets are personal; a computer or a browser
/// says it once; a program's key is a program's.
pub fn resolve_class(platform: &str, requested: Option<&JsonValue>) -> Result<String, String> {
    if platform == PROGRAM_PLATFORM {
        return match requested {
            None => Ok("program".into()),
            Some(value) if value.as_str() == Some("program") => Ok("program".into()),
            Some(_) => Err("auth_request_invalid".into()),
        };
    }
    let requested = requested.and_then(JsonValue::as_str);
    if ALWAYS_PERSONAL.contains(&platform) {
        return Ok("personal".into());
    }
    match requested {
        Some(class @ ("personal" | "shared")) => Ok(class.into()),
        _ => Err("auth_device_class_required".into()),
    }
}

pub fn require_assurance(value: Option<&JsonValue>) -> Result<&str, String> {
    value
        .and_then(JsonValue::as_str)
        .filter(|value| ASSURANCES.contains(value))
        .ok_or_else(|| "auth_request_invalid".into())
}

/// A key to enroll; defaults as `enroll`'s.
pub struct Enrollment<'a> {
    pub key_id: &'a str,
    pub principal: &'a str,
    pub jwk: &'a JsonValue,
    pub role: &'a str,
    pub device_id: Option<&'a str>,
    pub assurance: &'a str,
    pub device_class: &'a str,
    pub platform: &'a str,
    pub label: &'a str,
    pub enrolled_by: Option<&'a str>,
    pub restricted_until: Option<i64>,
    pub credential_id: Option<&'a str>,
    pub sign_count: i64,
    pub connection_proof: bool,
}

impl<'a> Enrollment<'a> {
    pub fn session(key_id: &'a str, principal: &'a str, jwk: &'a JsonValue) -> Self {
        Self {
            key_id,
            principal,
            jwk,
            role: "session",
            device_id: None,
            assurance: "software",
            device_class: "personal",
            platform: "web",
            label: "",
            enrolled_by: None,
            restricted_until: None,
            credential_id: None,
            sign_count: 0,
            connection_proof: false,
        }
    }
}

// Keys enrolled by the V1 flows belong to clients that prove them on every connection.
pub fn enroll(db: &Connection, key: &Enrollment<'_>, now: i64) -> Result<(), String> {
    if !ASSURANCES.contains(&key.assurance) {
        return Err("auth_request_invalid".into());
    }
    db.execute(
        "INSERT INTO auth_device_keys (key_id, principal_id, public_key, enrolled_ms, restricted_until_ms,
         revoked_ms, key_role, device_id, assurance, device_class, platform, label, enrolled_by, credential_id, sign_count, last_seen_ms,
         connection_proof) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            key.key_id,
            key.principal,
            key.jwk.to_string(),
            now,
            key.restricted_until.unwrap_or(now),
            key.role,
            key.device_id.filter(|id| !id.is_empty()).unwrap_or(key.key_id),
            key.assurance,
            key.device_class,
            key.platform,
            key.label,
            key.enrolled_by.filter(|by| !by.is_empty()),
            key.credential_id,
            key.sign_count,
            now,
            i64::from(key.connection_proof),
        ],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

pub fn by_id(db: &Connection, key_id: &str) -> Result<Option<JsonValue>, String> {
    db.query_row(
        "SELECT * FROM auth_device_keys WHERE key_id = ?",
        [key_id],
        row_json,
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn device_of(row: &JsonValue) -> String {
    Some(text(row, "device_id"))
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| text(row, "key_id"))
        .to_string()
}

/// The active approve key of the device that holds this session key.
pub fn approve_key_of(
    db: &Connection,
    session_key: &JsonValue,
) -> Result<Option<JsonValue>, String> {
    db.query_row(
        "SELECT * FROM auth_device_keys
         WHERE principal_id = ? AND device_id = ? AND key_role = 'approve' AND revoked_ms IS NULL
         ORDER BY enrolled_ms DESC LIMIT 1",
        params![text(session_key, "principal_id"), device_of(session_key)],
        row_json,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn restricted(key: &JsonValue, now: i64) -> bool {
    js::number(key.get("restricted_until_ms")) > now as f64
}

/// A device that hears the account's requests (live notice, push, pending list):
/// personal and out of probation.
pub fn hears_account_requests(key: Option<&JsonValue>, now: i64) -> bool {
    key.is_some_and(|key| {
        key["revoked_ms"].is_null()
            && text(key, "device_class") == "personal"
            && !restricted(key, now)
    })
}

/// A remote approval needs a user-verified key on a personal device out of probation;
/// a device enrolled by a recovery may replace the code it consumed at once.
pub fn require_approver(
    db: &Connection,
    session_key: Option<&JsonValue>,
    purpose: &str,
    now: i64,
) -> Result<JsonValue, String> {
    let Some(session_key) = session_key.filter(|key| key["revoked_ms"].is_null()) else {
        return Err("auth_session_invalid".into());
    };
    let approve = approve_key_of(db, session_key)?
        .filter(|approve| {
            text(approve, "assurance") == APPROVE_ASSURANCE
                && text(approve, "device_class") == "personal"
                && text(session_key, "device_class") == "personal"
        })
        .ok_or("auth_approve_key_required")?;
    let recovered = purpose == "recovery-code-set"
        && RECOVERY_CHANNELS.contains(&text(session_key, "enrolled_by"));
    if !recovered && (restricted(&approve, now) || restricted(session_key, now)) {
        return Err("auth_device_cooling_off".into());
    }
    Ok(approve)
}

/// The account's devices, each with its session key (a device without one is not listed).
pub fn list(db: &Connection, principal: &str) -> Result<Vec<JsonValue>, String> {
    let mut statement = db
        .prepare(
            "SELECT key_id, key_role, device_id, assurance, device_class, platform, label,
             enrolled_ms, restricted_until_ms, enrolled_by, last_seen_ms FROM auth_device_keys
             WHERE principal_id = ? AND revoked_ms IS NULL ORDER BY enrolled_ms",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([principal], row_json)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut devices: IndexMap<String, JsonValue> = IndexMap::new();
    for row in rows {
        let id = device_of(&row);
        let device = devices.entry(id.clone()).or_insert_with(|| {
            json!({ "deviceId": id,
                "platform": Some(text(&row, "platform")).filter(|p| !p.is_empty()).unwrap_or("web"),
                "label": text(&row, "label"), "deviceClass": row["device_class"],
                "enrolledAt": row["enrolled_ms"], "lastSeenAt": row["last_seen_ms"],
                "probationUntil": row["restricted_until_ms"], "canApprove": false, "sessionKeyId": null })
        });
        match text(&row, "key_role") {
            "session" => device["sessionKeyId"] = row["key_id"].clone(),
            "approve" if text(&row, "assurance") == APPROVE_ASSURANCE => {
                device["canApprove"] = json!(true)
            }
            _ => {}
        }
        // `Math.max(a, b)`: null counts as 0.
        let probation = js::number(device.get("probationUntil"))
            .max(js::number(row.get("restricted_until_ms")));
        device["probationUntil"] = js::number_json(probation);
        let seen = js::number_or(device.get("lastSeenAt"), 0.0)
            .max(js::number_or(row.get("last_seen_ms"), 0.0));
        device["lastSeenAt"] = if seen == 0.0 {
            JsonValue::Null
        } else {
            js::number_json(seen)
        };
    }
    Ok(devices
        .into_values()
        .filter(|device| !device["sessionKeyId"].is_null())
        .collect())
}

/// Every key of a device revoked, with its sessions (returned, to disconnect).
pub fn revoke_device(
    db: &Connection,
    principal: &str,
    device_id: &JsonValue,
    now: i64,
) -> Result<Vec<String>, String> {
    let device_id = sql_value(device_id);
    let collect = |sql: &str, values: &[&dyn rusqlite::ToSql]| -> Result<Vec<String>, String> {
        let mut statement = db.prepare(sql).map_err(|e| e.to_string())?;
        let rows = statement
            .query_map(values, |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    };
    let keys = collect(
        "SELECT key_id FROM auth_device_keys
         WHERE principal_id = ? AND (device_id = ? OR key_id = ?) AND revoked_ms IS NULL",
        &[&principal, &device_id, &device_id],
    )?;
    if keys.is_empty() {
        return Err("auth_request_invalid".into());
    }
    let mut sessions = Vec::new();
    for key in keys {
        db.execute(
            "UPDATE auth_device_keys SET revoked_ms = ? WHERE key_id = ?",
            params![now, key],
        )
        .map_err(|e| e.to_string())?;
        for session in collect(
            "SELECT session_id FROM auth_device_sessions WHERE key_id = ? AND revoked_ms IS NULL",
            &[&key],
        )? {
            db.execute(
                "UPDATE auth_device_sessions SET revoked_ms = ? WHERE session_id = ?",
                params![now, session],
            )
            .and_then(|_| {
                db.execute(
                    "DELETE FROM auth_push_installations WHERE session_id = ?",
                    [&session],
                )
            })
            .map_err(|e| e.to_string())?;
            sessions.push(session);
        }
    }
    Ok(sessions)
}

pub fn touch(db: &Connection, key_id: &str, now: i64) -> Result<(), String> {
    db.execute(
        "UPDATE auth_device_keys SET last_seen_ms = ? WHERE key_id = ?",
        params![now, key_id],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

pub fn new_device_id(proof: &Proof) -> String {
    proof.random_handle()
}
