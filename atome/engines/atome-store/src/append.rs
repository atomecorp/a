// The append-only event commit as Fastify's ADOLE engine runs it
// (`appendEvent` / `appendEvents`, database/adole_event_log.js): normalisation, a
// retry answered with the recorded event, the type gate, the prepared payload, the
// containment, the stream sequence, the conflict decisions, the insert, the
// projection stored with the event, the deferred references resolved. Its result
// is the event Fastify returns, field for field.
use super::*;

pub type JsonEvent = JsonMap<String, JsonValue>;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ConflictMode {
    Interactive,
    OfflineLww,
}

impl ConflictMode {
    pub fn of(value: Option<&str>) -> Self {
        if value == Some("offline-lww") {
            Self::OfflineLww
        } else {
            Self::Interactive
        }
    }
}

pub struct AppendOptions<'a> {
    pub source: Option<&'a str>,
    pub tx_id: Option<&'a str>,
    pub conflict_mode: ConflictMode,
    // Restored stored truth (a snapshot restore): history, never gated again.
    pub stored_truth: bool,
}

fn text(event: &JsonEvent, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| event.get(*key))
        .find(|value| js_truthy(value))
        .map(canonical::js_string)
}

// `resolveEventPayload(event)`: the payload, else `{ props }` of a bare patch.
pub fn resolve_payload(event: &JsonEvent) -> JsonValue {
    if let Some(payload) = event.get("payload") {
        return payload.clone();
    }
    ["props", "properties", "patch"]
        .iter()
        .filter_map(|key| event.get(*key))
        .find(|value| js_truthy(value))
        .filter(|value| value.is_object() || value.is_array())
        .map_or(JsonValue::Null, |props| json!({ "props": props }))
}

// `parseEventPayload(resolveEventPayload(event))` as an object (empty when it is none).
pub fn event_payload_map(event: &JsonEvent) -> JsonMap<String, JsonValue> {
    match resolve_payload(event) {
        JsonValue::Object(map) => map,
        JsonValue::String(raw) if !raw.is_empty() => match serde_json::from_str(&raw) {
            Ok(JsonValue::Object(map)) => map,
            _ => JsonMap::new(),
        },
        _ => JsonMap::new(),
    }
}

