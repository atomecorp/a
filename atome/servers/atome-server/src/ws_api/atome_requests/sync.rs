// The `sync` reads of the central database (server/wsAtomeOperations.js `handleSync` get-pending
// and ack, on database/adole_sync.js `getPendingForSync` and `markAsSynced`): the live atomes of
// a principal not yet synced, and their acknowledgement once every one is the principal's to write.
use super::reads::{bound, stored_atome};
use crate::social::news::db::{all, run};
use crate::social::permissions::can_write;
use crate::vault_router::js;
use crate::ws_api::Connection;
use atome_store::append::iso_now;
use rusqlite::types::Value as SqlValue;
use serde_json::{Value as JsonValue, json};

// `getPendingForSync(ownerId)`: each pending atome as `getAtome` reads it, not deleted.
fn pending_atomes(db: &rusqlite::Connection, owner: &str) -> Result<Vec<JsonValue>, String> {
    let rows = all(
        db,
        "SELECT DISTINCT a.*
         FROM atomes a
         LEFT JOIN particles po
           ON po.atome_id = a.atome_id
          AND po.particle_key = '_pending_owner_id'
         WHERE a.sync_status = 'pending'
           AND a.deleted_at IS NULL
           AND (a.owner_id = ? OR json_extract(po.particle_value, '$') = ?)
         ORDER BY a.updated_at ASC",
        &[&owner, &owner],
    )?;
    let mut changes = Vec::new();
    for row in rows {
        let atome = stored_atome(db, &bound(row.get("atome_id"))?)?;
        if let JsonValue::Object(mut atome) = atome {
            atome.insert("deleted".into(), json!(!row["deleted_at"].is_null()));
            changes.push(JsonValue::Object(atome));
        }
    }
    Ok(changes)
}

/// `get-pending`: the `changes` waiting for `principal`.
pub(in crate::ws_api) async fn pending(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let owner = principal.to_string();
    let changes = connection
        .router()
        .central()
        .transaction(move |db| pending_atomes(db, &owner))
        .await?;
    Ok(crate::ws_api::atome_ops::success(
        "sync",
        message,
        json!({ "changes": changes }),
    ))
}

/// `ack`: the `atome_ids` (else `atomeIds`) marked synced, refused unless `principal` may write
/// every one.
pub(in crate::ws_api) async fn acknowledge(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let ids = ["atome_ids", "atomeIds"]
        .iter()
        .find_map(|key| message.get(*key).and_then(JsonValue::as_array))
        .cloned()
        .unwrap_or_default();
    let reader = principal.to_string();
    let acknowledged = connection
        .router()
        .central()
        .committed(move |db| {
            for id in &ids {
                let writable = js::truthy(Some(id))
                    && !reader.is_empty()
                    && can_write(db, &js::text(Some(id)), &reader)?;
                if !writable {
                    return Ok(None);
                }
            }
            let now = iso_now();
            for id in &ids {
                let id: SqlValue = bound(Some(id))?;
                run(
                    db,
                    "UPDATE atomes SET sync_status = ?, last_sync = ? WHERE atome_id = ?",
                    &[&"synced", &now, &id],
                )?;
            }
            Ok(Some(ids))
        })
        .await??;
    Ok(match acknowledged {
        Some(ids) => {
            crate::ws_api::atome_ops::success("sync", message, json!({ "acknowledged": ids }))
        }
        None => crate::ws_api::atome_ops::failure("sync", message, "Access denied"),
    })
}
