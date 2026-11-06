// Who may read a person's file and where it lies (server/server_uploads.js
// `resolveDownloadTarget` and server/userFiles.js `canAccessFile`, ported): the one resolver of
// the HTTP reads (served.rs) and of the `file` family's reads and deletion on `/ws/api`.
use super::Storage;
use super::files;
use crate::social::news::News;
use crate::social::news::db::{all, run, text};
use crate::social::permissions;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};
use std::path::PathBuf;

/// A file found readable: its path, the name it is sent under, its record when it has one.
pub struct Download {
    pub file_path: PathBuf,
    pub download_name: String,
    pub meta: Option<JsonValue>,
}

/// A read that gives no file: refused with a status (`{ error, status }`), or failed (thrown).
pub enum Missed {
    Refused(u16, String),
    Failed(String),
}

impl From<String> for Missed {
    fn from(error: String) -> Self {
        Missed::Failed(error)
    }
}

// `canAccessFile`'s answer once the central database is read: granted, or the atomes whose
// grants the resolvers may hold, with the file's owner.
enum Access {
    Granted,
    Through(Vec<String>, String),
}

fn access(db: &Connection, identifier: &str, user: &str) -> Result<Access, String> {
    // A file the central database does not know is read as before.
    let Some(meta) = files::metadata(db, identifier, None)? else {
        return Ok(Access::Granted);
    };
    if meta["owner_id"] == json!(user) || js::truthy(meta.get("is_public")) {
        return Ok(Access::Granted);
    }
    let atome_id = text(meta.get("atome_id"));
    if permissions::can_read(db, &atome_id, user, None)? {
        return Ok(Access::Granted);
    }
    // A recording registered before its file shared the recording's id.
    if atome_id != identifier
        && !identifier.is_empty()
        && permissions::can_read(db, identifier, user, None)?
    {
        return Ok(Access::Granted);
    }
    let mut ids = vec![atome_id.clone(), identifier.to_string()];
    // An atome naming this file (a shared recording) may hold the grant.
    if let Some(name) = js::first(&meta, &["file_name", "original_name"]) {
        let referencing = all(
            db,
            "SELECT DISTINCT p2.atome_id FROM particles p2
             WHERE p2.particle_key IN ('file_name', 'src') AND p2.particle_value = ? AND p2.atome_id != ?
             LIMIT 5",
            &[&name.to_string(), &atome_id],
        )?;
        for reference in referencing {
            let reference = text(reference.get("atome_id"));
            if reference.is_empty() {
                continue;
            }
            if permissions::can_read(db, &reference, user, None)? {
                return Ok(Access::Granted);
            }
            ids.push(reference);
        }
    }
    let mut seen = std::collections::HashSet::new();
    ids.retain(|id| !id.is_empty() && seen.insert(id.clone()));
    Ok(Access::Through(ids, text(meta.get("owner_id"))))
}

// The `sync_share` read: an accepted share of the atome, from the file's owner, still running.
fn shared(db: &Connection, user: &str, atome_id: &str, owner: &str) -> Result<bool, String> {
    Ok(crate::social::news::db::get(
        db,
        "SELECT share_id FROM sync_share_requests
         WHERE principal_id = ? AND atome_id = ? AND owner_id = ? AND status IN ('active', 'accepted')
           AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1",
        &[&user, &atome_id, &owner],
    )?
    .is_some())
}

pub struct Downloads<'a> {
    pub storage: &'a Storage,
    pub central: &'a Central,
    pub news: &'a News,
    pub push: &'a crate::social::push::Push,
}

