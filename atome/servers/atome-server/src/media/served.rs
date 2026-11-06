// A person's files read over HTTP (server/http_media_serving_routes.js `GET /api/uploads/:file`,
// `/api/recordings/:file` and `/api/extract-audio/:file`, ported): the reader is the verified
// device session, else the signed media capability of `?media_token=` (a <video>, an <audio> or
// an <img> sends no Authorization); the file is the one `Downloads::target` grants, a video sent
// as its playable copy, by byte ranges for seeking; an extracted audio track is the `.m4a` a
// WebKit view decodes from a `.mov` or `.m4v` (audio_track.rs).
use super::downloads::{Download, Downloads, Missed};
use super::playback::{self, basename};
use super::uploads::{header, user_id};
use crate::auth::{Sessions, media_token};
use crate::http::{fastify_reply, uri};
use crate::vault_router::js;
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header as name};
use axum::response::Response;
use serde_json::json;
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

#[derive(Clone, Copy, PartialEq)]
enum Route {
    Uploads,
    Recordings,
    ExtractAudio,
}

const ROUTES: [(&str, Route); 3] = [
    ("/api/uploads/", Route::Uploads),
    ("/api/recordings/", Route::Recordings),
    ("/api/extract-audio/", Route::ExtractAudio),
];
// find-my-way's `maxParamLength`: a longer parameter matches no route.
const MAX_PARAM_LENGTH: usize = 100;
const READ_CHUNK: usize = 64 * 1024;
// The routes' types by extension; `/api/uploads/` alone adds `DOCUMENT_TYPES`.
const MEDIA_TYPES: [(&str, &str); 18] = [
    (".mp4", "video/mp4"),
    (".m4v", "video/mp4"),
    (".mov", "video/quicktime"),
    (".webm", "video/webm"),
    (".avi", "video/x-msvideo"),
    (".mkv", "video/x-matroska"),
    (".mp3", "audio/mpeg"),
    (".m4a", "audio/mp4"),
    (".aac", "audio/aac"),
    (".ogg", "audio/ogg"),
    (".wav", "audio/wav"),
    (".flac", "audio/flac"),
    (".webp", "image/webp"),
    (".png", "image/png"),
    (".jpg", "image/jpeg"),
    (".jpeg", "image/jpeg"),
    (".gif", "image/gif"),
    (".svg", "image/svg+xml"),
];
const DOCUMENT_TYPES: [(&str, &str); 2] =
    [(".pdf", "application/pdf"), (".json", "application/json")];

// The route and its parameter, decoded as find-my-way decodes it; None for another path.
fn route_of(request: &Request) -> Option<(Route, String)> {
    if !matches!(*request.method(), Method::GET | Method::HEAD) {
        return None;
    }
    let path = request.uri().path();
    let (route, raw) = ROUTES
        .iter()
        .find_map(|(prefix, route)| path.strip_prefix(prefix).map(|raw| (*route, raw)))?;
    if raw.contains('/') {
        return None;
    }
    let param = uri::decode_uri_component(raw).ok()?;
    (param.encode_utf16().count() <= MAX_PARAM_LENGTH).then_some((route, param))
}

pub fn claims(request: &Request) -> bool {
    route_of(request).is_some()
}

// Node's `path.extname`, lowered.
pub(super) fn extension(path: &Path) -> String {
    let name = basename(path.to_str().unwrap_or(""));
    match name.rfind('.') {
        Some(dot) if dot > 0 => name[dot..].to_lowercase(),
        _ => String::new(),
    }
}

// `readMediaTokenFromQuery`: the first `media_token`, trimmed, at most 4096 long.
fn media_token_of(query: &str) -> String {
    let token = url::form_urlencoded::parse(query.as_bytes())
        .find(|(key, _)| key == "media_token")
        .map(|(_, value)| value.trim().to_string())
        .unwrap_or_default();
    if token.encode_utf16().count() <= 4096 {
        token
    } else {
        String::new()
    }
}

pub(super) fn failed(status: u16, error: &str) -> Response {
    fastify_reply::json(
        StatusCode::from_u16(status).unwrap_or(StatusCode::NOT_FOUND),
        &json!({ "success": false, "error": error }),
    )
}

