// The restricted shell's policy (server/shell.js `loadPolicy`, `getUserPolicy`,
// `normalizeUserPolicy`, ported): DEFAULT_POLICY under `server/shell_policy.json` (or
// `SQUIRREL_SHELL_POLICY_PATH`) under the `SQUIRREL_SHELL_*` settings, read at each call as
// Fastify reads them, each field as JavaScript holds it once merged; a per-account policy over
// it. The JavaScript property reads a policy file could turn into a wider access (an inherited
// key such as `constructor` naming a per-account policy, a list written as one string matched
// by substring) are not reproduced: only own keys and real lists count.
use super::shell::{Caller, resolve};
use crate::settings::Settings;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::path::Path;

pub(super) const DEFAULT_ALLOWED: [&str; 8] = [
    "mkdir", "ls", "pwd", "whoami", "touch", "cat", "echo", "stat",
];
pub(super) const DEFAULT_DURATION_MS: f64 = 15000.0;
pub(super) const DEFAULT_OUTPUT_BYTES: f64 = 64.0 * 1024.0;

// The policy's fields as JavaScript holds them once merged (DEFAULT_POLICY, the file, the settings).
pub(super) struct Policy {
    pub(super) enabled: bool,
    pub(super) allow_all_users: bool,
    pub(super) allow_install: bool,
    pub(super) allow_root: bool,
    pub(super) require_token: bool,
    pub(super) allowed_users: JsonValue,
    pub(super) allowed_commands: JsonValue,
    pub(super) install_commands: JsonValue,
    pub(super) user_policies: JsonValue,
    pub(super) user_root: JsonValue,
    pub(super) max_duration_ms: f64,
    pub(super) max_output_bytes: f64,
}

// `normalizeBoolean`.
fn boolean(value: Option<&JsonValue>) -> bool {
    match value {
        Some(JsonValue::Bool(flag)) => *flag,
        Some(JsonValue::Number(number)) => number.as_f64() != Some(0.0),
        Some(JsonValue::String(text)) => {
            let lower = text.to_lowercase();
            text == "1" || lower == "true" || lower == "yes"
        }
        _ => false,
    }
}

// `toList`: a list's items as text, a comma-separated text's items, else none.
fn list(value: Option<&JsonValue>) -> JsonValue {
    let items: Vec<JsonValue> = match value.filter(|value| js::truthy(Some(value))) {
        Some(JsonValue::Array(items)) => items
            .iter()
            .map(|item| js::text(Some(item)))
            .filter(|item| !item.is_empty())
            .map(JsonValue::String)
            .collect(),
        Some(JsonValue::String(text)) => text
            .split(',')
            .map(js::trim)
            .filter(|item| !item.is_empty())
            .map(|item| json!(item))
            .collect(),
        _ => Vec::new(),
    };
    JsonValue::Array(items)
}

// `{ ...value }`: an object's entries, a list's or a text's by index.
fn spread(value: &JsonValue) -> JsonMap<String, JsonValue> {
    match value {
        JsonValue::Object(object) => object.clone(),
        JsonValue::Array(items) => items
            .iter()
            .enumerate()
            .map(|(index, item)| (index.to_string(), item.clone()))
            .collect(),
        JsonValue::String(text) => text
            .encode_utf16()
            .enumerate()
            .map(|(index, unit)| (index.to_string(), json!(String::from_utf16_lossy(&[unit]))))
            .collect(),
        _ => JsonMap::new(),
    }
}

// `process.env[name]` when truthy: set and not empty.
pub(super) fn truthy_setting(settings: &Settings, name: &str) -> Option<String> {
    settings.value(name).filter(|value| !value.is_empty())
}

// `filePolicy.<name>`, which throws on a file that holds `null`.
fn file_field<'a>(file: &'a JsonValue, name: &str) -> Result<Option<&'a JsonValue>, String> {
    match file {
        JsonValue::Null => Err(format!("Cannot read properties of null (reading '{name}')")),
        JsonValue::Object(object) => Ok(object.get(name)),
        _ => Ok(None),
    }
}

