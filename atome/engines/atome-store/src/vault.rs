// One person's vault: the operations Fastify's vault process answers
// (server/userVaultProcess.js#handleOperation), on that person's own database
// only. The process that holds it serves one principal; every event it commits is
// that principal's (or the one actor the caller authorized), every read is of
// that vault alone.
use super::*;
use append::{AppendOptions, ConflictMode};
use reads::{EventFilter, StateFilter, field, field_text, js_number_of, number_or};

// Opens a person's vault database as Fastify's vault process opened it: WAL, the
// schema, then the references an earlier write left pending.
pub fn open_database(path: &std::path::Path) -> Result<Connection, String> {
    let db = Connection::open(path).map_err(|e| e.to_string())?;
    let _ = db.execute_batch("PRAGMA journal_mode = WAL;");
    prepare_schema(&db).map_err(|e| e.to_string())?;
    pending::resolve_pending_owners(&db, None)?;
    Ok(db)
}

pub struct Vault<'a> {
    pub principal_id: &'a str,
    pub database_path: &'a str,
    pub file_root: &'a str,
}

fn strict_true(payload: &JsonValue, keys: &[&str]) -> bool {
    keys.iter()
        .any(|key| payload.get(*key) == Some(&JsonValue::Bool(true)))
}

fn replay_cursor(value: Option<&JsonValue>) -> f64 {
    js_number_of(value)
        .filter(|cursor| cursor.is_finite())
        .unwrap_or(0.0)
        .max(0.0)
}