// A header value as Node writes it: Latin-1, refused past it or on a control character.
fn latin1(value: &str) -> Result<HeaderValue, String> {
    let bytes: Option<Vec<u8>> = value
        .chars()
        .map(|c| match c as u32 {
            0x09 | 0x20..=0x7e | 0x80..=0xff => Some(c as u8),
            _ => None,
        })
        .collect();
    bytes
        .and_then(|bytes| HeaderValue::from_bytes(&bytes).ok())
        .ok_or_else(|| "Invalid character in header content [\"Content-Disposition\"]".into())
}

// `count` bytes of `path` from `start`, read as they are sent.
pub async fn streamed(path: &Path, start: u64, count: u64) -> Result<Body, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| e.to_string())?;
    file.seek(std::io::SeekFrom::Start(start))
        .await
        .map_err(|e| e.to_string())?;
    let chunks = futures_util::stream::unfold((file, count), |(mut file, left)| async move {
        if left == 0 {
            return None;
        }
        let mut buffer = vec![0; READ_CHUNK.min(left as usize)];
        match file.read(&mut buffer).await {
            Ok(0) => None,
            Ok(read) => {
                buffer.truncate(read);
                Some((
                    Ok(axum::body::Bytes::from(buffer)),
                    (file, left - read as u64),
                ))
            }
            Err(error) => Some((Err(error), (file, 0))),
        }
    });
    // The encoder of a compressed reply polls its body once more after its end.
    Ok(Body::from_stream(futures_util::StreamExt::fuse(chunks)))
}

// `^bytes=(\d+)-(\d*)$`: its first byte and its last, if it says one.
fn range_of(text: &str) -> Option<(f64, Option<f64>)> {
    let (start, end) = text.strip_prefix("bytes=")?.split_once('-')?;
    let digits = |part: &str| part.bytes().all(|b| b.is_ascii_digit());
    if start.is_empty() || !digits(start) || !digits(end) {
        return None;
    }
    let number = |part: &str| part.parse::<f64>().unwrap_or(f64::INFINITY);
    Some((number(start), (!end.is_empty()).then(|| number(end))))
}

