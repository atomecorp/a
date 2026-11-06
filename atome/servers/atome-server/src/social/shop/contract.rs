// The shop's shapes and rules as the server reads them (atome/src/shared/shop_contract.js and
// shop_order_contract.js, the one owner for the seller's devices, ported for the server): the
// listing as stored, the server's word on it, what keeps it from going live, the price split, and
// the order's moves (payment SIMULATED for now: nothing is charged).
use super::super::public_events::contract::{clip, parse, place};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub const LISTING_TYPE: &str = "shop_listing";
const SALE_KINDS: [&str; 10] = [
    "project",
    "physical",
    "ticket",
    "service",
    "content",
    "template",
    "rental",
    "free_price",
    "preorder",
    "subscription",
];
const DIGITAL_KINDS: [&str; 4] = ["project", "content", "template", "subscription"];
const STATUSES: [&str; 4] = ["live", "refused", "hidden", "sold_out"];
const REASONS: [&str; 5] = ["invalid", "quota", "suspended", "reported", "event"];
const COMMISSION_RATE: f64 = 0.03;
const MAX_IMAGES: usize = 6;
const MAX_PRICE: f64 = 100_000.0;
const PLACE_KINDS: [&str; 3] = ["seller", "buyer", "visio"];
const REGISTRATION_MODES: [&str; 2] = ["auto", "validated"];
pub const FINAL_STATES: [&str; 3] = ["released", "refunded", "cancelled"];
/// `BILLING_SIMULATED_METHODS` (atome/src/shared/billing_contract.js).
pub const SIMULATED_METHODS: [&str; 6] =
    ["card", "paypal", "wero", "apple_pay", "google_pay", "other"];
const HOUR_MS: i64 = 3600 * 1000;
const DAY_MS: i64 = 24 * HOUR_MS;
const AUTO_RELEASE_MS: i64 = 2 * DAY_MS;
const CANCEL_NOTICE_MS: i64 = 48 * HOUR_MS;
const PREORDER_LATE_MS: i64 = 30 * DAY_MS;

// JavaScript's `Math.round`: halves toward +∞.
pub fn round(value: f64) -> f64 {
    (value + 0.5).floor()
}

// `value && typeof value === 'object' && !Array.isArray(value) ? value : {}`.
fn object(value: Option<&JsonValue>) -> JsonValue {
    value
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or(json!({}))
}

/// `shopAmount(value, min)`: a sum in euros, to the cent, within [min, 100 000].
pub fn amount(value: Option<&JsonValue>, min: f64) -> Option<f64> {
    let amount = round(js::number(value) * 100.0) / 100.0;
    (amount.is_finite() && amount >= min && amount <= MAX_PRICE).then_some(amount)
}

fn whole(value: Option<&JsonValue>, min: f64, max: f64) -> Option<JsonValue> {
    let number = round(js::number(value));
    (number.is_finite() && number >= min && number <= max).then(|| js::number_json(number))
}

// `isoDate(value)`: an ISO date, else ''.
fn iso_date(value: Option<&JsonValue>) -> String {
    js::date(Some(&json!(clip(value, 40)))).map_or(String::new(), js::iso)
}

fn amount_json(amount: Option<f64>) -> JsonValue {
    amount.map_or(JsonValue::Null, js::number_json)
}

fn delivery(value: Option<&JsonValue>) -> JsonValue {
    let source = object(value);
    let shipping = source.get("shipping") == Some(&json!(true));
    let handover = source.get("handover") == Some(&json!(true)) || !shipping;
    let cost = if shipping {
        amount(source.get("shipping_cost"), 0.0).unwrap_or(0.0)
    } else {
        0.0
    };
    json!({ "shipping": shipping, "shipping_cost": js::number_json(cost), "handover": handover })
}

fn image(value: &JsonValue) -> Option<JsonValue> {
    let image = super::super::public_events::contract::poster(Some(value));
    (!image.is_empty()).then(|| JsonValue::from(image))
}

