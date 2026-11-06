// The audio track of a video (server/http_media_serving_routes.js `GET /api/extract-audio/:file`,
// ported): WebKit cannot decode the audio of a `.mov` or `.m4v` through `decodeAudioData`, so the
// track is extracted once by ffmpeg into an AAC `.m4a` in the `.audio_cache` beside the video.
use super::downloads::Download;
use super::playback::{self, basename};
use super::served::{extension, failed, streamed};
use crate::vault_router::js;
use axum::http::{HeaderValue, header as name};
use axum::response::Response;
use std::path::{Path, PathBuf};
use std::time::Duration;

// `execFile`'s `timeout` of the extraction.
const EXTRACTION_TIMEOUT: Duration = Duration::from_secs(60);
const VIDEO_EXTENSIONS: [&str; 6] = [".mov", ".m4v", ".mp4", ".avi", ".mkv", ".webm"];

// `ffmpeg_extract_failed`: the first 200 units of what ffmpeg said, else of its failure.
async fn extracted(source: &Path, output: &Path) -> Result<(), String> {
    let arguments = [
        "-v",
        "error",
        "-y",
        "-i",
        "SOURCE",
        "-vn",
        "-map",
        "0:a:0",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        "OUTPUT",
    ];
    let words: Vec<String> = arguments
        .iter()
        .map(|word| match *word {
            "SOURCE" => source.display().to_string(),
            "OUTPUT" => output.display().to_string(),
            word => word.to_string(),
        })
        .collect();
    let run = tokio::process::Command::new("ffmpeg")
        .args(&words)
        .kill_on_drop(true)
        .output();
    let said = match tokio::time::timeout(EXTRACTION_TIMEOUT, run).await {
        Ok(Ok(done)) if done.status.success() => return Ok(()),
        Ok(Ok(done)) if !done.stderr.is_empty() => String::from_utf8_lossy(&done.stderr).into(),
        Ok(Ok(_)) | Err(_) => format!("Command failed: ffmpeg {}", words.join(" ")),
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            "spawn ffmpeg ENOENT".into()
        }
        Ok(Err(error)) => format!("spawn ffmpeg {error}"),
    };
    // A failed run leaves no partial track that would pass for the extracted one.
    let _ = tokio::fs::remove_file(output).await;
    Err(format!("ffmpeg_extract_failed: {}", js::slice(&said, 200)))
}

// The video's audio track, extracted once into `.audio_cache` beside it.
pub(super) async fn answer(found: Download) -> Result<Result<Response, Response>, String> {
    let source = super::files::accessible(found.file_path)?;
    let extension = extension(&source);
    if !VIDEO_EXTENSIONS.contains(&extension.as_str()) {
        return Ok(Err(failed(400, "Not a video file")));
    }
    let directory = source
        .parent()
        .unwrap_or(Path::new(""))
        .join(".audio_cache");
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|e| e.to_string())?;
    let name = basename(source.to_str().unwrap_or(""));
    let stem = name.strip_suffix(extension.as_str()).unwrap_or(name);
    let cached: PathBuf = directory.join(format!("{stem}.aac.m4a"));
    playback::once(&cached, || extracted(&source, &cached)).await?;
    let size = tokio::fs::metadata(&cached)
        .await
        .map_err(|e| e.to_string())?
        .len();
    let mut response = Response::new(streamed(&cached, 0, size).await?);
    let fields = response.headers_mut();
    fields.insert(name::CONTENT_TYPE, HeaderValue::from_static("audio/mp4"));
    fields.insert(name::CONTENT_LENGTH, HeaderValue::from(size));
    fields.insert(name::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    Ok(Ok(response))
}
