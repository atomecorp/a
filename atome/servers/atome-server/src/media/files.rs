// A person's files as server/userFiles.js reads them (`getFileMetadata`): an atome of the
// central database of a file type, its particles (JSON text) its metadata, the path its
// state names taking precedence.
use crate::social::news::db::{all, get, parsed, text};
use rusqlite::{Connection, ToSql};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

/// `FILE_ATOME_TYPES` (server/file_types.js).
const FILE_TYPES: &str = "('file', 'image', 'video', 'sound', 'audio_recording', 'video_recording', 'text', 'shape', 'midi', 'raw')";

fn found(db: &Connection, sql: &str, values: &[&dyn ToSql]) -> Result<Option<JsonValue>, String> {
    get(db, &sql.replace("FILE_TYPES", FILE_TYPES), values)
}

/// `getFileMetadata(identifier, { ownerId })`: by atome id, else (with an owner) by that
/// owner's file name then original name, else (without) by any file name.
pub fn metadata(
    db: &Connection,
    identifier: &str,
    owner: Option<&str>,
) -> Result<Option<JsonValue>, String> {
    let mut atome = found(
        db,
        "SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at FROM atomes a
         WHERE a.atome_id = ? AND a.atome_type IN FILE_TYPES AND a.deleted_at IS NULL",
        &[&identifier],
    )?;
    let named = json!(identifier).to_string();
    if atome.is_none() {
        atome = match owner {
            Some(owner) => {
                let by = |key: &str| {
                    found(
                        db,
                        &format!(
                            "SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at FROM atomes a
                             JOIN particles p ON a.atome_id = p.atome_id
                             WHERE p.particle_key = '{key}' AND p.particle_value = ? AND a.owner_id = ?
                             AND a.atome_type IN FILE_TYPES AND a.deleted_at IS NULL"
                        ),
                        &[&named, &owner],
                    )
                };
                match by("file_name")? {
                    Some(atome) => Some(atome),
                    None => by("original_name")?,
                }
            }
            None => found(
                db,
                "SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at FROM atomes a
                 JOIN particles p ON a.atome_id = p.atome_id
                 WHERE p.particle_key = 'file_name' AND p.particle_value = ?
                 AND a.atome_type IN FILE_TYPES AND a.deleted_at IS NULL",
                &[&named],
            )?,
        };
    }
    let Some(atome) = atome else { return Ok(None) };
    let id = text(atome.get("atome_id"));
    let mut meta = JsonMap::new();
    for key in ["atome_id", "atome_type", "owner_id", "created_at"] {
        meta.insert(key.into(), atome[key].clone());
    }
    for particle in all(
        db,
        "SELECT particle_key, particle_value FROM particles WHERE atome_id = ?",
        &[&id],
    )? {
        let value = match &particle["particle_value"] {
            JsonValue::String(raw) => serde_json::from_str(raw).unwrap_or_else(|_| json!(raw)),
            other => other.clone(),
        };
        meta.insert(text(particle.get("particle_key")), value);
    }
    if let Some(current) = get(
        db,
        "SELECT properties FROM state_current WHERE atome_id = ?",
        &[&id],
    )? {
        let properties = parsed(current.get("properties"), JsonValue::Null);
        if let Some(path) = properties
            .get("file_path")
            .and_then(JsonValue::as_str)
            .filter(|path| !path.trim().is_empty())
        {
            meta.insert("file_path".into(), json!(path));
        }
    }
    Ok(Some(JsonValue::Object(meta)))
}

/// Where a readable file lies (`resolveDownloadTarget` once its read is granted): the path its
/// metadata names in its owner's home, else its name in their `Downloads`.
pub struct Target {
    pub file_path: std::path::PathBuf,
    pub download_name: String,
}

