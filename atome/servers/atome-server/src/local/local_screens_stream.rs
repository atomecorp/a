// A view streamed live to a screen (R-248, `/ws/api` `screens` family): the page encodes the view in H.264 (WebCodecs,
// format `avc`) and hands each frame here; atome-screen-cast's `hls` cuts them into fMP4 segments, served on the
// screens' share (`/stream/{token}/index.m3u8`, `init.mp4`, `{seq}.m4s`). The screen is sent the playlist's URL once
// the first segment exists, as any media (`play_on`).
//
// Actions: `stream_start` ({ target, credentials?, width, height, avcc (base64), title } → { stream_id, url }),
// `stream_chunk` ({ stream_id, data (base64), key, pts_us, duration_us } → { stream_id, segment, playing }),
// `stream_stop` ({ stream_id } → { stream_id, stopped }). Two live streams at most; a new one for the same screen
// replaces the old; a stream stopped, or left without a frame, is dropped after 30 s.
use std::net::IpAddr;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, Instant};

use atome_screen_cast::hls::{LiveStream, Sample, StreamConfig};
use atome_screen_cast::{MediaToSend, ScreenKind, ScreenTarget};
use axum::extract::Path as AxumPath;
use axum::http::header;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

use super::*;

const MAX_LIVE_STREAMS: usize = 2;
const DROPPED_AFTER: Duration = Duration::from_secs(30);
const HLS_MIME: &str = "application/x-mpegURL";

struct LiveCast {
    token: String,
    target: ScreenTarget,
    credentials: JsonValue,
    local: IpAddr,
    url: String,
    title: String,
    stream: LiveStream,
    announced: bool,
    stopped: bool,
    touched: Instant,
}

static STREAMS: StdMutex<Vec<LiveCast>> = StdMutex::new(Vec::new());

fn streams() -> Result<std::sync::MutexGuard<'static, Vec<LiveCast>>, String> {
    STREAMS
        .lock()
        .map_err(|_| "screen_streams_poisoned".to_string())
}

/// Drops the streams stopped, or left without a frame, for 30 s.
fn prune(casts: &mut Vec<LiveCast>) {
    casts.retain(|cast| cast.touched.elapsed() < DROPPED_AFTER);
}

fn base64_field(data: &JsonValue, field: &str) -> Result<Vec<u8>, String> {
    let text = data[field]
        .as_str()
        .filter(|text| !text.is_empty())
        .ok_or_else(|| format!("stream_{field}_missing"))?;
    STANDARD
        .decode(text)
        .map_err(|_| format!("stream_{field}_invalid"))
}

fn dimension(data: &JsonValue, field: &str) -> Result<u32, String> {
    data[field]
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| format!("stream_{field}_invalid"))
}

pub(super) async fn stream_start(data: &JsonValue) -> Result<JsonValue, String> {
    let target = target_of(data)?;
    let address = target.address().map_err(|error| error.code())?;
    let local = local_address_towards(&address)?;
    let credentials = data.get("credentials").cloned().unwrap_or(JsonValue::Null);
    // An unpaired Apple TV is refused now, not at the first segment.
    if target.kind == ScreenKind::Airplay {
        airplay_credentials(&credentials)?;
    }
    let stream = LiveStream::new(StreamConfig {
        width: dimension(data, "width")?,
        height: dimension(data, "height")?,
        timescale: 90_000,
        avcc: base64_field(data, "avcc")?,
    })
    .map_err(|error| error.code())?;
    let port = share_port().await?;
    let token = token();
    let url = format!("http://{local}:{port}/stream/{token}/index.m3u8");
    let mut casts = streams()?;
    prune(&mut casts);
    casts.retain(|cast| cast.target.id != target.id);
    if casts.iter().filter(|cast| !cast.stopped).count() >= MAX_LIVE_STREAMS {
        return Err("stream_limit_reached".into());
    }
    casts.push(LiveCast {
        token: token.clone(),
        target,
        credentials,
        local,
        url: url.clone(),
        title: data["title"].as_str().unwrap_or_default().to_string(),
        stream,
        announced: false,
        stopped: false,
        touched: Instant::now(),
    });
    Ok(json!({ "stream_id": token, "url": url }))
}

fn stream_id(data: &JsonValue) -> Result<&str, String> {
    data["stream_id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "stream_id_missing".to_string())
}

pub(super) async fn stream_chunk(data: &JsonValue) -> Result<JsonValue, String> {
    let id = stream_id(data)?;
    let sample = Sample {
        data: base64_field(data, "data")?,
        key: data["key"].as_bool().ok_or("stream_key_missing")?,
        pts_us: data["pts_us"].as_i64().ok_or("stream_pts_us_missing")?,
        duration_us: data["duration_us"]
            .as_i64()
            .ok_or("stream_duration_us_missing")?,
    };
    let (segment, playing, announce) = {
        let mut casts = streams()?;
        let cast = casts
            .iter_mut()
            .find(|cast| cast.token == id)
            .ok_or("stream_not_found")?;
        let segment = cast.stream.push(sample).map_err(|error| error.code())?;
        cast.touched = Instant::now();
        // The screen is sent the URL once a segment exists to play.
        let announce = (segment.is_some() && !cast.announced).then(|| {
            cast.announced = true;
            (
                cast.target.clone(),
                cast.credentials.clone(),
                cast.local,
                MediaToSend {
                    url: cast.url.clone(),
                    mime: HLS_MIME.to_string(),
                    title: cast.title.clone(),
                    start_seconds: 0.0,
                    live: true,
                },
            )
        });
        (segment, cast.announced, announce)
    };
    if let Some((target, credentials, local, to_send)) = announce {
        play_on(&target, &credentials, local, &to_send).await?;
    }
    Ok(json!({ "stream_id": id, "segment": segment, "playing": playing }))
}

pub(super) async fn stream_stop(data: &JsonValue) -> Result<JsonValue, String> {
    let id = stream_id(data)?;
    let target_id = {
        let mut casts = streams()?;
        let cast = casts
            .iter_mut()
            .find(|cast| cast.token == id)
            .ok_or("stream_not_found")?;
        cast.stream.finish();
        cast.stopped = true;
        cast.touched = Instant::now();
        let target_id = cast.target.id.clone();
        prune(&mut casts);
        target_id
    };
    let stopped = stop_playback(&target_id).await;
    Ok(json!({ "stream_id": id, "stopped": stopped }))
}

/// A stream's playlist, init segment or media segment, for the screen.
pub(super) async fn streamed_file(
    AxumPath((token, file)): AxumPath<(String, String)>,
) -> axum::response::Response {
    let Ok(casts) = STREAMS.lock() else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let Some(cast) = casts.iter().find(|cast| cast.token == token) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let (mime, cache, body) = match file.as_str() {
        "index.m3u8" => (
            "application/vnd.apple.mpegurl",
            "no-cache",
            cast.stream.playlist().into_bytes(),
        ),
        "init.mp4" => (
            "video/mp4",
            "max-age=60",
            cast.stream.init_segment().to_vec(),
        ),
        name => {
            let segment = name
                .strip_suffix(".m4s")
                .and_then(|sequence| sequence.parse::<u32>().ok())
                .and_then(|sequence| cast.stream.segment(sequence));
            let Some(segment) = segment else {
                return StatusCode::NOT_FOUND.into_response();
            };
            ("video/iso.segment", "max-age=60", segment)
        }
    };
    // A Chromecast's receiver fetches HLS from its own page's origin.
    (
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, cache),
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
        ],
        body,
    )
        .into_response()
}
