// The push to a person's devices (server/communication_push.js, ported): one item reaches
// each installation the person registered (`push-register`, auth/account_actions.rs) whose
// device session and key still stand, once — a delivery row per (principal, installation,
// kind, item) reserves it, and only a known transient refusal (429, 5xx) may send it again.
// A call wakes the device (VoIP) until it expires; a call's control (cancelled, answered
// elsewhere) only stops what Android already shows. No message, phone, bearer, photo or
// caller name reaches the lock screen.
mod apns;
mod fcm;

use crate::vault_router::central::Central;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub use apns::Apns;
pub use fcm::Fcm;

/// How one send is made: a call (VoIP), a call's control, a quiet item (a contact request).
pub struct Send {
    pub voip: bool,
    pub control: bool,
    pub quiet: bool,
    pub expires_at: i64,
    pub collapse_id: String,
}

pub type Sending<'a> =
    Pin<Box<dyn Future<Output = Result<JsonValue, String>> + std::marker::Send + 'a>>;

/// An OS delivery transport (APNs, FCM): `send` answers `{ ok, status?, invalidToken?, error? }`,
/// and an `Err` is an outcome nobody can be sure of.
pub trait Transport: std::marker::Send + Sync {
    fn configured(&self) -> bool;
    fn send<'a>(
        &'a self,
        installation: &'a JsonValue,
        payload: &'a JsonValue,
        send: &'a Send,
    ) -> Sending<'a>;
}

pub struct Push {
    central: Central,
    apple: Arc<dyn Transport>,
    android: Arc<dyn Transport>,
}

