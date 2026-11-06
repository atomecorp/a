// The asset handed to a social destination (server/social/social_media.js, ported): inspected
// with ffprobe, and where a destination needs it a variant prepared with ffmpeg in the job's own
// temporary directory (the original is only ever read); short-lived public URLs for the networks
// that pull the file themselves (Instagram images, TikTok photos). The limits are the networks'
// documented ones (SOCIAL_MEDIA_CONSTRAINTS of atome/src/squirrel/social/contracts.js).
use super::net::{Sd, Se};
use super::plan::sniff;
use crate::providers::generation::now_ms;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

const MB: f64 = 1024.0 * 1024.0;

/// A network's limits for a kind of media, none where it has none.
pub struct Limits {
    pub formats: &'static [&'static str],
    pub containers: &'static [&'static str],
    pub codecs: &'static [&'static str],
    pub audio_codecs: Option<&'static [&'static str]>,
    pub max_audio_rate: Option<f64>,
    pub min_side: Option<f64>,
    pub max_side: Option<f64>,
    pub min_width: Option<f64>,
    pub max_width: Option<f64>,
    pub min_aspect: Option<f64>,
    pub max_aspect: f64,
    pub min_fps: f64,
    pub max_fps: f64,
    pub min_duration: Option<f64>,
    pub max_duration: Option<f64>,
    pub max_bytes: f64,
}

const NONE: Limits = Limits {
    formats: &[],
    containers: &[],
    codecs: &[],
    audio_codecs: None,
    max_audio_rate: None,
    min_side: None,
    max_side: None,
    min_width: None,
    max_width: None,
    min_aspect: None,
    max_aspect: 0.0,
    min_fps: 0.0,
    max_fps: 0.0,
    min_duration: None,
    max_duration: None,
    max_bytes: 0.0,
};

// TikTok's documented caption limits, in UTF-16 units.
pub const TIKTOK_VIDEO_CAPTION: usize = 2200;
pub const TIKTOK_PHOTO_DESCRIPTION: usize = 4000;

pub fn limits(network: &str, kind: &str) -> Option<Limits> {
    Some(match (network, kind) {
        ("tiktok", "video") => Limits {
            containers: &["mp4", "mov", "webm"],
            codecs: &["h264", "hevc", "vp8", "vp9"],
            min_side: Some(360.0),
            max_side: Some(4096.0),
            min_fps: 23.0,
            max_fps: 60.0,
            max_duration: Some(600.0),
            max_bytes: 4.0 * 1024.0 * MB,
            ..NONE
        },
        ("tiktok", "image") => Limits {
            formats: &["jpeg", "webp"],
            max_side: Some(1080.0),
            max_bytes: 20.0 * MB,
            ..NONE
        },
        ("instagram", "video") => Limits {
            containers: &["mp4", "mov"],
            codecs: &["h264", "hevc"],
            audio_codecs: Some(&["aac"]),
            max_audio_rate: Some(48_000.0),
            min_fps: 23.0,
            max_fps: 60.0,
            max_width: Some(1920.0),
            min_duration: Some(3.0),
            max_duration: Some(900.0),
            max_bytes: 300.0 * MB,
            ..NONE
        },
        ("instagram", "image") => Limits {
            formats: &["jpeg"],
            min_width: Some(320.0),
            max_width: Some(1440.0),
            min_aspect: Some(4.0 / 5.0),
            max_aspect: 1.91,
            max_bytes: 8.0 * MB,
            ..NONE
        },
        ("facebook", "image") => Limits {
            formats: &["jpeg", "png", "gif", "bmp", "tiff"],
            max_bytes: 4.0 * MB,
            ..NONE
        },
        _ => return None,
    })
}

async fn run(command: &str, args: &[&str], timeout: Duration) -> Result<Vec<u8>, ()> {
    let child = tokio::process::Command::new(command)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .output();
    match tokio::time::timeout(timeout, child).await {
        Ok(Ok(output)) if output.status.success() => Ok(output.stdout),
        _ => Err(()),
    }
}

