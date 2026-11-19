//! Opens a `.lpproj` bundle (a directory) read-only: its `Project.sqlite` object
//! store and its `Resources/` audio files. Nothing in the bundle is ever written:
//! the store's bytes are read by the crate's own reader (sqlite_store), no SQLite
//! connection is opened, so no journal or WAL file can appear beside it.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::model::{LoopyProject, LoopyResource};
use crate::reader::{read_project, store_objects};

#[derive(Debug)]
pub enum BundleError {
    NotABundle(PathBuf),
    Store(String),
    Io(String),
    Read(crate::reader::ReadError),
}

impl std::fmt::Display for BundleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotABundle(path) => write!(f, "lpproj_not_a_bundle:{}", path.display()),
            Self::Store(message) => write!(f, "lpproj_store:{message}"),
            Self::Io(message) => write!(f, "lpproj_io:{message}"),
            Self::Read(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for BundleError {}

/// The audio file of every used resource id in `Resources/` (`<resource id>.<ext>`),
/// with its content hash. Files no segment plays and files that are not audio
/// (`.moduleState`, `Cached/`) are left aside, unread.
fn bundle_resources(
    root: &Path,
    used: &BTreeSet<String>,
) -> Result<BTreeMap<String, LoopyResource>, BundleError> {
    const AUDIO: &[&str] = &["aiff", "aif", "wav", "caf", "m4a", "mp3", "flac"];
    let mut resources = BTreeMap::new();
    let directory = root.join("Resources");
    let entries = match fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(resources),
        Err(error) => return Err(BundleError::Io(error.to_string())),
    };
    for entry in entries {
        let path = entry.map_err(|e| BundleError::Io(e.to_string()))?.path();
        let (Some(stem), Some(extension)) = (
            path.file_stem().and_then(|s| s.to_str()),
            path.extension().and_then(|s| s.to_str()),
        ) else {
            continue;
        };
        if !used.contains(stem)
            || !path.is_file()
            || !AUDIO.contains(&extension.to_ascii_lowercase().as_str())
        {
            continue;
        }
        let mut file = fs::File::open(&path).map_err(|e| BundleError::Io(e.to_string()))?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1 << 20];
        let mut byte_length = 0u64;
        loop {
            let read = file
                .read(&mut buffer)
                .map_err(|e| BundleError::Io(e.to_string()))?;
            if read == 0 {
                break;
            }
            byte_length += read as u64;
            hasher.update(&buffer[..read]);
        }
        let sha256 = hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        resources.insert(
            stem.to_owned(),
            LoopyResource {
                resource_id: stem.to_owned(),
                file_name: format!("{stem}.{extension}"),
                sha256,
                byte_length,
            },
        );
    }
    Ok(resources)
}

/// Reads a whole bundle: the normalized project, every used resource hashed.
pub fn read_bundle(root: &Path) -> Result<LoopyProject, BundleError> {
    let store = root.join("Project.sqlite");
    if !store.is_file() {
        return Err(BundleError::NotABundle(root.to_owned()));
    }
    for journal in ["Project.sqlite-wal", "Project.sqlite-journal"] {
        if root.join(journal).exists() {
            return Err(BundleError::Store(format!(
                "{journal} present: close the project in Loopy Pro first"
            )));
        }
    }
    let bytes = fs::read(&store).map_err(|e| BundleError::Io(e.to_string()))?;
    let rows = store_objects(&bytes).map_err(|e| BundleError::Store(e.to_string()))?;
    let used: BTreeSet<String> = rows
        .iter()
        .filter(|row| row.kind == "AudioSegment")
        .filter_map(|row| row.contents.get("resourceId")?.as_str().map(str::to_owned))
        .collect();
    let resources = bundle_resources(root, &used)?;
    read_project(rows, &resources).map_err(BundleError::Read)
}
