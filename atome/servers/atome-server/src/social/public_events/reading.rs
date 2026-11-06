// Reading the base (server/public_events.js `nearby`, `one`, `refresh`, `entryOf`, `priceLabel`,
// ported): the `declared` kind of `shows-nearby` (ws_api/sources/shows.rs). Before every read the
// time passing is applied: the ended occurrences go, and the repeated series near their horizon are
// projected again.
use super::PublicEvents;
use super::contract::{cells_around, distance_km, parse};
use crate::social::directory::Directory;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::sync::LazyLock;

const DAY_MS: i64 = 24 * 3600 * 1000;
const PAGE_SIZE: usize = 25;
// A repeated series is projected again once less than this is left of its horizon.
const REFRESH_MARGIN_MS: i64 = 30 * DAY_MS;

/// What a reader asks: where, within which radius, which categories, which words, from which offset.
pub struct Around<'a> {
    pub lat: f64,
    pub lon: f64,
    pub radius_km: f64,
    pub categories: &'a [String],
    pub query: &'a str,
    pub offset: usize,
    pub language: &'a str,
    pub viewer: Option<&'a str>,
}

// `text(value, max)`: `String(value == null ? '' : value).trim().slice(0, max)`.
fn text(value: Option<&JsonValue>, max: usize) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        value => js::slice(js::trim(&js::text(value)), max),
    }
}

// `value || ''`.
fn or_empty(value: Option<&JsonValue>) -> JsonValue {
    value
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(json!(""))
}

// The currency formats of Node's ICU (`Intl.NumberFormat(language, { style: 'currency' })`), per
// language and currency, generated from it (currency_formats.json; temp/l39_sources/price_table_gen.mjs).
// `spaced` holds a language's two sides when the symbol touching the number is not a symbol (ICU's
// currency spacing: `CHF 0.50`, but `€0.50`); `affixes` ICU's own sides, symbol written, for the
// language and currency it writes otherwise.
struct Formats {
    patterns: JsonValue,
    root: JsonValue,
    spaced: JsonValue,
    root_spaced: JsonValue,
    affixes: JsonValue,
    defaults: JsonValue,
    symbols: JsonValue,
    root_symbols: JsonValue,
    digits: JsonValue,
}

static SYMBOL_OR_SPACE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^[\p{S}\p{Z}]$").expect("symbol class"));

static FORMATS: LazyLock<Formats> = LazyLock::new(|| {
    let mut data: JsonValue =
        serde_json::from_str(include_str!("currency_formats.json")).expect("currency formats");
    let mut take = |key: &str| data[key].take();
    Formats {
        patterns: take("patterns"),
        root: take("root"),
        spaced: take("spaced"),
        root_spaced: take("root_spaced"),
        affixes: take("affixes"),
        defaults: take("defaults"),
        symbols: take("symbols"),
        root_symbols: take("root_symbols"),
        digits: take("digits"),
    }
});

// `amount` written with `digits` fraction digits, halves away from zero, as ICU rounds.
fn fixed(amount: f64, digits: usize) -> (String, String) {
    let shortest = js::number_json(amount).to_string();
    let (whole, fraction) = shortest.split_once('.').unwrap_or((&shortest, ""));
    let mut digits_all: Vec<u8> = whole
        .bytes()
        .chain(fraction.bytes().chain(std::iter::repeat(b'0')).take(digits))
        .collect();
    if fraction
        .as_bytes()
        .get(digits)
        .is_some_and(|next| *next >= b'5')
    {
        let mut at = digits_all.len();
        loop {
            if at == 0 {
                digits_all.insert(0, b'1');
                break;
            }
            at -= 1;
            if digits_all[at] == b'9' {
                digits_all[at] = b'0';
            } else {
                digits_all[at] += 1;
                break;
            }
        }
    }
    let split = digits_all.len() - digits;
    let text = String::from_utf8(digits_all).expect("ascii digits");
    (text[..split].to_string(), text[split..].to_string())
}