// `loadPolicy`.
pub(super) fn load(settings: &Settings, project_root: &Path) -> Result<Policy, String> {
    let file = match truthy_setting(settings, "SQUIRREL_SHELL_POLICY_PATH") {
        Some(path) => resolve(project_root, &path),
        None => project_root.join("server").join("shell_policy.json"),
    };
    let file: JsonValue = std::fs::read_to_string(&file)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| json!({}));
    let own = |name: &str| {
        file.as_object()
            .and_then(|object| object.get(name))
            .cloned()
    };
    let flag = |setting: &str, name: &str| match settings.value(setting) {
        Some(text) => Ok(boolean(Some(&json!(text)))),
        None => file_field(&file, name).map(boolean),
    };
    // `Number(setting || file[name] || fallback)`.
    let number = |setting: &str, name: &str, fallback: f64| -> Result<f64, String> {
        if let Some(text) = truthy_setting(settings, setting) {
            return Ok(js::number(Some(&json!(text))));
        }
        Ok(
            match file_field(&file, name)?.filter(|value| js::truthy(Some(value))) {
                Some(value) => js::number(Some(value)),
                None => fallback,
            },
        )
    };
    let enabled = flag("SQUIRREL_SHELL_ENABLED", "enabled")?;
    let allow_all_users = flag("SQUIRREL_SHELL_ALLOW_ALL_USERS", "allowAllUsers")?;
    let allow_install = flag("SQUIRREL_SHELL_ALLOW_INSTALL", "allowInstall")?;
    let allow_root = flag("SQUIRREL_SHELL_ALLOW_ROOT", "allowRoot")?;
    let require_token = flag("SQUIRREL_SHELL_REQUIRE_TOKEN", "requireToken")?;
    let user_root = match truthy_setting(settings, "SQUIRREL_SHELL_USER_ROOT") {
        Some(root) => json!(root),
        None => file_field(&file, "userRoot")?
            .filter(|root| js::truthy(Some(root)))
            .cloned()
            .unwrap_or_else(|| json!("data/users")),
    };
    let max_duration_ms = number(
        "SQUIRREL_SHELL_MAX_DURATION_MS",
        "maxDurationMs",
        DEFAULT_DURATION_MS,
    )?;
    let max_output_bytes = number(
        "SQUIRREL_SHELL_MAX_OUTPUT_BYTES",
        "maxOutputBytes",
        DEFAULT_OUTPUT_BYTES,
    )?;
    file_field(&file, "userPolicies")?;
    let listed = |setting: &str| {
        let items = list(settings.value(setting).map(JsonValue::String).as_ref());
        items
            .as_array()
            .is_some_and(|items| !items.is_empty())
            .then_some(items)
    };
    let mut user_policies = own("userPolicies").unwrap_or_else(|| json!({}));
    let parsed = settings
        .value("SQUIRREL_SHELL_USER_POLICIES")
        .filter(|text| !text.is_empty())
        .and_then(|text| serde_json::from_str::<JsonValue>(&text).ok())
        .filter(|parsed| parsed.is_object() || parsed.is_array());
    if let Some(parsed) = parsed {
        let mut merged = if js::truthy(Some(&user_policies)) {
            spread(&user_policies)
        } else {
            JsonMap::new()
        };
        merged.extend(spread(&parsed));
        user_policies = JsonValue::Object(merged);
    }
    Ok(Policy {
        enabled,
        allow_all_users,
        allow_install,
        allow_root,
        require_token,
        allowed_users: listed("SQUIRREL_SHELL_ALLOWED_USERS")
            .or_else(|| own("allowedUsers"))
            .unwrap_or_else(|| json!([])),
        allowed_commands: listed("SQUIRREL_SHELL_ALLOWED_COMMANDS")
            .or_else(|| own("allowedCommands"))
            .unwrap_or_else(|| json!(DEFAULT_ALLOWED)),
        install_commands: listed("SQUIRREL_SHELL_INSTALL_COMMANDS")
            .or_else(|| own("installCommands"))
            .unwrap_or(JsonValue::Null),
        user_policies,
        user_root,
        max_duration_ms,
        max_output_bytes,
    })
}

// `getUserPolicy`: the account's own entry by its id, else by its name, when truthy.
pub(super) fn user_policy<'a>(policy: &'a Policy, caller: &Caller) -> Option<&'a JsonValue> {
    let entry = |key: &str| {
        match &policy.user_policies {
            JsonValue::Object(object) => object.get(key),
            JsonValue::Array(items) => key
                .parse::<usize>()
                .ok()
                .filter(|index| index.to_string() == key)
                .and_then(|index| items.get(index)),
            _ => None,
        }
        .filter(|value| js::truthy(Some(value)))
    };
    entry(&caller.id).or_else(|| {
        caller
            .username
            .as_ref()
            .filter(|name| js::truthy(Some(name)))
            .and_then(|name| entry(&js::text(Some(name))))
    })
}

// `normalizeUserPolicy` applied over the policy (`{ ...policy, ...userOverrides }`).
pub(super) fn overridden(policy: &mut Policy, raw: &JsonValue) {
    let Some(raw) = raw.as_object() else {
        return;
    };
    if let Some(value) = raw.get("allowedCommands") {
        policy.allowed_commands = list(Some(value));
    }
    if let Some(value) = raw.get("installCommands") {
        policy.install_commands = list(Some(value));
    }
    if let Some(value) = raw.get("allowInstall") {
        policy.allow_install = boolean(Some(value));
    }
    if let Some(value) = raw.get("allowRoot") {
        policy.allow_root = boolean(Some(value));
    }
    if let Some(value) = raw.get("requireToken") {
        policy.require_token = boolean(Some(value));
    }
    if let Some(value) = raw.get("maxDurationMs") {
        policy.max_duration_ms = js::number(Some(value));
    }
    if let Some(value) = raw.get("maxOutputBytes") {
        policy.max_output_bytes = js::number(Some(value));
    }
    if let Some(value) = raw.get("userRoot") {
        policy.user_root = json!(js::text(Some(value)));
    }
}

// `list.includes(item)`: a list's text items only (a truthy other value has no `includes`).
pub(super) fn includes(list: &JsonValue, name: &str, item: &str) -> Result<bool, String> {
    match list {
        JsonValue::Array(items) => Ok(items.iter().any(|entry| entry.as_str() == Some(item))),
        JsonValue::String(_) => Ok(false),
        _ => Err(format!("{name}.includes is not a function")),
    }
}
