// The shop's shared base (server/shop_listings.js, ported; user decisions of 28 Oct. 2026): the
// sales everyone browses, visitor and guest included. The truth is the seller's `shop_listing`
// Atome in their vault (its `listing` property); this only PROJECTS it into `shop_listings` after
// every commit that touches it, and writes its word back on the Atome (`listing_status`: live,
// refused with a reason, hidden). Nothing a client sends is believed without reading the vault.
use super::super::directory::Directory;
use super::super::live;
use super::super::public_events::contract as events;
use super::contract::{self, LISTING_TYPE, round};
use super::{Shop, clip, parse};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const PAGE_SIZE: i64 = 25;
const REPORTS_TO_HIDE: i64 = 3;
const REPORT_REASONS: [&str; 5] = ["spam", "false", "offensive", "forbidden", "other"];
const EVENT_TYPE: &str = "calendar_event";
// What a commit on a calendar event changes that a ticket follows.
const EVENT_KEYS: [&str; 4] = ["publication", "publication_status", "status", "__deleted"];

// `String(state.type || '').toLowerCase()`.
fn kind_of(state: &JsonValue) -> String {
    let kind = state.get("type").filter(|kind| js::truthy(Some(kind)));
    kind.map(js::string).unwrap_or_default().to_lowercase()
}

fn properties_of(state: &JsonValue) -> JsonValue {
    let properties = state.get("properties").filter(|p| js::truthy(Some(p)));
    properties.cloned().unwrap_or(json!({}))
}

// A ticket's event in its seller's own vault: live, over for good, or waiting.
enum TicketEvent {
    Live,
    Over,
    Waiting,
}

impl Shop {
    async fn write_listing_status(
        &self,
        seller: &str,
        listing_id: &str,
        properties: &JsonValue,
        status: &str,
        reason: Option<&str>,
    ) -> Result<(), String> {
        let previous = contract::status(properties.get("listing_status"));
        if previous
            .as_ref()
            .is_some_and(|(was, why)| was == status && why.as_deref() == reason)
        {
            return Ok(());
        }
        let word = json!({ "status": status, "reason": reason, "at": js::iso(chrono::Utc::now().timestamp_millis()) });
        let event = json!({ "kind": "set", "atome_id": listing_id,
            "payload": { "props": { "listing_status": word.to_string() } },
            "actor": { "type": "user", "id": seller } });
        let entry = self
            .router
            .commit(seller, &event, &json!({ "source": "shop" }))
            .await?;
        if entry["inserted"] == json!(true) {
            self.sync.publish(&entry["event"]).await?;
        }
        Ok(())
    }

    // Every open screen of this seller's shop reads again (`shop-changed`).
    async fn changed(seller: &str) {
        let payload = json!({ "type": "shop-changed", "sellerId": seller });
        live::broadcast(&payload).await;
    }

    async fn leave(&self, listing_id: &str) -> Result<(), String> {
        let Some(existing) = self.store.listing(listing_id).await? else {
            return Ok(());
        };
        self.store.remove(listing_id).await?;
        Self::changed(&js::string(&existing["seller_id"])).await;
        Ok(())
    }

    async fn ticket_event(
        &self,
        seller: &str,
        event_id: &JsonValue,
    ) -> Result<TicketEvent, String> {
        let state = self.router.get_state(seller, event_id).await?;
        let properties = properties_of(&state);
        let public = events::publication(properties.get("publication"))
            .is_some_and(|publication| publication["visibility"] == "public");
        if !js::truthy(Some(&state))
            || js::text(state.get("vault_principal_id")) != seller
            || kind_of(&state) != EVENT_TYPE
            || properties.get("__deleted") == Some(&json!(true))
            || clip(properties.get("status"), 20) == "cancelled"
            || !public
        {
            return Ok(TicketEvent::Over);
        }
        let live = events::status(properties.get("publication_status"))
            .is_some_and(|(status, _)| status == "live");
        Ok(if live {
            TicketEvent::Live
        } else {
            TicketEvent::Waiting
        })
    }

