// The IPA of a release (`GET /ios/builds/:id/atome.ipa` of server/http_ios_ota_routes.js): behind
// a capability bound to that release, whole or the byte range asked, counted as downloaded
// while its stream lives so the retention sweep keeps it.
use super::{Downloads, failed, now_ms, store};
use crate::http::fastify_reply::{self, NodeError};
use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::Response;
use futures_util::StreamExt;
use serde_json::Value as JsonValue;
use std::path::Path;

// One download of a release: counted while its stream lives.
struct Downloading {
    active: Downloads,
    id: String,
}

impl Drop for Downloading {
    fn drop(&mut self) {
        let mut active = self.active.lock().expect("ota downloads");
        if let Some(count) = active.get_mut(&self.id) {
            *count -= 1;
            if *count == 0 {
                active.remove(&self.id);
            }
        }
    }
}

// `bytes=(\d*)-(\d*)` of `total` bytes: its first and last byte, or none when unsatisfiable.
fn range_of(range: &str, total: u64) -> Option<(u64, u64)> {
    let (first, last) = range.strip_prefix("bytes=")?.split_once('-')?;
    let digits = |part: &str| part.bytes().all(|b| b.is_ascii_digit());
    if !digits(first) || !digits(last) || (first.is_empty() && last.is_empty()) {
        return None;
    }
    let number = |part: &str| part.parse::<f64>().unwrap_or(f64::INFINITY);
    let total = total as f64;
    let (mut start, mut end) = (0.0, total - 1.0);
    if first.is_empty() {
        start = (total - number(last)).max(0.0);
    } else {
        start = number(first).max(start);
        if !last.is_empty() {
            end = number(last).min(total - 1.0);
        }
    }
    let safe = |value: f64| value.fract() == 0.0 && value.abs() <= 9_007_199_254_740_991.0;
    (safe(start) && safe(end) && start <= end && start < total)
        .then_some((start as u64, end as u64))
}

// `GET /ios/builds/:id/atome.ipa`: the release's IPA, whole or the range asked.
pub(super) async fn ipa(
    root: &Path,
    active: &Downloads,
    id: String,
    cap: Option<&JsonValue>,
    headers: &HeaderMap,
    head: bool,
) -> Result<Response, NodeError> {
    let config = store::read_json(&root.join("settings.json"))?;
    let Some(capability) = store::verify(config.get("secret"), cap, now_ms()) else {
        return Ok(failed(StatusCode::FORBIDDEN, "ota_capability_denied"));
    };
    let user = capability.get("user").cloned().unwrap_or(JsonValue::Null);
    if capability.get("id").and_then(JsonValue::as_str) != Some(id.as_str())
        || !store::enabled_user(&config, &user)?
    {
        return Ok(failed(StatusCode::FORBIDDEN, "ota_access_denied"));
    }
    let directory = store::store_path(root, "releases", &id)?;
    if !directory.exists() {
        return Ok(failed(StatusCode::GONE, "ota_release_retired"));
    }
    let file = directory.join("atome.ipa");
    let total = std::fs::metadata(&file)
        .map_err(|e| fastify_reply::node_fs_error(&e, "stat", &file))?
        .len();
    let mut response = Response::new(Body::empty());
    let (start, end) = match headers
        .get(header::RANGE)
        .and_then(|range| range.to_str().ok())
        .filter(|range| !range.is_empty())
    {
        None => (0, total.saturating_sub(1)),
        Some(range) => {
            let Some((start, end)) = range_of(range, total) else {
                *response.status_mut() = StatusCode::RANGE_NOT_SATISFIABLE;
                let unsatisfied =
                    HeaderValue::from_str(&format!("bytes */{total}")).expect("content range");
                response
                    .headers_mut()
                    .insert(header::CONTENT_RANGE, unsatisfied);
                response
                    .headers_mut()
                    .insert(header::CONTENT_LENGTH, HeaderValue::from_static("0"));
                return Ok(response);
            };
            *response.status_mut() = StatusCode::PARTIAL_CONTENT;
            let range = HeaderValue::from_str(&format!("bytes {start}-{end}/{total}"))
                .expect("content range");
            response.headers_mut().insert(header::CONTENT_RANGE, range);
            (start, end)
        }
    };
    // The file is opened before the reply goes: a release swept meanwhile is still read whole.
    let body = crate::media::served::streamed(&file, start, end - start + 1)
        .await
        .map_err(|message| NodeError {
            code: None,
            message,
        })?;
    *active
        .lock()
        .expect("ota downloads")
        .entry(id.clone())
        .or_default() += 1;
    let downloading = Downloading {
        active: active.clone(),
        id,
    };
    let counted = body.into_data_stream().map(move |chunk| {
        let _ = &downloading;
        chunk
    });
    *response.body_mut() = Body::from_stream(counted);
    let fields = response.headers_mut();
    fields.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    fields.insert(header::CONTENT_LENGTH, HeaderValue::from(end - start + 1));
    fields.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );
    Ok(if head {
        response
    } else {
        fastify_reply::compressed_file(headers, response).await
    })
}
