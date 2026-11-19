//! The files a message to the team carries (a photo, a sound, a video, a document), beside the
//! database and never served:
//!
//!     <project>/logs/team_reports/.uploads/<account>/<attachment>.part   while it arrives
//!     <project>/logs/team_reports/.uploads/<account>/<attachment>.ready  arrived, waiting for its message
//!     <project>/logs/team_reports/<message>/<attachment>                 its message sent
//!
//! A file arrives in pieces of `CHUNK_BYTES` (the last one shorter), each piece at its own place
//! (the file's length says which piece comes next: a piece sent again is refused, a lost one is
//! sent again from there). Only the account that sent a file can join it to its message. Purged,
//! a message's folder goes; its row keeps the files' names.
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};

/// One piece: 256 KiB.
pub const CHUNK_BYTES: u64 = 256 * 1024;
/// One file: 256 MiB at most (a few minutes of video).
pub const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;
/// A message carries ten files at most.
pub const MAX_FILES: usize = 10;

/// An id the apps make (`att_…`, a message's id): letters, digits, `_` and `-`.
pub fn id_shape(id: &str) -> bool {
    (8..=80).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

// An account's waiting room, named by a digest of its id (an id may hold any character).
fn uploads(root: &Path, principal: &str) -> PathBuf {
    root.join(".uploads")
        .join(hex::encode(&Sha256::digest(principal.as_bytes())[..16]))
}

fn private_folder(folder: &Path) -> Result<(), String> {
    std::fs::create_dir_all(folder)
        .map_err(|error| format!("team_attachment_folder_failed:{error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for path in folder.ancestors().take(3) {
            if path.is_dir() {
                std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
                    .map_err(|error| format!("team_attachment_folder_failed:{error}"))?;
            }
        }
    }
    Ok(())
}

// What is kept of a file: its name, its type and its size.
fn bounded(value: Option<&JsonValue>, max: usize) -> String {
    value
        .and_then(JsonValue::as_str)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(max)
        .collect()
}

/// One piece of `id` written: `index` of `total`, the file `size` bytes long, `name` and `mime`
/// told with every piece. Answers the file's meta once its last piece is in.
#[allow(clippy::too_many_arguments)]
pub fn write_chunk(
    root: &Path,
    principal: &str,
    id: &str,
    index: u64,
    total: u64,
    size: u64,
    name: Option<&JsonValue>,
    mime: Option<&JsonValue>,
    bytes: &[u8],
) -> Result<Option<JsonValue>, &'static str> {
    if !id_shape(id) {
        return Err("team_attachment_id_invalid");
    }
    if size == 0 || size > MAX_FILE_BYTES || total != size.div_ceil(CHUNK_BYTES) || index >= total {
        return Err("team_attachment_size_invalid");
    }
    let expected = if index + 1 == total {
        size - index * CHUNK_BYTES
    } else {
        CHUNK_BYTES
    };
    if bytes.len() as u64 != expected {
        return Err("team_attachment_chunk_invalid");
    }
    let folder = uploads(root, principal);
    private_folder(&folder).map_err(|error| {
        eprintln!("[team_reports] {error}");
        "team_attachment_storage_failed"
    })?;
    let part = folder.join(format!("{id}.part"));
    let written = std::fs::metadata(&part).map(|meta| meta.len()).unwrap_or(0);
    // The file's length says which piece comes next; the first one starts it again.
    if index > 0 && written != index * CHUNK_BYTES {
        return Err("team_attachment_chunk_out_of_order");
    }
    let stored = (|| -> std::io::Result<()> {
        let mut file = if index == 0 {
            std::fs::File::create(&part)?
        } else {
            std::fs::OpenOptions::new().append(true).open(&part)?
        };
        file.write_all(bytes)?;
        file.sync_data()
    })();
    if let Err(error) = stored {
        eprintln!("[team_reports] attachment write failed {error}");
        return Err("team_attachment_storage_failed");
    }
    if index + 1 < total {
        return Ok(None);
    }
    let meta =
        json!({ "id": id, "name": bounded(name, 200), "mime": bounded(mime, 120), "size": size });
    let ready = folder.join(format!("{id}.ready"));
    let done = std::fs::rename(&part, &ready)
        .and_then(|()| std::fs::write(folder.join(format!("{id}.json")), meta.to_string()));
    if let Err(error) = done {
        eprintln!("[team_reports] attachment finish failed {error}");
        return Err("team_attachment_storage_failed");
    }
    Ok(Some(meta))
}

/// The files `ids` the account sent moved into `message`'s folder: their metas, in that order.
pub fn commit(
    root: &Path,
    principal: &str,
    message: &str,
    ids: &[String],
) -> Result<Vec<JsonValue>, &'static str> {
    if ids.len() > MAX_FILES {
        return Err("team_attachment_too_many");
    }
    let folder = uploads(root, principal);
    let mut metas = Vec::new();
    for id in ids {
        if !id_shape(id) || !folder.join(format!("{id}.ready")).is_file() {
            return Err("team_attachment_missing");
        }
        let meta = std::fs::read_to_string(folder.join(format!("{id}.json")))
            .ok()
            .and_then(|text| serde_json::from_str::<JsonValue>(&text).ok())
            .ok_or("team_attachment_missing")?;
        metas.push(meta);
    }
    if metas.is_empty() {
        return Ok(metas);
    }
    let target = root.join(message);
    private_folder(&target).map_err(|error| {
        eprintln!("[team_reports] {error}");
        "team_attachment_storage_failed"
    })?;
    for id in ids {
        let moved = std::fs::rename(folder.join(format!("{id}.ready")), target.join(id))
            .and_then(|()| std::fs::remove_file(folder.join(format!("{id}.json"))));
        if let Err(error) = moved {
            eprintln!("[team_reports] attachment commit failed {error}");
            return Err("team_attachment_storage_failed");
        }
    }
    Ok(metas)
}

/// Where a message's file lies (the operator copies it from there).
pub fn path(root: &Path, message: &str, id: &str) -> Option<PathBuf> {
    (id_shape(message) && id_shape(id))
        .then(|| root.join(message).join(id))
        .filter(|path| path.is_file())
}

/// A message's files deleted; true when it had some.
pub fn purge(root: &Path, message: &str) -> Result<bool, String> {
    if !id_shape(message) {
        return Err("team_attachment_id_invalid".into());
    }
    match std::fs::remove_dir_all(root.join(message)) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("team_attachment_purge_failed:{error}")),
    }
}
