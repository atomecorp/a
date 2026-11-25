// A share's rights and property lists (atome/src/shared/share_rights.js, ported): the
// capabilities under every historical spelling, a role named by its rights, never more granted
// than held, stored under their `can_*` names.
//
// `listen` (R-349, a project shared live at « Écoute »): the project's light proxy alone — the
// project atome itself (its name) and the media atome marking itself its proxy
// (`properties.proxy_of` = the project's id, vault_router/shares.rs#reaches), never its
// tracks. `read` holds it too (whoever reads a project hears its proxy): a share holding `listen`
// without `read` is a listener. It is a capability like the others, so that a re-share and a
// restriction (`attenuated`) never widen it. The client's own model (share_rights.js) keeps its
// six, the Communication panel's toggles: it never names `listen`, which `read` brings along.
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub const CAPABILITIES: [&str; 7] = [
    "read", "write", "create", "delete", "reshare", "manage", "listen",
];

const SPELLINGS: [&[&str]; 7] = [
    &["read", "can_read"],
    &["write", "can_write", "alter"],
    &["create", "can_create"],
    &["delete", "can_delete"],
    &["reshare", "share", "can_share", "can_reshare"],
    &["manage", "can_manage"],
    &["listen", "can_listen"],
];

const ROLES: [(&str, &[&str]); 5] = [
    ("listener", &["listen"]),
    ("viewer", &["read", "listen"]),
    ("contributor", &["read", "create", "listen"]),
    ("editor", &["read", "write", "create", "delete", "listen"]),
    (
        "coowner",
        &[
            "read", "write", "create", "delete", "reshare", "manage", "listen",
        ],
    ),
];

/// The capabilities, in their order.
pub type Rights = [bool; 7];

pub const OWNER: Rights = [true; 7];
const READ: usize = 0;
const WRITE: usize = 1;
const LISTEN: usize = 6;

/// `normalizeRights`: a capability is on under any of its spellings, as `true` or `1`; `read`
/// brings `listen` along.
pub fn normalized(value: &JsonValue) -> Rights {
    let on = |key: &&str| match value.get(*key) {
        Some(JsonValue::Bool(flag)) => *flag,
        Some(JsonValue::Number(number)) => number.as_f64() == Some(1.0),
        _ => false,
    };
    let mut rights = SPELLINGS.map(|keys| keys.iter().any(on));
    rights[LISTEN] |= rights[READ];
    rights
}

/// Nothing beyond reading (a list sent read only, a conversation's recording): none of write,
/// create, delete, reshare, manage.
pub fn reads_only(rights: Rights) -> bool {
    rights[WRITE..LISTEN].iter().all(|on| !on)
}

/// A project shared live's access level (R-349), its « Accès » palette: `write` (they work on it
/// together), `read` (it opens in Consultation), `listen` (its proxy alone), else `none`.
pub fn access(rights: Rights) -> &'static str {
    if rights[WRITE] {
        "write"
    } else if rights[READ] {
        "read"
    } else if rights[LISTEN] {
        "listen"
    } else {
        "none"
    }
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
        "can_delete": rights[3], "can_share": rights[4], "can_manage": rights[5],
        "can_listen": rights[6] })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_three_access_levels_of_a_project_shared_live() {
        let listen = normalized(&json!({ "listen": true }));
        let read = normalized(&json!({ "read": true }));
        let write =
            normalized(&json!({ "read": true, "write": true, "create": true, "delete": true }));
        assert_eq!(
            (access(listen), access(read), access(write)),
            ("listen", "read", "write")
        );
        assert_eq!(
            (role(listen), role(read), role(write)),
            ("listener", "viewer", "editor")
        );
        assert_eq!(access(normalized(&json!({}))), "none");
        // Stored and read again, a listener stays one.
        assert_eq!(normalized(&stored(listen)), listen);
        assert!(reads_only(listen) && reads_only(read) && !reads_only(write));
    }

    #[test]
    fn a_listener_never_passes_on_more_than_listening() {
        // A restriction, or a re-share asking to read, never widens what a listener holds.
        let held = normalized(&json!({ "listen": true }));
        assert_eq!(access(attenuated(held, OWNER)), "listen");
        assert_eq!(
            access(attenuated(OWNER, normalized(&json!({ "listen": true })))),
            "listen"
        );
        assert_eq!(
            access(attenuated(normalized(&json!({ "read": true })), held)),
            "listen"
        );
    }
}
