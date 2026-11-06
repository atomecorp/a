// A CardDAV contact read into its canonical fields (atome/src/squirrel/contacts/carddav_vcard.js
// `parseVcardData`, ported): one vCard 3.0 or 4.0, its known properties as fields, the others kept as
// extra properties unless they look private.
use atome_calendar::content_lines::{self, Property, decode, split};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const MANAGED: [&str; 18] = [
    "VERSION",
    "UID",
    "FN",
    "N",
    "NICKNAME",
    "ORG",
    "TITLE",
    "ROLE",
    "NOTE",
    "TEL",
    "EMAIL",
    "ADR",
    "URL",
    "BDAY",
    "ANNIVERSARY",
    "PHOTO",
    "CATEGORIES",
    "GENDER",
];

// `normalizeCarddavLabel(params)`: the first TYPE, lower-cased, else `other`.
fn label(property: &Property) -> String {
    let kind = property
        .param("TYPE")
        .filter(|kind| !kind.is_empty())
        .unwrap_or("other");
    kind.split(',').next().unwrap_or_default().to_lowercase()
}

/// `parseVcardData(vcard)`.
pub fn parse(vcard: &str) -> Result<JsonMap<String, JsonValue>, String> {
    let mut components = content_lines::components(vcard, "VCARD")?;
    if components.len() != 1 {
        return Err("vcard_single_contact_required".into());
    }
    let properties = components.remove(0);
    let version = properties
        .iter()
        .find(|property| property.name == "VERSION")
        .map(|property| property.value.clone());
    let version = match version.as_deref() {
        Some(version @ ("3.0" | "4.0")) => version.to_string(),
        _ => return Err("vcard_version_unsupported".into()),
    };
    let mut state = JsonMap::new();
    state.insert("id".into(), JsonValue::Null);
    state.insert("uid".into(), JsonValue::Null);
    for key in [
        "name",
        "first_name",
        "last_name",
        "middle_name",
        "prefix",
        "suffix",
        "nickname",
        "organization",
        "title",
        "role",
        "note",
        "birthday",
        "anniversary",
        "photo",
        "gender",
    ] {
        state.insert(key.into(), json!(""));
    }
    for key in [
        "phones",
        "emails",
        "addresses",
        "urls",
        "categories",
        "extra_properties",
    ] {
        state.insert(key.into(), json!([]));
    }
    state.insert("version".into(), json!(version));
    let push = |state: &mut JsonMap<String, JsonValue>, field: &str, entry: JsonValue| {
        if let Some(JsonValue::Array(list)) = state.get_mut(field) {
            list.push(entry);
        }
    };
    for property in &properties {
        let value = &property.value;
        match property.name.as_str() {
            "UID" => {
                let uid = json!(decode(value));
                state.insert("id".into(), uid.clone());
                state.insert("uid".into(), uid);
            }
            "N" => {
                let parts: Vec<String> =
                    split(value, ';').iter().map(|part| decode(part)).collect();
                for (index, key) in ["last_name", "first_name", "middle_name", "prefix", "suffix"]
                    .iter()
                    .enumerate()
                {
                    state.insert(
                        (*key).into(),
                        json!(parts.get(index).cloned().unwrap_or_default()),
                    );
                }
            }
            "FN" | "NICKNAME" | "ORG" | "TITLE" | "ROLE" | "NOTE" | "BDAY" | "ANNIVERSARY"
            | "GENDER" => {
                let field = match property.name.as_str() {
                    "FN" => "name",
                    "NICKNAME" => "nickname",
                    "ORG" => "organization",
                    "TITLE" => "title",
                    "ROLE" => "role",
                    "NOTE" => "note",
                    "BDAY" => "birthday",
                    "ANNIVERSARY" => "anniversary",
                    _ => "gender",
                };
                state.insert(field.into(), json!(decode(value)));
            }
            "TEL" | "EMAIL" | "URL" => {
                let field = match property.name.as_str() {
                    "TEL" => "phones",
                    "EMAIL" => "emails",
                    _ => "urls",
                };
                let entry = json!({ "label": label(property), "params": property.params_json(), "value": decode(value) });
                push(&mut state, field, entry);
            }
            "ADR" => {
                let values: Vec<String> =
                    split(value, ';').iter().map(|part| decode(part)).collect();
                let entry = json!({ "label": label(property), "params": property.params_json(), "values": values });
                push(&mut state, "addresses", entry);
            }
            "CATEGORIES" => {
                let categories: Vec<String> =
                    split(value, ',').iter().map(|part| decode(part)).collect();
                state.insert("categories".into(), json!(categories));
            }
            "PHOTO" => {
                let encoding = property
                    .param("ENCODING")
                    .unwrap_or_default()
                    .to_lowercase();
                let photo = if encoding == "b" {
                    // TYPE is `JPEG` (vCard 3) or `image/jpeg`; the base64 may be folded.
                    let kind = property
                        .param("TYPE")
                        .filter(|kind| !kind.is_empty())
                        .unwrap_or("jpeg")
                        .to_lowercase();
                    let kind = kind.strip_prefix("image/").unwrap_or(&kind);
                    let kind = if kind == "jpg" { "jpeg" } else { kind };
                    // `/\s+/g`: JavaScript's white space (U+FEFF included, U+0085 not).
                    let data: String = value
                        .chars()
                        .filter(|c| !((c.is_whitespace() && *c != '\u{85}') || *c == '\u{feff}'))
                        .collect();
                    format!("data:image/{kind};base64,{data}")
                } else {
                    value.clone()
                };
                state.insert("photo".into(), json!(photo));
            }
            name if !MANAGED.contains(&name) && !content_lines::private_name(name) => {
                push(&mut state, "extra_properties", property.json())
            }
            _ => {}
        }
    }
    let text = |state: &JsonMap<String, JsonValue>, key: &str| {
        state
            .get(key)
            .and_then(JsonValue::as_str)
            .unwrap_or_default()
            .to_string()
    };
    if text(&state, "name").is_empty() {
        let parts: Vec<String> = ["first_name", "middle_name", "last_name"]
            .iter()
            .map(|key| text(&state, key))
            .filter(|part| !part.is_empty())
            .collect();
        let name = if parts.is_empty() {
            "Contact".to_string()
        } else {
            parts.join(" ")
        };
        state.insert("name".into(), json!(name));
    }
    Ok(state)
}
