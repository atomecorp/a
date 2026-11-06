// The streams and names of the television catalogue (server/ws_tv_catalog.js `streamOf`,
// `parseM3u`, `clean`, and `normalizeTvQuery` of atome/src/squirrel/tv/contracts.js, ported): what a
// page can open of a list's address, the entries of Free-TV's M3U playlist, and the name readings
// the catalogue sorts and searches by.
use super::public_source::parse_url;
use crate::mail::index::collate;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::LazyLock;

static YOUTUBE_WATCH: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"^https://(?:www\.|m\.)?youtube\.com/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})")
        .expect("watch")
});
// A channel's "/live" address follows whatever it is streaming now; the current video is resolved
// on demand (`tv-resolve`), never stored.
pub(super) static YOUTUBE_LIVE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"^https://(?:www\.)?youtube\.com/(?:c/|channel/|user/|@)[A-Za-z0-9_.-]+/live/?$",
    )
    .expect("live")
});
static ATTRIBUTE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"([a-z-]+)="([^"]*)""#).expect("attribute"));

/// `COUNTRY_PATTERN.test(value)`: `/^[A-Z]{2}$/`.
pub(super) fn country_code(value: &str) -> bool {
    value.len() == 2 && value.bytes().all(|b| b.is_ascii_uppercase())
}

// JavaScript's `\s`: its white space and line terminators.
fn js_space(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

// `value.replace(/\s+/g, ' ').trim()`.
fn squeeze(value: &str) -> String {
    let mut out = String::new();
    let mut space = false;
    for c in value.chars() {
        if js_space(c) {
            space = true;
        } else {
            if space && !out.is_empty() {
                out.push(' ');
            }
            space = false;
            out.push(c);
        }
    }
    out
}

/// `normalizeTvQuery` (atome/src/squirrel/tv/contracts.js): accent-, case- and space-insensitive.
pub(super) fn normalize(value: &str) -> String {
    let decomposed = icu_normalizer::DecomposingNormalizerBorrowed::new_nfd().normalize(value);
    let plain: String = decomposed
        .chars()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .collect();
    squeeze(&plain.to_lowercase())
}

/// `a.localeCompare(b)` of two names as JavaScript reads them (`String(name)`).
pub(super) fn by_name(a: &JsonValue, b: &JsonValue) -> std::cmp::Ordering {
    collate(&js::text(a.get("name")), &js::text(b.get("name")))
}

// `clean(value)`: Free-TV's circled markers (Ⓖ geo-blocked, Ⓨ YouTube…) gone, spaces squeezed.
pub(super) fn clean(value: &str) -> String {
    squeeze(
        &value
            .chars()
            .filter(|c| !('\u{24b6}'..='\u{24e9}').contains(c))
            .collect::<String>(),
    )
}

// `streamOf(url, quality)`: a stream a page can open, else none.
pub(super) fn stream_of(url: Option<&JsonValue>, quality: Option<&JsonValue>) -> Option<JsonValue> {
    let value = js::trim(&super::common::or_empty(url)).to_string();
    let raw = quality.cloned().unwrap_or(json!(""));
    if let Some(found) = YOUTUBE_WATCH.captures(&value) {
        return Some(
            json!({ "url": value, "kind": "youtube", "videoId": &found[1], "quality": raw, "secure": true }),
        );
    }
    if YOUTUBE_LIVE.is_match(&value) {
        return Some(
            json!({ "url": value, "kind": "youtube_live", "quality": raw, "secure": true }),
        );
    }
    let parsed = parse_url(&value, None).ok()?;
    if !["http", "https"].contains(&parsed.scheme())
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return None;
    }
    let path = parsed.path().to_lowercase();
    let kind = if path.ends_with(".mp4") {
        "video"
    } else if path.ends_with(".m3u8")
        || path.ends_with(".m3u")
        || parsed.query().is_some_and(|q| q.contains("m3u8"))
    {
        "hls"
    } else {
        return None;
    };
    Some(
        json!({ "url": value, "kind": kind, "quality": super::common::or_empty(quality), "secure": parsed.scheme() == "https" }),
    )
}

pub(super) struct M3uEntry {
    pub attrs: HashMap<String, String>,
    pub name: String,
    pub url: String,
}

pub(super) fn parse_m3u(text: &str) -> Vec<M3uEntry> {
    let mut entries = Vec::new();
    let mut pending: Option<(HashMap<String, String>, String)> = None;
    for raw in text.split('\n') {
        let line = js::trim(raw.strip_suffix('\r').unwrap_or(raw));
        if line.starts_with("#EXTINF") {
            let attrs = ATTRIBUTE
                .captures_iter(line)
                .map(|found| (found[1].to_string(), found[2].to_string()))
                .collect();
            let name = line.rfind(',').map_or(line, |at| &line[at + 1..]);
            pending = Some((attrs, clean(name)));
        } else if !line.is_empty()
            && !line.starts_with('#')
            && let Some((attrs, name)) = pending.take()
        {
            entries.push(M3uEntry {
                attrs,
                name,
                url: line.to_string(),
            });
        }
    }
    entries
}