// What each kind adds to the common fields.
fn kind_fields(kind: &str, source: &JsonValue, listing: &mut JsonMap<String, JsonValue>) {
    let mut put = |key: &str, value: JsonValue| drop(listing.insert(key.into(), value));
    match kind {
        "project" | "template" => put("project_id", json!(clip(source.get("project_id"), 200))),
        "content" => {
            let mut ids: Vec<String> = Vec::new();
            for id in source["content_ids"].as_array().into_iter().flatten() {
                let id = clip(Some(id), 200);
                if !id.is_empty() && !ids.contains(&id) {
                    ids.push(id);
                }
            }
            ids.truncate(200);
            put("content_ids", json!(ids));
        }
        "physical" | "preorder" => {
            put(
                "quantity",
                whole(source.get("quantity"), 1.0, 9999.0).unwrap_or(json!(1)),
            );
            put("delivery", delivery(source.get("delivery")));
            if kind == "preorder" {
                put(
                    "delivery_date",
                    json!(iso_date(source.get("delivery_date"))),
                );
            }
        }
        "rental" => {
            put("delivery", delivery(source.get("delivery")));
            put(
                "deposit",
                js::number_json(amount(source.get("deposit"), 0.0).unwrap_or(0.0)),
            );
        }
        "ticket" => {
            put("event_id", json!(clip(source.get("event_id"), 200)));
            put(
                "places",
                whole(source.get("places"), 1.0, 100_000.0).unwrap_or(json!(1)),
            );
            let mode = source["registration"]
                .as_str()
                .filter(|mode| REGISTRATION_MODES.contains(mode));
            put("registration", json!(mode.unwrap_or("auto")));
        }
        "service" => {
            put(
                "duration_minutes",
                whole(source.get("duration_minutes"), 15.0, 1440.0).unwrap_or(json!(60)),
            );
            let place = source["place_kind"]
                .as_str()
                .filter(|kind| PLACE_KINDS.contains(kind));
            put("place_kind", json!(place.unwrap_or("seller")));
        }
        _ => {}
    }
}

/// `normalizeListing`: what the seller chose, never a status; none for an unknown kind.
pub fn listing(value: Option<&JsonValue>) -> Option<JsonValue> {
    let source = object(Some(&parse(value)));
    let kind = source["kind"]
        .as_str()
        .filter(|kind| SALE_KINDS.contains(kind))?;
    let images: Vec<JsonValue> = source["images"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(image)
        .take(MAX_IMAGES)
        .collect();
    let floor = if kind == "free_price" || kind == "ticket" {
        0.0
    } else {
        0.01
    };
    let visibility = if source.get("visibility") == Some(&json!("public")) {
        "public"
    } else {
        "private"
    };
    let mut listing = JsonMap::new();
    for (key, value) in [
        ("kind", json!(kind)),
        ("visibility", json!(visibility)),
        ("title", json!(clip(source.get("title"), 80))),
        ("comment", json!(clip(source.get("comment"), 600))),
        ("images", json!(images)),
        ("price", amount_json(amount(source.get("price"), floor))),
        ("currency", json!("EUR")),
        ("place", place(source.get("place"))),
    ] {
        listing.insert(key.into(), value);
    }
    kind_fields(kind, &source, &mut listing);
    Some(JsonValue::Object(listing))
}

/// `normalizeListingStatus`: the server's word on a listing, none when unreadable.
pub fn status(value: Option<&JsonValue>) -> Option<(String, Option<String>)> {
    let source = object(Some(&parse(value)));
    let status = source["status"]
        .as_str()
        .filter(|status| STATUSES.contains(status))?;
    let reason = source["reason"]
        .as_str()
        .filter(|reason| REASONS.contains(reason));
    Some((status.to_string(), reason.map(str::to_string)))
}

/// `listingError`: what keeps a public listing from going live, the first one found.
pub fn error(listing: &JsonValue) -> Option<&'static str> {
    if listing["visibility"] != "public" {
        return None;
    }
    let kind = listing["kind"].as_str().unwrap_or_default();
    let empty = |key: &str| !js::truthy(listing.get(key));
    let none = |key: &str| listing[key].as_array().is_none_or(Vec::is_empty);
    if empty("title") {
        return Some("shop_title_required");
    }
    if listing["price"].is_null() {
        return Some("shop_price_required");
    }
    if none("images") && kind != "ticket" {
        return Some("shop_image_required");
    }
    if (kind == "project" || kind == "template") && empty("project_id") {
        return Some("shop_project_required");
    }
    if kind == "content" && none("content_ids") {
        return Some("shop_content_required");
    }
    if kind == "ticket" && empty("event_id") {
        return Some("shop_event_required");
    }
    if kind == "preorder" && empty("delivery_date") {
        return Some("shop_delivery_date_required");
    }
    None
}

