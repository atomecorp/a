// A music write's durable request and receipt (atome/src/squirrel/apple_music/operation_store.js
// and `durableWrite` of server/music/music_operations.js, ported): a lost provider answer is never
// a reason to create a playlist or append tracks twice. The intent is claimed, submitted and
// settled through the person's own canonical commit and read (`/ws/api` events and state-current,
// as the Atome tools reach them), never a second store.
use super::session::Session;
use super::{Mf, music_error, spotify};
use crate::providers::Link;
use crate::providers::params::stable_stringify;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const TYPE: &str = "music_operation";

fn sha256_hex(text: &str) -> String {
    ring::digest::digest(&ring::digest::SHA256, text.as_bytes())
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// One person's receipts with one provider.
pub struct Ledger<'a, L: Link> {
    link: &'a L,
    principal: &'a str,
    prefix: String,
}

impl<'a, L: Link> Ledger<'a, L> {
    pub fn new(link: &'a L, principal: &'a str, provider: &str) -> Self {
        let prefix = format!("music_operation_{}_{provider}_", sha256_hex(principal));
        Self {
            link,
            principal,
            prefix,
        }
    }

    async fn check(&self) -> Result<(), Mf> {
        Ok(self.link.check(self.principal).await?)
    }

    // The canonical boundary, the account checked on both sides.
    async fn call(&self, frame: JsonValue) -> Result<JsonValue, Mf> {
        self.check().await?;
        let answer = self.link.atome(frame).await;
        self.check().await?;
        Ok(answer)
    }

    /// `getStateCurrent`: the receipt's current state, none when it was never written.
    pub async fn current(&self, request_id: &str) -> Result<Option<JsonValue>, Mf> {
        let id = format!("{}{request_id}", self.prefix);
        let answer = self
            .call(json!({ "type": "state-current", "action": "get", "atome_id": id }))
            .await?;
        if answer.get("ok") == Some(&json!(true)) {
            return Ok(Some(
                answer.get("state").cloned().unwrap_or(JsonValue::Null),
            ));
        }
        if answer.get("error") == Some(&json!("State not found")) {
            return Ok(None);
        }
        Err(Mf::new("COMMIT_FAILED"))
    }

    fn normalize(&self, record: Option<JsonValue>) -> Result<JsonValue, Mf> {
        let Some(record) = record.filter(|record| js::truthy(Some(record))) else {
            return Err(Mf::new("OPERATION_NOT_FOUND"));
        };
        let kind = js::first(&record, &["type", "atome_type"]);
        let owner = record
            .get("owner_id")
            .filter(|owner| js::truthy(Some(owner)))
            .or_else(|| record.pointer("/meta/owner_id"));
        let foreign = kind != Some(&json!(TYPE))
            || js::truthy(record.get("project_id"))
            || owner != Some(&json!(self.principal))
            || js::truthy(record.get("deleted"))
            || js::truthy(record.get("deleted_at"))
            || js::truthy(record.pointer("/properties/__deleted"));
        if foreign {
            return Err(Mf::new("OPERATION_NOT_FOUND"));
        }
        Ok(record)
    }

    pub async fn read(&self, request_id: &str) -> Result<JsonValue, Mf> {
        let record = self.current(request_id).await?;
        self.normalize(record)
    }

    async fn commit(
        &self,
        request_id: &str,
        props: JsonValue,
        record: Option<&JsonValue>,
        event_id: String,
    ) -> Result<JsonValue, Mf> {
        let mut payload = JsonMap::new();
        payload.insert("props".into(), props);
        if let Some(record) = record {
            let next = js::number(record.pointer("/properties/revision")) + 1.0;
            payload.insert(
                "expected_versions".into(),
                json!({ "revision": js::number_json(next) }),
            );
        }
        let event = json!({ "id": event_id, "kind": "set", "type": TYPE, "scope": "global",
            "atome_id": format!("{}{request_id}", self.prefix), "payload": payload });
        let result = self
            .call(json!({ "type": "events", "action": "commit", "event": event }))
            .await?;
        if result.get("ok") != Some(&json!(true)) {
            let conflict = result.get("error") == Some(&json!("property_version_conflict"));
            return Err(Mf::new(if conflict {
                "VERSION_CONFLICT"
            } else {
                "COMMIT_FAILED"
            }));
        }
        self.read(request_id).await
    }

    /// The request claimed once: the same request finds its receipt, another one a conflict.
    pub async fn prepare(&self, request_id: &str, request: JsonValue) -> Result<JsonValue, Mf> {
        if let Some(previous) = self.current(request_id).await? {
            let record = self.normalize(Some(previous))?;
            if stable_stringify(&record["properties"]["request"]) != stable_stringify(&request) {
                return Err(Mf::new("OPERATION_CONFLICT"));
            }
            return Ok(record);
        }
        let props = json!({ "request": request, "status": "prepared", "revision": 0,
            "access": "private", "visibility": "private" });
        let event_id = format!("{}prepare_{request_id}", self.prefix);
        self.commit(request_id, props, None, event_id).await
    }

