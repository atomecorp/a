use super::local_atome::{handle_events_message, LocalAtomeState, WsResponse};
use super::local_atome_extended::{response, can_access, request_id};
use chrono::Utc;
use serde_json::{json, Value as JsonValue};

pub async fn handle_sync_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message
        .get("action")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    match action {
        "configure-remote" => {
            let remote_user_id = message
                .get("remote_user_id")
                .or_else(|| message.get("remoteUserId"))
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let remote_token = message
                .get("remote_token")
                .or_else(|| message.get("remoteToken"))
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let remote_url = message
                .get("remote_url")
                .or_else(|| message.get("remoteUrl"))
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let environment_fingerprint = message
                .get("environment_fingerprint")
                .or_else(|| message.get("environmentFingerprint"))
                .and_then(|value| value.as_str())
                .unwrap_or("");
            match super::local_atome::configure_remote_sync_credential(
                state,
                user_id,
                remote_user_id,
                remote_token,
                remote_url,
                environment_fingerprint,
            ) {
                Ok(()) => match super::local_atome_sync_worker::enqueue_current_user_state_sync(state, user_id, remote_user_id) {
                    Ok(state_republished) => response(
                        "sync",
                        &message,
                        true,
                        Some(json!({
                            "configured": true,
                            "remote_user_id": remote_user_id,
                            "environment_fingerprint": environment_fingerprint,
                            "state_republished": state_republished
                        })),
                        None,
                    ),
                    Err(error) => response("sync", &message, false, None, Some(error)),
                },
                Err(error) => response("sync", &message, false, None, Some(error)),
            }
        }
        "flush" => {
            let ids: Vec<String> = message
                .get("atome_ids")
                .or_else(|| message.get("atomeIds"))
                .and_then(|value| value.as_array())
                .map(|values| values.iter().filter_map(|id| id.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            if ids.iter().any(|id| !can_access(state, id, user_id, false)) {
                return response("sync", &message, false, None, Some("Access denied".into()));
            }
            match super::local_atome_sync_worker::deliver_atomes(state, user_id, &ids).await {
                Ok(data) => response("sync", &message, true, Some(data), None),
                Err(error) => response("sync", &message, false, None, Some(error)),
            }
        }
        "clear-remote" => match super::local_atome::clear_remote_sync_credential(state, user_id) {
            Ok(()) => response(
                "sync",
                &message,
                true,
                Some(json!({ "configured": false })),
                None,
            ),
            Err(error) => response("sync", &message, false, None, Some(error)),
        },
        "push" => {
            let committed = handle_events_message(
                json!({
                    "type": "events",
                    "action": "commit-batch",
                    "requestId": request_id(&message),
                    "tx_id": message.get("tx_id").cloned().unwrap_or(JsonValue::Null),
                    "events": message.get("events").or_else(|| message.get("changes")).cloned().unwrap_or_else(|| json!([]))
                }),
                user_id,
                state,
            ).await;
            response("sync", &message, committed.success, committed.data.map(|data| json!({"changes": data.get("events").cloned().unwrap_or_else(|| json!([]))})), committed.error)
        }
        "pull" => {
            let listed = handle_events_message(
                json!({
                    "type": "events", "action": "list", "requestId": request_id(&message),
                    "since": message.get("since").cloned().unwrap_or(JsonValue::Null),
                    "until": message.get("until").cloned().unwrap_or(JsonValue::Null),
                    "limit": message.get("limit").cloned().unwrap_or(json!(1000)),
                    "offset": message.get("offset").cloned().unwrap_or(json!(0))
                }),
                user_id,
                state,
            )
            .await;
            response("sync", &message, listed.success, listed.data.map(|data| json!({"changes": data.get("events").cloned().unwrap_or_else(|| json!([]))})), listed.error)
        }
        "ack" => {
            let ids = message
                .get("atome_ids")
                .and_then(|value| value.as_array())
                .cloned()
                .unwrap_or_default();
            if ids.iter().any(|id| {
                id.as_str()
                    .map(|value| !can_access(state, value, user_id, true))
                    .unwrap_or(true)
            }) {
                return response("sync", &message, false, None, Some("Access denied".into()));
            }
            let Ok(db) = state.db.lock() else {
                return response(
                    "sync",
                    &message,
                    false,
                    None,
                    Some("Database unavailable".into()),
                );
            };
            for id in &ids {
                let _ = db.execute(
                    "UPDATE atomes SET sync_status = 'synced', last_sync = ?1 WHERE atome_id = ?2",
                    rusqlite::params![Utc::now().to_rfc3339(), id.as_str()],
                );
            }
            response(
                "sync",
                &message,
                true,
                Some(json!({"acknowledged": ids})),
                None,
            )
        }
        "get-pending" => {
            let Ok(db) = state.db.lock() else {
                return response(
                    "sync",
                    &message,
                    false,
                    None,
                    Some("Database unavailable".into()),
                );
            };
            let pending_delivery_count = match db.query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE target_server = 'fastify' AND status != 'synced'
                 AND json_extract(payload, '$.actor.id') = ?1", [user_id], |row| row.get::<_, i64>(0)
            ) {
                Ok(count) => count,
                Err(error) => return response("sync", &message, false, None, Some(error.to_string())),
            };
            let mut sync_status = super::local_atome_sync_progress::read(state, user_id);
            if sync_status["last_error_code"].is_null() {
                let delivery_error = db.query_row(
                    "SELECT COALESCE((SELECT error_message FROM sync_queue WHERE target_server = 'fastify'
                     AND status != 'synced' AND json_extract(payload, '$.actor.id') = ?1
                     AND error_message IS NOT NULL AND error_message != '' ORDER BY queue_id DESC LIMIT 1), '')",
                    [user_id], |row| row.get::<_, String>(0)
                );
                match delivery_error {
                    Ok(error) if !error.is_empty() => {
                        let code = if error.bytes().all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == b'_') { error.as_str() } else { "outbound_delivery_failed" };
                        sync_status["last_error_code"] = json!(code);
                    }
                    Err(error) => return response("sync", &message, false, None, Some(error.to_string())),
                    _ => {}
                }
            }
            let mut stmt = match db.prepare(
                "SELECT atome_id, atome_type, parent_id, owner_id, updated_at FROM atomes
                 WHERE owner_id = ?1 AND sync_status = 'pending' AND deleted_at IS NULL ORDER BY updated_at ASC"
            ) {
                Ok(stmt) => stmt,
                Err(error) => return response("sync", &message, false, None, Some(error.to_string())),
            };
            let rows = stmt.query_map([user_id], |row| {
                Ok(json!({
                    "atome_id": row.get::<_, String>(0)?,
                    "atome_type": row.get::<_, String>(1)?,
                    "parent_id": row.get::<_, Option<String>>(2)?,
                    "owner_id": row.get::<_, Option<String>>(3)?,
                    "updated_at": row.get::<_, String>(4)?
                }))
            });
            match rows {
                Ok(rows) => response(
                    "sync",
                    &message,
                    true,
                    Some(json!({"changes": rows.filter_map(Result::ok).collect::<Vec<_>>(), "pending_delivery_count": pending_delivery_count, "sync_status": sync_status})),
                    None,
                ),
                Err(error) => response("sync", &message, false, None, Some(error.to_string())),
            }
        }
        _ => response(
            "sync",
            &message,
            false,
            None,
            Some("Unknown sync action".into()),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn pending_status_keeps_failed_deliveries_and_errors_bound_to_the_actor() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../temp").join(format!("native-sync-status-{}", uuid::Uuid::new_v4()));
        let state = super::super::local_atome::create_state(root.clone(), root.clone());
        {
            let db = state.db.lock().unwrap();
            db.execute("INSERT INTO atomes (atome_id,atome_type) VALUES ('contact','contact')", []).unwrap();
            for (actor, status, error) in [("account-a","failed","property_write_denied"),
                ("account-a","synced","old_error"),("account-b","failed","authentication_invalid")] {
                db.execute("INSERT INTO sync_queue (atome_id,operation,payload,status,error_message) VALUES ('contact','events:commit',?1,?2,?3)",
                    rusqlite::params![json!({"actor":{"id":actor}}).to_string(),status,error]).unwrap();
            }
        }
        let request = json!({"action":"get-pending"});
        let result = handle_sync_message(request.clone(), "account-a", &state).await;
        assert!(result.success);
        let data = result.data.unwrap();
        assert_eq!(data["pending_delivery_count"], 1);
        assert_eq!(data["sync_status"]["last_error_code"], "property_write_denied");
        state.db.lock().unwrap().execute("UPDATE sync_queue SET status='synced' WHERE json_extract(payload,'$.actor.id')='account-a'", []).unwrap();
        let data = handle_sync_message(request, "account-a", &state).await.data.unwrap();
        assert_eq!(data["pending_delivery_count"], 0);
        assert!(data["sync_status"]["last_error_code"].is_null());
        assert_eq!(state.db.lock().unwrap().query_row("SELECT COUNT(*) FROM sync_queue", [], |row| row.get::<_,i64>(0)).unwrap(), 3);
        // Status and dispatch reads go through the actor index, never a decode of the whole queue.
        for (query, index) in [
            ("SELECT COUNT(*) FROM sync_queue WHERE target_server = 'fastify' AND status != 'synced' AND json_extract(payload, '$.actor.id') = 'account-a'", "idx_sync_queue_actor"),
            ("SELECT queue_id FROM sync_queue WHERE target_server = 'fastify' AND json_extract(payload, '$.actor.id') = 'account-a' AND status IN ('pending', 'error') ORDER BY created_at ASC, queue_id ASC LIMIT 5", "idx_sync_queue_actor"),
            // The state republish's « already queued » check, once per Atome.
            ("SELECT EXISTS(SELECT 1 FROM sync_queue WHERE atome_id = 'contact' AND json_extract(payload, '$.id') = 'event')", "idx_sync_queue_atome"),
        ] {
            let db = state.db.lock().unwrap();
            let plan: Vec<String> = db.prepare(&format!("EXPLAIN QUERY PLAN {query}")).unwrap()
                .query_map([], |row| row.get::<_, String>(3)).unwrap().filter_map(Result::ok).collect();
            assert!(plan.iter().any(|step| step.contains(index)), "{query}: {plan:?}");
        }
        drop(state);
        std::fs::remove_dir_all(root).unwrap();
    }
}

