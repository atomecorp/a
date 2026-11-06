// Free books and audiobooks from their official catalogs (server/ws_book_sources.js, ported),
// fetched for the client that asked (Gutenberg sends no CORS header): `book-source` resolves a
// work's manifest from the provider's published catalog record (Gutenberg's RDF, the LibriVox API),
// `book-fetch` reads one byte range of one of its files. The client names a provider and a work id,
// never a URL: every address comes from the catalog record and every redirect is checked against
// the provider hosts (public_source.rs), so this is not an open proxy. A download is the user's own
// gesture, one file at a time (Gutenberg's site is for human users; LibriVox limits its API).
use super::Asker;
use super::common::{number, number_or_zero, ok_with, or_empty, parse, reply};
use super::public_source::{Access, File, RateLimit};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

// A manifest is read once per download, not once per chunk: LibriVox limits its API.
const MANIFEST_TTL_MS: f64 = 15.0 * 60_000.0;
const MAX_CATALOG_BYTES: u64 = 4 * 1024 * 1024;

fn allowed_host(provider: &str, host: &str) -> bool {
    match provider {
        "gutenberg" => ["www.gutenberg.org", "gutenberg.org"].contains(&host),
        _ => {
            ["librivox.org", "archive.org", "www.archive.org"].contains(&host)
                || host.ends_with(".archive.org")
        }
    }
}

const ACCESS: Access = Access {
    allowed_host,
    source_code: "book_source",
    fetch_code: "book_fetch",
    chunk_bytes: 1536 * 1024,
    max_file_bytes: 256 * 1024 * 1024,
};

static WINDOWS: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 240));
static MANIFESTS: LazyLock<Mutex<HashMap<String, (f64, JsonValue)>>> =
    LazyLock::new(Mutex::default);
static WORK_ID: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^[1-9][0-9]{0,6}$").expect("work id"));

fn pattern(text: &str) -> regex::Regex {
    regex::Regex::new(text).expect("catalog pattern")
}

// `xmlText(value)`: CDATA marks dropped, the five XML entities read.
fn xml_text(value: &str) -> String {
    let text = value
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&");
    js::trim(&text).to_string()
}

fn first(text: &str, expression: &str) -> String {
    xml_text(
        pattern(expression)
            .captures(text)
            .and_then(|found| found.get(1))
            .map_or("", |found| found.as_str()),
    )
}

async fn catalog(provider: &str, url: &str) -> Result<Vec<u8>, String> {
    let response = ACCESS.request(provider, url, &[]).await?;
    let status = response.status();
    if !status.is_success() {
        return Err(if status.as_u16() == 404 {
            "book_source_not_found"
        } else {
            "book_source_unavailable"
        }
        .into());
    }
    ACCESS.read_bounded(response, MAX_CATALOG_BYTES).await
}

// Gutenberg's per-book RDF record (its machine-readable catalog, public domain).
async fn gutenberg(id: &str) -> Result<JsonValue, String> {
    let bytes = catalog(
        "gutenberg",
        &format!("https://www.gutenberg.org/cache/epub/{id}/pg{id}.rdf"),
    )
    .await?;
    let rdf = String::from_utf8_lossy(&bytes);
    if pattern("(?i)<!DOCTYPE|<!ENTITY").is_match(&rdf) {
        return Err("book_source_catalog_unsafe".into());
    }
    let epub = format!(
        r#"<pgterms:file rdf:about="(https://www\.gutenberg\.org/ebooks/{id}\.epub3\.images)""#
    );
    let Some(epub) = pattern(&epub)
        .captures(&rdf)
        .map(|found| found[1].to_string())
    else {
        return Err("book_source_format_missing".into());
    };
    Ok(
        json!({ "provider": "gutenberg", "id": id, "kind": "book", "format": "epub",
        "title": first(&rdf, r"<dcterms:title>([\s\S]*?)</dcterms:title>"),
        "author": first(&rdf, r"<dcterms:creator>[\s\S]*?<pgterms:name>([\s\S]*?)</pgterms:name>"),
        "language": first(&rdf, r"<dcterms:language>[\s\S]*?<rdf:value[^>]*>([\s\S]*?)</rdf:value>"),
        "rights": first(&rdf, r"<dcterms:rights>([\s\S]*?)</dcterms:rights>"),
        "source_url": format!("https://www.gutenberg.org/ebooks/{id}"),
        "files": [{ "index": 0, "title": "", "url": epub, "mime": "application/epub+zip",
            "name": format!("gutenberg_{id}.epub") }] }),
    )
}

// A property read of `null` or `undefined` (a TypeError: the source is unavailable).
fn present(value: &JsonValue) -> Result<&JsonValue, String> {
    if value.is_null() {
        Err("TypeError: null".into())
    } else {
        Ok(value)
    }
}