/// `priceLabel(price, language)`: the price in the reader's language, none for a free event.
pub fn price_label(price: Option<&JsonValue>, language: &str) -> Result<String, String> {
    let Some(amount) = price
        .and_then(|price| price.get("amount"))
        .filter(|amount| js::truthy(Some(amount)))
    else {
        return Ok(String::new());
    };
    let language = if language.is_empty() { "fr" } else { language };
    let primary = language
        .split(['-', '_'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let well_formed = language
        .split('-')
        .all(|tag| (1..=8).contains(&tag.len()) && tag.bytes().all(|b| b.is_ascii_alphanumeric()))
        && ((2..=3).contains(&primary.len()) || (5..=8).contains(&primary.len()))
        && primary.bytes().all(|b| b.is_ascii_alphabetic());
    if !well_formed {
        return Err(format!(
            "RangeError: Incorrect locale information provided {language}"
        ));
    }
    let currency = price
        .and_then(|price| price.get("currency"))
        .filter(|currency| js::truthy(Some(currency)))
        .map_or_else(|| "EUR".to_string(), |currency| js::text(Some(currency)));
    let formats = &*FORMATS;
    let known = formats.patterns.get(&primary);
    let pattern = known.unwrap_or(&formats.root);
    let symbol = match known {
        Some(_) => formats.symbols[&primary]
            .get(&currency)
            .or_else(|| formats.defaults.get(&currency)),
        None => formats.root_symbols.get(&currency),
    }
    .and_then(JsonValue::as_str)
    .unwrap_or(&currency)
    .to_string();
    let digits = formats
        .digits
        .get(&currency)
        .and_then(JsonValue::as_u64)
        .unwrap_or(2) as usize;
    let field = |index: usize| pattern[index].as_str().unwrap_or("").to_string();
    let size = |index: usize| pattern[index].as_u64().unwrap_or(3) as usize;
    let (group, decimal, zero) = (field(2), field(3), field(7));
    // ICU's `[[:^S:]&[:^Z:]]`: a symbol's end that takes a space beside the number.
    let spaces = |end: Option<char>| {
        end.is_some_and(|c| !SYMBOL_OR_SPACE.is_match(c.encode_utf8(&mut [0; 4])))
    };
    let spaced = known.map_or(&formats.root_spaced, |_| &formats.spaced[&primary]);
    let side = |index: usize, end: Option<char>| {
        let sides = if spaces(end) { spaced } else { pattern };
        sides[index].as_str().unwrap_or("").to_string()
    };
    let own = formats.affixes[if known.is_some() {
        primary.as_str()
    } else {
        "root"
    }]
    .get(&currency);
    let (before, after) = match own {
        Some(own) => (
            own[0].as_str().unwrap_or("").to_string(),
            own[1].as_str().unwrap_or("").to_string(),
        ),
        None => (
            side(0, symbol.chars().last()).replace('¤', &symbol),
            side(1, symbol.chars().next()).replace('¤', &symbol),
        ),
    };
    let (primary_size, secondary_size, min_group) = (size(4), size(5), size(6));
    let (whole, fraction) = fixed(js::number(Some(amount)), digits);
    // Grouped from the right: the first group `primary_size` long, the others `secondary_size`,
    // none below `primary_size + min_group` digits.
    let mut grouped = String::new();
    if whole.len() >= primary_size + min_group {
        let (head, tail) = whole.split_at(whole.len() - primary_size);
        let mut groups = vec![tail.to_string()];
        let mut rest = head.to_string();
        while rest.len() > secondary_size {
            let at = rest.len() - secondary_size;
            groups.insert(0, rest[at..].to_string());
            rest.truncate(at);
        }
        groups.insert(0, rest);
        grouped.push_str(&groups.join(&group));
    } else {
        grouped.push_str(&whole);
    }
    if !fraction.is_empty() {
        grouped.push_str(&decimal);
        grouped.push_str(&fraction);
    }
    let zero = zero.chars().next().unwrap_or('0');
    let native: String = grouped
        .chars()
        .map(|c| {
            c.to_digit(10)
                .and_then(|d| char::from_u32(zero as u32 + d))
                .unwrap_or(c)
        })
        .collect();
    Ok(format!("{before}{native}{after}"))
}

impl PublicEvents {
    // The time passing: the dates of repeated series beyond their horizon, the ended occurrences gone.
    async fn refresh(&self, directory: &Directory, now: i64) -> Result<(), String> {
        for row in self
            .store
            .purge_and_stale(now, now + REFRESH_MARGIN_MS)
            .await?
        {
            let (author, event) = (js::string(&row["author_id"]), js::string(&row["event_id"]));
            self.project(directory, &author, &event).await?;
        }
        Ok(())
    }

    async fn blocked(&self, viewer: Option<&str>, row: &JsonValue) -> Result<bool, String> {
        let author = js::string(&row["author_id"]);
        match viewer {
            Some(viewer) if !viewer.is_empty() && viewer != author => {
                self.store.blocked(viewer, &author).await
            }
            _ => Ok(false),
        }
    }

    // A row of the base as the reader receives it: the public fields only, its distance when known.
    fn entry_of(
        row: &JsonValue,
        payload: &JsonValue,
        distance: Option<f64>,
        language: &str,
    ) -> Result<JsonValue, String> {
        let place = payload.get("place");
        let place_field = |key: &str| or_empty(place.and_then(|place| place.get(key)));
        let mut entry = json!({ "id": format!("declared_{}", js::string(&row["occurrence_id"])), "kind": "event",
            "declared": true, "eventId": row["event_id"], "authorId": js::string(&row["author_id"]),
            "organizer": text(row.get("author_name"), 80) });
        let object = entry.as_object_mut().expect("entry");
        if let Some(title) = payload.get("title") {
            object.insert("title".into(), title.clone());
        }
        for (key, value) in [
            ("summary", or_empty(payload.get("summary"))),
            ("start", row["start_at"].clone()),
            ("end", row["end_at"].clone()),
            ("place", place_field("label")),
            ("address", place_field("address")),
            ("city", place_field("city")),
            ("lat", js::number_json(js::number(row.get("lat")))),
            ("lon", js::number_json(js::number(row.get("lon")))),
            (
                "distanceKm",
                distance.map_or(JsonValue::Null, js::number_json),
            ),
            ("free", json!(row["free"] == json!(1))),
            ("price", json!(price_label(payload.get("price"), language)?)),
            (
                "categories",
                payload
                    .get("categories")
                    .filter(|c| js::truthy(Some(c)))
                    .cloned()
                    .unwrap_or(json!([])),
            ),
            ("image", or_empty(payload.get("poster"))),
            ("url", or_empty(payload.get("url"))),
            ("ticketUrl", or_empty(payload.get("ticketUrl"))),
        ] {
            object.insert(key.into(), value);
        }
        Ok(entry)
    }

    /// `shows-nearby` kind `declared`: the occurrences of `categories` within the radius, soonest
    /// first, a page at a time (`{ entries, next }`).
    pub async fn nearby(
        &self,
        directory: &Directory,
        around: &Around<'_>,
    ) -> Result<JsonValue, String> {
        let now = chrono::Utc::now().timestamp_millis();
        self.refresh(directory, now).await?;
        let needle = text(Some(&json!(around.query)), 80).to_lowercase();
        let rows = self
            .store
            .around(
                cells_around(around.lat, around.lon, around.radius_km),
                now,
                2000,
            )
            .await?;
        let mut kept = Vec::new();
        for row in rows {
            let payload = parse(row.get("payload_json"));
            let payload = if js::truthy(Some(&payload)) {
                payload
            } else {
                json!({})
            };
            let distance = distance_km(
                Some((around.lat, around.lon)),
                js::number(row.get("lat")),
                js::number(row.get("lon")),
            );
            if distance.is_none_or(|distance| distance > around.radius_km) {
                continue;
            }
            let categories = js::text(row.get("categories"));
            if !around
                .categories
                .iter()
                .any(|slug| categories.contains(&format!(",{slug},")))
            {
                continue;
            }
            let place = payload.get("place");
            let place_text = |key: &str| js::text(place.and_then(|place| place.get(key)));
            let haystack = format!(
                "{} {} {} {}",
                js::text(payload.get("title")),
                place_text("label"),
                place_text("city"),
                js::text(row.get("author_name"))
            );
            if !needle.is_empty() && !haystack.to_lowercase().contains(&needle) {
                continue;
            }
            if self.blocked(around.viewer, &row).await? {
                continue;
            }
            kept.push(Self::entry_of(&row, &payload, distance, around.language)?);
        }
        let page: Vec<JsonValue> = kept
            .iter()
            .skip(around.offset)
            .take(PAGE_SIZE)
            .cloned()
            .collect();
        let next = if around.offset + PAGE_SIZE < kept.len() {
            (around.offset + PAGE_SIZE).to_string()
        } else {
            String::new()
        };
        Ok(json!({ "entries": page, "next": next }))
    }

    /// `shows-nearby` kind `declared` with `eventId`: one announcement by its link, its next
    /// occurrence (none when withdrawn, hidden, past or of someone the reader blocked).
    pub async fn one(
        &self,
        directory: &Directory,
        event_id: &str,
        from: Option<(f64, f64)>,
        language: &str,
        viewer: Option<&str>,
    ) -> Result<JsonValue, String> {
        let now = chrono::Utc::now().timestamp_millis();
        self.refresh(directory, now).await?;
        let row = self
            .store
            .upcoming(&text(Some(&json!(event_id)), 200), now)
            .await?;
        let Some(row) = row else {
            return Ok(json!({ "entries": [], "next": "" }));
        };
        if self.blocked(viewer, &row).await? {
            return Ok(json!({ "entries": [], "next": "" }));
        }
        let payload = parse(row.get("payload_json"));
        let payload = if js::truthy(Some(&payload)) {
            payload
        } else {
            json!({})
        };
        let distance = from.and_then(|from| {
            distance_km(
                Some(from),
                js::number(row.get("lat")),
                js::number(row.get("lon")),
            )
        });
        Ok(json!({ "entries": [Self::entry_of(&row, &payload, distance, language)?], "next": "" }))
    }
}
