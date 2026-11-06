use super::*;

fn state() -> LocalAtomeState {
    let db = Connection::open_in_memory().expect("memory db");
    db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");
    LocalAtomeState {
        db: Arc::new(crate::local::local_vault::LocalVault::new(db)),
        storage_root: PathBuf::new(),
        recent_request_ids: Arc::new(Mutex::new(DedupeCache::new(32))),
        remote_sync_credentials: Arc::new(Mutex::new(HashMap::new())),
        sync_progress: Arc::new(Mutex::new(HashMap::new())),
    }
}

#[tokio::test]
async fn project_filter_runs_before_limit_and_accepts_canonical_kind() {
    let state = state();
    {
        let db = state.db.lock().expect("database lock");
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, updated_at) VALUES ('owner', 'user', NULL, 'owner', '2025-12-31T00:00:00Z')",
            [],
        ).expect("owner atome");
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, updated_at) VALUES ('old-project', 'generic', 'owner', 'owner', '2026-01-01T00:00:00Z')",
            [],
        ).expect("project atome");
        db.execute(
            "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES ('old-project', 'owner', 'old-project', '{\"kind\":\"project\",\"name\":\"Old project\"}', '2026-01-01T00:00:00Z', 1)",
            [],
        ).expect("project state");
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, updated_at) VALUES ('new-shape', 'shape', 'owner', 'owner', '2026-02-01T00:00:00Z')",
            [],
        ).expect("shape atome");
        db.execute(
            "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES ('new-shape', 'owner', 'old-project', '{\"kind\":\"shape\"}', '2026-02-01T00:00:00Z', 1)",
            [],
        ).expect("shape state");
    }

    let response = handle_state_current_list(
        json!({ "atome_type": "project", "limit": 1 }),
        "owner",
        &state,
        None,
    )
    .await;

    assert!(response.success, "{:?}", response.error);
    let states = response
        .data
        .as_ref()
        .and_then(|data| data.get("states"))
        .and_then(JsonValue::as_array)
        .expect("states");
    assert_eq!(states.len(), 1);
    assert_eq!(states[0].get("atome_id"), Some(&json!("old-project")));
}

#[tokio::test]
async fn a_tool_catalogue_read_leaves_derived_tools_and_excluded_particles_behind() {
    let state = state();
    {
        let db = state.db.lock().expect("database lock");
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, updated_at) VALUES ('owner', 'user', NULL, 'owner', '2025-12-31T00:00:00Z')",
            [],
        ).expect("owner atome");
        for (id, at) in [
            ("tool_ui.project.open", "2026-01-01T00:00:00Z"),
            (
                "tool_ui.activity.select.local_album",
                "2026-01-02T00:00:00Z",
            ),
        ] {
            db.execute(
                "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, updated_at) VALUES (?1, 'tool', 'owner', 'owner', ?2)",
                rusqlite::params![id, at],
            ).expect("tool atome");
            db.execute(
                "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES (?1, 'owner', NULL, '{\"tool_id\":\"t\",\"preview\":\"heavy\"}', ?2, 1)",
                rusqlite::params![id, at],
            ).expect("tool state");
        }
    }

    let response = handle_state_current_list(
        json!({ "atome_type": "tool", "exclude_particle_keys": ["preview"] }),
        "owner",
        &state,
        None,
    )
    .await;

    assert!(response.success, "{:?}", response.error);
    let states = response
        .data
        .as_ref()
        .and_then(|data| data.get("states"))
        .and_then(JsonValue::as_array)
        .expect("states");
    assert_eq!(states.len(), 1);
    assert_eq!(states[0]["atome_id"], json!("tool_ui.project.open"));
    assert_eq!(states[0]["properties"], json!({ "tool_id": "t" }));
}
