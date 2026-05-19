# Media URL Contract

This contract keeps media behavior identical across iOS app, AUv3, Tauri macOS, and web.

## Persisted Values

Persist stable values only:

- `file_path`: app-relative storage path, for example `data/users/<user>/Downloads/0000.png`.
- `media_url`: stable route, for example `/file/data/users/<user>/Downloads/0000.png`, `/api/uploads/name.ext`, or a cloud URL.
- `kind`: `image`, `svg`, `video`, `sound`, or `audio`.
- `mime_type`: when known.
- `owner_id`: when access checks require it.

Never persist:

- `blob:...`
- `file://...`
- `webkit-fake-url:...`
- `http://127.0.0.1:<dynamic-port>/...`
- absolute iOS container paths.

## Runtime Resolution

Local runtime URLs are resolved at render/playback time, not persisted.

- iOS app and AUv3: `/file/...`, `/api/uploads/...`, and `/api/recordings/...` resolve to `http://127.0.0.1:<window.__ATOME_LOCAL_HTTP_PORT__>/...`.
- Tauri macOS: local protected media must resolve through an authenticated local HTTP route that supports video/audio range requests.
- Web/cloud: protected media must resolve through an authenticated route or signed URL.

## Playback Requirements

Image and SVG may be loaded as normal resources.

Video and audio must be served through HTTP with:

- correct MIME type
- `Accept-Ranges: bytes`
- `HEAD` support
- `Range` request support
- stable playback URLs, not blob URLs, unless explicitly used as a last-resort diagnostic fallback

## Diagnostics

The User Debug media diagnostic tests the current project after manual upload. Expected files:

- `0000.png`
- `atome.svg`
- `Jeezs's fire.m4v` or sanitized `Jeezs_s_fire.m4v`
- `test.m4a`

The diagnostic report must include:

- runtime
- raw source
- resolved playback URL
- project render result
- metadata/load result
- playback progression for video/audio
- Mtrack open/convert result
- Mtrack preview result
- Mtrack scrub/playback result
