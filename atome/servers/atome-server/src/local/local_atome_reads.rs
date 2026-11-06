//! `atome get` and `atome list`: the reads of atomes a person may see.
use super::*;

pub(super) async fn handle_get(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let atome_id = match message
        .get("atome_id")
        .or_else(|| message.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    if !can_read(&db, atome_id, user_id) {
        return error_response(request_id, "Access denied");
    }

    match load_atome(&db, atome_id, None) {
        Ok(atome) => WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: true,
            error: None,
            data: Some(serde_json::to_value(&atome).unwrap()),
            atomes: None,
            count: None,
        },
        Err(e) => error_response(request_id, &e),
    }
}

pub(super) async fn handle_list(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    // Canonical atome type field
    let atome_type = message
        .get("atome_type")
        .or_else(|| message.get("type"))
        .and_then(|v| v.as_str());
    let owner_id = message
        .get("owner_id")
        .or_else(|| message.get("user_id"))
        .and_then(|v| v.as_str());
    let parent_id = message
        .get("parent_id")
        .or_else(|| message.get("parent"))
        .and_then(|v| v.as_str());
    let include_deleted = message
        .get("include_deleted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let excluded_particle_keys: HashSet<String> = message
        .get("exclude_particle_keys")
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let limit = message.get("limit").and_then(|v| v.as_i64()).unwrap_or(100);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);

    let atome_list_debug_enabled = std::env::var("ATOME_LIST_DEBUG")
        .ok()
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "on"
        })
        .unwrap_or(false);
    if atome_list_debug_enabled {
        println!(
            "[Atome List Debug] atome_type={:?}, owner_id={:?}, user_id={}, includeDeleted={}",
            atome_type, owner_id, user_id, include_deleted
        );
    }

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Determine effective owner - if anonymous or not specified, query by type only
    // SPECIAL CASE: For atome_type = 'user', always query all users regardless of owner
    // SPECIAL CASE: If owner_id = "*" or "all", query all atomes regardless of owner (for sync)
    let effective_owner = match (owner_id, atome_type) {
        // Sync mode: "*" or "all" means list all atomes
        (Some("*"), _) | (Some("all"), _) => None,
        // For user listing, ignore owner filtering to get all users
        (_, Some("user")) => None,
        // If owner_id is explicitly provided (not "*" or "all"), use it
        (Some(id), _) if !id.is_empty() && id != "anonymous" => Some(id),
        // No owner_id provided - default to logged-in user
        (None, _) => Some(user_id),
        _ => None,
    };

    // Build query based on whether we have an owner or just a type
    let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (effective_owner, atome_type)
    {
        (Some(owner), atome_type) => {
            let mut query = String::from(
                "SELECT DISTINCT a.atome_id
                 FROM atomes a
                 LEFT JOIN permissions perm
                   ON perm.atome_id = a.atome_id
                  AND perm.principal_id = ?1
                  AND perm.can_read = 1
                  AND (perm.expires_at IS NULL OR perm.expires_at > datetime('now'))
                 WHERE (a.owner_id = ?2 OR a.creator_id = ?1 OR perm.permission_id IS NOT NULL
                   OR EXISTS (
                     SELECT 1 FROM particles p2
                     WHERE p2.atome_id = a.atome_id
                       AND p2.particle_key = '_pending_owner_id'
                       AND p2.particle_value = ?3
                   ))",
            );
            let pending_owner =
                serde_json::to_string(owner).unwrap_or_else(|_| format!("\"{}\"", owner));
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
                Box::new(owner.to_string()),
                Box::new(owner.to_string()),
                Box::new(pending_owner),
            ];
            if let Some(t) = atome_type {
                query.push_str(" AND a.atome_type = ?");
                params.push(Box::new(t.to_string()));
            }
            if let Some(parent) = parent_id {
                query.push_str(" AND a.parent_id = ?");
                params.push(Box::new(parent.to_string()));
            }
            if !include_deleted {
                query.push_str(" AND a.deleted_at IS NULL");
            }
            query.push_str(&format!(
                " ORDER BY a.updated_at DESC LIMIT {} OFFSET {}",
                limit, offset
            ));
            (query, params)
        }
        (None, Some(t)) => {
            if t == "user" {
                let mut query = String::from(
                    "SELECT DISTINCT a.atome_id
                     FROM atomes a
                     LEFT JOIN particles p
                       ON a.atome_id = p.atome_id
                      AND p.particle_key = 'visibility'
                     WHERE a.atome_type = 'user'
                       AND (p.particle_value IS NULL OR p.particle_value = '\"public\"')",
                );
                if !include_deleted {
                    query.push_str(" AND a.deleted_at IS NULL");
                }
                query.push_str(&format!(
                    " ORDER BY a.updated_at DESC LIMIT {} OFFSET {}",
                    limit, offset
                ));
                (query, Vec::new())
            } else {
                let mut query = String::from("SELECT DISTINCT a.atome_id FROM atomes a WHERE 1=1");
                let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
                query.push_str(" AND a.atome_type = ?");
                params.push(Box::new(t.to_string()));
                if let Some(parent) = parent_id {
                    query.push_str(" AND a.parent_id = ?");
                    params.push(Box::new(parent.to_string()));
                }
                if !include_deleted {
                    query.push_str(" AND a.deleted_at IS NULL");
                }
                query.push_str(&format!(
                    " ORDER BY a.updated_at DESC LIMIT {} OFFSET {}",
                    limit, offset
                ));
                (query, params)
            }
        }
        (None, None) => {
            return WsResponse {
                msg_type: "atome-response".into(),
                request_id,
                success: true,
                error: None,
                data: None,
                atomes: Some(Vec::new()),
                count: Some(0),
            };
        }
    };

    let mut stmt = match db.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let atome_ids: Vec<String> = stmt
        .query_map(params_refs.as_slice(), |row| row.get(0))
        .ok()
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();

    let mut atomes = Vec::new();
    for id in atome_ids {
        if let Some(owner) = effective_owner
            && !can_read(&db, &id, owner)
        {
            continue;
        }
        if let Ok(atome) = load_atome_with_deleted_excluding(
            &db,
            &id,
            None,
            include_deleted,
            &excluded_particle_keys,
        ) {
            atomes.push(atome);
        }
    }

    let count = atomes.len() as i64;

    WsResponse {
        msg_type: "atome-response".into(),
        request_id,
        success: true,
        error: None,
        data: None,
        atomes: Some(atomes),
        count: Some(count),
    }
}
