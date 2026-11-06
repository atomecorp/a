// The last step of an adoption (`finalize`, `adoptProfile`): the guest's atomes written into the
// account (events.rs), the operation committed with the guest marked adopted, the files moved,
// then the profile's merge committed from the intent the journal keeps, so a lost reply or a
// restart commits the same event again. A failure before the commit marks it failed.
use super::events::{ask, failed, workspace_events};
use super::payload::{self, Payload};
use super::{Connection, answered, files, load_operation, refused, settled};
use crate::vault_router::central::row_json;
use crate::vault_router::js;
use rusqlite::OptionalExtension;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub(super) async fn finalize(
    connection: &Connection,
    message: &JsonValue,
    target: &str,
) -> Result<JsonValue, String> {
    let operation_id = super::field(message, &["operation_id", "operationId"]);
    let operation = load_operation(connection, &operation_id).await?;
    let Some(operation) = operation.filter(|operation| operation["target_principal_id"] == target)
    else {
        return Ok(refused(message, "guest_adoption_not_prepared"));
    };
    let digest = js::text(operation.get("operation_digest"));
    let central = connection.ws_api.sessions.central();
    let event_of = |saved: Option<&JsonValue>| -> Result<JsonValue, String> {
        match saved.filter(|saved| js::truthy(Some(saved))) {
            Some(text) => serde_json::from_str(&js::text(Some(text))).map_err(|e| e.to_string()),
            None => Ok(JsonValue::Null),
        }
    };
    if operation["status"] == "completed" {
        let saved = central
            .get(
                "SELECT profile_event_json FROM guest_adoption_payloads WHERE operation_digest = ?",
                vec![json!(digest)],
            )
            .await?;
        let profile_event = event_of(
            saved
                .as_ref()
                .and_then(|saved| saved.get("profile_event_json")),
        )?;
        return Ok(answered(
            message,
            json!({ "status": "completed", "replayed": true, "profile_event": profile_event }),
        ));
    }
    let stored = central
        .get(
            "SELECT payload_json, payload_digest, profile_event_json FROM guest_adoption_payloads WHERE operation_digest = ?",
            vec![json!(digest)],
        )
        .await?;
    let Some(stored) = stored else {
        return Ok(refused(message, "guest_adoption_payload_missing"));
    };
    let parsed = serde_json::from_str(&js::text(stored.get("payload_json")))
        .map_err(|error| error.to_string())
        .and_then(|payload: JsonValue| payload::parse(&payload));
    let payload = match parsed {
        Ok(payload) => payload,
        Err(error) => return Ok(refused(message, &error)),
    };
    let mut profile_event = stored
        .get("profile_event_json")
        .filter(|saved| js::truthy(Some(saved)))
        .map(|saved| js::text(Some(saved)));
    let adopted = adopt(connection, &operation, &payload, target, &mut profile_event).await;
    if let Err(error) = adopted {
        let current = central
            .get(
                "SELECT status FROM guest_adoption_operations WHERE operation_digest = ?",
                vec![json!(digest)],
            )
            .await?;
        if current.is_none_or(|current| current["status"] != "committed") {
            central
                .run(
                    "UPDATE guest_adoption_operations SET status = 'failed', failure_code = ?, updated_at = datetime('now') WHERE operation_digest = ?",
                    vec![json!(js::slice(&error, 120)), json!(digest)],
                )
                .await?;
        }
        return Ok(refused(message, &error));
    }
    let profile_event = event_of(profile_event.map(JsonValue::String).as_ref())?;
    Ok(answered(
        message,
        json!({ "status": "completed", "replayed": false, "profile_event": profile_event }),
    ))
}

