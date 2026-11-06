// The public `shows-nearby` operation of /ws/api (server/ws_shows.js, ported): what is on around a
// position, for the Spectacles rubric of the Dashboard. Every answer is one list of `show` entries,
// a page at a time (`pageToken`):
// - OpenAgenda kinds (`concerts`, `stage`, `expos`, `events`, `family`, `free`, `sport`, `outings`):
//   the public OpenAgenda events dataset (OpenDataSoft, no key), within `radiusKm`, soonest first;
// - places (`cinemas`, `heritage`, `restaurants`, `lodging`, `bars`): shows_places.rs;
// - `films`: the films showing in `region` (TMDB `now_playing`, `TMDB_API_KEY`), kept 12 h;
// - `matches`: the next match of each French professional league (TheSportsDB), kept an hour;
// - tourism kinds (`museums`, `nature`, `hiking`, `experiences`, `wellbeing`): shows_tourism.rs;
// - `declared`: the events users declared around (the public events' owner,
//   social/public_events/reading.rs); with `eventId`, that one announcement alone;
// - `sources`: which keyed sources this server holds (`{ tourism }`).
// `sort` (SHOWS_SORTS of atome/src/squirrel/shows/contracts.js): the order a kind can be read in.
use super::common::{environment, number, number_text, reply, text, warn};
use super::public_source::RateLimit;
use super::{Asker, shows_listings, shows_places, shows_tourism};
use crate::providers::http::send;
use crate::social::public_events::contract::distance_km;
use crate::social::public_events::reading::Around;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{LazyLock, OnceLock};
use std::time::Duration;

pub(super) const KIND: &str = "shows-nearby";
pub(super) const ODS: &str = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets";
pub(super) const PAGE_SIZE: usize = 25;
const MAX_OFFSET: f64 = 9900.0;
const DATED: &[&str] = &["date", "distance", "name"];
const PLACED: &[&str] = &["distance", "name"];
const UNPOSITIONED: [&str; 3] = ["films", "matches", "sources"];

static LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 30));
// The keys, read once from the environment and the development secret files.
static KEYS: OnceLock<(String, String)> = OnceLock::new();

/// A provider read that failed: its cause and HTTP status (0 when none).
pub(super) type Failed = (String, u16);

/// What a request asks (`readSpec`).
pub(super) struct Spec {
    pub kind: String,
    pub lat: f64,
    pub lon: f64,
    pub radius_km: f64,
    pub offset: usize,
    pub region: String,
    pub language: String,
    pub sort: String,
    pub categories: Vec<String>,
    pub query: String,
}

fn sorts(kind: &str) -> &'static [&'static str] {
    match kind {
        "concerts" | "stage" | "expos" | "events" | "family" | "free" | "sport" | "outings" => {
            DATED
        }
        "cinemas" | "heritage" | "restaurants" | "lodging" | "bars" => PLACED,
        _ => &[],
    }
}

fn known_kind(kind: &str) -> bool {
    shows_listings::AGENDA_WORDS
        .iter()
        .any(|(name, _)| *name == kind)
        || shows_places::PLACES.iter().any(|place| place.kind == kind)
        || shows_tourism::kind(kind).is_some()
        || ["films", "matches", "sources", "declared"].contains(&kind)
}

/// `Math.round(x)`.
fn round(value: f64) -> f64 {
    (value + 0.5).floor()
}

enum Asked {
    Spec(Spec),
    // One announcement by its link: no place or category needed, the reader's position when given.
    Event {
        id: String,
        from: Option<(f64, f64)>,
        language: String,
    },
}

