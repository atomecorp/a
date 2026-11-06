// A media atome deleted (its `delete` event committed by the vault router, whatever path it
// came by: a hold's Supprimer, `media_import.delete`, a device's sync): its stored bytes leave
// its owner's home and its file registration is marked deleted, so no listing, read or
// device recovery brings it back (AGENTS.md rule 21, register R-115 D36).
use super::{Storage, files};
use crate::social::news::db::text;
use std::sync::Arc;

/// Removes the stored file of `atome_id` when `owner` owns it; nothing when no live file
/// registration names it (an atome that never had bytes here, or already removed).
pub async fn remove_deleted_media(
    central: &crate::vault_router::central::Central,
    storage: Arc<Storage>,
    owner: &str,
    atome_id: &str,
) -> Result<(), String> {
    let (id, owner) = (atome_id.to_string(), owner.to_string());
    central
        .transaction(move |db| {
            let Some(meta) = files::metadata(db, &id, None)? else {
                return Ok(());
            };
            if text(meta.get("owner_id")) != owner {
                return Ok(());
            }
            match files::located(&storage, &meta, &id, &owner, None) {
                Ok(target) => match std::fs::remove_file(&target.file_path) {
                    Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                        return Err(format!("media_bytes_remove_failed:{error}"));
                    }
                    _ => {}
                },
                // Its bytes already gone: only its registration is left to close.
                Err(missing) if missing.starts_with("ENOENT") => {}
                Err(error) => return Err(error),
            }
            db.execute(
                "UPDATE atomes SET deleted_at = ?1 WHERE atome_id = ?2 AND deleted_at IS NULL",
                rusqlite::params![atome_store::append::iso_now(), id],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
}
