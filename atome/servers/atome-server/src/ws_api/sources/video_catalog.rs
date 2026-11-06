// `video-catalog` (server/ws_video_catalog.js, ported): the films and series of Divertissement ›
// Vidéo › Films & séries (eVe/domains/media/video_catalog_client.js), read from TMDB
// (video_titles.rs). A title is kept only when it can be watched without buying nor renting it:
// included in a service the user declared (`services`, the SERVICES keys) or free, with or
// without ads, on any channel. `discover`: the newest such titles, films and series together;
// `search`: the titles matching `query`; `similar`: what TMDB recommends after `ref` (`movie:<id>`,
// `tv:<id>`). `free: false` leaves the free channels out. A page at a time (`pageToken`: TMDB's
// own page). TMDB's availability comes from JustWatch.
use super::Asker;
use super::common::{either, number, number_or_zero, reply, request_id, text, warn};
use super::public_source::RateLimit;
use super::video_titles::{Failure, Kept, SERVICES, Spec, entries_of, key, read};
use crate::providers::http;
use crate::vault_router::js;
use chrono::{Datelike, TimeZone};
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;
use std::sync::LazyLock;

const KIND: &str = "video-catalog";
const PAGE_LIMIT: f64 = 500.0;
const SEARCH_PAGES: f64 = 3.0;
const FREE_YEARS: i32 = 2;
const LIST_TTL_MS: f64 = 60.0 * 60.0 * 1000.0;

static WINDOWS: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 60));
static LISTS: LazyLock<Kept> = LazyLock::new(Kept::new);

static REGION: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^[A-Z]{2}$").expect("region"));
static LANGUAGE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^[a-z]{2}$").expect("language"));
static REFERENCE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^(movie|tv):[0-9]{1,9}$").expect("reference"));

fn read_spec(message: &JsonValue) -> Option<Spec> {
    let op = text(message.get("op"));
    let region = text(message.get("region")).to_uppercase();
    let language = text(message.get("language")).to_lowercase();
    let page = if js::truthy(message.get("pageToken")) {
        number(message.get("pageToken"))
    } else {
        1.0
    };
    let query = js::slice(&text(message.get("query")), 120);
    let reference = text(message.get("ref"));
    let services: Vec<String> = match message.get("services") {
        Some(JsonValue::Array(items)) => items.iter().map(|item| text(Some(item))).collect(),
        _ => Vec::new(),
    };
    let valid = ["discover", "search", "similar"].contains(&op.as_str())
        && REGION.is_match(&region)
        && LANGUAGE.is_match(&language)
        && page.fract() == 0.0
        && (1.0..=PAGE_LIMIT).contains(&page);
    if !valid {
        return None;
    }
    let declared: Option<Vec<_>> = services
        .iter()
        .map(|key| SERVICES.iter().find(|service| service.key == key))
        .collect();
    let declared = declared.filter(|_| services.len() <= SERVICES.len())?;
    if (op == "search" && query.is_empty()) || (op == "similar" && !REFERENCE.is_match(&reference))
    {
        return None;
    }
    let mut provider_ids = Vec::new();
    for id in declared.iter().flat_map(|service| service.tmdb) {
        if !provider_ids.contains(id) {
            provider_ids.push(*id);
        }
    }
    Some(Spec {
        op,
        region,
        language,
        page,
        query,
        reference,
        free: message.get("free") != Some(&json!(false)),
        provider_ids,
    })
}

fn day(ms: f64) -> String {
    js::iso(ms as i64)[..10].to_string()
}

// `since.setFullYear(since.getFullYear() - years)` in the server's local time, a day past its
// month's end overflowing into the next.
fn years_before(now: f64, years: i32) -> f64 {
    let Some(local) = chrono::Local.timestamp_millis_opt(now as i64).single() else {
        return now;
    };
    let wall = local.naive_local();
    let shifted = chrono::NaiveDate::from_ymd_opt(wall.year() - years, wall.month(), 1)
        .and_then(|first| first.checked_add_days(chrono::Days::new(u64::from(wall.day() - 1))))
        .map(|date| date.and_time(wall.time()));
    let Some(shifted) = shifted else {
        return now;
    };
    // A local time a clock change skips is the one an hour later.
    let at = chrono::Local
        .from_local_datetime(&shifted)
        .earliest()
        .or_else(|| {
            chrono::Local
                .from_local_datetime(&(shifted + chrono::TimeDelta::hours(1)))
                .earliest()
        });
    at.map_or(now, |at| at.timestamp_millis() as f64)
}