fn read_spec(message: &JsonValue) -> Option<Asked> {
    let kind = text(message.get("kind"));
    let (lat, lon) = (number(message.get("lat")), number(message.get("lon")));
    let radius_km = round(number(message.get("radiusKm")));
    let offset = if js::truthy(message.get("pageToken")) {
        number(message.get("pageToken"))
    } else {
        0.0
    };
    let region = text(message.get("region")).to_uppercase();
    let language = text(message.get("language")).to_lowercase();
    if !known_kind(&kind)
        || !offset.is_finite()
        || offset.fract() != 0.0
        || !(0.0..=MAX_OFFSET).contains(&offset)
    {
        return None;
    }
    let event_id = if kind == "declared" {
        js::slice(&text(message.get("eventId")), 200)
    } else {
        String::new()
    };
    if !event_id.is_empty() {
        let from = (lat.is_finite() && lon.is_finite()).then_some((lat, lon));
        return Some(Asked::Event {
            id: event_id,
            from,
            language,
        });
    }
    if !UNPOSITIONED.contains(&kind.as_str())
        && (!(-90.0..=90.0).contains(&lat)
            || !(-180.0..=180.0).contains(&lon)
            || !(1.0..=100.0).contains(&radius_km))
    {
        return None;
    }
    let letters = |text: &str, upper: bool| {
        text.len() == 2
            && text.bytes().all(|b| {
                if upper {
                    b.is_ascii_uppercase()
                } else {
                    b.is_ascii_lowercase()
                }
            })
    };
    if kind == "films" && (!letters(&region, true) || !letters(&language, false)) {
        return None;
    }
    let sorts = sorts(&kind);
    let sort = Some(text(message.get("sort")))
        .filter(|sort| !sort.is_empty())
        .unwrap_or_else(|| sorts.first().copied().unwrap_or("").to_string());
    if !sort.is_empty() && !sorts.contains(&sort.as_str()) {
        return None;
    }
    let categories: Vec<String> = message
        .get("categories")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(|category| text(Some(category)))
        .filter(|category| !category.is_empty())
        .take(13)
        .collect();
    if kind == "declared" && categories.is_empty() {
        return None;
    }
    // A word typed in the bottom field, safe inside an ODSQL string.
    let query = js::slice(&text(message.get("query")).replace(['"', '\\'], " "), 80);
    Some(Asked::Spec(Spec {
        kind,
        lat,
        lon,
        radius_km,
        offset: offset as usize,
        region,
        language,
        sort,
        categories,
        query,
    }))
}

// `loadLocalShowsConfig` and `loadLocalTourismConfig`: the TMDB and DATAtourisme keys.
fn keys() -> Result<&'static (String, String), String> {
    if let Some(keys) = KEYS.get() {
        return Ok(keys);
    }
    let (settings, root) = environment()?;
    let shows = settings.secret_file(
        root,
        "ATOME_SHOWS_ENV_FILE",
        "tmdb.env",
        &["TMDB_API_KEY"],
        "shows_secret_file",
    )?;
    let tourism = settings.secret_file(
        root,
        "ATOME_TOURISM_ENV_FILE",
        "datatourisme.env",
        &["DATATOURISME_API_KEY"],
        "tourism_secret_file",
    )?;
    let key = |name: &str, file: &HashMap<String, String>| {
        js::trim(
            &settings
                .value(name)
                .or_else(|| file.get(name).cloned())
                .unwrap_or_default(),
        )
        .to_string()
    };
    Ok(KEYS.get_or_init(|| {
        (
            key("TMDB_API_KEY", &shows),
            key("DATATOURISME_API_KEY", &tourism),
        )
    }))
}

/// `readJson(url)`: a provider's JSON answer, no redirect, within 8 s.
pub(super) async fn read_json(request: reqwest::RequestBuilder) -> Result<JsonValue, Failed> {
    let response = send(
        request
            .timeout(Duration::from_secs(8))
            .header("accept", "application/json"),
    )
    .await
    .map_err(|failure| (failure.message, 0))?;
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return Err((format!("status_{status}"), status));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| (format!("terminated: {error}"), 0))?;
    super::common::response_json(&bytes).map_err(|error| (error, 0))
}

/// `geom'POINT(lon lat)'`.
pub(super) fn point(spec: &Spec) -> String {
    format!(
        "geom'POINT({} {})'",
        number_text(spec.lon),
        number_text(spec.lat)
    )
}

/// `httpsUrl(value)`: an https address as WHATWG writes it, else none.
pub(super) fn https_url(value: Option<&JsonValue>) -> String {
    match super::public_source::parse_url(&text(value), None) {
        Ok(url) if url.scheme() == "https" => url.to_string(),
        _ => String::new(),
    }
}

/// `geo(value)`: a record's position, NaN when it has none.
pub(super) fn geo(value: Option<&JsonValue>) -> (f64, f64) {
    match value {
        Some(value) if value.is_object() => (number(value.get("lat")), number(value.get("lon"))),
        _ => (f64::NAN, f64::NAN),
    }
}

/// `distanceKm(spec, lat, lon)` as JSON.
pub(super) fn distance(spec: &Spec, lat: f64, lon: f64) -> JsonValue {
    distance_km(Some((spec.lat, spec.lon)), lat, lon).map_or(JsonValue::Null, js::number_json)
}

/// The list of a payload's `results`.
pub(super) fn results(payload: &JsonValue, key: &str) -> Vec<JsonValue> {
    payload
        .get(key)
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default()
}

/// `Number(payload?.total_count) || 0`.
pub(super) fn total(value: Option<&JsonValue>) -> f64 {
    let total = number(value);
    if total.is_nan() { 0.0 } else { total }
}

