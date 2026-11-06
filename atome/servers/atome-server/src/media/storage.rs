// A person's files on the server (server/userHome.js, server/fileStorage.js, the
// upload half of server/userFiles.js and server/file_types.js, ported): their home
// `data/users/<id>` with its `Downloads`, the paths a request may name in it, and
// the file's record in the central database (`registerFileUpload`).
use super::playback::{basename, sanitize_file_name};
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use rusqlite::params;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

const FILE_ATOME_TYPES: [&str; 10] = [
    "file",
    "image",
    "video",
    "sound",
    "audio_recording",
    "video_recording",
    "text",
    "shape",
    "midi",
    "raw",
];

pub struct Storage {
    /// `SQUIRREL_SHELL_USER_ROOT` (else `data/users`) from the project root.
    pub user_root: PathBuf,
    /// `data/uploads_tmp`: the chunks of an upload under way.
    pub uploads_tmp: PathBuf,
}

/// A file's place: its name, its path, and its path from the person's home.
pub struct Placed {
    pub file_name: String,
    pub file_path: PathBuf,
    pub relative_path: String,
}

/// What `registerFileUpload` records of a file.
pub struct Registration<'a> {
    pub atome_id: Option<String>,
    pub atome_type: Option<&'a str>,
    pub original_name: String,
    pub mime_type: Option<String>,
    pub size: u64,
    pub file_path: Option<String>,
}

/// `sanitizeSegment`: each run outside `[a-zA-Z0-9_-]` becomes one `_`.
pub fn sanitize_segment(value: &str) -> String {
    let mut out = String::new();
    let mut in_run = false;
    for c in js::trim(value).chars() {
        let kept = c.is_ascii_alphanumeric() || c == '_' || c == '-';
        if kept {
            out.push(c);
        } else if !in_run {
            out.push('_');
        }
        in_run = !kept;
    }
    out
}

fn cleaned(raw: &str) -> String {
    let text = js::trim(raw).replace('\\', "/");
    match text.get(..7) {
        Some(scheme) if scheme.eq_ignore_ascii_case("file://") => text[7..].to_string(),
        _ => text,
    }
}

