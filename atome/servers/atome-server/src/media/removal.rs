// A media atome deleted (its `delete` event committed by the vault router, whatever path it
// came by: a hold's Supprimer, `media_import.delete`, a device's sync, a redo): its stored bytes
// leave their place in its owner's home and its file registration is marked deleted, so no
// listing, read or device recovery brings it back (AGENTS.md rule 21, register R-115 D36). The
// bytes wait in the home's `.deleted/` (media/trash.rs): its `restore` (an undo) puts them back
// and reopens the registration; the purge erases them after `trash::KEEP`.
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
                Ok(target) => {
                    let home = storage.home(&owner).map_err(|e| e.to_string())?;
                    super::trash::keep(&home, &id, &target.file_path)
                        .map_err(|error| format!("media_bytes_remove_failed:{error}"))?;
                }
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

/// The undo of a media's delete (a `restore` committed by the vault router): its bytes kept
/// aside come back to their place and its file registration is open again. Nothing when
/// `owner` does not own its registration or nothing was kept.
pub async fn restore_deleted_media(
    central: &crate::vault_router::central::Central,
    storage: Arc<Storage>,
    owner: &str,
    atome_id: &str,
) -> Result<(), String> {
    let (id, owner) = (atome_id.to_string(), owner.to_string());
    central
        .transaction(move |db| {
            let registered: Option<String> = db
                .query_row(
                    "SELECT owner_id FROM atomes WHERE atome_id = ?1",
                    [&id],
                    |row| row.get(0),
                )
                .ok();
            if registered.as_deref() != Some(owner.as_str()) {
                return Ok(());
            }
            let home = storage.home(&owner).map_err(|e| e.to_string())?;
            let restored = super::trash::restore(&home, &id)
                .map_err(|error| format!("media_bytes_restore_failed:{error}"))?;
            if restored > 0 {
                db.execute(
                    "UPDATE atomes SET deleted_at = NULL WHERE atome_id = ?1",
                    [&id],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(())
        })
        .await
}