// The newest titles of `media` on the declared services; `free`: the most watched of the last
// FREE_YEARS on free channels, any of them (their newest are mostly little-known imports).
async fn discover_page(
    media: &str,
    free: bool,
    spec: &Spec,
    key: &str,
    now: f64,
) -> Result<JsonValue, Failure> {
    let ids: Vec<String> = spec
        .provider_ids
        .iter()
        .map(|id| js::number_json(*id).to_string())
        .collect();
    if (!free && ids.is_empty()) || (free && !spec.free) {
        return Ok(json!({ "results": [], "total_pages": 0 }));
    }
    let date = if media == "movie" {
        "primary_release_date"
    } else {
        "first_air_date"
    };
    let (gte, lte) = (format!("{date}.gte"), format!("{date}.lte"));
    let mut params: Vec<(&str, String)> = vec![
        ("watch_region", spec.region.clone()),
        ("language", spec.locale()),
        ("page", js::number_json(spec.page).to_string()),
        (
            "with_watch_monetization_types",
            if free { "free|ads" } else { "flatrate" }.into(),
        ),
    ];
    if free {
        params.push((&gte, day(years_before(now, FREE_YEARS))));
    } else {
        params.push(("with_watch_providers", ids.join("|")));
    }
    params.push((
        "sort_by",
        if free {
            "popularity.desc".into()
        } else {
            format!("{date}.desc")
        },
    ));
    params.push((&lte, day(now)));
    params.push((
        "vote_count.gte",
        if media == "movie" { "20" } else { "10" }.into(),
    ));
    let cache = format!(
        "discover:{media}:{free}:{}:{}",
        ids.join(","),
        http::form(&params)
    );
    LISTS
        .get(
            cache,
            LIST_TTL_MS,
            now,
            read(key, &format!("discover/{media}"), &params),
        )
        .await
}

struct Title {
    media: String,
    id: JsonValue,
    date: String,
    popularity: f64,
}

fn results(payload: &JsonValue) -> &[JsonValue] {
    payload
        .get("results")
        .and_then(JsonValue::as_array)
        .map_or(&[], Vec::as_slice)
}

fn null_item() -> Failure {
    "TypeError: Cannot read properties of null".into()
}

async fn discover(spec: &Spec, key: &str, now: f64) -> Result<(Vec<JsonValue>, String), Failure> {
    let wanted = [
        ("movie", false),
        ("movie", true),
        ("tv", false),
        ("tv", true),
    ];
    let pages = futures_util::future::try_join_all(
        wanted
            .iter()
            .map(|(media, free)| discover_page(media, *free, spec, key, now)),
    )
    .await?;
    let titles = |free: bool| -> Result<Vec<Title>, Failure> {
        let mut titles = Vec::new();
        for ((media, _), payload) in wanted
            .iter()
            .zip(&pages)
            .filter(|((_, page_free), _)| *page_free == free)
        {
            for item in results(payload) {
                if item.is_null() {
                    return Err(null_item());
                }
                titles.push(Title {
                    media: media.to_string(),
                    id: item.get("id").cloned().unwrap_or(JsonValue::Null),
                    date: text(either(item.get("release_date"), item.get("first_air_date"))),
                    popularity: number_or_zero(item.get("popularity")),
                });
            }
        }
        Ok(titles)
    };
    // The declared services' newest first, then the free ones, the most watched first.
    let mut declared = titles(false)?;
    declared.sort_by(|a, b| b.date.cmp(&a.date));
    let mut free = titles(true)?;
    free.sort_by(|a, b| b.popularity.total_cmp(&a.popularity));
    let mut seen = HashSet::new();
    let found = declared
        .into_iter()
        .chain(free)
        .filter(|title| {
            js::truthy(Some(&title.id))
                && seen.insert(format!("{}:{}", title.media, js::text(Some(&title.id))))
        })
        .map(|title| (title.media, title.id))
        .collect();
    let more = pages
        .iter()
        .any(|payload| spec.page < PAGE_LIMIT.min(number_or_zero(payload.get("total_pages"))));
    let next = if more {
        js::number_json(spec.page + 1.0).to_string()
    } else {
        String::new()
    };
    Ok((entries_of(found, spec, key, now).await?, next))
}

