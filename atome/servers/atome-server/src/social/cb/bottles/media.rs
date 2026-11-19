// A bottle's media (bottles/mod.rs): read from its sender's own file, bounded, its format read from
// its bytes, then its clean copy made by the shared cleaning (media/clean.rs) into the bottles'
// folder, outside every vault; a catcher reads it through a link bound to one copy, valid for a
// reservation's time (`GET /api/cb/bottle-media/<token>`).
use super::super::Cb;
use super::{
    IMAGE_MAX_BYTES, RESERVATION_MS, THUMB_SIDE, VIDEO, VIDEO_INPUT_BYTES, VIDEO_MAX_BYTES,
    VIDEO_MAX_S, VOICE_INPUT_BYTES, VOICE_MAX_S, now_ms,
};
use crate::media::clean;
use crate::media::metadata_strip::Format;
use crate::social::news::db::text;
use crate::vault_router::js;
use std::path::PathBuf;

/// The bottle's media kind, as the launch names it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum Media {
    Voice,
    Image,
    Video,
}

impl Media {
    pub(super) fn parse(kind: &str) -> Option<Self> {
        match kind {
            "voice" => Some(Self::Voice),
            "image" => Some(Self::Image),
            "video" => Some(Self::Video),
            _ => None,
        }
    }

    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Voice => "voice",
            Self::Image => "image",
            Self::Video => "video",
        }
    }
}

// A sound's type, from its clean copy's extension.
fn sound_mime(extension: &str) -> &'static str {
    match extension {
        ".m4a" | ".mp4" | ".aac" => "audio/mp4",
        ".webm" => "audio/webm",
        ".ogg" | ".opus" => "audio/ogg",
        ".wav" => "audio/wav",
        _ => "audio/mpeg",
    }
}

/// The clean copies made for one launch, erased again if the bottle is not written.
pub(super) struct Copies {
    pub(super) file: String,
    pub(super) mime: String,
    pub(super) thumb: Option<String>,
    pub(super) duration_ms: Option<i64>,
}

impl Cb {
    /// The bottles' clean copies, outside every vault.
    pub fn bottles_dir(&self) -> PathBuf {
        self.media_dir.clone()
    }

