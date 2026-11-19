// The Atome contact's thread (R-210): a signed-in account writes to the team of atome — a text,
// with photos, sounds, videos or files — and reads its thread back, the team's replies in it and
// « corrigé » on what the team resolved. Each message is a row of `team_reports`
// (crate::team_reports, thread `atome`); its files arrive first, piece by piece
// (`upload`, team_reports/attachments.rs), then the message names them (`send`). Nobody chooses
// a kind: the team classifies each message when it reads it (scripts' successor, the
// `team_reports` tool). `atome-thread` on /ws/api, its `action` one of `read`, `upload`, `send`.
use super::common::{environment, reply};
use super::public_source::RateLimit;
use super::{Asker, account_roles};
use crate::team_reports::{self, ATOME_THREAD, attachments};
use crate::vault_router::js;
use base64::Engine;
use serde_json::{Value as JsonValue, json};
use std::sync::LazyLock;

pub(super) const KIND: &str = "atome-thread";
const TEXT_MAX: usize = 8000;

static SEND_LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 12));
static READ_LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 60));
// A video of 256 MiB is a thousand pieces.
static UPLOAD_LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 1200));

fn fail(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

fn text(value: Option<&JsonValue>, max: usize) -> String {
    value
        .and_then(JsonValue::as_str)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(max)
        .collect()
}

// What the person reads of a row: never its kind, its account nor the server's notes.
fn item(body: &JsonValue) -> JsonValue {
    let files: Vec<JsonValue> = body
        .get("attachments")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(|file| json!({ "id": file.get("id"), "name": file.get("name"), "mime": file.get("mime"),
            "size": file.get("size"), "purged": file.get("purged_at").is_some_and(|at| !at.is_null()) }))
        .collect();
    json!({ "id": body.get("id"), "author": body.get("author").cloned().unwrap_or(json!("person")),
        "created_iso": body.get("created_iso"), "text": body.get("text").cloned().unwrap_or(json!("")),
        "attachments": files,
        "media_refs": body.get("media_refs").cloned().unwrap_or(json!([])),
        "resolved_at": body.pointer("/resolution/resolved_at").cloned().unwrap_or(JsonValue::Null) })
}

fn number(value: Option<&JsonValue>) -> Option<u64> {
    value.and_then(JsonValue::as_u64)
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let now = atome_js_values::dates::now_ms();
    let action = text(message.get("action"), 20);
    let limit = match action.as_str() {
        "read" => &*READ_LIMITED,
        "upload" => &*UPLOAD_LIMITED,
        "send" => &*SEND_LIMITED,
        _ => return Ok(reply(KIND, message, fail("atome_thread_action_invalid"))),
    };
    if limit.limited(asker.address, now) {
        return Ok(reply(KIND, message, fail("atome_thread_rate_limited")));
    }
    // Only a signed-in account writes to the team: its thread is its own.
    let principal = match account_roles::signed_principal(asker, message).await? {
        Ok(Some(principal)) => principal,
        Ok(None) => return Ok(reply(KIND, message, fail("account_required"))),
        Err(session_error) => return Ok(session_error),
    };
    let project = environment()?.1.clone();
    let root = team_reports::root(&project);
    let central = asker.connection.ws_api.sessions.central();
    let fields = match action.as_str() {
        "read" => {
            let owner = principal.clone();
            let rows = central
                .transaction(move |db| {
                    team_reports::import_files(db, &project)?;
                    team_reports::thread(db, &owner)
                })
                .await?;
            json!({ "ok": true, "items": rows.iter().map(item).collect::<Vec<_>>() })
        }
        "upload" => {
            let Ok(bytes) = base64::engine::general_purpose::STANDARD
                .decode(text(message.get("data"), usize::MAX))
            else {
                return Ok(reply(KIND, message, fail("team_attachment_chunk_invalid")));
            };
            let (Some(index), Some(total), Some(size)) = (
                number(message.get("index")),
                number(message.get("total")),
                number(message.get("size")),
            ) else {
                return Ok(reply(KIND, message, fail("team_attachment_size_invalid")));
            };
            let id = text(message.get("attachment_id"), 80);
            let (name, mime) = (message.get("name").cloned(), message.get("mime").cloned());
            let written = tokio::task::spawn_blocking(move || {
                attachments::write_chunk(
                    &root,
                    &principal,
                    &id,
                    index,
                    total,
                    size,
                    name.as_ref(),
                    mime.as_ref(),
                    &bytes,
                )
            })
            .await
            .map_err(|error| error.to_string())?;
            match written {
                Ok(meta) => json!({ "ok": true, "complete": meta.is_some() }),
                Err(error) => fail(error),
            }
        }
        _ => {
            let id = text(message.get("id"), 80);
            if !attachments::id_shape(&id) {
                return Ok(reply(KIND, message, fail("atome_thread_id_invalid")));
            }
            let body_text = text(message.get("text"), TEXT_MAX);
            let ids: Vec<String> = message
                .get("attachment_ids")
                .and_then(JsonValue::as_array)
                .into_iter()
                .flatten()
                .map(|id| text(Some(id), 80))
                .collect();
            if body_text.is_empty() && ids.is_empty() {
                return Ok(reply(KIND, message, fail("atome_thread_message_empty")));
            }
            let versions = message
                .get("versions")
                .filter(|versions| versions.is_object());
            let mut body = json!({ "id": id, "thread": ATOME_THREAD, "author": "person", "created_iso": js::iso(now),
                "received_at": js::iso(now), "text": body_text, "attachments": [],
                // The person's own media the files came from: their bubble shows them again on their devices.
                "media_refs": message.get("media_refs").and_then(JsonValue::as_array).into_iter().flatten()
                    .take(attachments::MAX_FILES).map(|id| text(Some(id), 80)).filter(|id| !id.is_empty()).collect::<Vec<_>>(),
                "platform": text(message.get("platform"), 20),
                "versions": { "atome": text(versions.and_then(|v| v.get("atome")), 40),
                    "eve": text(versions.and_then(|v| v.get("eve")), 40) } });
            let owner = principal.clone();
            central
                .transaction(move |db| {
                    team_reports::import_files(db, &project)?;
                    // A message sent again (a retry) keeps its first copy.
                    if let Some((who, kept)) = team_reports::get(db, &id)? {
                        return Ok(if who.as_deref() == Some(owner.as_str()) {
                            json!({ "ok": true, "duplicate": true, "item": item(&kept) })
                        } else {
                            fail("atome_thread_id_invalid")
                        });
                    }
                    let files = match attachments::commit(&root, &owner, &id, &ids) {
                        Ok(files) => files,
                        Err(error) => return Ok(fail(error)),
                    };
                    body["attachments"] = JsonValue::Array(files);
                    team_reports::insert(db, Some(&owner), &body)?;
                    Ok(json!({ "ok": true, "item": item(&body) }))
                })
                .await?
        }
    };
    Ok(reply(KIND, message, fields))
}
