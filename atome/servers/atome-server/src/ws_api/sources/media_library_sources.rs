// The Médiathèque's online sources (server/ws_media_library.js, ported): free images, videos and
// sounds, public domain or CC0 only. Each source answers items `{ id, provider, kind, title, thumb,
// file?, resolve?, … }`; an item's address always comes from the provider's own record and goes
// through the checked public source access (public_source.rs).
//   - Openverse (WordPress): images and sounds (with their waveform), `license=cc0,pdm`;
//   - NASA Image and Video Library: images and videos (its sounds are hour-long podcasts: left out);
//   - Internet Archive: videos marked public domain or CC0 with an MP4 file, never one behind a
//     login; its feature films (kind `film`) too, only ever streamed.
use super::public_source::{Access, parse_url};
use crate::vault_router::js;
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::LazyLock;

const PER_SOURCE: usize = 12;
const MAX_RECORD_BYTES: u64 = 4 * 1024 * 1024;
const ARCHIVE_MAX_ITEM_BYTES: u64 = 80 * 1024 * 1024;

// `encodeURIComponent`: everything but `A-Z a-z 0-9 - _ . ! ~ * ' ( )`.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

pub(super) fn component(text: &str) -> String {
    utf8_percent_encode(text, COMPONENT).to_string()
}

/// The hosts each provider's addresses may name.
pub(super) fn allowed_host(provider: &str, host: &str) -> bool {
    let (hosts, suffixes): (&[&str], &[&str]) = match provider {
        "openverse" => (
            &[
                "api.openverse.org",
                "upload.wikimedia.org",
                "cdn.freesound.org",
            ],
            &[".staticflickr.com"],
        ),
        "nasa" => (&["images-api.nasa.gov", "images-assets.nasa.gov"], &[]),
        "archive" => (&["archive.org"], &[".archive.org"]),
        _ => (&[], &[]),
    };
    hosts.contains(&host) || suffixes.iter().any(|suffix| host.ends_with(suffix))
}

/// `ID`: a result id a client may name.
pub(super) static ID: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"^(openverse_image|openverse_audio|nasa|archive):[A-Za-z0-9 ._\-()',]{1,160}$",
    )
    .expect("id")
});

/// How an item finds its file when its record does not name it: NASA's renditions, the Archive's MP4.
#[derive(Clone)]
pub(super) enum Resolve {
    Nasa(String),
    Archive(String),
}

/// One result as kept: what the client receives (`public`), and its addresses.
#[derive(Clone)]
pub(super) struct Item {
    pub id: String,
    pub provider: &'static str,
    pub kind: String,
    pub title: String,
    pub thumb: String,
    pub file: String,
    pub waveform: String,
    pub points: Option<Vec<f64>>,
    pub resolve: Option<Resolve>,
    // The rest of the fields, in the order the client receives them.
    pub fields: JsonMap<String, JsonValue>,
}

impl Item {
    /// `publicItem`: what the client receives of a result, never an address.
    pub(super) fn public(&self) -> JsonValue {
        let mut item = JsonMap::new();
        item.insert("id".into(), json!(self.id));
        item.insert("provider".into(), json!(self.provider));
        item.insert("kind".into(), json!(self.kind));
        item.insert("title".into(), json!(self.title));
        item.extend(self.fields.clone());
        item.insert("has_thumb".into(), json!(!self.thumb.is_empty()));
        item.insert("has_waveform".into(), json!(!self.waveform.is_empty()));
        JsonValue::Object(item)
    }
}

fn host_of(url: &str) -> String {
    parse_url(url, None)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_default()
}

fn https(url: &str) -> String {
    url.strip_prefix("http://")
        .map_or_else(|| url.to_string(), |rest| format!("https://{rest}"))
}

// `String(value || '')`.
fn or_empty(value: Option<&JsonValue>) -> String {
    super::common::or_empty(value)
}

/// `readJson(provider, url)`: a provider's bounded JSON answer.
pub(super) async fn read_json(
    access: &Access,
    provider: &str,
    url: &str,
) -> Result<JsonValue, String> {
    let response = access
        .request(provider, url, &[("accept", "application/json".into())])
        .await?;
    if !response.status().is_success() {
        return Err("media_library_source_unavailable".into());
    }
    let bytes = access.read_bounded(response, MAX_RECORD_BYTES).await?;
    serde_json::from_str(&String::from_utf8_lossy(&bytes))
        .map_err(|error| format!("SyntaxError: {error}"))
}

fn list(value: Option<&JsonValue>) -> impl Iterator<Item = &JsonValue> {
    value.and_then(JsonValue::as_array).into_iter().flatten()
}

