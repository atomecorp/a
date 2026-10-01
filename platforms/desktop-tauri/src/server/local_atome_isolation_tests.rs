// Isolation utilisateurs / projets du serveur local Tauri (axum + SQLite unique par appareil).
// Tous les comptes d'un appareil partagent la meme base : l'isolation repose sur les gardes
// des gestionnaires WebSocket, exerces ici par leurs points d'entree publics.
use super::local_atome::{create_state, handle_atome_message, handle_events_message, handle_state_current_message, LocalAtomeState};
use serde_json::{json, Value as JsonValue};

const ALICE: &str = "alice-0000-4000-8000-000000000001";
const BOB: &str = "bob-00000-4000-8000-000000000002";

fn seed_users(state: &LocalAtomeState) {
    let db = state.db.lock().expect("database lock");
    for user in [ALICE, BOB] {
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at) VALUES (?1, 'user', ?1, ?1, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')",
            rusqlite::params![user],
        ).expect("user atome");
    }
}

async fn commit(state: &LocalAtomeState, user: &str, event: JsonValue) -> bool {
    let response = handle_events_message(json!({ "action": "commit", "event": event }), user, state).await;
    if !response.success { eprintln!("commit refuse pour {user}: {:?}", response.error); }
    response.success
}

// Un projet est cree sans project_id (comme le client reel) : il est sa propre racine.
async fn create_project(state: &LocalAtomeState, user: &str, id: &str, name: &str) -> bool {
    commit(state, user, json!({ "kind": "set", "atome_id": id, "props": { "type": "project", "name": name } })).await
}

async fn list(state: &LocalAtomeState, user: &str, extra: JsonValue) -> Vec<String> {
    let mut message = json!({ "action": "list", "limit": 1000 });
    if let (Some(target), Some(source)) = (message.as_object_mut(), extra.as_object()) {
        for (key, value) in source { target.insert(key.clone(), value.clone()); }
    }
    let response = handle_state_current_message(message, user, state).await;
    response.data.as_ref()
        .and_then(|data| data.get("states")).and_then(JsonValue::as_array)
        .map(|states| states.iter().filter_map(|s| s.get("atome_id").and_then(JsonValue::as_str).map(String::from)).collect())
        .unwrap_or_default()
}

async fn get(state: &LocalAtomeState, user: &str, atome_id: &str) -> Option<JsonValue> {
    let response = handle_state_current_message(json!({ "action": "get", "atome_id": atome_id }), user, state).await;
    response.data.and_then(|data| data.get("state").cloned()).filter(|value| !value.is_null())
}

async fn create(state: &LocalAtomeState, user: &str, id: &str, project: &str, props: JsonValue) -> bool {
    commit(state, user, json!({ "kind": "set", "atome_id": id, "project_id": project, "props": props })).await
}

#[tokio::test]
async fn accounts_on_one_device_never_read_or_write_each_other() {
    let workspace = tempfile::tempdir().expect("temporary workspace");
    let state = create_state(workspace.path().join("state"), workspace.path().to_path_buf());
    seed_users(&state);
    assert!(create_project(&state, ALICE, "pa1", "A1").await);
    assert!(create_project(&state, ALICE, "pa2", "A2").await);
    assert!(create(&state, ALICE, "a1", "pa1", json!({ "type": "text", "parent_id": "pa1", "text": "secret A1" })).await);
    assert!(create(&state, ALICE, "a2", "pa2", json!({ "type": "shape", "parent_id": "pa2", "left": "10px" })).await);
    assert!(create_project(&state, BOB, "pb", "B").await);

    // Lecture : ni liste globale, ni liste par projet, ni lecture directe.
    let bob_all = list(&state, BOB, json!({})).await;
    assert!(bob_all.iter().all(|id| !["pa1", "pa2", "a1", "a2"].contains(&id.as_str())), "{bob_all:?}");
    assert!(list(&state, BOB, json!({ "project_id": "pa1" })).await.is_empty());
    assert!(get(&state, BOB, "a1").await.is_none());

    // Ecriture : substitution d'identifiants refusee, rien ne change chez Alice.
    assert!(!commit(&state, BOB, json!({ "kind": "set", "atome_id": "a1", "props": { "text": "pirate" } })).await);
    assert!(!commit(&state, BOB, json!({ "kind": "delete", "atome_id": "a1" })).await);
    assert!(!create(&state, BOB, "intrus", "pa1", json!({ "type": "shape", "parent_id": "pa1" })).await);
    assert!(!commit(&state, BOB, json!({ "kind": "set", "atome_id": "intrus2", "props": { "type": "shape", "owner_id": ALICE } })).await);
    let a1 = get(&state, ALICE, "a1").await.expect("a1 kept");
    assert_eq!(a1["properties"]["text"], json!("secret A1"));

    // Transfert de propriete : un vrai compte n'est jamais une source adoptable.
    let transfer = handle_atome_message(json!({
        "action": "transfer-owner", "from_owner_id": ALICE, "to_owner_id": BOB,
        "adoption_confirmed": true, "operation_id": "550e8400-e29b-41d4-a716-446655440000"
    }), BOB, &state).await;
    assert!(!transfer.success);
    assert!(get(&state, ALICE, "a1").await.is_some());

    // Isolation projets (meme compte).
    let p1 = list(&state, ALICE, json!({ "project_id": "pa1" })).await;
    let p2 = list(&state, ALICE, json!({ "project_id": "pa2" })).await;
    assert!(p1.contains(&"a1".to_string()) && !p1.contains(&"a2".to_string()), "{p1:?}");
    assert!(p2.contains(&"a2".to_string()) && !p2.contains(&"a1".to_string()), "{p2:?}");
}

#[tokio::test]
async fn explicit_permission_opens_only_the_shared_object_and_revocation_closes_it() {
    let workspace = tempfile::tempdir().expect("temporary workspace");
    let state = create_state(workspace.path().join("state"), workspace.path().to_path_buf());
    seed_users(&state);
    assert!(create_project(&state, ALICE, "pa1", "A1").await);
    assert!(create(&state, ALICE, "a1", "pa1", json!({ "type": "text", "parent_id": "pa1", "text": "partage" })).await);
    assert!(create(&state, ALICE, "a2", "pa1", json!({ "type": "text", "parent_id": "pa1", "text": "prive" })).await);
    {
        let db = state.db.lock().expect("database lock");
        db.execute(
            "INSERT INTO permissions (atome_id, principal_id, can_read, granted_by) VALUES ('a1', ?1, 1, ?2)",
            rusqlite::params![BOB, ALICE],
        ).expect("grant");
    }
    assert!(get(&state, BOB, "a1").await.is_some());
    assert!(get(&state, BOB, "a2").await.is_none(), "partager un objet n'ouvre pas son voisin");
    assert!(!commit(&state, BOB, json!({ "kind": "set", "atome_id": "a1", "props": { "text": "x" } })).await, "lecture seule");
    {
        let db = state.db.lock().expect("database lock");
        db.execute("DELETE FROM permissions WHERE atome_id = 'a1' AND principal_id = ?1", rusqlite::params![BOB]).expect("revoke");
    }
    assert!(get(&state, BOB, "a1").await.is_none(), "revocation immediate");
    assert!(list(&state, BOB, json!({})).await.iter().all(|id| id != "a1"));
}