    pub async fn transition(
        &self,
        request_id: &str,
        record: &JsonValue,
        patch: JsonValue,
    ) -> Result<JsonValue, Mf> {
        let mut props = patch.as_object().cloned().unwrap_or_default();
        let next = js::number(record.pointer("/properties/revision")) + 1.0;
        props.insert("revision".into(), js::number_json(next));
        let event_id = uuid::Uuid::new_v4().to_string();
        self.commit(request_id, JsonValue::Object(props), Some(record), event_id)
            .await
    }
}

/// What a receipt tells: its result (unconfirmed while it has none), its id and status.
pub fn receipt(record: &JsonValue, request_id: &str) -> JsonValue {
    let result = record
        .pointer("/properties/result")
        .filter(|result| js::truthy(Some(result)))
        .cloned()
        .unwrap_or_else(|| json!({ "ok": false, "error": "OPERATION_UNCONFIRMED" }));
    let mut out = result.as_object().cloned().unwrap_or_default();
    out.insert("request_id".into(), json!(request_id));
    out.insert(
        "status".into(),
        record
            .pointer("/properties/status")
            .cloned()
            .unwrap_or(JsonValue::Null),
    );
    JsonValue::Object(out)
}

/// `durableWrite`: the write claimed, submitted once, its outcome settled in the receipt; once
/// submitted, even a failed read-back is unconfirmed, never failed.
pub async fn write<L: Link>(
    ledger: &Ledger<'_, L>,
    session: &Session<'_>,
    record: &JsonValue,
    action: &str,
    input: &JsonValue,
    idempotency_key: &str,
) -> Result<JsonValue, Mf> {
    let provider = js::text(input.get("provider"));
    let mut payload = input.as_object().cloned().unwrap_or_default();
    payload.shift_remove("request_id");
    payload.shift_remove("provider");
    let request_id = match input.get("request_id").filter(|id| js::truthy(Some(id))) {
        Some(id) => js::string(id),
        None if !idempotency_key.is_empty() => sha256_hex(&format!(
            "{}:{provider}:{action}:{idempotency_key}",
            session.principal
        )),
        None => uuid::Uuid::new_v4().to_string(),
    };
    let account = record
        .pointer("/identity/id")
        .cloned()
        .unwrap_or(JsonValue::Null);
    let mut target = JsonValue::Object(payload);
    if ledger.current(&request_id).await?.is_some() {
        let saved = ledger.read(&request_id).await?;
        let request = &saved["properties"]["request"];
        if request.get("provider") != Some(&json!(provider))
            || request.get("action") != Some(&json!(action))
        {
            return Err(Mf::new("OPERATION_CONFLICT"));
        }
        if request.get("provider_account_id") != Some(&account) {
            return Err(Mf::new("CONTEXT_CHANGED"));
        }
        // The claim compares the exact request, a favourite's frozen song included.
        if action == "favorite_current" {
            target = request.get("input").cloned().unwrap_or(JsonValue::Null);
        }
    } else if action == "favorite_current" {
        let state = spotify::read(session, record, "get_state", &json!({})).await?;
        let Some(song) = state
            .pointer("/current_song/id")
            .filter(|id| js::truthy(Some(id)))
        else {
            return Err(Mf::new("NO_ACTIVE_MUSIC"));
        };
        target = json!({ "song_id": song });
    }
    let request = json!({ "provider": provider, "provider_account_id": account, "action": action, "input": target });
    let mut claim = ledger.prepare(&request_id, request).await?;
    ledger.check().await?;
    if claim["properties"]["status"] != json!("prepared") {
        return Ok(receipt(&claim, &request_id));
    }
    claim = ledger
        .transition(&request_id, &claim, json!({ "status": "submitting" }))
        .await?;
    ledger.check().await?;
    let (status, result) = match spotify::write(session, record, action, &target).await {
        Ok(result) => ("completed", result),
        Err(failure) if !session.accepted() && !failure.uncertain => (
            "failed",
            json!({ "ok": false, "error": music_error(&failure.code) }),
        ),
        Err(_) => (
            "unconfirmed",
            json!({ "ok": false, "error": "OPERATION_UNCONFIRMED" }),
        ),
    };
    ledger.check().await?;
    let settled = json!({ "status": status, "result": result });
    if ledger
        .transition(&request_id, &claim, settled)
        .await
        .is_err()
    {
        return Ok(
            json!({ "ok": false, "error": "OPERATION_UNCONFIRMED", "request_id": request_id,
            "status": "submitting" }),
        );
    }
    let mut out = result.as_object().cloned().unwrap_or_default();
    out.insert("request_id".into(), json!(request_id));
    out.insert("status".into(), json!(status));
    Ok(JsonValue::Object(out))
}
