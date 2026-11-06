// The canonical Atome a read returns, as Fastify projects a stored row
// (`projectStoredStateCurrent`, database/adole_storage_projection.js, through
// `normalizeCanonicalAtome` with `universal` and `storedTruth`,
// atome/src/shared/atome_contract.js and atome_universal_contract.js): the
// envelope, the universal meta, the type's traits, capabilities and policy, the
// properties without the reserved envelope keys. Stored truth is projected as it
// was committed, never validated again.
use super::*;
use std::sync::OnceLock;

// `RESERVED_PROPERTY_KEYS` of atome_contract.js: envelope fields, never properties.
pub const RESERVED_PROPERTY_KEYS: [&str; 41] = [
    "id",
    "atome_id",
    "atomeId",
    "type",
    "atome_type",
    "atomeType",
    "owner",
    "owner_id",
    "ownerId",
    "parent",
    "parent_id",
    "parentId",
    "project_id",
    "projectId",
    "creator_id",
    "creatorId",
    "created_at",
    "createdAt",
    "updated_at",
    "updatedAt",
    "deleted_at",
    "deletedAt",
    "media_type",
    "mediaType",
    "visualType",
    "selected",
    "selection",
    "schema_version",
    "schemaVersion",
    "capabilities",
    "interfaces",
    "composition",
    "policy",
    "lifecycle",
    "last_sync",
    "lastSync",
    "sync_status",
    "syncStatus",
    "created_source",
    "createdSource",
    "",
];

const UNIVERSAL_KINDS: [&str; 20] = [
    "application",
    "ui",
    "tool",
    "api",
    "agent",
    "workflow",
    "service",
    "protocol",
    "data_model",
    "capability",
    "component",
    "connector",
    "automation",
    "pack",
    "policy",
    "visual",
    "media",
    "project",
    "user",
    "generic",
];

// `sanitizeAtomeProperties` without a schema: the properties minus the reserved keys.
pub fn sanitize_properties(properties: &JsonValue) -> JsonMap<String, JsonValue> {
    let Some(map) = properties.as_object() else {
        return JsonMap::new();
    };
    map.iter()
        .filter(|(key, _)| !RESERVED_PROPERTY_KEYS.contains(&key.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}

// `String(value)` of JavaScript, for the values a stored row can hold.
pub fn js_string(value: &JsonValue) -> String {
    match value {
        JsonValue::String(text) => text.clone(),
        JsonValue::Array(items) => items
            .iter()
            .map(|item| match item {
                JsonValue::Null => String::new(),
                other => js_string(other),
            })
            .collect::<Vec<_>>()
            .join(","),
        JsonValue::Object(_) => "[object Object]".into(),
        other => intent::js_stringify(other),
    }
}

// `normalizeStringField`: `String(value || '').trim() || null`.
fn string_field(value: Option<&JsonValue>) -> Option<String> {
    let value = value.filter(|value| js_truthy(value))?;
    let text = js_string(value).trim().to_string();
    (!text.is_empty()).then_some(text)
}

// `coerceStoredKind` of adole_storage_projection.js.
fn stored_kind(candidate: Option<&JsonValue>, atome_type: &str) -> String {
    let value = string_field(candidate).unwrap_or_default();
    let family = atome_type.split('.').next().unwrap_or("");
    if UNIVERSAL_KINDS.contains(&value.as_str()) {
        return value;
    }
    if UNIVERSAL_KINDS.contains(&family) {
        return family.into();
    }
    let visual = ["shape", "text", "rect", "circle", "svg"];
    let media = ["image", "video", "audio", "waveform"];
    if visual.contains(&value.as_str()) || visual.contains(&family) {
        return "visual".into();
    }
    if media.contains(&value.as_str()) || media.contains(&family) {
        return "media".into();
    }
    "generic".into()
}

// The registered type definitions (eVe/registry/generated/atome_types.json).
fn type_definition(atome_type: &str) -> Option<&'static JsonValue> {
    static TYPES: OnceLock<JsonValue> = OnceLock::new();
    TYPES
        .get_or_init(|| {
            serde_json::from_str::<JsonValue>(type_gate::ATOME_TYPES_JSON)
                .ok()
                .and_then(|document| document.get("types").cloned())
                .unwrap_or(JsonValue::Null)
        })
        .get(atome_type)
}

fn string_array(value: Option<&JsonValue>) -> Vec<JsonValue> {
    value
        .and_then(JsonValue::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| string_field(Some(item)))
                .map(JsonValue::String)
                .collect()
        })
        .unwrap_or_default()
}

