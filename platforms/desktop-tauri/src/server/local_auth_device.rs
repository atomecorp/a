use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[cfg(test)]
#[path = "../../../../tests/native/local_auth_device.rs"]
mod tests;

pub(super) fn ensure_schema(state: &LocalAuthState) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "local_database_unavailable")?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS auth_local_grants (
            grant_id TEXT PRIMARY KEY, local_principal TEXT NOT NULL, remote_principal TEXT NOT NULL,
            key_id TEXT NOT NULL, key_scope TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
            locked INTEGER NOT NULL DEFAULT 0, UNIQUE(remote_principal, key_id));
         CREATE TABLE IF NOT EXISTS auth_local_challenges (
            challenge_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL, purpose TEXT NOT NULL,
            reference_id TEXT NOT NULL, nonce TEXT NOT NULL, issued_ms INTEGER NOT NULL,
            expires_ms INTEGER NOT NULL, consumed_ms INTEGER);
         CREATE TABLE IF NOT EXISTS auth_os_installation (
            provider TEXT PRIMARY KEY, installation_id TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS auth_notification_inbox (
            notification_id TEXT NOT NULL, action TEXT NOT NULL, principal_id TEXT NOT NULL,
            payload TEXT NOT NULL, created_ms INTEGER NOT NULL,
            PRIMARY KEY(notification_id,action,principal_id));"
    ).map_err(|_| "local_auth_schema_unavailable".to_string())?;
    let mut statement = db.prepare("PRAGMA table_info(auth_local_grants)").map_err(|_| "local_auth_schema_unavailable")?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1)).map_err(|_| "local_auth_schema_unavailable")?
        .collect::<Result<Vec<_>, _>>().map_err(|_| "local_auth_schema_unavailable")?;
    for (name, kind) in [("remote_session_id", "TEXT"), ("remote_session_generation", "INTEGER")] {
        if !columns.iter().any(|column| column == name) {
            db.execute_batch(&format!("ALTER TABLE auth_local_grants ADD COLUMN {name} {kind}"))
                .map_err(|_| "local_auth_schema_unavailable")?;
        }
    }
    Ok(())
}

fn field<'a>(message: &'a JsonValue, name: &str) -> Result<&'a str, String> {
    message[name]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "auth_request_invalid".into())
}

fn key_id(message: &JsonValue) -> Result<&str, String> {
    let value = field(message, "keyId")?;
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("auth_request_invalid".into());
    }
    Ok(value)
}

fn auth_authority_ws_url() -> Result<String, String> {
    let base = std::env::var("SQUIRREL_FASTIFY_URL")
        .or_else(|_| std::env::var("FASTIFY_URL"))
        .unwrap_or_else(|_| "https://atome.one".into());
    let trimmed = base.trim().trim_end_matches('/');
    let websocket = if let Some(rest) = trimmed.strip_prefix("https://") {
        format!("wss://{rest}/ws/api")
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        format!("ws://{rest}/ws/api")
    } else {
        return Err("auth_remote_configuration_invalid".into());
    };
    Ok(websocket)
}

// The process environment selects the authority; untrusted JS cannot supply a
// verification server or result. Production defaults to the TLS endpoint.
async fn remote(mut message: JsonValue) -> Result<JsonValue, String> {
    let request_id = Uuid::new_v4().to_string();
    message["requestId"] = json!(request_id);
    message["type"] = json!("auth");
    let authority = auth_authority_ws_url()?;
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        let (mut socket, _) = connect_async(authority)
            .await
            .map_err(|_| "auth_remote_unavailable")?;
        socket
            .send(Message::Text(message.to_string()))
            .await
            .map_err(|_| "auth_remote_unavailable")?;
        while let Some(frame) = socket.next().await {
            let frame = frame.map_err(|_| "auth_remote_unavailable")?;
            if let Message::Text(text) = frame {
                let response: JsonValue =
                    serde_json::from_str(&text).map_err(|_| "auth_remote_response_invalid")?;
                if response["requestId"] != request_id {
                    continue;
                }
                if response["type"] != "auth-response" || response["ok"] != true {
                    return Err("auth_remote_proof_rejected");
                }
                socket
                    .close(None)
                    .await
                    .map_err(|_| "auth_remote_unavailable")?;
                return Ok(response);
            }
        }
        Err("auth_remote_unavailable")
    })
    .await
    .map_err(|_| "auth_remote_unavailable".to_string())?
    .map_err(String::from)
}