    /// After a commit touching `listing_id` (in `seller`'s vault): the base follows the Atome.
    pub async fn project(
        &self,
        directory: &Directory,
        seller: &str,
        listing_id: &str,
    ) -> Result<(), String> {
        let state = self.router.get_state(seller, &json!(listing_id)).await?;
        let properties = properties_of(&state);
        if !js::truthy(Some(&state))
            || kind_of(&state) != LISTING_TYPE
            || properties.get("__deleted") == Some(&json!(true))
        {
            return self.leave(listing_id).await;
        }
        let Some(listing) = contract::listing(properties.get("listing"))
            .filter(|listing| listing["visibility"] == "public")
        else {
            return self.leave(listing_id).await;
        };
        // The seller's screens read again once the status is written back.
        if contract::error(&listing).is_some() {
            self.leave(listing_id).await?;
            self.write_listing_status(seller, listing_id, &properties, "refused", Some("invalid"))
                .await?;
            Self::changed(seller).await;
            return Ok(());
        }
        // A ticket sells while its event is live; an event over for good refunds whoever paid first.
        let event = if listing["kind"] == "ticket" {
            self.ticket_event(seller, &listing["event_id"]).await?
        } else {
            TicketEvent::Live
        };
        if !matches!(event, TicketEvent::Live) {
            if matches!(event, TicketEvent::Over) {
                self.refund_all(seller, listing_id).await?;
            }
            self.leave(listing_id).await?;
            self.write_listing_status(seller, listing_id, &properties, "refused", Some("event"))
                .await?;
            Self::changed(seller).await;
            return Ok(());
        }
        let existing = self.store.listing(listing_id).await?;
        if existing
            .as_ref()
            .is_some_and(|existing| js::truthy(existing.get("hidden_at")))
        {
            return self
                .write_listing_status(seller, listing_id, &properties, "hidden", Some("reported"))
                .await;
        }
        let name = Self::name_of(directory, seller).await;
        self.store
            .put(listing_id, seller, &clip(Some(&json!(name)), 80), &listing)
            .await?;
        self.write_listing_status(seller, listing_id, &properties, "live", None)
            .await?;
        Self::changed(seller).await;
        Ok(())
    }

    // A calendar event changed: the tickets its organiser sells for it follow it.
    async fn follow_event(
        &self,
        directory: &Directory,
        owner: &str,
        event_id: &str,
    ) -> Result<(), String> {
        let state = self.router.get_state(owner, &json!(event_id)).await?;
        if js::truthy(Some(&state)) && kind_of(&state) != EVENT_TYPE {
            return Ok(());
        }
        let listed = self
            .router
            .list_states(owner, &json!({ "atomeType": LISTING_TYPE, "limit": 1000 }))
            .await?;
        for item in listed.as_array().into_iter().flatten() {
            let listing = contract::listing(item.pointer("/properties/listing"));
            if listing.is_some_and(|listing| {
                listing["kind"] == "ticket" && listing["event_id"] == event_id
            }) {
                let id = js::first(item, &["atome_id", "id"])
                    .map(js::string)
                    .unwrap_or_default();
                Box::pin(self.project(directory, owner, &id)).await?;
            }
        }
        Ok(())
    }

    /// The commits of one request: each carrying a `listing`, or already in the base; each
    /// touching an event's publication.
    pub async fn after_commit(
        &self,
        directory: &Directory,
        events: &[JsonValue],
    ) -> Result<(), String> {
        for event in events {
            let atome_id = clip(event.get("atome_id"), 200);
            if atome_id.is_empty() {
                continue;
            }
            let payload = event.get("payload");
            let props = payload
                .and_then(|payload| payload.get("props"))
                .filter(|props| js::truthy(Some(props)))
                .or(payload.filter(|payload| js::truthy(Some(payload))));
            let has = |key: &str| props.is_some_and(|props| props.get(key).is_some());
            let sale = has("listing") || self.store.listing(&atome_id).await?.is_some();
            let kind = event.get("kind").filter(|kind| js::truthy(Some(kind)));
            let deleted = kind.map(js::string).unwrap_or_default().to_lowercase() == "delete";
            if !sale && !deleted && !EVENT_KEYS.iter().any(|key| has(key)) {
                continue;
            }
            let Some(owner) = self.router.owner_of(&atome_id).await? else {
                continue;
            };
            if sale {
                self.project(directory, &owner, &atome_id).await?;
            } else {
                self.follow_event(directory, &owner, &atome_id).await?;
            }
        }
        Ok(())
    }