async fn openverse(access: &Access, kind: &str, query: &str) -> Result<Vec<Item>, String> {
    let path = if kind == "image" { "images" } else { "audio" };
    let url = format!(
        "https://api.openverse.org/v1/{path}/?q={}&license=cc0,pdm&mature=false&page_size=20",
        component(query)
    );
    let page = read_json(access, "openverse", &url).await?;
    Ok(list(page.get("results"))
        .filter(|item| {
            allowed_host("openverse", &host_of(&js::text(item.get("url"))))
                && (kind == "image"
                    || ["mp3", "m4a", "wav", "ogg", "flac"].contains(&or_empty(item.get("filetype")).to_lowercase().as_str()))
        })
        .take(PER_SOURCE)
        .map(|item| {
            let waveform = js::text(item.get("waveform"));
            let nullish = |key: &str| item.get(key).filter(|v| js::truthy(Some(v))).cloned().unwrap_or(JsonValue::Null);
            let duration = item.get("duration").filter(|d| js::truthy(Some(d)));
            let fields = json!({ "license": item.get("license"), "author": or_empty(item.get("creator")),
                "source_url": or_empty(item.get("foreign_landing_url")), "width": nullish("width"), "height": nullish("height"),
                "duration": duration.map_or(JsonValue::Null, |d| js::number_json(js::number(Some(d)) / 1000.0)) });
            let mut fields = fields.as_object().cloned().unwrap_or_default();
            if item.get("license").is_none() {
                fields.remove("license");
            }
            Item {
                id: format!("openverse_{kind}:{}", js::text(item.get("id"))),
                provider: "openverse",
                kind: kind.to_string(),
                title: js::trim(&or_empty(item.get("title"))).to_string(),
                thumb: if kind == "image" { js::text(item.get("thumbnail")) } else { String::new() },
                file: js::text(item.get("url")),
                waveform: if kind == "audio" && allowed_host("openverse", &host_of(&waveform)) { waveform } else { String::new() },
                points: None,
                resolve: None,
                fields,
            }
        })
        .collect())
}

async fn nasa(access: &Access, kind: &str, query: &str) -> Result<Vec<Item>, String> {
    let url = format!(
        "https://images-api.nasa.gov/search?q={}&media_type={kind}&page_size={PER_SOURCE}",
        component(query)
    );
    let page = read_json(access, "nasa", &url).await?;
    let preview = regex::Regex::new(r"(?i)~(thumb|medium)\.jpg$").expect("preview");
    Ok(list(page.pointer("/collection/items"))
        .take(PER_SOURCE)
        .map(|item| {
            let data = item.pointer("/data/0").filter(|d| js::truthy(Some(d))).cloned().unwrap_or(json!({}));
            let links: Vec<&JsonValue> = list(item.get("links")).collect();
            let shown = links
                .iter()
                .find(|link| link.get("render") == Some(&json!("image")) && preview.is_match(&js::text(link.get("href"))))
                .or(links.first());
            let nasa_id = js::text(data.get("nasa_id"));
            let center = data.get("center").filter(|c| js::truthy(Some(c)));
            let fields = json!({ "license": "nasa_public_domain", "author": center.map_or_else(|| "NASA".into(), |c| js::text(Some(c))),
                "source_url": format!("https://images.nasa.gov/details/{}", component(&nasa_id)) });
            Item {
                id: format!("nasa:{nasa_id}"),
                provider: "nasa",
                kind: kind.to_string(),
                title: js::trim(&or_empty(data.get("title"))).to_string(),
                thumb: https(&or_empty(shown.and_then(|link| link.get("href")))),
                file: String::new(),
                waveform: String::new(),
                points: None,
                resolve: Some(Resolve::Nasa(js::text(item.get("href")))),
                fields: fields.as_object().cloned().unwrap_or_default(),
            }
        })
        .filter(|item| ID.is_match(&item.id))
        .collect())
}

// The results of an Internet Archive search as `kind` items, each resolving to its smallest MP4.
fn archive_items(page: &JsonValue, kind: &str) -> Vec<Item> {
    list(page.pointer("/response/docs"))
        .map(|doc| {
            let identifier = js::text(doc.get("identifier"));
            let creators: Vec<String> = match doc.get("creator") {
                Some(JsonValue::Array(items)) => items
                    .iter()
                    .filter(|c| js::truthy(Some(c)))
                    .map(|c| js::text(Some(c)))
                    .collect(),
                Some(creator) if js::truthy(Some(creator)) => vec![js::text(Some(creator))],
                _ => Vec::new(),
            };
            let license = if js::text(doc.get("licenseurl")).contains("zero") {
                "cc0"
            } else {
                "pdm"
            };
            let fields = json!({ "license": license, "author": creators.join(", "),
                "source_url": format!("https://archive.org/details/{}", component(&identifier)),
                "year": js::slice(&or_empty(doc.get("year")), 4) });
            Item {
                id: format!("archive:{identifier}"),
                provider: "archive",
                kind: kind.to_string(),
                title: js::trim(&or_empty(doc.get("title"))).to_string(),
                thumb: format!(
                    "https://archive.org/services/img/{}",
                    component(&identifier)
                ),
                file: String::new(),
                waveform: String::new(),
                points: None,
                resolve: Some(Resolve::Archive(identifier)),
                fields: fields.as_object().cloned().unwrap_or_default(),
            }
        })
        .filter(|item| ID.is_match(&item.id))
        .collect()
}

