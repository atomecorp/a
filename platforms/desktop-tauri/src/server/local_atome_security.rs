use chrono::Utc;
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Map as JsonMap, Value as JsonValue};
use std::collections::HashSet;

use super::local_atome::EventRecord;

#[derive(Debug, PartialEq, Eq)]
pub(super) struct AuthorizationDecision {
    pub(super) allowed: bool,
    pub(super) reason: &'static str,
    pub(super) denied_keys: Vec<String>,
}

#[derive(Debug)]
struct PermissionRow {
    flag: i64,
    fallback: i64,
    expires_at: Option<String>,
    conditions: Option<String>,
}

fn event_patch(event: &EventRecord) -> Option<&JsonMap<String, JsonValue>> {
    event
        .payload
        .as_ref()?
        .get("props")
        .or_else(|| event.payload.as_ref()?.get("properties"))
        .or_else(|| event.payload.as_ref()?.get("patch"))
        .or_else(|| event.payload.as_ref()?.get("delta"))
        .and_then(JsonValue::as_object)
}

pub(super) fn event_touched_property_keys(event: &EventRecord) -> Vec<String> {
    let mut keys = HashSet::new();
    if let Some(patch) = event_patch(event) {
        keys.extend(patch.keys().cloned());
    }
    if let Some(deleted) = event
        .payload
        .as_ref()
        .and_then(|payload| payload.get("delete_keys"))
        .and_then(JsonValue::as_array)
    {
        keys.extend(deleted.iter().filter_map(JsonValue::as_str).map(String::from));
    }
    let mut keys = keys.into_iter().collect::<Vec<_>>();
    keys.sort();
    keys
}

fn atome_exists(db: &Connection, atome_id: &str) -> bool {
    db.query_row(
        "SELECT 1 FROM atomes WHERE atome_id = ?1",
        [atome_id],
        |_| Ok(()),
    )
    .is_ok()
}

fn effective_owner_id(db: &Connection, atome_id: &str) -> Option<String> {
    db.query_row(
        "SELECT COALESCE(a.owner_id, sc.owner_id)
         FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id
         WHERE sc.atome_id = ?1
         UNION ALL
         SELECT owner_id FROM atomes WHERE atome_id = ?1
         LIMIT 1",
        [atome_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .ok()
    .flatten()
    .flatten()
}

fn state_properties(db: &Connection, atome_id: &str) -> JsonValue {
    let raw = db
        .query_row(
            "SELECT properties FROM state_current WHERE atome_id = ?1",
            [atome_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .ok()
        .flatten()
        .flatten();
    raw.and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_else(|| json!({}))
}

fn read_path<'a>(context: &'a JsonValue, source: &str, field: &str) -> Option<&'a JsonValue> {
    let mut current = context.get(source)?;
    for part in field.split('.') {
        if matches!(part, "__proto__" | "prototype" | "constructor") {
            return None;
        }
        current = current.as_object()?.get(part)?;
    }
    Some(current)
}

fn as_number(value: &JsonValue) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|raw| raw.parse::<f64>().ok()))
        .or_else(|| {
            value.as_str().and_then(|raw| {
                chrono::DateTime::parse_from_rfc3339(raw)
                    .ok()
                    .map(|date| date.timestamp_millis() as f64)
            })
        })
}

fn compare(actual: Option<&JsonValue>, operator: &str, expected: &JsonValue) -> bool {
    match operator {
        "exists" => return actual.is_some(),
        "not_exists" => return actual.is_none(),
        _ => {}
    }
    let Some(actual) = actual else { return false };
    if operator == "between" {
        let Some(bounds) = expected.as_array() else { return false };
        if bounds.len() != 2 { return false; }
        let (Some(value), Some(lower), Some(upper)) =
            (as_number(actual), as_number(&bounds[0]), as_number(&bounds[1]))
        else { return false };
        return value >= lower && value <= upper;
    }
    if matches!(operator, "in" | "not_in") {
        let Some(values) = expected.as_array() else { return false };
        let found = values.iter().any(|candidate| candidate == actual);
        return if operator == "in" { found } else { !found };
    }
    if let (Some(left), Some(right)) = (as_number(actual), as_number(expected)) {
        return match operator {
            "eq" => left == right,
            "neq" => left != right,
            "gt" => left > right,
            "gte" => left >= right,
            "lt" => left < right,
            "lte" => left <= right,
            _ => false,
        };
    }
    let left = actual.as_str().map(String::from).unwrap_or_else(|| actual.to_string());
    let right = expected.as_str().map(String::from).unwrap_or_else(|| expected.to_string());
    match operator {
        "eq" => left == right,
        "neq" => left != right,
        "gt" => left > right,
        "gte" => left >= right,
        "lt" => left < right,
        "lte" => left <= right,
        "contains" => left.contains(&right),
        "starts_with" => left.starts_with(&right),
        "ends_with" => left.ends_with(&right),
        _ => false,
    }
}