pub(super) async fn handle(
    message: &JsonValue,
    state: &LocalAuthState,
) -> Result<JsonValue, String> {
    match field(message, "action")? {
        "local-link-challenge" => {
            field(message, "scope")?;
            let key_id = key_id(message)?;
            let response = remote(json!({"action":"session-challenge", "purpose":"local-bind",
                "sessionId":message["sessionId"],"generation":message["generation"]}))
            .await?;
            if response["challenge"]["keyId"] != key_id {
                return Err("auth_device_binding_mismatch".into());
            }
            Ok(json!({"ok":true,"challenge":response["challenge"]}))
        }
        "local-link-complete" => {
            let scope = field(message, "scope")?;
            let key_id = key_id(message)?;
            let response = remote(json!({"action":"session-local-bind", "sessionId":message["sessionId"],
                "generation":message["generation"],"challengeId":message["challengeId"],"signature":message["signature"]})).await?;
            if response["keyId"] != key_id {
                return Err("auth_device_binding_mismatch".into());
            }
            let session_id = field(message, "sessionId")?;
            let generation = message["generation"].as_i64().filter(|value| *value >= 0).ok_or("auth_request_invalid")?;
            bind(state, &response["user"], scope, &key_id, session_id, generation)
        }
        "local-session-describe" => describe(message, state),
        "local-session-challenge" => challenge(message, state),
        "local-session-resume" | "local-session-lock" => consume(message, state),
        _ => Err("auth_request_invalid".into()),
    }
}

fn describe(message: &JsonValue, state: &LocalAuthState) -> Result<JsonValue, String> {
    let db = state.db.lock().map_err(|_| "local_database_unavailable")?;
    describe_db(message, &db)
}

pub(super) fn describe_db(message: &JsonValue, db: &Connection) -> Result<JsonValue, String> {
    let requested = message["grantId"]
        .as_str()
        .filter(|value| !value.is_empty());
    let select = |sql: &str, parameter: &str| {
        db.query_row(sql, [parameter], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?))
        })
        .optional()
        .map_err(|_| "local_database_unavailable".to_string())
    };
    let condition = if message["includeLocked"] == true { "1=1" } else { "locked=0" };
    let columns = "grant_id,local_principal,key_id,key_scope,generation,remote_principal,remote_session_id,remote_session_generation,locked";
    let row: Option<(String,String,String,String,i64,String,Option<String>,Option<i64>,i64)> = match requested {
        Some(grant) => select(&format!("SELECT {columns} FROM auth_local_grants WHERE grant_id=?1 AND {condition}"), grant)?,
        None => None,
    }.or(select(&format!("SELECT {columns} FROM auth_local_grants WHERE {condition} AND ?1='' ORDER BY rowid DESC LIMIT 1"), "")?);
    let Some((grant, principal, key_id, scope, generation, remote_principal, remote_id, remote_generation, locked)) = row else {
        return Ok(json!({"ok":true,"localGrant":null}));
    };
    let user = super::user(&db, &principal)?;
    let remote_session = remote_id.as_ref().filter(|id| !id.is_empty()).map(|id| json!({"phone":user["phone"],
        "userId":remote_principal,"session":{"id":id,"generation":remote_generation.unwrap_or(0),"keyId":key_id}}));
    Ok(
        json!({"ok":true,"localGrant":{"remoteSession":remote_session,"remoteSessionKnown":remote_id.is_some(),
        "remotePrincipal":remote_principal,"phone":user["phone"],"keyId":key_id,
        "scope":scope,"user":user,"localSession":{"id":grant,"generation":generation},"locked":locked != 0}}),
    )
}

