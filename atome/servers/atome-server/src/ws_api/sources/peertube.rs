// The public PeerTube operations of `/ws/api` (server/ws_peertube.js, ported; the PeerTube tool):
// - `peertube-search`: the federated index Sepia Search (Framasoft), public videos only, a page at
//   a time; `pageToken` is the next result offset. `chart: 'popular'` (no query) lists the newest
//   videos in `language`, the list a panel opens on before any search.
// - `peertube-resolve`: the playable streams of one video, read from its own instance (HLS master
//   playlist first, then the web video files). Only an instance of the public PeerTube directory
//   is ever contacted, so a client cannot make this server fetch an address of its choosing.
// How a video is named follows atome/src/shared/online_video_refs.js `peertubeVideoRef`.
use super::Asker;
use super::common::{length, number, number_or_zero, reply, request_id, response_json, text, warn};
use super::public_source::RateLimit;
use crate::providers::http;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const SEARCH_ENDPOINT: &str = "https://sepiasearch.org/api/v1/search/videos";
const DIRECTORY_ENDPOINT: &str =
    "https://instances.joinpeertube.org/api/v1/instances/hosts?count=5000&start=0";
const PAGE_SIZE: f64 = 25.0;
const MAX_OFFSET: f64 = 9000.0;
const DIRECTORY_REFRESH_MS: f64 = 12.0 * 60.0 * 60.0 * 1000.0;
const MAX_FILE_RESOLUTION: f64 = 1080.0;

static WINDOWS: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 30));
// The public directory's hosts and when they were read.
static DIRECTORY: LazyLock<Mutex<Option<(HashSet<String>, f64)>>> = LazyLock::new(Mutex::default);
static LANGUAGE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^[a-z]{2}$").expect("language"));
static PATH: LazyLock<regex::Regex> = LazyLock::new(|| {
    let uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    let short = "[1-9A-HJ-NP-Za-km-z]{20,24}";
    regex::Regex::new(&format!(
        "^/(?:w/({short})|videos/(?:watch|embed)/({uuid}|{short}))/?$"
    ))
    .expect("path")
});
static LABELS: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$").expect("host")
});
static DOTTED: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^[0-9]+(?:\\.[0-9]+){3}$").expect("dotted"));

/// A PeerTube video: `ref` (the address kept on the Atome: https, the instance host and the
/// watch path), its host and its id.
struct VideoRef {
    reference: String,
    host: String,
    id: String,
}

// A host name with a dot; never an IP literal, a port or a local name.
fn public_host(host: &str) -> bool {
    (4..=253).contains(&length(host)) && !DOTTED.is_match(host) && LABELS.is_match(host)
}

fn video_ref(value: Option<&JsonValue>) -> Option<VideoRef> {
    let url = url::Url::parse(&text(value)).ok()?;
    let host = url.host_str()?.to_lowercase();
    if url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || !public_host(&host)
    {
        return None;
    }
    let found = PATH.captures(url.path())?;
    let id = found.get(1).or_else(|| found.get(2))?.as_str().to_string();
    let reference = if id.contains('-') {
        format!("https://{host}/videos/watch/{id}")
    } else {
        format!("https://{host}/w/{id}")
    };
    Some(VideoRef {
        reference,
        host,
        id,
    })
}

fn https_url(value: Option<&JsonValue>) -> String {
    url::Url::parse(&text(value))
        .ok()
        .filter(|url| url.scheme() == "https")
        .map(String::from)
        .unwrap_or_default()
}

// `value === 1`.
fn one(value: Option<&JsonValue>) -> bool {
    value.and_then(JsonValue::as_f64) == Some(1.0)
}

fn playable(video: &JsonValue) -> bool {
    one(video.pointer("/privacy/id"))
        && video.get("isLive") != Some(&json!(true))
        && video.get("nsfw") != Some(&json!(true))
}

