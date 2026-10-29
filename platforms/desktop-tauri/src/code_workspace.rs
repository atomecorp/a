//! A code project's view of the repository (user, 2026-10-29): on the developer's Mac only, eVe reads the
//! source checkout the debug build was compiled from to write precise plans, and files each plan in
//! `todo/code_projects/<name>.md`. Four dedicated commands, never a generic file API: list, read and
//! search inside the repository (secrets and build output refused), and write one Markdown plan under
//! `todo/code_projects/`. They only exist in debug builds: a release build carries stubs that refuse, so
//! the public app reaches no repository at all (a structural guard, not a hidden button).

use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct RepoEntry {
    name: String,
    kind: String,
}

#[derive(Serialize, Debug)]
pub struct RepoFile {
    path: String,
    text: String,
    from_line: usize,
    total_lines: usize,
}

#[derive(Serialize, Debug)]
pub struct RepoHit {
    path: String,
    line: usize,
    text: String,
}

#[derive(Serialize, Debug)]
pub struct TodoWritten {
    path: String,
    bytes: usize,
}

#[cfg(debug_assertions)]
mod enabled {
    use super::{RepoEntry, RepoFile, RepoHit, TodoWritten};
    use std::fs;
    use std::path::{Component, Path, PathBuf};

    const MAX_READ_BYTES: u64 = 512 * 1024;
    const MAX_LINES: usize = 400;
    const MAX_HITS: usize = 50;
    const MAX_VISITED: usize = 20_000;
    // Never read: history, dependencies, build output, local data, scratch, agent settings.
    const SKIPPED_DIRS: [&str; 12] = [".git", "node_modules", "target", "data", "temp", "dist", "build", "gen", "DerivedData", ".claude", "certs", "secrets"];

    pub(super) fn repository_root() -> Result<PathBuf, String> {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .map_err(|error| format!("code_repository_unavailable:{error}"))
    }

    // A secret is never handed to a model: environment files, keys, certificates, provisioning profiles.
    fn is_secret(name: &str) -> bool {
        let lower = name.to_ascii_lowercase();
        lower.starts_with(".env") || lower.ends_with(".env") || lower.contains("secret") || lower.contains("credential")
            || [".pem", ".key", ".p8", ".p12", ".cer", ".mobileprovision", ".keystore", ".jks"].iter().any(|suffix| lower.ends_with(suffix))
    }

    fn refused(name: &str) -> bool {
        SKIPPED_DIRS.contains(&name) || is_secret(name)
    }

