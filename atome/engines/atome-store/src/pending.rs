// Deferred references resolved, as Fastify's `resolvePendingOwners`
// (database/adole_ownership.js): an atome written before its owner or parent
// existed keeps the reference in a pending particle; once that atome exists the
// row and `state_current` take it and the particle goes.
use super::*;

fn delete_pending(db: &Connection, atome_id: &str, key: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
        rusqlite::params![atome_id, key],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn update_state_reference(
    db: &Connection,
    atome_id: &str,
    key: &str,
    resolved: &str,
    now: &str,
) -> Result<(), String> {
    if key == "_pending_owner_id" {
        db.execute(
            "UPDATE state_current SET owner_id = ?1, updated_at = ?2 WHERE atome_id = ?3",
            rusqlite::params![resolved, now, atome_id],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
    let row: Option<Option<String>> = db
        .query_row(
            "SELECT properties FROM state_current WHERE atome_id = ?1",
            [atome_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(raw) = row else { return Ok(()) };
    let mut properties = match raw.as_deref().map(serde_json::from_str::<JsonValue>) {
        Some(Ok(JsonValue::Object(map))) => map,
        _ => JsonMap::new(),
    };
    properties.insert("parent_id".into(), json!(resolved));
    db.execute(
        "UPDATE state_current SET properties = ?1, project_id = COALESCE(project_id, ?2), updated_at = ?3 WHERE atome_id = ?4",
        rusqlite::params![intent::js_stringify(&JsonValue::Object(properties)), resolved, now, atome_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// Resolves the pending references to `target` (every pending one when `None`).
pub fn resolve_pending_owners(db: &Connection, target: Option<&str>) -> Result<(), String> {
    let now = append::iso_now();
    let pending: Vec<(String, String, Option<String>)> = {
        let sql = format!(
            "SELECT atome_id, particle_key, particle_value FROM particles
             WHERE particle_key IN ('_pending_owner_id', '_pending_parent_id'){}",
            if target.is_some() {
                " AND particle_value = ?1"
            } else {
                ""
            }
        );
        let mut statement = db.prepare(&sql).map_err(|e| e.to_string())?;
        let map = |row: &rusqlite::Row<'_>| Ok((row.get(0)?, row.get(1)?, row.get(2)?));
        let rows = match target {
            Some(target) => statement.query_map([intent::js_stringify(&json!(target))], map),
            None => statement.query_map([], map),
        }
        .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };
    for (atome_id, key, value) in pending {
        let parsed = match value.as_deref().map(serde_json::from_str::<JsonValue>) {
            Some(Ok(parsed)) => parsed,
            None => JsonValue::Null,
            // A pending reference that is not JSON stays pending.
            Some(Err(_)) => continue,
        };
        let pending_id = Some(parsed)
            .filter(js_truthy)
            .map(|id| canonical::js_string(&id))
            .filter(|id| id != "anonymous");
        let Some(pending_id) = pending_id else {
            delete_pending(db, &atome_id, &key)?;
            continue;
        };
        let exists = db
            .query_row(
                "SELECT 1 FROM atomes WHERE atome_id = ?1",
                [&pending_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_some();
        if !exists {
            continue;
        }
        let column = if key == "_pending_owner_id" {
            "owner_id"
        } else {
            "parent_id"
        };
        db.execute(
            &format!("UPDATE atomes SET {column} = ?1, updated_at = ?2 WHERE atome_id = ?3"),
            rusqlite::params![pending_id, now, atome_id],
        )
        .map_err(|e| e.to_string())?;
        update_state_reference(db, &atome_id, &key, &pending_id, &now)?;
        delete_pending(db, &atome_id, &key)?;
    }
    Ok(())
}