fn rate(value: Option<&JsonValue>) -> f64 {
    let text = value
        .filter(|v| js::truthy(Some(v)))
        .map(js::string)
        .unwrap_or_else(|| "0/1".into());
    let mut parts = text.split('/').map(|part| js::number(Some(&json!(part))));
    let (num, den) = (
        parts.next().unwrap_or(f64::NAN),
        parts.next().unwrap_or(f64::NAN),
    );
    if den != 0.0 && !den.is_nan() {
        num / den
    } else {
        0.0
    }
}

/// `probeMedia`: what the file really is, read from its first bytes and ffprobe.
pub async fn probe(file: &Path) -> Sd<JsonValue> {
    let size = tokio::fs::metadata(file)
        .await
        .map_err(|_| Se::new("social_media_missing"))?
        .len();
    let mut head = [0u8; 16];
    let read = {
        use tokio::io::AsyncReadExt;
        let mut handle = tokio::fs::File::open(file)
            .await
            .map_err(|_| Se::new("social_media_missing"))?;
        handle
            .read(&mut head)
            .await
            .map_err(|_| Se::new("social_media_missing"))?
    };
    let Some(mime) = sniff(&head[..read]) else {
        return Err(Se::new("social_media_type_unsupported"));
    };
    let path = file.to_string_lossy();
    let args = [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        &path,
    ];
    let info: JsonValue = run("ffprobe", &args, Duration::from_secs(120))
        .await
        .ok()
        .and_then(|out| serde_json::from_slice(&out).ok())
        .ok_or_else(|| Se::new("social_media_unreadable"))?;
    let streams = info
        .get("streams")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    let video = streams.iter().find(|s| {
        s.get("codec_type") == Some(&json!("video"))
            && s.pointer("/disposition/attached_pic") != Some(&json!(1))
    });
    let audio = streams
        .iter()
        .find(|s| s.get("codec_type") == Some(&json!("audio")));
    let Some(video) = video.filter(|v| js::truthy(v.get("width")) && js::truthy(v.get("height")))
    else {
        return Err(Se::new("social_media_unreadable"));
    };
    let kind = if mime.starts_with("image/") {
        "image"
    } else {
        "video"
    };
    let text = |value: Option<&JsonValue>| {
        value
            .filter(|v| js::truthy(Some(v)))
            .map(js::string)
            .unwrap_or_default()
    };
    let pix_fmt = text(video.get("pix_fmt"));
    let alpha = [
        "rgba", "bgra", "argb", "abgr", "ya8", "ya16", "gbrap", "yuva", "pal8",
    ]
    .iter()
    .any(|p| pix_fmt.starts_with(p));
    let duration = if kind == "video" {
        let value = info
            .pointer("/format/duration")
            .filter(|v| js::truthy(Some(v)))
            .or_else(|| video.get("duration"));
        js::number(Some(value.unwrap_or(&json!(0))))
    } else {
        0.0
    };
    let fps = if kind == "video" {
        rate(js::first(video, &["avg_frame_rate", "r_frame_rate"]))
    } else {
        0.0
    };
    let audio = audio.map(|audio| {
        json!({ "codec": text(audio.get("codec_name")),
            "sampleRate": js::number_json(js::number(Some(audio.get("sample_rate").unwrap_or(&json!(0))))),
            "channels": js::number_json(js::number(Some(audio.get("channels").unwrap_or(&json!(0))))) })
    });
    Ok(json!({ "kind": kind, "mime": mime, "size": size,
        "width": js::number_json(js::number(video.get("width"))), "height": js::number_json(js::number(video.get("height"))),
        "codec": text(video.get("codec_name")), "pixFmt": pix_fmt, "alpha": alpha,
        "container": text(info.pointer("/format/format_name")),
        "duration": js::number_json(duration), "fps": js::number_json(fps), "audio": audio }))
}

fn format_of(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpeg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "",
    }
}

fn container_of(mime: &str) -> &'static str {
    match mime {
        "video/webm" => "webm",
        "video/quicktime" => "mov",
        _ => "mp4",
    }
}

fn even(value: f64) -> f64 {
    ((value / 2.0 + 0.5).floor() * 2.0).max(2.0)
}

fn fit(width: f64, height: f64, max_width: f64, max_height: f64) -> (f64, f64) {
    let scale = 1f64.min(max_width / width).min(max_height / height);
    (even(width * scale), even(height * scale))
}