// Node refuses a header past Latin-1 while Fastify sets a stream's headers one by one: the reply
// keeps those set before it (its type, its ranges, the `Vary` @fastify/compress named when it
// would encode) and carries Fastify's error, sent as a stream.
async fn refused_header(headers: &HeaderMap, kind: HeaderValue, head: bool) -> Response {
    let mut probe = Response::new(Body::empty());
    probe.headers_mut().insert(name::CONTENT_TYPE, kind.clone());
    let encodes = !head
        && fastify_reply::compressed_file(headers, probe)
            .await
            .headers()
            .contains_key(name::CONTENT_ENCODING);
    let error = json!({ "statusCode": 500, "code": "ERR_INVALID_CHAR", "error": "Internal Server Error",
        "message": "Invalid character in header content [\"content-disposition\"]" });
    let chunk = futures_util::stream::once(async move {
        Ok::<_, std::io::Error>(axum::body::Bytes::from(error.to_string()))
    });
    let mut response = Response::new(Body::from_stream(chunk));
    *response.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
    let fields = response.headers_mut();
    if encodes {
        fields.insert(name::VARY, HeaderValue::from_static("accept-encoding"));
    }
    fields.insert(name::CONTENT_TYPE, kind);
    fields.insert(name::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response
}

// The file, its whole or the range asked, under `kind` and `download_name`; a HEAD is never
// encoded.
async fn sent(
    headers: &HeaderMap,
    file: &Path,
    kind: &str,
    download_name: &str,
    head: bool,
) -> Result<Response, String> {
    let total = tokio::fs::metadata(file)
        .await
        .map_err(|e| e.to_string())?
        .len();
    let kind = latin1(kind)?;
    let Ok(disposition) = latin1(&format!("inline; filename=\"{download_name}\"")) else {
        return Ok(refused_header(headers, kind, head).await);
    };
    let mut response = Response::new(Body::empty());
    let fields = response.headers_mut();
    fields.insert(name::CONTENT_TYPE, kind);
    fields.insert(name::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    fields.insert(name::CONTENT_DISPOSITION, disposition);
    fields.insert(
        name::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Range, Content-Length, Accept-Ranges"),
    );
    let asked = header(headers, "range").and_then(|range| range_of(&range));
    let (start, count) = match asked {
        Some((start, end)) => {
            let last = end.unwrap_or(total as f64 - 1.0);
            if start >= total as f64 || last >= total as f64 || start > last {
                *response.status_mut() = StatusCode::RANGE_NOT_SATISFIABLE;
                let fields = response.headers_mut();
                fields.insert(name::CONTENT_RANGE, latin1(&format!("bytes */{total}"))?);
                fields.insert(name::CONTENT_LENGTH, HeaderValue::from_static("0"));
                return Ok(response);
            }
            let (start, last) = (start as u64, last as u64);
            *response.status_mut() = StatusCode::PARTIAL_CONTENT;
            let fields = response.headers_mut();
            fields.insert(
                name::CONTENT_RANGE,
                latin1(&format!("bytes {start}-{last}/{total}"))?,
            );
            (start, last - start + 1)
        }
        None => (0, total),
    };
    response
        .headers_mut()
        .insert(name::CONTENT_LENGTH, HeaderValue::from(count));
    *response.body_mut() = streamed(file, start, count).await?;
    if head {
        return Ok(response);
    }
    Ok(fastify_reply::compressed_file(headers, response).await)
}

// An uploaded file or a recording, as its playable copy when it is a video.
async fn media(
    headers: &HeaderMap,
    route: Route,
    found: Download,
    head: bool,
) -> Result<Response, String> {
    let mime = found
        .meta
        .as_ref()
        .and_then(|meta| meta.get("mime_type"))
        .filter(|mime| js::truthy(Some(mime)))
        .map(js::string);
    let source = basename(found.file_path.to_str().unwrap_or("")).to_string();
    let (file, download_name, kind) =
        match playback::ensure_cache(&found.file_path, &source, mime.as_deref().unwrap_or(""))
            .await?
        {
            Some((cached, cached_name)) => (cached, cached_name, Some("video/mp4".to_string())),
            None => (
                found.file_path.clone(),
                Some(found.download_name)
                    .filter(|name| !name.is_empty())
                    .unwrap_or(source),
                None,
            ),
        };
    let extension = extension(&file);
    let documents: &[(&str, &str)] = if route == Route::Uploads {
        &DOCUMENT_TYPES
    } else {
        &[]
    };
    let known = MEDIA_TYPES
        .iter()
        .chain(documents)
        .find(|(ext, _)| *ext == extension)
        .map(|(_, kind)| kind.to_string());
    let kind = kind
        .or(mime)
        .or(known)
        .unwrap_or_else(|| "application/octet-stream".into());
    sent(headers, &file, &kind, &download_name, head).await
}

/// The answer to a read `claims` took.
pub async fn answer(downloads: &Downloads<'_>, sessions: &Sessions, request: Request) -> Response {
    let Some((route, param)) = route_of(&request) else {
        return failed(404, "File not found");
    };
    let headers = request.headers().clone();
    let head = request.method() == Method::HEAD;
    let mut user = user_id(sessions.validate_request(&headers).await.as_ref());
    if user == "anonymous" {
        let token = media_token_of(request.uri().query().unwrap_or(""));
        if let Some(principal) = media_token::verify(sessions, &token, &param).await {
            user = principal;
        }
    }
    let response = match (route, downloads.target(&param, &user).await) {
        (_, Err(Missed::Refused(status, error))) => failed(status, &error),
        (Route::ExtractAudio, found) => {
            let answered = match found {
                Ok(found) => super::audio_track::answer(found).await,
                Err(Missed::Failed(error) | Missed::Refused(_, error)) => Err(error),
            };
            match answered {
                Ok(Ok(response) | Err(response)) => response,
                // A missing file is a 404 (Node's ENOENT), any other failure a 500.
                Err(error) if error.starts_with("ENOENT") => failed(404, &error),
                Err(error) => failed(500, &error),
            }
        }
        (_, Ok(found)) => media(&headers, route, found, head)
            .await
            .unwrap_or_else(|error| failed(404, &error)),
        (_, Err(Missed::Failed(error))) => failed(404, &error),
    };
    if head {
        let (parts, _) = response.into_parts();
        return Response::from_parts(parts, Body::empty());
    }
    response
}
