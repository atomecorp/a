// A media leaving its author through a News (server/news_broadcast.js `resolvePublishedMedia`,
// `linkOnlyMember`, and server/news_media_cleaner.js, ported). Only its owner may publish a
// media; the audience reads a clean copy, never the author's file (cahier FEAT-005 / O13: EXIF
// and GPS always stripped): a picture loses its metadata byte by byte (media/metadata_strip.rs),
// a sound or a video is copied by ffmpeg without its global and stream metadata, chapters or
// data tracks. The copy lies under the author's `Downloads/news_shared/`, registered as a file
// of theirs: what the audience may read is its id alone. A third party's video an online service
// hosts (atome/src/shared/online_video_refs.js `onlineVideoShareLink`) may not be redistributed:
// it leaves as its link alone.
use super::News;
use super::db::{get, text};
use crate::http::uri::{decode_uri_component, encode_uri_component};
use crate::media::metadata_strip::{Format, format_of, strip_image};
use crate::media::{files, storage};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const CLEAN_DIR: &str = "Downloads/news_shared";

fn youtube_ref(value: &str) -> Option<&str> {
    (value.len() == 11
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
    .then_some(value)
}

// A host name with a dot; never an IP literal, a port or a local name.
fn public_host(host: &str) -> bool {
    let labels: Vec<&str> = host.split('.').collect();
    let ipv4 = labels.len() == 4
        && labels
            .iter()
            .all(|label| !label.is_empty() && label.bytes().all(|b| b.is_ascii_digit()));
    let (Some(last), true) = (labels.last(), labels.len() >= 2) else {
        return false;
    };
    (4..=253).contains(&host.len())
        && !ipv4
        && (2..=63).contains(&last.len())
        && last.bytes().all(|b| b.is_ascii_lowercase())
        && labels[..labels.len() - 1].iter().all(|label| {
            (1..=63).contains(&label.len())
                && label
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                && !label.starts_with('-')
                && !label.ends_with('-')
        })
}

fn short_uuid(id: &str) -> bool {
    (20..=24).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() && !b"0IOl".contains(&b))
}