fn evaluate_condition_node(node: &JsonValue, context: &JsonValue) -> bool {
    let Some(object) = node.as_object() else { return false };
    if let Some(combinator) = object.get("combinator").and_then(JsonValue::as_str) {
        let Some(children) = object.get("children").and_then(JsonValue::as_array) else {
            return false;
        };
        if children.is_empty() { return false; }
        return match combinator {
            "and" => children.iter().all(|child| evaluate_condition_node(child, context)),
            "or" => children.iter().any(|child| evaluate_condition_node(child, context)),
            _ => false,
        };
    }
    let (Some(source), Some(field), Some(operator)) = (
        object.get("source").and_then(JsonValue::as_str),
        object.get("field").and_then(JsonValue::as_str),
        object.get("operator").and_then(JsonValue::as_str),
    ) else {
        return false;
    };
    if !matches!(source, "user" | "atome" | "actor" | "operation" | "property" | "runtime" | "time" | "calendar" | "location") {
        return false;
    }
    compare(read_path(context, source, field), operator, object.get("value").unwrap_or(&JsonValue::Null))
}

fn conditions_match(
    db: &Connection,
    raw: &str,
    principal_id: &str,
    atome_id: &str,
    operation: &str,
    property_key: Option<&str>,
) -> bool {
    let Ok(document) = serde_json::from_str::<JsonValue>(raw) else { return false };
    if document.get("schemaVersion").and_then(JsonValue::as_i64) != Some(1) {
        return false;
    }
    let Some(root) = document.get("root") else { return false };
    let context = json!({
        "time": { "now": Utc::now().to_rfc3339() },
        "user": state_properties(db, principal_id),
        "atome": state_properties(db, atome_id),
        "actor": { "id": principal_id },
        "operation": { "name": operation, "property": property_key },
        "property": { "key": property_key }
    });
    evaluate_condition_node(root, &context)
}

fn permission_active(
    db: &Connection,
    permission: &PermissionRow,
    principal_id: &str,
    atome_id: &str,
    operation: &str,
    property_key: Option<&str>,
) -> bool {
    if let Some(raw) = permission.expires_at.as_deref() {
        let Ok(expiry) = chrono::DateTime::parse_from_rfc3339(raw) else { return false };
        if Utc::now() > expiry.with_timezone(&Utc) { return false; }
    }
    permission.conditions.as_deref().map(|raw| {
        conditions_match(db, raw, principal_id, atome_id, operation, property_key)
    }).unwrap_or(true)
}

fn check_permission(
    db: &Connection,
    atome_id: &str,
    principal_id: &str,
    property_key: Option<&str>,
    field: &str,
    operation: &str,
) -> bool {
    if effective_owner_id(db, atome_id).as_deref() == Some(principal_id) {
        return true;
    }
    let query = format!(
        "SELECT {field}, CASE WHEN ?4 = 'create' THEN can_share ELSE 0 END, expires_at, conditions
         FROM permissions
         WHERE atome_id = ?1 AND principal_id = ?2
           AND ((?3 IS NOT NULL AND particle_key = ?3) OR particle_key IS NULL)
         ORDER BY CASE WHEN particle_key = ?3 THEN 0 ELSE 1 END
         LIMIT 1"
    );
    let permission = db.query_row(
        &query,
        rusqlite::params![atome_id, principal_id, property_key, operation],
        |row| Ok(PermissionRow {
            flag: row.get(0)?,
            fallback: row.get(1)?,
            expires_at: row.get(2)?,
            conditions: row.get(3)?,
        }),
    ).optional().ok().flatten();
    let Some(permission) = permission else { return false };
    if permission.flag != 1 && permission.fallback != 1 { return false; }
    permission_active(db, &permission, principal_id, atome_id, operation, property_key)
}

