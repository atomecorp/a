// The guest's files in an adoption (server/wsApiGuestAdoptionFiles.js, ported): declared with the
// payload (`guest_adoption_files`), each staged under `data/guest-adoptions/<operation>` once its
// bytes match their digest, then moved into the account's `Downloads` at the end.
use super::{Connection, field, is_digest, is_uuid_v4, sha256};
use crate::media::playback::sanitize_file_name;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::os::unix::fs::DirBuilderExt;
use std::path::{Component, Path, PathBuf};

pub(super) const ALL: &str = "SELECT * FROM guest_adoption_files WHERE operation_digest = ?";
const MOVED: &str = "UPDATE guest_adoption_files SET status = 'moved', target_path = ?, updated_at = datetime('now')
                WHERE operation_digest = ? AND file_id = ?";

/// A file the payload declares (`descriptor`).
pub(super) struct Descriptor {
    file_id: String,
    file_name: String,
    content_digest: String,
    byte_length: f64,
}

/// `adoptionFiles`: every descriptor valid, then no id twice.
pub(super) fn descriptors(files: &[JsonValue]) -> Result<Vec<Descriptor>, String> {
    let mut read = Vec::with_capacity(files.len());
    for file in files {
        let name = js::first(file, &["file_name", "fileName", "name"]);
        let file_name = match name {
            Some(JsonValue::String(name)) => sanitize_file_name(name),
            // `sanitizeFileName` of a name that is no text, or of none.
            _ => sanitize_file_name(""),
        };
        // `Number(a ?? b ?? c)`.
        let length = ["byte_length", "byteLength", "size"]
            .into_iter()
            .find_map(|key| file.get(key).filter(|value| !value.is_null()));
        let descriptor = Descriptor {
            file_id: field(file, &["file_id", "fileId", "id"]),
            content_digest: field(file, &["content_digest", "contentDigest", "digest"]),
            byte_length: js::number(length),
            file_name,
        };
        let safe = descriptor.byte_length.fract() == 0.0
            && descriptor.byte_length.abs() <= 9_007_199_254_740_991.0;
        if !is_uuid_v4(&descriptor.file_id)
            || !is_digest(&descriptor.content_digest)
            || !safe
            || descriptor.byte_length < 0.0
        {
            return Err("guest_adoption_file_invalid".into());
        }
        read.push(Descriptor {
            content_digest: descriptor.content_digest.to_ascii_lowercase(),
            ..descriptor
        });
    }
    for (index, file) in read.iter().enumerate() {
        if read[..index]
            .iter()
            .any(|seen| seen.file_id == file.file_id)
        {
            return Err("guest_adoption_file_duplicate".into());
        }
    }
    Ok(read)
}

/// `declareAdoptionFiles`: each file journaled once, the same each time it is declared again.
pub(super) async fn declare(
    connection: &Connection,
    operation: &str,
    files: &[Descriptor],
) -> Result<(), String> {
    let central = connection.ws_api.sessions.central();
    for file in files {
        let existing = central
            .get(
                "SELECT file_name, content_digest, byte_length FROM guest_adoption_files WHERE operation_digest = ? AND file_id = ?",
                vec![json!(operation), json!(file.file_id)],
            )
            .await?;
        if let Some(existing) = existing {
            if existing["file_name"] != file.file_name.as_str()
                || existing["content_digest"] != file.content_digest.as_str()
                || js::number(existing.get("byte_length")) != file.byte_length
            {
                return Err("guest_adoption_file_conflict".into());
            }
            continue;
        }
        central
            .run(
                "INSERT INTO guest_adoption_files
            (operation_digest, file_id, file_name, content_digest, byte_length, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'declared', datetime('now'), datetime('now'))",
                vec![
                    json!(operation),
                    json!(file.file_id),
                    json!(file.file_name),
                    json!(file.content_digest),
                    js::number_json(file.byte_length),
                ],
            )
            .await?;
    }
    Ok(())
}

/// `operationDirectory`: `data/guest-adoptions/<operation>` of the project, the `data` the
/// uploads' chunks lie in.
fn operation_directory(connection: &Connection, operation: &str) -> Result<PathBuf, String> {
    let data = connection.ws_api.storage.uploads_tmp.parent();
    data.map(|data| data.join("guest-adoptions").join(operation))
        .ok_or_else(|| "guest_adoption_storage_unavailable".to_string())
}

