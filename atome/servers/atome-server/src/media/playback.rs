// A video made playable (server/server_media.js, ported; shared with Tauri's local
// server): a browser reliably plays only H.264/AAC in a faststart MP4 (`moov` before
// `mdat`). Another codec or container is re-encoded, a late `moov` is moved up
// without re-encoding, once per file, into the `.video_cache` beside it.
use std::collections::HashMap;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

const MAX_TOP_LEVEL_BOXES: usize = 256;
const MAX_MOOV_BYTES: u64 = 32 * 1024 * 1024;
// `execFile`'s `timeout` in server_media.js.
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(120);
// Always re-encoded: the browser does not decode their codec.
const ALWAYS_TRANSCODED: [&str; 6] = ["webm", "mkv", "avi", "mpeg", "mpg", "wmv"];
// MP4/MOV containers: their boxes say whether to remux or re-encode.
const MP4_CONTAINERS: [&str; 3] = ["mp4", "m4v", "mov"];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Normalization {
    Transcode,
    Remux,
}

/// Node's `path.basename`: the last segment, trailing slashes ignored.
pub fn basename(name: &str) -> &str {
    let trimmed = name.trim_end_matches('/');
    trimmed.rsplit('/').next().unwrap_or("")
}

/// `sanitizeFileName` (server/fileStorage.js): the base name, every UTF-16 unit
/// outside `[a-z0-9._-]` (any case) replaced by `_`, `upload.bin` when empty.
pub fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = basename(name)
        .chars()
        .flat_map(|c| {
            let kept = c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-');
            let units = if kept { 1 } else { c.len_utf16() };
            std::iter::repeat_n(if kept { c } else { '_' }, units)
        })
        .collect();
    if cleaned.is_empty() {
        "upload.bin".into()
    } else {
        cleaned
    }
}

/// Node's `path.extname` of the base name, without its dot (None: it has none).
pub(crate) fn extension_of(name: &str) -> Option<&str> {
    let base = basename(name);
    match base.rfind('.') {
        Some(dot) if dot > 0 && base != ".." => Some(&base[dot + 1..]),
        _ => None,
    }
}

pub fn lower_file_extension(name: &str) -> String {
    extension_of(name).unwrap_or("").trim().to_ascii_lowercase()
}

pub fn replace_file_extension(name: &str, extension: &str) -> String {
    let base = basename(name);
    let stem = extension_of(name).map_or(base, |current| &base[..base.len() - current.len() - 1]);
    let extension = extension.trim().trim_start_matches('.');
    sanitize_file_name(&format!("{stem}.{extension}"))
}

fn audio_only_name(name: &str) -> bool {
    let lower = name.trim().to_ascii_lowercase();
    lower.starts_with("audio_") || lower.starts_with("audio_recording_")
}

pub fn should_serve_webm_as_mp4(name: &str, mime_type: &str) -> bool {
    lower_file_extension(name) == "webm"
        && !audio_only_name(name)
        && !mime_type.trim().to_ascii_lowercase().starts_with("audio/")
}

fn u32_at(bytes: &[u8], offset: usize) -> u64 {
    u32::from_be_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ]) as u64
}

fn u64_at(bytes: &[u8], offset: usize) -> u64 {
    let mut raw = [0u8; 8];
    raw.copy_from_slice(&bytes[offset..offset + 8]);
    u64::from_be_bytes(raw)
}

fn kind_at(bytes: &[u8], offset: usize) -> String {
    bytes[offset..offset + 4]
        .iter()
        .map(|&b| b as char)
        .collect()
}

struct TopBox {
    kind: String,
    offset: u64,
    size: u64,
}

// The top-level box headers only, `mdat` never read: their order says faststart.
async fn top_level_boxes(path: &Path) -> std::io::Result<Vec<TopBox>> {
    let mut file = fs::File::open(path).await?;
    let size = file.metadata().await?.len();
    let mut boxes = Vec::new();
    let mut offset = 0u64;
    while offset + 8 <= size && boxes.len() < MAX_TOP_LEVEL_BOXES {
        let mut header = [0u8; 16];
        file.seek(SeekFrom::Start(offset)).await?;
        let read = file.read(&mut header).await?;
        if read < 8 {
            break;
        }
        let mut box_size = u32_at(&header, 0);
        let mut header_size = 8;
        if box_size == 1 {
            if read < 16 {
                break;
            }
            box_size = u64_at(&header, 8);
            header_size = 16;
        } else if box_size == 0 {
            box_size = size - offset;
        }
        if box_size < header_size {
            break;
        }
        boxes.push(TopBox {
            kind: kind_at(&header, 4),
            offset,
            size: box_size,
        });
        offset = offset.saturating_add(box_size);
    }
    Ok(boxes)
}

