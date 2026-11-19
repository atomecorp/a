// A media leaving its author for other people (a News, a bottle of the CB sociale): what they read
// is a clean copy, never the author's file. Its format is read from its bytes (metadata_strip.rs
// `format_of`), never from its name: a picture loses its metadata byte by byte (`strip_image`), a
// sound or a video is copied by ffmpeg without its global and stream metadata, chapters or data
// tracks (`copy`). Shared by News (social/news/media.rs) and the bottles (social/cb/bottles.rs),
// which also re-encode a video within their bounds (`reencode_video`) and take its thumbnail.
use super::metadata_strip::{Format, format_of, strip_image};
use std::path::Path;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(120);

/// The format a clean copy is made for, read from the bytes; `refused` lists the formats the
/// caller never publishes (HEIF and an unknown format always are).
pub fn accepted(bytes: &[u8], refused: &[Format]) -> Result<Format, String> {
    let format = format_of(bytes);
    if matches!(format, Format::Heif | Format::Unknown) || refused.contains(&format) {
        return Err(format!("media_format_unsupported:{}", format.name()));
    }
    Ok(format)
}

async fn ffmpeg(args: Vec<std::ffi::OsString>, what: &str) -> Result<(), String> {
    let output = tokio::time::timeout(
        TIMEOUT,
        tokio::process::Command::new("ffmpeg")
            .args(["-y", "-hide_banner", "-loglevel", "error"])
            .args(args)
            .stdin(std::process::Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| format!("{what}: timeout"))?
    .map_err(|e| format!("{what}: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "{what}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

const NO_METADATA: [&str; 10] = [
    "-map_metadata",
    "-1",
    "-map_metadata:s:v",
    "-1",
    "-map_metadata:s:a",
    "-1",
    "-map_chapters",
    "-1",
    "-fflags",
    "+bitexact",
];

/// The clean copy of `source` (whose bytes are `bytes`, in `format`) written at `target`:
/// `extension` (`.mp4`, `.m4a`…) tells an mp4 family container its fast start.
pub async fn copy(
    source: &Path,
    bytes: Vec<u8>,
    format: Format,
    extension: &str,
    target: &Path,
) -> Result<(), String> {
    if format == Format::Av {
        let mut args: Vec<std::ffi::OsString> = vec!["-i".into(), source.into()];
        args.extend(
            ["-map", "0:v?", "-map", "0:a?", "-c", "copy"]
                .iter()
                .chain(NO_METADATA.iter())
                .map(Into::into),
        );
        if [".mp4", ".m4v", ".mov", ".m4a"].contains(&extension) {
            args.extend(["-movflags".into(), "+faststart".into()]);
        }
        args.push(target.into());
        return ffmpeg(args, "media_clean_failed").await;
    }
    let cleaned = if format == Format::Svg {
        bytes
    } else {
        strip_image(&bytes)?
    };
    write_private(target, &cleaned).await
}

/// A sound or a video's length in seconds (ffprobe), none when unreadable.
pub async fn duration_of(file: &Path) -> Option<f64> {
    let output = tokio::time::timeout(
        TIMEOUT,
        tokio::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
            ])
            .arg(file)
            .stdin(std::process::Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|seconds| seconds.is_finite() && *seconds >= 0.0)
}

/// A video's bounds once re-encoded: its long side, and the bit rates that keep it under its size.
pub struct VideoBounds {
    pub long_side: u32,
    pub video_kbps: u32,
    pub audio_kbps: u32,
}

/// `source` re-encoded at `target`: H.264 and AAC in an mp4 that starts fast, its long side at
/// most `bounds.long_side` (never enlarged, even sides), no metadata, no chapter, no data track.
pub async fn reencode_video(
    source: &Path,
    target: &Path,
    bounds: &VideoBounds,
) -> Result<(), String> {
    let side = bounds.long_side;
    let scale =
        format!("scale='if(gt(iw,ih),min({side},iw),-2)':'if(gt(iw,ih),-2,min({side},ih))'");
    let (video, audio) = (
        format!("{}k", bounds.video_kbps),
        format!("{}k", bounds.audio_kbps),
    );
    let mut args: Vec<std::ffi::OsString> = vec!["-i".into(), source.into()];
    for arg in [
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        &scale,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        &video,
        "-maxrate",
        &video,
        "-bufsize",
        &video,
        "-c:a",
        "aac",
        "-b:a",
        &audio,
        "-ac",
        "2",
        "-sn",
        "-dn",
    ]
    .iter()
    .chain(NO_METADATA.iter())
    {
        args.push(arg.into());
    }
    args.extend(["-movflags".into(), "+faststart".into(), target.into()]);
    ffmpeg(args, "media_video_encode_failed").await
}

/// The first image of a video as a JPEG of `long_side` px at most, its metadata stripped.
pub async fn thumbnail(source: &Path, target: &Path, long_side: u32) -> Result<(), String> {
    let scale = format!(
        "scale='if(gt(iw,ih),min({long_side},iw),-2)':'if(gt(iw,ih),-2,min({long_side},ih))'"
    );
    let mut args: Vec<std::ffi::OsString> = vec!["-i".into(), source.into()];
    for arg in [
        "-frames:v",
        "1",
        "-vf",
        &scale,
        "-q:v",
        "4",
        "-map_metadata",
        "-1",
    ] {
        args.push(arg.into());
    }
    args.push(target.into());
    ffmpeg(args, "media_thumbnail_failed").await?;
    let bytes = tokio::fs::read(target).await.map_err(|e| e.to_string())?;
    write_private(target, &strip_image(&bytes)?).await
}

/// `bytes` written at `path`, readable by the server's own user only.
pub async fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .await
        .map_err(|e| e.to_string())?;
    file.write_all(bytes).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_format_comes_from_the_bytes() {
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(accepted(&jpeg, &[]), Ok(Format::Jpeg));
        assert!(
            accepted(
                b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
                &[Format::Svg]
            )
            .is_err()
        );
        assert!(accepted(b"plain text, not a media", &[]).is_err());
    }
}