pub(super) fn can_read(db: &Connection, atome_id: &str, principal_id: &str, property_key: Option<&str>) -> bool {
    check_permission(db, atome_id, principal_id, property_key, "can_read", "read")
}

pub(super) fn can_observe(db: &Connection, atome_id: &str, principal_id: &str, property_key: &str) -> bool {
    if effective_owner_id(db, atome_id).as_deref() == Some(principal_id) {
        return true;
    }
    let permission = db.query_row(
        "SELECT can_read, 0, expires_at, conditions, share_mode
         FROM permissions
         WHERE atome_id = ?1 AND principal_id = ?2
           AND (particle_key = ?3 OR particle_key IS NULL)
         ORDER BY CASE WHEN particle_key = ?3 THEN 0 ELSE 1 END
         LIMIT 1",
        rusqlite::params![atome_id, principal_id, property_key],
        |row| Ok((PermissionRow {
            flag: row.get(0)?, fallback: row.get(1)?, expires_at: row.get(2)?, conditions: row.get(3)?
        }, row.get::<_, Option<String>>(4)?)),
    ).optional().ok().flatten();
    let Some((permission, mode)) = permission else { return false };
    if permission.flag != 1 || !matches!(mode.unwrap_or_default().to_lowercase().as_str(), "" | "real-time" | "realtime") {
        return false;
    }
    permission_active(db, &permission, principal_id, atome_id, "read", Some(property_key))
}

pub(super) fn can_write(db: &Connection, atome_id: &str, principal_id: &str, property_key: Option<&str>) -> bool {
    check_permission(db, atome_id, principal_id, property_key, "can_write", "write")
}

pub(super) fn can_delete(db: &Connection, atome_id: &str, principal_id: &str, property_key: Option<&str>) -> bool {
    check_permission(db, atome_id, principal_id, property_key, "can_delete", "delete")
}

pub(super) fn can_share(db: &Connection, atome_id: &str, principal_id: &str, property_key: Option<&str>) -> bool {
    check_permission(db, atome_id, principal_id, property_key, "can_share", "share")
}

pub(super) fn can_create(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    check_permission(db, atome_id, principal_id, None, "can_create", "create")
}

pub(super) fn authorize_event(
    db: &Connection,
    event: &EventRecord,
    principal_id: &str,
    batch_create_ids: Option<&HashSet<String>>,
) -> AuthorizationDecision {
    let Some(atome_id) = event.atome_id.as_deref() else {
        return AuthorizationDecision { allowed: false, reason: "invalid_write_target", denied_keys: vec![] };
    };
    let kind = event.kind.to_lowercase();
    let exists = atome_exists(db, atome_id);
    if !exists {
        let Some(patch) = event_patch(event) else {
            return AuthorizationDecision { allowed: false, reason: "invalid_create_event", denied_keys: vec![] };
        };
        if kind == "delete" {
            return AuthorizationDecision { allowed: false, reason: "invalid_create_event", denied_keys: vec![] };
        }
        let requested_owner = ["owner_id", "ownerId", "owner"]
            .iter()
            .find_map(|key| patch.get(*key).and_then(JsonValue::as_str))
            .unwrap_or(principal_id);
        if requested_owner != principal_id {
            return AuthorizationDecision { allowed: false, reason: "create_owner_mismatch", denied_keys: vec![] };
        }
        let parent_id = ["parent_id", "parentId", "project_id", "projectId"]
            .iter()
            .find_map(|key| patch.get(*key).and_then(JsonValue::as_str))
            .or(event.project_id.as_deref());
        if let Some(parent_id) = parent_id {
            let created_in_batch = batch_create_ids.map(|ids| ids.contains(parent_id)).unwrap_or(false);
            if !created_in_batch && !can_create(db, parent_id, principal_id) {
                return AuthorizationDecision { allowed: false, reason: "parent_create_denied", denied_keys: vec![] };
            }
        }
        return AuthorizationDecision { allowed: true, reason: "owner_create", denied_keys: vec![] };
    }
    if kind == "delete" || kind == "restore" {
        let allowed = can_delete(db, atome_id, principal_id, None);
        return AuthorizationDecision {
            allowed,
            reason: if allowed { "delete_allowed" } else { "delete_denied" },
            denied_keys: if allowed { vec![] } else { vec!["__deleted".to_string()] },
        };
    }
    if kind == "snapshot" {
        let allowed = can_write(db, atome_id, principal_id, None);
        return AuthorizationDecision { allowed, reason: if allowed { "snapshot_write_allowed" } else { "snapshot_write_denied" }, denied_keys: vec![] };
    }
    let keys = event_touched_property_keys(event);
    if keys.is_empty() {
        return AuthorizationDecision { allowed: false, reason: "missing_property_patch", denied_keys: vec![] };
    }
    let denied_keys = keys.into_iter().filter(|key| !can_write(db, atome_id, principal_id, Some(key))).collect::<Vec<_>>();
    AuthorizationDecision {
        allowed: denied_keys.is_empty(),
        reason: if denied_keys.is_empty() { "property_write_allowed" } else { "property_write_denied" },
        denied_keys,
    }
}