fn bind(
    state: &LocalAuthState,
    remote_user: &JsonValue,
    scope: &str,
    key_id: &str,
    remote_session_id: &str,
    remote_session_generation: i64,
) -> Result<JsonValue, String> {
    let remote_id = field(remote_user, "id")?;
    // Accounts of authentication V1 carry no phone: the remote principal alone identifies them.
    let phone = remote_user.get("phone").and_then(JsonValue::as_str).unwrap_or("");
    let username = field(remote_user, "username")?;
    let (grant, principal, generation) = {
        let mut db = state.db.lock().map_err(|_| "local_database_unavailable")?;
        let tx = db.transaction().map_err(|_| "local_database_unavailable")?;
        let previous_remote: Option<(Option<String>, Option<i64>)> = tx.query_row(
            "SELECT remote_session_id,remote_session_generation FROM auth_local_grants WHERE remote_principal=?1 AND key_id=?2",
            rusqlite::params![remote_id,key_id], |row| Ok((row.get(0)?,row.get(1)?))).optional().map_err(|_| "local_database_unavailable")?;
        if previous_remote.as_ref().is_some_and(|(id, generation)| id.as_deref() == Some(remote_session_id)
            && generation.unwrap_or(-1) > remote_session_generation) { return Err("auth_session_stale".into()); }
        let existing: Option<(String, String, i64)> = tx.query_row(
            "SELECT grant_id, local_principal, generation FROM auth_local_grants WHERE remote_principal = ?1 AND key_id = ?2",
            rusqlite::params![remote_id, key_id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|_| "local_database_unavailable")?;
        let grant = existing
            .as_ref()
            .map(|v| v.0.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let generation = existing.as_ref().map(|v| v.2 + 1).unwrap_or(0);
        let principal = if let Some(value) = existing {
            value.1
        } else if let Some((id, _, deleted)) = if phone.is_empty() { None } else { accounts::find_user_record_by_phone(&tx, phone)? } {
            if deleted.is_some() {
                return Err("local_account_unavailable".into());
            }
            id
        } else {
            Uuid::new_v4().to_string()
        };
        let other: bool = tx.query_row("SELECT 1 FROM auth_local_grants WHERE local_principal = ?1 AND remote_principal != ?2 AND locked=0 LIMIT 1",
            rusqlite::params![principal,remote_id], |_| Ok(true)).optional().map_err(|_| "local_database_unavailable")?.unwrap_or(false);
        let old_binding: bool = tx.query_row("SELECT 1 FROM remote_sync_stream_cursors WHERE local_user_id=?1 AND remote_user_id!=?2 LIMIT 1",
            rusqlite::params![principal,remote_id], |_| Ok(true)).optional().map_err(|_| "local_database_unavailable")?.unwrap_or(false);
        // This local account already proved this very remote identity (a grant,
        // even locked, exists): coming back to it after another server's binding
        // (a development server's principal for the same phone) is no identity change.
        let proven_before: bool = tx.query_row("SELECT 1 FROM auth_local_grants WHERE local_principal = ?1 AND remote_principal = ?2 LIMIT 1",
            rusqlite::params![principal,remote_id], |_| Ok(true)).optional().map_err(|_| "local_database_unavailable")?.unwrap_or(false);
        if other || old_binding {
            // A local development server can be recreated while the durable
            // Tauri workspace remains. The same verified phone then receives a
            // new opaque remote principal. In mock mode, or when returning to an
            // identity this account already proved, retire the stale grant and
            // reset remote projection metadata; local atomes and files remain
            // untouched. A never-seen identity is still rejected in production.
            if !proven_before && std::env::var("SQUIRREL_AUTH_SMS_MOCK").as_deref() != Ok("1") {
                return Err("local_account_binding_conflict".into());
            }
            tx.execute(
                "UPDATE auth_local_grants SET locked=1, generation=generation+1
                 WHERE local_principal=?1 AND remote_principal!=?2 AND locked=0",
                rusqlite::params![principal, remote_id],
            )
            .map_err(|_| "local_account_write_failed")?;
            tx.execute(
                "DELETE FROM remote_sync_stream_cursors WHERE local_user_id=?1",
                [principal.as_str()],
            )
            .map_err(|_| "local_account_write_failed")?;
            tx.execute(
                "DELETE FROM remote_projection_access WHERE local_user_id=?1",
                [principal.as_str()],
            )
            .map_err(|_| "local_account_write_failed")?;
        }
        let now = Utc::now().to_rfc3339();
        let inserted = tx.execute("INSERT OR IGNORE INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at, created_source, sync_status)
            VALUES (?1,'user',?1,?1,?2,?2,'tauri','pending')", rusqlite::params![principal,now]).map_err(|_| "local_account_write_failed")?;
        if !phone.is_empty() { accounts::assign_verified_phone(&tx, &principal, phone, &now)?; }
        if inserted > 0 {
            accounts::upsert_required_user_particles(&tx, &principal, username, "private", &now)?;
            accounts::upsert_user_state_current(
                &tx,
                &principal,
                username,
                phone,
                "private",
                &now,
                &JsonMap::new(),
            )?;
        }
        tx.execute("INSERT INTO auth_local_grants (grant_id,local_principal,remote_principal,key_id,key_scope,generation,locked,remote_session_id,remote_session_generation) VALUES (?1,?2,?3,?4,?5,?6,0,?7,?8)
            ON CONFLICT(remote_principal,key_id) DO UPDATE SET locked=0,generation=excluded.generation,remote_session_id=excluded.remote_session_id,remote_session_generation=excluded.remote_session_generation",
            rusqlite::params![grant,principal,remote_id,key_id,scope,generation,remote_session_id,remote_session_generation]).map_err(|_| "local_account_write_failed")?;
        tx.commit().map_err(|_| "local_account_write_failed")?;
        (grant, principal, generation)
    };
    session(state, &grant, &principal, generation)
}

fn session(
    state: &LocalAuthState,
    grant: &str,
    principal: &str,
    generation: i64,
) -> Result<JsonValue, String> {
    let user = {
        let db = state.db.lock().map_err(|_| "local_database_unavailable")?;
        super::user(&db, principal)?
    };
    let token = tokens::generate(
        state,
        principal,
        field(&user, "username")?,
        Some(grant),
        Some(generation),
    )?;
    Ok(
        json!({"ok":true,"user":user,"token":token,"localSession":{"id":grant,"generation":generation}}),
    )
}

fn challenge(message: &JsonValue, state: &LocalAuthState) -> Result<JsonValue, String> {
    let grant = field(message, "grantId")?;
    let purpose = field(message, "purpose")?;
    if !matches!(purpose, "local-resume" | "local-lock") {
        return Err("auth_request_invalid".into());
    }
    let db = state.db.lock().map_err(|_| "local_database_unavailable")?;
    let (key, generation): (String, i64) = db
        .query_row(
            "SELECT key_id,generation FROM auth_local_grants WHERE grant_id=?1 AND locked=0",
            [grant],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "local_session_locked")?;
    let now = Utc::now().timestamp_millis();
    db.execute(
        "DELETE FROM auth_local_challenges WHERE expires_ms <= ?1",
        [now],
    )
    .map_err(|_| "local_database_write_failed")?;
    let nonce = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    let id = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    let reference = format!("{grant}:{generation}");
    db.execute(
        "INSERT INTO auth_local_challenges VALUES (?1,?2,?3,?4,?5,?6,?7,NULL)",
        rusqlite::params![id, grant, purpose, reference, nonce, now, now + 60000],
    )
    .map_err(|_| "local_database_write_failed")?;
    Ok(
        json!({"ok":true,"challenge":{"purpose":purpose,"reference":reference,"keyId":key,"challenge":id,"nonce":nonce,"issuedAt":now}}),
    )
}

fn consume(message: &JsonValue, state: &LocalAuthState) -> Result<JsonValue, String> {
    let locking = message["action"] == "local-session-lock";
    let purpose = if locking {
        "local-lock"
    } else {
        "local-resume"
    };
    let grant = field(message, "grantId")?;
    let challenge = field(message, "challengeId")?;
    // Snapshot the proof material, then release SQLite before invoking the OS
    // key. Android resolves that capability on its UI thread, which also needs
    // the grant/inbox for an incoming call. Recheck all material atomically below.
    let (principal, scope, key, generation, nonce, issued) = {
        let db = state.db.lock().map_err(|_| "local_database_unavailable")?;
        let (principal,scope,key,generation): (String,String,String,i64) = db.query_row(
            "SELECT local_principal,key_scope,key_id,generation FROM auth_local_grants WHERE grant_id=?1 AND locked=0",[grant],
            |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|_| "local_session_locked")?;
        let now = Utc::now().timestamp_millis();
        let reference = format!("{grant}:{generation}");
        let (nonce,issued): (String,i64) = db.query_row("SELECT nonce,issued_ms FROM auth_local_challenges
            WHERE challenge_id=?1 AND grant_id=?2 AND purpose=?3 AND reference_id=?4 AND expires_ms>?5 AND consumed_ms IS NULL",
            rusqlite::params![challenge,grant,purpose,reference,now], |r| Ok((r.get(0)?,r.get(1)?))).map_err(|_| "auth_proof_invalid")?;
        (principal, scope, key, generation, nonce, issued)
    };
    let reference = format!("{grant}:{generation}");
    let signed = json!([
            "atome.phone-link.v1",
            "https://atome.one",
            purpose,
            reference,
            challenge,
            nonce,
            key,
            issued
        ])
        .to_string();
    let valid = crate::auth_device::auth_device_handle(
            "verify".into(),
            scope.clone(),
            Some(signed),
            Some(field(message, "signature")?.into()),
        )?;
    if valid != true { return Err("auth_proof_invalid".into()); }
    {
        let mut db = state.db.lock().map_err(|_| "local_database_unavailable")?;
        let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|_| "local_database_unavailable")?;
        let now = Utc::now().timestamp_millis();
        let consumed = tx.execute("UPDATE auth_local_challenges SET consumed_ms=?1
            WHERE challenge_id=?2 AND grant_id=?3 AND purpose=?4 AND reference_id=?5
            AND nonce=?6 AND issued_ms=?7 AND expires_ms>?1 AND consumed_ms IS NULL
            AND EXISTS(SELECT 1 FROM auth_local_grants WHERE grant_id=?3 AND locked=0
                AND local_principal=?8 AND key_scope=?9 AND key_id=?10 AND generation=?11)",
            rusqlite::params![now,challenge,grant,purpose,reference,nonce,issued,principal,scope,key,generation])
            .map_err(|_| "local_database_write_failed")?;
        if consumed != 1 { return Err("auth_proof_invalid".into()); }
        if locking {
            let sql = if message["remoteOnly"] == true {
                "UPDATE auth_local_grants SET remote_session_id='',remote_session_generation=NULL WHERE grant_id=?1"
            } else {
                "UPDATE auth_local_grants SET locked=1,generation=generation+1,remote_session_id='',remote_session_generation=NULL WHERE grant_id=?1"
            };
            tx.execute(
                sql,
                [grant],
            )
            .map_err(|_| "local_database_write_failed")?;
        }
        tx.commit().map_err(|_| "local_database_write_failed")?;
    }
    if locking {
        Ok(json!({"ok":true}))
    } else {
        session(state, grant, &principal, generation)
    }
}
