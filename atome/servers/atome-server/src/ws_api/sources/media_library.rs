// `media-library-search` / `media-library-fetch` (server/ws_media_library.js, ported): the
// Médiathèque's online sources (media_library_sources.rs). A search answers the results of every
// source of a kind at once (the sources are never named to the user); `discover: true` instead of a
// query draws a theme at random. A source slower than SOURCE_BUDGET_MS is left out of that answer.
// A fetch reads one byte range of a result's picture (`thumb`) or of its file, or a sound's waveform
// (`waveform`: its peaks, `points`); `stream` answers the checked address a page player streams the
// file from. The client names a result id, never a URL.
use super::Asker;
use super::common::{number, reply};
use super::media_library_sources::{
    ID, Item, allowed_host, read_json, resolve, search_source, source_count,
};
use super::public_source::{Access, File, RateLimit};
use futures_util::StreamExt;
use futures_util::stream::FuturesUnordered;
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

pub(super) const SEARCH: &str = "media-library-search";
pub(super) const FETCH: &str = "media-library-fetch";

// Freesound's CDN serves about 75 KB/s: a range must arrive within the 20 s of one request.
const CHUNK_BYTES: u64 = 512 * 1024;
const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;
// A whole film streams (its player reads ranges as it plays), it is never read whole here.
const MAX_FILM_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const SOURCE_BUDGET_MS: u64 = 8000;
const RESULT_TTL_MS: i64 = 60 * 60_000;
const MAX_RESULTS_KEPT: usize = 5000;
const MAX_ANSWERS_KEPT: usize = 500;
// The themes a type draws from before anything is searched (never shown: the query of a discovery).
const THEMES: [(&str, [&str; 12]); 4] = [
    (
        "image",
        [
            "nature", "ocean", "mountain", "flower", "forest", "city", "animal", "bird", "sky",
            "river", "galaxy", "winter",
        ],
    ),
    (
        "video",
        [
            "ocean",
            "earth",
            "launch",
            "aurora",
            "nature",
            "city",
            "storm",
            "animals",
            "space station",
            "clouds",
            "volcano",
            "travel",
        ],
    ),
    (
        "audio",
        [
            "rain", "birds", "piano", "wind", "waves", "forest", "guitar", "thunder", "city",
            "drum", "river", "bells",
        ],
    ),
    (
        "film",
        [
            "comedy",
            "western",
            "noir",
            "mystery",
            "adventure",
            "drama",
            "romance",
            "science fiction",
            "horror",
            "chaplin",
            "hitchcock",
            "musical",
        ],
    ),
];

static ACCESS: Access = Access {
    allowed_host,
    source_code: "media_library_source",
    fetch_code: "media_library_fetch",
    chunk_bytes: CHUNK_BYTES,
    max_file_bytes: MAX_FILE_BYTES,
};
static FILM_ACCESS: Access = Access {
    allowed_host,
    source_code: "media_library_source",
    fetch_code: "media_library_fetch",
    chunk_bytes: CHUNK_BYTES,
    max_file_bytes: MAX_FILM_BYTES,
};
// Per client (its account, else its address): what reaches a provider anew, and the following
// ranges of the files it reads (bandwidth only: 1200 ranges are 600 MB a minute).
static LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 240));
static RANGES_LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 1200));
// A result found is kept for a while (its picture, file and waveform are read without asking the
// provider again); a search answered is kept as long. Both in arrival order, as a Map keeps them.
static RESULTS: LazyLock<Mutex<IndexMap<String, (i64, Item)>>> = LazyLock::new(Mutex::default);
static ANSWERED: LazyLock<Mutex<IndexMap<String, (i64, Vec<String>)>>> =
    LazyLock::new(Mutex::default);

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// `answersInBudget`: every source's answer, or once SOURCE_BUDGET_MS has passed, those already in
// (as soon as one is), in their order of arrival. A failed source answers nothing.
async fn answers_in_budget(kind: &str, query: &str) -> Vec<Vec<Item>> {
    let mut pending: FuturesUnordered<_> = (0..source_count(kind))
        .map(|index| search_source(&ACCESS, kind, index, query))
        .collect();
    let mut lists = Vec::new();
    let budget = tokio::time::sleep(Duration::from_millis(SOURCE_BUDGET_MS));
    tokio::pin!(budget);
    let mut late = false;
    loop {
        tokio::select! {
            () = &mut budget, if !late => {
                late = true;
                if !lists.is_empty() {
                    return lists;
                }
            }
            answer = pending.next() => match answer {
                None => return lists,
                Some(answer) => {
                    if let Ok(list) = answer {
                        lists.push(list);
                    }
                    if late && !lists.is_empty() {
                        return lists;
                    }
                }
            },
        }
    }
}