// A failed read: its HTTP status (0 when none) and its cause.
struct Failure {
    status: u16,
    cause: String,
}

impl From<String> for Failure {
    fn from(cause: String) -> Self {
        Self { status: 0, cause }
    }
}

async fn read_json(url: &str) -> Result<JsonValue, Failure> {
    let response = http::client()
        .get(url)
        .timeout(Duration::from_secs(8))
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("fetch failed {error}"))?;
    let status = response.status();
    if !status.is_success() || status.is_redirection() {
        // `redirect: 'error'`: a redirect fails as the fetch itself.
        return Err(if status.is_redirection() {
            "fetch failed".to_string().into()
        } else {
            Failure {
                status: status.as_u16(),
                cause: format!("status_{}", status.as_u16()),
            }
        });
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("terminated {error}"))?;
    Ok(response_json(&bytes)?)
}

fn search_result(video: &JsonValue) -> Option<JsonValue> {
    let found = video_ref(video.get("url"))?;
    if !playable(video) {
        return None;
    }
    let thumbnail = js::first(video, &["thumbnailUrl", "previewUrl"]);
    // `a || b`: the second when neither is truthy.
    let (channel, account) = (
        video.pointer("/channel/displayName"),
        video.pointer("/account/displayName"),
    );
    let channel = if js::truthy(channel) {
        channel
    } else {
        account
    };
    Some(
        json!({ "url": found.reference, "title": text(video.get("name")), "thumbnail": https_url(thumbnail),
        "channel": text(channel), "host": found.host, "duration": js::number_json(number_or_zero(video.get("duration"))) }),
    )
}

async fn search(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    const KIND: &str = "peertube-search";
    let query = text(message.get("query"));
    let recent = message.get("chart") == Some(&json!("popular"));
    let language = text(message.get("language")).to_lowercase();
    let start = if js::truthy(message.get("pageToken")) {
        number(message.get("pageToken"))
    } else {
        0.0
    };
    let invalid_query = if recent {
        !LANGUAGE.is_match(&language)
    } else {
        query.is_empty() || length(&query) > 120
    };
    if invalid_query || start.fract() != 0.0 || !(0.0..=MAX_OFFSET).contains(&start) {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "peertube_search_invalid_query" }),
        ));
    }
    if WINDOWS.limited(asker.address, crate::auth::now_ms() as i64) {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "peertube_search_rate_limited" }),
        ));
    }
    let start_text = js::number_json(start).to_string();
    let mut params: Vec<(&str, &str)> = if recent {
        vec![
            ("sort", "-publishedAt"),
            ("languageOneOf", language.as_str()),
        ]
    } else {
        vec![("search", query.as_str())]
    };
    params.extend([
        ("start", start_text.as_str()),
        ("count", "25"),
        ("nsfw", "false"),
        ("isLive", "false"),
    ]);
    match read_json(&format!("{SEARCH_ENDPOINT}?{}", http::form(&params))).await {
        Ok(payload) => {
            let videos = payload
                .get("data")
                .and_then(JsonValue::as_array)
                .cloned()
                .unwrap_or_default();
            let next = start + PAGE_SIZE;
            let more =
                videos.len() == 25 && next < number_or_zero(payload.get("total")).min(MAX_OFFSET);
            let results: Vec<JsonValue> = videos.iter().filter_map(search_result).collect();
            let token = if more {
                js::number_json(next).to_string()
            } else {
                String::new()
            };
            Ok(reply(
                KIND,
                message,
                json!({ "ok": true, "results": results, "nextPageToken": token }),
            ))
        }
        Err(failure) => {
            warn(
                "peertube",
                &request_id(message),
                "peertube_search_unavailable",
                json!({ "status": failure.status, "cause": js::slice(&failure.cause, 300) }),
            );
            Ok(reply(
                KIND,
                message,
                json!({ "ok": false, "error": "peertube_search_unavailable" }),
            ))
        }
    }
}