pub(super) fn batch_create_ids(db: &Connection, events: &[EventRecord], principal_id: &str) -> HashSet<String> {
    events.iter().filter_map(|event| {
        let atome_id = event.atome_id.as_ref()?;
        if atome_exists(db, atome_id) || event.kind.eq_ignore_ascii_case("delete") { return None; }
        let patch = event_patch(event)?;
        let owner = ["owner_id", "ownerId", "owner"].iter()
            .find_map(|key| patch.get(*key).and_then(JsonValue::as_str))
            .unwrap_or(principal_id);
        (owner == principal_id).then(|| atome_id.clone())
    }).collect()
}

pub(super) fn project_properties_for_read(
    db: &Connection,
    atome_id: &str,
    principal_id: &str,
    properties: &JsonValue,
) -> JsonValue {
    let projected = properties.as_object().map(|object| {
        object.iter().filter_map(|(key, value)| {
            can_read(db, atome_id, principal_id, Some(key)).then(|| (key.clone(), value.clone()))
        }).collect::<JsonMap<_, _>>()
    }).unwrap_or_default();
    JsonValue::Object(projected)
}

pub(super) fn project_capabilities_for_read(
    db: &Connection,
    atome_id: &str,
    principal_id: &str,
    property_keys: impl Iterator<Item = String>,
) -> JsonValue {
    let properties = property_keys.filter_map(|key| {
        can_read(db, atome_id, principal_id, Some(&key)).then(|| {
            let capabilities = json!({
                "write": can_write(db, atome_id, principal_id, Some(&key)),
                "delete": can_delete(db, atome_id, principal_id, Some(&key)),
                "share": can_share(db, atome_id, principal_id, Some(&key))
            });
            (key, capabilities)
        })
    }).collect::<JsonMap<_, _>>();
    json!({
        "properties": properties,
        "create": can_create(db, atome_id, principal_id),
        "delete": can_delete(db, atome_id, principal_id, None),
        "share": can_share(db, atome_id, principal_id, None)
    })
}

