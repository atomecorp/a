// The central database's permission flags (database/adole_permissions.js `checkPermissionFlag`,
// `canRead` and `canWrite`, ported): the atome's owner holds every flag, anyone else through a
// live `permissions` row granting it — the property's own row first, else the atome's — its
// Conditions matched; a property's read is then narrowed by its privacy rule
// (privacy_rules.rs `allows_read`). Consumers: the files' reads (media/downloads.rs), the `atome`
// reads and the `sync` acknowledgement of /ws/api.
use super::news::db::get;
use super::privacy_rules::{effective_owner, properties};
use atome_store::append::iso_now;
use atome_store::security::document_matches;
use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use rusqlite::Connection;
use serde_json::json;

// `new Date(text)`: an ISO instant, a date alone (UTC midnight), a date and time with no zone
// (local time); None where V8 reads NaN, a date that never expires.
fn instant(text: &str) -> Option<DateTime<Utc>> {
    if let Ok(instant) = DateTime::parse_from_rfc3339(text) {
        return Some(instant.with_timezone(&Utc));
    }
    if let Ok(date) = NaiveDate::parse_from_str(text, "%Y-%m-%d") {
        return Some(date.and_hms_opt(0, 0, 0)?.and_utc());
    }
    [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M",
    ]
    .iter()
    .find_map(|format| NaiveDateTime::parse_from_str(text, format).ok())
    .and_then(|local| Local.from_local_datetime(&local).earliest())
    .map(|local| local.with_timezone(&Utc))
}

/// `canRead(atomeId, principal, key)`: whether `principal` may read `atome_id` (one property of it
/// with `key`).
pub fn can_read(
    db: &Connection,
    atome_id: &str,
    principal: &str,
    key: Option<&str>,
) -> Result<bool, String> {
    if !flag(db, atome_id, principal, key, "can_read", "read")? {
        return Ok(false);
    }
    match key {
        Some(key) => super::privacy_rules::allows_read(db, atome_id, key, principal, "read"),
        None => Ok(true),
    }
}

/// `canWrite(atomeId, principal)`.
pub fn can_write(db: &Connection, atome_id: &str, principal: &str) -> Result<bool, String> {
    flag(db, atome_id, principal, None, "can_write", "write")
}

// `checkPermissionFlag(atomeId, principalId, particleKey, field, operationName)`.
fn flag(
    db: &Connection,
    atome_id: &str,
    principal: &str,
    key: Option<&str>,
    column: &str,
    operation: &str,
) -> Result<bool, String> {
    if effective_owner(db, atome_id)?.is_some_and(|owner| !owner.is_empty() && owner == principal) {
        return Ok(true);
    }
    let Some(permission) = get(
        db,
        &format!(
            "SELECT {column} AS flag, expires_at, conditions FROM permissions
             WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR particle_key IS NULL)
             ORDER BY particle_key DESC LIMIT 1"
        ),
        &[&atome_id, &principal, &key],
    )?
    else {
        return Ok(false);
    };
    if permission["flag"].as_f64() != Some(1.0) {
        return Ok(false);
    }
    if let Some(expiry) = permission["expires_at"]
        .as_str()
        .filter(|text| !text.is_empty())
        .and_then(instant)
        && Utc::now() > expiry
    {
        return Ok(false);
    }
    let Some(conditions) = permission["conditions"]
        .as_str()
        .filter(|conditions| !conditions.is_empty())
    else {
        return Ok(true);
    };
    let reader = if principal.is_empty() {
        json!({})
    } else {
        properties(db, principal)?
    };
    let context = json!({
        "time": { "now": iso_now() },
        "user": reader,
        "atome": if atome_id.is_empty() { json!({}) } else { properties(db, atome_id)? },
        "actor": { "id": principal },
        "operation": { "name": operation, "property": key },
        "property": { "key": key }
    });
    Ok(document_matches(conditions, &context))
}