    // A row of the base as the reader receives it: the public fields only.
    fn entry_of(row: &JsonValue) -> JsonValue {
        let listing = parse(row.get("payload_json"));
        let field = |key: &str| {
            listing
                .get(key)
                .filter(|value| js::truthy(Some(value)))
                .cloned()
        };
        let present = |key: &str| {
            listing
                .get(key)
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or(JsonValue::Null)
        };
        let place = listing.get("place");
        let place = place
            .and_then(|place| place.get("city").filter(|city| js::truthy(Some(city))))
            .or_else(|| {
                place.and_then(|place| place.get("label").filter(|label| js::truthy(Some(label))))
            });
        let mut entry = JsonMap::new();
        entry.insert("id".into(), row["listing_id"].clone());
        entry.insert("sellerId".into(), json!(js::string(&row["seller_id"])));
        entry.insert("seller".into(), json!(clip(row.get("seller_name"), 80)));
        for (name, key) in [("kind", "kind"), ("title", "title"), ("comment", "comment")] {
            if let Some(value) = listing.get(key) {
                entry.insert(name.into(), value.clone());
            }
        }
        entry.insert("images".into(), field("images").unwrap_or(json!([])));
        for (name, key) in [("price", "price"), ("currency", "currency")] {
            if let Some(value) = listing.get(key) {
                entry.insert(name.into(), value.clone());
            }
        }
        entry.insert(
            "delivery".into(),
            field("delivery").unwrap_or(JsonValue::Null),
        );
        entry.insert("quantity".into(), present("quantity"));
        entry.insert("deposit".into(), present("deposit"));
        entry.insert(
            "deliveryDate".into(),
            field("delivery_date").unwrap_or(json!("")),
        );
        entry.insert("durationMinutes".into(), present("duration_minutes"));
        entry.insert("placeKind".into(), field("place_kind").unwrap_or(json!("")));
        entry.insert("place".into(), place.cloned().unwrap_or(json!("")));
        entry.insert("eventId".into(), field("event_id").unwrap_or(json!("")));
        entry.insert("places".into(), present("places"));
        entry.insert(
            "registration".into(),
            field("registration").unwrap_or(json!("")),
        );
        entry.insert("updatedAt".into(), row["updated_at"].clone());
        JsonValue::Object(entry)
    }

    async fn visible(
        &self,
        rows: &[JsonValue],
        viewer: Option<&str>,
    ) -> Result<Vec<JsonValue>, String> {
        let mut kept = Vec::new();
        for row in rows {
            if !self.blocked(viewer, &js::string(&row["seller_id"])).await? {
                kept.push(Self::entry_of(row));
            }
        }
        Ok(kept)
    }

    /// Browsing: the newest sales first, narrowed to a seller's shop, a kind, or words.
    pub async fn browse(
        &self,
        message: &JsonValue,
        viewer: Option<&str>,
    ) -> Result<JsonValue, String> {
        let offset = js::number(message.get("offset"));
        let start = round(offset);
        let start = if start.is_finite() && start > 0.0 {
            start as i64
        } else {
            0
        };
        let rows = self
            .store
            .browse(
                &clip(message.get("sellerId"), 200),
                &clip(message.get("kind"), 40),
                &clip(message.get("query"), 80).to_lowercase(),
                PAGE_SIZE + 1,
                start,
            )
            .await?;
        let page = &rows[..rows.len().min(PAGE_SIZE as usize)];
        let entries = self.visible(page, viewer).await?;
        let from = if offset.is_nan() || offset == 0.0 {
            0.0
        } else {
            offset
        };
        let next = if rows.len() as i64 > PAGE_SIZE {
            js::string(&js::number_json(from + PAGE_SIZE as f64))
        } else {
            String::new()
        };
        Ok(json!({ "entries": entries, "next": next }))
    }

    /// One sale by its id: none when withdrawn, hidden, or of someone the reader blocked.
    pub async fn one(
        &self,
        message: &JsonValue,
        viewer: Option<&str>,
    ) -> Result<JsonValue, String> {
        let row = self
            .store
            .listing(&clip(message.get("listingId"), 200))
            .await?;
        let Some(row) = row.filter(|row| !js::truthy(row.get("hidden_at"))) else {
            return Ok(json!({ "entries": [], "next": "" }));
        };
        Ok(json!({ "entries": self.visible(&[row], viewer).await?, "next": "" }))
    }

    // A report by an account (never on their own sale); three distinct ones hide the sale.
    pub(super) async fn report(
        &self,
        viewer: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let Some(existing) = self
            .store
            .listing(&clip(message.get("listingId"), 200))
            .await?
        else {
            return Ok(json!({ "ok": false, "error": "shop_not_found" }));
        };
        let (id, seller) = (
            js::string(&existing["listing_id"]),
            js::string(&existing["seller_id"]),
        );
        if seller == viewer {
            return Ok(json!({ "ok": false, "error": "shop_own_listing" }));
        }
        // `String(data.reason || '')`.
        let reason = message
            .get("reason")
            .filter(|reason| js::truthy(Some(reason)));
        let reason = reason.map(js::string).unwrap_or_default();
        let reason = if REPORT_REASONS.contains(&reason.as_str()) {
            reason.as_str()
        } else {
            "other"
        };
        let total = self.store.report(&id, viewer, reason).await?;
        if total >= REPORTS_TO_HIDE && !js::truthy(existing.get("hidden_at")) {
            self.store.hide(&id).await?;
            let state = self.router.get_state(&seller, &json!(id)).await?;
            if js::truthy(Some(&state)) {
                self.write_listing_status(
                    &seller,
                    &id,
                    &properties_of(&state),
                    "hidden",
                    Some("reported"),
                )
                .await?;
            }
            Self::changed(&seller).await;
        }
        Ok(json!({ "ok": true }))
    }
}
