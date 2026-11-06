// `gps-resource` (server/wsGpsOperations.js + server/gps_provider.js, ported): bounded requests to
// the operator's map services, not a second account/state transport. Only operator-configured URLs
// are reachable (`ATOME_GPS_VALHALLA_URL`, `ATOME_GPS_GEOCODER_URL`, `ATOME_GPS_TILE_URL`); every
// failure answers one of GPS_ERRORS (atome/src/squirrel/gps/contracts.js).
use super::common::{length, number, ok_with, or_empty, parse, plain, setting};
use super::gps_route::{normalize, point, valid};
use super::{Asker, response};
use crate::providers::http;
use crate::vault_router::js;
use base64::Engine;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const KIND: &str = "gps-resource";
const UNAVAILABLE: &str = "PROVIDER_UNAVAILABLE";
const INVALID_RESPONSE: &str = "INVALID_PROVIDER_RESPONSE";
const SETTINGS: [&str; 3] = [
    "ATOME_GPS_VALHALLA_URL",
    "ATOME_GPS_GEOCODER_URL",
    "ATOME_GPS_TILE_URL",
];

// Each address's window: its start and its count.
static WINDOWS: LazyLock<Mutex<HashMap<String, (f64, u32)>>> = LazyLock::new(Mutex::default);

type Failed<T> = Result<T, &'static str>;

fn env(name: &str) -> Failed<String> {
    setting(name)
        .map(Option::unwrap_or_default)
        .map_err(|_| UNAVAILABLE)
}

/// `configuredUrl(value)`.
fn configured_url(value: &str) -> Failed<url::Url> {
    if value.is_empty() {
        return Err("NOT_CONFIGURED");
    }
    let url = url::Url::parse(value).map_err(|_| UNAVAILABLE)?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("NOT_CONFIGURED");
    }
    Ok(url)
}

// `url.pathname = `${url.pathname.replace(/\/$/, '')}/<leaf>``.
fn under(mut url: url::Url, leaf: &str) -> url::Url {
    let path = format!(
        "{}/{leaf}",
        url.path().strip_suffix('/').unwrap_or(url.path())
    );
    url.set_path(&path);
    url
}

/// `get(url, options, maxBytes, allowRouteError)`: the bounded answer and its content type.
async fn get(
    url: &url::Url,
    body: Option<String>,
    accept: &str,
    max: usize,
    route: bool,
) -> Failed<(Vec<u8>, String)> {
    let mut request = http::following()
        .request(
            if body.is_some() {
                reqwest::Method::POST
            } else {
                reqwest::Method::GET
            },
            url.as_str(),
        )
        .timeout(Duration::from_secs(12))
        .header("User-Agent", "atome-gps/1.0 (+https://atome.one)")
        .header("Accept", accept);
    if let Some(body) = body {
        request = request
            .header("Content-Type", "application/json")
            .body(body);
    }
    let response = request.send().await.map_err(|_| UNAVAILABLE)?;
    let status = response.status().as_u16();
    if !(response.status().is_success() || (route && status == 400)) {
        return Err(if status == 429 {
            "RATE_LIMITED"
        } else {
            UNAVAILABLE
        });
    }
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
    };
    let declared = header("content-length");
    if number(declared.map(JsonValue::String).as_ref()) > max as f64 {
        return Err(INVALID_RESPONSE);
    }
    let kind = header("content-type").unwrap_or_default();
    let bytes = http::bytes(response, max).await.map_err(|failure| {
        if failure.message == "provider_result_too_large" {
            INVALID_RESPONSE
        } else {
            UNAVAILABLE
        }
    })?;
    Ok((bytes, kind))
}

fn describe() -> Failed<JsonValue> {
    let configured = SETTINGS
        .iter()
        .map(|name| env(name).map(|value| !value.is_empty()))
        .collect::<Failed<Vec<bool>>>()?
        .into_iter()
        .all(|set| set);
    Ok(
        json!({ "provider": "valhalla", "coverage": "FR", "configured": configured,
        "attribution": "© OpenStreetMap contributors" }),
    )
}

fn in_france((lat, lon): (f64, f64)) -> bool {
    valid(lat, lon) && (41.3..=51.2).contains(&lat) && (-5.2..=9.7).contains(&lon)
}

async fn route(input: &JsonValue) -> Failed<JsonValue> {
    // `[origin, ...waypoints, destination]`: `waypoints` defaults to none; a text spreads its
    // characters (never points), any other value is not iterable (a TypeError).
    let waypoints: Vec<Option<&JsonValue>> = match input.get("waypoints") {
        None => Vec::new(),
        Some(JsonValue::Array(items)) => items.iter().map(Some).collect(),
        Some(JsonValue::String(text)) => vec![None; length(text)],
        Some(_) => return Err(UNAVAILABLE),
    };
    let mut locations = vec![input.get("origin")];
    let count = waypoints.len();
    locations.extend(waypoints);
    locations.push(input.get("destination"));
    let points: Option<Vec<(f64, f64)>> = locations
        .iter()
        .map(|location| location.and_then(point))
        .collect();
    let Some(points) = points.filter(|_| count <= 16) else {
        return Err("INVALID_ARGUMENT");
    };
    if !points.iter().copied().all(in_france) {
        return Err("OUT_OF_COVERAGE");
    }
    let url = under(configured_url(&env("ATOME_GPS_VALHALLA_URL")?)?, "route");
    let body = json!({
        "locations": locations.iter().flatten().map(|location| json!({
            "lat": plain(&location["lat"]), "lon": plain(&location["lon"]) })).collect::<Vec<_>>(),
        "costing": "auto", "units": "kilometers", "language": "fr-FR",
    });
    let (bytes, _) = get(
        &url,
        Some(body.to_string()),
        "application/json",
        5_000_000,
        true,
    )
    .await?;
    let payload = parse(&bytes).ok_or(UNAVAILABLE)?;
    if payload.is_null() {
        return Err(UNAVAILABLE);
    }
    if payload.get("error_code").and_then(JsonValue::as_f64) == Some(442.0) {
        return Err("NO_ROUTE");
    }
    normalize(&payload, &js::iso(crate::auth::now_ms() as i64))
}

