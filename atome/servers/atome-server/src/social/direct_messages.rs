// Direct messages (server/wsCommunicationOperations.js, ported): guarded and granted their
// priority by message_guard.rs, bounded in rate per sender. The recipient's copy is committed first, then their notification, then the
// sender's copy: stable identities make a retry after a partial delivery harmless, and a
// retry with another content under the same id is refused.
//
// The live delivery (the recipient's connections, or their queue) and the push after the
// answer stay the caller's: `send` returns the frame to deliver and the notice to push.
use super::message_guard::{authorized_priority, book, guard, or};
use super::message_store;
use super::rate::Rate;
use super::{NotificationStack, relations};
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct DirectMessages {
    central: Central,
    router: Arc<VaultRouter>,
    // 30 sends per 10 s per sender.
    rate: Rate,
    // One delivery at a time per (sender, message id).
    in_flight: Mutex<HashMap<(String, String), Arc<tokio::sync::Mutex<()>>>>,
}

/// What a send leaves to its caller: the answer's fields, the frame to deliver to `target`
/// (its connections, or its queue) and the stored notice to push after the answer.
pub struct Sent {
    pub result: JsonValue,
    pub target: String,
    pub deliver: Option<JsonValue>,
    pub push: Option<JsonValue>,
}

impl Sent {
    fn only(result: JsonValue) -> Self {
        Self {
            result,
            target: String::new(),
            deliver: None,
            push: None,
        }
    }
}

impl DirectMessages {
    pub fn new(central: Central, router: Arc<VaultRouter>) -> Self {
        Self {
            central,
            router,
            rate: Rate::new(30, 10_000),
            in_flight: Mutex::new(HashMap::new()),
        }
    }

    async fn account(
        &self,
        by_id: Option<String>,
        by_phone: Option<String>,
    ) -> Result<Option<JsonValue>, String> {
        self.central
            .committed(move |db| {
                if let Some(account) = by_id
                    .map(|id| crate::auth::accounts::find_by_id(db, &id))
                    .transpose()?
                    .flatten()
                {
                    return Ok(Some(account));
                }
                by_phone
                    .map(|number| crate::auth::accounts::find_by_phone(db, &number))
                    .transpose()
                    .map(Option::flatten)
            })
            .await?
    }

    /// The account a message names: `ids` read in order, the first that is truthy, else a number.
    async fn peer(
        &self,
        data: &JsonValue,
        ids: &[&str],
        phone_key: &str,
    ) -> Result<Option<JsonValue>, String> {
        let by_id = js::first(data, ids).map(js::string);
        let by_phone = js::truthy(data.get(phone_key)).then(|| book(data.get(phone_key)));
        self.account(by_id, by_phone).await
    }

    // The sender's shares with the target that a share request may name.
    async fn shared(
        &self,
        owner: &str,
        target: &str,
        params: &JsonMap<String, JsonValue>,
    ) -> Result<bool, String> {
        let rows = self
            .central
            .all(
                "SELECT share_id, atome_id FROM sync_share_requests
                 WHERE owner_id = ? AND principal_id = ? AND status IN ('pending', 'accepted', 'active')
                 AND (expires_at IS NULL OR expires_at > datetime('now'))"
                    .into(),
                vec![json!(owner), json!(target)],
            )
            .await?;
        let ids = params
            .get("atomeIds")
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default();
        let named = |key: &str, field: &str| {
            rows.iter()
                .any(|row| params.get(field).is_some_and(|value| row[key] == *value))
        };
        Ok(!ids.is_empty()
            && ids
                .iter()
                .all(|id| rows.iter().any(|row| row["atome_id"] == *id))
            && (named("share_id", "requestId") || named("atome_id", "requestAtomeId")))
    }

    async fn lock(
        &self,
        owner: &str,
        id: &str,
    ) -> (tokio::sync::OwnedMutexGuard<()>, (String, String)) {
        let key = (owner.to_string(), id.to_string());
        let slot = self
            .in_flight
            .lock()
            .expect("deliveries")
            .entry(key.clone())
            .or_default()
            .clone();
        (slot.lock_owned().await, key)
    }