async fn moov_bytes(path: &Path, moov: &TopBox) -> Option<Vec<u8>> {
    if moov.size > MAX_MOOV_BYTES {
        return None;
    }
    let mut file = fs::File::open(path).await.ok()?;
    file.seek(SeekFrom::Start(moov.offset)).await.ok()?;
    let mut buffer = vec![0u8; moov.size as usize];
    file.read_exact(&mut buffer).await.ok()?;
    Some(buffer)
}

// A box's children: (kind, end, content start).
fn children(bytes: &[u8], start: usize, end: usize, mut visit: impl FnMut(&str, usize, usize)) {
    let mut offset = start;
    while offset + 8 <= end {
        let mut size = u32_at(bytes, offset);
        let mut header_size = 8;
        if size == 1 {
            if offset + 16 > end {
                return;
            }
            size = u64_at(bytes, offset + 8);
            header_size = 16;
        } else if size == 0 {
            size = (end - offset) as u64;
        }
        if size < header_size || size > (end - offset) as u64 {
            return;
        }
        let box_end = offset + size as usize;
        visit(
            &kind_at(bytes, offset + 4),
            box_end,
            offset + header_size as usize,
        );
        offset = box_end;
    }
}

// `summarizeMp4Moov` (atome/src/squirrel/shared/media_container.js): each video
// track's codec, lowercase.
fn video_codecs(moov: &[u8]) -> Vec<String> {
    let mut codecs = Vec::new();
    if moov.len() < 16 {
        return codecs;
    }
    children(moov, 8, moov.len(), |kind, end, content| {
        if kind != "trak" {
            return;
        }
        let (mut handler, mut codec) = (String::new(), String::new());
        children(moov, content, end, |kind, end, content| {
            if kind != "mdia" {
                return;
            }
            children(moov, content, end, |kind, end, content| {
                if kind == "hdlr" && content + 12 <= end {
                    handler = kind_at(moov, content + 8);
                }
                if kind != "minf" {
                    return;
                }
                children(moov, content, end, |kind, end, content| {
                    if kind != "stbl" {
                        return;
                    }
                    children(moov, content, end, |kind, end, content| {
                        // stsd: version/flags (4), entry count (4), then the first sample entry.
                        if kind == "stsd" && codec.is_empty() && content + 16 <= end {
                            codec = kind_at(moov, content + 12);
                        }
                    });
                });
            });
        });
        if handler == "vide" && !codec.is_empty() {
            codecs.push(codec.to_ascii_lowercase());
        }
    });
    codecs
}

/// How a video is served: re-encoded, remuxed faststart, or as it is (None).
pub async fn normalization(source: &Path, name: &str, mime_type: &str) -> Option<Normalization> {
    let extension = lower_file_extension(name);
    if audio_only_name(name) {
        return None;
    }
    if should_serve_webm_as_mp4(name, mime_type) || ALWAYS_TRANSCODED.contains(&extension.as_str())
    {
        return Some(Normalization::Transcode);
    }
    if !MP4_CONTAINERS.contains(&extension.as_str())
        && !mime_type.trim().to_ascii_lowercase().starts_with("video/")
    {
        return None;
    }
    let Ok(boxes) = top_level_boxes(source).await else {
        return Some(Normalization::Transcode);
    };
    let Some(moov) = boxes.iter().position(|found| found.kind == "moov") else {
        return Some(Normalization::Transcode);
    };
    let fast_start = boxes
        .iter()
        .position(|found| found.kind == "mdat")
        .is_none_or(|mdat| moov < mdat);
    let hevc = moov_bytes(source, &boxes[moov]).await.is_some_and(|bytes| {
        video_codecs(&bytes)
            .iter()
            .any(|codec| codec == "hvc1" || codec == "hev1")
    });
    if hevc {
        Some(Normalization::Transcode)
    } else if !fast_start {
        Some(Normalization::Remux)
    } else {
        None
    }
}

/// The playable copy's path and name: `.video_cache/<stem>.mp4` beside the source.
pub fn cache_target(source: &Path, name: &str) -> (PathBuf, String) {
    let cached = replace_file_extension(name, "mp4");
    let directory = source
        .parent()
        .unwrap_or(Path::new(""))
        .join(".video_cache");
    (directory.join(&cached), cached)
}

