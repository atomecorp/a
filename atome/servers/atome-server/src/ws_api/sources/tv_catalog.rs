// `tv-catalog` / `tv-resolve` (server/ws_tv_catalog.js, ported): the public television catalogue
// (tv_build.rs), built on the server, cached and refreshed; clients only receive one country (or a
// few channel ids, or a name search) at a time. A channel's YouTube "/live" address is resolved to
// the video it streams now, on demand.
use super::common::{or_empty, reply, request_id, warn};
use super::tv_build::{Catalog, Sources, build};
use super::tv_streams::{YOUTUBE_LIVE, by_name, country_code, normalize};
use crate::providers::http::following;
use crate::vault_router::js;
use futures_util::FutureExt;
use futures_util::future::{BoxFuture, Shared};
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

pub(super) const CATALOG: &str = "tv-catalog";
pub(super) const RESOLVE: &str = "tv-resolve";

const IPTV_ORG_API: &str = "https://iptv-org.github.io/api";
const FREE_TV_PLAYLIST: &str =
    "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";
const REFRESH_MS: i64 = 12 * 60 * 60 * 1000;
const RETRY_MS: i64 = 10 * 60 * 1000;
const FETCH_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_CHANNELS: usize = 800;
const MAX_IDS: usize = 200;
const MAX_MATCHES: usize = 25;
const LIVE_CACHE_MS: i64 = 20 * 60 * 1000;
const LIVE_PAGE_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

type Building = Shared<BoxFuture<'static, Option<Arc<Catalog>>>>;

#[derive(Default)]
struct Store {
    catalog: Option<Arc<Catalog>>,
    building: Option<Building>,
    next_attempt_at: i64,
}

static STORE: LazyLock<Mutex<Store>> = LazyLock::new(Mutex::default);
static LIVE_VIDEOS: LazyLock<Mutex<HashMap<String, (String, i64)>>> = LazyLock::new(Mutex::default);
static CANONICAL: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r#"<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})""#,
    )
    .expect("canonical")
});

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

async fn get(url: String) -> Result<reqwest::Response, String> {
    let response = following()
        .get(&url)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("fetch failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("{url} {}", response.status().as_u16()));
    }
    Ok(response)
}

async fn list(name: &str) -> Result<Vec<JsonValue>, String> {
    let text = get(format!("{IPTV_ORG_API}/{name}.json"))
        .await?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    match serde_json::from_str(&text).map_err(|error| format!("SyntaxError: {error}"))? {
        JsonValue::Array(items) => Ok(items),
        _ => Err(format!("TypeError: {name} is not a list")),
    }
}

async fn fetch_sources() -> Result<Sources, String> {
    let playlist = async {
        get(FREE_TV_PLAYLIST.into())
            .await?
            .text()
            .await
            .map_err(|error| error.to_string())
    };
    let (channels, streams, blocklist, countries, logos, feeds, free_tv) = tokio::try_join!(
        list("channels"),
        list("streams"),
        list("blocklist"),
        list("countries"),
        list("logos"),
        list("feeds"),
        playlist
    )?;
    Ok(Sources {
        channels,
        streams,
        blocklist,
        countries,
        logos,
        feeds,
        free_tv,
    })
}

// `createTvCatalogStore().read()`: the catalogue, built anew past REFRESH_MS (a stale one keeps
// serving while its refresh runs), retried no sooner than RETRY_MS after a failure.
async fn read_catalog() -> Option<Arc<Catalog>> {
    let building = {
        let mut store = STORE.lock().expect("tv catalog");
        let stale = store
            .catalog
            .as_ref()
            .is_none_or(|catalog| now() - catalog.built_at > REFRESH_MS);
        if stale && store.building.is_none() && now() >= store.next_attempt_at {
            let task = tokio::spawn(async {
                let built = fetch_sources()
                    .await
                    .map(|sources| Arc::new(build(&sources, now())));
                let mut store = STORE.lock().expect("tv catalog");
                match built {
                    Ok(catalog) => store.catalog = Some(catalog),
                    Err(error) => {
                        store.next_attempt_at = now() + RETRY_MS;
                        warn(
                            "tv_catalog",
                            &JsonValue::Null,
                            "tv_catalog_unavailable",
                            json!({ "cause": js::slice(&error, 300), "cached": store.catalog.is_some() }),
                        );
                    }
                }
                store.building = None;
                store.catalog.clone()
            });
            store.building = Some(task.map(Result::ok).map(Option::flatten).boxed().shared());
        }
        if let Some(catalog) = &store.catalog {
            return Some(catalog.clone());
        }
        store.building.clone()
    };
    building?.await
}

