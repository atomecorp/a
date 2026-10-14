//! OS routing/inbox storage is owned by the existing Axum auth boundary.
//! Kotlin cannot read/write the database or persist a competing account store.
use super::*;

pub(crate) fn notification_storage(root: &std::path::Path, command: &str, payload: JsonValue) -> Result<JsonValue, String> {
    if !root.is_absolute() || !root.join("squirrel/Data/adole.db").is_file() {
        return Err("notifications_account_unavailable".into());
    }
    let db = Connection::open_with_flags(root.join("squirrel/Data/adole.db"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| "notifications_storage_unavailable")?;
    db.busy_timeout(std::time::Duration::from_millis(1000)).map_err(|_| "notifications_storage_unavailable")?;
    let descriptor = device::describe_db(&json!({}), &db)?;
    let remote = &descriptor["localGrant"]["remoteSession"];
    let principal = remote["userId"].as_str().filter(|id| !id.is_empty());
    match command {
        "context" => Ok(json!({"ok":true,"context":principal.map(|id| json!({"principal_id":id,
            "session_id":remote["session"]["id"],"key_id":remote["session"]["keyId"]}))})),
        "installation" => {
            let id = Uuid::new_v4().to_string();
            db.execute("INSERT OR IGNORE INTO auth_os_installation VALUES ('fcm',?1)", [&id]).map_err(|_| "notifications_storage_unavailable")?;
            let id: String = db.query_row("SELECT installation_id FROM auth_os_installation WHERE provider='fcm'", [], |row| row.get(0))
                .map_err(|_| "notifications_storage_unavailable")?;
            Ok(json!({"ok":true,"id":id}))
        }
        "append" => {
            let principal = principal.ok_or("notifications_account_unavailable")?;
            if payload["principal_id"] != principal { return Err("notifications_account_changed".into()); }
            let id = payload["notification_id"].as_str().filter(|id| !id.is_empty() && id.len() <= 200).ok_or("notifications_payload_invalid")?;
            let action = payload["action"].as_str().filter(|action| matches!(*action,"open"|"answer"|"end"|"decline_or_end"))
                .ok_or("notifications_payload_invalid")?;
            let stored = json!({"notification_id":id,"action":action,"principal_id":principal,
                "room_id":payload["room_id"],"peer_id":payload["peer_id"],"expires_at":payload["expires_at"]});
            db.execute("INSERT OR IGNORE INTO auth_notification_inbox VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params![id,action,principal,stored.to_string(),Utc::now().timestamp_millis()]).map_err(|_| "notifications_storage_unavailable")?;
            db.execute("DELETE FROM auth_notification_inbox WHERE rowid NOT IN (SELECT rowid FROM auth_notification_inbox ORDER BY created_ms DESC LIMIT 32)", [])
                .map_err(|_| "notifications_storage_unavailable")?;
            Ok(json!({"ok":true}))
        }
        "take" => {
            let Some(principal) = principal else { return Ok(json!({"ok":true,"items":[]})); };
            let mut statement = db.prepare("SELECT payload FROM auth_notification_inbox WHERE principal_id=?1 ORDER BY created_ms")
                .map_err(|_| "notifications_storage_unavailable")?;
            let items: Vec<JsonValue> = statement.query_map([principal], |row| row.get::<_,String>(0)).map_err(|_| "notifications_storage_unavailable")?
                .map(|row| row.map_err(|_| "notifications_storage_unavailable").and_then(|text| serde_json::from_str(&text).map_err(|_| "notifications_payload_invalid")))
                .collect::<Result<_,_>>()?;
            Ok(json!({"ok":true,"items":items}))
        }
        "ack" => {
            if let Some(principal) = principal {
                db.execute("DELETE FROM auth_notification_inbox WHERE principal_id=?1 AND notification_id=?2 AND action=?3",
                    rusqlite::params![principal,payload["id"].as_str().unwrap_or_default(),payload["action"].as_str().unwrap_or_default()])
                    .map_err(|_| "notifications_storage_unavailable")?;
            }
            Ok(json!({"ok":true}))
        }
        "clear" => { db.execute("DELETE FROM auth_notification_inbox", []).map_err(|_| "notifications_storage_unavailable")?; Ok(json!({"ok":true})) }
        _ => Err("notifications_command_invalid".into())
    }
}
