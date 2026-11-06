// What a direct message may be (server/communication_delivery.js `guardDirectMessage` and
// communication_priority.js, ported): the server rewrites the sender's identity into the
// envelope (never a forged name, never the phone they typed), allows two kinds and bounds
// the size; a priority is granted only from the recipient's own committed favorites.
use super::phone;
use crate::vault_router::VaultRouter;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const MAX_BYTES: usize = 128 * 1024;
const TEXT_MAX: usize = 8000;
// `publication` is no message: only the News broadcast makes one.
const KINDS: [&str; 2] = ["message", "share-request"];

/// `value || fallback`.
pub fn or(value: Option<&JsonValue>, fallback: JsonValue) -> JsonValue {
    value
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(fallback)
}

/// `contactBookPhone(value)`.
pub fn book(value: Option<&JsonValue>) -> String {
    phone::book_phone(&js::id(value))
}

/// `guardDirectMessage`: the rewritten params, their kind, and the life profiles the sender
/// files the message under (kept on the sender's side, never relayed).
pub fn guard(
    raw: Option<&JsonValue>,
    sender: &JsonValue,
) -> Result<(String, JsonMap<String, JsonValue>, Vec<String>), String> {
    let text = raw.and_then(JsonValue::as_str).unwrap_or_default();
    if text.is_empty() {
        return Err("direct_message_empty".into());
    }
    if text.len() > MAX_BYTES {
        return Err("direct_message_too_large".into());
    }
    let command: JsonValue =
        serde_json::from_str(text).map_err(|_| "direct_message_envelope_invalid")?;
    let given = command
        .get("params")
        .filter(|params| js::truthy(Some(params)));
    let mut params = match given {
        None => JsonMap::new(),
        Some(JsonValue::Object(fields)) => fields.clone(),
        Some(JsonValue::Array(items)) => items
            .iter()
            .enumerate()
            .map(|(index, item)| (index.to_string(), item.clone()))
            .collect(),
        Some(_) => return Err("direct_message_envelope_invalid".into()),
    };
    if command.get("command") != Some(&json!("eve-comm-share")) {
        return Err("direct_message_envelope_invalid".into());
    }
    let kind = js::string(&or(params.get("kind"), json!("message")));
    if !KINDS.contains(&kind.as_str()) {
        return Err("direct_message_kind_forbidden".into());
    }
    let body = [params.get("message"), params.get("text")]
        .into_iter()
        .flatten()
        .find(|value| !value.is_null());
    if body
        .and_then(JsonValue::as_str)
        .is_some_and(|body| body.encode_utf16().count() > TEXT_MAX)
    {
        return Err("direct_message_too_large".into());
    }
    params.insert("kind".into(), json!(kind));
    let priority = super::contract::priority(params.get("priority"))?;
    params.insert("priority".into(), priority);
    for key in [
        "action",
        "severity",
        "priorityAuthorized",
        "priority_authorized",
        "system",
    ] {
        params.shift_remove(key);
    }
    let mut profiles: Vec<String> = Vec::new();
    for profile in params
        .get("profiles")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
    {
        let profile = js::id(Some(profile));
        if !profile.is_empty() && !profiles.contains(&profile) {
            profiles.push(profile);
        }
    }
    params.shift_remove("profiles");
    params.insert("fromId".into(), json!(js::id(sender.get("user_id"))));
    params.insert("fromName".into(), or(sender.get("username"), json!("")));
    // The authenticated account's number, so the recipient recognises the person in their book.
    params.shift_remove("fromPhone");
    if js::truthy(sender.get("phone")) {
        params.insert("fromPhone".into(), json!(js::string(&sender["phone"])));
    }
    Ok((kind, params, profiles))
}

// `authorizeCommunicationPriority`: what is not 'normal' needs the sender among the
// recipient's favorites — by their id, by the card they ticked (its owner the recipient),
// or by the number a removed card remembered.
pub async fn authorized_priority(
    router: &VaultRouter,
    recipient: &str,
    sender: &JsonValue,
    priority: &JsonValue,
) -> Result<JsonValue, String> {
    if priority == "normal" {
        return Ok(priority.clone());
    }
    let state = router.get_state(recipient, &json!(recipient)).await?;
    let raw = state
        .pointer("/properties/eve_profile")
        .cloned()
        .unwrap_or(JsonValue::Null);
    let profile = match raw {
        JsonValue::String(text) => serde_json::from_str(&text).map_err(|e| e.to_string())?,
        other => other,
    };
    let favorites = profile
        .pointer("/preferences/contacts/favorites")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    let sender_id = js::id(sender.get("user_id"));
    let number = book(sender.get("phone"));
    for favorite in favorites.iter().filter(|favorite| favorite.is_object()) {
        if favorite["id"].as_str() == Some(sender_id.as_str()) {
            return Ok(priority.clone());
        }
        if !js::truthy(favorite.get("id")) {
            continue;
        }
        let card = router.get_state(recipient, &favorite["id"]).await?;
        if !js::truthy(Some(&card)) {
            if !number.is_empty() && book(favorite.get("phone")) == number {
                return Ok(priority.clone());
            }
            continue;
        }
        let owner = js::first(&card, &["owner_id"])
            .or_else(|| {
                card.get("meta")
                    .and_then(|meta| js::first(meta, &["owner_id"]))
            })
            .or_else(|| js::first(&card, &["vault_principal_id"]));
        if owner.map(js::string).unwrap_or_default() != recipient {
            continue;
        }
        let props = card
            .get("properties")
            .filter(|p| js::truthy(Some(p)))
            .cloned()
            .unwrap_or_else(|| json!({}));
        let mut phones = vec![props.get("phone").cloned().unwrap_or(JsonValue::Null)];
        for entry in props
            .get("phones")
            .and_then(JsonValue::as_array)
            .into_iter()
            .flatten()
        {
            phones.push(
                entry
                    .get("value")
                    .filter(|value| !value.is_null())
                    .cloned()
                    .unwrap_or_else(|| entry.clone()),
            );
        }
        if props["user_id"].as_str() == Some(sender_id.as_str())
            || (!number.is_empty() && phones.iter().any(|value| book(Some(value)) == number))
        {
            return Ok(priority.clone());
        }
    }
    Err("communication_priority_forbidden".into())
}
