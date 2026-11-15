// A media atome deleted, by a commit made on this device or by a delete event the sync
// brought: its local copy of the bytes leaves the places the local listing (`/api/uploads`
// reads `Downloads`) and the sync's recovery (`recover_inbound_media`, which looks in the same
// place) read, so neither brings it back (AGENTS.md rule 21, register R-115 D36). They wait in
// the home's `.deleted/` (media/trash.rs): a `restore` (the undo of the delete) puts them back,
// the purge erases them after `trash::KEEP`.
// Bytes another live atome still names stay: a duplicate keeps its source's `file_path` and
// `file_name`, and two media may share a name, so deleting one never empties the other.
use rusqlite::{Connection, OptionalExtension};
use serde_json::Value as JsonValue;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

// A name or a path relative to a home, never climbing out of it.
fn inside(relative: &str) -> Option<&Path> {
    let path = Path::new(relative);
    let safe = !relative.is_empty()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
    safe.then_some(path)
}

// Where its bytes lie: its `file_path` in its owner's home, and its `file_name` in that
// home's `Downloads` (the owner is `media_user_id`, else the atome's owner, as the recovery reads it).
fn text_of(properties: &JsonValue, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|key| properties.get(*key).and_then(JsonValue::as_str))
        .map(str::trim)
        .unwrap_or("")
        .to_string()
}

// The home its bytes lie in, with the owner it belongs to.
fn media_home(
    storage_root: &Path,
    owner: &str,
    properties: &JsonValue,
) -> Option<(String, PathBuf)> {
    let owner = Some(text_of(properties, &["media_user_id", "mediaUserId"]))
        .filter(|media_owner| !media_owner.is_empty())
        .unwrap_or_else(|| owner.to_string());
    let valid = !owner.is_empty()
        && owner
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    valid.then(|| {
        let home = storage_root.join("data").join("users").join(&owner);
        (owner, home)
    })
}

fn stored_paths(storage_root: &Path, owner: &str, properties: &JsonValue) -> Vec<PathBuf> {
    let text = |keys: &[&str]| text_of(properties, keys);
    let Some((owner, home)) = media_home(storage_root, owner, properties) else {
        return Vec::new();
    };
    let mut paths = Vec::new();
    let name = text(&["file_name", "fileName"]);
    if !name.contains('/')
        && !name.contains('\\')
        && let Some(name) = inside(&name)
    {
        paths.push(home.join("Downloads").join(name));
    }
    let raw = text(&["file_path", "filePath"]).replace('\\', "/");
    let prefix = format!("data/users/{owner}/");
    let relative = raw
        .split_once(&prefix)
        .map_or(raw.trim_start_matches('/'), |(_, rest)| rest);
    if let Some(relative) = inside(relative) {
        paths.push(home.join(relative));
    }
    paths
}

// The last part of a stored name or path (`recordings/x.mov` → `x.mov`).
fn base_name(value: &str) -> Option<String> {
    value
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(String::from)
}

