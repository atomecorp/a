use super::*;
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

// A session already confirmed against its grant is remembered, so a media or API request does not wait for
// the workspace database (a single connection) while a long read holds it: on the iPhone a photo waited up
// to 10 s behind the list of records. Any revocation forgets every confirmation; a refusal is never kept.
static REVOCATIONS: AtomicU64 = AtomicU64::new(0);
static CONFIRMED: Mutex<Option<HashMap<String, (u64, Instant)>>> = Mutex::new(None);
const CONFIRMED_FOR: Duration = Duration::from_secs(30);
const CONFIRMED_MAX: usize = 256;

/// Called, the database held, by every write that locks a grant or ends a guest workspace.
pub(crate) fn revoked() {
    REVOCATIONS.fetch_add(1, Ordering::SeqCst);
}

fn confirmed(key: &str) -> bool {
    let revocations = REVOCATIONS.load(Ordering::SeqCst);
    CONFIRMED.lock().ok().is_some_and(|cache| {
        cache
            .as_ref()
            .and_then(|map| map.get(key))
            .is_some_and(|(at, when)| *at == revocations && when.elapsed() < CONFIRMED_FOR)
    })
}

// `revocations`: read with the database held, before the grant was read.
fn confirm(key: String, revocations: u64) {
    if let Ok(mut cache) = CONFIRMED.lock() {
        let map = cache.get_or_insert_with(HashMap::new);
        if map.len() >= CONFIRMED_MAX {
            map.clear();
        }
        map.insert(key, (revocations, Instant::now()));
    }
}

#[derive(Serialize, Deserialize)]
pub(super) struct Claims {
    pub sub: String,
    pub username: String,
    pub exp: i64,
    pub iat: i64,
    pub grant: Option<String>,
    pub generation: Option<i64>,
}

pub(super) fn generate(
    state: &LocalAuthState,
    user_id: &str,
    username: &str,
    grant: Option<&str>,
    generation: Option<i64>,
) -> Result<String, String> {
    let now = Utc::now().timestamp();
    let claims = Claims {
        sub: user_id.into(),
        username: username.into(),
        iat: now,
        exp: now + 900,
        grant: grant.map(String::from),
        generation,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|_| "local_session_token_failed".into())
}

pub(super) fn verify(state: &LocalAuthState, token: &str) -> Option<Claims> {
    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .ok()?
    .claims;
    let key = format!(
        "{:p}|{:?}|{}|{:?}",
        Arc::as_ptr(&state.db),
        claims.grant,
        claims.sub,
        claims.generation
    );
    if confirmed(&key) {
        return Some(claims);
    }
    let db = state.db.lock().ok()?;
    let revocations = REVOCATIONS.load(Ordering::SeqCst);
    let valid = if let Some(grant) = &claims.grant {
        db.query_row(
            "SELECT 1 FROM auth_local_grants WHERE grant_id = ?1 AND local_principal = ?2
            AND locked = 0 AND generation = ?3",
            rusqlite::params![grant, claims.sub, claims.generation],
            |_| Ok(true),
        )
        .optional()
        .ok()?
        .unwrap_or(false)
    } else {
        db.query_row("SELECT 1 FROM guest_workspace_principals WHERE guest_principal_id = ?1 AND status = 'active'",
            [&claims.sub], |_| Ok(true)).optional().ok()?.unwrap_or(false)
    };
    drop(db);
    if !valid {
        return None;
    }
    confirm(key, revocations);
    Some(claims)
}

/// The session secret kept in a 0600 file of the data directory (the desktop and Android hosts).
pub fn secret(data_dir: &std::path::Path) -> Result<String, String> {
    let path = data_dir.join("jwt_secret.key");
    if path.exists() {
        let value =
            std::fs::read_to_string(&path).map_err(|_| "local_session_secret_unavailable")?;
        if value.trim().len() < 32 {
            return Err("local_session_secret_invalid".into());
        }
        return Ok(value.trim().into());
    }
    let bytes: [u8; 32] = rand::random();
    let value = hex::encode(bytes);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|_| "local_session_secret_write_failed")?;
    file.write_all(value.as_bytes())
        .map_err(|_| "local_session_secret_write_failed")?;
    file.sync_all()
        .map_err(|_| "local_session_secret_write_failed")?;
    Ok(value)
}