fn kind_of(event: &JsonEvent) -> String {
    event
        .get("kind")
        .map(canonical::js_string)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn ts_of(event: &JsonEvent) -> String {
    text(event, &["ts", "timestamp"]).unwrap_or_default()
}

// `eventPropertyPatch(event)`.
pub fn event_property_patch(event: &JsonEvent) -> Option<JsonMap<String, JsonValue>> {
    let kind = kind_of(event);
    if kind.is_empty() {
        return None;
    }
    let payload = match resolve_payload(event) {
        JsonValue::Null => None,
        other => Some(other),
    };
    extract_event_patch(&kind, &payload, &ts_of(event))
}

// `eventTouchedPropertyKeys(event)`: the patch's keys (internal ones excepted), then the deleted ones.
pub fn event_touched_keys(event: &JsonEvent) -> Vec<String> {
    let mut keys: Vec<String> = event_property_patch(event)
        .map(|patch| {
            patch
                .keys()
                .filter(|key| !matches!(key.as_str(), "__deleted" | "deleted_at"))
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    for key in intent::event_deleted_property_keys(&event_payload_map(event)) {
        if !keys.contains(&key) {
            keys.push(key);
        }
    }
    keys
}

fn string_field(event: &JsonEvent, key: &str) -> Option<String> {
    event.get(key).and_then(JsonValue::as_str).map(String::from)
}

// The event as the shared intent and containment code reads it.
pub fn record_of(event: &JsonEvent) -> EventRecord {
    let payload = match resolve_payload(event) {
        JsonValue::Null => None,
        other => Some(other),
    };
    EventRecord {
        id: string_field(event, "id").unwrap_or_default(),
        ts: ts_of(event),
        atome_id: string_field(event, "atome_id"),
        project_id: string_field(event, "project_id"),
        kind: kind_of(event),
        payload,
        actor: event.get("actor").filter(|actor| !actor.is_null()).cloned(),
        tx_id: string_field(event, "tx_id"),
        gesture_id: string_field(event, "gesture_id"),
    }
}

// `declaredEventType(event)`: the patch's type, else the envelope's.
fn declared_type(event: &JsonEvent) -> Option<JsonValue> {
    let patch = event_property_patch(event).unwrap_or_default();
    ["type", "atome_type"]
        .iter()
        .find_map(|key| patch.get(*key).filter(|value| !value.is_null()).cloned())
        .or_else(|| {
            ["atome_type", "type"]
                .iter()
                .find_map(|key| event.get(*key).filter(|value| !value.is_null()).cloned())
        })
}

pub fn iso_now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

// `normalizeEventInput(event, options)`.
pub fn normalize(raw: &JsonValue, options: &AppendOptions<'_>) -> Result<JsonEvent, String> {
    let Some(event) = raw.as_object() else {
        return Err("Invalid event payload".into());
    };
    let kind = kind_of(event);
    if kind.is_empty() {
        return Err("Missing event kind".into());
    }
    let scope = text(event, &["scope"]);
    let global = scope.as_deref() == Some("global");
    let parent_id = text(event, &["parent_id", "parentId"]);
    let raw_payload = resolve_payload(event);
    let scoped = if global {
        let mut map = raw_payload.as_object().cloned().unwrap_or_default();
        map.insert("scope".into(), json!("global"));
        JsonValue::Object(map)
    } else {
        raw_payload
    };
    let payload = match &parent_id {
        Some(parent) => {
            let mut map = scoped.as_object().cloned().unwrap_or_default();
            let mut props = map
                .get("props")
                .and_then(JsonValue::as_object)
                .cloned()
                .unwrap_or_default();
            props.insert("parent_id".into(), json!(parent));
            map.insert("props".into(), JsonValue::Object(props));
            JsonValue::Object(map)
        }
        None => scoped,
    };
    if let Some(declared) = declared_type(event) {
        type_gate::assert_known_type(&canonical::js_string(&declared))?;
    }
    let mut normalized = JsonEvent::new();
    normalized.insert(
        "id".into(),
        json!(text(event, &["id", "event_id"]).unwrap_or_else(|| Uuid::new_v4().to_string())),
    );
    normalized.insert(
        "ts".into(),
        json!(text(event, &["ts", "timestamp"]).unwrap_or_else(iso_now)),
    );
    normalized.insert(
        "atome_id".into(),
        json!(text(event, &["atome_id", "atomeId"])),
    );
    normalized.insert(
        "project_id".into(),
        json!(if global {
            None
        } else {
            text(event, &["project_id", "projectId"])
        }),
    );
    if let Some(parent) = parent_id {
        normalized.insert("parent_id".into(), json!(parent));
    }
    normalized.insert("kind".into(), json!(kind));
    normalized.insert("payload".into(), payload);
    normalized.insert(
        "actor".into(),
        event.get("actor").cloned().unwrap_or(JsonValue::Null),
    );
    normalized.insert(
        "tx_id".into(),
        json!(text(event, &["tx_id", "txId"]).or_else(|| options.tx_id.map(String::from))),
    );
    normalized.insert(
        "gesture_id".into(),
        json!(text(event, &["gesture_id", "gestureId"])),
    );
    normalized.insert(
        "source".into(),
        json!(
            text(event, &["source", "source_id", "sourceId"])
                .or_else(|| options.source.map(String::from))
        ),
    );
    Ok(normalized)
}

// `assertEventProperties`: a new property is checked against the atome's type.
fn assert_event_properties(
    db: &Connection,
    raw: &JsonEvent,
    event: &JsonEvent,
    options: &AppendOptions<'_>,
) -> Result<(), String> {
    if options.stored_truth || type_gate::is_ungated_kind(&kind_of(event).to_lowercase())? {
        return Ok(());
    }
    let Some(patch) = event_property_patch(event) else {
        return Ok(());
    };
    let atome_type = match declared_type(raw) {
        Some(declared) => Some(canonical::js_string(&declared)),
        None => match event.get("atome_id").and_then(JsonValue::as_str) {
            Some(atome_id) => type_gate::stored_type(db, atome_id)?,
            None => None,
        },
    };
    match atome_type {
        Some(atome_type) => type_gate::assert_known_properties(&atome_type, &patch),
        None => Ok(()),
    }
}

// The recorded event, as a retry receives it.
fn recorded(mut row: JsonMap<String, JsonValue>) -> JsonValue {
    for key in ["payload", "actor", "projection", "lww_decisions"] {
        let value = row_json::parse_stored_strict(row.get(key));
        row.insert(key.into(), value);
    }
    let stream = row.get("stream_id").cloned().unwrap_or(JsonValue::Null);
    row.insert("stream".into(), stream);
    row.insert("inserted".into(), json!(false));
    JsonValue::Object(row)
}

// `assertReplay(existing, incoming)` of database/adole_event_mutation.js.
fn assert_replay(
    existing: &JsonMap<String, JsonValue>,
    incoming: &JsonEvent,
) -> Result<(), String> {
    let stored_payload =
        mutation::stored_value(existing.get("payload").and_then(JsonValue::as_str));
    let stored = record_of(&{
        let mut row = existing.clone();
        row.insert("payload".into(), stored_payload.clone());
        row.insert(
            "actor".into(),
            row_json::parse_stored(existing.get("actor")),
        );
        row
    });
    let incoming_record = record_of(incoming);
    if stored_payload
        .get("idempotency_intent_hash")
        .is_some_and(js_truthy)
    {
        return intent::assert_replay(&stored, &incoming_record);
    }
    // Before intent hashes, a compacted `set` kept its projection: only the no-op values it
    // proves may be dropped from a retry; identity, versions and deletes are still compared.
    let projection = mutation::stored_value(existing.get("projection").and_then(JsonValue::as_str));
    let projected = projection.get("properties").and_then(JsonValue::as_object);
    let mut comparable = incoming.clone();
    if stored.kind == "set"
        && stored_payload.get("base_versions").is_some()
        && let Some(projected) = projected
    {
        let recorded_patch =
            extract_event_patch(&stored.kind, &stored.payload, &stored.ts).unwrap_or_default();
        let expected = intent::event_expected_property_versions(&event_payload_map(incoming));
        let props: JsonMap<String, JsonValue> = event_property_patch(incoming)
            .unwrap_or_default()
            .into_iter()
            .filter(|(key, value)| {
                recorded_patch.contains_key(key)
                    || expected.contains_key(key)
                    || !projected.contains_key(key)
                    || intent::js_stringify(value) != intent::js_stringify(&projected[key])
            })
            .collect();
        let mut payload = event_payload_map(incoming);
        payload.insert("props".into(), JsonValue::Object(props));
        comparable.insert("payload".into(), JsonValue::Object(payload));
    }
    let left = intent::js_json(&intent::event_intent(&stored));
    let right = intent::js_json(&intent::event_intent(&record_of(&comparable)));
    if left == right {
        Ok(())
    } else {
        Err("event_id_conflict".into())
    }
}

fn serialize(value: Option<&JsonValue>) -> Option<String> {
    match value {
        None | Some(JsonValue::Null) => None,
        Some(JsonValue::String(text)) => Some(text.clone()),
        Some(other) => Some(intent::js_stringify(other)),
    }
}

// One event of a commit, inside the caller's transaction. Returns the event as
// recorded and whether it was recorded now.
fn append_one(
    db: &Connection,
    raw: &JsonValue,
    options: &AppendOptions<'_>,
) -> Result<(JsonValue, bool), String> {
    let mut event = normalize(raw, options)?;
    let id = event["id"].as_str().unwrap_or_default().to_string();
    if let Some(existing) = row_json::query_object(db, "SELECT * FROM events WHERE id = ?", &[&id])?
    {
        assert_replay(&existing, &event)?;
        return Ok((recorded(existing), false));
    }
    assert_event_properties(
        db,
        raw.as_object().expect("normalized object"),
        &event,
        options,
    )?;
    mutation::prepare(
        db,
        &mut event,
        options.conflict_mode == ConflictMode::OfflineLww,
    )?;
    let project_id = containment::resolve_event_project_id(db, &record_of(&event))?;
    event.insert("project_id".into(), json!(project_id));
    let (stream_id, sequence) = event_stream(db, &record_of(&event))?;
    event.insert("stream_id".into(), json!(stream_id));
    event.insert("stream".into(), json!(stream_id));
    event.insert("sequence".into(), json!(sequence));
    let evaluation = conflicts::evaluate(db, &event, options.conflict_mode)?;
    event.insert(
        "lww_decisions".into(),
        JsonValue::Object(evaluation.decisions.clone()),
    );
    let field = |key: &str| event.get(key).cloned().unwrap_or(JsonValue::Null);
    db.execute(
        "INSERT INTO events
         (id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id, stream_id, sequence, source, lww_decisions)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            id,
            field("ts").as_str(),
            field("atome_id").as_str(),
            field("project_id").as_str(),
            field("kind").as_str(),
            serialize(event.get("payload")),
            serialize(event.get("actor")),
            field("tx_id").as_str(),
            field("gesture_id").as_str(),
            stream_id,
            sequence,
            field("source").as_str(),
            serialize(event.get("lww_decisions")),
        ],
    )
    .map_err(|e| e.to_string())?;
    conflicts::record_decisions(db, &event, &evaluation.decisions)?;
    let projection = match &evaluation.projection_event {
        Some(projection_event) => state_projection::apply_event(db, projection_event)?,
        None => reads::get_state_current(db, event.get("atome_id").and_then(JsonValue::as_str))?,
    };
    db.execute(
        "UPDATE events SET projection = ?1 WHERE id = ?2",
        rusqlite::params![serialize(Some(&projection)), id],
    )
    .map_err(|e| e.to_string())?;
    event.insert("projection".into(), projection);
    Ok((JsonValue::Object(event), true))
}

// Commits `events` in order inside the caller's transaction; any refusal fails the
// whole call. Returns each event as recorded, with `inserted`.
pub fn append_events(
    db: &Connection,
    events: &[JsonValue],
    options: &AppendOptions<'_>,
) -> Result<Vec<JsonValue>, String> {
    let mut results = Vec::with_capacity(events.len());
    let mut created = Vec::new();
    for raw in events {
        let (mut event, inserted) = append_one(db, raw, options)?;
        if inserted {
            if let Some(atome_id) = event.get("atome_id").and_then(JsonValue::as_str)
                && !created.iter().any(|id: &String| id == atome_id)
            {
                created.push(atome_id.to_string());
            }
            event
                .as_object_mut()
                .expect("event")
                .insert("inserted".into(), json!(true));
        }
        results.push(event);
    }
    for atome_id in created {
        pending::resolve_pending_owners(db, Some(&atome_id))?;
    }
    Ok(results)
}
