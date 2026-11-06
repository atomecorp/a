// The first three steps of an adoption (`prepare`, `importPayload`, `stageFile`): the operation
// journaled with its manifest's digest and a short expiry, its payload stored once under that
// digest with its files declared, then each file's bytes staged. A step sent again answers as
// the first one did.
use super::{
    Connection, answered, field, files, is_digest, is_uuid_v4, load_operation, operation_digest,
    parsed_date, payload, refused, settled, sha256,
};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

// `MAX_ADOPTION_TTL_MS`.
const MAX_TTL_MS: i64 = 15 * 60 * 1000;

fn now_ms() -> i64 {
    crate::auth::now_ms() as i64
}

/// The operation `message` names, when it is the target's.
async fn owned(
    connection: &Connection,
    message: &JsonValue,
    target: &str,
) -> Result<Option<JsonValue>, String> {
    let operation_id = field(message, &["operation_id", "operationId"]);
    let operation = load_operation(connection, &operation_id).await?;
    Ok(operation.filter(|operation| operation["target_principal_id"] == target))
}

/// Whether the operation's expiry has passed (`Date.parse(expires_at) < Date.now()`).
fn expired(operation: &JsonValue) -> bool {
    parsed_date(operation.get("expires_at")).is_some_and(|expires| expires < now_ms())
}

pub(super) async fn prepare(
    connection: &Connection,
    message: &JsonValue,
    target: &str,
) -> Result<JsonValue, String> {
    let confirmed = ["confirmed", "adoption_confirmed"]
        .iter()
        .any(|key| message.get(*key) == Some(&JsonValue::Bool(true)));
    if !confirmed {
        return Ok(refused(message, "guest_adoption_confirmation_required"));
    }
    let operation_id = field(message, &["operation_id", "operationId"]);
    let guest = field(message, &["guest_principal_id", "guestPrincipalId"]);
    let manifest = field(message, &["manifest_digest", "manifestDigest"]);
    let expires_at = js::first(message, &["expires_at", "expiresAt"]);
    if !is_uuid_v4(&operation_id) {
        return Ok(refused(message, "guest_adoption_operation_invalid"));
    }
    // `validExpiry`: later than now, within the adoption's lifetime.
    let now = now_ms();
    let valid_expiry = parsed_date(Some(expires_at.unwrap_or(&json!(""))))
        .is_some_and(|expires| expires > now && expires - now <= MAX_TTL_MS);
    if !is_uuid_v4(&guest) || !is_digest(&manifest) || !valid_expiry {
        return Ok(refused(message, "guest_adoption_manifest_invalid"));
    }
    let expires_at = expires_at.cloned().unwrap_or(JsonValue::Null);
    let same = |operation: &JsonValue| {
        operation["target_principal_id"] == target
            && operation["guest_principal_id"] == guest.as_str()
            && operation["manifest_digest"] == manifest.as_str()
    };
    let central = connection.ws_api.sessions.central();
    if let Some(existing) = load_operation(connection, &operation_id).await? {
        if !same(&existing) {
            return Ok(refused(message, "guest_adoption_operation_conflict"));
        }
        if !settled(&existing["status"]) {
            central
                .run(
                    "UPDATE guest_adoption_operations SET expires_at = ? WHERE operation_digest = ?",
                    vec![expires_at, existing["operation_digest"].clone()],
                )
                .await?;
        }
        return Ok(answered(
            message,
            json!({ "status": existing["status"], "replayed": true }),
        ));
    }
    let inserted = central
        .run(
            "INSERT INTO guest_adoption_operations
            (operation_digest, guest_principal_id, target_principal_id, manifest_digest, status, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'prepared', ?, datetime('now'), datetime('now'))",
            vec![
                json!(operation_digest(&operation_id)),
                json!(guest),
                json!(target),
                json!(manifest),
                expires_at,
            ],
        )
        .await;
    if let Err(error) = inserted {
        // Another call journaled it meanwhile: the same operation is that call's.
        return match load_operation(connection, &operation_id).await? {
            Some(raced) if same(&raced) => Ok(answered(
                message,
                json!({ "status": raced["status"], "replayed": true }),
            )),
            _ => Err(error),
        };
    }
    Ok(answered(
        message,
        json!({ "status": "prepared", "replayed": false }),
    ))
}