    fn unlock(&self, guard: tokio::sync::OwnedMutexGuard<()>, key: (String, String)) {
        drop(guard);
        let mut in_flight = self.in_flight.lock().expect("deliveries");
        if in_flight
            .get(&key)
            .is_some_and(|slot| Arc::strong_count(slot) == 1)
        {
            in_flight.remove(&key);
        }
    }

    /// A relation's `accepted` effect (relations.rs): the request's note made the first message.
    pub async fn accepted(&self, effect: &JsonValue) -> Result<(), String> {
        let peer = self
            .account(Some(js::string(&effect["peerId"])), None)
            .await?
            .unwrap_or(JsonValue::Null);
        message_store::accepted_note(
            &self.router,
            &js::string(&effect["ownerId"]),
            &peer,
            &effect["note"],
            &effect["at"],
        )
        .await
    }

    /// A page of `user`'s conversation with the account `data.contactId`, read as it is.
    pub async fn read(&self, user: &str, data: &JsonValue) -> Result<JsonValue, String> {
        message_store::conversation(&self.router, &self.central, user, data).await
    }

    /// One message stored in `owner`'s vault as it is (a sale's, server/shop_messages.js).
    pub async fn persist(&self, owner: &str, properties: &JsonValue) -> Result<JsonValue, String> {
        message_store::persist(&self.router, owner, properties).await
    }

    /// The `conversation` family: a page of the conversation with the account `contactId`
    /// (or `targetPhone`) names, or the deletion of its messages for their reader.
    pub async fn conversation(&self, user: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let peer = self.peer(data, &["contactId"], "targetPhone").await?;
        let peer_id = peer.map(|peer| js::string(&peer["user_id"]));
        if data.get("action") == Some(&json!("delete")) {
            let peer_id = peer_id.ok_or("conversation_contact_invalid")?;
            return message_store::delete(&self.router, user, data, &peer_id).await;
        }
        let Some(peer_id) = peer_id else {
            return Ok(json!({ "items": [], "nextCursor": null }));
        };
        let mut data = data.clone();
        data["contactId"] = json!(peer_id);
        message_store::conversation(&self.router, &self.central, user, &data).await
    }

    /// `sendDirectMessage`: one message from `user`, its envelope in `data.message`, its recipient
    /// `data.toUserId` / `data.toPhone`.
    pub async fn send(
        &self,
        stack: &NotificationStack,
        user: &str,
        data: &JsonValue,
    ) -> Result<Sent, String> {
        let sender = self
            .account(Some(user.to_string()), None)
            .await?
            .ok_or("contact_required")?;
        // Rate and envelope are judged before the recipient: a number without an account
        // answers exactly like an account not yet accepted.
        if !self.rate.allowed(user) {
            return Err("direct_message_rate_limited".into());
        }
        let (kind, mut params, profiles) = guard(data.get("message"), &sender)?;
        let target = self
            .peer(data, &["toUserId", "to_user_id"], "toPhone")
            .await?
            .ok_or("contact_required")?;
        let target = js::string(&target["user_id"]);
        let verdict = {
            let (user, target) = (user.to_string(), target.clone());
            self.central
                .committed(move |db| relations::can_communicate(db, &user, &target))
                .await??
        };
        if verdict["ok"] != true && js::truthy(verdict.get("silent")) {
            return Ok(Sent::only(json!({ "delivered": false, "queued": true })));
        }
        if verdict["ok"] != true {
            return Err(js::text(verdict.get("error")));
        }
        let priority =
            authorized_priority(&self.router, &target, &sender, &params["priority"]).await?;
        params.insert("priority".into(), priority.clone());
        let mut action = json!({ "kind": "conversation", "contactId": user });
        if let Some(id) = params.get("id") {
            action["messageId"] = id.clone();
        }
        params.insert("action".into(), action.clone());
        let delivery_text = json!({ "command": "eve-comm-share", "params": params }).to_string();
        if kind == "share-request" && !self.shared(user, &target, &params).await? {
            return Err("direct_message_share_reference_missing".into());
        }
        let id = match params.get("id") {
            Some(JsonValue::String(id)) if !id.is_empty() && id.encode_utf16().count() <= 200 => {
                id.clone()
            }
            _ => return Err("direct_message_id_required".into()),
        };
        let (guard, key) = self.lock(user, &id).await;
        let sent = self
            .deliver(
                stack,
                user,
                &sender,
                &target,
                &id,
                kind,
                params,
                profiles,
                priority,
                action,
                delivery_text,
            )
            .await;
        self.unlock(guard, key);
        sent
    }

