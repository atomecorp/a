//! Contextual taxonomy editor bridge (todo/contextual_taxonomy_2026-09-24.md, Q7).
//!
//! Two dedicated commands, never a generic file API: `taxonomy_read` and
//! `taxonomy_save` know the ONE file they touch, the source
//! `eVe/intuition/menu/context_menus.json` of the repository the debug build
//! was compiled from. The write path only exists in debug builds: a release
//! build carries stubs that refuse, so the public app cannot write the
//! taxonomy at all (a structural guard, not a hidden button).
//!
//! No Git or GitHub credential is involved: the file changes in the local
//! clone and the developer commits it with their own tools.

use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct TaxonomyFile {
    path: String,
    text: String,
}

#[derive(Serialize, Debug)]
pub struct TaxonomySaveResult {
    path: String,
    backup: String,
    bytes: usize,
}

#[cfg(debug_assertions)]
mod enabled {
    use super::{TaxonomyFile, TaxonomySaveResult};
    use std::fs;
    use std::path::PathBuf;

    const REQUIRED_KEYS: [&str; 7] = ["vocabulary", "order", "commands", "menus", "views", "behaviors", "version"];

    fn taxonomy_path() -> Result<PathBuf, String> {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../eVe/intuition/menu/context_menus.json")
            .canonicalize()
            .map_err(|error| format!("taxonomy_path_unavailable:{error}"))
    }

    fn backup_dir() -> Result<PathBuf, String> {
        let dir = std::env::temp_dir().join("atome_taxonomy_backups");
        fs::create_dir_all(&dir).map_err(|error| format!("taxonomy_backup_dir_failed:{error}"))?;
        Ok(dir)
    }

    pub fn read() -> Result<TaxonomyFile, String> {
        let path = taxonomy_path()?;
        let text = fs::read_to_string(&path).map_err(|error| format!("taxonomy_read_failed:{error}"))?;
        Ok(TaxonomyFile { path: path.to_string_lossy().to_string(), text })
    }

    // The JavaScript editor runs the full validator before calling this; the
    // bridge re-checks what it can on its own side so a malformed document
    // never reaches the repository.
    fn check_document(text: &str) -> Result<(), String> {
        let value: serde_json::Value = serde_json::from_str(text).map_err(|error| format!("taxonomy_json_invalid:{error}"))?;
        let object = value.as_object().ok_or_else(|| "taxonomy_structure_invalid".to_string())?;
        for key in REQUIRED_KEYS {
            if !object.contains_key(key) {
                return Err(format!("taxonomy_key_missing:{key}"));
            }
        }
        if object.get("version").and_then(|version| version.as_u64()) != Some(2) {
            return Err("taxonomy_version_invalid".to_string());
        }
        Ok(())
    }

    // `previous` is the text the editor started from: if the file changed on
    // disk meanwhile (another edit, a checkout), nothing is overwritten.
    pub fn save(text: String, previous: String) -> Result<TaxonomySaveResult, String> {
        save_at(&taxonomy_path()?, &backup_dir()?, text, previous)
    }

    pub(super) fn save_at(path: &std::path::Path, backups: &std::path::Path, text: String, previous: String) -> Result<TaxonomySaveResult, String> {
        check_document(&text)?;
        let path = path.to_path_buf();
        let current = fs::read_to_string(&path).map_err(|error| format!("taxonomy_read_failed:{error}"))?;
        if current != previous {
            return Err("taxonomy_changed_on_disk".to_string());
        }
        let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
        let backup = backups.join(format!("context_menus_{stamp}.json"));
        fs::write(&backup, &current).map_err(|error| format!("taxonomy_backup_failed:{error}"))?;
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, &text).map_err(|error| format!("taxonomy_write_failed:{error}"))?;
        fs::rename(&temporary, &path).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            format!("taxonomy_commit_failed:{error}")
        })?;
        Ok(TaxonomySaveResult {
            path: path.to_string_lossy().to_string(),
            backup: backup.to_string_lossy().to_string(),
            bytes: text.len(),
        })
    }
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn taxonomy_read() -> Result<TaxonomyFile, String> {
    enabled::read()
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn taxonomy_save(text: String, previous: String) -> Result<TaxonomySaveResult, String> {
    enabled::save(text, previous)
}

#[cfg(not(debug_assertions))]
#[tauri::command]
pub fn taxonomy_read() -> Result<TaxonomyFile, String> {
    Err("taxonomy_editor_unavailable".to_string())
}

#[cfg(not(debug_assertions))]
#[tauri::command]
pub fn taxonomy_save(_text: String, _previous: String) -> Result<TaxonomySaveResult, String> {
    Err("taxonomy_editor_unavailable".to_string())
}

#[cfg(all(test, debug_assertions))]
mod tests {
    use super::enabled::save_at;
    use std::fs;

    const VALID: &str = r#"{"version":2,"vocabulary":{},"order":[],"commands":{},"menus":{},"views":{},"behaviors":{}}"#;

    fn sandbox(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("atome_taxonomy_test_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("backups")).unwrap();
        let file = root.join("context_menus.json");
        fs::write(&file, "OLD").unwrap();
        (file, root.join("backups"))
    }

    #[test]
    fn saves_atomically_and_keeps_a_backup() {
        let (file, backups) = sandbox("ok");
        let result = save_at(&file, &backups, VALID.to_string(), "OLD".to_string()).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), VALID);
        assert_eq!(fs::read_to_string(&result.backup).unwrap(), "OLD");
        assert!(!file.with_extension("json.tmp").exists());
    }

    #[test]
    fn refuses_when_the_file_changed_on_disk() {
        let (file, backups) = sandbox("changed");
        let error = save_at(&file, &backups, VALID.to_string(), "SOMETHING ELSE".to_string()).unwrap_err();
        assert_eq!(error, "taxonomy_changed_on_disk");
        assert_eq!(fs::read_to_string(&file).unwrap(), "OLD");
    }

    #[test]
    fn refuses_an_invalid_document() {
        let (file, backups) = sandbox("invalid");
        assert!(save_at(&file, &backups, "{".to_string(), "OLD".to_string()).unwrap_err().starts_with("taxonomy_json_invalid"));
        assert_eq!(save_at(&file, &backups, r#"{"version":1}"#.to_string(), "OLD".to_string()).unwrap_err(), "taxonomy_key_missing:vocabulary");
        let v1 = VALID.replace("\"version\":2", "\"version\":1");
        assert_eq!(save_at(&file, &backups, v1, "OLD".to_string()).unwrap_err(), "taxonomy_version_invalid");
        assert_eq!(fs::read_to_string(&file).unwrap(), "OLD");
    }
}