pub(super) async fn import(
    connection: &Connection,
    message: &JsonValue,
    target: &str,
) -> Result<JsonValue, String> {
    let Some(operation) = owned(connection, message, target).await? else {
        return Ok(refused(message, "guest_adoption_not_prepared"));
    };
    let status = &operation["status"];
    if !settled(status) && expired(&operation) {
        return Ok(refused(message, "guest_adoption_expired"));
    }
    if settled(status) {
        return Ok(answered(
            message,
            json!({ "status": status, "replayed": true }),
        ));
    }
    // `digest(JSON.stringify(undefined))` throws.
    let sent = message.get("payload").ok_or(
        "The \"data\" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received undefined",
    )?;
    let payload_json = atome_store::intent::js_stringify(sent);
    let payload_digest = sha256(payload_json.as_bytes());
    let claimed = js::first(message, &["payload_digest", "payloadDigest"])
        .map(|claimed| js::text(Some(claimed)))
        .unwrap_or_default();
    if claimed != payload_digest {
        return Ok(refused(message, "guest_adoption_payload_digest_invalid"));
    }
    if operation["manifest_digest"] != payload_digest.as_str() {
        return Ok(refused(message, "guest_adoption_manifest_conflict"));
    }
    let payload = match payload::parse(sent) {
        Ok(payload) => payload,
        Err(error) => return Ok(refused(message, &error)),
    };
    let digest = operation["operation_digest"].clone();
    let central = connection.ws_api.sessions.central();
    let existing = central
        .get(
            "SELECT payload_digest FROM guest_adoption_payloads WHERE operation_digest = ?",
            vec![digest.clone()],
        )
        .await?;
    if existing
        .as_ref()
        .is_some_and(|existing| existing["payload_digest"] != payload_digest.as_str())
    {
        return Ok(refused(message, "guest_adoption_payload_conflict"));
    }
    if existing.is_none() {
        central
            .run(
                "INSERT INTO guest_adoption_payloads
        (operation_digest, payload_json, payload_digest, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
                vec![digest.clone(), json!(payload_json), json!(payload_digest)],
            )
            .await?;
    }
    if let Err(error) = files::declare(connection, &js::text(Some(&digest)), &payload.files).await {
        return Ok(refused(message, &error));
    }
    central
        .run(
            "UPDATE guest_adoption_operations SET status = 'importing', updated_at = datetime('now') WHERE operation_digest = ?",
            vec![digest],
        )
        .await?;
    Ok(answered(
        message,
        json!({ "status": "importing", "replayed": existing.is_some() }),
    ))
}

pub(super) async fn stage_file(
    connection: &Connection,
    message: &JsonValue,
    target: &str,
) -> Result<JsonValue, String> {
    let Some(operation) = owned(connection, message, target).await? else {
        return Ok(refused(message, "guest_adoption_not_prepared"));
    };
    let status = &operation["status"];
    if settled(status) {
        return Ok(answered(
            message,
            json!({ "status": status, "replayed": true }),
        ));
    }
    if expired(&operation) {
        return Ok(refused(message, "guest_adoption_expired"));
    }
    if status != "importing" {
        return Ok(refused(message, "guest_adoption_payload_missing"));
    }
    let staged = files::stage(
        connection,
        &js::text(operation.get("operation_digest")),
        &field(message, &["file_id", "fileId"]),
        js::first(message, &["content_base64", "contentBase64"]),
    )
    .await;
    Ok(match staged {
        Ok(()) => answered(message, json!({ "status": "importing" })),
        Err(error) => refused(message, &error),
    })
}
