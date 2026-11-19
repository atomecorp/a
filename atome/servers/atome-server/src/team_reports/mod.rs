//! What the people send the team (R-210): the reports filed from the apps or by the assistant
//! (`bug-report-submit`, the feature requests' review and Roadmap) and the Atome contact's thread
//! (`atome-thread`), one row each in the central database's `team_reports` table. A row keeps its
//! whole report as JSON (`body`, the fields the apps and the operator read) beside the columns the
//! queries need: whose it is, which thread, who wrote it (the person or the team), its kind once
//! the team classified it (`bug`, `request`, `note`), whether it is resolved. A message's
//! attachments lie in a folder of their own beside the database (attachments.rs), never served;
//! once the team has handled them they are purged and the message keeps their names.
//!
//! The reports written before the table, one JSON file each under `<project>/logs/bug_reports/`,
//! are read into it at the first use (`import_files`), then their folder becomes
//! `logs/bug_reports_imported`.
pub mod attachments;

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// The table and its indexes, brought up by the central schema's chain (central_schema/mod.rs)
/// and by the operator tool on a copy of the database.
pub const TABLES: [&str; 3] = [
    r#"CREATE TABLE IF NOT EXISTS team_reports (
        report_id TEXT PRIMARY KEY,
        principal_id TEXT,
        thread TEXT NOT NULL DEFAULT 'report',
        author TEXT NOT NULL DEFAULT 'person',
        kind TEXT,
        state TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        body TEXT NOT NULL
    )"#,
    "CREATE INDEX IF NOT EXISTS team_reports_thread ON team_reports(principal_id, thread, created_at)",
    "CREATE INDEX IF NOT EXISTS team_reports_kind ON team_reports(kind, created_at)",
];

/// The Atome contact's thread; a report filed from the apps lies in `report`.
pub const ATOME_THREAD: &str = "atome";
pub const REPORT_THREAD: &str = "report";
/// The kinds the team gives a message when it reads it.
pub const KINDS: [&str; 3] = ["bug", "request", "note"];

/// `<project>/logs/team_reports`: the attachments' folder.
pub fn root(project: &Path) -> PathBuf {
    project.join("logs").join("team_reports")
}

fn text_of(body: &JsonValue, key: &str) -> Option<String> {
    body.get(key)
        .and_then(JsonValue::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

// The columns a body says: its thread, author, kind and state.
fn columns(body: &JsonValue) -> (String, String, Option<String>, &'static str) {
    let thread = text_of(body, "thread").unwrap_or_else(|| REPORT_THREAD.into());
    let author = text_of(body, "author").unwrap_or_else(|| "person".into());
    let kind = text_of(body, "kind").filter(|kind| KINDS.contains(&kind.as_str()));
    let resolved = body
        .pointer("/resolution/resolved_at")
        .and_then(JsonValue::as_str)
        .is_some_and(|at| !at.is_empty());
    (
        thread,
        author,
        kind,
        if resolved { "resolved" } else { "open" },
    )
}

fn failed(error: rusqlite::Error) -> String {
    format!("team_reports_storage_failed:{error}")
}

/// A new row; false when its id was already kept (a report sent again keeps its first copy).
pub fn insert(db: &Connection, principal: Option<&str>, body: &JsonValue) -> Result<bool, String> {
    let id = text_of(body, "id").ok_or("team_report_id_required")?;
    let created = text_of(body, "created_iso").ok_or("team_report_date_required")?;
    let (thread, author, kind, state) = columns(body);
    db.execute(
        "INSERT OR IGNORE INTO team_reports (report_id, principal_id, thread, author, kind, state, created_at, body)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, principal, thread, author, kind, state, created, body.to_string()],
    )
    .map(|inserted| inserted == 1)
    .map_err(failed)
}

/// The body of one row, with whose it is.
pub fn get(db: &Connection, id: &str) -> Result<Option<(Option<String>, JsonValue)>, String> {
    db.query_row(
        "SELECT principal_id, body FROM team_reports WHERE report_id = ?1",
        params![id],
        |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?)),
    )
    .optional()
    .map_err(failed)?
    .map(|(principal, body)| {
        serde_json::from_str(&body)
            .map(|body| (principal, body))
            .map_err(|error| format!("team_report_body_invalid:{id}:{error}"))
    })
    .transpose()
}

/// A row's body written again, its columns following it.
pub fn save(db: &Connection, body: &JsonValue) -> Result<(), String> {
    let id = text_of(body, "id").ok_or("team_report_id_required")?;
    let (thread, author, kind, state) = columns(body);
    let changed = db
        .execute(
            "UPDATE team_reports SET thread = ?2, author = ?3, kind = ?4, state = ?5, body = ?6 WHERE report_id = ?1",
            params![id, thread, author, kind, state, body.to_string()],
        )
        .map_err(failed)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(format!("team_report_unknown:{id}"))
    }
}