    // A relative path inside the repository, resolved through its links and checked again once resolved.
    pub(super) fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
        let relative = Path::new(relative.trim().trim_start_matches("./"));
        if relative.is_absolute() {
            return Err("code_path_absolute".to_string());
        }
        for component in relative.components() {
            match component {
                Component::Normal(part) => {
                    if refused(&part.to_string_lossy()) {
                        return Err("code_path_refused".to_string());
                    }
                }
                Component::CurDir => {}
                _ => return Err("code_path_outside".to_string()),
            }
        }
        let resolved = root.join(relative).canonicalize().map_err(|_| "code_path_not_found".to_string())?;
        if !resolved.starts_with(root) {
            return Err("code_path_outside".to_string());
        }
        Ok(resolved)
    }

    fn relative_to(root: &Path, path: &Path) -> String {
        path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
    }

    pub(super) fn list_at(root: &Path, relative: &str) -> Result<Vec<RepoEntry>, String> {
        let dir = resolve(root, relative)?;
        let mut entries: Vec<RepoEntry> = fs::read_dir(&dir)
            .map_err(|error| format!("code_list_failed:{error}"))?
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                if refused(&name) {
                    return None;
                }
                let kind = if entry.path().is_dir() { "dir" } else { "file" };
                Some(RepoEntry { name, kind: kind.to_string() })
            })
            .collect();
        entries.sort_by(|a, b| (a.kind != "dir", a.name.to_lowercase()).cmp(&(b.kind != "dir", b.name.to_lowercase())));
        Ok(entries)
    }

    pub(super) fn read_at(root: &Path, relative: &str, from_line: usize, lines: usize) -> Result<RepoFile, String> {
        let path = resolve(root, relative)?;
        let size = fs::metadata(&path).map_err(|error| format!("code_read_failed:{error}"))?.len();
        if !path.is_file() {
            return Err("code_path_not_file".to_string());
        }
        if size > MAX_READ_BYTES {
            return Err("code_file_too_large".to_string());
        }
        let text = fs::read_to_string(&path).map_err(|_| "code_file_not_text".to_string())?;
        let all: Vec<&str> = text.lines().collect();
        let start = from_line.max(1);
        let count = lines.clamp(1, MAX_LINES);
        let shown = all.iter().skip(start - 1).take(count).cloned().collect::<Vec<_>>().join("\n");
        Ok(RepoFile { path: relative_to(root, &path), text: shown, from_line: start, total_lines: all.len() })
    }

    fn walk(root: &Path, dir: &Path, needle: &str, hits: &mut Vec<RepoHit>, visited: &mut usize) {
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.filter_map(|entry| entry.ok()) {
            if hits.len() >= MAX_HITS || *visited >= MAX_VISITED {
                return;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if refused(&name) {
                continue;
            }
            let path = entry.path();
            // A link could lead out of the repository: it is not followed.
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                walk(root, &path, needle, hits, visited);
                continue;
            }
            *visited += 1;
            if fs::metadata(&path).map(|meta| meta.len() > MAX_READ_BYTES).unwrap_or(true) {
                continue;
            }
            let Ok(text) = fs::read_to_string(&path) else { continue };
            for (index, line) in text.lines().enumerate() {
                if line.to_lowercase().contains(needle) {
                    hits.push(RepoHit { path: relative_to(root, &path), line: index + 1, text: line.trim().chars().take(200).collect() });
                    if hits.len() >= MAX_HITS {
                        return;
                    }
                }
            }
        }
    }

    pub(super) fn search_at(root: &Path, text: &str, relative: &str) -> Result<Vec<RepoHit>, String> {
        let needle = text.trim().to_lowercase();
        if needle.len() < 2 {
            return Err("code_search_too_short".to_string());
        }
        let dir = resolve(root, if relative.trim().is_empty() { "." } else { relative })?;
        let mut hits = Vec::new();
        let mut visited = 0;
        walk(root, &dir, &needle, &mut hits, &mut visited);
        Ok(hits)
    }

    // The plan of a code project, `todo/code_projects/<name>.md`: the name is reduced to a file name of its own.
    pub(super) fn write_todo_at(root: &Path, name: &str, text: &str) -> Result<TodoWritten, String> {
        let slug: String = name.trim().to_lowercase().chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect::<String>().split('_').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("_");
        if slug.is_empty() || slug.len() > 80 {
            return Err("code_todo_name_invalid".to_string());
        }
        let dir = root.join("todo").join("code_projects");
        fs::create_dir_all(&dir).map_err(|error| format!("code_todo_dir_failed:{error}"))?;
        let path = dir.join(format!("{slug}.md"));
        let temporary = dir.join(format!("{slug}.md.tmp"));
        fs::write(&temporary, text).map_err(|error| format!("code_todo_write_failed:{error}"))?;
        fs::rename(&temporary, &path).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            format!("code_todo_commit_failed:{error}")
        })?;
        Ok(TodoWritten { path: relative_to(root, &path), bytes: text.len() })
    }
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn code_repo_list(path: String) -> Result<Vec<RepoEntry>, String> {
    enabled::list_at(&enabled::repository_root()?, &path)
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn code_repo_read(path: String, from_line: usize, lines: usize) -> Result<RepoFile, String> {
    enabled::read_at(&enabled::repository_root()?, &path, from_line, lines)
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn code_repo_search(text: String, path: String) -> Result<Vec<RepoHit>, String> {
    enabled::search_at(&enabled::repository_root()?, &text, &path)
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn code_todo_write(name: String, text: String) -> Result<TodoWritten, String> {
    enabled::write_todo_at(&enabled::repository_root()?, &name, &text)
}

#[cfg(not(debug_assertions))]
#[tauri::command]
pub fn code_repo_list(_path: String) -> Result<Vec<RepoEntry>, String> {
    Err("code_repository_unavailable".to_string())
}

#[cfg(not(debug_assertions))]
#[tauri::command]
pub fn code_repo_read(_path: String, _from_line: usize, _lines: usize) -> Result<RepoFile, String> {
    Err("code_repository_unavailable".to_string())
}

#[cfg(not(debug_assertions))]
#[tauri::command]
pub fn code_repo_search(_text: String, _path: String) -> Result<Vec<RepoHit>, String> {
    Err("code_repository_unavailable".to_string())
}

#[cfg(not(debug_assertions))]
#[tauri::command]
pub fn code_todo_write(_name: String, _text: String) -> Result<TodoWritten, String> {
    Err("code_repository_unavailable".to_string())
}

#[cfg(all(test, debug_assertions))]
mod tests {
    use super::enabled::{list_at, read_at, resolve, search_at, write_todo_at};
    use std::fs;

    fn sandbox(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("atome_code_workspace_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("eVe/domains")).unwrap();
        fs::create_dir_all(root.join("node_modules/x")).unwrap();
        fs::write(root.join("eVe/domains/a.js"), "const alpha = 1;\nconst beta = 2;\n").unwrap();
        fs::write(root.join(".env"), "KEY=secret").unwrap();
        fs::write(root.join("node_modules/x/a.js"), "const alpha = 3;").unwrap();
        root.canonicalize().unwrap()
    }

    #[test]
    fn refuses_what_leaves_or_hides_secrets() {
        let root = sandbox("refuse");
        assert_eq!(resolve(&root, "../etc").unwrap_err(), "code_path_outside");
        assert_eq!(resolve(&root, "/etc/passwd").unwrap_err(), "code_path_absolute");
        assert_eq!(resolve(&root, ".env").unwrap_err(), "code_path_refused");
        assert_eq!(resolve(&root, "node_modules/x/a.js").unwrap_err(), "code_path_refused");
        assert!(!list_at(&root, ".").unwrap().iter().any(|entry| entry.name == ".env" || entry.name == "node_modules"));
    }

    #[test]
    fn reads_a_window_and_searches_outside_skipped_dirs() {
        let root = sandbox("read");
        let file = read_at(&root, "eVe/domains/a.js", 2, 1).unwrap();
        assert_eq!((file.text.as_str(), file.total_lines), ("const beta = 2;", 2));
        let hits = search_at(&root, "ALPHA", "").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!((hits[0].path.as_str(), hits[0].line), ("eVe/domains/a.js", 1));
    }

    #[test]
    fn files_a_plan_under_todo_code_projects() {
        let root = sandbox("todo");
        let written = write_todo_at(&root, "Atelier eVe !", "# Plan").unwrap();
        assert_eq!(written.path, "todo/code_projects/atelier_eve.md");
        assert_eq!(fs::read_to_string(root.join(&written.path)).unwrap(), "# Plan");
        assert_eq!(write_todo_at(&root, "../..", "x").unwrap_err(), "code_todo_name_invalid");
    }
}