// The sources' answers interleaved (one of each in turn), what one source cannot give in time left out.
async fn search(kind: &str, query: &str) -> Result<Vec<JsonValue>, String> {
    let key = format!("{kind}:{}", query.to_lowercase());
    {
        let answered = ANSWERED.lock().expect("media library answers");
        let results = RESULTS.lock().expect("media library results");
        if let Some((at, ids)) = answered.get(&key)
            && now() - at < RESULT_TTL_MS
            && ids.iter().all(|id| results.contains_key(id))
        {
            return Ok(ids.iter().map(|id| results[id].1.public()).collect());
        }
    }
    let lists = answers_in_budget(kind, query).await;
    if lists.is_empty() {
        return Err("media_library_source_unavailable".into());
    }
    let mut found = Vec::new();
    let mut index = 0;
    while lists.iter().any(|list| index < list.len()) {
        found.extend(lists.iter().filter_map(|list| list.get(index)).cloned());
        index += 1;
    }
    let now = now();
    let mut results = RESULTS.lock().expect("media library results");
    // Kept in arrival order: the oldest go first, until the rest is fresh and few enough.
    while let Some((_, (at, _))) = results.first() {
        if now - at < RESULT_TTL_MS && results.len() <= MAX_RESULTS_KEPT {
            break;
        }
        results.shift_remove_index(0);
    }
    for item in &found {
        results.insert(item.id.clone(), (now, item.clone()));
    }
    drop(results);
    let mut answered = ANSWERED.lock().expect("media library answers");
    while let Some((_, (at, _))) = answered.first() {
        if now - at < RESULT_TTL_MS && answered.len() <= MAX_ANSWERS_KEPT {
            break;
        }
        answered.shift_remove_index(0);
    }
    if lists.len() == source_count(kind) {
        answered.insert(
            key,
            (now, found.iter().map(|item| item.id.clone()).collect()),
        );
    }
    Ok(found.iter().map(Item::public).collect())
}

// What a fetch learnt of a result (its file, its peaks) is kept with it.
fn keep(item: &Item) {
    if let Some((_, kept)) = RESULTS
        .lock()
        .expect("media library results")
        .get_mut(&item.id)
    {
        kept.file.clone_from(&item.file);
        kept.points.clone_from(&item.points);
    }
}

// A sound's peaks, as its provider draws them (0…1).
async fn waveform_of(item: &mut Item) -> Result<Vec<f64>, String> {
    if item.waveform.is_empty() {
        return Err("media_library_source_format_missing".into());
    }
    if let Some(points) = &item.points {
        return Ok(points.clone());
    }
    let answer = read_json(&ACCESS, item.provider, &item.waveform).await?;
    let points: Vec<f64> = match answer.get("points") {
        Some(JsonValue::Array(points)) if !points.is_empty() => points
            .iter()
            .map(|point| number(Some(point)).clamp(0.0, 1.0))
            .collect(),
        _ => return Err("media_library_source_format_missing".into()),
    };
    item.points = Some(points.clone());
    keep(item);
    Ok(points)
}

// `nameOf(title, url, fallback)`: the file name a result is kept under.
fn name_of(title: &str, url: &str, fallback: &str) -> String {
    let extension = regex::Regex::new(r"(?i)\.([a-z0-9]{2,4})(?:[?#]|$)").expect("extension");
    let extension = extension
        .captures(url)
        .map_or(fallback, |found| {
            found.get(1).map_or(fallback, |m| m.as_str())
        })
        .to_lowercase();
    let title = if title.is_empty() { "media" } else { title };
    let title = regex::Regex::new(r"(?i)\.[a-z0-9]{2,4}$")
        .expect("suffix")
        .replace(title, "");
    let title = regex::Regex::new(r"[^\p{L}\p{N} _-]+")
        .expect("plain")
        .replace_all(&title, " ");
    let title = crate::vault_router::js::slice(crate::vault_router::js::trim(&title), 60);
    format!(
        "{}.{extension}",
        if title.is_empty() { "media" } else { &title }
    )
}

