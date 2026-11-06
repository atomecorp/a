// The shop's orders (server/shop_orders.js, ported; user decisions of 28 Oct. 2026): a purchase
// pays into escrow (payment SIMULATED for now: nothing is charged), the money released to the
// seller less Atome's 3 % once the good is received, refunded when the rules say so (contract.rs
// `step`). Every step is kept (append-only `shop_order_steps`), a digital good is given at payment
// (delivery.rs) and the other side is told (social/live.rs delivers the notification).
use super::contract::{self, FINAL_STATES, SIMULATED_METHODS, round};
use super::{Shop, clip, parse};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const DAY_MS: i64 = 24 * 3600 * 1000;

fn fail(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

// `iso(value)`: `new Date(value || NaN)` as an ISO date, none when unreadable.
fn iso(value: Option<&JsonValue>) -> Option<String> {
    js::date(value.filter(|value| js::truthy(Some(value)))).map(js::iso)
}

fn number(value: f64) -> JsonValue {
    js::number_json(value)
}

// What the buyer pays (the deposit of a rental apart: held, never commissioned).
fn price_of(
    listing: &JsonValue,
    input: &JsonValue,
    quantity: f64,
    dates: &JsonValue,
) -> Option<f64> {
    let price = js::number(listing.get("price"));
    match listing["kind"].as_str().unwrap_or_default() {
        "free_price" => {
            contract::amount(input.get("amount"), 0.0).filter(|amount| *amount >= price)
        }
        "rental" => {
            let span = js::date(dates.get("startsAt")).zip(js::date(dates.get("endsAt")));
            let days = span.map_or(f64::NAN, |(start, end)| {
                ((end - start) as f64 / DAY_MS as f64).ceil()
            });
            Some(round(price * days * 100.0) / 100.0)
        }
        _ => {
            let shipping = if input.get("delivery") == Some(&json!("shipping")) {
                js::number_or(listing.pointer("/delivery/shipping_cost"), 0.0)
            } else {
                0.0
            };
            Some(round((price * quantity + shipping) * 100.0) / 100.0)
        }
    }
}

// How the good reaches the buyer: '' when it is not a physical one, none when it must be chosen.
fn delivery_of(listing: &JsonValue, wanted: Option<&JsonValue>) -> Option<&'static str> {
    let delivery = listing
        .get("delivery")
        .filter(|delivery| js::truthy(Some(delivery)));
    let Some(delivery) = delivery else {
        return Some("");
    };
    let (shipping, handover) = (
        js::truthy(delivery.get("shipping")),
        js::truthy(delivery.get("handover")),
    );
    match wanted.and_then(JsonValue::as_str) {
        Some("shipping") if shipping => Some("shipping"),
        Some("handover") if handover => Some("handover"),
        _ if shipping && !handover => Some("shipping"),
        _ if handover && !shipping => Some("handover"),
        _ => None,
    }
}

impl Shop {
    async fn tell(
        &self,
        target: &str,
        sender: Option<&str>,
        order: &JsonValue,
        message: &str,
    ) -> Result<(), String> {
        let (id, state) = (js::string(&order["order_id"]), js::string(&order["state"]));
        let title = parse(order.get("snapshot_json"));
        let notification = json!({ "kind": "shop-order", "subject": clip(title.get("title"), 80), "message": message,
            "id": format!("shop_order_{id}_{state}"),
            "extra": { "action": { "kind": "command", "toolId": "shop.open",
                "input": { "listing_id": order["listing_id"], "order_id": order["order_id"] } }, "order_state": state } });
        self.notifier.notify(target, sender, &notification).await
    }

