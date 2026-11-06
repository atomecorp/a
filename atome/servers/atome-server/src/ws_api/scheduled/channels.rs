// The live send paths a scheduled send leaves by (server/scheduled_send_channels.js, ported), run
// by the server in its owner's name: the News publication, a direct message (its attachments
// shared first, as the live send does), the social publish prepared at its time, and the update
// of a post it published. Each notice reaches its person live or waits in their queue
// (social/live.rs), then is pushed to their devices, its outcome reaching nobody.
use super::super::WsApi;
use crate::social::live;
use crate::social::push::Audience;
use crate::social::sharing::Effect;
use crate::vault_router::js;
use atome_store::intent::js_stringify;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

async fn pushed(ws_api: &WsApi, target: &str, push: &JsonValue) {
    let _ = ws_api
        .social
        .push
        .deliver(target, push, &Audience::default())
        .await;
}

/// `newsPublish(ownerId, entry)`: `{ publication, tags?, audience? }`, as the owner's own publish.
pub async fn news(ws_api: &WsApi, owner: &str, entry: &JsonValue) -> Result<JsonValue, String> {
    let mut notices = Vec::new();
    let published = ws_api
        .social
        .news
        .publish(owner, entry, &mut notices)
        .await?;
    for notice in &notices {
        live::deliver(&notice.target, &notice.frame).await;
    }
    for notice in &notices {
        if let Some(push) = &notice.push {
            pushed(ws_api, &notice.target, push).await;
        }
    }
    Ok(published)
}

// `entry.toUserId || null`.
fn or_null(entry: &JsonValue, key: &str) -> JsonValue {
    entry
        .get(key)
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(JsonValue::Null)
}

/// `sendMessage(ownerId, entry)`: `{ toUserId | toPhone, message (the envelope's text), share? }`,
/// the share of its attachments asked first and named in its envelope; the message's id.
pub async fn message(ws_api: &WsApi, owner: &str, entry: &JsonValue) -> Result<JsonValue, String> {
    let social = &ws_api.social;
    let mut message = entry.get("message").cloned().unwrap_or(JsonValue::Null);
    if let Some(share) = entry.get("share").filter(|share| js::truthy(Some(share))) {
        let mut asked = share.as_object().cloned().unwrap_or_default();
        asked.insert("targetUserId".into(), or_null(entry, "toUserId"));
        asked.insert("targetPhone".into(), or_null(entry, "toPhone"));
        let mut effects = Vec::new();
        let shared = social
            .sharing
            .request(owner, &JsonValue::Object(asked), &mut effects)
            .await?;
        for effect in effects {
            match effect {
                Effect::Tell(target, payload) => {
                    live::tell(&target, &payload).await;
                }
                Effect::Notice(notice) => {
                    live::deliver(&notice.target, &notice.frame).await;
                    if let Some(push) = &notice.push {
                        pushed(ws_api, &notice.target, push).await;
                    }
                }
            }
        }
        let row = shared
            .pointer("/requests/0")
            .filter(|row| js::truthy(Some(row)))
            .ok_or("scheduled_share_failed")?;
        let mut envelope: JsonValue = serde_json::from_str(&js::text(Some(&message)))
            .map_err(|error| format!("SyntaxError: {error}"))?;
        let params = envelope
            .get_mut("params")
            .and_then(JsonValue::as_object_mut)
            .ok_or("scheduled_message_envelope_invalid")?;
        params.insert("kind".into(), json!("share-request"));
        params.insert("requestId".into(), row["share_id"].clone());
        params.insert("requestAtomeId".into(), row["atome_id"].clone());
        message = json!(js_stringify(&envelope));
    }
    let mut data = JsonMap::new();
    for key in ["toUserId", "toPhone"] {
        if let Some(value) = entry.get(key) {
            data.insert(key.into(), value.clone());
        }
    }
    data.insert("message".into(), message);
    let sent = social
        .messages
        .send(&social.stack, owner, &JsonValue::Object(data))
        .await?;
    if let Some(frame) = &sent.deliver {
        live::deliver(&sent.target, frame).await;
    }
    if let Some(push) = &sent.push {
        pushed(ws_api, &sent.target, push).await;
    }
    let id = sent
        .result
        .get("message_id")
        .filter(|id| js::truthy(Some(id)))
        .cloned()
        .unwrap_or(JsonValue::Null);
    Ok(json!({ "message_id": id }))
}

