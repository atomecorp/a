// The account of a principal as server/auth_users.js reads it (`findUserById`,
// `findUserByPhone`) and its verified number replaced (`replaceVerifiedPhone`): its
// user atome in the central database, its particles (JSON text), its verified phone.
// Fastify ran its legacy phone-principal migration before each such read
// (`ensureOpaquePrincipalIdentity`); that one-time data migration runs once on the
// production copy before the cutover (todo/refonte_rust_etape3_axum.md, L3.10).
use crate::vault_router::central::row_json;
use atome_store::append::iso_now;
use rusqlite::{Connection, OptionalExtension};
use serde_json::{Value as JsonValue, json};

fn particle(row: &JsonValue, key: &str) -> Result<Option<JsonValue>, String> {
    match row
        .get(key)
        .and_then(JsonValue::as_str)
        .filter(|text| !text.is_empty())
    {
        Some(text) => serde_json::from_str(text)
            .map(Some)
            .map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

pub fn phone_of(db: &Connection, principal: &str) -> Result<Option<String>, String> {
    db.query_row(
        "SELECT normalized_phone FROM principal_phone_credentials
         WHERE principal_id = ? AND revoked_at IS NULL ORDER BY credential_id DESC LIMIT 1",
        [principal],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(|phone| phone.flatten().filter(|phone| !phone.is_empty()))
    .map_err(|e| e.to_string())
}

/// The live account `principal`, or None.
pub fn find_by_id(db: &Connection, principal: &str) -> Result<Option<JsonValue>, String> {
    let row = db
        .query_row(
            "SELECT a.atome_id as user_id, a.atome_type, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility,
                MAX(CASE WHEN p.particle_key = 'first_launch_version' THEN p.particle_value END) AS first_launch_version
             FROM atomes a
             LEFT JOIN particles p ON a.atome_id = p.atome_id
             WHERE a.atome_id = ? AND a.atome_type = 'user' AND a.deleted_at IS NULL
             GROUP BY a.atome_id",
            [principal],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Ok(None);
    };
    let user_id = row["user_id"].as_str().unwrap_or_default().to_string();
    Ok(Some(json!({
        "user_id": user_id,
        "username": particle(&row, "username")?,
        "phone": phone_of(db, &user_id)?,
        "visibility": particle(&row, "visibility")?.unwrap_or_else(|| json!("private")),
        "first_launch_version": particle(&row, "first_launch_version")?,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "last_sync": row["last_sync"],
        "created_source": row["created_source"],
    })))
}

/// The public accounts, newest first (`listAllUsers`): no phone ever listed.
pub fn list_public(db: &Connection) -> Result<Vec<JsonValue>, String> {
    let mut statement = db
        .prepare(
            "SELECT a.atome_id as user_id, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility
             FROM atomes a
             LEFT JOIN particles p ON a.atome_id = p.atome_id
             WHERE a.atome_type = 'user' AND a.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM particles pv WHERE pv.atome_id = a.atome_id AND pv.particle_key = 'visibility'
                 AND pv.particle_value = '\"public\"')
             GROUP BY a.atome_id
             ORDER BY a.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], row_json)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    rows.iter()
        .map(|row| {
            Ok(json!({
                "user_id": row["user_id"],
                "username": particle(row, "username")?,
                "phone": null,
                "visibility": particle(row, "visibility")?.unwrap_or_else(|| json!("private")),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "last_sync": row["last_sync"],
                "created_source": row["created_source"],
            }))
        })
        .collect()
}

/// `revokeVerifiedPhone`: the account's live numbers end, with the reason.
pub fn revoke_phone(
    db: &Connection,
    principal: &str,
    reason: &str,
    now: &str,
) -> Result<(), String> {
    db.execute(
        "UPDATE principal_phone_credentials SET revoked_at = ?, revoked_reason = ?, updated_at = ?
         WHERE principal_id = ? AND revoked_at IS NULL",
        rusqlite::params![now, reason, now, principal],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// `deleteUserAtome`: the user atome deleted, its number released.
pub fn delete(db: &Connection, principal: &str, now: &str) -> Result<(), String> {
    db.execute(
        "UPDATE atomes SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE atome_id = ?",
        rusqlite::params![now, now, principal],
    )
    .map_err(|e| e.to_string())?;
    revoke_phone(db, principal, "account_deleted", now)
}

/// The live account holding the verified number `phone` (E.164), or None
/// (`findPrincipalByPhone`).
pub fn find_by_phone(db: &Connection, phone: &str) -> Result<Option<JsonValue>, String> {
    let row = db
        .query_row(
            "SELECT a.atome_id AS user_id, a.atome_type, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility
             FROM principal_phone_credentials c
             JOIN atomes a ON a.atome_id = c.principal_id
             LEFT JOIN particles p ON p.atome_id = a.atome_id
             WHERE c.normalized_phone = ? AND c.revoked_at IS NULL
               AND a.atome_type = 'user' AND a.deleted_at IS NULL
             GROUP BY a.atome_id",
            [phone],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(mut row) = row else {
        return Ok(None);
    };
    row["phone"] = json!(phone);
    row["username"] = particle(&row, "username")?.unwrap_or(JsonValue::Null);
    row["visibility"] = particle(&row, "visibility")?.unwrap_or_else(|| json!("private"));
    Ok(Some(row))
}

/// `assignVerifiedPhone`: `phone` (E.164) becomes the account's verified number.
fn assign_phone(db: &Connection, principal: &str, phone: &str, now: &str) -> Result<(), String> {
    let holder = db
        .query_row(
            "SELECT principal_id FROM principal_phone_credentials WHERE normalized_phone = ? AND revoked_at IS NULL LIMIT 1",
            [phone],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match holder {
        Some(holder) if holder != principal => Err("phone_credential_already_assigned".into()),
        Some(_) => Ok(()),
        None => db
            .execute(
                "INSERT INTO principal_phone_credentials (principal_id, normalized_phone, verified_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)",
                rusqlite::params![principal, phone, now, now, now],
            )
            .map(drop)
            .map_err(|e| e.to_string()),
    }
}

/// `replaceVerifiedPhone`: the live account's number becomes `phone`.
pub fn replace_phone(db: &Connection, principal: &str, phone: &str) -> Result<(), String> {
    let live = db
        .prepare("SELECT atome_id FROM atomes WHERE atome_id = ? AND atome_type = 'user' AND deleted_at IS NULL")
        .and_then(|mut statement| statement.exists([principal]))
        .map_err(|e| e.to_string())?;
    if !live {
        return Err("principal_not_found".into());
    }
    revoke_phone(db, principal, "credential_changed", &iso_now())?;
    assign_phone(db, principal, phone, &iso_now())
}

// `RESERVED_USER_PARTICLE_KEYS` (server/auth_user_particles.js).
const RESERVED_USER_PARTICLE_KEYS: [&str; 18] = [
    "id",
    "atome_id",
    "user_id",
    "type",
    "kind",
    "owner_id",
    "creator_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "sync_status",
    "last_sync",
    "password_hash",
    "phone",
    "username",
    "visibility",
    "access",
    "auth_refresh_sessions",
];

/// `createUserAtome` for an id no atome holds: the account atome, its username, visibility
/// and access (`updateUserParticle`, authored by it), its verified number when it has one,
/// and its state (`upsertUserStateCurrent`). Fastify's branches for an id already held (a
/// deleted account reactivated, a mistyped one repaired) serve its sign-up alone, still
/// Fastify's: an id already held is refused here as Fastify refuses a live account.
pub fn create(
    db: &Connection,
    principal: &str,
    username: &str,
    phone: Option<&str>,
    visibility: &str,
    optional: &JsonValue,
) -> Result<JsonValue, String> {
    let held = db
        .query_row(
            "SELECT atome_id FROM atomes WHERE atome_id = ?",
            [principal],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if held.is_some() {
        return Err("User already exists".into());
    }
    let now = iso_now();
    let visibility = if visibility.to_lowercase() == "public" {
        "public"
    } else {
        "private"
    };
    db.execute(
        "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, sync_status, created_source, created_at, updated_at)
         VALUES (?1, 'user', ?1, ?1, 'local', 'fastify', ?2, ?2)",
        rusqlite::params![principal, now],
    )
    .map_err(|e| e.to_string())?;
    // `normalizeUserOptional`: the account's other first particles (`first_launch_version`),
    // never one of its reserved keys.
    let optional: Vec<(&String, &JsonValue)> = optional
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(key, _)| !key.is_empty() && !RESERVED_USER_PARTICLE_KEYS.contains(&key.as_str()))
        .collect();
    let base = [
        ("username", json!(username)),
        ("visibility", json!(visibility)),
        ("access", json!(visibility)),
    ];
    let particles = base
        .iter()
        .map(|(key, value)| (*key, value))
        .chain(optional.iter().map(|(key, value)| (key.as_str(), *value)));
    for (key, value) in particles {
        atome_store::particles::set_particle(
            db,
            principal,
            key,
            Some(value),
            Some(principal),
            &iso_now(),
            None,
        )?;
    }
    if let Some(phone) = phone {
        assign_phone(db, principal, phone, &now)?;
    }
    let mut props = json!({ "type": "user", "username": username, "visibility": visibility, "access": visibility });
    for (key, value) in optional {
        props[key.as_str()] = value.clone();
    }
    let event = json!({ "atome_id": principal, "kind": "set", "ts": now, "payload": { "props": props },
        "actor": { "type": "user", "id": principal } });
    let options = atome_store::append::AppendOptions {
        source: None,
        tx_id: None,
        conflict_mode: atome_store::append::ConflictMode::Interactive,
        stored_truth: false,
    };
    atome_store::append::append_events(db, &[event], &options)?;
    Ok(
        json!({ "user_id": principal, "username": username, "phone": phone,
        "created_at": now, "created_source": "fastify" }),
    )
}