    // The dates a ticket or an appointment holds: the event's own (read in the organiser's
    // vault) or the slot chosen; `{}` for a sale without dates.
    async fn dates_of(
        &self,
        row: &JsonValue,
        listing: &JsonValue,
        input: &JsonValue,
    ) -> Option<JsonValue> {
        match listing["kind"].as_str().unwrap_or_default() {
            "ticket" => {
                let seller = js::string(&row["seller_id"]);
                let event = self
                    .router
                    .get_state(&seller, &listing["event_id"])
                    .await
                    .unwrap_or(JsonValue::Null);
                let start = iso(event.pointer("/properties/start"))?;
                let end = iso(event.pointer("/properties/end")).unwrap_or_else(|| start.clone());
                Some(json!({ "startsAt": start, "endsAt": end }))
            }
            "service" => {
                let start = iso(input.get("starts_at"))?;
                let minutes = js::number(listing.get("duration_minutes"));
                let end = js::date(Some(&json!(start)))? + (minutes * 60_000.0) as i64;
                Some(json!({ "startsAt": start, "endsAt": js::iso(end) }))
            }
            "rental" => {
                let (start, end) = (iso(input.get("starts_at"))?, iso(input.get("ends_at"))?);
                (end > start).then(|| json!({ "startsAt": start, "endsAt": end }))
            }
            _ => Some(json!({})),
        }
    }

    /// A purchase (or a registration to validate): the sale read from the base, never from
    /// the client.
    pub(super) async fn buy(&self, buyer: &str, input: &JsonValue) -> Result<JsonValue, String> {
        let row = self
            .store
            .listing(&clip(input.get("listing_id"), 200))
            .await?;
        let Some(row) = row.filter(|row| !js::truthy(row.get("hidden_at"))) else {
            return Ok(fail("shop_not_found"));
        };
        let seller = js::string(&row["seller_id"]);
        if seller == buyer {
            return Ok(fail("shop_own_listing"));
        }
        let listing = parse(row.get("payload_json"));
        let kind = listing["kind"].as_str().unwrap_or_default().to_string();
        // A free ticket (a registration) is taken without paying: no method.
        let free = kind == "ticket" && listing["price"].as_f64() == Some(0.0);
        let method = input
            .get("method")
            .and_then(JsonValue::as_str)
            .filter(|method| SIMULATED_METHODS.contains(method));
        if !free && method.is_none() {
            return Ok(fail("shop_payment_method_invalid"));
        }
        let counted = ["physical", "preorder", "ticket"].contains(&kind.as_str());
        let quantity = if counted {
            round(js::number_or(input.get("quantity"), 1.0)).clamp(1.0, 99.0)
        } else {
            1.0
        };
        let stock = match kind.as_str() {
            "ticket" => listing.get("places"),
            "physical" | "preorder" => listing.get("quantity"),
            _ => None,
        }
        .filter(|stock| !stock.is_null());
        let listing_id = js::string(&row["listing_id"]);
        if let Some(stock) = stock
            && self.store.taken(&listing_id).await? + quantity > js::number(Some(stock))
        {
            return Ok(fail("shop_sold_out"));
        }
        let Some(delivery) = delivery_of(&listing, input.get("delivery")) else {
            return Ok(fail("shop_delivery_required"));
        };
        let Some(dates) = self.dates_of(&row, &listing, input).await else {
            return Ok(fail("shop_dates_required"));
        };
        let Some((amount, commission, net)) =
            price_of(&listing, input, quantity, &dates).and_then(contract::split)
        else {
            return Ok(fail("shop_amount_invalid"));
        };
        let at = chrono::Utc::now().timestamp_millis();
        let state = contract::opening(&kind, listing["registration"].as_str().unwrap_or("auto"));
        let deposit = if kind == "rental" {
            listing["deposit"].clone()
        } else {
            json!(0)
        };
        let method = if free { "" } else { method.unwrap_or_default() };
        let image = listing
            .pointer("/images/0")
            .filter(|image| js::truthy(Some(image)))
            .cloned()
            .unwrap_or(json!(""));
        let snapshot = json!({ "title": listing.get("title"), "price": listing.get("price"), "image": image, "seller": row["seller_name"] });
        let present = |value: Option<&JsonValue>| {
            value
                .filter(|value| js::truthy(Some(value)))
                .cloned()
                .unwrap_or(JsonValue::Null)
        };
        let mut order = json!({ "order_id": uuid::Uuid::new_v4().to_string(), "listing_id": listing_id, "buyer_id": buyer,
            "seller_id": seller, "kind": kind, "state": state, "quantity": number(quantity), "amount": number(amount),
            "commission": number(commission), "net": number(net), "deposit": deposit, "method": method, "delivery": delivery,
            "starts_at": present(dates.get("startsAt")), "ends_at": present(dates.get("endsAt")),
            "delivery_date": present(listing.get("delivery_date")),
            "delivered_at": if state == "delivered" { json!(js::iso(at)) } else { JsonValue::Null },
            "snapshot_json": snapshot.to_string() });
        let order_id = js::string(&order["order_id"]);
        self.store.insert_order(&order).await?;
        let detail = json!({ "simulated": true, "method": method, "amount": number(amount), "deposit": order["deposit"] });
        self.store
            .step(&order_id, "open", "buyer", buyer, "", state, &detail, &[])
            .await?;
        if state == "delivered" && (kind == "project" || kind == "template") {
            let copy = self
                .copy_project(
                    &seller,
                    buyer,
                    &js::string(&listing["project_id"]),
                    &order_id,
                )
                .await?;
            self.store
                .step(&order_id, "deliver", "atome", "", state, state, &copy, &[])
                .await?;
            order["copy_project_id"] = copy["projectId"].clone();
        }
        let told = if state == "requested" {
            "registration"
        } else {
            "sold"
        };
        self.tell(&seller, Some(buyer), &order, told).await?;
        Ok(json!({ "ok": true, "order": Self::view(&order, buyer) }))
    }

