// A share's rights and property lists (atome/src/shared/share_rights.js, ported): the six
// capabilities under every historical spelling, a role named by its rights, never more granted
// than held, stored under their `can_*` names.
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub const CAPABILITIES: [&str; 6] = ["read", "write", "create", "delete", "reshare", "manage"];

const SPELLINGS: [&[&str]; 6] = [
    &["read", "can_read"],
    &["write", "can_write", "alter"],
    &["create", "can_create"],
    &["delete", "can_delete"],
    &["reshare", "share", "can_share", "can_reshare"],
    &["manage", "can_manage"],
];

const ROLES: [(&str, &[&str]); 4] = [
    ("viewer", &["read"]),
    ("contributor", &["read", "create"]),
    ("editor", &["read", "write", "create", "delete"]),
    (
        "coowner",
        &["read", "write", "create", "delete", "reshare", "manage"],
    ),
];

/// The six capabilities, in their order.
pub type Rights = [bool; 6];

pub const OWNER: Rights = [true; 6];

/// `normalizeRights`: a capability is on under any of its spellings, as `true` or `1`.
pub fn normalized(value: &JsonValue) -> Rights {
    let on = |key: &&str| match value.get(*key) {
        Some(JsonValue::Bool(flag)) => *flag,
        Some(JsonValue::Number(number)) => number.as_f64() == Some(1.0),
        _ => false,
    };
    SPELLINGS.map(|keys| keys.iter().any(on))
}

/// `{ read, write, create, delete, reshare, manage }`.
pub fn object(rights: Rights) -> JsonValue {
    let mut fields = JsonMap::new();
    for (name, on) in CAPABILITIES.iter().zip(rights) {
        fields.insert((*name).into(), json!(on));
    }
    JsonValue::Object(fields)
}

pub fn has(rights: Rights, capability: &str) -> bool {
    CAPABILITIES
        .iter()
        .position(|name| *name == capability)
        .is_some_and(|at| rights[at])
}

/// `roleOfRights`: the first role whose capabilities are exactly these, else `custom`.
pub fn role(rights: Rights) -> &'static str {
    ROLES
        .iter()
        .find(|(_, granted)| {
            CAPABILITIES
                .iter()
                .zip(rights)
                .all(|(name, on)| on == granted.contains(name))
        })
        .map_or("custom", |(role, _)| role)
}

/// `attenuateRights`: what is both held and asked.
pub fn attenuated(held: Rights, wanted: Rights) -> Rights {
    std::array::from_fn(|at| held[at] && wanted[at])
}

/// `toStoredPermissions`.
pub fn stored(rights: Rights) -> JsonValue {
    json!({ "can_read": rights[0], "can_write": rights[1], "can_create": rights[2],
        "can_delete": rights[3], "can_share": rights[4], "can_manage": rights[5] })
}

/// `normalizePropertyList`: an array's distinct non-blank names, `None` for anything else.
pub fn property_list(value: Option<&JsonValue>) -> Option<Vec<String>> {
    let items = value?.as_array()?;
    let mut names: Vec<String> = Vec::new();
    for item in items {
        // `String(entry || '')`: a falsy entry is blank.
        let name = if crate::vault_router::js::truthy(Some(item)) {
            crate::vault_router::js::string(item).trim().to_string()
        } else {
            String::new()
        };
        if !name.is_empty() && !names.contains(&name) {
            names.push(name);
        }
    }
    Some(names)
}

/// `attenuatePropertyList`: never a property the granter's list leaves out.
pub fn attenuated_list(
    held: Option<&JsonValue>,
    wanted: Option<&JsonValue>,
) -> Option<Vec<String>> {
    let (held, wanted) = (property_list(held), property_list(wanted));
    match (held, wanted) {
        (None, wanted) => wanted,
        (held, None) => held,
        (Some(held), Some(wanted)) => Some(
            wanted
                .into_iter()
                .filter(|key| held.contains(key))
                .collect(),
        ),
    }
}
