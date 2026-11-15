// The bytes of a deleted media are kept aside, not erased: a delete moves them out of every
// place a listing or a recovery reads (`Downloads`, the stored `file_path`) into the home's
// `.deleted/<atome>/`, keeping their path from the home; a `restore` (the undo of a delete,
// history_command.rs) puts them back; `purge` erases what has waited longer than `KEEP`.
// Erasing at once lost the take for good when the deletion was undone: the atome came back,
// its video did not, a frame drawing nothing. Shared by the local server (local_atome_media_removal.rs)
// and the cloud (media/removal.rs).
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime};

/// The folder of a home holding the deleted media's bytes.
pub const TRASH_DIR: &str = ".deleted";
/// How long a deletion stays undoable with its bytes.
pub const KEEP: Duration = Duration::from_secs(30 * 24 * 60 * 60);
// Rewritten at each deletion: its time is the deletion's.
const MARK: &str = ".kept";

// An atome id as one folder name (`__eve_page_ghost:x:top` → `__eve_page_ghost_x_top`).
fn folder_of(atome_id: &str) -> Option<String> {
    let name: String = atome_id
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    (!name.is_empty()).then_some(name)
}

fn folder(home: &Path, atome_id: &str) -> Option<PathBuf> {
    folder_of(atome_id).map(|name| home.join(TRASH_DIR).join(name))
}

fn private_directory(path: &Path) -> std::io::Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(path)
}

/// Moves `file`, inside `home`, to `home/.deleted/<atome_id>/` at its path from `home`.
/// Nothing for a file already gone; `false` when nothing was moved.
pub fn keep(home: &Path, atome_id: &str, file: &Path) -> Result<bool, String> {
    let Some(folder) = folder(home, atome_id) else {
        return Err("media_trash_atome_invalid".into());
    };
    let Ok(relative) = file.strip_prefix(home) else {
        return Err("media_trash_outside_home".into());
    };
    if !relative
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
        || relative.starts_with(TRASH_DIR)
    {
        return Err("media_trash_outside_home".into());
    }
    if !file.is_file() {
        return Ok(false);
    }
    let target = folder.join(relative);
    let parent = target.parent().unwrap_or(&folder);
    private_directory(parent).map_err(|error| format!("media_trash_failed:{error}"))?;
    if target.exists() {
        std::fs::remove_file(&target).map_err(|error| format!("media_trash_failed:{error}"))?;
    }
    std::fs::rename(file, &target).map_err(|error| format!("media_trash_failed:{error}"))?;
    std::fs::write(folder.join(MARK), b"")
        .map_err(|error| format!("media_trash_failed:{error}"))?;
    Ok(true)
}

fn files_under(root: &Path, found: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(root)? {
        let path = entry?.path();
        if path.is_dir() {
            files_under(&path, found)?;
        } else if path.file_name().and_then(|name| name.to_str()) != Some(MARK) {
            found.push(path);
        }
    }
    Ok(())
}

/// Puts back at its place every file kept for `atome_id`; a file already lying there wins
/// and its kept copy stays until purged. The number of files put back.
pub fn restore(home: &Path, atome_id: &str) -> Result<usize, String> {
    let Some(folder) = folder(home, atome_id) else {
        return Ok(0);
    };
    if !folder.is_dir() {
        return Ok(0);
    }
    let mut kept = Vec::new();
    files_under(&folder, &mut kept).map_err(|error| format!("media_restore_failed:{error}"))?;
    let mut restored = 0;
    for file in kept {
        let Ok(relative) = file.strip_prefix(&folder) else {
            continue;
        };
        let target = home.join(relative);
        if target.exists() {
            continue;
        }
        if let Some(parent) = target.parent() {
            private_directory(parent).map_err(|error| format!("media_restore_failed:{error}"))?;
        }
        std::fs::rename(&file, &target).map_err(|error| format!("media_restore_failed:{error}"))?;
        // Dated now: a file mirror keeping tombstones (iOS FileSyncCoordinator) takes a path back
        // only when its file is newer than its deletion; the kept date would have it erased again.
        std::fs::File::options()
            .write(true)
            .open(&target)
            .and_then(|opened| opened.set_modified(SystemTime::now()))
            .map_err(|error| format!("media_restore_failed:{error}"))?;
        restored += 1;
    }
    let mut left = Vec::new();
    files_under(&folder, &mut left).map_err(|error| format!("media_restore_failed:{error}"))?;
    if left.is_empty() {
        std::fs::remove_dir_all(&folder)
            .map_err(|error| format!("media_restore_failed:{error}"))?;
    }
    Ok(restored)
}

