// Reading a file from a public provider for the client that asked (server/public_source_fetch.js,
// ported; the free books, the Médiathèque): the client names a provider and an item, never a URL.
// Every address comes from the provider's own record and is checked before it is requested (https,
// an allowed host of that provider, a public address), every redirect is followed by hand and checked
// the same way, and a file travels in byte ranges over /ws/api (or, for a page player streaming it,
// only its checked address is answered, `readable_address`): this is not an open proxy. `source_code`
// / `fetch_code` prefix the error codes of the owner using it (`book_source`, `media_library_fetch`…).
// The per-address windows (`createAddressRateLimit`) and the public address rule of the DAV imports
// (`publicDavAddress`, server/ws_personal_import.js) live here too.
use base64::Engine;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

/// `publicDavAddress(address)`: a resolved address a server may reach for a client (no private,
/// loopback, link-local, shared, documentation or multicast range; IPv6 global unicast only).
pub(crate) fn public_address(address: &str) -> bool {
    if address.contains(':') {
        let bytes = address.as_bytes();
        return bytes.len() >= 5
            && matches!(bytes[0], b'2' | b'3')
            && bytes[1..4].iter().all(u8::is_ascii_hexdigit)
            && bytes[4] == b':'
            && !address.contains("::ffff:");
    }
    let parts: Vec<f64> = address
        .split('.')
        .map(|part| crate::vault_router::js::number(Some(&json!(part))))
        .collect();
    let part = |index: usize| parts.get(index).copied().unwrap_or(f64::NAN);
    let (a, b, c) = (part(0), part(1), part(2));
    a > 0.0
        && a < 224.0
        && a != 10.0
        && a != 127.0
        && !(a == 169.0 && b == 254.0)
        && !(a == 172.0 && (16.0..=31.0).contains(&b))
        && !(a == 100.0 && (64.0..=127.0).contains(&b))
        && !(a == 192.0 && (b == 168.0 || (b == 0.0 && (c == 0.0 || c == 2.0))))
        && !(a == 198.0 && (b == 18.0 || b == 19.0 || (b == 51.0 && c == 100.0)))
        && !(a == 203.0 && b == 0.0 && c == 113.0)
}

/// `lookup(host, { all: true })`: every address the host resolves to, as Node writes them.
pub(crate) async fn resolve(host: &str) -> Result<Vec<String>, String> {
    let found = tokio::net::lookup_host((host, 443))
        .await
        .map_err(|error| format!("ENOTFOUND {host}: {error}"))?;
    let mut addresses: Vec<String> = Vec::new();
    for address in found.map(|socket| socket.ip().to_string()) {
        if !addresses.contains(&address) {
            addresses.push(address);
        }
    }
    Ok(addresses)
}

/// `createAddressRateLimit({ windowMs, max })`: at most `max` requests per address within the window.
pub(super) struct RateLimit {
    window_ms: i64,
    max: usize,
    requests: Mutex<HashMap<String, Vec<i64>>>,
}

impl RateLimit {
    pub(super) fn new(window_ms: i64, max: usize) -> Self {
        Self {
            window_ms,
            max,
            requests: Mutex::new(HashMap::new()),
        }
    }

    /// Whether `address` is past its window's limit; a request let through is counted.
    pub(super) fn limited(&self, address: &str, now: i64) -> bool {
        let key = if address.is_empty() {
            "unknown"
        } else {
            address
        };
        let mut requests = self.requests.lock().expect("rate limit lock");
        let mut recent: Vec<i64> = requests
            .get(key)
            .map(|times| {
                times
                    .iter()
                    .copied()
                    .filter(|at| now - at < self.window_ms)
                    .collect()
            })
            .unwrap_or_default();
        if recent.len() >= self.max {
            return true;
        }
        recent.push(now);
        requests.insert(key.to_string(), recent);
        if requests.len() > 10_000 {
            requests.retain(|_, times| !times.iter().all(|at| now - at >= self.window_ms));
        }
        false
    }
}

/// A file a client reads: its address (from the provider's record) and its type.
pub(super) struct File {
    pub url: String,
    pub mime: String,
}

