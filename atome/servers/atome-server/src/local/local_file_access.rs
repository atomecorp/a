// Who may read `/file/<path>`, the person's stored media served from the project root (`data/users/<id>/…`).
// The local server listens on the loopback, which every process and every account of the machine reaches, and a web
// page too by DNS rebinding: a path alone is no right (R-246 retest BUG-0031). A read carries the device session's
// token (a bearer, else the `token` of a media element's URL, media_api_auth.js#appendStreamingMediaAuthQuery), and
// reaches only a folder of `data/users/` that session may read (local_request_auth.rs#folder_readable_by); nothing
// else of the project root (in development the whole repository) is served.
use super::*;

const USERS_PREFIX: [&str; 2] = ["data", "users"];

// The account folder a `/file/` path names, when the path stays inside `data/users/<folder>/`.
fn users_folder(path: &str) -> Option<String> {
    let decoded = percent_encoding::percent_decode_str(path)
        .decode_utf8()
        .ok()?;
    let segments: Vec<&str> = decoded
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    let inside = segments.len() > USERS_PREFIX.len() + 1
        && segments[..USERS_PREFIX.len()] == USERS_PREFIX
        && segments
            .iter()
            .all(|segment| *segment != ".." && *segment != "." && !segment.contains('\\'));
    inside.then(|| segments[USERS_PREFIX.len()].to_string())
}

pub(super) async fn file_access_middleware(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MediaTokenQuery>,
    request: Request<Body>,
    next: middleware::Next,
) -> Response {
    let Some(auth_state) = &state.auth_state else {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Auth state not initialized",
        )
        .into_response();
    };
    let token = extract_bearer_token(&headers).or_else(|| extract_token_from_media_query(&query));
    let Some(reader) = local_auth::verified_user_id_from_token(auth_state, token.as_deref()) else {
        return json_error(StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    };
    match users_folder(request.uri().path()) {
        Some(folder) if folder_readable_by(auth_state, &reader, &folder) => next.run(request).await,
        _ => json_error(StatusCode::FORBIDDEN, "Forbidden").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::users_folder;

    #[test]
    fn only_a_folder_of_data_users_is_served() {
        assert_eq!(
            users_folder("/data/users/u1/Downloads/a.png").as_deref(),
            Some("u1")
        );
        assert_eq!(
            users_folder("/data/users/u%31/recordings/r.m4a").as_deref(),
            Some("u1")
        );
        for path in [
            "/.env",
            "/Cargo.toml",
            "/data/users/u1",
            "/data/users/u1/",
            "/data/users/u1/../u2/a.png",
            "/data/users/u1/%2e%2e/u2/a.png",
            "/data/users/u1/..%2Fu2/a.png",
            "/data/users/u1/a%5C..%5Cb.png",
            "/data/vault.db",
            "/atome/src/index.html",
        ] {
            assert_eq!(users_folder(path), None, "{path}");
        }
    }
}