/// Erases, in every home under `user_root`, the bytes of deletions older than `keep`.
/// The number of deletions erased.
pub fn purge(user_root: &Path, keep: Duration) -> Result<usize, String> {
    let Ok(homes) = std::fs::read_dir(user_root) else {
        return Ok(0);
    };
    let now = SystemTime::now();
    let mut erased = 0;
    for home in homes.flatten() {
        let Ok(deletions) = std::fs::read_dir(home.path().join(TRASH_DIR)) else {
            continue;
        };
        for deletion in deletions.flatten() {
            let path = deletion.path();
            let marked = std::fs::metadata(path.join(MARK))
                .or_else(|_| std::fs::metadata(&path))
                .and_then(|meta| meta.modified());
            let expired = marked
                .ok()
                .and_then(|at| now.duration_since(at).ok())
                .is_some_and(|age| age >= keep);
            if expired && path.is_dir() {
                std::fs::remove_dir_all(&path)
                    .map_err(|error| format!("media_purge_failed:{error}"))?;
                erased += 1;
            }
        }
    }
    Ok(erased)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_deleted_file_is_kept_aside_then_put_back_or_purged() {
        let root = tempfile::tempdir().expect("root");
        let home = root.path().join("user");
        let take = home.join("recordings").join("take.mov");
        std::fs::create_dir_all(take.parent().unwrap()).unwrap();
        std::fs::write(&take, b"bytes").unwrap();

        assert!(keep(&home, "video_recording_1", &take).expect("kept"));
        assert!(!take.exists(), "no listing reads it any more");
        assert!(
            home.join(".deleted/video_recording_1/recordings/take.mov")
                .is_file()
        );
        let old = SystemTime::now() - Duration::from_secs(3600);
        std::fs::File::options()
            .write(true)
            .open(home.join(".deleted/video_recording_1/recordings/take.mov"))
            .and_then(|kept| kept.set_modified(old))
            .unwrap();
        assert_eq!(restore(&home, "video_recording_1").expect("restored"), 1);
        assert_eq!(std::fs::read(&take).unwrap(), b"bytes");
        let dated = std::fs::metadata(&take).unwrap().modified().unwrap();
        assert!(dated > old, "dated by its restore, not by its first write");
        assert!(!home.join(".deleted/video_recording_1").exists());

        assert!(keep(&home, "video_recording_1", &take).expect("kept again"));
        assert_eq!(purge(root.path(), KEEP).expect("young"), 0);
        assert_eq!(purge(root.path(), Duration::ZERO).expect("old"), 1);
        assert_eq!(restore(&home, "video_recording_1").expect("nothing"), 0);
        assert!(!take.exists());
    }

    #[test]
    fn a_file_outside_the_home_or_already_gone_is_refused_or_skipped() {
        let root = tempfile::tempdir().expect("root");
        let home = root.path().join("user");
        std::fs::create_dir_all(&home).unwrap();
        assert!(!keep(&home, "a", &home.join("Downloads/none.mov")).expect("gone"));
        assert!(keep(&home, "a", &root.path().join("other.mov")).is_err());
        assert!(keep(&home, "a", &home.join(".deleted/b/x.mov")).is_err());
    }
}
