//! Transfer of a guest workspace to its account (`atome transfer-owner`): the rows
//! re-owned and the guest's downloads moved.
use super::*;

fn move_guest_downloads(
    storage_root: &Path,
    from_owner_id: &str,
    to_owner_id: &str,
) -> Result<(), String> {
    let source_root = storage_root
        .join("data")
        .join("users")
        .join(from_owner_id)
        .join("Downloads");
    let target_root = storage_root
        .join("data")
        .join("users")
        .join(to_owner_id)
        .join("Downloads");
    let mut pending = vec![(source_root.clone(), target_root.clone())];
    while let Some((source_dir, target_dir)) = pending.pop() {
        let entries = match std::fs::read_dir(&source_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        std::fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|error| error.to_string())?;
            let source_path = entry.path();
            let target_path = target_dir.join(entry.file_name());
            let kind = entry.file_type().map_err(|error| error.to_string())?;
            if kind.is_dir() {
                pending.push((source_path, target_path));
                continue;
            }
            if !kind.is_file() {
                return Err("guest_adoption_file_invalid".to_string());
            }
            match std::fs::metadata(&target_path) {
                Ok(_) => return Err("guest_adoption_file_collision".to_string()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            }
            std::fs::rename(&source_path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub(super) async fn handle_transfer_owner(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let from_owner_id = message
        .get("fromOwnerId")
        .or_else(|| message.get("from_owner_id"))
        .or_else(|| message.get("fromOwner"))
        .and_then(|v| v.as_str());
    let to_owner_id = message
        .get("toOwnerId")
        .or_else(|| message.get("to_owner_id"))
        .or_else(|| message.get("toOwner"))
        .and_then(|v| v.as_str());
    let include_creator = message
        .get("includeCreator")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let adoption_confirmed = message
        .get("adoption_confirmed")
        .or_else(|| message.get("adoptionConfirmed"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let adoption_operation = message
        .get("operation_id")
        .or_else(|| message.get("operationId"))
        .and_then(|v| v.as_str())
        .filter(|value| !value.trim().is_empty());

    let from_owner_id = match from_owner_id {
        Some(id) if !id.is_empty() => id,
        _ => return error_response(request_id, "Missing from_owner_id"),
    };
    let to_owner_id = match to_owner_id {
        Some(id) if !id.is_empty() => id,
        _ => return error_response(request_id, "Missing to_owner_id"),
    };

    if to_owner_id != user_id {
        return error_response(
            request_id,
            "Access denied - target owner must be current user",
        );
    }

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let source_is_guest = is_guest_workspace_or_adopted_principal(&db, from_owner_id);
    let guest_workspace = from_owner_id != user_id && source_is_guest;
    if from_owner_id != user_id && !guest_workspace {
        return error_response(
            request_id,
            "Access denied - source owner must be an active guest workspace",
        );
    }
    if guest_workspace && !adoption_confirmed {
        return error_response(request_id, "guest_adoption_confirmation_required");
    }
    if guest_workspace && !adoption_operation.is_some_and(is_uuid_v4) {
        return error_response(request_id, "guest_adoption_operation_required");
    }
    if guest_workspace {
        let existing = db
            .query_row(
                "SELECT status, adopted_principal_id FROM guest_workspace_principals
             WHERE guest_principal_id = ?1 AND adoption_operation_digest = ?2",
                rusqlite::params![from_owner_id, adoption_operation],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional();
        match existing {
            Ok(Some((status, adopted_principal_id))) if status == "adopted" => {
                if adopted_principal_id.as_deref() != Some(to_owner_id) {
                    return error_response(request_id, "guest_adoption_operation_conflict");
                }
                let storage_root = state.storage_root.clone();
                drop(db);
                if let Err(error) = move_guest_downloads(&storage_root, from_owner_id, to_owner_id)
                {
                    return error_response(request_id, &error);
                }
                return WsResponse {
                    msg_type: "atome-response".into(),
                    request_id,
                    success: true,
                    error: None,
                    data: Some(json!({ "updated": 0, "replayed": true, "adopted": true })),
                    atomes: None,
                    count: Some(0),
                };
            }
            Ok(_) => {}
            Err(error) => return error_response(request_id, &error.to_string()),
        }
    }

    let pending_owner =
        serde_json::to_string(from_owner_id).unwrap_or_else(|_| format!("\"{}\"", from_owner_id));

    let mut query = String::from(
        "SELECT DISTINCT a.atome_id
         FROM atomes a
         LEFT JOIN particles p
           ON p.atome_id = a.atome_id
          AND p.particle_key = '_pending_owner_id'
         WHERE a.atome_type NOT IN ('user', 'guest_workspace')
           AND (a.owner_id = ?1",
    );
    if include_creator {
        query.push_str(" OR a.creator_id = ?1");
    }
    query.push_str(" OR (a.owner_id IS NULL AND p.particle_value = ?2))");

    let mut ids: Vec<String> = Vec::new();
    if let Ok(mut stmt) = db.prepare(&query) {
        let rows = stmt.query_map(rusqlite::params![from_owner_id, pending_owner], |row| {
            row.get::<_, String>(0)
        });
        if let Ok(rows) = rows {
            for row in rows.flatten() {
                ids.push(row);
            }
        }
    }

    if ids.is_empty() {
        if guest_workspace {
            if let Err(error) = with_transaction(&db, |tx| {
                tx.execute(
                    "UPDATE guest_workspace_principals SET status = 'adopted', adopted_principal_id = ?1,
                     adoption_operation_digest = ?2, adopted_at = ?3
                     WHERE guest_principal_id = ?4 AND status = 'active'",
                    rusqlite::params![to_owner_id, adoption_operation, Utc::now().to_rfc3339(), from_owner_id],
                ).map_err(|error| error.to_string())?;
                Ok(())
            }) {
                return error_response(request_id, &error);
            }
            let storage_root = state.storage_root.clone();
            drop(db);
            if let Err(error) = move_guest_downloads(&storage_root, from_owner_id, to_owner_id) {
                return error_response(request_id, &error);
            }
        }
        return WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: true,
            error: None,
            data: Some(json!({ "updated": 0, "project_id": null })),
            atomes: None,
            count: Some(0),
        };
    }

    let now = Utc::now().to_rfc3339();
    let placeholders = vec!["?"; ids.len()].join(", ");
    let mut project_ids = HashSet::new();
    if let Ok(mut stmt) = db.prepare(&format!(
        "SELECT DISTINCT project_id FROM state_current WHERE atome_id IN ({}) AND project_id IS NOT NULL",
        placeholders
    )) {
        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        if let Ok(rows) = stmt.query_map(params.as_slice(), |row| row.get::<_, String>(0)) {
            for row in rows.flatten() {
                if !row.trim().is_empty() {
                    project_ids.insert(row);
                }
            }
        }
    }
    let recovered_project_id = if project_ids.len() == 1 {
        project_ids.iter().next().cloned()
    } else {
        None
    };

    let result = with_transaction(&db, |tx| {
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::with_capacity(4 + ids.len());
        params.push(Box::new(to_owner_id.to_string()));
        params.push(Box::new(if include_creator { 1 } else { 0 }));
        params.push(Box::new(to_owner_id.to_string()));
        params.push(Box::new(now.clone()));
        for id in &ids {
            params.push(Box::new(id.clone()));
        }
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        tx.execute(
            &format!(
                "UPDATE atomes SET owner_id = ?, creator_id = CASE WHEN ? THEN ? ELSE creator_id END,
                 updated_at = ?, sync_status = 'pending' WHERE atome_id IN ({})",
                placeholders
            ),
            params_refs.as_slice(),
        )
        .map_err(|e| e.to_string())?;

        let mut params_state: Vec<Box<dyn rusqlite::ToSql>> = Vec::with_capacity(2 + ids.len());
        params_state.push(Box::new(to_owner_id.to_string()));
        params_state.push(Box::new(now.clone()));
        for id in &ids {
            params_state.push(Box::new(id.clone()));
        }
        let params_state_refs: Vec<&dyn rusqlite::ToSql> =
            params_state.iter().map(|p| p.as_ref()).collect();
        tx.execute(
            &format!(
                "UPDATE state_current SET owner_id = ?, updated_at = ? WHERE atome_id IN ({})",
                placeholders
            ),
            params_state_refs.as_slice(),
        )
        .map_err(|e| e.to_string())?;

        if guest_workspace {
            tx.execute(
                "UPDATE permissions SET principal_id = ?1 WHERE principal_id = ?2",
                rusqlite::params![to_owner_id, from_owner_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE permissions SET granted_by = ?1 WHERE granted_by = ?2",
                rusqlite::params![to_owner_id, from_owner_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE guest_workspace_principals SET status = 'adopted', adopted_principal_id = ?1,
                 adoption_operation_digest = ?2, adopted_at = ?3
                 WHERE guest_principal_id = ?4 AND status = 'active'",
                rusqlite::params![to_owner_id, adoption_operation, now, from_owner_id],
            ).map_err(|e| e.to_string())?;
        }

        let mut params_particles: Vec<Box<dyn rusqlite::ToSql>> = Vec::with_capacity(ids.len());
        for id in &ids {
            params_particles.push(Box::new(id.clone()));
        }
        let params_particles_refs: Vec<&dyn rusqlite::ToSql> =
            params_particles.iter().map(|p| p.as_ref()).collect();
        tx.execute(
            &format!(
                "DELETE FROM particles WHERE particle_key = '_pending_owner_id' AND atome_id IN ({})",
                placeholders
            ),
            params_particles_refs.as_slice(),
        )
        .map_err(|e| e.to_string())?;

        if let Some(project_id) = recovered_project_id.as_ref() {
            for key in ["currentProjectId", "current_project_id"] {
                let value_json = serde_json::to_string(project_id).unwrap_or_default();
                tx.execute(
                    "INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, 'string', 1, ?4, ?4)
                     ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                        particle_value = excluded.particle_value,
                        value_type = excluded.value_type,
                        version = version + 1,
                        updated_at = excluded.updated_at",
                    rusqlite::params![to_owner_id, key, value_json, now],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    });

    if let Err(err) = result {
        return error_response(request_id, &err);
    }
    if guest_workspace {
        let storage_root = state.storage_root.clone();
        drop(db);
        if let Err(error) = move_guest_downloads(&storage_root, from_owner_id, to_owner_id) {
            return error_response(request_id, &error);
        }
    }
    WsResponse {
        msg_type: "atome-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(json!({ "updated": ids.len(), "project_id": recovered_project_id })),
        atomes: None,
        count: Some(ids.len() as i64),
    }
}