/// `shopSplit(amount)`: what the buyer pays, Atome's 3 %, what the seller receives, in cents.
pub fn split(amount: f64) -> Option<(f64, f64, f64)> {
    let cents = round(amount * 100.0);
    if !cents.is_finite() || cents < 0.0 {
        return None;
    }
    let commission = round(cents * COMMISSION_RATE);
    Some((
        cents / 100.0,
        commission / 100.0,
        (cents - commission) / 100.0,
    ))
}

/// `shopOrderOpening`: a registration to validate waits unpaid; a digital good is given on
/// payment; anything else is paid into escrow.
pub fn opening(kind: &str, registration: &str) -> &'static str {
    if kind == "ticket" && registration == "validated" {
        "requested"
    } else if DIGITAL_KINDS.contains(&kind) || kind == "free_price" {
        "delivered"
    } else {
        "held"
    }
}

// What ends at a known time (`ends_at`): released then, never confirmed by hand.
fn dated(kind: &str) -> bool {
    kind == "ticket" || kind == "service"
}

// `new Date(value || 0).getTime()`.
fn time(value: &JsonValue) -> Option<i64> {
    if js::truthy(Some(value)) {
        js::date(Some(value))
    } else {
        Some(0)
    }
}

fn cancellable(order: &JsonValue, at: i64) -> bool {
    let kind = order["kind"].as_str().unwrap_or_default();
    if dated(kind) {
        return time(&order["starts_at"]).is_some_and(|start| at <= start - CANCEL_NOTICE_MS);
    }
    kind == "preorder"
        && time(&order["delivery_date"]).is_some_and(|date| at >= date + PREORDER_LATE_MS)
}

/// `shopOrderStep(order, action, { role, at })`: the state the move reaches, or why it may not.
pub fn step(order: &JsonValue, action: &str, role: &str, at: i64) -> Result<String, String> {
    let state = order["state"].as_str().unwrap_or_default();
    let kind = order["kind"].as_str().unwrap_or_default();
    let ended = || {
        if state == "requested" {
            "cancelled"
        } else {
            "refunded"
        }
    };
    let (roles, from, to, allowed): (&[&str], &[&str], &str, bool) = match action {
        "validate" => (&["seller"], &["requested"], "held", true),
        "refuse" => (&["seller"], &["requested"], "cancelled", true),
        "ship" => (
            &["seller"],
            &["held"],
            "shipped",
            order["delivery"] == "shipping",
        ),
        "handover" => (&["seller"], &["held", "shipped"], "delivered", !dated(kind)),
        "confirm" => (
            &["buyer"],
            &["held", "shipped", "delivered"],
            "released",
            !dated(kind),
        ),
        "dispute" => (
            &["buyer"],
            &["held", "shipped", "delivered"],
            "disputed",
            true,
        ),
        "cancel" => (
            &["buyer"],
            &["requested", "held"],
            ended(),
            state == "requested" || cancellable(order, at),
        ),
        "refund" => (
            &["seller", "atome"],
            &["requested", "held", "shipped", "delivered", "disputed"],
            ended(),
            true,
        ),
        "release" => (&["atome"], &["disputed"], "released", true),
        "expire" => {
            let due = if dated(kind) {
                state == "held" && time(&order["ends_at"]).is_some_and(|end| at >= end)
            } else {
                state == "delivered"
                    && time(&order["delivered_at"]).is_some_and(|at_| at >= at_ + AUTO_RELEASE_MS)
            };
            (&["clock"], &["held", "delivered"], "released", due)
        }
        _ => return Err("shop_order_action_invalid".into()),
    };
    if !roles.contains(&role) {
        return Err("shop_order_forbidden".into());
    }
    if !from.contains(&state) {
        return Err("shop_order_state_invalid".into());
    }
    if !allowed {
        return Err(format!("shop_order_{action}_not_allowed"));
    }
    Ok(to.to_string())
}
