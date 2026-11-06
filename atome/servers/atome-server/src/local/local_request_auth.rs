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

pub(super) fn resolve_media_authenticated_user(
    headers: &HeaderMap,
    query: &MediaTokenQuery,
    auth_state: &local_auth::LocalAuthState,
) -> Option<String> {
    let token = extract_bearer_token(headers).or_else(|| extract_token_from_media_query(query));
    let token_user_id = local_auth::extract_user_id_from_token(auth_state, token.as_deref());
    if token_user_id != "anonymous" {
        return extract_user_id_from_media_query(query)
            .or_else(|| extract_user_id_from_headers(headers))
            .or(Some(token_user_id));
    }
    extract_user_id_from_headers(headers).or_else(|| extract_user_id_from_media_query(query))
}

pub fn resolve_authenticated_user(
    headers: &HeaderMap,
    auth_state: &local_auth::LocalAuthState,
) -> Option<String> {
    let token = extract_bearer_token(headers);
    let token_user_id = local_auth::extract_user_id_from_token(auth_state, token.as_deref());
    if token_user_id != "anonymous" {
        return Some(token_user_id);
    }
    extract_user_id_from_headers(headers)
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
