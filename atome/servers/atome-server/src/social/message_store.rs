// A person's correspondence (server/communication_messages.js, ported): each message is
// an Atome of each participant's own vault, its id and its event's id derived from
// (owner, message id) so a retry appends nothing. Media stay references to their
// permission-owned Atomes. A conversation is read from the vault (`communication:list`),
// after the messages the central database still held from before the vaults are copied
// into the reader's vault once each.
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use sha2::{Digest, Sha256};

fn identity(owner: &str, id: &str) -> String {
    Sha256::digest(json!([owner, id]).to_string().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn local_id(owner: &str, id: &str) -> String {
    format!("message_{}", identity(owner, id))
}

// `typeof value === 'string' && value.trim() && value.length <= 200`.
fn contact(value: Option<&JsonValue>) -> Result<String, String> {
    match value.and_then(JsonValue::as_str) {
        Some(text) if !js::trim(text).is_empty() && text.encode_utf16().count() <= 200 => {
            Ok(text.to_string())
        }
        _ => Err("conversation_contact_invalid".into()),
    }
}

/// `persistCommunicationMessage`: the message as `owner`'s Atome, `type` and `kind` 'message'.
pub async fn persist(
    router: &VaultRouter,
    owner: &str,
    properties: &JsonValue,
) -> Result<JsonValue, String> {
    let id = js::string(&properties["message_id"]);
    let mut props = properties.as_object().cloned().unwrap_or_default();
    props.insert("type".into(), json!("message"));
    props.insert("kind".into(), json!("message"));
    let event = json!({ "id": format!("message_event_{}", identity(owner, &id)), "atome_id": local_id(owner, &id),
        "kind": "set", "payload": { "scope": "global", "props": props },
        "actor": { "type": "user", "id": owner }, "source": "communication.delivery" });
    router.commit(owner, &event, &json!({})).await
}

/// `readPersistedCommunicationMessage`: the message's properties in `owner`'s vault.
pub async fn read(
    router: &VaultRouter,
    owner: &str,
    message_id: &str,
) -> Result<Option<JsonValue>, String> {
    let state = router
        .get_state(owner, &json!(local_id(owner, message_id)))
        .await?;
    Ok(state
        .get("properties")
        .filter(|props| js::truthy(Some(props)))
        .cloned())
}

// The messages between `user` and `contact` the central database held, as its query read them.
async fn central_messages(
    central: &Central,
    user: &str,
    contact: &str,
) -> Result<Vec<JsonValue>, String> {
    let rows = central
        .all(
            "SELECT s.atome_id, s.properties, COALESCE(json_extract(s.properties, '$.timestamp'), s.updated_at) AS timestamp
             FROM state_current s JOIN atomes a ON a.atome_id = s.atome_id
             WHERE a.atome_type = 'message' AND a.deleted_at IS NULL AND (a.owner_id = ? OR a.creator_id = ?)
             AND ((json_extract(s.properties, '$.from_id') = ? AND json_extract(s.properties, '$.to_user_id') = ?)
             OR (json_extract(s.properties, '$.from_id') = ? AND json_extract(s.properties, '$.to_user_id') = ?))"
                .into(),
            vec![json!(user), json!(user), json!(user), json!(contact), json!(contact), json!(user)],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let mut item = JsonMap::new();
            item.insert("id".into(), row["atome_id"].clone());
            let properties = match &row["properties"] {
                JsonValue::String(text) => serde_json::from_str(text).unwrap_or(JsonValue::Null),
                other => other.clone(),
            };
            if let JsonValue::Object(properties) = properties {
                item.extend(properties);
            }
            item.insert("timestamp".into(), row["timestamp"].clone());
            JsonValue::Object(item)
        })
        .collect())
}

/// `readConversation`: a page of the conversation with `contactId`, each message with the media it carries.
pub async fn conversation(
    router: &VaultRouter,
    central: &Central,
    user: &str,
    data: &JsonValue,
) -> Result<JsonValue, String> {
    let contact = contact(data.get("contactId"))?;
    let limit = js::number_or(data.get("limit"), 30.0)
        .trunc()
        .clamp(1.0, 100.0);
    for mut item in central_messages(central, user, &contact).await? {
        let message_id =
            js::string(js::first(&item, &["message_id", "id"]).unwrap_or(&JsonValue::Null));
        if js::truthy(Some(
            &router
                .get_state(user, &json!(local_id(user, &message_id)))
                .await?,
        )) {
            continue;
        }
        if let Some(fields) = item.as_object_mut() {
            fields.shift_remove("id");
            fields.insert("message_id".into(), json!(message_id));
        }
        persist(router, user, &item).await?;
    }
    let field = |key: &str| data.get(key).cloned().unwrap_or(JsonValue::Null);
    let mut request = json!({ "contactId": contact, "cursor": field("cursor"), "messageId": field("messageId"), "limit": limit as i64 });
    if js::truthy(data.get("listingId")) {
        request["listingId"] = field("listingId");
    }
    let mut page = router.own(user, "communication:list", request).await?;
    let items = page["items"].as_array().cloned().unwrap_or_default();
    let mut read_items = Vec::with_capacity(items.len());
    for mut item in items {
        item["media"] = JsonValue::Array(readable_media(router, user, item.get("atome_ids")).await);
        read_items.push(item);
    }
    page["items"] = JsonValue::Array(read_items);
    Ok(page)
}

