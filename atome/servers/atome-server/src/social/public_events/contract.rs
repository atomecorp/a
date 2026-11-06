// A public event's publication as the server reads it (atome/src/shared/public_event_contract.js,
// the one owner of its shape for the author's devices, ported for the server): `publication`
// written by the author's devices, `publication_status` written by the server only, the grid cell
// the shared base is read by.
use super::super::news::db::text;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

pub const HORIZON_DAYS: i64 = 60;
pub const REPORT_REASONS: [&str; 4] = ["spam", "false", "offensive", "other"];
const MAX_CATEGORIES: usize = 3;
const POSTER_MAX_CHARS: usize = 120_000;
const PRESENTATION_MAX_CHARS: usize = 600;
const STATUSES: [&str; 4] = ["pending", "live", "refused", "hidden"];
const REASONS: [&str; 5] = ["quota", "suspended", "invalid", "reported", "past"];
// `ACTIVITY_CATEGORY_SLUGS` (atome/src/shared/activity_categories.js, the one taxonomy).
const CATEGORY_SLUGS: [&str; 13] = [
    "concert",
    "stage",
    "screening",
    "sport",
    "festival",
    "expo",
    "family",
    "meal",
    "party",
    "workshop",
    "outing",
    "market",
    "wellbeing",
];
const CELL_DEGREES: f64 = 0.1;

// `text(value, max)`: trimmed, then its first `max` UTF-16 units.
pub fn clip(value: Option<&JsonValue>, max: usize) -> String {
    js::slice(&text(value), max)
}

// `parse(value)`: a JSON text read back (null when unreadable), any other value as it is.
pub fn parse(value: Option<&JsonValue>) -> JsonValue {
    match value {
        Some(JsonValue::String(raw)) => serde_json::from_str(raw).unwrap_or(JsonValue::Null),
        Some(value) => value.clone(),
        None => JsonValue::Null,
    }
}

// `value && typeof value === 'object'` (an array included), else none.
fn object(value: Option<&JsonValue>) -> Option<&JsonValue> {
    value.filter(|value| value.is_object() || value.is_array())
}

// JavaScript's `Math.round`: halves toward +∞.
fn round(value: f64) -> f64 {
    (value + 0.5).floor()
}

// No position stays none: `null` and `''` are none, not 0.
fn coordinate(value: Option<&JsonValue>, limit: f64) -> JsonValue {
    let number = match value {
        Some(JsonValue::Null) => f64::NAN,
        Some(JsonValue::String(raw)) if raw.is_empty() => f64::NAN,
        value => js::number(value),
    };
    if number.is_finite() && number.abs() <= limit {
        js::number_json(round(number * 1e6) / 1e6)
    } else {
        JsonValue::Null
    }
}

// `new URL(text(value, 500))`, its `href` when it is https.
fn https_url(value: Option<&JsonValue>) -> String {
    match url::Url::parse(&clip(value, 500)) {
        Ok(url) if url.scheme() == "https" => url.to_string(),
        _ => String::new(),
    }
}

fn price(value: Option<&JsonValue>) -> JsonValue {
    let price = object(value).cloned().unwrap_or(json!({}));
    if price.get("free") == Some(&json!(true)) {
        return json!({ "free": true });
    }
    let amount = round(js::number(price.get("amount")) * 100.0) / 100.0;
    if !(amount.is_finite() && amount > 0.0) {
        return json!({ "free": true });
    }
    let currency = clip(price.get("currency"), 200);
    let currency = if currency.len() == 3 && currency.bytes().all(|b| b.is_ascii_uppercase()) {
        currency
    } else {
        "EUR".into()
    };
    json!({ "amount": js::number_json(amount), "currency": currency })
}

/// `normalizePlace`.
pub fn place(value: Option<&JsonValue>) -> JsonValue {
    let place = object(value).cloned().unwrap_or(json!({}));
    json!({ "label": clip(place.get("label"), 200), "address": clip(place.get("address"), 300),
        "city": clip(place.get("city"), 120), "lat": coordinate(place.get("lat"), 90.0),
        "lon": coordinate(place.get("lon"), 180.0) })
}

// A small JPEG, PNG or WebP data URL carried by the publication itself.
pub fn poster(value: Option<&JsonValue>) -> String {
    let Some(JsonValue::String(poster)) = value else {
        return String::new();
    };
    let body = ["jpeg", "png", "webp"]
        .iter()
        .find_map(|kind| poster.strip_prefix(&format!("data:image/{kind};base64,")));
    let well_formed = body.is_some_and(|body| {
        !body.is_empty()
            && body
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
    });
    if well_formed && poster.len() <= POSTER_MAX_CHARS {
        poster.clone()
    } else {
        String::new()
    }
}