// The file names every live atome but `atome_id` still holds, by `file_name` or `file_path`.
// Compared by name alone: a same name in another folder keeps its bytes, never the reverse.
fn names_held_by_others(db: &Connection, atome_id: &str) -> Result<HashSet<String>, String> {
    let mut statement = db
        .prepare(
            "SELECT properties FROM state_current
             WHERE atome_id <> ?1 AND COALESCE(json_extract(properties, '$.__deleted'), 0) <> 1
               AND (json_extract(properties, '$.file_name') IS NOT NULL
                 OR json_extract(properties, '$.fileName') IS NOT NULL
                 OR json_extract(properties, '$.file_path') IS NOT NULL
                 OR json_extract(properties, '$.filePath') IS NOT NULL)",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([atome_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let mut held = HashSet::new();
    for raw in rows {
        let raw = raw.map_err(|error| error.to_string())?;
        let Ok(properties) = serde_json::from_str::<JsonValue>(&raw) else {
            continue;
        };
        for key in ["file_name", "fileName", "file_path", "filePath"] {
            if let Some(name) = properties
                .get(key)
                .and_then(JsonValue::as_str)
                .and_then(base_name)
            {
                held.insert(name);
            }
        }
    }
    Ok(held)
}

/// Moves aside (media/trash.rs) the local bytes of each deleted atome of `atome_ids` that
/// names a stored file no live atome still holds.
pub(super) fn remove_deleted_media<'a>(
    db: &Connection,
    storage_root: &Path,
    atome_ids: impl IntoIterator<Item = &'a str>,
) -> Result<(), String> {
    for atome_id in atome_ids {
        let row: Option<(String, String)> = db
            .query_row(
                "SELECT COALESCE(a.owner_id, s.owner_id, ''), s.properties FROM state_current s
                 LEFT JOIN atomes a ON a.atome_id = s.atome_id
                 WHERE s.atome_id = ?1 AND json_extract(s.properties, '$.__deleted') = 1",
                [atome_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let Some((owner, raw)) = row else { continue };
        let properties: JsonValue =
            serde_json::from_str(&raw).map_err(|error| error.to_string())?;
        let Some((_, home)) = media_home(storage_root, &owner, &properties) else {
            continue;
        };
        let held = names_held_by_others(db, atome_id)?;
        for path in stored_paths(storage_root, &owner, &properties) {
            let shared = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| held.contains(name));
            if shared {
                continue;
            }
            crate::media::trash::keep(&home, atome_id, &path)
                .map_err(|error| format!("local_media_remove_failed:{error}"))?;
        }
    }
    Ok(())
}

/// Puts back the local bytes kept aside for each atome of `atome_ids` that is live again
/// (a `restore`, the undo of its delete).
pub(super) fn restore_deleted_media<'a>(
    db: &Connection,
    storage_root: &Path,
    atome_ids: impl IntoIterator<Item = &'a str>,
) -> Result<(), String> {
    for atome_id in atome_ids {
        let row: Option<(String, String)> = db
            .query_row(
                "SELECT COALESCE(a.owner_id, s.owner_id, ''), s.properties FROM state_current s
                 LEFT JOIN atomes a ON a.atome_id = s.atome_id
                 WHERE s.atome_id = ?1 AND COALESCE(json_extract(s.properties, '$.__deleted'), 0) <> 1",
                [atome_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let Some((owner, raw)) = row else { continue };
        let properties: JsonValue =
            serde_json::from_str(&raw).map_err(|error| error.to_string())?;
        if let Some((_, home)) = media_home(storage_root, &owner, &properties) {
            crate::media::trash::restore(&home, atome_id)
                .map_err(|error| format!("local_media_restore_failed:{error}"))?;
        }
    }
    Ok(())
}

/// The lifecycle of committed `events` on the local bytes: a delete moves them aside, a
/// restore puts them back.
pub(super) fn apply_media_lifecycle(
    db: &Connection,
    storage_root: &Path,
    events: &[JsonValue],
) -> Result<(), String> {
    let of = |kind: &'static str| {
        events
            .iter()
            .filter(move |event| event.get("kind").and_then(JsonValue::as_str) == Some(kind))
            .filter_map(|event| event.get("atome_id").and_then(JsonValue::as_str))
    };
    remove_deleted_media(db, storage_root, of("delete"))?;
    restore_deleted_media(db, storage_root, of("restore"))
}

#[cfg(test)]
mod tests {
    use super::{apply_media_lifecycle, remove_deleted_media, stored_paths};
    use rusqlite::Connection;
    use serde_json::json;
    use std::path::Path;

    // A duplicate shares its source's file: deleting one keeps the bytes the other still shows;
    // deleting the last holder removes them.
    #[test]
    fn a_file_another_live_atome_holds_stays() {
        let root = std::env::temp_dir().join(format!("media-removal-{}", std::process::id()));
        let home = root.join("data/users/u1/recordings");
        std::fs::create_dir_all(&home).expect("home");
        let file = home.join("take.mov");
        std::fs::write(&file, b"bytes").expect("file");
        let db = Connection::open_in_memory().expect("db");
        db.execute_batch(
            "CREATE TABLE atomes (atome_id TEXT PRIMARY KEY, owner_id TEXT);
             CREATE TABLE state_current (atome_id TEXT PRIMARY KEY, owner_id TEXT, properties TEXT);",
        )
        .expect("schema");
        let props = |deleted: bool| {
            json!({ "kind": "video_recording", "file_name": "take.mov",
                "file_path": "data/users/u1/recordings/take.mov", "__deleted": deleted })
            .to_string()
        };
        db.execute(
            "INSERT INTO state_current VALUES ('copy', 'u1', ?1), ('source', 'u1', ?2)",
            [props(true), props(false)],
        )
        .expect("rows");
        remove_deleted_media(&db, &root, ["copy"]).expect("removal");
        assert!(file.is_file(), "the source still shows these bytes");
        db.execute(
            "UPDATE state_current SET properties = ?1 WHERE atome_id = 'source'",
            [props(true)],
        )
        .expect("source deleted");
        remove_deleted_media(&db, &root, ["source"]).expect("removal");
        assert!(!file.exists(), "no live atome holds them any more");
        assert!(
            root.join("data/users/u1/.deleted/source/recordings/take.mov")
                .is_file(),
            "kept aside for an undo"
        );
        // The undo of the delete (a `restore`): the take comes back with its bytes.
        db.execute(
            "UPDATE state_current SET properties = ?1 WHERE atome_id = 'source'",
            [props(false)],
        )
        .expect("source restored");
        apply_media_lifecycle(
            &db,
            &root,
            &[json!({ "kind": "restore", "atome_id": "source" })],
        )
        .expect("restore");
        assert_eq!(std::fs::read(&file).expect("back"), b"bytes");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn stored_paths_stay_in_the_owner_home() {
        let root = Path::new("/r");
        let paths = stored_paths(
            root,
            "u1",
            &json!({ "file_name": "a.png", "file_path": "data/users/u1/captures/b.png" }),
        );
        assert_eq!(
            paths,
            vec![
                root.join("data/users/u1/Downloads/a.png"),
                root.join("data/users/u1/captures/b.png")
            ]
        );
        assert!(
            stored_paths(
                root,
                "u1",
                &json!({ "file_name": "../x", "file_path": "../../etc" })
            )
            .is_empty()
        );
        assert!(stored_paths(root, "../u", &json!({ "file_name": "a.png" })).is_empty());
        assert_eq!(
            stored_paths(
                root,
                "u1",
                &json!({ "file_name": "a.png", "media_user_id": "remote" })
            ),
            vec![root.join("data/users/remote/Downloads/a.png")]
        );
    }
}