async fn search(query: Option<&JsonValue>) -> Failed<JsonValue> {
    let Some(JsonValue::String(query)) = query else {
        return Err("INVALID_ARGUMENT");
    };
    if js::trim(query).is_empty() || length(query) > 200 {
        return Err("INVALID_ARGUMENT");
    }
    let mut url = under(configured_url(&env("ATOME_GPS_GEOCODER_URL")?)?, "search");
    let pairs = [
        ("q", js::trim(query)),
        ("format", "jsonv2"),
        ("countrycodes", "fr"),
        ("limit", "8"),
    ];
    url.set_query(Some(&http::form(&pairs)));
    let (bytes, _) = get(&url, None, "application/json", 100_000, false).await?;
    let JsonValue::Array(entries) = parse(&bytes).ok_or(UNAVAILABLE)? else {
        return Err(INVALID_RESPONSE);
    };
    let mut places = Vec::new();
    for entry in entries.iter().take(8) {
        if entry.is_null() {
            return Err(UNAVAILABLE);
        }
        let (lat, lon) = (number(entry.get("lat")), number(entry.get("lon")));
        if in_france((lat, lon)) {
            places.push(
                json!({ "lat": js::number_json(lat), "lon": js::number_json(lon),
                "label": js::slice(&or_empty(entry.get("display_name")), 512) }),
            );
        }
    }
    Ok(JsonValue::Array(places))
}

async fn tile(tile: &JsonValue) -> Failed<String> {
    if tile.is_null() {
        return Err(UNAVAILABLE);
    }
    let coordinate = |name: &str| super::common::integer(tile.get(name));
    let (Some(x), Some(y), Some(z)) = (coordinate("x"), coordinate("y"), coordinate("z")) else {
        return Err("INVALID_ARGUMENT");
    };
    let side = 2_f64.powf(z);
    if !(0.0..=19.0).contains(&z) || x < 0.0 || y < 0.0 || x >= side || y >= side {
        return Err("INVALID_ARGUMENT");
    }
    let template = env("ATOME_GPS_TILE_URL")?;
    if template.is_empty()
        || !["{z}", "{x}", "{y}"]
            .iter()
            .all(|key| template.contains(key))
    {
        return Err("NOT_CONFIGURED");
    }
    let address = template
        .replacen("{z}", &js::number_json(z).to_string(), 1)
        .replacen("{x}", &js::number_json(x).to_string(), 1)
        .replacen("{y}", &js::number_json(y).to_string(), 1);
    let (bytes, kind) = get(
        &configured_url(&address)?,
        None,
        "image/png",
        1_000_000,
        false,
    )
    .await?;
    if !kind.starts_with("image/png")
        || !bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    {
        return Err(INVALID_RESPONSE);
    }
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}

async fn tiles(tiles: Option<&JsonValue>) -> Failed<JsonValue> {
    let Some(tiles) = tiles
        .and_then(JsonValue::as_array)
        .filter(|tiles| tiles.len() <= 32)
    else {
        return Err("INVALID_ARGUMENT");
    };
    // Bound provider concurrency and the complete WS frame, including base64 expansion.
    let (mut answered, mut bytes) = (Vec::new(), 0);
    for entry in tiles {
        let source = tile(entry).await?;
        bytes += source.len();
        if bytes > 8_000_000 {
            return Err(INVALID_RESPONSE);
        }
        answered.push(js::with(&plain(entry), [("source", json!(source))]));
    }
    Ok(JsonValue::Array(answered))
}

// Whether `address` is past its window's 60 requests a minute; each request is counted.
fn limited(address: &str) -> bool {
    let now = crate::auth::now_ms();
    let key = if address.is_empty() {
        "unknown"
    } else {
        address
    };
    let mut windows = WINDOWS.lock().expect("gps windows");
    let mut entry = windows
        .get(key)
        .copied()
        .filter(|(at, _)| now - at < 60_000.0)
        .unwrap_or((now, 0));
    entry.1 += 1;
    windows.insert(key.to_string(), entry);
    if entry.1 > 60 {
        return true;
    }
    if windows.len() > 10_000 {
        windows.retain(|_, (at, _)| now - *at < 60_000.0);
    }
    false
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let respond = |fields: JsonValue| {
        response(
            KIND,
            message,
            fields.get("ok") == Some(&json!(true)),
            fields,
        )
    };
    let action = message
        .get("action")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let fallback = json!({});
    let input = message.get("input").unwrap_or(&fallback);
    if !["describe", "route", "search", "tiles"].contains(&action) || !input.is_object() {
        return Ok(respond(
            json!({ "success": false, "ok": false, "error": "INVALID_ARGUMENT" }),
        ));
    }
    if limited(asker.address) {
        return Ok(respond(
            json!({ "success": false, "ok": false, "error": "RATE_LIMITED" }),
        ));
    }
    let data = match action {
        "describe" => describe(),
        "route" => route(input).await.map(|route| json!({ "route": route })),
        "search" => search(input.get("query"))
            .await
            .map(|places| json!({ "places": places })),
        _ => tiles(input.get("tiles"))
            .await
            .map(|tiles| json!({ "tiles": tiles })),
    };
    Ok(respond(match data {
        Ok(data) => js::with(&ok_with(data), [("success", json!(true))]),
        Err(error) => json!({ "success": false, "ok": false, "error": error }),
    }))
}