/// Who is left out: the device keys already told live, or every device but the personal
/// ones out of probation (an account notice).
#[derive(Default)]
pub struct Audience {
    pub except_key_ids: Option<HashSet<String>>,
    pub personal_only: bool,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// `/^[a-f0-9-]{36}$/.test(value)`.
fn room(value: Option<&JsonValue>) -> bool {
    let text = value.map(js::string).unwrap_or_else(|| "undefined".into());
    text.len() == 36
        && text
            .bytes()
            .all(|byte| byte == b'-' || byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn digest(value: &JsonValue) -> String {
    Sha256::digest(value.to_string().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

const REACHABLE: &str = "SELECT i.*, k.device_class AS key_class, k.restricted_until_ms AS key_restricted_ms
    FROM auth_push_installations i
    JOIN auth_device_sessions s ON s.session_id = i.session_id
    JOIN auth_device_keys k ON k.key_id = i.key_id
    WHERE i.principal_id = ? AND i.kind = ? AND s.principal_id = i.principal_id AND s.key_id = i.key_id
    AND k.principal_id = i.principal_id AND s.revoked_ms IS NULL AND k.revoked_ms IS NULL
    AND s.expires_ms > ? AND s.idle_expires_ms > ?";

impl Push {
    pub fn new(central: Central, apple: Arc<dyn Transport>, android: Arc<dyn Transport>) -> Self {
        Self {
            central,
            apple,
            android,
        }
    }

    fn transport(&self, installation: &JsonValue) -> &dyn Transport {
        if installation["provider"] == "fcm" {
            self.android.as_ref()
        } else {
            self.apple.as_ref()
        }
    }

    /// `deliver(principal, item, { exceptKeyIds, personalOnly })`.
    pub async fn deliver(
        &self,
        principal: &str,
        item: &JsonValue,
        audience: &Audience,
    ) -> Result<JsonValue, String> {
        if !self.apple.configured() && !self.android.configured() {
            return Ok(json!({ "ok": false, "error": "push_configuration_required" }));
        }
        let now = now_ms();
        let kind_of_item = item.get("kind").and_then(JsonValue::as_str);
        let control = kind_of_item == Some("call-state") && room(item.get("room_id"));
        let call = kind_of_item == Some("call-invitation")
            && room(item.get("room_id"))
            && js::number(item.get("expires_at")) > now as f64;
        let kind = if call || control { "voip" } else { "alert" };
        if kind_of_item == Some("call-invitation") && !call {
            return Ok(json!({ "ok": true, "expired": true }));
        }
        let expires_at = if call {
            js::number(item.get("expires_at")) as i64
        } else {
            now + if control { 60_000 } else { 86_400_000 }
        };
        let reachable = self
            .central
            .all(
                REACHABLE.into(),
                vec![json!(principal), json!(kind), json!(now), json!(now)],
            )
            .await?;
        let installations: Vec<JsonValue> = reachable
            .into_iter()
            .filter(|row| {
                let key = js::string(&row["key_id"]);
                !audience
                    .except_key_ids
                    .as_ref()
                    .is_some_and(|keys| keys.contains(&key))
                    && (!audience.personal_only
                        || (row["key_class"] == "personal"
                            && js::number(row.get("key_restricted_ms")).partial_cmp(&(now as f64))
                                != Some(std::cmp::Ordering::Greater)))
            })
            .collect();
        self.central
            .run(
                "DELETE FROM auth_push_deliveries WHERE expires_ms <= ?",
                vec![json!(now)],
            )
            .await?;
        let mut results = Vec::new();
        for batch in installations.chunks(4) {
            let sent = futures_util::future::join_all(batch.iter().map(|installation| {
                self.deliver_one(
                    principal,
                    item,
                    installation,
                    kind,
                    call,
                    control,
                    expires_at,
                )
            }))
            .await;
            for result in sent {
                results.extend(result?);
            }
        }
        let ok = results.iter().all(|result| result["ok"] == true);
        Ok(json!({ "ok": ok, "installations": installations.len(), "results": results }))
    }

    #[allow(clippy::too_many_arguments)]
    async fn deliver_one(
        &self,
        principal: &str,
        item: &JsonValue,
        installation: &JsonValue,
        kind: &str,
        call: bool,
        control: bool,
        expires_at: i64,
    ) -> Result<Option<JsonValue>, String> {
        let transport = self.transport(installation);
        // Apple VoIP pushes are new calls alone; Android's controls only stop a call it shows.
        if control && installation["provider"] != "fcm" {
            return Ok(None);
        }
        if !transport.configured() {
            return Ok(Some(
                json!({ "ok": false, "error": "push_configuration_required" }),
            ));
        }
        if call && now_ms() >= expires_at {
            return Ok(Some(json!({ "ok": false, "error": "push_call_expired" })));
        }
        let installation_id = js::string(&installation["installation_id"]);
        let item_id = item.get("id").cloned().unwrap_or(JsonValue::Null);
        let id = digest(&json!([principal, installation_id, kind, item_id]));
        let reserved = {
            let (id, installation_id, kind) =
                (id.clone(), installation_id.clone(), kind.to_string());
            self.central
                .transaction(move |db| {
                    let inserted = db
                        .execute(
                            "INSERT INTO auth_push_deliveries VALUES (?, ?, ?, 'sending', ?) ON CONFLICT(delivery_id) DO NOTHING",
                            rusqlite::params![id, installation_id, kind, expires_at],
                        )
                        .map_err(|e| e.to_string())?;
                    if inserted > 0 {
                        return Ok(true);
                    }
                    db.execute(
                        "UPDATE auth_push_deliveries SET state = 'sending' WHERE delivery_id = ? AND state = 'retry'",
                        rusqlite::params![id],
                    )
                    .map(|changed| changed > 0)
                    .map_err(|e| e.to_string())
                })
                .await?
        };
        if !reserved {
            return Ok(None);
        }
        let quiet = item["kind"] == "connection-request";
        let payload = payload(principal, item, call, control, quiet, expires_at);
        let send = Send {
            voip: call,
            control,
            quiet,
            expires_at,
            collapse_id: id.clone(),
        };
        let result = transport
            .send(installation, &payload, &send)
            .await
            .unwrap_or_else(|_| json!({ "ok": false, "error": "push_transport_uncertain" }));
        let status = js::number(result.get("status"));
        let state = if result["ok"] == true {
            "accepted"
        } else if status == 429.0 || status >= 500.0 {
            "retry"
        } else {
            "failed"
        };
        self.central
            .run(
                "UPDATE auth_push_deliveries SET state = ? WHERE delivery_id = ?",
                vec![json!(state), json!(id)],
            )
            .await?;
        if js::truthy(result.get("invalidToken")) {
            self.central
                .run(
                    "DELETE FROM auth_push_installations WHERE installation_id = ? AND kind = ? AND token = ? AND updated_ms = ?",
                    vec![json!(installation_id), json!(kind), installation["token"].clone(), installation["updated_ms"].clone()],
                )
                .await?;
        }
        Ok(Some(result))
    }

    /// `available(principal)`: a VoIP installation a configured transport reaches (a call may ring).
    pub async fn available(&self, principal: &str) -> Result<bool, String> {
        let now = now_ms();
        let rows = self
            .central
            .all(
                "SELECT i.provider FROM auth_push_installations i
                 JOIN auth_device_sessions s ON s.session_id = i.session_id JOIN auth_device_keys k ON k.key_id = i.key_id
                 WHERE i.principal_id = ? AND i.kind = 'voip' AND s.principal_id = i.principal_id AND s.key_id = i.key_id
                 AND k.principal_id = i.principal_id AND s.revoked_ms IS NULL AND k.revoked_ms IS NULL
                 AND s.expires_ms > ? AND s.idle_expires_ms > ?"
                    .into(),
                vec![json!(principal), json!(now), json!(now)],
            )
            .await?;
        Ok(rows.iter().any(|row| self.transport(row).configured()))
    }

    /// The `push:<op>` SERVICE frames of Fastify's thin client (server/communication_push.js).
    pub async fn service(&self, operation: &str, payload: &JsonValue) -> Result<JsonValue, String> {
        let principal = js::id(payload.get("principal"));
        match operation {
            "push:deliver" => {
                let except_key_ids = payload
                    .get("exceptKeyIds")
                    .and_then(JsonValue::as_array)
                    .map(|keys| keys.iter().map(js::string).collect());
                let audience = Audience {
                    except_key_ids,
                    personal_only: payload.get("personalOnly") == Some(&JsonValue::Bool(true)),
                };
                self.deliver(
                    &principal,
                    payload.get("item").unwrap_or(&json!({})),
                    &audience,
                )
                .await
            }
            "push:available" => self.available(&principal).await.map(JsonValue::Bool),
            other => Err(format!("push_operation_unknown:{other}")),
        }
    }
}

// What the device receives: the item's ids alone, and for a call what rings it.
fn payload(
    principal: &str,
    item: &JsonValue,
    call: bool,
    control: bool,
    quiet: bool,
    expires_at: i64,
) -> JsonValue {
    let aps = if call {
        json!({})
    } else if quiet {
        // A contact request arrives quietly: no sound, nothing lit, among the notifications.
        json!({ "alert": { "title": "Atome", "loc-key": "ATOME_NOTIFICATION" }, "interruption-level": "passive" })
    } else {
        json!({ "alert": { "title": "Atome", "loc-key": "ATOME_NOTIFICATION" }, "sound": "default" })
    };
    let mut atome = serde_json::Map::new();
    atome.insert("principal_id".into(), json!(principal));
    for (key, field) in [("notification_id", "id"), ("peer_id", "from_id")] {
        if let Some(value) = item.get(field) {
            atome.insert(key.into(), value.clone());
        }
    }
    // A new device's request: its touch makes the app ask for it (native_notification_actions.js).
    if item["kind"] == "auth-pair-request" {
        atome.insert("kind".into(), item["kind"].clone());
        if let Some(id) = item.get("id") {
            atome.insert("pair_id".into(), id.clone());
        }
    }
    if call || control {
        for key in ["room_id", "call_mode"] {
            if let Some(value) = item.get(key) {
                atome.insert(key.into(), value.clone());
            }
        }
        atome.insert("expires_at".into(), json!(expires_at));
    }
    if control {
        let fields = [
            ("status", "status"),
            ("accepted_principal_id", "acceptedPrincipalId"),
            ("accepted_key_id", "acceptedKeyId"),
        ];
        for (key, field) in fields {
            if let Some(value) = item.get(field) {
                atome.insert(key.into(), value.clone());
            }
        }
    }
    json!({ "aps": aps, "atome": atome })
}