/// `createPublicSourceAccess({ allowedHost, sourceCode, fetchCode, chunkBytes, maxFileBytes })`.
pub(super) struct Access {
    pub allowed_host: fn(&str, &str) -> bool,
    pub source_code: &'static str,
    pub fetch_code: &'static str,
    pub chunk_bytes: u64,
    pub max_file_bytes: u64,
}

/// `new URL(input)` as WHATWG reads it, `ERR_INVALID_URL` otherwise.
pub(super) fn parse_url(input: &str, base: Option<&url::Url>) -> Result<url::Url, String> {
    url::Url::options()
        .base_url(base)
        .parse(input)
        .map_err(|_| format!("ERR_INVALID_URL {input}"))
}

fn header(response: &reqwest::Response, name: &str) -> String {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string()
}

fn content_range(value: &str) -> Option<(u64, u64, u64)> {
    let rest = value.strip_prefix("bytes ")?;
    let (first, rest) = rest.split_once('-')?;
    let (last, total) = rest.split_once('/')?;
    let number = |text: &str| {
        (!text.is_empty() && text.bytes().all(|b| b.is_ascii_digit()))
            .then(|| text.parse::<u64>().ok())
            .flatten()
    };
    let total_digits: String = total.chars().take_while(char::is_ascii_digit).collect();
    Some((number(first)?, number(last)?, number(&total_digits)?))
}

/// `Number(header)`: an empty header is 0, a number is read whole, anything else is NaN.
fn header_number(value: &str) -> f64 {
    crate::vault_router::js::number(Some(&json!(value)))
}

const MAX_SAFE: f64 = 9_007_199_254_740_991.0;

fn safe_size(value: f64, max: u64) -> bool {
    value.fract() == 0.0 && value.abs() <= MAX_SAFE && value > 0.0 && value <= max as f64
}

impl Access {
    fn fail(&self, suffix: &str) -> String {
        format!("{}_{suffix}", self.source_code)
    }

    async fn checked_url(&self, provider: &str, input: &str) -> Result<String, String> {
        let url = parse_url(input, None)?;
        if url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some_and(|port| port != 443)
            || input.encode_utf16().count() > 2048
        {
            return Err(self.fail("url_invalid"));
        }
        let host = url.host_str().unwrap_or("");
        if !(self.allowed_host)(provider, host) {
            return Err(self.fail("host_not_allowed"));
        }
        let addresses = resolve(host).await?;
        if addresses.is_empty() || addresses.iter().any(|address| !public_address(address)) {
            return Err(self.fail("address_invalid"));
        }
        Ok(url.to_string())
    }

    // Redirects are followed by hand: each target is checked before it is requested. The answer
    // and the checked address that gave it.
    async fn follow(
        &self,
        provider: &str,
        target: &str,
        headers: &[(&str, String)],
    ) -> Result<(reqwest::Response, String), String> {
        let mut url = target.to_string();
        for _ in 0..5 {
            let checked = self.checked_url(provider, &url).await?;
            let mut request = crate::providers::http::client()
                .get(&checked)
                .timeout(Duration::from_secs(20));
            for (name, value) in headers {
                request = request.header(*name, value);
            }
            let response = request
                .send()
                .await
                .map_err(|error| format!("fetch failed: {error}"))?;
            let status = response.status().as_u16();
            if !(300..400).contains(&status) {
                return Ok((response, checked));
            }
            let location = header(&response, "location");
            if location.is_empty() {
                return Err(self.fail("redirect_invalid"));
            }
            let base = parse_url(&url, None)?;
            url = parse_url(&location, Some(&base))?.to_string();
        }
        Err(self.fail("redirect_loop"))
    }

    /// `request(provider, target, headers)`: the answer its checked redirects end at.
    pub(super) async fn request(
        &self,
        provider: &str,
        target: &str,
        headers: &[(&str, String)],
    ) -> Result<reqwest::Response, String> {
        Ok(self.follow(provider, target, headers).await?.0)
    }

