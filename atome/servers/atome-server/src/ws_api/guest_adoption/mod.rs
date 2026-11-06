// The guest adoption of `/ws/api` (server/wsApiGuestAdoption.js, server/wsApiGuestAdoptionFiles.js,
// ported): a browser guest's workspace — its atomes, events, files and personal profile — taken
// into the account the connection is, in four steps journaled in the central database
// (`guest_adoption_operations`, `_payloads`, `_files`): `prepare` (the manifest's digest),
// `import` (the payload, its files declared), `stage-file` (each file's bytes) and `finalize`
// (steps.rs, finalize.rs, events.rs). The calls of one operation run one after the other; a
// step that throws in Fastify is not answered here either, only logged.
mod events;
mod files;
mod finalize;
mod payload;
mod profile;
mod steps;

use super::Connection;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};

pub(super) const KIND: &str = "guest-adoption";

// `operationLocks`: the calls of one operation id, in their order of arrival, process-wide.
static OPERATIONS: LazyLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(Mutex::default);

/// `String(a || b || '').trim()` of the first truthy of `keys`, JavaScript's `String` and `trim`.
fn field(object: &JsonValue, keys: &[&str]) -> String {
    js::first(object, keys)
        .map(|value| js::trim(&js::text(Some(value))).to_string())
        .unwrap_or_default()
}

/// The SHA-256 of `bytes`, in lowercase hexadecimal.
fn sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// `operationDigest`: the journal's key of an operation id.
fn operation_digest(operation_id: &str) -> String {
    sha256(operation_id.as_bytes())
}

/// `/^[a-f0-9]{64}$/i`.
fn is_digest(text: &str) -> bool {
    text.len() == 64 && text.bytes().all(|b| b.is_ascii_hexdigit())
}

/// `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`.
fn is_uuid_v4(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, b)| match index {
            8 | 13 | 18 | 23 => *b == b'-',
            14 => *b == b'4',
            19 => matches!(b.to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b'),
            _ => b.is_ascii_hexdigit(),
        })
}

/// `Date.parse(String(value))`, none when it is NaN.
fn parsed_date(value: Option<&JsonValue>) -> Option<i64> {
    js::date(Some(&JsonValue::String(js::text(value))))
}

/// Whether a status is one of the two the operation's work is done in.
fn settled(status: &JsonValue) -> bool {
    status == "committed" || status == "completed"
}

/// `loadOperation`: the operation journaled under this id.
async fn load_operation(
    connection: &Connection,
    operation_id: &str,
) -> Result<Option<JsonValue>, String> {
    connection
        .ws_api
        .sessions
        .central()
        .get(
            "SELECT * FROM guest_adoption_operations WHERE operation_digest = ?",
            vec![json!(operation_digest(operation_id))],
        )
        .await
}

/// `response(message, true, fields)` and `response(message, false, { error })`: the `/ws/api`
/// envelope of this family.
fn answered(message: &JsonValue, fields: JsonValue) -> JsonValue {
    super::atome_ops::success(KIND, message, fields)
}

fn refused(message: &JsonValue, error: &str) -> JsonValue {
    super::atome_ops::failure(KIND, message, error)
}

/// `requireAuthenticatedPrincipal`: the account the message is, provisioned.
async fn principal(connection: &Connection, message: &JsonValue) -> Result<String, String> {
    let principal = connection.resolve_principal(message).await?;
    match principal {
        Some(user) if connection.provisioned(&user).await? => Ok(user),
        _ => Err("remote_account_not_provisioned".into()),
    }
}

/// `runOperationSerially`: `work` once every earlier call of the same operation id has ended.
async fn serially<T>(key: &str, work: impl Future<Output = T>) -> T {
    if key.is_empty() {
        return work.await;
    }
    let lock = OPERATIONS
        .lock()
        .expect("guest adoption operations")
        .entry(key.to_string())
        .or_default()
        .clone();
    let outcome = {
        let _turn = lock.lock().await;
        work.await
    };
    let mut operations = OPERATIONS.lock().expect("guest adoption operations");
    // The map's handle and this one: no later call waits on this operation.
    if Arc::strong_count(&lock) == 2 {
        operations.remove(key);
    }
    outcome
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    if let Err(refusal) = connection.session_holds(&message).await {
        return connection.reply(refusal).await;
    }
    let target = match principal(&connection, &message).await {
        Ok(target) => target,
        Err(error) => return connection.reply(refused(&message, &error)).await,
    };
    let action = field(&message, &["action"]);
    let operation_id = field(&message, &["operation_id", "operationId"]);
    let work = async {
        match action.as_str() {
            "prepare" => steps::prepare(&connection, &message, &target).await,
            "import" => steps::import(&connection, &message, &target).await,
            "stage-file" => steps::stage_file(&connection, &message, &target).await,
            _ => finalize::finalize(&connection, &message, &target).await,
        }
    };
    let answered = match action.as_str() {
        "prepare" | "import" | "stage-file" | "finalize" => serially(&operation_id, work).await,
        _ => Ok(refused(&message, "guest_adoption_action_invalid")),
    };
    match answered {
        Ok(reply) => connection.reply(reply).await,
        Err(error) => eprintln!("[ws/api] guest-adoption {action} failed {error}"),
    }
}