/// The file ffmpeg writes before it becomes `output`: `.partial-<name>` beside it.
fn partial_path(output: &Path) -> PathBuf {
    let name = output
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    output.with_file_name(format!(".partial-{name}"))
}

async fn ffmpeg(arguments: &[&str], source: &Path, output: &Path) -> Result<(), String> {
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("video_normalization_failed: {e}"))?;
    }
    // ffmpeg writes a hidden sibling (same extension: it names the format), renamed into place
    // only once complete. Written in place, a run killed half way (its request dropped: the
    // future goes, `kill_on_drop` kills ffmpeg, the cleanup below never runs) left a copy
    // without its `moov` that passed for the playable one, and was served for good.
    let partial = partial_path(output);
    let run = tokio::process::Command::new("ffmpeg")
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(source)
        .args(arguments)
        .arg(&partial)
        .kill_on_drop(true)
        .output();
    let result = match tokio::time::timeout(FFMPEG_TIMEOUT, run).await {
        Ok(Ok(finished)) if finished.status.success() => match fs::rename(&partial, output).await {
            Ok(()) => return Ok(()),
            Err(error) => error.to_string(),
        },
        Ok(Ok(finished)) => String::from_utf8_lossy(&finished.stderr).trim().to_string(),
        Ok(Err(error)) => error.to_string(),
        Err(_) => "ffmpeg timed out".into(),
    };
    let _ = fs::remove_file(&partial).await;
    Err(format!(
        "video_normalization_failed: {}",
        if result.is_empty() {
            "ffmpeg exited without details"
        } else {
            &result
        }
    ))
}

const MAP: [&str; 4] = ["-map", "0:v:0", "-map", "0:a?"];

/// A recording's MP4 (`transcodeVideoToMp4`): H.264 baseline 3.1, AAC, faststart.
pub async fn transcode_recording(source: &Path, output: &Path) -> Result<(), String> {
    let arguments = [
        MAP.as_slice(),
        &[
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
        ],
    ]
    .concat();
    ffmpeg(&arguments, source, output).await
}

// One job per output file: a <video> or an <audio> often asks several times at once, and two
// ffmpeg must never write the same output.
static JOBS: LazyLock<Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(Default::default);

/// `make` run for `output` only when it is absent, one run at a time for one output.
pub(super) async fn once<F: Future<Output = Result<(), String>>>(
    output: &Path,
    make: impl FnOnce() -> F,
) -> Result<(), String> {
    let job = JOBS
        .lock()
        .expect("ffmpeg jobs")
        .entry(output.to_path_buf())
        .or_default()
        .clone();
    let made = {
        let _running = job.lock().await;
        if fs::metadata(output).await.is_ok() {
            Ok(())
        } else {
            make().await
        }
    };
    let mut jobs = JOBS.lock().expect("ffmpeg jobs");
    if Arc::strong_count(&job) == 2 {
        jobs.remove(output);
    }
    drop(jobs);
    made
}

/// `ensureVideoPlaybackCache`: the playable copy's path and name, made once, or
/// None when the source plays as it is.
pub async fn ensure_cache(
    source: &Path,
    name: &str,
    mime_type: &str,
) -> Result<Option<(PathBuf, String)>, String> {
    let Some(normalization) = normalization(source, name, mime_type).await else {
        return Ok(None);
    };
    let (cached, cached_name) = cache_target(source, name);
    let made = once(&cached, || async {
        if normalization == Normalization::Remux {
            ffmpeg(
                &[MAP.as_slice(), &["-c", "copy", "-movflags", "+faststart"]].concat(),
                source,
                &cached,
            )
            .await
        } else {
            // H.264 8-bit yuv420p with no fixed profile or level (so past 720p), faststart.
            let encode = [
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
            ];
            ffmpeg(&[MAP.as_slice(), &encode].concat(), source, &cached).await
        }
    })
    .await;
    made.map(|()| Some((cached, cached_name)))
}

#[cfg(test)]
mod partial_tests {
    use super::*;

    #[test]
    fn partial_copy_keeps_the_extension_beside_the_output() {
        let partial = partial_path(Path::new("/u/recordings/.video_cache/video_1.mp4"));
        assert_eq!(
            partial,
            PathBuf::from("/u/recordings/.video_cache/.partial-video_1.mp4")
        );
        assert_eq!(lower_file_extension(&partial.to_string_lossy()), "mp4");
    }
}