// Name search across every country, for commands such as "put on CNN": an exact name (or id)
// first, then a name starting with the query, then one containing it; within a rank the requested
// country, then the channel with the most streams a page can always open (https).
fn search(catalog: &Catalog, query: &str, prefer: &str) -> Vec<JsonValue> {
    let wanted = normalize(query);
    if wanted.is_empty() {
        return Vec::new();
    }
    let plain = regex::Regex::new(r"[^\p{L}\p{N} ]+").expect("plain");
    let secure = |channel: &JsonValue| {
        channel["streams"].as_array().map_or(0, |streams| {
            streams
                .iter()
                .filter(|s| s.get("secure") == Some(&json!(true)))
                .count()
        })
    };
    let mut matches: Vec<(u8, JsonValue)> = Vec::new();
    for channel in catalog.by_id.values() {
        let (name, id) = (js::text(channel.get("name")), js::text(channel.get("id")));
        let names = [
            normalize(&name),
            normalize(&plain.replace_all(&name, " ")),
            normalize(id.split('.').next().unwrap_or("")),
        ];
        let rank = if names.contains(&wanted) {
            3
        } else if names.iter().any(|name| name.starts_with(&wanted)) {
            2
        } else if names[0].contains(&wanted) {
            1
        } else {
            continue;
        };
        let mut found = channel.clone();
        found["match"] = json!(["", "partial", "prefix", "exact"][usize::from(rank)]);
        matches.push((rank, found));
    }
    let preferred = |channel: &JsonValue| channel.get("country") == Some(&json!(prefer));
    matches.sort_by(|(a_rank, a), (b_rank, b)| {
        b_rank
            .cmp(a_rank)
            .then(preferred(b).cmp(&preferred(a)))
            .then(secure(b).cmp(&secure(a)))
            .then_with(|| by_name(a, b))
    });
    matches
        .into_iter()
        .take(MAX_MATCHES)
        .map(|(_, channel)| channel)
        .collect()
}

async fn catalog_answer(message: &JsonValue) -> JsonValue {
    let country = or_empty(message.get("country")).to_uppercase();
    let ids: Option<Vec<String>> = message.get("ids").and_then(JsonValue::as_array).map(|ids| {
        ids.iter()
            .take(MAX_IDS)
            .map(|id| js::text(Some(id)))
            .collect()
    });
    if !country.is_empty() && !country_code(&country) {
        return reply(
            CATALOG,
            message,
            json!({ "ok": false, "error": "INVALID_ARGUMENT" }),
        );
    }
    let Some(catalog) = read_catalog().await else {
        return reply(
            CATALOG,
            message,
            json!({ "ok": false, "error": "PROVIDER_UNAVAILABLE" }),
        );
    };
    let query = js::slice(&or_empty(message.get("query")), 120);
    let prefer = or_empty(message.get("preferCountry")).to_uppercase();
    let channels = if !query.is_empty() {
        search(
            &catalog,
            &query,
            if country_code(&prefer) { &prefer } else { "" },
        )
    } else if let Some(ids) = ids {
        ids.iter()
            .filter_map(|id| catalog.by_id.get(id).cloned())
            .collect()
    } else if !country.is_empty() {
        catalog
            .by_country
            .get(&country)
            .map_or_else(Vec::new, |list| {
                list.iter().take(MAX_CHANNELS).cloned().collect()
            })
    } else {
        Vec::new()
    };
    reply(
        CATALOG,
        message,
        json!({ "ok": true, "countries": catalog.countries, "channels": channels, "builtAt": catalog.built_at }),
    )
}

// `resolveYoutubeLive(url)`: the video a channel's "/live" page streams now, else none.
async fn resolve_live(url: &str) -> String {
    if let Some((video, at)) = LIVE_VIDEOS.lock().expect("live videos").get(url)
        && now() - at < LIVE_CACHE_MS
    {
        return video.clone();
    }
    let request = following()
        .get(url)
        .header("user-agent", LIVE_PAGE_AGENT)
        .header("accept-language", "en")
        .timeout(Duration::from_secs(10));
    let page = match request.send().await {
        Ok(response) if response.status().is_success() => response.text().await,
        Ok(_) => Ok(String::new()),
        Err(error) => Err(error),
    };
    match page {
        Ok(page) => {
            let video = CANONICAL
                .captures(&page)
                .map_or_else(String::new, |found| found[1].to_string());
            let mut videos = LIVE_VIDEOS.lock().expect("live videos");
            if videos.len() > 2000 {
                videos.clear();
            }
            videos.insert(url.to_string(), (video.clone(), now()));
            video
        }
        Err(error) => {
            warn(
                "tv_catalog",
                &JsonValue::Null,
                "tv_youtube_live_unresolved",
                json!({ "url": url, "cause": js::slice(&format!("fetch failed: {error}"), 200) }),
            );
            String::new()
        }
    }
}

async fn resolve_answer(message: &JsonValue) -> JsonValue {
    let id = request_id(message);
    let url = js::trim(&or_empty(message.get("url"))).to_string();
    let fail = |error: &str| json!({ "type": "tv-resolve-response", "requestId": id, "request_id": id, "ok": false, "success": false, "error": error });
    if !YOUTUBE_LIVE.is_match(&url) {
        return fail("INVALID_ARGUMENT");
    }
    let video = resolve_live(&url).await;
    if video.is_empty() {
        return fail("CHANNEL_NOT_FOUND");
    }
    json!({ "type": "tv-resolve-response", "requestId": id, "request_id": id, "ok": true, "success": true, "videoId": video })
}

pub(super) async fn answer(message: &JsonValue) -> Result<JsonValue, String> {
    Ok(if message.get("type") == Some(&json!(CATALOG)) {
        catalog_answer(message).await
    } else {
        resolve_answer(message).await
    })
}