fn mime_of(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or("") {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}

// `fileOf(item, variant)`: the file a fetch reads, and its name.
async fn file_of(item: &mut Item, thumb: bool) -> Result<(File, String), String> {
    if thumb {
        if item.thumb.is_empty() {
            return Err("media_library_fetch_range_invalid".into());
        }
        let name = name_of(&item.title, &item.thumb, "jpg");
        return Ok((
            File {
                url: item.thumb.clone(),
                mime: "image/jpeg".into(),
            },
            name,
        ));
    }
    if item.file.is_empty() {
        item.file = match &item.resolve {
            Some(how) => resolve(&ACCESS, &item.kind, how).await?,
            None => String::new(),
        };
        keep(item);
    }
    if item.file.is_empty() {
        return Err("media_library_source_format_missing".into());
    }
    let fallback = match item.kind.as_str() {
        "image" => "jpg",
        "video" | "film" => "mp4",
        _ => "mp3",
    };
    let name = name_of(&item.title, &item.file, fallback);
    Ok((
        File {
            url: item.file.clone(),
            mime: mime_of(&name).into(),
        },
        name,
    ))
}

fn kind_of(kind: &str) -> Option<&'static [&'static str; 12]> {
    THEMES
        .iter()
        .find(|(name, _)| *name == kind)
        .map(|(_, themes)| themes)
}

async fn fetched(message: &JsonValue, kind: &str) -> Result<JsonValue, String> {
    if kind == SEARCH {
        let asked = super::common::or_empty(message.get("kind"));
        let Some(themes) = kind_of(&asked) else {
            return Ok(json!({ "ok": false, "error": "media_library_search_invalid" }));
        };
        if message.get("discover") == Some(&json!(true)) {
            let theme = themes[usize::from(uuid::Uuid::new_v4().as_bytes()[0]) % themes.len()];
            return Ok(
                json!({ "ok": true, "kind": asked, "results": search(&asked, theme).await? }),
            );
        }
        let query = super::common::or_empty(message.get("query"));
        let query = crate::vault_router::js::trim(&query);
        if query.is_empty() || super::common::length(query) > 120 {
            return Ok(json!({ "ok": false, "error": "media_library_search_invalid" }));
        }
        return Ok(json!({ "ok": true, "kind": asked, "results": search(&asked, query).await? }));
    }
    let id = super::common::or_empty(message.get("id"));
    let variant = message
        .get("variant")
        .and_then(JsonValue::as_str)
        .filter(|variant| ["thumb", "waveform", "stream"].contains(variant))
        .unwrap_or("file");
    let kept = if ID.is_match(&id) {
        RESULTS
            .lock()
            .expect("media library results")
            .get(&id)
            .map(|(_, item)| item.clone())
    } else {
        None
    };
    let Some(mut item) = kept else {
        return Ok(json!({ "ok": false, "error": "media_library_result_unknown" }));
    };
    if variant == "waveform" {
        return Ok(json!({ "ok": true, "points": waveform_of(&mut item).await? }));
    }
    // A film only ever streams: its file is never read here, whole or in ranges.
    if item.kind == "film" && variant == "file" {
        return Ok(json!({ "ok": false, "error": "media_library_fetch_range_invalid" }));
    }
    let (file, name) = file_of(&mut item, variant == "thumb").await?;
    let mut answer = json!({ "ok": true, "name": name });
    let read = if variant == "stream" {
        let access = if item.kind == "film" {
            &FILM_ACCESS
        } else {
            &ACCESS
        };
        access.readable_address(item.provider, &file).await?
    } else {
        ACCESS
            .read_chunk(item.provider, &file, number(message.get("offset")))
            .await?
    };
    if let (Some(answer), JsonValue::Object(read)) = (answer.as_object_mut(), read) {
        answer.extend(read);
    }
    Ok(answer)
}

/// `handleWsMediaLibrary(message, client)`: `client` is `user:<id>` for an account, else its address.
pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let kind = crate::vault_router::js::text(message.get("type"));
    let client = asker
        .principal
        .as_ref()
        .filter(|id| !id.is_empty())
        .map_or_else(|| asker.address.to_string(), |id| format!("user:{id}"));
    let variant = message.get("variant").and_then(JsonValue::as_str);
    let following = kind == FETCH
        && !matches!(variant, Some("thumb" | "waveform" | "stream"))
        && number(message.get("offset")) > 0.0;
    if (if following { &RANGES_LIMITED } else { &LIMITED }).limited(&client, now()) {
        return Ok(reply(
            &kind,
            message,
            json!({ "ok": false, "error": "media_library_rate_limited" }),
        ));
    }
    let fields = fetched(message, &kind).await.unwrap_or_else(|error| {
        let code = if error.starts_with("media_library_") {
            error
        } else {
            "media_library_source_unavailable".into()
        };
        json!({ "ok": false, "error": code })
    });
    Ok(reply(&kind, message, fields))
}
