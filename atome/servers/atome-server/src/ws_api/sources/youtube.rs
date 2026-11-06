// `youtube-search` (server/ws_youtube_search.js, ported): the YouTube Data API's videos for the
// Finder, one Atome key for every user (`YOUTUBE_DATA_API_KEY`), never on a device. `chart:
// 'popular'` (no query) lists the region's most popular videos, the list a panel opens on before
// any search; it costs one quota unit (a search costs a hundred), so it is not counted against the
// daily search guard. The client only receives a stable code; the real cause stays in the log.
use super::Asker;
use super::common::{length, number, or_empty, reply, request_id, response_json, setting, warn};
use super::public_source::RateLimit;
use crate::providers::http;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const KIND: &str = "youtube-search";
const SEARCH_ENDPOINT: &str = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_ENDPOINT: &str = "https://www.googleapis.com/youtube/v3/videos";
const PAGE_SIZE: &str = "25";
const MAX_DAILY_REQUESTS: u32 = 80;

static WINDOWS: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 12));
// The day (UTC) and its searches.
static DAILY: LazyLock<Mutex<(String, u32)>> = LazyLock::new(Mutex::default);
static VIDEO_ID: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^[A-Za-z0-9_-]{11}$").expect("video id"));
static REGION: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^[A-Z]{2}$").expect("region"));
static DURATION: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new("^P(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?)?$")
        .expect("duration")
});
static ENTITY: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("&(#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);").expect("entity"));

// `String(a || b || '')`.
fn first_truthy<const N: usize>(values: [Option<&JsonValue>; N]) -> String {
    values
        .into_iter()
        .flatten()
        .find(|value| js::truthy(Some(value)))
        .map(|value| js::text(Some(value)))
        .unwrap_or_default()
}

// The Data API returns HTML-escaped snippet text ("Rock &amp; Roll"); the Finder shows plain text.
fn plain_text(value: Option<&JsonValue>) -> String {
    let text = or_empty(value);
    ENTITY
        .replace_all(&text, |found: &regex::Captures| {
            let code = &found[1];
            let point = match code.strip_prefix('#') {
                None => {
                    return match code.to_ascii_lowercase().as_str() {
                        "amp" => "&",
                        "lt" => "<",
                        "gt" => ">",
                        "quot" => "\"",
                        "apos" => "'",
                        _ => &found[0],
                    }
                    .to_string();
                }
                Some(digits) => match digits.strip_prefix(['x', 'X']) {
                    Some(hex) => hex.chars().try_fold(0_f64, |total, digit| {
                        digit
                            .to_digit(16)
                            .map(|digit| total * 16.0 + f64::from(digit))
                    }),
                    None => Some(number(Some(&json!(digits)))),
                },
            };
            match point.filter(|point| *point > 0.0 && *point <= f64::from(0x10ffff_u32)) {
                // A lone surrogate has no UTF-8 form.
                Some(point) => char::from_u32(point as u32)
                    .unwrap_or('\u{fffd}')
                    .to_string(),
                None => found[0].to_string(),
            }
        })
        .into_owned()
}

// A video's length (`contentDetails.duration`, ISO 8601 such as PT1H4M5S) in seconds; a live
// stream has none (0).
fn iso_seconds(value: Option<&JsonValue>) -> JsonValue {
    let text = or_empty(value);
    let Some(parts) = DURATION.captures(&text) else {
        return json!(0);
    };
    let part = |index: usize| {
        parts
            .get(index)
            .map_or(0.0, |found| number(Some(&json!(found.as_str()))))
    };
    js::number_json(((part(1) * 24.0 + part(2)) * 60.0 + part(3)) * 60.0 + part(4))
}

fn published_at(value: Option<&JsonValue>) -> JsonValue {
    match value {
        Some(JsonValue::String(_)) => {
            js::date(value).map_or(JsonValue::Null, |ms| json!(js::iso(ms)))
        }
        _ => JsonValue::Null,
    }
}

async fn read(endpoint: &str, params: &[(&str, &str)]) -> Result<reqwest::Response, String> {
    http::following()
        .get(format!("{endpoint}?{}", http::form(params)))
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|error| format!("TypeError: fetch failed {error}"))
}

async fn json_of(response: reqwest::Response) -> Result<JsonValue, String> {
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("TypeError: terminated {error}"))?;
    response_json(&bytes)
}

// A search result carries no length: one `videos` read (one quota unit for the whole page) gives
// each its own.
async fn durations(ids: &[String], key: &str) -> Result<HashMap<String, JsonValue>, String> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = ids.join(",");
    let params = [
        ("part", "contentDetails"),
        ("id", ids.as_str()),
        ("maxResults", PAGE_SIZE),
        ("key", key),
    ];
    let response = read(VIDEOS_ENDPOINT, &params).await?;
    if !response.status().is_success() {
        return Err(format!(
            "Error: youtube_durations_status_{}",
            response.status().as_u16()
        ));
    }
    let payload = json_of(response).await?;
    if payload.is_null() {
        return Err("TypeError: Cannot read properties of null (reading 'items')".into());
    }
    let items = payload
        .get("items")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(items
        .iter()
        .map(|item| {
            (
                or_empty(item.get("id")),
                iso_seconds(item.pointer("/contentDetails/duration")),
            )
        })
        .collect())
}