// `readLegacyLocation` (server/principal_file_migration.js): `data/users/<id>/<rest>` in a path.
fn legacy_location(raw: &str) -> Option<(String, String)> {
    let normalized = crate::vault_router::js::trim(raw).replace('\\', "/");
    let normalized = match normalized.get(..7) {
        Some(scheme) if scheme.eq_ignore_ascii_case("file://") => normalized[7..].to_string(),
        _ => normalized,
    };
    let mut from = 0;
    while let Some(found) = normalized[from..].find("data/users/") {
        let at = from + found;
        if at == 0 || normalized.as_bytes()[at - 1] == b'/' {
            let rest = &normalized[at + "data/users/".len()..];
            if let Some((principal, path)) = rest.split_once('/')
                && !principal.is_empty()
                && !path.is_empty()
            {
                return Some((principal.to_string(), path.to_string()));
            }
        }
        from = at + 1;
    }
    None
}

pub(super) fn accessible(path: std::path::PathBuf) -> Result<std::path::PathBuf, String> {
    if path.exists() {
        Ok(path)
    } else {
        Err(format!(
            "ENOENT: no such file or directory, access '{}'",
            path.display()
        ))
    }
}

/// `resolveLegacyPrincipalAlias`: the account a legacy principal named in the file's path became.
pub fn legacy_alias(db: &Connection, meta: &JsonValue) -> Result<Option<String>, String> {
    let raw = crate::vault_router::js::first(meta, &["file_path", "filePath"])
        .map(crate::vault_router::js::string);
    let Some((legacy, _)) = raw.as_deref().and_then(legacy_location) else {
        return Ok(None);
    };
    let alias = get(
        db,
        "SELECT principal_id FROM principal_identity_aliases
         WHERE alias_kind = 'legacy_principal' AND alias_value = ? LIMIT 1",
        &[&legacy],
    )?;
    Ok(alias
        .map(|row| text(row.get("principal_id")))
        .filter(|principal| !principal.is_empty()))
}

/// Where `meta`'s file lies for `user`; `aliased` is the account its path's legacy principal
/// became (`legacy_alias`).
pub fn located(
    storage: &super::Storage,
    meta: &JsonValue,
    param: &str,
    user: &str,
    aliased: Option<&str>,
) -> Result<Target, String> {
    let blank = |key: &str| {
        meta.get(key)
            .and_then(JsonValue::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
    };
    let safe_name = blank("file_name").unwrap_or_else(|| {
        let original = meta
            .get("original_name")
            .filter(|name| crate::vault_router::js::truthy(Some(name)))
            .map(crate::vault_router::js::string)
            .unwrap_or_else(|| param.to_string());
        super::playback::sanitize_file_name(&original)
    });
    let download_name = blank("original_name").unwrap_or_else(|| safe_name.clone());
    let owner = Some(text(meta.get("owner_id")))
        .filter(|owner| !owner.is_empty())
        .unwrap_or_else(|| user.to_string());
    let raw = crate::vault_router::js::first(meta, &["file_path", "filePath"])
        .map(crate::vault_router::js::string);
    if let Some(raw) = raw {
        if let Some((legacy, _)) = legacy_location(&raw) {
            if user.trim().is_empty() || text(meta.get("owner_id")) != user.trim() {
                return Err("Access denied".into());
            }
            // A file still under a legacy principal's folder that became this account: Fastify's
            // one-time move (`reconcilePrincipalFilePath`) is decided with its identity migration
            // (L3.10); anyone else is refused.
            if legacy != user.trim() {
                return Err(if aliased == Some(user.trim()) {
                    "principal_file_migration_pending".into()
                } else {
                    "Access denied".into()
                });
            }
        }
        let relative = super::storage::normalize_user_relative_path(&raw, &owner);
        if !relative.is_empty() {
            let placed = storage.asset_path(&owner, &relative)?;
            return Ok(Target {
                file_path: accessible(placed.file_path)?,
                download_name,
            });
        }
    }
    let path = storage
        .downloads_file(&owner, &safe_name)
        .map_err(|e| e.to_string())?;
    Ok(Target {
        file_path: accessible(path)?,
        download_name,
    })
}
