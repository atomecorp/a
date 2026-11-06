// The personal profile a guest brings (atome/src/shared/profile_sharing.js
// `personalProfileFromProperties`, `mergeGuestProfileProperties`, ported for the server's
// adoption): only the personal fields, never authentication, permissions or preferences, and
// only into the fields the account has left empty.
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

// `PERSONAL_PROFILE_PATHS`.
const PATHS: [&str; 15] = [
    "name",
    "first_name",
    "nickname",
    "phone",
    "email",
    "user_face",
    "display_name_source",
    "custom_fields",
    "bio.birth",
    "bio.weight",
    "bio.height",
    "bio.biometrics",
    "profile.competences",
    "profile.passions",
    "profile.experiences",
];

/// `readPath`: `owner?.[part]` along the path.
fn read_path<'a>(value: &'a JsonValue, path: &str) -> Option<&'a JsonValue> {
    path.split('.')
        .try_fold(value, |owner, part| owner.get(part))
}

/// `a ?? b`: `b` when `a` is null or absent.
fn defined<'a>(
    value: Option<&'a JsonValue>,
    otherwise: Option<&'a JsonValue>,
) -> Option<&'a JsonValue> {
    value.filter(|value| !value.is_null()).or(otherwise)
}

/// `writePath` (a strict module): the parent made when falsy (the paths hold one parent at
/// most); a primitive takes no property, as JavaScript throws, and an array keeps one JSON
/// never writes.
fn write_path(
    profile: &mut JsonMap<String, JsonValue>,
    path: &str,
    item: JsonValue,
) -> Result<(), String> {
    let Some((parent, last)) = path.split_once('.') else {
        profile.insert(path.into(), item);
        return Ok(());
    };
    let slot = profile.entry(parent).or_insert(JsonValue::Null);
    if !js::truthy(Some(slot)) {
        *slot = json!({});
    }
    match slot {
        JsonValue::Object(map) => {
            map.insert(last.into(), item);
            Ok(())
        }
        JsonValue::Array(_) => Ok(()),
        other => Err(no_property(other, last)),
    }
}

// V8's TypeError for a property set on a primitive in strict mode.
fn no_property(owner: &JsonValue, key: &str) -> String {
    let kind = match owner {
        JsonValue::String(_) => "string",
        JsonValue::Bool(_) => "boolean",
        _ => "number",
    };
    format!(
        "Cannot create property '{key}' on {kind} '{}'",
        js::text(Some(owner))
    )
}

/// `personalValue`: labelled items cleaned, a text trimmed, anything else empty.
fn personal_value(value: Option<&JsonValue>) -> JsonValue {
    let text = |item: &JsonValue, key: &str| {
        let value = item.get(key).filter(|value| js::truthy(Some(value)));
        js::trim(&value.map(|value| js::text(Some(value))).unwrap_or_default()).to_string()
    };
    match value {
        Some(JsonValue::Array(items)) => JsonValue::Array(
            items
                .iter()
                .filter(|item| item.is_object() || item.is_array())
                .map(|item| {
                    let mut kept = JsonMap::new();
                    kept.insert("label".into(), json!(text(item, "label")));
                    kept.insert("value".into(), json!(text(item, "value")));
                    if item.get("pro") == Some(&JsonValue::Bool(true)) {
                        kept.insert("pro".into(), json!(true));
                    }
                    kept
                })
                .filter(|item| item["label"] != "" || item["value"] != "")
                .map(JsonValue::Object)
                .collect(),
        ),
        Some(JsonValue::String(text)) => json!(js::trim(text)),
        _ => json!(""),
    }
}

/// `emptyValue`.
fn empty(value: Option<&JsonValue>) -> bool {
    match value {
        None | Some(JsonValue::Null) => true,
        Some(JsonValue::String(text)) => js::trim(text).is_empty(),
        Some(JsonValue::Array(items)) => items.is_empty(),
        Some(_) => false,
    }
}

/// `personalProfileFromProperties({ eve_profile: profile })`: the personal fields a guest's
/// profile holds.
pub(super) fn personal(profile: &JsonValue) -> Result<JsonValue, String> {
    let mut personal = JsonMap::new();
    for path in PATHS {
        let value = personal_value(read_path(profile, path));
        if !empty(Some(&value)) {
            write_path(&mut personal, path, value)?;
        }
    }
    Ok(JsonValue::Object(personal))
}

/// `profileObject`: a stored profile, parsed when it is text, an object or nothing.
fn profile_object(value: Option<&JsonValue>) -> Result<JsonMap<String, JsonValue>, String> {
    let parsed = match value {
        Some(JsonValue::String(text)) => {
            serde_json::from_str(text).map_err(|error| format!("SyntaxError: {error}"))?
        }
        Some(value) => value.clone(),
        None => JsonValue::Null,
    };
    Ok(match parsed {
        JsonValue::Object(map) => map,
        _ => JsonMap::new(),
    })
}

/// `mergeGuestProfileProperties(target, guest)`: the account's properties to set, the guest's
/// personal fields only where the account has none; none when nothing changes.
pub(super) fn merged(target: &JsonValue, guest: &JsonValue) -> Result<Option<JsonValue>, String> {
    let original = JsonValue::Object(profile_object(target.get("eve_profile"))?);
    let mut profile = original.clone();
    let mut props = JsonMap::new();
    for path in PATHS {
        let value = personal_value(read_path(guest, path));
        let current = if path == "user_face" {
            defined(target.get("user_face"), profile.get("user_face"))
        } else {
            defined(read_path(&profile, path), target.get(path))
        };
        // `profile.firstname || target.firstname || target.firstName`.
        let legacy = (path == "first_name").then(|| {
            [profile.get("firstname"), target.get("firstname")]
                .into_iter()
                .find(|value| js::truthy(*value))
                .unwrap_or(target.get("firstName"))
        });
        if !empty(current)
            || !empty(target.get(path))
            || !empty(legacy.flatten())
            || empty(Some(&value))
        {
            continue;
        }
        if path == "user_face" {
            props.insert(path.into(), value);
            continue;
        }
        if let JsonValue::Object(map) = &mut profile {
            write_path(map, path, value.clone())?;
        }
        if ["name", "first_name", "nickname", "email"].contains(&path) {
            props.insert(path.into(), value.clone());
        }
        if path == "first_name" {
            props.insert("firstname".into(), value.clone());
            props.insert("firstName".into(), value);
        }
    }
    if props.is_empty() && profile == original {
        return Ok(None);
    }
    // A photo left in the stored profile becomes the account's own property.
    if js::truthy(profile.get("user_face"))
        && !js::truthy(target.get("user_face"))
        && !js::truthy(props.get("user_face"))
    {
        props.insert("user_face".into(), profile["user_face"].clone());
    }
    if let JsonValue::Object(map) = &mut profile {
        map.shift_remove("user_face");
    }
    props.insert("eve_profile".into(), profile);
    Ok(Some(JsonValue::Object(props)))
}