async fn search(
    popular: bool,
    params: &[(&str, &str)],
    key: &str,
    id: &JsonValue,
) -> Result<JsonValue, String> {
    let endpoint = if popular {
        VIDEOS_ENDPOINT
    } else {
        SEARCH_ENDPOINT
    };
    let response = read(endpoint, params).await?;
    let status = response.status().as_u16();
    if !response.status().is_success() {
        let error = if status == 403 {
            "youtube_search_quota_or_permission"
        } else {
            "youtube_search_unavailable"
        };
        // Google explains a refusal in its body (keyInvalid, quotaExceeded, accessNotConfigured…);
        // the request URL carries the key and is never logged.
        let detail = json_of(response).await.unwrap_or(JsonValue::Null);
        let reason = first_truthy([
            detail.pointer("/error/errors/0/reason"),
            detail.pointer("/error/status"),
        ]);
        warn(
            "youtube_search",
            id,
            error,
            json!({ "status": status, "reason": reason,
            "provider_message": js::slice(&or_empty(detail.pointer("/error/message")), 300) }),
        );
        return Ok(json!({ "ok": false, "error": error }));
    }
    let payload = json_of(response).await?;
    if payload.is_null() {
        return Err("TypeError: Cannot read properties of null (reading 'items')".into());
    }
    let items = payload
        .get("items")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    let mut results = Vec::new();
    for item in &items {
        // A chart lists videos (`id` is the video's), a search lists results (`id.videoId`); a
        // chart may hold videos that cannot be embedded.
        let video_id = if popular {
            or_empty(item.get("id"))
        } else {
            or_empty(item.pointer("/id/videoId"))
        };
        if !VIDEO_ID.is_match(&video_id)
            || (popular && item.pointer("/status/embeddable") == Some(&json!(false)))
        {
            continue;
        }
        let thumbnail = first_truthy([
            item.pointer("/snippet/thumbnails/medium/url"),
            item.pointer("/snippet/thumbnails/default/url"),
        ]);
        results.push(json!({
            "videoId": video_id,
            "url": format!("https://www.youtube.com/watch?v={video_id}"),
            "title": plain_text(item.pointer("/snippet/title")),
            "thumbnail": thumbnail,
            "channel": plain_text(item.pointer("/snippet/channelTitle")),
            // YouTube's upload date (`snippet.publishedAt`), never the video's own creation date.
            "publishedAt": published_at(item.pointer("/snippet/publishedAt")),
            "duration": if popular { iso_seconds(item.pointer("/contentDetails/duration")) } else { json!(0) },
        }));
    }
    if !popular {
        let ids: Vec<String> = results
            .iter()
            .map(|result| js::text(result.get("videoId")))
            .collect();
        let durations = durations(&ids, key).await?;
        for result in &mut results {
            let duration = durations
                .get(&js::text(result.get("videoId")))
                .filter(|duration| js::truthy(Some(duration)))
                .cloned()
                .unwrap_or_else(|| json!(0));
            result["duration"] = duration;
        }
    }
    Ok(
        json!({ "ok": true, "results": results, "nextPageToken": or_empty(payload.get("nextPageToken")) }),
    )
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let id = request_id(message);
    let query = js::trim(&or_empty(message.get("query"))).to_string();
    let page_token = js::trim(&or_empty(message.get("pageToken"))).to_string();
    let popular = message.get("chart") == Some(&json!("popular"));
    let region = js::trim(&or_empty(message.get("region"))).to_uppercase();
    // A search lists the most recently published videos first unless relevance is asked.
    let order = if js::truthy(message.get("order")) {
        js::text(message.get("order"))
    } else {
        "date".into()
    };
    let invalid_query = if popular {
        !REGION.is_match(region.as_str())
    } else {
        query.is_empty() || length(query.as_str()) > 120
    };
    if invalid_query
        || length(&page_token) > 256
        || !["date", "relevance"].contains(&order.as_str())
    {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "youtube_search_invalid_query" }),
        ));
    }
    let key = setting("YOUTUBE_DATA_API_KEY")?.unwrap_or_default();
    if key.is_empty() {
        warn(
            "youtube_search",
            &id,
            "youtube_search_not_configured",
            json!({ "missing": "YOUTUBE_DATA_API_KEY" }),
        );
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "youtube_search_not_configured" }),
        ));
    }
    let now = crate::auth::now_ms();
    {
        let mut daily = DAILY.lock().expect("youtube daily");
        let day = js::iso(now as i64)[..10].to_string();
        if daily.0 != day {
            *daily = (day, 0);
        }
        if !popular && daily.1 >= MAX_DAILY_REQUESTS {
            return Ok(reply(
                KIND,
                message,
                json!({ "ok": false, "error": "youtube_search_quota_guard" }),
            ));
        }
        if WINDOWS.limited(asker.address, now as i64) {
            return Ok(reply(
                KIND,
                message,
                json!({ "ok": false, "error": "youtube_search_rate_limited" }),
            ));
        }
        if !popular {
            daily.1 += 1;
        }
    }
    let mut params: Vec<(&str, &str)> = if popular {
        vec![
            ("part", "snippet,status,contentDetails"),
            ("chart", "mostPopular"),
            ("regionCode", region.as_str()),
            ("maxResults", PAGE_SIZE),
            ("key", key.as_str()),
        ]
    } else {
        vec![
            ("part", "snippet"),
            ("type", "video"),
            ("videoEmbeddable", "true"),
            ("videoSyndicated", "true"),
            ("q", query.as_str()),
            ("order", order.as_str()),
            ("maxResults", PAGE_SIZE),
            ("key", key.as_str()),
        ]
    };
    if !page_token.is_empty() {
        params.push(("pageToken", page_token.as_str()));
    }
    let fields = match search(popular, &params, &key, &id).await {
        Ok(fields) => fields,
        Err(cause) => {
            let (exception, cause) = cause.split_once(": ").unwrap_or(("Error", &cause));
            warn(
                "youtube_search",
                &id,
                "youtube_search_unavailable",
                json!({ "exception": exception, "cause": js::slice(cause, 300) }),
            );
            json!({ "ok": false, "error": "youtube_search_unavailable" })
        }
    };
    Ok(reply(KIND, message, fields))
}
