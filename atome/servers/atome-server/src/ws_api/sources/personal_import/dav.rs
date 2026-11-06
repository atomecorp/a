// The one way a personal import reaches a DAV server (server/ws_personal_import.js `checkedDavUrl`
// and its `fetchImpl`, ported): an https address of iCloud or of a host the operator allows, every
// resolved address public, checked again before each request; each request read-only (PROPFIND,
// REPORT), never redirected, bounded in time (80 s for the import, 15 s each), in count (128) and in
// size (32 MiB), made only while the connection is still open on the same account, and its XML refused
// when it declares a DOCTYPE or an ENTITY.
use super::super::super::Connection;
use super::super::public_source::{parse_url, public_address, resolve};
use super::xml;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use std::time::{Duration, Instant};

const MAX_REQUESTS: usize = 128;
const MAX_BYTES: usize = 32 * 1024 * 1024;

/// `checkedDavUrl(input, { allowed })`: the address as `url.href` writes it.
pub async fn checked_url(input: &str, allowed: &[String]) -> Result<String, String> {
    let url = parse_url(input, None)?;
    let invalid = url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some_and(|password| !password.is_empty())
        || url.port().is_some()
        || url.fragment().is_some_and(|hash| !hash.is_empty())
        || url.query().is_some_and(|search| !search.is_empty())
        || input.encode_utf16().count() > 2048;
    if invalid {
        return Err("dav_url_invalid".into());
    }
    let host = url.host_str().unwrap_or_default();
    if !(host == "icloud.com"
        || host.ends_with(".icloud.com")
        || allowed.iter().any(|allowed| allowed == host))
    {
        return Err("dav_host_not_allowed".into());
    }
    let addresses = resolve(host).await?;
    if addresses.is_empty() || addresses.iter().any(|address| !public_address(address)) {
        return Err("dav_address_invalid".into());
    }
    Ok(url.to_string())
}

/// A DAV answer as `fetchImpl` hands it on: `{ ok, status, text }`.
pub struct Reply {
    pub ok: bool,
    pub status: u16,
    pub text: String,
}

/// The import's requests: who asked, the hosts allowed, the deadline and the count so far.
pub struct Session<'a> {
    pub connection: &'a Arc<Connection>,
    pub message: &'a JsonValue,
    pub user: String,
    pub allowed: Vec<String>,
    pub deadline: Instant,
    pub requests: usize,
}

impl Session<'_> {
    /// `fetchImpl(target, { method, headers, body })`.
    pub async fn fetch(
        &mut self,
        target: &str,
        method: &str,
        headers: &[(&str, String)],
        body: String,
    ) -> Result<Reply, String> {
        let front = self
            .connection
            .connection_of(json!({ "message": self.message, "current": true }))
            .await?;
        let same = front.get("session_error").is_none()
            && front.get("principal").and_then(JsonValue::as_str) == Some(self.user.as_str())
            && !self.connection.to_client.is_closed();
        if !same {
            return Err("dav_session_changed".into());
        }
        let now = Instant::now();
        if now >= self.deadline {
            return Err("dav_batch_limit".into());
        }
        self.requests += 1;
        if self.requests > MAX_REQUESTS {
            return Err("dav_batch_limit".into());
        }
        if !["PROPFIND", "REPORT"].contains(&method) {
            return Err("dav_write_forbidden".into());
        }
        checked_url(target, &self.allowed).await?;
        let method =
            reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
        let remaining = self.deadline.saturating_duration_since(Instant::now());
        let mut request = crate::providers::http::client()
            .request(method, target)
            .timeout(remaining.min(Duration::from_millis(15_000)))
            .body(body);
        for (name, value) in headers {
            request = request.header(*name, value);
        }
        let mut response = request
            .send()
            .await
            .map_err(|error| format!("fetch failed: {error}"))?;
        let status = response.status().as_u16();
        if (300..400).contains(&status) {
            return Err("dav_redirect_requires_configuration".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("terminated: {error}"))?
        {
            bytes.extend_from_slice(&chunk);
            if bytes.len() > MAX_BYTES {
                return Err("dav_response_too_large".into());
            }
        }
        // `TextDecoder` (UTF-8, replacement characters, a leading BOM dropped).
        let text = String::from_utf8_lossy(&bytes);
        let text = text.strip_prefix('\u{feff}').unwrap_or(&text).to_string();
        if xml::declares(&text) {
            return Err("dav_xml_unsafe".into());
        }
        Ok(Reply {
            ok: (200..300).contains(&status),
            status,
            text,
        })
    }
}