impl Downloads<'_> {
    async fn db<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Connection) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        self.central.transaction(move |db| work(db)).await
    }

    /// `canAccessFile(identifier, user)`: the reads its owner, a public flag, a permission, a
    /// News of the owner or an accepted share grant.
    pub async fn can_read(&self, identifier: &str, user: &str) -> Result<bool, String> {
        let (id, reader) = (identifier.to_string(), user.to_string());
        let Access::Through(ids, owner) = self.db(move |db| access(db, &id, &reader)).await? else {
            return Ok(true);
        };
        if user.is_empty() || user == "anonymous" || owner.is_empty() {
            return Ok(false);
        }
        for atome_id in ids {
            let mut notices = Vec::new();
            let news = self
                .news
                .can_read_media(user, &atome_id, &owner, &mut notices)
                .await?;
            // A News's file belongs to a News already published, so its circle exists: what a
            // first reach of a circle would store reaches its devices, the stack keeping it.
            for notice in notices {
                if let Some(push) = notice.push {
                    let _ = self
                        .push
                        .deliver(
                            &notice.target,
                            &push,
                            &crate::social::push::Audience::default(),
                        )
                        .await;
                }
            }
            let (reader, id, by) = (user.to_string(), atome_id.clone(), owner.clone());
            if news || self.db(move |db| shared(db, &reader, &id, &by)).await? {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// `resolveDownloadTarget(param, user)`.
    pub async fn target(&self, param: &str, user: &str) -> Result<Download, Missed> {
        let wanted = js::trim(param).to_string();
        if !wanted.is_empty() {
            let (id, owner) = (wanted.clone(), user.to_string());
            let meta = self
                .db(move |db| {
                    let by_id = files::metadata(db, &id, None)?
                        .filter(|meta| text(meta.get("atome_id")) == id);
                    let meta = match by_id {
                        Some(meta) => Some(meta),
                        None => files::metadata(
                            db,
                            &id,
                            Some(owner.as_str()).filter(|o| !o.is_empty()),
                        )?,
                    };
                    let aliased = match &meta {
                        Some(meta) => files::legacy_alias(db, meta)?,
                        None => None,
                    };
                    Ok(meta.map(|meta| (meta, aliased)))
                })
                .await?;
            if let Some((meta, aliased)) = meta {
                if !self.can_read(&text(meta.get("atome_id")), user).await? {
                    return Err(Missed::Refused(403, "Access denied".into()));
                }
                let found = files::located(self.storage, &meta, &wanted, user, aliased.as_deref())
                    .map_err(|error| match error.as_str() {
                        "Access denied" => Missed::Refused(403, error),
                        _ => Missed::Failed(error),
                    })?;
                return Ok(Download {
                    file_path: found.file_path,
                    download_name: found.download_name,
                    meta: Some(meta),
                });
            }
        }
        // A shared media keeps its author's name (`/api/uploads/<name>`), which names nothing in
        // the reader's home: the file of that name this account may read is looked for.
        if !wanted.is_empty() && !user.is_empty() && user != "anonymous" {
            let (name, reader) = (json!(wanted).to_string(), user.to_string());
            let candidates = self
                .db(move |db| {
                    all(
                        db,
                        "SELECT a.atome_id FROM atomes a JOIN particles p ON a.atome_id = p.atome_id
                         WHERE p.particle_key = 'file_name' AND p.particle_value = ?
                           AND a.owner_id != ? AND a.deleted_at IS NULL
                         ORDER BY COALESCE(a.updated_at, a.created_at) DESC LIMIT 12",
                        &[&name, &reader],
                    )
                })
                .await?;
            for candidate in candidates {
                let candidate = text(candidate.get("atome_id"));
                if !self.can_read(&candidate, user).await? {
                    continue;
                }
                match Box::pin(self.target(&candidate, user)).await {
                    Ok(found) => return Ok(found),
                    Err(Missed::Refused(..)) => continue,
                    Err(failed) => return Err(failed),
                }
            }
        }
        let name = super::playback::sanitize_file_name(&wanted);
        let downloads = self
            .storage
            .downloads_file(user, &name)
            .map_err(|e| e.to_string())?;
        let missing = match files::accessible(downloads) {
            Ok(file_path) => {
                return Ok(Download {
                    file_path,
                    download_name: name,
                    meta: None,
                });
            }
            Err(missing) => missing,
        };
        for root in ["recordings", "captures"] {
            if let Ok(placed) = self.storage.asset_path(user, &format!("{root}/{name}"))
                && let Ok(file_path) = files::accessible(placed.file_path)
            {
                return Ok(Download {
                    file_path,
                    download_name: name,
                    meta: None,
                });
            }
        }
        Err(Missed::Failed(missing))
    }

    /// `deleteFile(atomeId, user)`: its owner marks the record deleted.
    pub async fn delete_record(&self, atome_id: &str, user: &str) -> Result<JsonValue, String> {
        let (id, owner) = (atome_id.to_string(), user.to_string());
        self.db(move |db| {
            let Some(meta) = files::metadata(db, &id, None)? else {
                return Ok(json!({ "success": true }));
            };
            if meta["owner_id"] != json!(owner) {
                return Ok(json!({ "success": false, "error": "Only owner can delete files" }));
            }
            run(
                db,
                "UPDATE atomes SET deleted_at = ? WHERE atome_id = ?",
                &[&atome_store::append::iso_now(), &id],
            )?;
            Ok(json!({ "success": true }))
        })
        .await
    }
}