fn string_list(value: Option<&JsonValue>) -> Vec<String> {
    value
        .and_then(JsonValue::as_array)
        .map(|items| {
            items
                .iter()
                .map(canonical::js_string)
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn placeholders(count: usize) -> String {
    vec!["?"; count].join(",")
}

fn text_params(values: &[String]) -> Vec<&dyn rusqlite::ToSql> {
    values
        .iter()
        .map(|value| value as &dyn rusqlite::ToSql)
        .collect()
}

impl Vault<'_> {
    fn authorized(&self, payload: &JsonValue) -> String {
        field_text(payload, &["authorized_actor_id"]).unwrap_or_else(|| self.principal_id.into())
    }

    // `assertActor`: the event is the authorized actor's, written as a user actor.
    fn assert_actor(
        &self,
        event: Option<&JsonValue>,
        authorized: &str,
    ) -> Result<JsonValue, String> {
        let mut event = match event {
            Some(JsonValue::Object(map)) => map.clone(),
            _ => JsonMap::new(),
        };
        let mut actor = match event.get("actor") {
            Some(JsonValue::Object(map)) => map.clone(),
            _ => JsonMap::new(),
        };
        let actor_id = field_text(
            &JsonValue::Object(actor.clone()),
            &["id", "user_id", "userId"],
        )
        .unwrap_or_else(|| self.principal_id.into());
        if actor_id != authorized {
            return Err("vault_actor_mismatch".into());
        }
        actor.insert("type".into(), json!("user"));
        actor.insert("id".into(), json!(authorized));
        event.insert("actor".into(), JsonValue::Object(actor));
        Ok(JsonValue::Object(event))
    }

    fn user_actor(&self, payload: &JsonValue) -> JsonValue {
        json!({ "type": "user", "id": self.authorized(payload) })
    }

    pub fn handle(
        &self,
        db: &Connection,
        operation: &str,
        payload: &JsonValue,
    ) -> Result<JsonValue, String> {
        match operation {
            "health" => Ok(json!({
                "ok": true,
                "principalId": self.principal_id,
                "pid": std::process::id(),
                "databasePath": self.database_path,
                "fileRoot": self.file_root,
            })),
            "event:commit" => {
                let authorized = self.authorized(payload);
                let event = self.assert_actor(payload.get("event"), &authorized)?;
                let options = AppendOptions {
                    source: payload
                        .get("source")
                        .filter(|v| js_truthy(v))
                        .and_then(JsonValue::as_str),
                    tx_id: None,
                    conflict_mode: ConflictMode::of(
                        payload.get("conflictMode").and_then(JsonValue::as_str),
                    ),
                    stored_truth: false,
                };
                let mut committed =
                    with_transaction(db, |db| append::append_events(db, &[event], &options))?;
                Ok(committed.remove(0))
            }
            "event:commit-batch" => {
                let Some(raw) = payload.get("events").and_then(JsonValue::as_array) else {
                    return Err("vault_events_array_required".into());
                };
                let authorized = self.authorized(payload);
                let events = raw
                    .iter()
                    .map(|event| self.assert_actor(Some(event), &authorized))
                    .collect::<Result<Vec<_>, _>>()?;
                let tx_id = field_text(payload, &["tx_id", "txId"]);
                let options = AppendOptions {
                    source: payload
                        .get("source")
                        .filter(|v| js_truthy(v))
                        .and_then(JsonValue::as_str),
                    tx_id: tx_id.as_deref(),
                    conflict_mode: ConflictMode::of(
                        payload.get("conflictMode").and_then(JsonValue::as_str),
                    ),
                    stored_truth: false,
                };
                Ok(JsonValue::Array(with_transaction(db, |db| {
                    append::append_events(db, &events, &options)
                })?))
            }
            "snapshot:create" => {
                let actor = self.user_actor(payload);
                let request = payload.get("request").cloned().unwrap_or_else(|| json!({}));
                with_transaction(db, |db| {
                    snapshots::create_snapshot_once(db, &request, &actor)
                })
            }
            "snapshot:list" => {
                let request = payload.get("request").cloned().unwrap_or_else(|| json!({}));
                Ok(json!({ "snapshots": snapshots::list_snapshots(db, &request)? }))
            }
            // A snapshot named with its object must be that object's: the router authorized the object, not the id.
            "snapshot:get" | "snapshot:restore" => {
                let request = payload.get("request").cloned().unwrap_or_else(|| json!({}));
                let target = field(&request, &["project_id", "atome_id"]).cloned();
                let snapshot = snapshots::get_snapshot(db, request.get("snapshot_id"))?;
                let belongs = |snapshot: &JsonValue| {
                    target.as_ref().is_none_or(|target| {
                        [snapshot.get("project_id"), snapshot.get("atome_id")]
                            .contains(&Some(target))
                    })
                };
                if snapshot.is_null() || !belongs(&snapshot) {
                    return Err("Snapshot not found".into());
                }
                if operation == "snapshot:get" {
                    return Ok(json!({ "snapshot": snapshot }));
                }
                let actor = self.user_actor(payload);
                let tx_id = field_text(&request, &["tx_id"]);
                let events = with_transaction(db, |db| {
                    snapshots::restore_snapshot(db, &snapshot, &actor, tx_id)
                })?;
                Ok(json!({ "snapshot_id": snapshot["snapshot_id"], "events": events }))
            }
            "event:get" => {
                reads::get_event(db, field_text(payload, &["event_id", "eventId"]).as_deref())
            }
            "history:apply" => {
                let operation = payload
                    .get("operation")
                    .map(canonical::js_string)
                    .unwrap_or_default();
                let request = history_command::HistoryRequest {
                    operation: &operation,
                    source_tx_id: field_text(payload, &["sourceTxId"]),
                    atome_ids: string_list(field(payload, &["atomeIds", "atome_ids"])),
                    request_id: field_text(payload, &["requestId"]),
                };
                with_transaction(db, |db| {
                    history_command::apply_history(db, &request, self.principal_id)
                })
            }
            "state:get" => reads::get_state_current(
                db,
                field_text(payload, &["atome_id", "atomeId"]).as_deref(),
            ),
            "communication:list" => communication::query_messages(db, self.principal_id, payload),
            "communication:threads" => {
                communication::query_listing_threads(db, self.principal_id, payload)
            }
            "state:within" => reads::list_branch_states(
                db,
                &field_text(payload, &["root_atome_id", "rootAtomeId"]).unwrap_or_default(),
                self.principal_id,
            )
            .map(JsonValue::Array),
            "state:list" => {
                let oldest = payload.get("order").and_then(JsonValue::as_str) == Some("oldest");
                let after = payload
                    .get("after")
                    .filter(|after| after.is_object() && oldest)
                    .map(|after| {
                        let text = |key: &str| field_text(after, &[key]).unwrap_or_default();
                        (text("updated_at"), text("atome_id"))
                    });
                let filter = StateFilter {
                    project_id: field_text(payload, &["project_id", "projectId"]),
                    owner_id: Some(self.principal_id.into()),
                    atome_type: field_text(payload, &["atome_type", "atomeType"]),
                    exclude_system: strict_true(payload, &["exclude_system", "excludeSystem"]),
                    include_deleted: strict_true(payload, &["includeDeleted", "include_deleted"]),
                    limit: number_or(payload.get("limit"), 1000),
                    offset: number_or(payload.get("offset"), 0),
                    oldest,
                    after,
                };
                Ok(JsonValue::Array(reads::list_state_current(db, &filter)?))
            }
            "events:list" => {
                let text = |keys: &[&str]| field_text(payload, keys);
                let order = text(&["order"]).unwrap_or_else(|| "asc".into());
                let filter = EventFilter {
                    project_id: text(&["project_id", "projectId"]),
                    atome_id: text(&["atome_id", "atomeId"]),
                    tx_id: text(&["tx_id", "txId"]),
                    gesture_id: text(&["gesture_id", "gestureId"]),
                    since: text(&["since"]),
                    until: text(&["until"]),
                    limit: number_or(payload.get("limit"), 1000),
                    offset: number_or(payload.get("offset"), 0),
                    descending: order.to_lowercase() == "desc",
                };
                Ok(JsonValue::Array(reads::list_events(db, &filter)?))
            }
            "stream:of-atome" => with_transaction(db, |db| {
                self.stream_of_atome(db, field_text(payload, &["atome_id", "atomeId"]))
            }),
            "stream:events" => {
                let stream_id = field_text(payload, &["stream_id", "streamId"])
                    .ok_or("vault_stream_required")?;
                let streams = [(stream_id, replay_cursor(payload.get("cursor")))];
                let limit = number_or(payload.get("limit"), 500).clamp(1, 1000);
                stream_pages::events_after(db, &streams, limit).map(JsonValue::Array)
            }
            // A subscription batch's replay: `[[stream_id, cursor], …]`, one page across them.
            "streams:events" => {
                let streams: Vec<(String, f64)> = payload
                    .get("streams")
                    .and_then(JsonValue::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|pair| {
                        let stream = pair.get(0)?.as_str().filter(|id| !id.is_empty())?;
                        Some((stream.to_string(), replay_cursor(pair.get(1))))
                    })
                    .collect();
                if streams.len() > 1000 {
                    return Err("vault_stream_batch_too_large".into());
                }
                let limit = number_or(payload.get("limit"), 500).clamp(1, 1000);
                stream_pages::events_after(db, &streams, limit).map(JsonValue::Array)
            }
            "streams:restore-order" => {
                let principal = field_text(payload, &["principal_id"]).unwrap_or_default();
                stream_pages::restore_order(db, &principal).map(JsonValue::Array)
            }
            "stream:head" => {
                let stream_id = field_text(payload, &["stream_id", "streamId"])
                    .ok_or("vault_stream_required")?;
                let sequence: Option<i64> = db
                    .query_row(
                        "SELECT COALESCE(MAX(sequence), 0) FROM events WHERE stream_id = ?1",
                        [&stream_id],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                Ok(json!(sequence.unwrap_or(0)))
            }
            // Bulk `stream:head` for a subscription batch: one indexed query instead of one request per stream.
            "stream:heads" => {
                let stream_ids = string_list(payload.get("stream_ids"));
                if stream_ids.is_empty() {
                    return Ok(json!({}));
                }
                if stream_ids.len() > 1000 {
                    return Err("vault_stream_batch_too_large".into());
                }
                let rows = row_json::query_objects(
                    db,
                    &format!(
                        "SELECT stream_id, MAX(sequence) AS sequence FROM events WHERE stream_id IN ({}) GROUP BY stream_id",
                        placeholders(stream_ids.len())
                    ),
                    &text_params(&stream_ids),
                )?;
                Ok(JsonValue::Object(
                    rows.into_iter()
                        .map(|row| {
                            (
                                canonical::js_string(&row["stream_id"]),
                                json!(number_or(row.get("sequence"), 0)),
                            )
                        })
                        .collect(),
                ))
            }
            // Objects this vault has placed on a teleport surface (surface loss / reconnect).
            "teleport:hosted" => {
                let surface_id = field_text(payload, &["surface_id", "surfaceId"])
                    .ok_or("vault_surface_required")?;
                let quoted = intent::js_stringify(&json!(surface_id));
                let rows = row_json::query_objects(
                    db,
                    "SELECT DISTINCT atome_id FROM particles WHERE particle_key = 'teleport_surface_id' AND particle_value IN (?, ?)",
                    &[&surface_id, &quoted],
                )?;
                Ok(JsonValue::Array(
                    rows.into_iter()
                        .map(|row| row["atome_id"].clone())
                        .collect(),
                ))
            }
            // The live Atome describing each stored file, by its stored name, newest first for a name stored twice.
            "files:described" => self.files_described(db, payload),
            _ => Err("vault_operation_not_allowed".into()),
        }
    }

    // `streamOfAtome`: a project's own stream, otherwise the stream of the atome's latest event.
    fn stream_of_atome(
        &self,
        db: &Connection,
        atome_id: Option<String>,
    ) -> Result<JsonValue, String> {
        let atome_id = atome_id.unwrap_or_default();
        let row = row_json::query_object(
            db,
            "SELECT atome_type, owner_id FROM atomes WHERE atome_id = ?",
            &[&atome_id],
        )?;
        if let Some(row) =
            row.filter(|row| canonical::js_string(&row["atome_type"]).to_lowercase() == "project")
        {
            let owner = row
                .get("owner_id")
                .and_then(JsonValue::as_str)
                .filter(|owner| !owner.is_empty());
            let stream_id = ensure_scope_stream(
                db,
                &format!("project:{atome_id}"),
                Some(&atome_id),
                None,
                owner,
            )?;
            return Ok(
                json!({ "stream_id": stream_id, "project_id": atome_id, "atome_id": atome_id }),
            );
        }
        let latest = row_json::query_object(
            db,
            "SELECT stream_id, project_id FROM events WHERE atome_id = ? ORDER BY ts DESC LIMIT 1",
            &[&atome_id],
        )?;
        Ok(match latest.filter(|row| js_truthy(&row["stream_id"])) {
            Some(row) => json!({
                "stream_id": row["stream_id"],
                "project_id": Some(&row["project_id"]).filter(|id| js_truthy(id)).cloned().unwrap_or(JsonValue::Null),
                "atome_id": atome_id,
            }),
            None => JsonValue::Null,
        })
    }

    fn files_described(&self, db: &Connection, payload: &JsonValue) -> Result<JsonValue, String> {
        let names = string_list(payload.get("file_names"));
        if names.is_empty() {
            return Ok(json!([]));
        }
        if names.len() > 1000 {
            return Err("vault_file_batch_too_large".into());
        }
        let quoted: Vec<String> = names
            .iter()
            .map(|name| intent::js_stringify(&json!(name)))
            .collect();
        let rows = row_json::query_objects(
            db,
            &format!(
                "SELECT f.atome_id, f.particle_value AS file_name, o.particle_value AS original_name, p.particle_value AS profiles
                 FROM particles f
                 JOIN atomes a ON a.atome_id = f.atome_id AND a.deleted_at IS NULL
                 LEFT JOIN particles o ON o.atome_id = f.atome_id AND o.particle_key = 'original_name'
                 LEFT JOIN particles p ON p.atome_id = f.atome_id AND p.particle_key = 'profiles'
                 WHERE f.particle_key = 'file_name' AND f.particle_value IN ({})
                 ORDER BY COALESCE(a.updated_at, a.created_at) DESC",
                placeholders(quoted.len())
            ),
            &text_params(&quoted),
        )?;
        let parse = |value: &JsonValue| -> Result<JsonValue, String> {
            serde_json::from_str(value.as_str().unwrap_or("null")).map_err(|e| e.to_string())
        };
        rows.into_iter()
            .map(|row| {
                Ok(json!({
                    "atome_id": row["atome_id"],
                    "file_name": parse(&row["file_name"])?,
                    "original_name": if row["original_name"].is_null() { JsonValue::Null } else { parse(&row["original_name"])? },
                    "profiles": if row["profiles"].is_null() { json!([]) } else { parse(&row["profiles"])? },
                }))
            })
            .collect::<Result<Vec<_>, String>>()
            .map(JsonValue::Array)
    }
}