/// `stageAdoptionFile`: the bytes of a declared file, checked against its length and digest,
/// written beside the operation.
pub(super) async fn stage(
    connection: &Connection,
    operation: &str,
    file_id: &str,
    content: Option<&JsonValue>,
) -> Result<(), String> {
    let central = connection.ws_api.sessions.central();
    let file = central
        .get(
            "SELECT * FROM guest_adoption_files WHERE operation_digest = ? AND file_id = ?",
            vec![json!(operation), json!(file_id)],
        )
        .await?
        .ok_or("guest_adoption_file_not_declared")?;
    let text = content.map(|content| js::text(Some(content)));
    let bytes = crate::mail::mime::base64_bytes(text.as_deref().unwrap_or(""));
    if bytes.len() as f64 != js::number(file.get("byte_length"))
        || file["content_digest"] != sha256(&bytes).as_str()
    {
        return Err("guest_adoption_file_digest_invalid".into());
    }
    let directory = operation_directory(connection, operation)?;
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&directory)
        .map_err(|error| error.to_string())?;
    let stored_id = js::text(file.get("file_id"));
    let staged = directory.join(format!("{stored_id}.bin"));
    let partial = directory.join(format!("{stored_id}.bin.partial"));
    let mut written = tokio::fs::OpenOptions::new();
    written.write(true).create(true).truncate(true).mode(0o600);
    let mut handle = written
        .open(&partial)
        .await
        .map_err(|error| error.to_string())?;
    tokio::io::AsyncWriteExt::write_all(&mut handle, &bytes)
        .await
        .map_err(|error| error.to_string())?;
    drop(handle);
    tokio::fs::rename(&partial, &staged)
        .await
        .map_err(|error| error.to_string())?;
    central
        .run(
            "UPDATE guest_adoption_files SET status = 'staged', staged_path = ?, updated_at = datetime('now')
        WHERE operation_digest = ? AND file_id = ?",
            vec![
                json!(staged.to_string_lossy()),
                json!(operation),
                json!(stored_id),
            ],
        )
        .await
}

/// `ensureAdoptionFilesStaged`: the operation's files (rows of `ALL`), every one staged or moved.
pub(super) fn staged(files: Vec<JsonValue>) -> Result<Vec<JsonValue>, String> {
    if files
        .iter()
        .any(|file| file["status"] != "staged" && file["status"] != "moved")
    {
        return Err("guest_adoption_files_incomplete".into());
    }
    Ok(files)
}

/// `targetMatches`: the file at `path` is the declared one, none there being no match.
async fn target_matches(file: &JsonValue, path: &Path) -> Result<bool, String> {
    match tokio::fs::read(path).await {
        Ok(bytes) => Ok(bytes.len() as f64 == js::number(file.get("byte_length"))
            && file["content_digest"] == sha256(&bytes).as_str()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

/// `path.resolve`: absolute from the working directory, `.` and `..` read.
fn resolved(path: &Path) -> Result<PathBuf, String> {
    let absolute = std::env::current_dir()
        .map_err(|error| error.to_string())?
        .join(path);
    let mut out = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other),
        }
    }
    Ok(out)
}

/// `isOperationStagedPath`: inside the operation's directory, never the directory itself.
fn is_operation_staged_path(directory: &Path, staged: &Path) -> Result<bool, String> {
    Ok(resolved(staged)?
        .strip_prefix(resolved(directory)?)
        .is_ok_and(|relative| !relative.as_os_str().is_empty()))
}

/// `completeAdoptionFiles`: each staged file moved to the account's `Downloads` under its name,
/// one already there with the same bytes kept, any other one there a collision.
pub(super) async fn complete(
    connection: &Connection,
    operation: &str,
    target: &str,
) -> Result<(), String> {
    let central = connection.ws_api.sessions.central();
    let files = staged(central.all(ALL.into(), vec![json!(operation)]).await?)?;
    let downloads = connection
        .ws_api
        .storage
        .home(target)
        .map_err(|error| error.to_string())?
        .join("Downloads");
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&downloads)
        .map_err(|error| error.to_string())?;
    let directory = operation_directory(connection, operation)?;
    for file in files {
        let file_id = js::text(file.get("file_id"));
        let recorded = js::truthy(file.get("target_path"));
        let target_path = if recorded {
            PathBuf::from(js::text(file.get("target_path")))
        } else {
            downloads.join(js::text(file.get("file_name")))
        };
        let place = || {
            vec![
                json!(target_path.to_string_lossy()),
                json!(operation),
                json!(file_id),
            ]
        };
        if file["status"] == "moved" {
            if !target_matches(&file, &target_path).await? {
                return Err("guest_adoption_file_missing".into());
            }
            continue;
        }
        central
            .run(
                "UPDATE guest_adoption_files SET target_path = ?, updated_at = datetime('now')
            WHERE operation_digest = ? AND file_id = ?",
                place(),
            )
            .await?;
        if recorded && target_matches(&file, &target_path).await? {
            central.run(MOVED, place()).await?;
            continue;
        }
        match tokio::fs::metadata(&target_path).await {
            Ok(_) => return Err("guest_adoption_file_collision".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        let staged_path = PathBuf::from(if js::truthy(file.get("staged_path")) {
            js::text(file.get("staged_path"))
        } else {
            String::new()
        });
        if !is_operation_staged_path(&directory, &staged_path)? {
            return Err("guest_adoption_file_stage_invalid".into());
        }
        tokio::fs::rename(&staged_path, &target_path)
            .await
            .map_err(|error| error.to_string())?;
        central.run(MOVED, place()).await?;
    }
    Ok(())
}