/// `normalizePublication`: what the author chose, never a status; none when not an object.
pub fn publication(value: Option<&JsonValue>) -> Option<JsonValue> {
    let source = parse(value);
    if !source.is_object() {
        return None;
    }
    let mut categories: Vec<String> = Vec::new();
    for slug in source["categories"].as_array().into_iter().flatten() {
        let slug = clip(Some(slug), 40);
        if !categories.contains(&slug) {
            categories.push(slug);
        }
    }
    categories.retain(|slug| CATEGORY_SLUGS.contains(&slug.as_str()));
    categories.truncate(MAX_CATEGORIES);
    let visibility = if source.get("visibility") == Some(&json!("public")) {
        "public"
    } else {
        "private"
    };
    Some(
        json!({ "visibility": visibility, "categories": categories, "place": place(source.get("place")),
        "presentation": clip(source.get("presentation"), PRESENTATION_MAX_CHARS),
        "poster": poster(source.get("poster")), "price": price(source.get("price")),
        "ticket_url": https_url(source.get("ticket_url")), "url": https_url(source.get("url")) }),
    )
}

/// `normalizePublicationStatus`: the server's word on a publication, none when unreadable.
pub fn status(value: Option<&JsonValue>) -> Option<(String, Option<String>)> {
    let source = parse(value);
    object(Some(&source))?;
    let status = source["status"]
        .as_str()
        .filter(|status| STATUSES.contains(status))?;
    let reason = source["reason"]
        .as_str()
        .filter(|reason| REASONS.contains(reason));
    Some((status.to_string(), reason.map(str::to_string)))
}

/// `publicationError` of a public publication, once its start was read (`valid_start`).
pub fn error(publication: &JsonValue, title: &str, valid_start: bool) -> Option<&'static str> {
    if publication["visibility"] != "public" {
        return None;
    }
    if js::trim(title).is_empty() {
        return Some("events_title_required");
    }
    if !valid_start {
        return Some("events_start_required");
    }
    if publication["categories"]
        .as_array()
        .is_none_or(|categories| categories.is_empty())
    {
        return Some("events_category_required");
    }
    if publication["place"]["lat"].is_null() || publication["place"]["lon"].is_null() {
        return Some("events_place_required");
    }
    None
}

/// `publicEventCell(lat, lon)`: the grid cell of a position (~11 km).
pub fn cell(lat: Option<&JsonValue>, lon: Option<&JsonValue>) -> i64 {
    let row = ((js::number(lat) + 90.0) / CELL_DEGREES).floor();
    let column = ((js::number(lon) + 180.0) / CELL_DEGREES).floor();
    (row * 10000.0 + column) as i64
}

/// `publicEventCellsAround(lat, lon, radiusKm)`: the cells covering a radius around a position.
pub fn cells_around(lat: f64, lon: f64, radius_km: f64) -> Vec<i64> {
    let lat_span = radius_km / 111.0;
    let lon_span = radius_km / (111.0 * (lat * std::f64::consts::PI / 180.0).cos().max(0.05));
    let index = |value: f64, shift: f64| ((value + shift) / CELL_DEGREES).floor() as i64;
    let mut cells = Vec::new();
    for row in index(lat - lat_span, 90.0)..=index(lat + lat_span, 90.0) {
        for column in index(lon - lon_span, 180.0)..=index(lon + lon_span, 180.0) {
            cells.push(row * 10000 + column);
        }
    }
    cells
}

/// `distanceKm(from, lat, lon)`: the great-circle distance in km, to a tenth; none when a position is unknown.
pub fn distance_km(from: Option<(f64, f64)>, lat: f64, lon: f64) -> Option<f64> {
    let (from_lat, from_lon) = from?;
    if !(lat.is_finite() && lon.is_finite() && from_lat.is_finite() && from_lon.is_finite()) {
        return None;
    }
    let rad = std::f64::consts::PI / 180.0;
    let (d_lat, d_lon) = ((lat - from_lat) * rad, (lon - from_lon) * rad);
    let a = (d_lat / 2.0).sin().powi(2)
        + (from_lat * rad).cos() * (lat * rad).cos() * (d_lon / 2.0).sin().powi(2);
    // `Math.round(x * 10) / 10`: halves round up.
    Some((12742.0 * a.sqrt().asin() * 10.0 + 0.5).floor() / 10.0)
}