    #[allow(clippy::too_many_arguments)]
    async fn deliver(
        &self,
        stack: &NotificationStack,
        user: &str,
        sender: &JsonValue,
        target: &str,
        id: &str,
        kind: String,
        params: JsonMap<String, JsonValue>,
        profiles: Vec<String>,
        priority: JsonValue,
        action: JsonValue,
        delivery_text: String,
    ) -> Result<Sent, String> {
        let message = or(params.get("message"), or(params.get("text"), json!("")));
        let atome_ids = match params.get("atomeIds") {
            Some(ids @ JsonValue::Array(_)) => ids.clone(),
            _ => json!([]),
        };
        let stored_ids = or(params.get("atomeIds"), json!([]));
        let differs = |stored: &JsonValue, peer_key: &str, peer: &str, ids: &JsonValue| {
            stored.get(peer_key) != Some(&json!(peer))
                || stored.get("message") != Some(&message)
                || or(stored.get("priority"), json!("normal")) != priority
                || stored.get("atome_ids").map(JsonValue::to_string) != Some(ids.to_string())
        };
        if let Some(prior) = message_store::read(&self.router, user, id).await? {
            if differs(&prior, "to_user_id", target, &stored_ids) {
                return Err("direct_message_id_conflict".into());
            }
            return Ok(Sent::only(
                json!({ "duplicate": true, "message_id": id, "receiver_id": target }),
            ));
        }
        let timestamp = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string();
        let field = |key: &str| or(params.get(key), JsonValue::Null);
        let mut properties = json!({ "message_id": id, "from_id": user, "from_name": sender["username"],
            "from_phone": or(sender.get("phone"), JsonValue::Null), "to_user_id": target, "timestamp": timestamp,
            "subject": or(params.get("subject"), json!("")), "message": message, "atome_ids": atome_ids, "kind": kind,
            "request_atome_id": field("requestAtomeId"), "request_id": field("requestId"), "mode": field("shareMode"),
            "share_type": field("shareType"), "unread": true, "box": "inbox", "priority": priority, "action": action });
        // The recipient's copy first: a retry after a partial delivery finds it.
        match message_store::read(&self.router, target, id).await? {
            Some(received) => {
                if differs(&received, "from_id", user, &properties["atome_ids"]) {
                    return Err("direct_message_id_conflict".into());
                }
                properties = received;
            }
            None => {
                message_store::persist(&self.router, target, &properties).await?;
            }
        }
        let mut notice = properties.clone();
        notice["id"] = json!(id);
        let stacked = stack.push(target, notice, 200).await?;
        if stacked["ok"] != true {
            return Err(js::text(stacked.get("error")));
        }
        let mut sent = properties.clone();
        sent["unread"] = json!(false);
        sent["box"] = json!("sent");
        if !profiles.is_empty() {
            sent["profiles"] = json!(profiles);
        }
        message_store::persist(&self.router, user, &sent).await?;
        let frame = json!({ "type": "console-message", "message": delivery_text,
            "from": { "userId": user, "username": sender["username"], "phone": or(sender.get("phone"), JsonValue::Null) },
            "to": { "userId": target }, "timestamp": timestamp });
        Ok(Sent {
            result: json!({ "message_id": id, "sender_id": user, "receiver_id": target }),
            target: target.to_string(),
            deliver: Some(frame),
            push: stacked.get("notification").cloned(),
        })
    }
}