fn uuid(id: &str) -> bool {
    let parts: Vec<&str> = id.split('-').collect();
    parts.len() == 5
        && parts.iter().zip([8, 4, 4, 4, 12]).all(|(part, size)| {
            part.len() == size
                && part
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
}

/// `peertubeVideoRef(value).ref`: an https watch address on a public host.
fn peertube_ref(value: &str) -> Option<String> {
    let url = url::Url::parse(js::trim(value)).ok()?;
    let host = url.host_str()?.to_lowercase();
    if url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || !public_host(&host)
    {
        return None;
    }
    let path = url.path();
    let path = path.strip_suffix('/').unwrap_or(path);
    let id = if let Some(id) = path.strip_prefix("/w/") {
        short_uuid(id).then_some(id)?
    } else {
        let id = path
            .strip_prefix("/videos/watch/")
            .or_else(|| path.strip_prefix("/videos/embed/"))?;
        (uuid(id) || short_uuid(id)).then_some(id)?
    };
    Some(if id.contains('-') {
        format!("https://{host}/videos/watch/{id}")
    } else {
        format!("https://{host}/w/{id}")
    })
}

/// `onlineVideoShareLink`: `{ provider, link, title }` for an online service's video, None for
/// any other media; a service Atome without a valid reference is refused.
fn share_link(props: &JsonValue) -> Result<Option<JsonValue>, String> {
    let provider = text(props.get("media_source"));
    let link = match provider.as_str() {
        "youtube" => youtube_ref(&text(props.get("youtube_video_id")))
            .map(|id| format!("https://www.youtube.com/watch?v={id}")),
        "peertube" => peertube_ref(&text(props.get("peertube_video_url"))),
        _ => return Ok(None),
    };
    let link = link.ok_or("online_video_ref_invalid")?;
    let titled = props.get(format!("{provider}_title"));
    let title = text(if js::truthy(titled) {
        titled
    } else {
        props.get("name")
    });
    Ok(Some(
        json!({ "provider": provider, "link": link, "title": title }),
    ))
}

impl News {
    // Only its owner publishes a media: else listing another's id would open its read to the audience.
    pub(super) async fn owns_atome(&self, author: &str, atome_id: &str) -> Result<bool, String> {
        let (author, atome_id) = (author.to_string(), atome_id.to_string());
        self.central
            .transaction(move |db| {
                if let Some(registry) = get(
                    db,
                    "SELECT vault_principal_id FROM vault_object_registry WHERE atome_id = ?",
                    &[&atome_id],
                )? {
                    return Ok(text(registry.get("vault_principal_id")) == author);
                }
                let row = get(
                    db,
                    "SELECT owner_id FROM atomes WHERE atome_id = ?",
                    &[&atome_id],
                )?;
                Ok(row.is_some_and(|row| text(row.get("owner_id")) == author))
            })
            .await
    }

    // The properties of one of the author's atomes, read in their vault.
    async fn properties_of(&self, author: &str, atome_id: &str) -> Result<JsonValue, String> {
        let state = self
            .router
            .own(author, "state:get", json!({ "atome_id": atome_id }))
            .await?;
        Ok(state
            .get("properties")
            .filter(|props| js::truthy(Some(props)))
            .or_else(|| {
                state
                    .get("particles")
                    .filter(|props| js::truthy(Some(props)))
            })
            .cloned()
            .unwrap_or_else(|| json!({})))
    }

    /// `linkOnlyMember`: an online service's video of the author's, as its link alone.
    pub(super) async fn link_only_member(
        &self,
        author: &str,
        member: &JsonValue,
    ) -> Result<Option<JsonValue>, String> {
        let atome_id = text(
            member
                .get("properties")
                .and_then(|props| props.get("media_atome_id")),
        );
        if atome_id.is_empty() || !self.owns_atome(author, &atome_id).await? {
            return Ok(None);
        }
        let props = self.properties_of(author, &atome_id).await?;
        let referenced = text(props.get("news_media_ref"));
        let mut shared = share_link(&props)?;
        if shared.is_none()
            && !referenced.is_empty()
            && self.owns_atome(author, &referenced).await?
        {
            shared = share_link(&self.properties_of(author, &referenced).await?)?;
        }
        let Some(shared) = shared else {
            return Ok(None);
        };
        let mut properties = serde_json::Map::new();
        properties.insert("media_link".into(), shared["link"].clone());
        properties.insert("media_provider".into(), shared["provider"].clone());
        if js::truthy(shared.get("title")) {
            properties.insert("name".into(), shared["title"].clone());
        }
        let order = js::number(member["properties"].get("hierarchy_order"));
        if order.is_finite() {
            properties.insert("hierarchy_order".into(), js::number_json(order));
        }
        let id = Some(text(member.get("id")))
            .filter(|id| !id.is_empty())
            .unwrap_or(atome_id);
        Ok(Some(
            json!({ "id": id, "type": "link", "properties": properties }),
        ))
    }

    async fn file_metadata(
        &self,
        identifier: &str,
        owner: Option<&str>,
    ) -> Result<Option<JsonValue>, String> {
        let (identifier, owner) = (identifier.to_string(), owner.map(str::to_string));
        self.central
            .transaction(move |db| files::metadata(db, &identifier, owner.as_deref()))
            .await
    }

    /// `resolvePublishedMedia`: the author's own file as its clean copy, `(its id, its source)`.
    pub(super) async fn published_media(
        &self,
        author: &str,
        member: &JsonValue,
    ) -> Result<Option<(String, String)>, String> {
        let props = member.get("properties");
        let atome_id = text(props.and_then(|props| props.get("media_atome_id")));
        if atome_id.is_empty() || !self.owns_atome(author, &atome_id).await? {
            return Ok(None);
        }
        let source = text(props.and_then(|props| props.get("media_src")));
        let source = source.split('?').next().unwrap_or_default();
        let name = decode_uri_component(source.rsplit('/').next().unwrap_or_default())?;
        let mut meta = self.file_metadata(&atome_id, None).await?;
        if meta.is_none() && !name.is_empty() {
            meta = self.file_metadata(&name, Some(author)).await?;
        }
        let Some(meta) = meta.filter(|meta| text(meta.get("owner_id")) == author) else {
            return Ok(None);
        };
        let clean = self.clean(author, &meta).await?;
        let src = format!("/api/uploads/{}", encode_uri_component(&clean));
        Ok(Some((clean, src)))
    }

    /// `cleanMedia`: one clean copy per source file, written again at each publication.
    async fn clean(&self, author: &str, meta: &JsonValue) -> Result<String, String> {
        let found = meta.clone();
        let aliased = self
            .central
            .transaction(move |db| files::legacy_alias(db, &found))
            .await?;
        let source = files::located(
            &self.storage,
            meta,
            &text(meta.get("atome_id")),
            author,
            aliased.as_deref(),
        )?;
        let bytes = tokio::fs::read(&source.file_path)
            .await
            .map_err(|e| e.to_string())?;
        let format = format_of(&bytes);
        if matches!(format, Format::Heif | Format::Unknown) {
            return Err(format!("news_media_format_unsupported:{}", format.name()));
        }
        let named = js::first(meta, &["file_name", "original_name"])
            .map(js::string)
            .unwrap_or_else(|| source.file_path.to_string_lossy().into_owned());
        let extension = crate::media::playback::extension_of(&named)
            .map(|extension| format!(".{}", extension.to_lowercase()))
            .ok_or("news_media_extension_missing")?;
        let id = format!("newsclean_{}", text(meta.get("atome_id")));
        let name = format!("{id}{extension}");
        let target = self
            .storage
            .asset_path(author, &format!("{CLEAN_DIR}/{name}"))?;
        if format == Format::Av {
            let mp4 = [".mp4", ".m4v", ".mov", ".m4a"].contains(&extension.as_str());
            let mut command = tokio::process::Command::new("ffmpeg");
            command
                .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
                .arg(&source.file_path)
                .args([
                    "-map",
                    "0:v?",
                    "-map",
                    "0:a?",
                    "-c",
                    "copy",
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
                ]);
            if mp4 {
                command.args(["-movflags", "+faststart"]);
            }
            let output = tokio::time::timeout(
                std::time::Duration::from_secs(120),
                command.arg(&target.file_path).output(),
            )
            .await
            .map_err(|_| "news_media_clean_failed: timeout".to_string())?
            .map_err(|e| format!("news_media_clean_failed: {e}"))?;
            if !output.status.success() {
                return Err(format!(
                    "news_media_clean_failed: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
        } else {
            let cleaned = if format == Format::Svg {
                bytes
            } else {
                strip_image(&bytes)?
            };
            write_private(&target.file_path, &cleaned).await?;
        }
        let size = tokio::fs::metadata(&target.file_path)
            .await
            .map_err(|e| e.to_string())?
            .len();
        let original = js::first(meta, &["original_name", "file_name"])
            .map(js::string)
            .unwrap_or_else(|| name.clone());
        storage::register(
            &self.central,
            &name,
            author,
            storage::Registration {
                atome_id: Some(id.clone()),
                atome_type: None,
                original_name: original,
                mime_type: meta
                    .get("mime_type")
                    .filter(|mime| js::truthy(Some(mime)))
                    .map(js::string),
                size,
                file_path: Some(target.relative_path),
            },
        )
        .await?;
        Ok(id)
    }
}

async fn write_private(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
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