// SEARCH_PAGES TMDB pages read at once (most matches are to buy or nowhere: one page keeps few).
async fn search_page(spec: &Spec, page: f64, key: &str, now: f64) -> Result<JsonValue, Failure> {
    let page = js::number_json(page).to_string();
    let params = [
        ("query", spec.query.clone()),
        ("language", spec.locale()),
        ("page", page.clone()),
        ("include_adult", "false".into()),
    ];
    let cache = format!("search:{}:{}:{page}", spec.language, spec.query);
    LISTS
        .get(cache, LIST_TTL_MS, now, read(key, "search/multi", &params))
        .await
}

async fn search(spec: &Spec, key: &str, now: f64) -> Result<(Vec<JsonValue>, String), Failure> {
    let first = search_page(spec, spec.page, key, now).await?;
    let total = PAGE_LIMIT.min(number_or_zero(first.get("total_pages")));
    let last = total.min(spec.page + SEARCH_PAGES - 1.0);
    let count = (last - spec.page).max(0.0) as usize;
    let others = futures_util::future::try_join_all(
        (1..=count).map(|index| search_page(spec, spec.page + index as f64, key, now)),
    )
    .await?;
    // TMDB's pages overlap: a title met on a previous page is not listed twice.
    let mut seen = HashSet::new();
    let mut found = Vec::new();
    for item in std::iter::once(&first).chain(&others).flat_map(results) {
        if item.is_null() {
            return Err(null_item());
        }
        let media = item
            .get("media_type")
            .and_then(JsonValue::as_str)
            .filter(|media| ["movie", "tv"].contains(media));
        let id = item.get("id");
        if let Some(media) = media
            && js::truthy(id)
            && seen.insert(format!("{media}:{}", js::text(id)))
        {
            found.push((media.to_string(), id.cloned().unwrap_or(JsonValue::Null)));
        }
    }
    let next = if last < total {
        js::number_json(last + 1.0).to_string()
    } else {
        String::new()
    };
    Ok((entries_of(found, spec, key, now).await?, next))
}

async fn similar(spec: &Spec, key: &str, now: f64) -> Result<(Vec<JsonValue>, String), Failure> {
    let (media, id) = spec
        .reference
        .split_once(':')
        .unwrap_or((&spec.reference, ""));
    let params = [("language", spec.locale()), ("page", "1".into())];
    let payload = read(key, &format!("{media}/{id}/recommendations"), &params).await?;
    let mut found = Vec::new();
    for item in results(&payload) {
        if item.is_null() {
            return Err(null_item());
        }
        if js::truthy(item.get("id")) {
            found.push((media.to_string(), item["id"].clone()));
        }
    }
    Ok((entries_of(found, spec, key, now).await?, String::new()))
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let Some(spec) = read_spec(message) else {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "video_catalog_request_invalid" }),
        ));
    };
    let now = crate::auth::now_ms();
    if WINDOWS.limited(asker.address, now as i64) {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "video_catalog_rate_limited" }),
        ));
    }
    let key = key()?;
    if key.is_empty() {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "video_catalog_not_configured" }),
        ));
    }
    let found = match spec.op.as_str() {
        "discover" => discover(&spec, &key, now).await,
        "search" => search(&spec, &key, now).await,
        _ => similar(&spec, &key, now).await,
    };
    Ok(reply(
        KIND,
        message,
        match found {
            Ok((entries, next)) => json!({ "ok": true, "entries": entries, "nextPageToken": next }),
            Err(failure) => {
                warn(
                    "video_catalog",
                    &request_id(message),
                    "video_catalog_unavailable",
                    json!({ "op": spec.op,
                "status": failure.status, "cause": js::slice(&failure.cause, 300) }),
                );
                json!({ "ok": false, "error": "video_catalog_unavailable" })
            }
        },
    ))
}