fn bodies(
    db: &Connection,
    sql: &str,
    values: &[&dyn rusqlite::ToSql],
) -> Result<Vec<JsonValue>, String> {
    let mut statement = db.prepare(sql).map_err(failed)?;
    let rows = statement
        .query_map(values, |row| row.get::<_, String>(0))
        .map_err(failed)?;
    rows.map(|row| {
        let body = row.map_err(failed)?;
        serde_json::from_str(&body).map_err(|error| format!("team_report_body_invalid:{error}"))
    })
    .collect()
}

/// Every row of a kind (the feature requests), oldest first.
pub fn of_kind(db: &Connection, kind: &str) -> Result<Vec<JsonValue>, String> {
    bodies(
        db,
        "SELECT body FROM team_reports WHERE kind = ?1 ORDER BY created_at, report_id",
        &[&kind],
    )
}

/// One person's Atome thread, oldest first: their messages and the team's replies.
pub fn thread(db: &Connection, principal: &str) -> Result<Vec<JsonValue>, String> {
    bodies(
        db,
        "SELECT body FROM team_reports WHERE principal_id = ?1 AND thread = ?2 ORDER BY created_at, report_id",
        &[&principal, &ATOME_THREAD],
    )
}

/// Every row, oldest first, for the operator (`since`: a day, `open`: the people's messages still unresolved).
pub fn all(
    db: &Connection,
    since: &str,
    open: bool,
) -> Result<Vec<(Option<String>, JsonValue)>, String> {
    let mut statement = db
        .prepare(
            "SELECT principal_id, body FROM team_reports WHERE created_at >= ?1 AND (?2 = 0 OR (state = 'open' AND author = 'person'))
             ORDER BY created_at, report_id",
        )
        .map_err(failed)?;
    let rows = statement
        .query_map(params![since, i64::from(open)], |row| {
            Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(failed)?;
    rows.map(|row| {
        let (principal, body) = row.map_err(failed)?;
        serde_json::from_str(&body)
            .map(|body| (principal, body))
            .map_err(|error| format!("team_report_body_invalid:{error}"))
    })
    .collect()
}

static IMPORTED: AtomicBool = AtomicBool::new(false);

/// The report files written before the table (`<project>/logs/bug_reports/<day>/*.json`) read
/// into it, once per process; their folder then becomes `logs/bug_reports_imported`. A file
/// that does not read as a report stops the import and says which: nothing is left half-moved.
pub fn import_files(db: &Connection, project: &Path) -> Result<usize, String> {
    if IMPORTED.load(Ordering::Acquire) {
        return Ok(0);
    }
    let folder = project.join("logs").join("bug_reports");
    if !folder.is_dir() {
        IMPORTED.store(true, Ordering::Release);
        return Ok(0);
    }
    let mut files = Vec::new();
    for day in std::fs::read_dir(&folder).map_err(|error| error.to_string())? {
        let day = day.map_err(|error| error.to_string())?.path();
        if !day.is_dir() {
            continue;
        }
        for file in std::fs::read_dir(&day).map_err(|error| error.to_string())? {
            let file = file.map_err(|error| error.to_string())?.path();
            if file
                .extension()
                .is_some_and(|extension| extension == "json")
            {
                files.push(file);
            }
        }
    }
    files.sort();
    let mut count = 0;
    for file in &files {
        let text = std::fs::read_to_string(file)
            .map_err(|error| format!("{}: {error}", file.display()))?;
        let mut body: JsonValue =
            serde_json::from_str(&text).map_err(|error| format!("{}: {error}", file.display()))?;
        let principal = text_of(&body, "ws_user_id");
        if let Some(fields) = body.as_object_mut() {
            fields.entry("thread").or_insert(json!(REPORT_THREAD));
            fields.entry("author").or_insert(json!("person"));
        }
        if insert(db, principal.as_deref(), &body)? {
            count += 1;
        }
    }
    // A folder moved by an earlier start keeps its name: this one takes the next free one.
    let moved = (0..)
        .map(|n| {
            project.join("logs").join(if n == 0 {
                "bug_reports_imported".to_string()
            } else {
                format!("bug_reports_imported_{n}")
            })
        })
        .find(|path| !path.exists())
        .expect("a free name");
    std::fs::rename(&folder, &moved)
        .map_err(|error| format!("team_reports_import_move_failed:{error}"))?;
    IMPORTED.store(true, Ordering::Release);
    Ok(count)
}