async fn archive(access: &Access, kind: &str, query: &str) -> Result<Vec<Item>, String> {
    let url = if kind == "film" {
        let search = format!(
            "({query}) AND collection:(feature_films) AND licenseurl:(*publicdomain* OR *zero*) AND NOT access-restricted-item:true AND format:(MPEG4 OR \"h.264\" OR \"h.264 IA\")"
        );
        format!(
            "https://archive.org/advancedsearch.php?q={}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&fl[]=year&sort[]=downloads+desc&rows={}&output=json",
            component(&search),
            PER_SOURCE * 2
        )
    } else {
        let search = format!(
            "({query}) AND mediatype:(movies) AND licenseurl:(*publicdomain* OR *zero*) AND item_size:[1 TO {ARCHIVE_MAX_ITEM_BYTES}] AND NOT access-restricted-item:true AND format:(MPEG4 OR \"h.264\" OR \"h.264 IA\")"
        );
        format!(
            "https://archive.org/advancedsearch.php?q={}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows={PER_SOURCE}&output=json",
            component(&search)
        )
    };
    Ok(archive_items(
        &read_json(access, "archive", &url).await?,
        kind,
    ))
}

/// `SOURCES[kind]`: each source of a kind, by its index.
pub(super) fn source_count(kind: &str) -> usize {
    match kind {
        "image" | "video" => 2,
        _ => 1,
    }
}

/// The `index`th source of `kind` searched for `query`.
pub(super) async fn search_source(
    access: &Access,
    kind: &str,
    index: usize,
    query: &str,
) -> Result<Vec<Item>, String> {
    match (kind, index) {
        ("image", 0) => openverse(access, "image", query).await,
        ("image", _) => nasa(access, "image", query).await,
        ("video", 0) => nasa(access, "video", query).await,
        ("video", _) | ("film", _) => archive(access, kind, query).await,
        _ => openverse(access, "audio", query).await,
    }
}

// NASA lists an item's renditions in its collection: the first present of these, in order (a
// video's lightest first).
static RENDITIONS: LazyLock<[(&str, Vec<regex::Regex>); 2]> = LazyLock::new(|| {
    let patterns = |list: &[&str]| {
        list.iter()
            .map(|p| regex::Regex::new(&format!("(?i){p}")).expect("rendition"))
            .collect()
    };
    [
        (
            "image",
            patterns(&[r"~large\.jpg$", r"~medium\.jpg$", r"~orig\.(jpe?g|png)$"]),
        ),
        (
            "video",
            patterns(&[
                r"~mobile\.mp4$",
                r"~preview\.mp4$",
                r"~small\.mp4$",
                r"~medium\.mp4$",
                r"~orig\.mp4$",
            ]),
        ),
    ]
});

/// An item's file address, from its record's own resolution (`item.resolve(context)`).
pub(super) async fn resolve(
    access: &Access,
    kind: &str,
    resolve: &Resolve,
) -> Result<String, String> {
    match resolve {
        Resolve::Nasa(href) => {
            let urls = read_json(access, "nasa", &https(href)).await?;
            let Some(urls) = urls.as_array() else {
                return Err("TypeError: urls.find is not a function".into());
            };
            let patterns = RENDITIONS
                .iter()
                .find(|(name, _)| *name == kind)
                .map_or(&[][..], |(_, p)| p.as_slice());
            let found = patterns
                .iter()
                .find_map(|pattern| {
                    urls.iter()
                        .map(|url| js::text(Some(url)))
                        .find(|url| pattern.is_match(url))
                })
                .unwrap_or_default();
            Ok(https(&found))
        }
        Resolve::Archive(identifier) => {
            let meta = read_json(
                access,
                "archive",
                &format!("https://archive.org/metadata/{}", component(identifier)),
            )
            .await?;
            let mp4 = regex::Regex::new(r"(?i)\.mp4$").expect("mp4");
            let size = |file: &JsonValue| super::common::number(file.get("size"));
            let mut files: Vec<&JsonValue> = list(meta.get("files"))
                .filter(|file| mp4.is_match(&js::text(file.get("name"))) && size(file) > 0.0)
                .collect();
            files.sort_by(|a, b| size(a).total_cmp(&size(b)));
            Ok(files.first().map_or_else(String::new, |file| {
                let name: Vec<String> = js::text(file.get("name"))
                    .split('/')
                    .map(component)
                    .collect();
                format!(
                    "https://archive.org/download/{}/{}",
                    component(identifier),
                    name.join("/")
                )
            }))
        }
    }
}
