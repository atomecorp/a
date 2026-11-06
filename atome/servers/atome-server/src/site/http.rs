// The public side of the websites (server/site_http.js, ported): atome.one/<slug>[/<page>/] read
// by anyone, a personal domain read by its host, the media of an online version by their
// content, the site font, the atome mark signing a page (the app's own glyph,
// `assets/images/icons/atome.svg`), and the contact form (contact.rs). A page address is
// answered only once no file of the app and no route claims it (web.rs), so nothing of the app is
// ever shadowed by an address.
use super::objects::escape_html;
use super::{Site, now_ms};
use crate::http::fastify_reply;
use crate::vault_router::js;
use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::Response;
use serde_json::{Value as JsonValue, json};

pub(super) const HTML: &str = "text/html; charset=utf-8";

pub(super) fn notice(title: &str, body: &str, extra: &str) -> String {
    format!(
        "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">{extra}<title>{}</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#15182c;color:#efeaff}}main{{max-width:34rem;padding:2rem;text-align:center}}a{{color:#a9b2ff}}</style></head><body><main><h1>{}</h1>{body}</main></body></html>",
        escape_html(title),
        escape_html(title)
    )
}

pub(super) fn month() -> String {
    js::iso(now_ms())[..7].to_string()
}

pub(super) fn reply(
    status: StatusCode,
    headers: &[(&'static str, String)],
    body: Body,
) -> Response {
    let mut response = Response::new(body);
    *response.status_mut() = status;
    for (name, value) in headers {
        if let Ok(value) = HeaderValue::from_str(value) {
            response.headers_mut().insert(*name, value);
        }
    }
    response
}

fn redirect(location: &str) -> Response {
    reply(
        StatusCode::MOVED_PERMANENTLY,
        &[("location", location.to_string())],
        Body::empty(),
    )
}

pub(super) fn failed(error: &str) -> Response {
    fastify_reply::json(
        StatusCode::INTERNAL_SERVER_ERROR,
        &json!({ "statusCode": 500, "error": "Internal Server Error", "message": error }),
    )
}

/// `decodeURIComponent`: none for a malformed escape.
pub(super) fn decoded(part: &str) -> Option<String> {
    let bytes = part.as_bytes();
    let mut at = 0;
    while let Some(offset) = bytes[at..].iter().position(|c| *c == b'%') {
        let escape = bytes.get(at + offset + 1..at + offset + 3)?;
        if !escape.iter().all(u8::is_ascii_hexdigit) {
            return None;
        }
        at += offset + 3;
    }
    percent_encoding::percent_decode_str(part)
        .decode_utf8()
        .ok()
        .map(|text| text.into_owned())
}

fn parts_of(path: &str) -> Option<Vec<String>> {
    path.split('/')
        .filter(|part| !part.is_empty())
        .map(|part| decoded(part).map(|part| part.to_lowercase()))
        .collect()
}

fn page_path(slug: &str, page: &str) -> String {
    if page.is_empty() {
        format!("{slug}/")
    } else {
        format!("{slug}/{page}/")
    }
}

impl Site {
    async fn send_page(
        &self,
        row: &JsonValue,
        page_slug: &str,
        headers: &HeaderMap,
    ) -> Result<Response, String> {
        if row["state"] == json!("retired") {
            let body = notice(
                "Ce site n’existe plus",
                "<p>Son auteur l’a retiré.</p>",
                "<meta name=\"robots\" content=\"noindex\">",
            );
            let reply = reply(
                StatusCode::GONE,
                &[
                    ("x-robots-tag", "noindex".into()),
                    ("content-type", HTML.into()),
                ],
                Body::from(body),
            );
            return Ok(fastify_reply::compressed(headers, reply).await);
        }
        let site_id = js::text(row.get("site_id"));
        let live = &row["live_version"];
        let version = if row["state"] == json!("online") && js::truthy(Some(live)) {
            self.store.version(&site_id, live).await?
        } else {
            None
        };
        let page = version.as_ref().and_then(|version| {
            version["manifest"]["pages"]
                .as_array()?
                .iter()
                .find(|entry| {
                    entry
                        .get("slug")
                        .filter(|slug| js::truthy(Some(slug)))
                        .map_or(String::new(), |slug| js::text(Some(slug)))
                        == page_slug
                })
                .cloned()
        });
        let Some(page) = page else {
            let back = format!(
                "<p><a href=\"/{}/\">Revenir à l’accueil</a></p>",
                escape_html(&js::text(row.get("slug")))
            );
            let reply = reply(
                StatusCode::NOT_FOUND,
                &[("content-type", HTML.into())],
                Body::from(notice("Page introuvable", &back, "")),
            );
            return Ok(fastify_reply::compressed(headers, reply).await);
        };
        let slug = page
            .get("slug")
            .filter(|slug| js::truthy(Some(slug)))
            .map(|slug| js::text(Some(slug)));
        let file = self
            .version_dir(&site_id, live)
            .join(format!("{}.html", slug.as_deref().unwrap_or("_home")));
        let html = tokio::fs::read(&file).await.map_err(|e| e.to_string())?;
        self.store
            .add_traffic(&js::text(row.get("owner_id")), &month(), html.len() as u64)
            .await?;
        let prefix: String = site_id.chars().take(8).collect();
        let etag = format!(
            "\"{prefix}-{}-{}\"",
            js::text(Some(live)),
            slug.as_deref().unwrap_or("home")
        );
        if headers
            .get(header::IF_NONE_MATCH)
            .and_then(|value| value.to_str().ok())
            == Some(etag.as_str())
        {
            return Ok(reply(StatusCode::NOT_MODIFIED, &[], Body::empty()));
        }
        let reply = reply(
            StatusCode::OK,
            &[
                ("cache-control", "public, max-age=0, must-revalidate".into()),
                ("etag", etag),
                ("content-type", HTML.into()),
            ],
            Body::from(html),
        );
        Ok(fastify_reply::compressed(headers, reply).await)
    }

    /// A personal domain (Q13): its host serves its site at its root; the address not chosen as
    /// main redirects. None when `host` is no active site's.
    pub async fn personal(
        &self,
        host: &str,
        method: &Method,
        uri: &Uri,
        headers: &HeaderMap,
    ) -> Option<Response> {
        let path = uri.path();
        if host.is_empty()
            || !matches!(*method, Method::GET | Method::HEAD)
            || path.starts_with("/_site/")
        {
            return None;
        }
        let row = match self.store.by_domain(host).await {
            Ok(row) => row?,
            Err(error) => return Some(failed(&error)),
        };
        if row["domain_state"] != json!("active") {
            return None;
        }
        let Some(parts) = parts_of(path) else {
            return Some(failed("URI malformed"));
        };
        let slug = js::text(row.get("slug"));
        let page = if parts.first() == Some(&slug) {
            parts.get(1)
        } else {
            parts.first()
        };
        let page = page.cloned().unwrap_or_default();
        if row["primary_host"] != json!("domain") {
            return Some(redirect(&format!(
                "{}/{}",
                self.origin,
                page_path(&slug, &page)
            )));
        }
        Some(
            self.send_page(&row, &page, headers)
                .await
                .unwrap_or_else(|error| failed(&error)),
        )
    }

    /// atome.one/<slug>[/<page>/] and `/robots.txt`, once no file and no route of the app
    /// answers: an address once used redirects to the site's current one (Q7). None when no
    /// site has that address.
    pub async fn page(&self, method: &Method, uri: &Uri, headers: &HeaderMap) -> Option<Response> {
        let path = uri.path();
        if !matches!(*method, Method::GET | Method::HEAD) {
            return None;
        }
        if path == "/robots.txt" {
            return Some(reply(
                StatusCode::OK,
                &[("content-type", "text/plain".into())],
                Body::from("User-agent: *\nAllow: /\n"),
            ));
        }
        if path.contains('.') {
            return None;
        }
        let parts = parts_of(path)?;
        let [slug, page @ ..] = parts.as_slice() else {
            return None;
        };
        if page.len() > 1 {
            return None;
        }
        let page = page.first().cloned().unwrap_or_default();
        let row = match self.store.by_slug(slug).await {
            Ok(row) => row?,
            Err(error) => return Some(failed(&error)),
        };
        if js::truthy(row.get("domain"))
            && row["domain_state"] == json!("active")
            && row["primary_host"] == json!("domain")
        {
            let page = if page.is_empty() {
                String::new()
            } else {
                format!("{page}/")
            };
            return Some(redirect(&format!(
                "https://{}/{page}",
                js::text(row.get("domain"))
            )));
        }
        let current = js::text(row.get("slug"));
        if current != *slug || !path.ends_with('/') {
            return Some(redirect(&format!("/{}", page_path(&current, &page))));
        }
        Some(
            self.send_page(&row, &page, headers)
                .await
                .unwrap_or_else(|error| failed(&error)),
        )
    }
}