// The guarded part of `finalize`: what fails here marks the operation failed.
async fn adopt(
    connection: &Connection,
    operation: &JsonValue,
    payload: &Payload,
    target: &str,
    profile_event: &mut Option<String>,
) -> Result<(), String> {
    let digest = js::text(operation.get("operation_digest"));
    let guest = js::text(operation.get("guest_principal_id"));
    let central = connection.ws_api.sessions.central();
    let atomes = payload::sorted(
        payload
            .atomes
            .iter()
            .map(payload::atome)
            .collect::<Result<Vec<_>, _>>()?,
    )?;
    if operation["status"] != "committed" {
        files::staged(central.all(files::ALL.into(), vec![json!(digest)]).await?)?;
        workspace_events(connection, operation, payload, &atomes, target).await?;
        let (digest, guest, target) = (digest.clone(), guest.clone(), target.to_string());
        central
            .transaction(move |db| {
                let sql = |e: rusqlite::Error| e.to_string();
                let current = db
                    .query_row(
                        "SELECT * FROM guest_adoption_operations WHERE operation_digest = ?",
                        [&digest],
                        row_json,
                    )
                    .optional()
                    .map_err(sql)?;
                let Some(current) = current.filter(|current| current["target_principal_id"] == target.as_str())
                else {
                    return Err("guest_adoption_not_prepared".into());
                };
                if settled(&current["status"]) {
                    return Ok(());
                }
                if current["status"] != "importing" {
                    return Err("guest_adoption_payload_missing".into());
                }
                let mut statement = db.prepare(files::ALL).map_err(sql)?;
                let rows = statement
                    .query_map([&digest], row_json)
                    .map_err(sql)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(sql)?;
                files::staged(rows)?;
                // Vault events rebuild the adopted state. The guest's checkpoints and grants stay
                // in the operation's immutable payload: a central copy would be a second
                // authority over business data.
                db.execute(
                    "INSERT OR IGNORE INTO guest_workspace_principals
                (guest_principal_id, status, adopted_principal_id, adoption_operation_digest, classified_at, adopted_at)
                VALUES (?, 'adopted', ?, ?, datetime('now'), datetime('now'))",
                    [&guest, &target, &digest],
                )
                .map_err(sql)?;
                db.execute(
                    "UPDATE guest_adoption_operations SET status = 'committed', committed_at = datetime('now'), updated_at = datetime('now') WHERE operation_digest = ?",
                    [&digest],
                )
                .map_err(sql)?;
                Ok(())
            })
            .await?;
    }
    files::complete(connection, &digest, target).await?;
    adopt_profile(
        connection,
        &digest,
        payload.profile.as_ref(),
        target,
        profile_event,
    )
    .await?;
    central
        .run(
            "UPDATE guest_adoption_operations SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE operation_digest = ?",
            vec![json!(digest)],
        )
        .await
}

/// `adoptProfile`: the merge of the guest's profile into the account's, kept as the journal's
/// intent before it is committed; a version conflict forgets the intent, so the next try merges
/// again on what the account then holds.
async fn adopt_profile(
    connection: &Connection,
    digest: &str,
    profile: Option<&JsonValue>,
    target: &str,
    profile_event: &mut Option<String>,
) -> Result<(), String> {
    let Some(profile) = profile else {
        return Ok(());
    };
    let central = connection.ws_api.sessions.central();
    if profile_event.is_none() {
        let loaded = ask(
            connection,
            json!({ "type": "state-current", "action": "get", "atome_id": target }),
        )
        .await;
        if loaded["success"] != true && loaded["error"] != "State not found" {
            return Err(failed(&loaded, "guest_adoption_profile_read_failed"));
        }
        let properties = loaded
            .pointer("/state/properties")
            .filter(|properties| js::truthy(Some(properties)))
            .cloned()
            .unwrap_or_else(|| json!({}));
        let Some(props) = super::profile::merged(&properties, profile)? else {
            return Ok(());
        };
        let mut body = json!({ "scope": "global", "props": props });
        let versions = loaded.pointer("/state/property_versions");
        if js::truthy(versions) {
            let expected: JsonMap<String, JsonValue> = props
                .as_object()
                .into_iter()
                .flat_map(|props| props.keys())
                .map(|key| {
                    let version = versions.and_then(|versions| versions.get(key));
                    let version = version.filter(|version| js::truthy(Some(version)));
                    (key.clone(), version.cloned().unwrap_or(json!(0)))
                })
                .collect();
            body["expected_versions"] = JsonValue::Object(expected);
        }
        let id = format!("guest-profile:{digest}");
        let event = json!({
            "id": id, "kind": "set", "type": "user", "atome_id": target, "scope": "global",
            "project_id": null, "actor": { "type": "user", "id": target }, "tx_id": id,
            "ts": js::iso(crate::auth::now_ms() as i64), "payload": body,
        });
        let text = atome_store::intent::js_stringify(&event);
        central
            .run(
                "UPDATE guest_adoption_payloads SET profile_event_json = ? WHERE operation_digest = ?",
                vec![json!(text), json!(digest)],
            )
            .await?;
        *profile_event = Some(text);
    }
    let event: JsonValue = serde_json::from_str(profile_event.as_deref().unwrap_or("null"))
        .map_err(|error| error.to_string())?;
    let committed = ask(
        connection,
        json!({ "type": "events", "action": "commit", "event": event }),
    )
    .await;
    if committed["success"] == true {
        return Ok(());
    }
    if committed["error"] == "property_version_conflict" {
        central
            .run(
                "UPDATE guest_adoption_payloads SET profile_event_json = NULL WHERE operation_digest = ?",
                vec![json!(digest)],
            )
            .await?;
    }
    Err(failed(&committed, "guest_adoption_profile_commit_failed"))
}