// What the server finishes itself: a direct publication, or a file sent to the network's inbox.
fn served(delivery: &JsonValue) -> bool {
    delivery["route"] == "direct" || delivery["transfer"] == "provider_inbox"
}

/// `socialPublish(ownerId, social)`: `{ content, destinations, options: { tiktok } }`, prepared at
/// its time (the content as it stands then, Q2), then published where the server reaches the
/// network; a destination only the person can finish (the share sheet, an export, copied text) is
/// told as such, never left ready. The deliveries, in the order prepared.
pub async fn social_publish(
    ws_api: &Arc<WsApi>,
    owner: &str,
    social: &JsonValue,
) -> Result<JsonValue, String> {
    let providers = &ws_api.providers;
    let mut asked = JsonMap::new();
    if let Some(content) = social.get("content") {
        asked.insert("content".into(), content.clone());
    }
    if let Some(destinations) = social.get("destinations") {
        asked.insert("destinations".into(), destinations.clone());
    }
    asked.insert("handoff".into(), json!({ "system_share": false }));
    let prepared = providers
        .social_action(
            owner,
            ws_api.files(),
            "social.prepare",
            &JsonValue::Object(asked),
        )
        .await
        .map_err(|failure| failure.message)?;
    let deliveries = prepared["deliveries"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let direct: Vec<JsonValue> = deliveries
        .iter()
        .filter(|delivery| delivery["status"] != "failed" && served(delivery))
        .map(|delivery| {
            let mut asked = json!({ "id": delivery["destination"] });
            if delivery["network"] == "tiktok" && delivery["route"] == "direct" {
                asked["options"] = social
                    .pointer("/options/tiktok")
                    .filter(|options| js::truthy(Some(options)))
                    .cloned()
                    .unwrap_or_else(|| json!({}));
            }
            asked
        })
        .collect();
    let published = if direct.is_empty() {
        Vec::new()
    } else {
        let asked = json!({ "job_id": prepared["job_id"], "deliveries": direct });
        let answer = providers
            .social_action(owner, ws_api.files(), "social.publish", &asked)
            .await
            .map_err(|failure| failure.message)?;
        answer["deliveries"].as_array().cloned().unwrap_or_default()
    };
    let told = deliveries.into_iter().map(|mut delivery| {
        if let Some(fields) = delivery.as_object_mut() {
            fields.shift_remove("preview");
        }
        if let Some(found) = published
            .iter()
            .find(|entry| entry["destination"] == delivery["destination"])
        {
            return found.clone();
        }
        if delivery["status"] != "failed" {
            delivery["status"] = json!("failed");
            delivery["error"] = json!("social_needs_person");
        }
        delivery
    });
    Ok(JsonValue::Array(told.collect()))
}

/// `socialUpdate(ownerId, social, parentDeliveries)`: `{ text, destinations }`, each post its
/// parent published taking the text, where its network edits one.
pub async fn social_update(
    ws_api: &Arc<WsApi>,
    owner: &str,
    social: &JsonValue,
    parent: &[JsonValue],
) -> Result<JsonValue, String> {
    let destinations = social["destinations"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let posts: Vec<(String, Option<JsonValue>)> = destinations
        .iter()
        .map(|destination| {
            let published = parent.iter().find(|entry| {
                &entry["destination"] == destination && entry["status"] == "published"
            });
            (
                js::text(Some(destination)),
                published.and_then(|entry| entry.get("remote")).cloned(),
            )
        })
        .collect();
    let text = js::text(social.get("text"));
    let outcomes = ws_api
        .providers
        .social_updates(owner, ws_api.files(), &posts, &text)
        .await
        .map_err(|failure| failure.message)?;
    let told = posts.iter().zip(outcomes).map(|((destination, _), outcome)| {
        let network = destination.split(':').next().unwrap_or("");
        match outcome {
            Ok(_) => json!({ "destination": destination, "network": network, "status": "published" }),
            Err(code) => {
                let code = if code.is_empty() {
                    "social_provider_unavailable".to_string()
                } else {
                    code
                };
                json!({ "destination": destination, "network": network, "status": "failed", "error": code })
            }
        }
    });
    Ok(JsonValue::Array(told.collect()))
}