/// `assessMedia`: what refuses the asset for `network` (nothing is cropped, trimmed or slowed
/// silently), and the real conversions it needs, announced in the preview.
pub fn assess(network: &str, probe: &JsonValue) -> (Vec<&'static str>, Vec<JsonValue>) {
    let kind = js::text(probe.get("kind"));
    let (mut violations, mut steps) = (Vec::new(), Vec::new());
    let Some(limits) = limits(network, &kind) else {
        return (violations, steps);
    };
    let number = |field: &str| js::number(probe.get(field));
    let (width, height, size) = (number("width"), number("height"), number("size"));
    if kind == "image" {
        let format = format_of(&js::text(probe.get("mime")));
        let mut target = (width, height);
        if limits.min_width.is_some_and(|min| width < min) {
            violations.push("width_below_minimum");
        }
        let aspect = width / height;
        if limits
            .min_aspect
            .is_some_and(|min| aspect < min - 0.005 || aspect > limits.max_aspect + 0.005)
        {
            violations.push("aspect_ratio_out_of_range");
        }
        if let Some(max) = limits.max_width.filter(|max| width > *max) {
            target = fit(width, height, max, f64::INFINITY);
        }
        // TikTok documents photos up to 1080p: longest side 1920, shortest 1080.
        if let Some(side) = limits.max_side {
            let landscape = width >= height;
            let (w, h) = if landscape {
                (1920.0, side)
            } else {
                (side, 1920.0)
            };
            target = fit(target.0, target.1, w, h);
        }
        let resize = target.0 != width || target.1 != height;
        let convert = !limits.formats.contains(&format) || size > limits.max_bytes;
        if convert || resize {
            steps.push(json!({ "type": "image_jpeg", "width": js::number_json(target.0), "height": js::number_json(target.1),
                "flatten": probe.get("alpha") == Some(&json!(true)), "resized": resize, "converted": format != "jpeg" }));
        }
        return (violations, steps);
    }
    let audio_codec = probe.pointer("/audio/codec");
    let codec_ok = limits
        .codecs
        .contains(&js::text(probe.get("codec")).as_str())
        && limits
            .containers
            .contains(&container_of(&js::text(probe.get("mime"))))
        && (!js::truthy(probe.get("audio"))
            || limits
                .audio_codecs
                .is_none_or(|codecs| codecs.contains(&js::text(audio_codec).as_str())));
    if !codec_ok {
        steps.push(json!({ "type": "video_h264" }));
    }
    let (fps, duration) = (number("fps"), number("duration"));
    if fps != 0.0 && (fps < limits.min_fps - 0.5 || fps > limits.max_fps + 0.5) {
        violations.push("frame_rate_out_of_range");
    }
    if limits.min_duration.is_some_and(|min| duration < min) {
        violations.push("duration_below_minimum");
    }
    if limits.max_duration.is_some_and(|max| duration > max) {
        violations.push("duration_above_maximum");
    }
    if limits.max_width.is_some_and(|max| width > max) {
        violations.push("width_above_maximum");
    }
    if limits.min_side.is_some_and(|min| width.min(height) < min) {
        violations.push("resolution_below_minimum");
    }
    if limits.max_side.is_some_and(|max| width.max(height) > max) {
        violations.push("resolution_above_maximum");
    }
    let sample_rate = js::number(probe.pointer("/audio/sampleRate"));
    if js::truthy(probe.get("audio")) && limits.max_audio_rate.is_some_and(|max| sample_rate > max)
    {
        violations.push("audio_sample_rate_above_maximum");
    }
    if codec_ok && size > limits.max_bytes {
        violations.push("file_too_large");
    }
    (violations, steps)
}

