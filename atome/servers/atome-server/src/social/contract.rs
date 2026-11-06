// What a notification may carry (atome/src/shared/communication_contract.js, ported):
// a priority among three, and an action that is a reference — a conversation's
// message, or a registered tool with plain data — never code or a URL; a call's mode and how
// long it rings.
use serde_json::{Value as JsonValue, json};

const PRIORITIES: [&str; 3] = ["normal", "priority", "urgent"];
const CALL_MODES: [&str; 2] = ["audio", "visio"];

/// `CALL_RING_TIMEOUT_MS`: how long a placed call rings before it turns to a recording.
pub const CALL_RING_TIMEOUT_MS: i64 = 10_000;

/// `normalizeCallMode`.
pub fn call_mode(value: &JsonValue) -> Result<String, String> {
    match value {
        JsonValue::String(mode) if CALL_MODES.contains(&mode.as_str()) => Ok(mode.clone()),
        _ => Err("communication_call_mode_invalid".into()),
    }
}

/// `normalizeCommunicationPriority`.
pub fn priority(value: Option<&JsonValue>) -> Result<JsonValue, String> {
    match value {
        None | Some(JsonValue::Null) => Ok(json!("normal")),
        Some(JsonValue::String(text)) if PRIORITIES.contains(&text.as_str()) => Ok(json!(text)),
        Some(_) => Err("communication_priority_invalid".into()),
    }
}

// `value.length > 0 && value.length <= 200` of a string.
fn bounded_id(value: Option<&JsonValue>) -> Option<&str> {
    value
        .and_then(JsonValue::as_str)
        .filter(|text| !text.is_empty() && text.encode_utf16().count() <= 200)
}

// The command's input as plain data: 2 000 values at most, 16 levels deep.
fn plain(value: &JsonValue, depth: usize, count: &mut usize) -> Result<(), String> {
    *count += 1;
    if *count > 2000 || depth > 16 {
        return Err("communication_action_invalid".into());
    }
    match value {
        JsonValue::Array(items) => items
            .iter()
            .try_for_each(|item| plain(item, depth + 1, count)),
        JsonValue::Object(fields) => fields
            .values()
            .try_for_each(|item| plain(item, depth + 1, count)),
        _ => Ok(()),
    }
}

/// `normalizeCommunicationAction`.
pub fn action(value: Option<&JsonValue>) -> Result<JsonValue, String> {
    let invalid = || Err("communication_action_invalid".to_string());
    let action = match value {
        None | Some(JsonValue::Null) => return Ok(JsonValue::Null),
        Some(JsonValue::Object(action)) => action,
        Some(_) => return invalid(),
    };
    let kind = action.get("kind").and_then(JsonValue::as_str);
    if kind == Some("conversation")
        && let (Some(contact), Some(message)) = (
            bounded_id(action.get("contactId")),
            bounded_id(action.get("messageId")),
        )
    {
        return Ok(json!({ "kind": "conversation", "contactId": contact, "messageId": message }));
    }
    if kind == Some("command")
        && let Some(tool) = bounded_id(action.get("toolId"))
        && let Some(input) = action.get("input").filter(|input| input.is_object())
    {
        plain(input, 0, &mut 0)?;
        return Ok(json!({ "kind": "command", "toolId": tool, "input": input }));
    }
    invalid()
}
