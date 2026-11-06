// Media served by byte range (HTTP Range) from memory or from a file.
use super::*;

/// Serve bytes with optional HTTP Range support.
/// WKWebView <video> elements require Accept-Ranges for proper playback.
pub(super) fn serve_bytes_with_range(
    bytes: Vec<u8>,
    content_type: &'static str,
    etag: &str,
    request_headers: &HeaderMap,
    disposition: &str,
) -> axum::response::Response {
    let total = bytes.len();

    let range_header = request_headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            let trimmed = v.trim();
            if let Some(spec) = trimmed.strip_prefix("bytes=") {
                let parts: Vec<&str> = spec.splitn(2, '-').collect();
                if parts.len() == 2 {
                    let start = parts[0].parse::<usize>().ok();
                    let end_raw = parts[1].trim();
                    let end = if end_raw.is_empty() {
                        None
                    } else {
                        end_raw.parse::<usize>().ok()
                    };
                    Some((start, end))
                } else {
                    None
                }
            } else {
                None
            }
        });

    if let Some((range_start_opt, range_end_opt)) = range_header {
        let start = range_start_opt.unwrap_or(0).min(total);
        let end = range_end_opt.map(|e| (e + 1).min(total)).unwrap_or(total);
        if start >= end || start >= total {
            let mut h = HeaderMap::new();
            if let Ok(cr) = HeaderValue::from_str(&format!("bytes */{}", total)) {
                h.insert(header::CONTENT_RANGE, cr);
            }
            return (StatusCode::RANGE_NOT_SATISFIABLE, h).into_response();
        }
        let slice = bytes[start..end].to_vec();
        let mut h = HeaderMap::new();
        h.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
        if let Ok(cr) = HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end - 1, total)) {
            h.insert(header::CONTENT_RANGE, cr);
        }
        if let Ok(cl) = HeaderValue::from_str(&slice.len().to_string()) {
            h.insert(header::CONTENT_LENGTH, cl);
        }
        if let Ok(hv) = HeaderValue::from_str(etag) {
            h.insert(header::ETAG, hv);
        }
        h.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, max-age=300"),
        );
        return (StatusCode::PARTIAL_CONTENT, h, slice).into_response();
    }

    let mut h = HeaderMap::new();
    h.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=300"),
    );
    if let Ok(hv) = HeaderValue::from_str(etag) {
        h.insert(header::ETAG, hv);
    }
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if !disposition.is_empty()
        && let Ok(dv) = HeaderValue::from_str(disposition)
    {
        h.insert(header::CONTENT_DISPOSITION, dv);
    }
    if let Ok(cl) = HeaderValue::from_str(&total.to_string()) {
        h.insert(header::CONTENT_LENGTH, cl);
    }
    (StatusCode::OK, h, bytes).into_response()
}

pub(super) fn parse_http_range(
    request_headers: &HeaderMap,
    total: usize,
) -> Option<Result<(usize, usize), HeaderMap>> {
    let range_header = request_headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())?
        .trim()
        .to_string();
    if !range_header.starts_with("bytes=") {
        return None;
    }
    let spec = &range_header[6..];
    let parts: Vec<&str> = spec.splitn(2, '-').collect();
    if parts.len() != 2 {
        return None;
    }
    let start = parts[0].parse::<usize>().ok().unwrap_or(0).min(total);
    let end_raw = parts[1].trim();
    let end = if end_raw.is_empty() {
        total
    } else {
        end_raw
            .parse::<usize>()
            .ok()
            .map(|value| (value + 1).min(total))
            .unwrap_or(total)
    };
    if start >= end || start >= total {
        let mut h = HeaderMap::new();
        if let Ok(cr) = HeaderValue::from_str(&format!("bytes */{}", total)) {
            h.insert(header::CONTENT_RANGE, cr);
        }
        return Some(Err(h));
    }
    Some(Ok((start, end)))
}

pub(super) async fn serve_file_with_range(
    file_path: &Path,
    content_type: &'static str,
    etag: &str,
    request_headers: &HeaderMap,
    disposition: &str,
) -> Result<axum::response::Response, std::io::Error> {
    let metadata = fs::metadata(file_path).await?;
    let total = metadata.len() as usize;
    if let Some(range) = parse_http_range(request_headers, total) {
        let (start, end) = match range {
            Ok(range) => range,
            Err(headers) => return Ok((StatusCode::RANGE_NOT_SATISFIABLE, headers).into_response()),
        };
        let mut file = fs::File::open(file_path).await?;
        file.seek(std::io::SeekFrom::Start(start as u64)).await?;
        let mut slice = vec![0; end - start];
        file.read_exact(&mut slice).await?;

        let mut h = HeaderMap::new();
        h.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
        if let Ok(cr) = HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end - 1, total)) {
            h.insert(header::CONTENT_RANGE, cr);
        }
        if let Ok(cl) = HeaderValue::from_str(&slice.len().to_string()) {
            h.insert(header::CONTENT_LENGTH, cl);
        }
        if let Ok(hv) = HeaderValue::from_str(etag) {
            h.insert(header::ETAG, hv);
        }
        h.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, max-age=300"),
        );
        return Ok((StatusCode::PARTIAL_CONTENT, h, slice).into_response());
    }

    let bytes = fs::read(file_path).await?;
    Ok(serve_bytes_with_range(
        bytes,
        content_type,
        etag,
        request_headers,
        disposition,
    ))
}