async fn directory_hosts(now: f64) -> Result<HashSet<String>, Failure> {
    if let Some((hosts, at)) = DIRECTORY.lock().expect("peertube directory").as_ref()
        && now - at < DIRECTORY_REFRESH_MS
    {
        return Ok(hosts.clone());
    }
    let payload = read_json(DIRECTORY_ENDPOINT).await?;
    let entries = payload
        .get("data")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    let hosts: HashSet<String> = entries
        .iter()
        .map(|entry| text(entry.get("host")).to_lowercase())
        .filter(|host| !host.is_empty())
        .collect();
    if hosts.is_empty() {
        return Err("peertube_directory_empty".to_string().into());
    }
    *DIRECTORY.lock().expect("peertube directory") = Some((hosts.clone(), now));
    Ok(hosts)
}

// The web video files: the highest up to 1080p first, a larger one only after every smaller one;
// never the audio-only file (resolution 0).
fn file_streams(files: Option<&JsonValue>) -> Vec<JsonValue> {
    let rank = |height: f64| {
        if height <= MAX_FILE_RESOLUTION {
            MAX_FILE_RESOLUTION - height
        } else {
            height
        }
    };
    let mut found: Vec<(f64, String)> = files
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(|file| {
            (
                number_or_zero(file.pointer("/resolution/id")),
                https_url(file.get("fileUrl")),
            )
        })
        .filter(|(height, url)| *height > 0.0 && !url.is_empty())
        .collect();
    found.sort_by(|a, b| rank(a.0).total_cmp(&rank(b.0)));
    found
        .into_iter()
        .take(2)
        .map(|(_, url)| json!({ "kind": "video", "url": url }))
        .collect()
}

async fn resolved(video: &VideoRef, now: f64) -> Result<JsonValue, Failure> {
    let unavailable = json!({ "ok": false, "error": "peertube_video_unavailable" });
    if !directory_hosts(now).await?.contains(&video.host) {
        return Ok(unavailable);
    }
    let payload = read_json(&format!(
        "https://{}/api/v1/videos/{}",
        video.host, video.id
    ))
    .await?;
    if !playable(&payload) || !one(payload.pointer("/state/id")) {
        return Ok(unavailable);
    }
    let mut streams: Vec<JsonValue> = payload
        .get("streamingPlaylists")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(|playlist| https_url(playlist.get("playlistUrl")))
        .filter(|url| !url.is_empty())
        .map(|url| json!({ "kind": "hls", "url": url }))
        .collect();
    streams.extend(file_streams(payload.get("files")));
    if streams.is_empty() {
        return Ok(unavailable);
    }
    Ok(
        json!({ "ok": true, "url": video.reference, "title": text(payload.get("name")),
        "duration": js::number_json(number_or_zero(payload.get("duration"))), "streams": streams }),
    )
}

async fn resolve(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    const KIND: &str = "peertube-resolve";
    let Some(video) = video_ref(message.get("url")) else {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "peertube_video_invalid" }),
        ));
    };
    let now = crate::auth::now_ms();
    if WINDOWS.limited(asker.address, now as i64) {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "peertube_search_rate_limited" }),
        ));
    }
    match resolved(&video, now).await {
        Ok(fields) => Ok(reply(KIND, message, fields)),
        Err(failure) => {
            let code = if [403, 404].contains(&failure.status) {
                "peertube_video_unavailable"
            } else {
                "peertube_resolve_unavailable"
            };
            warn(
                "peertube",
                &request_id(message),
                code,
                json!({ "host": video.host, "status": failure.status,
                "cause": js::slice(&failure.cause, 300) }),
            );
            Ok(reply(KIND, message, json!({ "ok": false, "error": code })))
        }
    }
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    if message.get("type") == Some(&json!("peertube-search")) {
        search(asker, message).await
    } else {
        resolve(asker, message).await
    }
}
