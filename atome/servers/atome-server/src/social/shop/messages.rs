// A sale's conversations (server/shop_messages.js, ported; user decisions of 28 Oct. 2026): never
// a public thread, one private conversation between the seller and each person who writes about
// the sale. Each message is an ordinary message Atome of both participants' vaults carrying
// `listing_id`, so it also reads in Communication; its recipient is told « new message », whose
// action (the `shop.open` command) opens the sale's page on that conversation. A buyer writes to
// the seller of a live sale; the seller answers whoever wrote first.
use super::super::directory::Directory;
use super::super::message_store;
use super::{Shop, clip};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const TEXT_MAX: usize = 2000;

// The two ends of a conversation about a sale.
struct Ends {
    row: JsonValue,
    seller: String,
    buyer: String,
}

fn fail(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

impl Shop {
    async fn ends(
        &self,
        user: &str,
        listing_id: &str,
        peer: &str,
    ) -> Result<Result<Ends, &'static str>, String> {
        let Some(row) = self
            .store
            .listing(&js::slice(js::trim(listing_id), 200))
            .await?
        else {
            return Ok(Err("shop_not_found"));
        };
        let seller = js::string(&row["seller_id"]);
        if user == seller {
            if peer.is_empty() || peer == seller {
                return Ok(Err("shop_peer_required"));
            }
            // The seller answers someone who wrote about this sale; never a stranger first.
            let threads = self
                .router
                .own(
                    &seller,
                    "communication:threads",
                    json!({ "listingId": listing_id }),
                )
                .await?;
            let known = threads["items"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|thread| thread["peerId"] == peer);
            if !known {
                return Ok(Err("shop_peer_unknown"));
            }
            return Ok(Ok(Ends {
                row,
                seller,
                buyer: peer.to_string(),
            }));
        }
        if js::truthy(row.get("hidden_at")) {
            return Ok(Err("shop_not_found"));
        }
        Ok(Ok(Ends {
            row,
            seller,
            buyer: user.to_string(),
        }))
    }

    pub(super) async fn send(
        &self,
        directory: &Directory,
        user: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let body = clip(message.get("message"), TEXT_MAX);
        if body.is_empty() {
            return Ok(fail("shop_message_empty"));
        }
        let ends = self
            .ends(
                user,
                &clip(message.get("listingId"), 200),
                &clip(message.get("peerId"), 200),
            )
            .await?;
        let Ends { row, seller, buyer } = match ends {
            Ok(ends) => ends,
            Err(error) => return Ok(fail(error)),
        };
        let target = if user == seller { buyer } else { seller };
        if self.blocked(Some(user), &target).await? {
            return Ok(fail("shop_blocked"));
        }
        let message_id = format!("shop_{}", uuid::Uuid::new_v4());
        let subject = clip(row.get("title"), 80);
        // The page the recipient opens: the sale, on the conversation with the one who wrote.
        let opening = |peer: &str| {
            json!({ "kind": "command", "toolId": "shop.open",
            "input": { "listing_id": row["listing_id"], "peer_id": peer } })
        };
        let action = opening(user);
        let name = Self::name_of(directory, user).await;
        let properties = json!({ "message_id": message_id, "from_id": user, "from_name": clip(Some(&json!(name)), 80),
            "to_user_id": target, "timestamp": js::iso(chrono::Utc::now().timestamp_millis()), "subject": subject,
            "message": body, "atome_ids": [], "kind": "message", "listing_id": row["listing_id"],
            "priority": "normal", "action": action });
        let inbox = js::with(
            &properties,
            [("unread", json!(true)), ("box", json!("inbox"))],
        );
        message_store::persist(&self.router, &target, &inbox).await?;
        let sent = js::with(
            &properties,
            [
                ("unread", json!(false)),
                ("box", json!("sent")),
                ("action", opening(&target)),
            ],
        );
        message_store::persist(&self.router, user, &sent).await?;
        let notification = json!({ "kind": "shop-message", "subject": subject, "message": body, "id": message_id,
            "extra": { "action": action, "listing_id": row["listing_id"] } });
        self.notifier
            .notify(&target, Some(user), &notification)
            .await?;
        Ok(json!({ "ok": true, "messageId": message_id }))
    }

    /// One conversation about a sale (the buyer's with the seller, or the seller's with
    /// `peerId`), newest first.
    pub(super) async fn thread(
        &self,
        user: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let ends = self
            .ends(
                user,
                &clip(message.get("listingId"), 200),
                &clip(message.get("peerId"), 200),
            )
            .await?;
        let ends = match ends {
            Ok(ends) => ends,
            Err(error) => return Ok(fail(error)),
        };
        let other = if user == ends.seller {
            ends.buyer
        } else {
            ends.seller
        };
        let cursor = message
            .get("cursor")
            .filter(|cursor| js::truthy(Some(cursor)))
            .cloned()
            .unwrap_or(JsonValue::Null);
        let data =
            json!({ "contactId": other, "cursor": cursor, "listingId": ends.row["listing_id"] });
        let page =
            message_store::conversation(&self.router, &self.store.central, user, &data).await?;
        let mut answer = serde_json::Map::new();
        answer.insert("ok".into(), json!(true));
        answer.extend(page.as_object().cloned().unwrap_or_default());
        Ok(JsonValue::Object(answer))
    }

    /// The seller's rows under the sale: one per person who wrote, their last message.
    pub(super) async fn threads(
        &self,
        directory: &Directory,
        user: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let row = self
            .store
            .listing(&clip(message.get("listingId"), 200))
            .await?;
        let Some(row) = row.filter(|row| js::string(&row["seller_id"]) == user) else {
            return Ok(fail("shop_not_seller"));
        };
        let page = self
            .router
            .own(
                user,
                "communication:threads",
                json!({ "listingId": row["listing_id"] }),
            )
            .await?;
        let mut items = Vec::new();
        for item in page["items"].as_array().into_iter().flatten() {
            let name = Self::name_of(directory, &js::text(item.get("peerId"))).await;
            items.push(json!({ "peerId": item.get("peerId"), "name": clip(Some(&json!(name)), 80),
                "message": clip(item.pointer("/last/message"), 200), "timestamp": item.get("timestamp"),
                "unread": item.get("unread") }));
        }
        Ok(json!({ "ok": true, "items": items }))
    }
}
