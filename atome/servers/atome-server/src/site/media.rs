// The media placed on a published page, by their content (server/site_publishing.js
// `resolveMedia`, ported): each one's address served (`/_site/m/<sha256>`) and the original
// file it is read from, never a copy.
use super::projection::MEDIA_TYPES;
use super::{Held, Site};
use crate::media::downloads::Downloads;
use crate::social::public_events::contract::clip;
use crate::vault_router::js;
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;

fn mime(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_lowercase();
    match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}
async fn sha256_of(path: &Path) -> Result<String, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| e.to_string())?;
    let (mut hash, mut buffer) = (Sha256::new(), vec![0u8; 64 * 1024]);
    loop {
        let read = file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

impl Site {
    // A media placed on a page: `/api/uploads/<file>?media_user_id=<owner>`, read as its owner
    // reads it.
    async fn resolve_file(
        &self,
        files: &Downloads<'_>,
        owner: &str,
        media_url: &str,
    ) -> Option<PathBuf> {
        let base = url::Url::parse(&self.origin).ok()?;
        let url = base.join(media_url).ok()?;
        let name = url.path().strip_prefix("/api/uploads/")?;
        let name = percent_encoding::percent_decode_str(name)
            .decode_utf8()
            .ok()?;
        files
            .target(&name, owner)
            .await
            .ok()
            .map(|found| found.file_path)
    }
    // Every media placed on a published page, by its content: the address served and the
    // original file read.
    pub(super) async fn resolve_media(
        &self,
        files: &Downloads<'_>,
        owner: &str,
        records: &[JsonValue],
    ) -> Result<(HashMap<String, String>, Vec<(String, Held)>), String> {
        let (mut media, mut found) = (HashMap::new(), Vec::new());
        for record in records {
            let kind = js::first(record, &["type", "kind"])
                .map(|kind| js::text(Some(kind)).to_lowercase())
                .unwrap_or_default();
            let url = clip(record.pointer("/properties/media_url"), 2000);
            if !MEDIA_TYPES.contains(&kind.as_str()) || url.is_empty() {
                continue;
            }
            let Some(path) = self.resolve_file(files, owner, &url).await else {
                continue;
            };
            let sha256 = sha256_of(&path).await?;
            let id = js::first(record, &["atome_id", "id"])
                .map(|id| js::text(Some(id)))
                .unwrap_or_default();
            media.insert(id, format!("/_site/m/{sha256}"));
            let mime = mime(&path);
            found.push((
                sha256,
                Held {
                    file_path: path,
                    mime,
                },
            ));
        }
        Ok((media, found))
    }
}