    /// One move by its buyer, its seller, Atome (a dispute's decision) or the clock (`forced`).
    pub(super) async fn move_order(
        &self,
        actor: Option<&str>,
        order_id: &str,
        action: &str,
        tracking: Option<&JsonValue>,
        forced: Option<&str>,
    ) -> Result<JsonValue, String> {
        let Some(order) = self.store.order(&clip(Some(&json!(order_id)), 200)).await? else {
            return Ok(fail("shop_order_not_found"));
        };
        let (buyer, seller) = (
            js::string(&order["buyer_id"]),
            js::string(&order["seller_id"]),
        );
        let role = forced.or(match actor {
            Some(actor) if actor == buyer => Some("buyer"),
            Some(actor) if actor == seller => Some("seller"),
            _ => None,
        });
        let Some(role) = role else {
            return Ok(fail("shop_order_forbidden"));
        };
        let at = chrono::Utc::now().timestamp_millis();
        let to = match contract::step(&order, &js::slice(js::trim(action), 40), role, at) {
            Ok(to) => to,
            Err(error) => return Ok(fail(&error)),
        };
        let mut fields: Vec<(&'static str, JsonValue)> = Vec::new();
        if action == "ship" {
            fields.push(("tracking", json!(clip(tracking, 120))));
        }
        if to == "delivered" {
            fields.push(("delivered_at", json!(js::iso(at))));
        }
        let mut detail = JsonMap::new();
        detail.insert("simulated".into(), json!(true));
        if to == "released" {
            detail.insert("net".into(), order["net"].clone());
            detail.insert("commission".into(), order["commission"].clone());
            detail.insert("deposit_returned".into(), order["deposit"].clone());
        }
        if to == "refunded" {
            let refunded = js::number(order.get("amount")) + js::number(order.get("deposit"));
            detail.insert("refunded".into(), number(refunded));
        }
        let from = js::string(&order["state"]);
        let id = js::string(&order["order_id"]);
        let detail = JsonValue::Object(detail);
        self.store
            .step(
                &id,
                action,
                role,
                actor.unwrap_or_default(),
                &from,
                &to,
                &detail,
                &fields,
            )
            .await?;
        let mut moved = order.clone();
        for (column, value) in fields {
            moved[column] = value;
        }
        moved["state"] = json!(to);
        if role != "clock" || to == "released" {
            let target = if role == "buyer" { &seller } else { &buyer };
            let sender = if role == "clock" || role == "atome" {
                None
            } else {
                actor
            };
            self.tell(target, sender, &moved, action).await?;
        }
        Ok(json!({ "ok": true, "order": Self::view(&moved, actor.unwrap_or_default()) }))
    }

    /// The organiser cancels the event, the seller withdraws the sale: every buyer still waiting
    /// is refunded, read from the orders themselves.
    pub(super) async fn refund_all(
        &self,
        seller: &str,
        listing_id: &str,
    ) -> Result<JsonValue, String> {
        let mut refunded = 0;
        for order in self
            .store
            .open_orders(&js::slice(js::trim(listing_id), 200), seller)
            .await?
        {
            let id = js::string(&order["order_id"]);
            let moved = Box::pin(self.move_order(Some(seller), &id, "refund", None, None)).await?;
            if moved["ok"] == json!(true) {
                refunded += 1;
            }
        }
        Ok(json!({ "ok": true, "refunded": refunded }))
    }

    /// Time passing: what is due is released (two days after a delivery without dispute, the
    /// event or slot over).
    pub async fn tick(&self) -> Result<(), String> {
        let due = self
            .store
            .central
            .all(
                "SELECT * FROM shop_orders WHERE state = 'delivered' OR (state = 'held' AND ends_at IS NOT NULL) LIMIT 500".into(),
                Vec::new(),
            )
            .await?;
        for order in due {
            let id = js::string(&order["order_id"]);
            self.move_order(None, &id, "expire", None, Some("clock"))
                .await?;
        }
        Ok(())
    }

    // An order as one of its sides reads it (the other side's money details stay theirs).
    fn view(order: &JsonValue, reader: &str) -> JsonValue {
        let snapshot = parse(order.get("snapshot_json"));
        let seller = js::string(&order["seller_id"]) == reader;
        let state = order["state"].as_str().unwrap_or_default();
        let text = |value: Option<&JsonValue>| {
            value
                .filter(|value| js::truthy(Some(value)))
                .cloned()
                .unwrap_or(json!(""))
        };
        let mut view = JsonMap::new();
        for (key, value) in [
            ("id", order["order_id"].clone()),
            ("listingId", order["listing_id"].clone()),
            ("side", json!(if seller { "seller" } else { "buyer" })),
            (
                "peerId",
                if seller {
                    order["buyer_id"].clone()
                } else {
                    order["seller_id"].clone()
                },
            ),
            ("kind", order["kind"].clone()),
            ("state", order["state"].clone()),
            ("final", json!(FINAL_STATES.contains(&state))),
            ("quantity", order["quantity"].clone()),
            ("amount", order["amount"].clone()),
            ("deposit", order["deposit"].clone()),
        ] {
            view.insert(key.into(), value);
        }
        if seller {
            view.insert("commission".into(), order["commission"].clone());
            view.insert("net".into(), order["net"].clone());
        }
        for (key, value) in [
            ("delivery", order["delivery"].clone()),
            ("tracking", text(order.get("tracking"))),
            ("startsAt", order["starts_at"].clone()),
            ("endsAt", order["ends_at"].clone()),
            ("deliveryDate", order["delivery_date"].clone()),
            ("deliveredAt", order["delivered_at"].clone()),
            ("title", text(snapshot.get("title"))),
            ("image", text(snapshot.get("image"))),
            ("seller", text(snapshot.get("seller"))),
            ("simulated", json!(true)),
        ] {
            view.insert(key.into(), value);
        }
        if js::truthy(order.get("copy_project_id")) {
            view.insert("projectId".into(), order["copy_project_id"].clone());
        }
        JsonValue::Object(view)
    }

    pub(super) async fn orders(
        &self,
        user: &str,
        side: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        let seller = side == Some(&json!("seller"));
        let items: Vec<JsonValue> = self
            .store
            .orders_of(user, seller)
            .await?
            .iter()
            .map(|order| Self::view(order, user))
            .collect();
        Ok(json!({ "ok": true, "items": items }))
    }
}
