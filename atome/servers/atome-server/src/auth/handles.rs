// Public, non-secret routing names (`jean-4821`), as server/auth_handles.js gives them:
// a handle only says whose devices receive an approval request; it never proves
// anything. Each principal holds one, given at its first session.
use super::proof::random_below;
use crate::vault_router::js;
use ring::rand::SystemRandom;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value as JsonValue;

const NEUTRAL_WORDS: [&str; 12] = [
    "atome", "eve", "lune", "onde", "nova", "prisme", "orbite", "pixel", "echo", "delta", "sigma",
    "flux",
];
const ATTEMPTS: usize = 12;

// The name's letters and digits, accents taken off (NFKD), leading digits dropped, 16 at most.
fn stem(name: &str) -> String {
    let decomposed = icu_normalizer::DecomposingNormalizerBorrowed::new_nfkd().normalize(name);
    let kept: String = decomposed
        .chars()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .collect::<String>()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        .collect();
    kept.trim_start_matches(|c: char| c.is_ascii_digit())
        .chars()
        .take(16)
        .collect()
}

// The generated `user_<id>` username names nobody.
fn generated(name: &str) -> bool {
    name.get(..5)
        .is_some_and(|head| head.eq_ignore_ascii_case("user_"))
        && name.len() >= 13
        && name[5..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

pub fn of(db: &Connection, principal: &str) -> Result<Option<String>, String> {
    db.query_row(
        "SELECT handle FROM auth_handles WHERE principal_id = ?",
        [principal],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(Option::flatten)
    .map_err(|e| e.to_string())
}

/// The principal's handle, given now when it has none; `name` (its username) seeds it.
pub fn assign(
    db: &Connection,
    principal: &str,
    name: Option<&str>,
    now: i64,
) -> Result<String, String> {
    if let Some(existing) = of(db, principal)?.filter(|handle| !handle.is_empty()) {
        return Ok(existing);
    }
    let source = name.filter(|name| !generated(name)).unwrap_or("");
    let random = SystemRandom::new();
    let base = match stem(source) {
        base if base.chars().count() >= 2 => base,
        _ => NEUTRAL_WORDS[random_below(&random, NEUTRAL_WORDS.len() as u32) as usize].to_string(),
    };
    for _ in 0..ATTEMPTS {
        let handle = format!("{base}-{:04}", random_below(&random, 10_000));
        let changed = db
            .execute(
                "INSERT OR IGNORE INTO auth_handles (handle, principal_id, created_ms) VALUES (?, ?, ?)",
                params![handle, principal, now],
            )
            .map_err(|e| e.to_string())?;
        if changed == 1 {
            return Ok(handle);
        }
    }
    Err("auth_handle_unavailable".into())
}

// `^[a-z][a-z0-9]{1,15}-\d{4}$`.
fn well_formed(handle: &str) -> bool {
    let Some((name, number)) = handle.rsplit_once('-') else {
        return false;
    };
    name.starts_with(|c: char| c.is_ascii_lowercase())
        && (2..=16).contains(&name.len())
        && name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        && number.len() == 4
        && number.bytes().all(|byte| byte.is_ascii_digit())
}

/// The principal a handle routes to (`normalizeHandle`: trimmed, lowercased, one `@` off).
pub fn resolve(db: &Connection, handle: Option<&JsonValue>) -> Result<Option<String>, String> {
    let text = handle
        .filter(|handle| js::truthy(Some(handle)))
        .map(|handle| js::text(Some(handle)))
        .unwrap_or_default();
    let lowered = js::trim(&text).to_lowercase();
    let value = lowered.strip_prefix('@').unwrap_or(&lowered);
    if !well_formed(value) {
        return Ok(None);
    }
    db.query_row(
        "SELECT principal_id FROM auth_handles WHERE handle = ?",
        [value],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(Option::flatten)
    .map_err(|e| e.to_string())
}

/// A verified, unrevoked phone number routes like a handle: it only names whose
/// devices are asked, the approval on one of them stays the proof.
pub fn resolve_phone(db: &Connection, phone: Option<&JsonValue>) -> Result<Option<String>, String> {
    let Some(phone) = super::device_sessions::e164(phone) else {
        return Ok(None);
    };
    db.query_row(
        "SELECT c.principal_id FROM principal_phone_credentials c JOIN atomes a ON a.atome_id = c.principal_id
         WHERE c.normalized_phone = ? AND c.revoked_at IS NULL AND a.atome_type = 'user' AND a.deleted_at IS NULL",
        [phone],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(Option::flatten)
    .map_err(|e| e.to_string())
}
