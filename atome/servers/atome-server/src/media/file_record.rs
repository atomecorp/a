// A stored file's record in the central database (server/userFiles.js `registerFileUpload` and
// server/file_types.js, ported): its type, the account it may belong to, and its atome and
// particles written in one unit. A registration names its atome by the caller's id
// (`X-Atome-Id`, the `file` family's `atome_id`): it may only be a new atome or one of the
// caller's own files, never another account's atome nor an account itself (R-246 BUG-0027),
// including an atome held only in another person's vault (its bytes not uploaded yet), unless a
// share lets the caller write it and that vault holds it as a media record (a recording made in a
// project shared with them): the file is then its vault's owner's, never the caller's, so their own
// upload of it still lands (R-246 retest2). A project, a text or any other object of theirs is never
// named. The ids the server gives its own copies (`newsclean_<id>`, social/news/media.rs) are
// never named by a caller.
use crate::vault_router::central::Central;
use crate::vault_router::{VaultRouter, js};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

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

/// What `registerFileUpload` records of a file.
pub struct Registration<'a> {
    pub atome_id: Option<String>,
    pub atome_type: Option<&'a str>,
    pub original_name: String,
    pub mime_type: Option<String>,
    pub size: u64,
    pub file_path: Option<String>,
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
    router: &VaultRouter,
    file_name: &str,
    user_id: &str,
    registration: Registration<'_>,
) -> Result<String, String> {
    if let Some(id) = registration.atome_id.as_deref()
        && id.starts_with(SERVER_COPY_PREFIX)
    {
        return Err(NOT_OWNED.into());
    }
    record(router, file_name, user_id, registration).await
}

/// The prefix of the ids the server gives its own copies of a media (a News' clean copy).
pub(crate) const SERVER_COPY_PREFIX: &str = "newsclean_";

/// `register` for the server's own copy of a media, whose id it made (`SERVER_COPY_PREFIX`).
pub async fn register_server_copy(
    router: &VaultRouter,
    file_name: &str,
    user_id: &str,
    registration: Registration<'_>,
) -> Result<String, String> {
    record(router, file_name, user_id, registration).await
}

async fn record(
    router: &VaultRouter,
    file_name: &str,
    user_id: &str,
    registration: Registration<'_>,
) -> Result<String, String> {
    let central = router.central();
    owner(central, user_id).await?;
    let named = registration.atome_id.clone().filter(|id| !id.is_empty());
    let holder = match &named {
        Some(id) => writable_in_vault(router, id, user_id).await?,
        None => None,
    };
    let atome_id = named.unwrap_or_else(|| format!("file_{}", uuid::Uuid::new_v4().simple()));
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
    // A media record of another person's vault, written through their share, stays theirs.
    let user = holder.unwrap_or_else(|| user_id.to_string());
    let registered = atome_id.clone();
    central
        .committed(move |db| {
            claimable(db, &atome_id, &user)?;
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

/// The refusal of a registration naming an atome that is not the caller's file to write: another
/// account's atome (its file, its project, its account) or an atome that is not a file (an account
/// names itself by its own id). A new id, or the caller's own file, is claimable.
pub(super) const NOT_OWNED: &str = "upload_atome_not_owned";

// The media records of a vault an upload may name through a share (a text is an object of the
// project, never a file a co-editor uploads into).
const SHARED_MEDIA_TYPES: [&str; 8] = [
    "file",
    "image",
    "video",
    "sound",
    "audio_recording",
    "video_recording",
    "midi",
    "raw",
];

// An atome another person's vault holds (the vault object registry, whose owner never changes) is
// only named by a caller a share lets write it, and only when that vault holds it as a media
// record: its holder, who owns the file.
async fn writable_in_vault(
    router: &VaultRouter,
    atome_id: &str,
    user: &str,
) -> Result<Option<String>, String> {
    let Some(holder) = router
        .owner_of(atome_id)
        .await?
        .filter(|holder| holder != user)
    else {
        return Ok(None);
    };
    router
        .authorize_shared_write(
            user,
            &json!({ "atome_id": atome_id, "kind": "set" }),
            Some(holder.clone()),
        )
        .await
        .map_err(|_| NOT_OWNED.to_string())?;
    let state = router
        .ask(&holder, "state:get", json!({ "atome_id": atome_id }))
        .await?;
    // A vault state names its type `type` (atome-store canonical::universal).
    let kind = js::first(&state, &["atome_type", "type"])
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    if !SHARED_MEDIA_TYPES.contains(&kind) {
        return Err(NOT_OWNED.into());
    }
    Ok(Some(holder))
}

fn claimable(db: &Connection, atome_id: &str, user: &str) -> Result<(), String> {
    let existing: Option<(String, String)> = db
        .query_row(
            "SELECT COALESCE(owner_id, ''), COALESCE(atome_type, '') FROM atomes WHERE atome_id = ?",
            [atome_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match existing {
        None => Ok(()),
        Some((owner, kind)) if owner == user && FILE_ATOME_TYPES.contains(&kind.as_str()) => Ok(()),
        Some(_) => Err(NOT_OWNED.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::claimable;
    use rusqlite::Connection;

    fn base() -> Connection {
        let db = Connection::open_in_memory().expect("db");
        db.execute_batch(
            "CREATE TABLE atomes (atome_id TEXT PRIMARY KEY, atome_type TEXT, owner_id TEXT);
             INSERT INTO atomes VALUES ('alice', 'user', 'alice'), ('bob', 'user', 'bob'),
               ('file_a', 'image', 'alice'), ('project_a', 'project', 'alice');",
        )
        .expect("rows");
        db
    }

    #[test]
    fn a_registration_never_takes_another_accounts_atome() {
        let db = base();
        for id in ["file_a", "project_a", "alice"] {
            assert_eq!(
                claimable(&db, id, "bob"),
                Err(super::NOT_OWNED.into()),
                "{id}"
            );
        }
    }

    #[test]
    fn an_account_never_becomes_a_file_of_its_own() {
        assert_eq!(
            claimable(&base(), "bob", "bob"),
            Err(super::NOT_OWNED.into())
        );
    }

    #[test]
    fn a_new_id_or_the_callers_own_file_is_claimable() {
        let db = base();
        assert_eq!(claimable(&db, "file_new", "bob"), Ok(()));
        assert_eq!(claimable(&db, "file_a", "alice"), Ok(()));
    }
}
