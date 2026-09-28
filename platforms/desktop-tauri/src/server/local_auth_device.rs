use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub(super) fn ensure_schema(state: &LocalAuthState) -> Result<(), String> {
    state.db.lock().map_err(|_| "local_database_unavailable")?.execute_batch(
        "CREATE TABLE IF NOT EXISTS auth_local_grants (
            grant_id TEXT PRIMARY KEY, local_principal TEXT NOT NULL, remote_principal TEXT NOT NULL,
            key_id TEXT NOT NULL, key_scope TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
            locked INTEGER NOT NULL DEFAULT 0, UNIQUE(remote_principal, key_id));
         CREATE TABLE IF NOT EXISTS auth_local_challenges (
            challenge_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL, purpose TEXT NOT NULL,
            reference_id TEXT NOT NULL, nonce TEXT NOT NULL, issued_ms INTEGER NOT NULL,
            expires_ms INTEGER NOT NULL, consumed_ms INTEGER);"
    ).map_err(|_| "local_auth_schema_unavailable".into())
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

// TLS peer validation is performed by the native WebSocket stack against the
// fixed production authority. JS cannot supply a verification server or result.
async fn remote(mut message: JsonValue) -> Result<JsonValue, String> {
    let request_id = Uuid::new_v4().to_string();
    message["requestId"] = json!(request_id);
    message["type"] = json!("auth");
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        let (mut socket, _) = connect_async("wss://atome.one/ws/api")
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
            bind(state, &response["user"], scope, &key_id)
        }
        "local-session-describe" => describe(message, state),
        "local-session-challenge" => challenge(message, state),
        "local-session-resume" | "local-session-lock" => consume(message, state),
        _ => Err("auth_request_invalid".into()),
    }
}

fn describe(message: &JsonValue, state: &LocalAuthState) -> Result<JsonValue, String> {
    let requested = message["grantId"]
        .as_str()
        .filter(|value| !value.is_empty());
    let db = state.db.lock().map_err(|_| "local_database_unavailable")?;
    let select = |sql: &str, parameter: &str| {
        db.query_row(sql, [parameter], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })
        .optional()
        .map_err(|_| "local_database_unavailable".to_string())
    };
    let row: Option<(String,String,String,String,i64)> = match requested {
        Some(grant) => select("SELECT grant_id,local_principal,key_id,key_scope,generation FROM auth_local_grants WHERE grant_id=?1 AND locked=0", grant)?,
        None => None,
    }.or(select("SELECT grant_id,local_principal,key_id,key_scope,generation FROM auth_local_grants WHERE locked=0 AND ?1='' ORDER BY rowid DESC LIMIT 1", "")?);
    let Some((grant, principal, key_id, scope, generation)) = row else {
        return Ok(json!({"ok":true,"localGrant":null}));
    };
    let user = super::user(&db, &principal)?;
    Ok(
        json!({"ok":true,"localGrant":{"phone":user["phone"],"keyId":key_id,
        "scope":scope,"user":user,"localSession":{"id":grant,"generation":generation},"locked":false}}),
    )
}

fn bind(
    state: &LocalAuthState,
    remote_user: &JsonValue,
    scope: &str,
    key_id: &str,
) -> Result<JsonValue, String> {
    let remote_id = field(remote_user, "id")?;
    let phone = field(remote_user, "phone")?;
    let username = field(remote_user, "username")?;
    let (grant, principal, generation) = {
        let mut db = state.db.lock().map_err(|_| "local_database_unavailable")?;
        let tx = db.transaction().map_err(|_| "local_database_unavailable")?;
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
        } else if let Some((id, _, deleted)) = accounts::find_user_record_by_phone(&tx, phone)? {
            if deleted.is_some() {
                return Err("local_account_unavailable".into());
            }
            id
        } else {
            Uuid::new_v4().to_string()
        };
        let other: bool = tx.query_row("SELECT 1 FROM auth_local_grants WHERE local_principal = ?1 AND remote_principal != ?2 LIMIT 1",
            rusqlite::params![principal,remote_id], |_| Ok(true)).optional().map_err(|_| "local_database_unavailable")?.unwrap_or(false);
        let old_binding: bool = tx.query_row("SELECT 1 FROM remote_sync_stream_cursors WHERE local_user_id=?1 AND remote_user_id!=?2 LIMIT 1",
            rusqlite::params![principal,remote_id], |_| Ok(true)).optional().map_err(|_| "local_database_unavailable")?.unwrap_or(false);
        if other || old_binding {
            return Err("local_account_binding_conflict".into());
        }
        let now = Utc::now().to_rfc3339();
        let inserted = tx.execute("INSERT OR IGNORE INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at, created_source, sync_status)
            VALUES (?1,'user',?1,?1,?2,?2,'tauri','pending')", rusqlite::params![principal,now]).map_err(|_| "local_account_write_failed")?;
        accounts::assign_verified_phone(&tx, &principal, phone, &now)?;
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
        tx.execute("INSERT INTO auth_local_grants VALUES (?1,?2,?3,?4,?5,?6,0)
            ON CONFLICT(remote_principal,key_id) DO UPDATE SET locked=0,generation=excluded.generation",
            rusqlite::params![grant,principal,remote_id,key_id,scope,generation]).map_err(|_| "local_account_write_failed")?;
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
    let (principal, generation) = {
        let mut db = state.db.lock().map_err(|_| "local_database_unavailable")?;
        let tx = db.transaction().map_err(|_| "local_database_unavailable")?;
        let (principal,scope,key,generation): (String,String,String,i64) = tx.query_row(
            "SELECT local_principal,key_scope,key_id,generation FROM auth_local_grants WHERE grant_id=?1 AND locked=0",[grant],
            |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|_| "local_session_locked")?;
        let now = Utc::now().timestamp_millis();
        let reference = format!("{grant}:{generation}");
        let (nonce,issued): (String,i64) = tx.query_row("SELECT nonce,issued_ms FROM auth_local_challenges
            WHERE challenge_id=?1 AND grant_id=?2 AND purpose=?3 AND reference_id=?4 AND expires_ms>?5 AND consumed_ms IS NULL",
            rusqlite::params![challenge,grant,purpose,reference,now], |r| Ok((r.get(0)?,r.get(1)?))).map_err(|_| "auth_proof_invalid")?;
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
        let valid = crate::auth_device::auth_device_key(
            "verify".into(),
            scope,
            Some(signed),
            Some(field(message, "signature")?.into()),
        )?;
        if valid != true {
            return Err("auth_proof_invalid".into());
        }
        tx.execute(
            "UPDATE auth_local_challenges SET consumed_ms=?1 WHERE challenge_id=?2",
            rusqlite::params![now, challenge],
        )
        .map_err(|_| "local_database_write_failed")?;
        if locking {
            tx.execute(
                "UPDATE auth_local_grants SET locked=1,generation=generation+1 WHERE grant_id=?1",
                [grant],
            )
            .map_err(|_| "local_database_write_failed")?;
        }
        tx.commit().map_err(|_| "local_database_write_failed")?;
        (principal, generation)
    };
    if locking {
        Ok(json!({"ok":true}))
    } else {
        session(state, grant, &principal, generation)
    }
}