    /// Where a page player reads `file` itself, in byte ranges: the checked address its redirects
    /// end at, once it answers a range (a file behind a login answers 401: unavailable).
    pub(super) async fn readable_address(
        &self,
        provider: &str,
        file: &File,
    ) -> Result<JsonValue, String> {
        let (response, url) = self
            .follow(provider, &file.url, &[("Range", "bytes=0-0".into())])
            .await?;
        let status = response.status().as_u16();
        let (range, length) = (
            header(&response, "content-range"),
            header(&response, "content-length"),
        );
        drop(response);
        if status != 206 && status != 200 {
            return Err(self.fail("unavailable"));
        }
        let total = match find_total(&range) {
            Some(total) => total,
            None => header_number(&length),
        };
        if !safe_size(total, self.max_file_bytes) {
            return Err(self.fail("size_invalid"));
        }
        Ok(json!({ "url": url, "total": total as u64, "mime": file.mime }))
    }

    /// `readBounded(response, max)`: the whole answer, refused past `max` bytes.
    pub(super) async fn read_bounded(
        &self,
        mut response: reqwest::Response,
        max: u64,
    ) -> Result<Vec<u8>, String> {
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("terminated: {error}"))?
        {
            if (bytes.len() + chunk.len()) as u64 > max {
                return Err(self.fail("response_too_large"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }

    /// One byte range of `file` from `offset`: `{ base64, offset, length, total, mime }`.
    pub(super) async fn read_chunk(
        &self,
        provider: &str,
        file: &File,
        offset: f64,
    ) -> Result<JsonValue, String> {
        if offset.fract() != 0.0
            || offset.abs() > MAX_SAFE
            || offset < 0.0
            || offset >= self.max_file_bytes as f64
        {
            return Err(format!("{}_range_invalid", self.fetch_code));
        }
        let offset = offset as u64;
        let range = format!("bytes={offset}-{}", offset + self.chunk_bytes - 1);
        let response = self
            .request(provider, &file.url, &[("Range", range)])
            .await?;
        let status = response.status().as_u16();
        if status == 416 {
            return Err(format!("{}_range_invalid", self.fetch_code));
        }
        if status != 206 && !(status == 200 && offset == 0) {
            return Err(self.fail("unavailable"));
        }
        let (range, length) = (
            header(&response, "content-range"),
            header(&response, "content-length"),
        );
        let range = content_range_in(&range);
        // A whole answer may come without its length (chunked transfer, Flickr): its bytes are its size.
        let whole = range.is_none() && length.is_empty();
        let declared = range.map_or_else(|| header_number(&length), |(_, _, total)| total as f64);
        if !whole && !safe_size(declared, self.max_file_bytes) {
            return Err(self.fail("size_invalid"));
        }
        if range.is_some_and(|(first, ..)| first != offset) {
            return Err(self.fail("range_mismatch"));
        }
        let bound = if status == 206 {
            self.chunk_bytes
        } else {
            self.max_file_bytes
        };
        let bytes = self.read_bounded(response, bound).await?;
        let total = if whole { bytes.len() as f64 } else { declared };
        if total <= 0.0 {
            return Err(self.fail("size_invalid"));
        }
        // A server ignoring Range sends the whole file once: the client receives it in one piece.
        // `base64`, never `data`: the WebSocket client takes a reply's `data` as its envelope.
        Ok(
            json!({ "base64": base64::engine::general_purpose::STANDARD.encode(&bytes), "offset": offset,
            "length": bytes.len(), "total": total as u64, "mime": file.mime }),
        )
    }
}

// `/bytes \d+-\d+\/(\d+)/.exec(header)`: the total of the first such range anywhere in the header.
fn find_total(value: &str) -> Option<f64> {
    value
        .match_indices("bytes ")
        .find_map(|(at, _)| content_range(&value[at..]))
        .map(|(_, _, total)| total as f64)
}

// `/bytes (\d+)-(\d+)\/(\d+)/.exec(header)`.
fn content_range_in(value: &str) -> Option<(u64, u64, u64)> {
    value
        .match_indices("bytes ")
        .find_map(|(at, _)| content_range(&value[at..]))
}
