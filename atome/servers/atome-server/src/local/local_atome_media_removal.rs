// A media atome deleted, by a commit made on this device or by a delete event the sync
// brought: its local copy of the bytes leaves the person's home here, so neither the local
// listing (`/api/uploads` reads `Downloads`) nor the sync's recovery (`recover_inbound_media`,
// which looks in the same place) brings it back (AGENTS.md rule 21, register R-115 D36).
use rusqlite::{Connection, OptionalExtension};
use serde_json::Value as JsonValue;
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
fn stored_paths(storage_root: &Path, owner: &str, properties: &JsonValue) -> Vec<PathBuf> {
    let text = |keys: &[&str]| {
        keys.iter()
            .find_map(|key| properties.get(*key).and_then(JsonValue::as_str))
            .map(str::trim)
            .unwrap_or("")
            .to_string()
    };
    let owner = Some(text(&["media_user_id", "mediaUserId"]))
        .filter(|media_owner| !media_owner.is_empty())
        .unwrap_or_else(|| owner.to_string());
    if !owner
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        || owner.is_empty()
    {
        return Vec::new();
    }
    let home = storage_root.join("data").join("users").join(&owner);
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

/// Removes the local bytes of each deleted atome of `atome_ids` that names a stored file.
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
        for path in stored_paths(storage_root, &owner, &properties) {
            match std::fs::remove_file(&path) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                    return Err(format!("local_media_remove_failed:{error}"));
                }
                _ => {}
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::stored_paths;
    use serde_json::json;
    use std::path::Path;

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
