// The store contracts the native controllers rely on (the iOS GPS, Health and Apple Music
// controllers ask them through `ws_api::answer`), held since L3.11 by this one local host:
// a GPS trip keeps its revision and refuses a stale version, another person cannot read it,
// and every state read carries the shared capability projection with the properties once.
use super::local_atome::{
    LocalAtomeState, create_state, handle_events_message, handle_state_current_message,
};
use serde_json::{Value as JsonValue, json};

const OWNER: &str = "gps00000-4000-4000-8000-000000000001";
const OTHER: &str = "gps00000-4000-4000-8000-000000000002";

fn fixture() -> (LocalAtomeState, tempfile::TempDir) {
    let directory = tempfile::tempdir().unwrap();
    let state = create_state(
        directory.path().join("state"),
        directory.path().to_path_buf(),
        "DELETE",
    )
    .unwrap();
    let db = state.db.lock().unwrap();
    for user in [OWNER, OTHER] {
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id) VALUES (?1, 'user', ?1, ?1)",
            [user],
        )
        .unwrap();
    }
    drop(db);
    (state, directory)
}

async fn commit(state: &LocalAtomeState, user: &str, event: JsonValue) -> (bool, String) {
    let response =
        handle_events_message(json!({ "action": "commit", "event": event }), user, state).await;
    (response.success, response.error.unwrap_or_default())
}

async fn read(state: &LocalAtomeState, user: &str, message: JsonValue) -> (bool, JsonValue) {
    let response = handle_state_current_message(message, user, state).await;
    (response.success, response.data.unwrap_or(JsonValue::Null))
}

#[tokio::test]
async fn a_gps_trip_keeps_its_revision_and_refuses_a_stale_version() {
    let (state, _directory) = fixture();
    let route = json!({ "distance_m": 150, "duration_s": 20, "provider": "valhalla" });
    let created = json!({ "id": "gps_create", "kind": "set", "atome_id": "gps_trip_native",
        "payload": { "props": { "type": "gps_trip", "name": "Paris", "revision": 0, "status": "planned", "route": route } } });
    assert_eq!(commit(&state, OWNER, created).await, (true, String::new()));
    let start = json!({ "id": "gps_start", "kind": "set", "atome_id": "gps_trip_native",
        "payload": { "props": { "revision": 1, "status": "navigating" }, "expected_versions": { "revision": 1 } } });
    assert!(commit(&state, OWNER, start.clone()).await.0);
    let mut stale = start;
    stale["id"] = json!("gps_stale");
    let (accepted, error) = commit(&state, OWNER, stale).await;
    assert!(!accepted);
    assert!(error.contains("property_version_conflict"), "{error}");

    let get = json!({ "action": "get", "atome_id": "gps_trip_native" });
    // Another person sees nothing of it: no readable property, no state (as Fastify answers).
    let (_, seen) = read(&state, OTHER, get.clone()).await;
    assert_eq!(seen["state"], JsonValue::Null);
    let (own, data) = read(&state, OWNER, get).await;
    assert!(own);
    let trip = &data["state"];
    assert_eq!(trip["atome_type"], "gps_trip");
    assert_eq!(trip["project_id"], JsonValue::Null);
    assert_eq!(trip["properties"]["revision"], 1);
    assert_eq!(trip["properties"]["status"], "navigating");
}

#[tokio::test]
async fn state_reads_carry_the_capability_projection_and_the_properties_once() {
    let (state, _directory) = fixture();
    let created = json!({ "id": "shape_create", "kind": "set", "atome_id": "shape_native",
        "payload": { "props": { "type": "shape", "color": "red" } } });
    assert!(commit(&state, OWNER, created).await.0);

    let (got, data) = read(
        &state,
        OWNER,
        json!({ "action": "get", "atome_id": "shape_native" }),
    )
    .await;
    assert!(got);
    let row = &data["state"];
    assert_eq!(row["capabilities"]["properties"]["color"]["write"], true);
    assert_eq!(row["properties"]["color"], "red");
    assert!(row.get("particles").is_none() && row.get("data").is_none());

    let (listed, data) = read(
        &state,
        OWNER,
        json!({ "action": "list", "atome_type": "shape" }),
    )
    .await;
    assert!(listed);
    let rows = data["states"]
        .as_array()
        .or_else(|| data.as_array())
        .cloned()
        .unwrap_or_default();
    let row = rows
        .iter()
        .find(|row| row["atome_id"] == "shape_native")
        .unwrap_or_else(|| panic!("listed: {data}"));
    assert!(row["capabilities"].is_object());
    assert!(row.get("particles").is_none() && row.get("data").is_none());
}
