// The local server's request identity: bearer tokens, media query tokens and the session they name.
use super::*;

#[derive(Deserialize, Default)]
pub(super) struct MediaTokenQuery {
    token: Option<String>,
    access_token: Option<String>,
    auth_token: Option<String>,
    media_user_id: Option<String>,
    user_id: Option<String>,
    #[serde(rename = "userId")]
    user_id_camel: Option<String>,
    x_user_id: Option<String>,
    x_userid: Option<String>,
}

pub fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim())
        .map(|v| {
            if v.to_lowercase().starts_with("bearer ") {
                v[7..].trim()
            } else {
                v
            }
        })
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
}

pub fn extract_user_id_from_headers(headers: &HeaderMap) -> Option<String> {
    const CANDIDATES: [&str; 6] = [
        "x-user-id",
        "x-userid",
        "x-username",
        "x-user-name",
        "x-phone",
        "x-user-phone",
    ];

    for key in CANDIDATES.iter() {
        if let Some(value) = headers.get(*key).and_then(|v| v.to_str().ok()) {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                continue;
            }
            let sanitized = sanitize_user_segment(trimmed);
            if sanitized != "anonymous" {
                return Some(sanitized);
            }
        }
    }
    None
}

pub(super) fn extract_token_from_media_query(query: &MediaTokenQuery) -> Option<String> {
    [
        query.token.as_deref(),
        query.access_token.as_deref(),
        query.auth_token.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(|value| value.trim())
    .find(|value| !value.is_empty())
    .map(|value| value.to_string())
}

pub(super) fn extract_user_id_from_media_query(query: &MediaTokenQuery) -> Option<String> {
    [
        query.media_user_id.as_deref(),
        query.user_id.as_deref(),
        query.user_id_camel.as_deref(),
        query.x_user_id.as_deref(),
        query.x_userid.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(|value| value.trim())
    .filter(|value| !value.is_empty())
    .find_map(|value| {
        let sanitized = sanitize_user_segment(value);
        if sanitized == "anonymous" {
            None
        } else {
            Some(sanitized)
        }
    })
}

// A media read names its folder (`media_user_id`, `X-User-Id`): synced media lie in their owner's folder
// (local_atome_sync_media.rs#local_media_owner). The reader is always the verified session's (a bearer, else the
// `token` of a media element's URL); a name alone is no identity (R-246 BUG-0031), and the folder named is never
// another account of this device.
pub(super) fn resolve_media_authenticated_user(
    headers: &HeaderMap,
    query: &MediaTokenQuery,
    auth_state: &local_auth::LocalAuthState,
) -> Option<String> {
    let token = extract_bearer_token(headers).or_else(|| extract_token_from_media_query(query));
    let reader = local_auth::verified_user_id_from_token(auth_state, token.as_deref())?;
    let folder = extract_user_id_from_media_query(query)
        .or_else(|| extract_user_id_from_headers(headers))
        .unwrap_or_else(|| reader.clone());
    folder_readable_by(auth_state, &reader, &folder).then_some(folder)
}

// The reader's own folder (its local principal or the remote one its grant links), or one that no other
// account of this device holds: a synced owner's.
pub(super) fn folder_readable_by(
    auth_state: &local_auth::LocalAuthState,
    reader: &str,
    folder: &str,
) -> bool {
    if folder == sanitize_user_segment(reader) {
        return true;
    }
    let Ok(db) = auth_state.db.lock() else {
        return false;
    };
    db.query_row(
        "SELECT EXISTS (SELECT 1 FROM auth_local_grants WHERE local_principal = ?2 AND remote_principal = ?1)
             OR NOT (EXISTS (SELECT 1 FROM auth_local_grants WHERE local_principal = ?1 OR remote_principal = ?1)
                 OR EXISTS (SELECT 1 FROM guest_workspace_principals WHERE guest_principal_id = ?1))",
        [folder, reader],
        |row| row.get::<_, bool>(0),
    )
    .unwrap_or(false)
}

/// The verified session's account; a request naming an account without a session is refused (R-246 BUG-0031).
pub fn resolve_authenticated_user(
    headers: &HeaderMap,
    auth_state: &local_auth::LocalAuthState,
) -> Option<String> {
    local_auth::verified_user_id_from_token(auth_state, extract_bearer_token(headers).as_deref())
}

pub fn json_error(status: StatusCode, message: &str) -> (StatusCode, Json<JsonValue>) {
    (status, Json(json!({ "success": false, "error": message })))
}

pub(super) fn require_auth_user(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<String, (StatusCode, Json<JsonValue>)> {
    let auth_state = state.auth_state.as_ref().ok_or_else(|| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Auth state not initialized",
        )
    })?;

    resolve_authenticated_user(headers, auth_state)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "Unauthorized"))
}

pub(super) fn require_atome_state(
    state: &AppState,
) -> Result<&local_atome::LocalAtomeState, (StatusCode, Json<JsonValue>)> {
    state.atome_state.as_ref().ok_or_else(|| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Atome state not initialized",
        )
    })
}

#[cfg(test)]
#[path = "local_request_session_tests.rs"]
mod session_tests;
