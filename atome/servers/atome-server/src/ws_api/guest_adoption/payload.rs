// What a guest adoption carries (`parsePayload`, `normalizeAtome`, `sortAtomes`): the guest's
// atomes, their events, checkpoints, outbox rows and grants, the files' descriptors and the
// personal profile, each list as the payload gave it.
use super::files::{self, Descriptor};
use super::{field, profile};
use crate::vault_router::js;
use indexmap::IndexMap;
use serde_json::{Map as JsonMap, Value as JsonValue};

pub(super) struct Payload {
    pub atomes: Vec<JsonValue>,
    pub events: Vec<JsonValue>,
    pub snapshots: Vec<JsonValue>,
    pub sync_queue: Vec<JsonValue>,
    pub permissions: Vec<JsonValue>,
    pub files: Vec<Descriptor>,
    pub profile: Option<JsonValue>,
}

/// An adopted atome (`normalizeAtome`): its id, type, parent, project and properties.
pub(super) struct Atome {
    pub atome_id: String,
    pub atome_type: String,
    pub parent_id: Option<String>,
    pub project_id: Option<String>,
    pub properties: JsonMap<String, JsonValue>,
}

fn list(payload: &JsonValue, key: &str) -> Vec<JsonValue> {
    payload
        .get(key)
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default()
}

/// `parsePayload`.
pub(super) fn parse(payload: &JsonValue) -> Result<Payload, String> {
    if !payload.is_object() {
        return Err("guest_adoption_payload_invalid".into());
    }
    let atomes = list(payload, "atomes");
    let events = list(payload, "events");
    let snapshots = list(payload, "snapshots");
    let sync_queue = list(payload, "sync_queue");
    let permissions = list(payload, "permissions");
    let file_list = list(payload, "files");
    let others = [&events, &snapshots, &sync_queue, &permissions, &file_list];
    if atomes.is_empty() && others.iter().any(|others| !others.is_empty()) {
        return Err("guest_adoption_atomes_required".into());
    }
    let sent_profile = payload.get("profile").filter(|profile| !profile.is_null());
    if sent_profile.is_some_and(|profile| !profile.is_object()) {
        return Err("guest_adoption_profile_invalid".into());
    }
    Ok(Payload {
        files: files::descriptors(&file_list)?,
        profile: sent_profile.map(profile::personal).transpose()?,
        atomes,
        events,
        snapshots,
        sync_queue,
        permissions,
    })
}

/// `normalizeAtome`: never an account or a guest workspace.
pub(super) fn atome(record: &JsonValue) -> Result<Atome, String> {
    let atome_id = field(record, &["atome_id", "id"]);
    let atome_type = field(record, &["atome_type", "type"]);
    if atome_id.is_empty()
        || atome_type.is_empty()
        || atome_type == "user"
        || atome_type == "guest_workspace"
    {
        return Err("guest_adoption_atome_invalid".into());
    }
    let named = |keys: &[&str]| js::first(record, keys).map(|value| js::text(Some(value)));
    Ok(Atome {
        properties: record
            .get("properties")
            .and_then(JsonValue::as_object)
            .cloned()
            .unwrap_or_default(),
        parent_id: named(&["parent_id", "parentId"]),
        project_id: named(&["project_id", "projectId"]),
        atome_id,
        atome_type,
    })
}

/// `sortAtomes`: parents before their children, in waves; a later record of the same id replaces
/// an earlier one in its place.
pub(super) fn sorted(records: Vec<Atome>) -> Result<Vec<Atome>, String> {
    let mut remaining: IndexMap<String, Atome> = IndexMap::new();
    for record in records {
        remaining.insert(record.atome_id.clone(), record);
    }
    let mut ordered = Vec::with_capacity(remaining.len());
    while !remaining.is_empty() {
        let ready: Vec<String> = remaining
            .values()
            .filter(|record| {
                record
                    .parent_id
                    .as_ref()
                    .is_none_or(|parent| !remaining.contains_key(parent))
            })
            .map(|record| record.atome_id.clone())
            .collect();
        if ready.is_empty() {
            return Err("guest_adoption_parent_cycle".into());
        }
        for id in ready {
            if let Some(record) = remaining.shift_remove(&id) {
                ordered.push(record);
            }
        }
    }
    Ok(ordered)
}