pub(super) fn project_event_for_read(db: &Connection, event: &JsonValue, principal_id: &str) -> Option<JsonValue> {
    let atome_id = event.get("atome_id").and_then(JsonValue::as_str)?;
    let payload = event.get("payload").cloned().unwrap_or_else(|| json!({}));
    let props = payload.get("props").cloned().unwrap_or_else(|| json!({}));
    let projected_props = project_properties_for_read(db, atome_id, principal_id, &props);
    let deleted = payload.get("delete_keys").and_then(JsonValue::as_array).map(|keys| {
        keys.iter().filter_map(JsonValue::as_str).filter(|key| can_read(db, atome_id, principal_id, Some(key))).map(JsonValue::from).collect::<Vec<_>>()
    }).unwrap_or_default();
    if projected_props.as_object().map(JsonMap::is_empty).unwrap_or(true) && deleted.is_empty() {
        if event.get("kind").and_then(JsonValue::as_str) == Some("delete")
            && can_read(db, atome_id, principal_id, None)
        {
            let mut projected = event.clone();
            projected["payload"] = json!({ "props": {}, "delete_keys": [] });
            return Some(projected);
        }
        return None;
    }
    let mut projected = event.clone();
    projected["payload"] = json!({ "props": projected_props, "delete_keys": deleted });
    Some(projected)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE atomes (atome_id TEXT PRIMARY KEY, owner_id TEXT, deleted_at TEXT);
             CREATE TABLE state_current (atome_id TEXT PRIMARY KEY, owner_id TEXT, properties TEXT);
             CREATE TABLE permissions (
               atome_id TEXT, particle_key TEXT, principal_id TEXT,
               can_read INTEGER, can_write INTEGER, can_delete INTEGER,
               can_share INTEGER, can_create INTEGER, expires_at TEXT, conditions TEXT
             );"
        ).unwrap();
        db.execute("INSERT INTO atomes VALUES ('a', 'owner', NULL)", []).unwrap();
        db.execute("INSERT INTO state_current VALUES ('a', 'owner', '{\"content\":\"ok\",\"secret\":\"hidden\"}')", []).unwrap();
        db
    }

    fn event(props: JsonValue) -> EventRecord {
        EventRecord {
            id: "event".into(), ts: Utc::now().to_rfc3339(), atome_id: Some("a".into()),
            project_id: None, kind: "set".into(), payload: Some(json!({"props": props})),
            actor: Some(json!({"id":"member"})), tx_id: None, gesture_id: None,
        }
    }

    #[test]
    fn exact_property_permission_denies_sibling_and_mixed_event_atomically() {
        let db = database();
        db.execute("INSERT INTO permissions VALUES ('a', 'content', 'member', 1, 1, 0, 0, 0, NULL, NULL)", []).unwrap();
        assert!(authorize_event(&db, &event(json!({"content":"new"})), "member", None).allowed);
        let denied = authorize_event(&db, &event(json!({"content":"new","secret":"leak"})), "member", None);
        assert_eq!(denied.reason, "property_write_denied");
        assert_eq!(denied.denied_keys, vec!["secret"]);
    }

    #[test]
    fn malformed_condition_fails_closed() {
        let db = database();
        db.execute("INSERT INTO permissions VALUES ('a', 'content', 'member', 1, 1, 0, 0, 0, NULL, '{\"unknown\":true}')", []).unwrap();
        assert!(!authorize_event(&db, &event(json!({"content":"new"})), "member", None).allowed);
    }

    #[test]
    fn exact_deny_precedes_global_allow_and_conditions_receive_operation_context() {
        let db = database();
        db.execute("INSERT INTO permissions VALUES ('a', NULL, 'member', 1, 1, 0, 0, 0, NULL, NULL)", []).unwrap();
        db.execute("INSERT INTO permissions VALUES ('a', 'secret', 'member', 1, 0, 0, 0, 0, NULL, NULL)", []).unwrap();
        db.execute(
            "INSERT INTO permissions VALUES ('a', 'content', 'conditional', 1, 1, 0, 0, 0, NULL, ?1)",
            [json!({
                "schemaVersion": 1,
                "root": {"combinator":"and","children":[
                    {"source":"operation","field":"name","operator":"eq","value":"write"},
                    {"source":"property","field":"key","operator":"eq","value":"content"}
                ]}
            }).to_string()],
        ).unwrap();
        assert!(authorize_event(&db, &event(json!({"content":"new"})), "member", None).allowed);
        assert!(!authorize_event(&db, &event(json!({"secret":"leak"})), "member", None).allowed);
        assert!(authorize_event(&db, &event(json!({"content":"new"})), "conditional", None).allowed);
    }

    #[test]
    fn read_projection_removes_ungranted_properties() {
        let db = database();
        db.execute("INSERT INTO permissions VALUES ('a', 'content', 'member', 1, 0, 0, 0, 0, NULL, NULL)", []).unwrap();
        assert_eq!(project_properties_for_read(&db, "a", "member", &json!({"content":"ok","secret":"hidden"})), json!({"content":"ok"}));
    }
}
