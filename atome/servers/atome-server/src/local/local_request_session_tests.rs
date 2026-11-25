// R-246 BUG-0031: the local server knows its reader by a verified device session only. A request that names an
// account (`X-User-Id`, `media_user_id`) without a session is refused, and a session never reads the folder of
// another account of the device.
use super::*;
use crate::local::local_atome::create_state;

struct Device {
    auth: local_auth::LocalAuthState,
    _workspace: tempfile::TempDir,
}

async fn device() -> Device {
    let workspace = tempfile::tempdir().expect("temporary workspace");
    let atome = create_state(
        workspace.path().join("state"),
        workspace.path().to_path_buf(),
        "WAL",
    )
    .expect("local state");
    let auth = local_auth::create_state(&atome, "r246-session-secret-of-32-bytes-at-least".into())
        .expect("local auth");
    Device {
        auth,
        _workspace: workspace,
    }
}

// A guest account of the device: its id and its session token.
async fn guest(device: &Device) -> (String, String) {
    let id = uuid::Uuid::new_v4().to_string();
    let answer = local_auth::handle_auth_message(
        json!({ "type": "auth", "action": "start-guest", "guestId": id }),
        &device.auth,
    )
    .await;
    let token = answer["token"].as_str().expect("guest token").to_string();
    (id, token)
}

fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
    let mut map = HeaderMap::new();
    for (name, value) in pairs {
        map.insert(*name, HeaderValue::from_str(value).expect("header value"));
    }
    map
}

fn query(token: Option<&str>, folder: Option<&str>) -> MediaTokenQuery {
    MediaTokenQuery {
        token: token.map(String::from),
        media_user_id: folder.map(String::from),
        ..MediaTokenQuery::default()
    }
}

#[tokio::test]
async fn a_named_account_without_a_session_is_refused() {
    let device = device().await;
    let (alice, _) = guest(&device).await;
    for name in ["x-user-id", "x-username", "x-phone"] {
        assert_eq!(
            resolve_authenticated_user(&headers(&[(name, &alice)]), &device.auth),
            None,
            "{name} alone is no identity"
        );
    }
    assert_eq!(
        resolve_media_authenticated_user(
            &headers(&[("x-user-id", &alice)]),
            &query(None, Some(&alice)),
            &device.auth
        ),
        None
    );
    assert_eq!(
        resolve_authenticated_user(
            &headers(&[
                ("authorization", "Bearer forged.token.value"),
                ("x-user-id", &alice)
            ]),
            &device.auth
        ),
        None
    );
}

#[tokio::test]
async fn a_session_reads_its_own_folder_and_a_synced_owner_never_another_account() {
    let device = device().await;
    let (alice, alice_token) = guest(&device).await;
    let (bob, _) = guest(&device).await;
    let bearer = format!("Bearer {alice_token}");
    assert_eq!(
        resolve_authenticated_user(
            &headers(&[("authorization", &bearer), ("x-user-id", &bob)]),
            &device.auth
        ),
        Some(alice.clone())
    );
    let media = |headers: HeaderMap, query: MediaTokenQuery| {
        resolve_media_authenticated_user(&headers, &query, &device.auth)
    };
    assert_eq!(
        media(headers(&[("authorization", &bearer)]), query(None, None)),
        Some(alice.clone())
    );
    // A media element's URL carries the session token itself.
    assert_eq!(
        media(HeaderMap::new(), query(Some(&alice_token), None)),
        Some(alice.clone())
    );
    // A synced owner's folder (no account of this device) is read with the session.
    assert_eq!(
        media(
            HeaderMap::new(),
            query(Some(&alice_token), Some("remote_owner_7"))
        ),
        Some("remote_owner_7".into())
    );
    // Another account of the device, named by the query or by the header, is refused.
    assert_eq!(
        media(HeaderMap::new(), query(Some(&alice_token), Some(&bob))),
        None
    );
    assert_eq!(
        media(
            headers(&[("authorization", &bearer), ("x-user-id", &bob)]),
            query(None, None)
        ),
        None
    );
}

// R-246 retest BUG-0031 (a): a `/ws/api` file message acts for the account its token proves, never one it names.
#[tokio::test]
async fn a_file_message_acts_for_its_token_never_a_named_account() {
    let device = device().await;
    let (alice, _) = guest(&device).await;
    let (bob, bob_token) = guest(&device).await;
    let state = AppState {
        static_dir: Arc::new(PathBuf::new()),
        project_root: Arc::new(PathBuf::new()),
        version: Arc::new(String::new()),
        eve_version: Arc::new(String::new()),
        started_at: Arc::new(std::time::Instant::now()),
        atome_state: None,
        auth_state: Some(device.auth.clone()),
    };
    for key in ["user_id", "userId", "owner_id"] {
        assert!(
            resolve_ws_file_user_id(&json!({ (key): alice }), &state).is_err(),
            "{key} alone"
        );
        assert_eq!(
            resolve_ws_file_user_id(&json!({ (key): alice, "token": bob_token }), &state)
                .as_deref(),
            Ok(sanitize_user_segment(&bob).as_str()),
            "{key} with Bob's token"
        );
    }
    assert!(resolve_ws_file_user_id(&json!({ "token": "forged" }), &state).is_err());
}
