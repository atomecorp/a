// A server notice to one person (server/communication_delivery.js `deliverNotification`):
// pushed onto their notification stack, under the same `eve-comm-share` envelope as a
// message, so the client has one path. What is left to its caller is the live frame
// (Fastify's connections, else its queue) and the push to the person's devices, sent once
// the answer has left.
use super::NotificationStack;
use crate::auth::accounts;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

/// One stored notice: `frame` to deliver live to `target`, `push` the stored notice to push.
pub struct Notice {
    pub target: String,
    pub id: String,
    pub frame: JsonValue,
    pub push: Option<JsonValue>,
}

impl Notice {
    /// What a caller outside `/ws/api` (a SERVICE frame) is handed to carry.
    pub fn carried(&self) -> JsonValue {
        json!({ "target": self.target, "frame": self.frame, "push": self.push })
    }
}

// A destructured field's default: only for an absent key (`undefined`), never for null.
fn field(notification: &JsonValue, key: &str, default: JsonValue) -> JsonValue {
    notification.get(key).cloned().unwrap_or(default)
}

impl NotificationStack {
    /// `deliverNotification(target, sender, { kind, message, subject, publication, id, extra })`.
    pub async fn notice(
        &self,
        target: &str,
        sender: Option<&str>,
        notification: &JsonValue,
    ) -> Result<Notice, String> {
        let account = match sender {
            Some(sender) => {
                let sender = sender.to_string();
                self.central
                    .transaction(move |db| accounts::find_by_id(db, &sender))
                    .await
                    .ok()
                    .flatten()
            }
            None => None,
        };
        let name = account
            .as_ref()
            .map(|user| user["username"].clone())
            .filter(|name| !name.is_null())
            .unwrap_or(JsonValue::Null);
        let phone = account
            .as_ref()
            .and_then(|user| user.get("phone"))
            .filter(|phone| js::truthy(Some(phone)))
            .map(|phone| json!(js::string(phone)))
            .unwrap_or(JsonValue::Null);
        let timestamp = atome_store::append::iso_now();
        let kind = field(notification, "kind", JsonValue::Null);
        let id = match notification.get("id") {
            Some(id) if js::truthy(Some(id)) => js::string(id),
            _ => format!(
                "{}_{}_{}",
                js::string(&kind),
                chrono::Utc::now().timestamp_millis(),
                &uuid::Uuid::new_v4().simple().to_string()[..6]
            ),
        };
        let subject = field(notification, "subject", JsonValue::Null);
        let message = field(notification, "message", json!(""));
        let publication = field(notification, "publication", JsonValue::Null);
        let extra = match notification.get("extra") {
            Some(JsonValue::Object(extra)) => extra.clone(),
            _ => JsonMap::new(),
        };
        let atome_ids = [extra.get("atomeIds"), extra.get("atome_ids")]
            .into_iter()
            .flatten()
            .find(|ids| js::truthy(Some(ids)))
            .cloned()
            .unwrap_or_else(|| json!([]));
        let from_id = sender.map_or(json!(""), |sender| json!(sender));
        let mut params = JsonMap::new();
        for (key, value) in [
            ("id", json!(id)),
            ("date", json!(timestamp)),
            ("kind", kind.clone()),
            ("subject", subject.clone()),
            ("message", message.clone()),
            ("fromId", from_id.clone()),
            (
                "fromName",
                if name.is_null() {
                    json!("")
                } else {
                    name.clone()
                },
            ),
            ("fromPhone", phone.clone()),
            ("publication", publication.clone()),
        ] {
            params.insert(key.into(), value);
        }
        params.extend(extra.clone());
        params.insert("atomeIds".into(), atome_ids.clone());
        let mut stored = JsonMap::new();
        for (key, value) in [
            ("id", json!(id)),
            ("message_id", json!(id)),
            ("command", json!("eve-comm-share")),
            ("kind", kind),
            ("subject", subject),
            ("message", message),
            ("from_id", from_id.clone()),
            ("from_name", name.clone()),
            ("from_phone", phone.clone()),
            ("to_user_id", json!(target)),
            ("timestamp", json!(timestamp)),
            ("unread", json!(true)),
            ("box", json!("inbox")),
            ("publication", publication),
        ] {
            stored.insert(key.into(), value);
        }
        stored.extend(extra);
        stored.insert("atome_ids".into(), atome_ids);
        let stacked = self.push(target, JsonValue::Object(stored), 200).await?;
        if stacked["ok"] != true {
            return Err(match stacked.get("error") {
                Some(error) if js::truthy(Some(error)) => js::string(error),
                _ => "communication_notification_commit_failed".into(),
            });
        }
        let envelope = json!({ "command": "eve-comm-share", "params": params });
        let frame = json!({ "type": "console-message", "message": atome_store::intent::js_stringify(&envelope),
            "from": { "userId": if from_id == json!("") { JsonValue::Null } else { from_id }, "username": name, "phone": phone },
            "to": { "userId": target }, "timestamp": timestamp });
        Ok(Notice {
            target: target.to_string(),
            id,
            frame,
            push: stacked.get("notification").cloned(),
        })
    }
}
