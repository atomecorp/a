// A bottle leaving (bottles/mod.rs): withdrawn by its sender, expired by the daily purge (main.rs)
// with its clean copies, or gone with its sender's account.
use super::super::{BOTTLE_CASE, BOTTLE_CONTEXT, handles};
use super::{LIFE_MS, release_expired};
use crate::social::moderation;
use crate::social::news::db::{all, run, text};
use rusqlite::Connection;

/// The sender takes back a bottle still at sea: it leaves the sea; its copies, to erase.
pub fn withdraw(db: &Connection, me: &str, id: &str, now: i64) -> Result<Vec<String>, String> {
    let files = files_of(
        db,
        "SELECT media_file, thumb_file FROM cb_bottles WHERE bottle_id = ? AND sender_id = ? AND state = 'at_sea'",
        &[&id, &me],
    )?;
    let changed = run(
        db,
        "UPDATE cb_bottles SET state = 'withdrawn', zone_cell = '', media_file = NULL, thumb_file = NULL, updated_ms = ?
         WHERE bottle_id = ? AND sender_id = ? AND state = 'at_sea'",
        &[&now, &id, &me],
    )?;
    Ok(if changed == 1 { files } else { Vec::new() })
}

fn files_of(
    db: &Connection,
    sql: &str,
    values: &[&dyn rusqlite::ToSql],
) -> Result<Vec<String>, String> {
    Ok(all(db, sql, values)?
        .into_iter()
        .flat_map(|row| [text(row.get("media_file")), text(row.get("thumb_file"))])
        .filter(|file| !file.is_empty())
        .collect())
}

/// The daily purge: reservations run out, bottles past their 21 days or hidden expire (their cell
/// and their copies with them); a bottle 21 days past its expiry leaves with its threads and its
/// handles. The copies to erase.
pub fn purge(db: &Connection, now: i64) -> Result<Vec<String>, String> {
    release_expired(db, now)?;
    let hidden: Vec<String> = all(
        db,
        "SELECT bottle_id FROM cb_bottles WHERE state NOT IN ('expired', 'withdrawn', 'hidden')",
        &[],
    )?
    .into_iter()
    .map(|row| text(row.get("bottle_id")))
    .collect();
    for id in hidden {
        if moderation::hidden_case(db, BOTTLE_CASE, &id)? {
            run(
                db,
                "UPDATE cb_bottles SET state = 'hidden', updated_ms = ? WHERE bottle_id = ?",
                &[&now, &id],
            )?;
        }
    }
    let files = files_of(
        db,
        "SELECT media_file, thumb_file FROM cb_bottles WHERE expires_ms <= ? OR state IN ('expired', 'withdrawn', 'hidden')",
        &[&now],
    )?;
    run(
        db,
        "UPDATE cb_bottles SET state = CASE WHEN state IN ('withdrawn', 'hidden') THEN state ELSE 'expired' END,
         zone_cell = '', media_file = NULL, thumb_file = NULL, updated_ms = ?
         WHERE expires_ms <= ? OR state IN ('expired', 'withdrawn', 'hidden')",
        &[&now, &now],
    )?;
    let gone: Vec<String> = all(
        db,
        "SELECT bottle_id FROM cb_bottles WHERE expires_ms + ? <= ?",
        &[&LIFE_MS, &now],
    )?
    .into_iter()
    .map(|row| text(row.get("bottle_id")))
    .collect();
    for id in gone {
        forget_bottle(db, &id)?;
    }
    Ok(files)
}

// A bottle gone for good: its row, who saw it, its threads, their messages, its handles.
fn forget_bottle(db: &Connection, id: &str) -> Result<(), String> {
    run(
        db,
        "DELETE FROM cb_bottle_messages WHERE thread_id IN (SELECT thread_id FROM cb_bottle_threads WHERE bottle_id = ?)",
        &[&id],
    )?;
    for sql in [
        "DELETE FROM cb_bottle_threads WHERE bottle_id = ?",
        "DELETE FROM cb_bottle_seen WHERE bottle_id = ?",
        "DELETE FROM cb_bottles WHERE bottle_id = ?",
    ] {
        run(db, sql, &[&id])?;
    }
    handles::forget_context(db, &format!("{BOTTLE_CONTEXT}{id}"))?;
    Ok(())
}

/// An account deleted (auth/account_actions.rs `delete_account`, in its transaction): its bottles
/// at sea leave, with every thread it took part in and its handles. Their copies are erased by
/// the next purge (`orphans`).
pub fn forget_principal(db: &Connection, principal: &str) -> Result<(), String> {
    let sent: Vec<String> = all(
        db,
        "SELECT bottle_id FROM cb_bottles WHERE sender_id = ? AND state IN ('at_sea', 'reserved')",
        &[&principal],
    )?
    .into_iter()
    .map(|row| text(row.get("bottle_id")))
    .collect();
    for id in sent {
        forget_bottle(db, &id)?;
    }
    run(
        db,
        "DELETE FROM cb_bottle_messages WHERE thread_id IN (SELECT t.thread_id FROM cb_bottle_threads t
         JOIN cb_bottles b ON b.bottle_id = t.bottle_id WHERE t.replier_id = ? OR b.sender_id = ?)",
        &[&principal, &principal],
    )?;
    run(
        db,
        "DELETE FROM cb_bottle_threads WHERE replier_id = ? OR bottle_id IN (SELECT bottle_id FROM cb_bottles WHERE sender_id = ?)",
        &[&principal, &principal],
    )?;
    run(
        db,
        "DELETE FROM cb_bottle_seen WHERE principal_id = ?",
        &[&principal],
    )?;
    handles::forget_principal(db, principal)?;
    Ok(())
}

/// The copies a bottle still names: anything else in the bottles' folder is erased.
pub(super) fn named_files(db: &Connection) -> Result<std::collections::HashSet<String>, String> {
    Ok(files_of(
        db,
        "SELECT media_file, thumb_file FROM cb_bottles WHERE media_file IS NOT NULL OR thumb_file IS NOT NULL",
        &[],
    )?
    .into_iter()
    .collect())
}