// A whole list read once (films, matches), filtered by the field and cut in pages.
fn page_of(entries: &[JsonValue], spec: &Spec) -> (f64, Vec<JsonValue>) {
    let needle = spec.query.to_lowercase();
    let found: Vec<&JsonValue> = entries
        .iter()
        .filter(|entry| {
            let or_empty = |key: &str| super::common::or_empty(entry.get(key));
            needle.is_empty()
                || format!(
                    "{} {} {}",
                    js::text(entry.get("title")),
                    or_empty("league"),
                    or_empty("sport")
                )
                .to_lowercase()
                .contains(&needle)
        })
        .collect();
    (
        found.len() as f64,
        found
            .into_iter()
            .skip(spec.offset)
            .take(PAGE_SIZE)
            .cloned()
            .collect(),
    )
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let request_id = super::common::request_id(message);
    let Some(asked) = read_spec(message) else {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "shows_request_invalid" }),
        ));
    };
    if LIMITED.limited(asker.address, now) {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "shows_rate_limited" }),
        ));
    }
    let (key, tourism_key) = keys()?;
    let social = &asker.connection.ws_api.social;
    let viewer = asker.principal.as_deref();
    let spec = match asked {
        Asked::Event { id, from, language } => {
            return Ok(
                match social
                    .events
                    .one(&social.directory, &id, from, &language, viewer)
                    .await
                {
                    Ok(found) => reply(
                        KIND,
                        message,
                        json!({ "ok": true, "entries": found["entries"], "nextPageToken": found["next"] }),
                    ),
                    Err(cause) => unavailable(message, &request_id, "declared", (cause, 0)),
                },
            );
        }
        Asked::Spec(spec) => spec,
    };
    if spec.kind == "sources" {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": true, "entries": [], "nextPageToken": "", "sources": { "tourism": !tourism_key.is_empty() } }),
        ));
    }
    if spec.kind == "films" && key.is_empty() {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "shows_films_not_configured" }),
        ));
    }
    let tourism = shows_tourism::kind(&spec.kind).is_some();
    if tourism && tourism_key.is_empty() {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "shows_tourism_not_configured" }),
        ));
    }
    if spec.kind == "declared" {
        let around = Around {
            lat: spec.lat,
            lon: spec.lon,
            radius_km: spec.radius_km,
            categories: &spec.categories,
            query: &spec.query,
            offset: spec.offset,
            language: &spec.language,
            viewer,
        };
        return Ok(
            match social.events.nearby(&social.directory, &around).await {
                Ok(found) => reply(
                    KIND,
                    message,
                    json!({ "ok": true, "entries": found["entries"], "nextPageToken": found["next"] }),
                ),
                Err(cause) => unavailable(message, &request_id, &spec.kind, (cause, 0)),
            },
        );
    }
    let read = if tourism {
        shows_tourism::read(&spec, tourism_key, now).await
    } else if shows_places::PLACES
        .iter()
        .any(|place| place.kind == spec.kind)
    {
        shows_places::read(&spec).await
    } else if spec.kind == "films" {
        shows_listings::read_films(&spec, key, now)
            .await
            .map(|entries| page_of(&entries, &spec))
    } else if spec.kind == "matches" {
        shows_listings::read_matches(now)
            .await
            .map(|entries| page_of(&entries, &spec))
    } else {
        shows_listings::read_agenda(&spec, now).await
    };
    let (total, mut entries) = match read {
        Ok(read) => read,
        Err((cause, _)) if cause == "shows_tourism_busy" => {
            return Ok(reply(
                KIND,
                message,
                json!({ "ok": false, "error": "shows_tourism_busy" }),
            ));
        }
        Err(failed) => return Ok(unavailable(message, &request_id, &spec.kind, failed)),
    };
    // Bien-être's places are the thermal card's too; `total`: how many lie around.
    if spec.kind == "wellbeing" {
        for entry in &mut entries {
            entry["thermal"] = json!(true);
        }
    }
    let next = spec.offset + PAGE_SIZE;
    let next_token = if (next as f64) < total.min(MAX_OFFSET) {
        next.to_string()
    } else {
        String::new()
    };
    Ok(reply(
        KIND,
        message,
        json!({ "ok": true, "entries": entries, "total": js::number_json(total), "nextPageToken": next_token }),
    ))
}

fn unavailable(
    message: &JsonValue,
    request_id: &JsonValue,
    kind: &str,
    (cause, status): Failed,
) -> JsonValue {
    warn(
        "shows",
        request_id,
        "shows_unavailable",
        json!({ "kind": kind, "status": status, "cause": js::slice(&cause, 300) }),
    );
    reply(
        KIND,
        message,
        json!({ "ok": false, "error": "shows_unavailable" }),
    )
}