/// `prepareVariant`: the original when nothing is needed, else the first step's file in `out`.
pub async fn prepare_variant(
    source: &Path,
    probe_of: &JsonValue,
    steps: &[JsonValue],
    out: &Path,
) -> Sd<(PathBuf, JsonValue, bool)> {
    let Some(step) = steps.first() else {
        return Ok((source.to_path_buf(), probe_of.clone(), true));
    };
    let unreadable = |kind: &str| Se::detail("social_media_unreadable", &format!("{kind}_failed"));
    let kind = js::text(step.get("type"));
    create_private_dir(out)
        .await
        .map_err(|_| unreadable(&kind))?;
    let extension = if kind == "image_jpeg" { "jpg" } else { "mp4" };
    let target = out.join(format!("{}.{extension}", crate::providers::oauth::hex(8)));
    let (input, output) = (
        source.to_string_lossy().to_string(),
        target.to_string_lossy().to_string(),
    );
    let done = if kind == "image_jpeg" {
        let (width, height) = (js::text(step.get("width")), js::text(step.get("height")));
        // Transparency is composited on white, explicitly: JPEG has no alpha.
        let graph = format!(
            "color=c=white:s={width}x{height}[bg];[0:v]scale={width}:{height}:flags=lanczos,format=rgba[fg];[bg][fg]overlay=format=auto:shortest=1,format=yuvj420p"
        );
        let args = [
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            &input,
            "-filter_complex",
            &graph,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            &output,
        ];
        run("ffmpeg", &args, Duration::from_secs(120)).await
    } else {
        // `transcodeVideoToMp4` (server/server_media.js).
        let args = [
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            &input,
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-profile:v",
            "baseline",
            "-level",
            "3.1",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            &output,
        ];
        run("ffmpeg", &args, Duration::from_secs(120)).await
    };
    done.map_err(|()| unreadable(&kind))?;
    Ok((target.clone(), probe(&target).await?, false))
}

pub async fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    let mut builder = tokio::fs::DirBuilder::new();
    builder.recursive(true).mode(0o700);
    builder.create(dir).await
}

/// `previewThumbnail`: a small JPEG of exactly what will be sent.
pub async fn thumbnail(file: &Path, kind: &str) -> Sd<JsonValue> {
    use base64::Engine;
    let path = file.to_string_lossy();
    let mut args = vec!["-hide_banner", "-loglevel", "error"];
    if kind == "video" {
        args.extend(["-ss", "0.5"]);
    }
    args.extend([
        "-i",
        &path,
        "-frames:v",
        "1",
        "-vf",
        "scale=320:320:force_original_aspect_ratio=decrease",
        "-q:v",
        "5",
        "-f",
        "mjpeg",
        "pipe:1",
    ]);
    let bytes = run("ffmpeg", &args, Duration::from_secs(30))
        .await
        .map_err(|()| Se::new("social_media_unreadable"))?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(Se::new("social_media_unreadable"));
    }
    Ok(if bytes.is_empty() {
        JsonValue::Null
    } else {
        json!(format!(
            "data:image/jpeg;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    })
}

struct Public {
    file: PathBuf,
    mime: String,
    owner: String,
    expires_at: i64,
}

const PUBLIC_TTL_MS: i64 = 30 * 60 * 1000;

/// The prepared files a network pulls: unguessable, bound to one file, expiring, revoked with
/// their job.
#[derive(Default)]
pub struct PublicFiles {
    files: Mutex<HashMap<String, Public>>,
}

impl PublicFiles {
    fn files(&self) -> std::sync::MutexGuard<'_, HashMap<String, Public>> {
        self.files.lock().expect("public social media")
    }

    /// `issuePublicMediaUrl`.
    pub fn issue(&self, base: &str, file: &Path, mime: &str, owner: &str) -> Option<String> {
        if !base.starts_with("https://") {
            return None;
        }
        let token = crate::providers::oauth::hex(24);
        let public = Public {
            file: file.into(),
            mime: mime.into(),
            owner: owner.into(),
            expires_at: now_ms() + PUBLIC_TTL_MS,
        };
        self.files().insert(token.clone(), public);
        let extension = if mime == "image/jpeg" { "jpg" } else { "bin" };
        Some(format!(
            "{}/api/social/media/{token}.{extension}",
            base.trim_end_matches('/')
        ))
    }

    pub fn revoke(&self, owner: &str) {
        self.files().retain(|_, entry| entry.owner != owner);
    }

    /// `resolvePublicMedia`: the file and its type, none when unknown or expired.
    pub fn resolve(&self, name: &str) -> Option<(PathBuf, String)> {
        let (token, extension) = name.split_once('.')?;
        let shaped = token.len() == 48
            && token
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c));
        if !shaped || !["jpg", "bin"].contains(&extension) {
            return None;
        }
        let mut files = self.files();
        let entry = files.get(token)?;
        if now_ms() > entry.expires_at {
            files.remove(token);
            return None;
        }
        Some((entry.file.clone(), entry.mime.clone()))
    }
}