fn plain_object(value: Option<&JsonValue>) -> JsonValue {
    JsonValue::Object(
        value
            .and_then(JsonValue::as_object)
            .cloned()
            .unwrap_or_default(),
    )
}

// `normalizeCapability` (the registered defaults are valid: no error to raise).
fn capability(entry: &JsonValue) -> JsonValue {
    json!({
        "key": string_field(entry.get("key")),
        "description": string_field(entry.get("description")),
        "inputs_schema": plain_object(entry.get("inputs_schema")),
        "outputs_schema": plain_object(entry.get("outputs_schema")),
        "effects": string_array(entry.get("effects")),
        "risk_level": string_field(entry.get("risk_level")).unwrap_or_else(|| "LOW".into()).to_uppercase(),
        "permissions": string_array(entry.get("permissions")),
    })
}

// `normalizePolicy({}, defaultPolicy)`.
fn policy(defaults: Option<&JsonValue>) -> JsonValue {
    let field = |key: &str| defaults.and_then(|policy| policy.get(key));
    json!({
        "permissions": string_array(field("permissions")),
        "visibility": string_field(field("visibility")).unwrap_or_else(|| "private".into()),
        "license": string_field(field("license")),
        "pricing": field("pricing").cloned().unwrap_or(JsonValue::Null),
        "entitlements": field("entitlements").and_then(JsonValue::as_array).cloned().unwrap_or_default(),
    })
}

// The parts of a stored row a projection reads.
pub struct StoredState<'a> {
    pub atome_id: &'a str,
    pub atome_type: Option<&'a str>,
    pub properties: Option<&'a str>,
    pub owner_id: Option<&'a str>,
    pub parent_id: Option<&'a str>,
    pub project_id: Option<&'a str>,
    pub created_at: Option<&'a str>,
    pub updated_at: Option<&'a str>,
    pub version: Option<i64>,
}

fn text(value: Option<&str>) -> JsonValue {
    value
        .filter(|text| !text.is_empty())
        .map_or(JsonValue::Null, |text| JsonValue::String(text.into()))
}

// The universal envelope `normalizeCanonicalAtome` builds with `universal` and `storedTruth`:
// the type's kind (else the coerced one), traits, capabilities and policy around the meta and
// the properties.
fn universal(
    id: &str,
    atome_type: String,
    coerced_kind: String,
    renderer: JsonValue,
    meta: JsonValue,
    properties: JsonMap<String, JsonValue>,
) -> JsonValue {
    let definition = type_definition(&atome_type);
    let kind = definition
        .and_then(|definition| string_field(definition.get("kind")))
        .unwrap_or(coerced_kind);
    let traits = definition
        .map(|definition| string_array(definition.get("traits")))
        .unwrap_or_default();
    let capabilities: Vec<JsonValue> = definition
        .and_then(|definition| definition.get("default_capabilities"))
        .and_then(JsonValue::as_array)
        .map(|items| items.iter().map(capability).collect())
        .unwrap_or_default();
    json!({
        "id": id,
        "type": atome_type,
        "kind": kind,
        "renderer": renderer,
        "meta": meta,
        "traits": traits,
        "properties": properties,
        "schema_version": 1,
        "capabilities": capabilities,
        "interfaces": { "inputs": {}, "outputs": {}, "events": {}, "commands": {} },
        "composition": { "dependencies": [], "children": [], "ports": [], "compatible_with": [] },
        "policy": policy(definition.and_then(|definition| definition.get("default_policy"))),
        "lifecycle": {
            "version": "1.0.0",
            "migrations": [],
            "compatibility": {},
            "deprecation": JsonValue::Null,
            "archived_at": JsonValue::Null
        },
    })
}