/// `deleteConversationMessages`: deleted for their reader only (the other participant keeps theirs).
pub async fn delete(
    router: &VaultRouter,
    user: &str,
    data: &JsonValue,
    contact_id: &str,
) -> Result<JsonValue, String> {
    let contact = contact(Some(&json!(contact_id)))?;
    let mut ids: Vec<String> = Vec::new();
    if data.get("all") == Some(&JsonValue::Bool(true)) {
        let mut cursor = JsonValue::Null;
        loop {
            let page = router
                .own(
                    user,
                    "communication:list",
                    json!({ "contactId": contact, "cursor": cursor, "limit": 100 }),
                )
                .await?;
            for item in page["items"].as_array().into_iter().flatten() {
                let id = js::id(item.get("message_id"));
                if !id.is_empty() {
                    ids.push(id);
                }
            }
            cursor = page
                .get("nextCursor")
                .filter(|next| js::truthy(Some(next)))
                .cloned()
                .unwrap_or(JsonValue::Null);
            if cursor.is_null() {
                break;
            }
        }
    } else {
        for id in data
            .get("messageIds")
            .and_then(JsonValue::as_array)
            .into_iter()
            .flatten()
        {
            let id = js::id(Some(id));
            if !id.is_empty() && !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    if ids.is_empty() || ids.iter().any(|id| id.encode_utf16().count() > 200) {
        return Err("conversation_delete_target_required".into());
    }
    let mut deleted = 0;
    for message_id in ids {
        // Only a message of this conversation, from one participant to the other.
        let Some(message) = read(router, user, &message_id).await? else {
            continue;
        };
        if message.get("from_id") != Some(&json!(contact))
            && message.get("to_user_id") != Some(&json!(contact))
        {
            continue;
        }
        let event = json!({ "id": format!("message_delete_{}", identity(user, &message_id)), "atome_id": local_id(user, &message_id),
            "kind": "delete", "payload": {}, "actor": { "type": "user", "id": user }, "source": "communication.conversation.delete" });
        router.commit(user, &event, &json!({})).await?;
        deleted += 1;
    }
    Ok(json!({ "deleted": deleted }))
}

const MEDIA_FIELDS: [&str; 9] = [
    "media_kind",
    "mime_type",
    "duration",
    "duration_sec",
    "width",
    "height",
    "media_width",
    "media_height",
    "name",
];

// The file route without its query (the owner's media token) or fragment; the reader's client signs it.
fn token_free(value: Option<&JsonValue>) -> String {
    let raw = value
        .filter(|value| js::truthy(Some(value)))
        .map(js::string)
        .unwrap_or_default();
    let raw = js::trim(&raw);
    if raw.is_empty() {
        return String::new();
    }
    let Ok(mut url) = url::Url::parse("http://relative.invalid").and_then(|base| base.join(raw))
    else {
        return String::new();
    };
    url.set_query(None);
    url.set_fragment(None);
    if raw.starts_with('/') {
        url.path().to_string()
    } else {
        url.to_string()
    }
}

// What a participant needs to play the Atomes a message carries, read through the vault (their
// own state, or what a share grants them): ten at most.
async fn readable_media(
    router: &VaultRouter,
    user: &str,
    atome_ids: Option<&JsonValue>,
) -> Vec<JsonValue> {
    let mut media = Vec::new();
    for atome_id in atome_ids
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .take(10)
    {
        let id = js::string(atome_id);
        let Ok(state) = router.get_state(user, &json!(id)).await else {
            continue;
        };
        let properties = state
            .get("properties")
            .filter(|p| p.is_object())
            .cloned()
            .unwrap_or_else(|| json!({}));
        let source = token_free(properties.get("media_url"));
        if !js::truthy(Some(&state)) || source.is_empty() {
            continue;
        }
        let kind = js::first(&state, &["atome_type", "type"])
            .or_else(|| js::first(&properties, &["type"]));
        let mut entry = json!({ "id": id, "type": kind.map(js::string).unwrap_or_default() });
        for key in MEDIA_FIELDS {
            if let Some(value) = properties.get(key).filter(|value| !value.is_null()) {
                entry[key] = value.clone();
            }
        }
        entry["media_url"] = json!(source);
        media.push(entry);
    }
    media
}

/// `persistAcceptedRequestNote`: the note its recipient read becomes the first message of
/// their conversation, in both vaults, dated when it was sent. `peer`: the sender's account.
pub async fn accepted_note(
    router: &VaultRouter,
    owner: &str,
    peer: &JsonValue,
    note: &JsonValue,
    at: &JsonValue,
) -> Result<(), String> {
    let peer_id = js::id(peer.get("user_id"));
    if peer_id.is_empty() {
        return Err("contact_request_sender_unknown".into());
    }
    let message_id = format!(
        "contact_request_{}",
        identity(&peer_id, &format!("{owner}:{}", js::text(Some(at))))
    );
    let timestamp = chrono::DateTime::from_timestamp_millis(js::number(Some(at)) as i64)
        .ok_or("contact_request_time_invalid")?
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let or = |value: Option<&JsonValue>, fallback: JsonValue| {
        value
            .filter(|v| js::truthy(Some(v)))
            .cloned()
            .unwrap_or(fallback)
    };
    let properties = json!({ "message_id": message_id, "from_id": peer_id, "from_name": or(peer.get("username"), json!("")),
        "from_phone": or(peer.get("phone"), JsonValue::Null), "to_user_id": owner, "timestamp": timestamp, "subject": "",
        "message": note, "atome_ids": [], "kind": "message", "request_atome_id": null, "request_id": null, "mode": null,
        "share_type": null, "priority": "normal", "action": { "kind": "conversation", "contactId": peer_id, "messageId": message_id } });
    for (who, box_name) in [(owner, "inbox"), (peer_id.as_str(), "sent")] {
        let mut copy = properties.clone();
        copy["unread"] = json!(false);
        copy["box"] = json!(box_name);
        persist(router, who, &copy).await?;
    }
    Ok(())
}