    // The launch's media, read from the sender's own file, cleaned into the bottles' folder.
    pub(super) async fn media_copies(
        &self,
        sender: &str,
        media: Media,
        atome_id: &str,
        bottle: &str,
    ) -> Result<Result<Copies, &'static str>, String> {
        let (identifier, owner) = (atome_id.to_string(), sender.to_string());
        let meta = self
            .central
            .transaction(move |db| crate::media::files::metadata(db, &identifier, Some(&owner)))
            .await?;
        let Some(meta) = meta.filter(|meta| text(meta.get("owner_id")) == sender) else {
            return Ok(Err("cb_bottle_media_missing"));
        };
        let found = meta.clone();
        let aliased = self
            .central
            .transaction(move |db| crate::media::files::legacy_alias(db, &found))
            .await?;
        let Ok(source) = crate::media::files::located(
            &self.storage,
            &meta,
            atome_id,
            sender,
            aliased.as_deref(),
        ) else {
            return Ok(Err("cb_bottle_media_missing"));
        };
        let size = tokio::fs::metadata(&source.file_path)
            .await
            .map(|meta| meta.len())
            .unwrap_or(u64::MAX);
        let bound = match media {
            Media::Image => IMAGE_MAX_BYTES,
            Media::Voice => VOICE_INPUT_BYTES,
            Media::Video => VIDEO_INPUT_BYTES,
        };
        if size > bound {
            return Ok(Err("cb_bottle_media_too_large"));
        }
        let bytes = tokio::fs::read(&source.file_path)
            .await
            .map_err(|e| e.to_string())?;
        let Ok(format) = clean::accepted(&bytes, &[Format::Svg]) else {
            return Ok(Err("cb_bottle_media_format_refused"));
        };
        let image = matches!(format, Format::Jpeg | Format::Png | Format::Webp);
        if (media == Media::Image) != image {
            return Ok(Err("cb_bottle_media_format_refused"));
        }
        tokio::fs::create_dir_all(&self.media_dir)
            .await
            .map_err(|e| e.to_string())?;
        let at = |name: &str| self.media_dir.join(name);
        match media {
            Media::Image => {
                let extension = format.name().replace("jpeg", "jpg");
                let file = format!("{bottle}.{extension}");
                clean::copy(&source.file_path, bytes, format, "", &at(&file)).await?;
                Ok(Ok(Copies {
                    file,
                    mime: format!("image/{}", format.name()),
                    thumb: None,
                    duration_ms: None,
                }))
            }
            Media::Voice => {
                let Some(seconds) = clean::duration_of(&source.file_path).await else {
                    return Ok(Err("cb_bottle_media_unreadable"));
                };
                if seconds > VOICE_MAX_S {
                    return Ok(Err("cb_bottle_voice_too_long"));
                }
                let named = js::first(&meta, &["file_name", "original_name"])
                    .map(js::string)
                    .unwrap_or_default();
                let extension = crate::media::playback::extension_of(&named)
                    .map(|extension| format!(".{}", extension.to_lowercase()))
                    .unwrap_or_else(|| ".m4a".into());
                let file = format!("{bottle}{extension}");
                clean::copy(&source.file_path, bytes, format, &extension, &at(&file)).await?;
                Ok(Ok(Copies {
                    file,
                    mime: sound_mime(&extension).into(),
                    thumb: None,
                    duration_ms: Some((seconds * 1000.0).round() as i64),
                }))
            }
            Media::Video => {
                let Some(seconds) = clean::duration_of(&source.file_path).await else {
                    return Ok(Err("cb_bottle_media_unreadable"));
                };
                // Longer is refused, never cut.
                if seconds > VIDEO_MAX_S {
                    return Ok(Err("cb_bottle_video_too_long"));
                }
                let (file, thumb) = (format!("{bottle}.mp4"), format!("{bottle}_thumb.jpg"));
                clean::reencode_video(&source.file_path, &at(&file), &VIDEO).await?;
                let encoded = tokio::fs::metadata(at(&file))
                    .await
                    .map(|meta| meta.len())
                    .unwrap_or(u64::MAX);
                if encoded > VIDEO_MAX_BYTES {
                    let _ = tokio::fs::remove_file(at(&file)).await;
                    return Ok(Err("cb_bottle_video_too_large"));
                }
                clean::thumbnail(&at(&file), &at(&thumb), THUMB_SIDE).await?;
                Ok(Ok(Copies {
                    file,
                    mime: "video/mp4".into(),
                    thumb: Some(thumb),
                    duration_ms: Some((seconds * 1000.0).round() as i64),
                }))
            }
        }
    }

    /// Erases copies of the bottles' folder.
    pub(super) async fn erase(&self, files: Vec<String>) {
        for file in files {
            if !file.contains('/') && !file.starts_with('.') {
                let _ = tokio::fs::remove_file(self.media_dir.join(file)).await;
            }
        }
    }

    // A media link valid for a reservation's time, bound to one copy.
    pub(super) fn grant(&self, file: &str, mime: &str) -> String {
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let mut grants = self.grants.lock().expect("cb grants");
        let now = now_ms();
        grants.retain(|_, grant| grant.expires > now);
        grants.insert(
            token.clone(),
            Grant {
                file: self.media_dir.join(file),
                mime: mime.to_string(),
                expires: now + RESERVATION_MS,
            },
        );
        format!("/api/cb/bottle-media/{token}")
    }

    /// `GET /api/cb/bottle-media/<token>`: a bottle's copy while its link runs; none for another path.
    pub async fn media_route(&self, path: &str) -> Option<axum::response::Response> {
        use axum::http::{HeaderValue, StatusCode, header};
        use axum::response::IntoResponse;
        let token = path.strip_prefix("/api/cb/bottle-media/")?;
        let found = {
            let grants = self.grants.lock().expect("cb grants");
            grants
                .get(token)
                .filter(|grant| grant.expires > now_ms())
                .map(|grant| (grant.file.clone(), grant.mime.clone()))
        };
        let Some((file, mime)) = found else {
            return Some(StatusCode::NOT_FOUND.into_response());
        };
        let length = tokio::fs::metadata(&file).await.map(|meta| meta.len());
        let body = match length {
            Ok(length) => crate::media::served::streamed(&file, 0, length).await,
            Err(error) => Err(error.to_string()),
        };
        let Ok(body) = body else {
            return Some(StatusCode::NOT_FOUND.into_response());
        };
        let mut response = axum::response::Response::new(body);
        let headers = response.headers_mut();
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        if let Ok(kind) = HeaderValue::from_str(&mime) {
            headers.insert(header::CONTENT_TYPE, kind);
        }
        Some(response)
    }
}

/// A clean copy's link, bound to one file until its time runs out.
pub(in crate::social::cb) struct Grant {
    file: PathBuf,
    mime: String,
    expires: i64,
}