// `projectStoredStateCurrent(row)`.
pub fn project_stored_state(row: &StoredState<'_>) -> JsonValue {
    let parsed = row
        .properties
        .and_then(|raw| serde_json::from_str::<JsonValue>(raw).ok())
        .unwrap_or(JsonValue::Null);
    let properties = sanitize_properties(&parsed);
    let stored_kind_value = properties.get("kind").filter(|kind| js_truthy(kind));
    let atome_type = row
        .atome_type
        .filter(|value| !value.is_empty())
        .map(String::from)
        .or_else(|| stored_kind_value.map(js_string))
        .unwrap_or_else(|| "generic".into());
    let atome_type = atome_type.trim().to_string();
    let coerced_kind = stored_kind(stored_kind_value, &atome_type);
    let meta = json!({
        "name": JsonValue::Null,
        "description": JsonValue::Null,
        "created_at": text(row.created_at.map(str::trim)),
        "created_by": JsonValue::Null,
        "updated_at": text(row.updated_at.map(str::trim)),
        "updated_by": JsonValue::Null,
        "owner_id": text(row.owner_id.map(str::trim)),
        "parent_id": text(row.parent_id.map(str::trim)),
        "project_id": text(row.project_id.map(str::trim)),
        "status": "draft",
        "version": row.version.filter(|version| *version != 0).map_or(JsonValue::Null, JsonValue::from),
    });
    universal(
        row.atome_id.trim(),
        atome_type,
        coerced_kind,
        JsonValue::Null,
        meta,
        properties,
    )
}

// `projectStoredAtome({ row, properties, kind })` (database/adole_storage_projection.js, the
// atome `getAtome` returns): an `atomes` row with its particles read back and its `kind` particle.
// None when the row names no id or type; a name that trims to nothing is refused as
// `normalizeCanonicalAtome` refuses it.
pub fn project_stored_atome(
    row: &JsonValue,
    properties: &JsonMap<String, JsonValue>,
    kind: Option<&JsonValue>,
) -> Result<Option<JsonValue>, String> {
    let field = |keys: &[&str]| {
        keys.iter()
            .filter_map(|key| row.get(*key))
            .find(|value| js_truthy(value))
    };
    let kind = kind.filter(|kind| js_truthy(kind));
    let (Some(id), Some(atome_type)) = (
        field(&["id", "atome_id"]),
        field(&["type", "atome_type"]).or(kind),
    ) else {
        return Ok(None);
    };
    let (Some(id), Some(trimmed_type)) = (string_field(Some(id)), string_field(Some(atome_type)))
    else {
        return Err("Canonical Atome requires id and type".into());
    };
    let coerced_kind = stored_kind(kind.or_else(|| field(&["kind"])), &js_string(atome_type));
    let named =
        |keys: &[&str]| string_field(field(keys)).map_or(JsonValue::Null, JsonValue::String);
    let kept = |keys: &[&str]| field(keys).cloned().unwrap_or(JsonValue::Null);
    let meta = json!({
        "name": JsonValue::Null,
        "description": JsonValue::Null,
        "created_at": named(&["created_at", "createdAt"]),
        "created_by": named(&["creator_id", "creatorId"]),
        "updated_at": named(&["updated_at", "updatedAt"]),
        "updated_by": JsonValue::Null,
        "owner_id": named(&["owner_id", "ownerId"]),
        "parent_id": named(&["parent_id", "parentId"]),
        "project_id": JsonValue::Null,
        "status": "draft",
        "deleted_at": kept(&["deleted_at", "deletedAt"]),
        "sync_status": kept(&["sync_status", "syncStatus"]),
        "last_sync": kept(&["last_sync", "lastSync"]),
        "created_source": kept(&["created_source", "createdSource"]),
    });
    let renderer = string_field(field(&["renderer"]).or_else(|| {
        properties
            .get("renderer")
            .filter(|renderer| js_truthy(renderer))
    }))
    .map_or(JsonValue::Null, JsonValue::String);
    let properties = sanitize_properties(&JsonValue::Object(properties.clone()));
    Ok(Some(universal(
        &id,
        trimmed_type,
        coerced_kind,
        renderer,
        meta,
        properties,
    )))
}