fn normalize_relative_path(raw: &str) -> String {
    let cleaned = cleaned(raw);
    let parts: Vec<&str> = cleaned
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .collect();
    let last = parts.len().saturating_sub(1);
    parts
        .iter()
        .enumerate()
        .map(|(index, part)| {
            if index == last {
                sanitize_file_name(part)
            } else {
                sanitize_segment(part)
            }
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// `normalizeUserRelativePath`: a path in the person's home, without the home's own prefix.
pub fn normalize_user_relative_path(raw: &str, user_id: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }
    let user = sanitize_segment(if user_id.is_empty() { "user" } else { user_id });
    let mut cleaned = cleaned(raw);
    let anchor = format!("/data/users/{user}/");
    let relative_anchor = format!("data/users/{user}/");
    if let Some(found) = cleaned.find(&anchor) {
        cleaned = cleaned[found + anchor.len()..].to_string();
    } else if let Some(rest) = cleaned.strip_prefix(&relative_anchor) {
        cleaned = rest.to_string();
    } else if let Some(rest) = cleaned.strip_prefix(&format!("{user}/")) {
        cleaned = rest.to_string();
    }
    normalize_relative_path(&cleaned)
}

fn private_directory(path: &Path) -> std::io::Result<()> {
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(path)
}

impl Storage {
    /// `ensureUserHome`: the home made on first use, with its `welcome.txt`.
    pub fn home(&self, user_id: &str) -> std::io::Result<PathBuf> {
        let label = sanitize_segment(user_id);
        let home = self.user_root.join(&label);
        private_directory(&self.user_root)?;
        private_directory(&home)?;
        let welcome = home.join("welcome.txt");
        if !welcome.exists() {
            let text = format!(
                "Welcome {label}\nUser ID: {user_id}\nCreated: {}\n",
                atome_store::append::iso_now()
            );
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(welcome)?;
            std::io::Write::write_all(&mut file, text.as_bytes())?;
        }
        Ok(home)
    }

    /// `resolveUserFilePath`: `name`, sanitized, in the home's `Downloads` (made on first use).
    pub fn downloads_file(&self, user_id: &str, name: &str) -> std::io::Result<PathBuf> {
        let downloads = self.home(user_id)?.join("Downloads");
        private_directory(&downloads)?;
        Ok(downloads.join(sanitize_file_name(name)))
    }

    /// `resolveUserUploadPath`: a free name in `Downloads`, `name_1.ext` and on when taken.
    pub fn upload_path(&self, user_id: &str, raw_name: &str) -> std::io::Result<Placed> {
        let downloads = self.home(user_id)?.join("Downloads");
        private_directory(&downloads)?;
        let sanitized = sanitize_file_name(raw_name);
        let (stem, extension) = match super::playback::extension_of(&sanitized) {
            Some(extension) => (
                &sanitized[..sanitized.len() - extension.len() - 1],
                format!(".{extension}"),
            ),
            None => (sanitized.as_str(), String::new()),
        };
        let mut candidate = sanitized.clone();
        let mut counter = 1;
        while downloads.join(&candidate).exists() {
            candidate = format!("{stem}_{counter}{extension}");
            counter += 1;
        }
        Ok(Placed {
            file_path: downloads.join(&candidate),
            relative_path: format!("Downloads/{candidate}"),
            file_name: candidate,
        })
    }

    /// `listUserDownloadsSnapshot`: the first 50 entries of `Downloads` (a debug answer).
    pub fn downloads_snapshot(&self, user_id: &str) -> JsonValue {
        let listed = || -> std::io::Result<(PathBuf, Vec<JsonValue>)> {
            let downloads = self.home(user_id)?.join("Downloads");
            private_directory(&downloads)?;
            let mut entries = std::fs::read_dir(&downloads)?.collect::<Result<Vec<_>, _>>()?;
            // libuv's scandir order.
            entries.sort_by(|a, b| {
                a.file_name()
                    .as_encoded_bytes()
                    .cmp(b.file_name().as_encoded_bytes())
            });
            let mut files = Vec::new();
            for entry in entries.into_iter().take(50) {
                let name = entry.file_name().to_string_lossy().into_owned();
                let kind = entry.file_type()?;
                if kind.is_file() {
                    let size = std::fs::metadata(entry.path()).ok().map(|meta| meta.len());
                    files.push(json!({ "name": name, "size": size }));
                } else if kind.is_dir() {
                    files.push(json!({ "name": format!("{name}/"), "size": null }));
                }
            }
            Ok((downloads, files))
        };
        match listed() {
            Ok((downloads, files)) => {
                json!({ "ok": true, "downloadsDir": downloads.display().to_string(), "files": files })
            }
            Err(error) => {
                json!({ "ok": false, "error": error.to_string(), "downloadsDir": null, "files": [] })
            }
        }
    }

    /// `listUserDownloads`: the files of `Downloads`, each with the atome of the owner's
    /// vault that describes it (`files:described`), the newest first.
    pub async fn downloads(
        &self,
        router: &VaultRouter,
        user_id: &str,
    ) -> Result<Vec<JsonValue>, String> {
        let downloads = self
            .home(user_id)
            .map_err(|e| e.to_string())?
            .join("Downloads");
        private_directory(&downloads).map_err(|e| e.to_string())?;
        let mut entries = std::fs::read_dir(&downloads)
            .and_then(|listed| listed.collect::<Result<Vec<_>, _>>())
            .map_err(|e| e.to_string())?;
        // libuv's scandir order, which the sort below keeps among equal dates.
        entries.sort_by(|a, b| {
            a.file_name()
                .as_encoded_bytes()
                .cmp(b.file_name().as_encoded_bytes())
        });
        let names: Vec<String> = entries
            .iter()
            .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
            .map(|entry| sanitize_file_name(&entry.file_name().to_string_lossy()))
            .collect();
        // The anonymous principal has no vault.
        let mut described: HashMap<String, JsonValue> = HashMap::new();
        if user_id != "anonymous" {
            for batch in names.chunks(1000) {
                let rows = router
                    .service(
                        "router:describe-files",
                        &json!({ "owner_id": user_id, "file_names": batch }),
                    )
                    .await?;
                for row in rows.as_array().into_iter().flatten() {
                    let name = js::text(row.get("file_name"));
                    described.entry(name).or_insert_with(|| row.clone());
                }
            }
        }
        let mut files = Vec::new();
        for name in names {
            let Ok(meta) = std::fs::metadata(downloads.join(&name)) else {
                continue;
            };
            let description = described.get(&name);
            // Node's `stats.mtime`: `mtimeMs` (seconds and nanoseconds in a double)
            // rounded to the millisecond.
            let mtime: chrono::DateTime<chrono::Utc> =
                meta.modified().map_err(|e| e.to_string())?.into();
            let millis = (mtime.timestamp() as f64 * 1e3
                + f64::from(mtime.timestamp_subsec_nanos()) / 1e6
                + 0.5)
                .floor() as i64;
            let modified =
                chrono::DateTime::from_timestamp_millis(millis).ok_or("mtime_out_of_range")?;
            files.push(json!({
                "id": description.and_then(|row| js::first(row, &["atome_id"]).cloned()),
                "name": display_name(description, &name),
                "file_name": name,
                "size": meta.len(),
                "modified": modified.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                "owner_id": user_id,
                "access": "owner",
                "shared": false,
                "profiles": description.and_then(|row| js::first(row, &["profiles"]).cloned()).unwrap_or(json!([])),
            }));
        }
        files.sort_by(|a, b| b["modified"].as_str().cmp(&a["modified"].as_str()));
        Ok(files)
    }

    /// `resolveUserAssetPath`: a path the request names in the home, its folder made.
    pub fn asset_path(&self, user_id: &str, raw_path: &str) -> Result<Placed, String> {
        let home = self.home(user_id).map_err(|e| e.to_string())?;
        let relative_path = normalize_user_relative_path(raw_path, user_id);
        if relative_path.is_empty() {
            return Err("Invalid asset path".into());
        }
        let file_path = home.join(&relative_path);
        if let Some(parent) = file_path.parent() {
            private_directory(parent).map_err(|e| e.to_string())?;
        }
        Ok(Placed {
            file_name: basename(&relative_path).to_string(),
            file_path,
            relative_path,
        })
    }
}

// `pickDisplayName`: the first named of original_name, file_name, name.
fn display_name(row: Option<&JsonValue>, fallback: &str) -> String {
    ["original_name", "file_name", "name"]
        .iter()
        .filter_map(|key| {
            row.and_then(|row| row.get(*key))
                .and_then(JsonValue::as_str)
        })
        .find(|text| !js::trim(text).is_empty())
        .unwrap_or(fallback)
        .to_string()
}

// `inferFileAtomeType`: midi before the generic audio type.
fn inferred_type(name: &str, mime: &str) -> &'static str {
    let extension = super::playback::extension_of(name)
        .map(str::to_lowercase)
        .unwrap_or_default();
    let has = |list: &[&str]| list.contains(&extension.as_str());
    let mime = js::trim(mime).to_lowercase();
    let midi_mime = [
        "audio/midi",
        "audio/x-midi",
        "audio/sp-midi",
        "application/x-midi",
    ];
    if has(&["mid", "midi", "smf"]) || midi_mime.contains(&mime.as_str()) {
        "midi"
    } else if has(&["svg"]) || mime == "image/svg+xml" {
        "shape"
    } else if has(&[
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "ico",
    ]) || mime.starts_with("image/")
    {
        "image"
    } else if has(&["mp4", "mov", "webm", "mkv", "avi", "mpeg", "mpg", "m4v"])
        || mime.starts_with("video/")
    {
        "video"
    } else if has(&[
        "mp3", "wav", "ogg", "flac", "aac", "m4a", "aiff", "aif", "opus", "weba",
    ]) || mime.starts_with("audio/")
    {
        "sound"
    } else if has(&["txt", "md", "markdown", "csv", "tsv", "log"])
        || [
            "text/plain",
            "text/markdown",
            "text/csv",
            "text/tab-separated-values",
        ]
        .contains(&mime.as_str())
    {
        "text"
    } else {
        "raw"
    }
}

// `resolveFileAtomeType`: the type asked when it is a file type, else the inferred one.
fn file_type(file_name: &str, registration: &Registration<'_>) -> String {
    let asked = registration
        .atome_type
        .map(|asked| js::trim(asked).to_lowercase());
    if let Some(asked) = asked.filter(|asked| FILE_ATOME_TYPES.contains(&asked.as_str())) {
        return asked;
    }
    let named = js::trim(&registration.original_name);
    let source = if named.is_empty() {
        file_name
    } else {
        &registration.original_name
    };
    inferred_type(source, registration.mime_type.as_deref().unwrap_or("")).into()
}

/// `resolveOwnerPrincipal`: the account a file may belong to, else the caller's reason.
pub async fn owner(central: &Central, user_id: &str) -> Result<(), String> {
    let id = js::trim(user_id);
    if id.is_empty() || id == "anonymous" {
        return Err("upload_identity_required".into());
    }
    central
        .get(
            "SELECT atome_id FROM atomes WHERE atome_id = ? LIMIT 1",
            vec![json!(id)],
        )
        .await?
        .map(|_| ())
        .ok_or_else(|| "remote_account_not_provisioned".into())
}

/// `registerFileUpload`: the owner checked, then the file's atome and particles
/// written in one unit; its atome id.
pub async fn register(
    central: &Central,
    file_name: &str,
    user_id: &str,
    registration: Registration<'_>,
) -> Result<String, String> {
    owner(central, user_id).await?;
    let atome_id = registration
        .atome_id
        .clone()
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| format!("file_{}", uuid::Uuid::new_v4().simple()));
    let atome_type = file_type(file_name, &registration);
    let original = if registration.original_name.is_empty() {
        file_name.to_string()
    } else {
        registration.original_name.clone()
    };
    let particles = [
        ("file_name", Some(json!(file_name))),
        ("original_name", Some(json!(original))),
        (
            "mime_type",
            registration.mime_type.clone().map(JsonValue::from),
        ),
        (
            "file_path",
            registration.file_path.clone().map(JsonValue::from),
        ),
        ("size", Some(json!(registration.size))),
        ("is_public", Some(json!(false))),
    ];
    let user = user_id.to_string();
    let registered = atome_id.clone();
    central
        .committed(move |db| {
            let now = atome_store::append::iso_now();
            db.execute(
                "INSERT OR REPLACE INTO atomes (atome_id, atome_type, owner_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, COALESCE((SELECT created_at FROM atomes WHERE atome_id = ?1), ?4), ?4)",
                params![atome_id, atome_type, user, now],
            )
            .map_err(|e| e.to_string())?;
            for (key, value) in particles {
                let Some(value) = value else { continue };
                db.execute(
                    "INSERT OR REPLACE INTO particles (atome_id, particle_key, particle_value, updated_at)
                     VALUES (?, ?, ?, ?)",
                    params![atome_id, key, value.to_string(), now],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(())
        })
        .await??;
    Ok(registered)
}

// The chunks `0.part` to `count - 1` end to end; a missing one fails as Node's
// read stream does, and the partial file is not left behind.
pub async fn assemble(directory: &Path, count: u64, output: &Path) -> Result<(), String> {
    let mut file = tokio::fs::File::create(output)
        .await
        .map_err(|e| e.to_string())?;
    for index in 0..count {
        let chunk = directory.join(format!("{index}.part"));
        let mut input = match tokio::fs::File::open(&chunk).await {
            Ok(input) => input,
            Err(error) => {
                drop(file);
                let _ = tokio::fs::remove_file(output).await;
                return Err(if error.kind() == std::io::ErrorKind::NotFound {
                    format!(
                        "ENOENT: no such file or directory, open '{}'",
                        chunk.display()
                    )
                } else {
                    error.to_string()
                });
            }
        };
        tokio::io::copy(&mut input, &mut file)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(|e| e.to_string())
}