// The LibriVox API record: the work and its sections, in reading order.
async fn librivox(id: &str) -> Result<JsonValue, String> {
    let address =
        format!("https://librivox.org/api/feed/audiobooks/?id={id}&format=json&extended=1");
    let bytes = catalog("librivox", &address).await?;
    let payload = parse(&bytes).ok_or("SyntaxError: the LibriVox record is no JSON")?;
    let book = payload
        .get("books")
        .and_then(|books| books.get(0))
        .filter(|book| js::truthy(Some(book)));
    let Some(book) = book.filter(|book| js::text(book.get("id")) == id) else {
        return Err("book_source_not_found".into());
    };
    let mut sections = Vec::new();
    for section in book
        .get("sections")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
    {
        let section = present(section)?;
        let url = or_empty(section.get("listen_url"));
        if url.starts_with("https://") {
            sections.push((
                number(section.get("section_number")),
                js::trim(&or_empty(section.get("title"))).to_string(),
                url,
                number_or_zero(section.get("playtime")),
            ));
        }
    }
    // A section without a number keeps its place (`a.order - b.order` is NaN there).
    sections.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    if sections.is_empty() {
        return Err("book_source_format_missing".into());
    }
    let authors = match book
        .get("authors")
        .filter(|authors| js::truthy(Some(authors)))
    {
        None => Vec::new(),
        Some(JsonValue::Array(authors)) => authors
            .iter()
            .map(|author| {
                let names: Vec<String> = [author.get("first_name"), author.get("last_name")]
                    .into_iter()
                    .filter(|name| js::truthy(*name))
                    .map(js::text)
                    .collect();
                present(author).map(|_| names.join(" "))
            })
            .collect::<Result<_, _>>()?,
        Some(_) => return Err("TypeError: authors.map is not a function".into()),
    };
    let files: Vec<JsonValue> = sections.into_iter().enumerate().map(|(index, (_, title, url, duration))| json!({
        "index": index, "title": title, "url": url, "mime": "audio/mpeg", "duration_seconds": js::number_json(duration),
        "name": format!("librivox_{id}_{:03}.mp3", index + 1) })).collect();
    Ok(
        json!({ "provider": "librivox", "id": id, "kind": "audiobook", "format": "mp3",
        "title": js::trim(&or_empty(book.get("title"))), "author": authors.join(", "),
        "language": or_empty(book.get("language")), "rights": "LibriVox recordings are in the public domain.",
        "source_url": if js::truthy(book.get("url_librivox")) { js::text(book.get("url_librivox")) } else { address },
        "files": files }),
    )
}

async fn manifest(provider: &str, id: &str) -> Result<JsonValue, String> {
    let key = format!("{provider}:{id}");
    let now = crate::auth::now_ms();
    {
        let mut manifests = MANIFESTS.lock().expect("book manifests");
        manifests.retain(|_, (at, _)| now - *at < MANIFEST_TTL_MS);
        if let Some((_, manifest)) = manifests.get(&key) {
            return Ok(manifest.clone());
        }
    }
    let manifest = if provider == "gutenberg" {
        gutenberg(id).await?
    } else {
        librivox(id).await?
    };
    MANIFESTS
        .lock()
        .expect("book manifests")
        .insert(key, (now, manifest.clone()));
    Ok(manifest)
}

async fn chunk(
    provider: &str,
    manifest: &JsonValue,
    message: &JsonValue,
) -> Result<JsonValue, String> {
    let index = number(message.get("file"));
    let file = (index.is_finite() && index.fract() == 0.0 && index >= 0.0)
        .then(|| {
            manifest
                .get("files")
                .and_then(|files| files.get(index as usize))
        })
        .flatten();
    let Some(file) = file else {
        return Err("book_fetch_range_invalid".into());
    };
    let file = File {
        url: js::text(file.get("url")),
        mime: js::text(file.get("mime")),
    };
    ACCESS
        .read_chunk(provider, &file, number(message.get("offset")))
        .await
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let kind = js::text(message.get("type"));
    let provider = or_empty(message.get("provider"));
    let id = or_empty(message.get("id"));
    if !["gutenberg", "librivox"].contains(&provider.as_str()) || !WORK_ID.is_match(&id) {
        return Ok(reply(
            &kind,
            message,
            json!({ "ok": false, "error": "book_source_invalid" }),
        ));
    }
    if WINDOWS.limited(asker.address, crate::auth::now_ms() as i64) {
        return Ok(reply(
            &kind,
            message,
            json!({ "ok": false, "error": "book_source_rate_limited" }),
        ));
    }
    let answered = match manifest(&provider, &id).await {
        Ok(manifest) if kind == "book-source" => Ok(json!({ "ok": true, "manifest": manifest })),
        Ok(manifest) => chunk(&provider, &manifest, message).await.map(ok_with),
        Err(error) => Err(error),
    };
    Ok(reply(&kind, message, answered.unwrap_or_else(|error| {
        json!({ "ok": false, "error": if error.starts_with("book_") { error.as_str() } else { "book_source_unavailable" } })
    })))
}
