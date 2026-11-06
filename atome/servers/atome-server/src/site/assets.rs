// What a site page reads on any host (server/site_http.js, ported): the site font, the atome
// mark signing a page, the media of an online version by their content (video and sound by
// ranges) and a preview's pages and media under its token.
use super::http::{HTML, decoded, failed, month, reply};
use super::{Site, now_ms};
use crate::http::fastify_reply;
use crate::http::statics;
use crate::media::served;
use crate::vault_router::js;
use axum::body::Body;
use axum::http::{HeaderMap, Method, StatusCode, Uri, header};
use axum::response::Response;

const FONT_FILES: [&str; 3] = ["Roboto-Regular.ttf", "Roboto-Medium.ttf", "Roboto-Bold.ttf"];

impl Site {
    async fn stream(
        &self,
        headers: &HeaderMap,
        path: &std::path::Path,
        kind: &str,
        cache: &str,
    ) -> Response {
        let size = match tokio::fs::metadata(path).await {
            Ok(meta) => meta.len(),
            Err(error) => return failed(&error.to_string()),
        };
        let body = match served::streamed(path, 0, size).await {
            Ok(body) => body,
            Err(error) => return failed(&error),
        };
        let reply = reply(
            StatusCode::OK,
            &[
                ("cache-control", cache.into()),
                ("content-type", kind.into()),
            ],
            body,
        );
        fastify_reply::compressed_file(headers, reply).await
    }
    // A media of an online version (or of a preview, `?p=<token>`), read from its original
    // file; video and sound by ranges.
    async fn media(
        &self,
        sha: &str,
        uri: &Uri,
        headers: &HeaderMap,
    ) -> Result<Option<Response>, String> {
        if sha.len() != 64
            || !sha
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Ok(None);
        }
        let token: Vec<String> = url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes())
            .filter(|(key, _)| key == "p")
            .map(|(_, value)| value.into_owned())
            .collect();
        let held = (!token.is_empty() && !token.join(",").is_empty())
            .then(|| {
                let previews = self.previews.lock().expect("previews");
                let entry = previews
                    .get(&token.join(","))
                    .filter(|entry| entry.expires >= now_ms())?;
                entry
                    .media
                    .get(sha)
                    .map(|held| (held.file_path.clone(), held.mime.to_string()))
            })
            .flatten();
        let (path, mime, owner) = match held {
            Some((path, mime)) => (path, mime, String::new()),
            None => match self.store.live_media(sha).await? {
                Some(media) => (
                    std::path::PathBuf::from(js::text(media.get("file_path"))),
                    js::text(media.get("mime")),
                    js::text(media.get("owner_id")),
                ),
                None => return Ok(None),
            },
        };
        let size = tokio::fs::metadata(&path)
            .await
            .map_err(|e| e.to_string())?
            .len();
        let range = headers
            .get(header::RANGE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("");
        let base = [
            ("accept-ranges", "bytes".to_string()),
            (
                "cache-control",
                "public, max-age=31536000, immutable".to_string(),
            ),
            ("content-type", mime),
        ];
        if let Some((first, last)) = range
            .strip_prefix("bytes=")
            .and_then(|spec| spec.split_once('-'))
        {
            let digits = |text: &str| text.bytes().all(|c| c.is_ascii_digit());
            if digits(first) && digits(last) && !(first.is_empty() && last.is_empty()) {
                let number = |text: &str| text.parse::<f64>().unwrap_or(f64::NAN);
                let size_f = size as f64;
                let start = if first.is_empty() {
                    (size_f - number(last)).max(0.0)
                } else {
                    number(first)
                };
                let end = if !first.is_empty() && !last.is_empty() {
                    number(last).min(size_f - 1.0)
                } else {
                    size_f - 1.0
                };
                if start > end || start >= size_f {
                    let mut fields = base.to_vec();
                    fields.push(("content-range", format!("bytes */{size}")));
                    return Ok(Some(reply(
                        StatusCode::RANGE_NOT_SATISFIABLE,
                        &fields,
                        Body::empty(),
                    )));
                }
                let (start, end) = (start as u64, end as u64);
                if !owner.is_empty() {
                    self.store
                        .add_traffic(&owner, &month(), end - start + 1)
                        .await?;
                }
                let mut fields = base.to_vec();
                fields.push(("content-range", format!("bytes {start}-{end}/{size}")));
                fields.push(("content-length", (end - start + 1).to_string()));
                let body = served::streamed(&path, start, end - start + 1).await?;
                return Ok(Some(
                    fastify_reply::compressed_file(
                        headers,
                        reply(StatusCode::PARTIAL_CONTENT, &fields, body),
                    )
                    .await,
                ));
            }
        }
        if !owner.is_empty() {
            self.store.add_traffic(&owner, &month(), size).await?;
        }
        let mut fields = base.to_vec();
        fields.push(("content-length", size.to_string()));
        let body = served::streamed(&path, 0, size).await?;
        Ok(Some(
            fastify_reply::compressed_file(headers, reply(StatusCode::OK, &fields, body)).await,
        ))
    }
    fn preview_page(&self, rest: &str) -> Option<Response> {
        let (token, page) = rest.split_once('/')?;
        let (token, page) = (decoded(token)?, decoded(page)?);
        let page = page
            .split('/')
            .find(|part| !part.is_empty())
            .unwrap_or("")
            .to_string();
        let previews = self.previews.lock().expect("previews");
        let html = previews
            .get(&token)
            .filter(|entry| entry.expires >= now_ms())?
            .pages
            .get(&page)?;
        // Each media read through the preview's token.
        let mut out = String::with_capacity(html.len());
        let mut rest = html.as_str();
        while let Some(at) = rest.find("/_site/m/") {
            let after = &rest[at + 9..];
            let sha = after
                .bytes()
                .take_while(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c))
                .count();
            out.push_str(&rest[..at + 9]);
            if sha >= 64 {
                out.push_str(&after[..64]);
                out.push_str(&format!("?p={token}"));
                rest = &after[64..];
            } else {
                rest = after;
            }
        }
        out.push_str(rest);
        Some(reply(
            StatusCode::OK,
            &[
                ("cache-control", "no-store".into()),
                ("x-robots-tag", "noindex".into()),
                ("content-type", HTML.into()),
            ],
            Body::from(out),
        ))
    }
    /// `/_site/fonts/:file`, `/_site/logo.svg`, `/_site/m/:sha`, `/_site/preview/:token/*`
    /// (`GET`, `HEAD`), on any host; none for another request.
    pub async fn assets(
        &self,
        method: &Method,
        uri: &Uri,
        headers: &HeaderMap,
    ) -> Option<Response> {
        if !matches!(*method, Method::GET | Method::HEAD) {
            return None;
        }
        let path = uri.path();
        let rest = path.strip_prefix("/_site/")?;
        let not_found = || statics::not_found(method, path);
        if rest == "logo.svg" {
            return Some(
                self.stream(
                    headers,
                    &self.logo,
                    "image/svg+xml",
                    "public, max-age=86400",
                )
                .await,
            );
        }
        if let Some(file) = rest
            .strip_prefix("fonts/")
            .filter(|file| !file.contains('/') && !file.is_empty())
        {
            let file = decoded(file)?;
            if !FONT_FILES.contains(&file.as_str()) {
                return Some(not_found());
            }
            return Some(
                self.stream(
                    headers,
                    &self.fonts.join(file),
                    "font/ttf",
                    "public, max-age=31536000, immutable",
                )
                .await,
            );
        }
        if let Some(sha) = rest
            .strip_prefix("m/")
            .filter(|sha| !sha.contains('/') && !sha.is_empty())
        {
            let sha = decoded(sha)?;
            return Some(match self.media(&sha, uri, headers).await {
                Ok(Some(response)) => response,
                Ok(None) => not_found(),
                Err(error) => failed(&error),
            });
        }
        if let Some(rest) = rest.strip_prefix("preview/") {
            return Some(match self.preview_page(rest) {
                Some(response) => fastify_reply::compressed(headers, response).await,
                None => not_found(),
            });
        }
        None
    }
}
