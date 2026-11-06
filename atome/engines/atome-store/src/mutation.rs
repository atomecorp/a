// What an event changes, read inside its commit, never from the client — Fastify's
// `prepare` (database/adole_event_mutation.js): the intent hash, the expected
// versions checked, a property rewritten identically dropped (it is no change),
// and the preimages history inverts (`before`, `before_missing`, `before_identity`,
// `base_versions`).
use super::*;
use append::{JsonEvent, event_payload_map, event_property_patch, event_touched_keys};

fn is_identity_key(key: &str) -> bool {
    matches!(key, "kind" | "type" | "atome_type")
}

fn is_parent_key(key: &str) -> bool {
    matches!(key, "parent_id" | "parentId")
}

// `parseStoredValue`: the stored text parsed, else the text itself.
pub fn stored_value(raw: Option<&str>) -> JsonValue {
    match raw {
        Some(text) => serde_json::from_str(text).unwrap_or_else(|_| JsonValue::String(text.into())),
        None => JsonValue::Null,
    }
}

struct Particle {
    value: Option<String>,
    deleted: bool,
    version: i64,
}

fn particles_of(db: &Connection, atome_id: &str) -> Result<HashMap<String, Particle>, String> {
    let mut statement = db
        .prepare("SELECT particle_key, particle_value, value_type, version FROM particles WHERE atome_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([atome_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                Particle {
                    value: row.get(1)?,
                    deleted: row.get::<_, Option<String>>(2)?.as_deref()
                        == Some(particles::DELETED_VALUE_TYPE),
                    version: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                },
            ))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<HashMap<_, _>, _>>()
        .map_err(|e| e.to_string())
}

// Prepares `event` for the log; `skip_expected_versions` for an offline replay (LWW).
pub fn prepare(
    db: &Connection,
    event: &mut JsonEvent,
    skip_expected_versions: bool,
) -> Result<(), String> {
    let hash = intent::intent_hash(&append::record_of(event));
    let mut payload = event_payload_map(event);
    payload.insert("idempotency_intent_hash".into(), json!(hash));
    event.insert("payload".into(), JsonValue::Object(payload));
    let atome_id = event
        .get("atome_id")
        .and_then(JsonValue::as_str)
        .filter(|id| !id.is_empty())
        .map(String::from);
    let touched = event_touched_keys(event);
    let Some(atome_id) = atome_id.filter(|_| !touched.is_empty()) else {
        return Ok(());
    };
    let identity: Option<(Option<String>, Option<String>)> = db
        .query_row(
            "SELECT parent_id, atome_type FROM atomes WHERE atome_id = ?1",
            [&atome_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let current = particles_of(db, &atome_id)?;
    let payload = event_payload_map(event);
    let expected = intent::event_expected_property_versions(&payload);
    if !skip_expected_versions {
        for (key, version) in &expected {
            let stored = current.get(key).map_or(0, |particle| particle.version);
            if version.as_i64() != Some(stored) {
                return Err("property_version_conflict".into());
            }
        }
    }
    // A property rewritten identically is no change: neutral for replay, conflicts and
    // projection, and it keeps large unchanged values out of the journal.
    let patch = event_property_patch(event).unwrap_or_default();
    let unchanged: HashSet<&String> = touched
        .iter()
        .filter(|key| {
            let Some(value) = patch.get(key.as_str()) else {
                return false;
            };
            let Some(particle) = current
                .get(key.as_str())
                .filter(|particle| !particle.deleted)
            else {
                return false;
            };
            if identity.is_some() && (is_parent_key(key) || is_identity_key(key)) {
                return false;
            }
            !expected.contains_key(key.as_str())
                && particle.value.as_deref() == Some(intent::js_stringify(value).as_str())
        })
        .collect();
    let mut before = JsonMap::new();
    let mut before_missing = Vec::new();
    let mut base_versions = JsonMap::new();
    for key in touched.iter().filter(|key| !unchanged.contains(key)) {
        let particle = current.get(key);
        base_versions.insert(
            key.clone(),
            json!(particle.map_or(0, |particle| particle.version)),
        );
        match (&identity, particle) {
            (Some((parent_id, _)), _) if is_parent_key(key) => {
                before.insert(key.clone(), json!(parent_id));
            }
            (Some((_, atome_type)), _) if is_identity_key(key) => {
                before.insert(key.clone(), json!(atome_type));
            }
            (_, Some(particle)) if !particle.deleted => {
                before.insert(key.clone(), stored_value(particle.value.as_deref()));
            }
            _ => before_missing.push(JsonValue::String(key.clone())),
        }
    }
    let props: JsonMap<String, JsonValue> = patch
        .iter()
        .filter(|(key, _)| !unchanged.contains(key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    let mut payload = payload;
    payload.insert("props".into(), JsonValue::Object(props));
    payload.insert(
        "delete_keys".into(),
        json!(intent::event_deleted_property_keys(&payload)),
    );
    payload.insert("expected_versions".into(), JsonValue::Object(expected));
    payload.insert("before".into(), JsonValue::Object(before));
    payload.insert(
        "before_identity".into(),
        identity.map_or(
            JsonValue::Null,
            |(parent_id, atome_type)| json!({ "parent_id": parent_id, "atome_type": atome_type }),
        ),
    );
    payload.insert("before_missing".into(), JsonValue::Array(before_missing));
    payload.insert("base_versions".into(), JsonValue::Object(base_versions));
    event.insert("payload".into(), JsonValue::Object(payload));
    Ok(())
}
