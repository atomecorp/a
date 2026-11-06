// The bug reports sent from the apps (server/ws_bug_reports.js and the server's half of
// atome/src/shared/bug_report_contract.js, ported): a `bug-report-submit` frame on /ws/api writes
// one JSON file per report, for the team to read on the server, under
//
//     <project>/logs/bug_reports/<YYYY-MM-DD>/<created_iso>_<id>.json
//
// (the day and time the report was filed, `:` and `.` written `-`). The file holds the bounded
// report, the server's own versions, the account id when the frame comes from a signed-in page, and
// the contact only when the user agreed to give it. A report sent again (a retry) keeps its first
// file. The frame is public; each address may send a few per minute. Once fixed, the team writes its
// `resolution` into the file (scripts/bug_reports_admin.mjs); `bug-report-status` asks which of a
// device's sent reports are resolved, by their id and day, and for a feature request (kind
// `request`, feature_requests.rs) answers its review and its Roadmap state.
use super::Asker;
use super::common::{environment, plain, reply};
use super::public_source::RateLimit;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

pub(super) const SUBMIT: &str = "bug-report-submit";
pub(super) const STATUS: &str = "bug-report-status";
const ORIGINS: [&str; 3] = ["user_requested", "assistant_failure", "manual"];
const KINDS: [&str; 2] = ["bug", "request"];
const STATUS_MAX: usize = 50;
const MAX_CONTEXT_BYTES: usize = 32 * 1024;

static LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 12));
static STATUS_LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 30));

/// `<project>/logs/bug_reports`.
pub(super) fn root() -> Result<PathBuf, String> {
    Ok(environment()?.1.join("logs").join("bug_reports"))
}

/// `String(value ?? '').trim().slice(0, max)`.
pub(super) fn bounded(value: Option<&JsonValue>, max: usize) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        value => js::slice(js::trim(&js::text(value)), max),
    }
}

fn fail(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

fn id_shape(id: &str) -> bool {
    (8..=80).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

// `new Date(String(value || '')).toISOString()`, none when the date is invalid.
fn created(value: Option<&JsonValue>) -> Option<String> {
    let text = super::common::or_empty(value);
    js::date(Some(&json!(text))).map(js::iso)
}

/// `normalizeBugReportRefs(refs)`: `[{ id, created_iso }]`, the id and day that name a report's file.
pub(super) fn normalize_refs(refs: Option<&JsonValue>) -> Result<Vec<(String, String)>, JsonValue> {
    let Some(refs) = refs
        .and_then(JsonValue::as_array)
        .filter(|refs| !refs.is_empty() && refs.len() <= STATUS_MAX)
    else {
        return Err(fail("bug_report_refs_invalid"));
    };
    let mut normalized = Vec::new();
    for entry in refs {
        let id = super::common::or_empty(entry.get("id"));
        match created(entry.get("created_iso")) {
            Some(created_iso) if id_shape(&id) => normalized.push((id, created_iso)),
            _ => return Err(fail("bug_report_refs_invalid")),
        }
    }
    Ok(normalized)
}

/// `bugReportFilePath(root, { id, created_iso })`.
pub(super) fn file_path(root: &Path, id: &str, created_iso: &str) -> PathBuf {
    let stamp = created_iso.replace([':', '.'], "-");
    root.join(js::slice(created_iso, 10))
        .join(format!("{stamp}_{id}.json"))
}

/// `readBugReportFile(file)`: its report, none when the server never kept it.
pub(super) fn read_file(file: &Path) -> Result<Option<JsonValue>, String> {
    match std::fs::read(file) {
        Ok(bytes) => serde_json::from_str(&String::from_utf8_lossy(&bytes))
            .map(|report: JsonValue| Some(plain(&report)))
            .map_err(|error| format!("SyntaxError: {} {error}", file.display())),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("{}: {error}", file.display())),
    }
}

/// `JSON.stringify(report, null, 2) + '\n'`.
pub(super) fn pretty(report: &JsonValue) -> String {
    format!(
        "{}\n",
        serde_json::to_string_pretty(report).unwrap_or_default()
    )
}

/// `featureRequestStateOf(report)`: what the requester's device learns of its feature request.
pub(super) fn request_state(report: &JsonValue) -> JsonValue {
    let or_empty = |value: Option<&JsonValue>| {
        value
            .filter(|value| js::truthy(Some(value)))
            .cloned()
            .unwrap_or(json!(""))
    };
    let review = report.get("review");
    let roadmap = report.get("roadmap");
    let mut state = JsonMap::new();
    if let Some(id) = report.get("id") {
        state.insert("id".into(), id.clone());
    }
    for (key, value) in [
        ("review", review.and_then(|r| r.get("state"))),
        ("reason", review.and_then(|r| r.get("reason"))),
        ("reviewed_at", review.and_then(|r| r.get("at"))),
        ("roadmap", roadmap.and_then(|r| r.get("state"))),
        ("roadmap_at", roadmap.and_then(|r| r.get("at"))),
    ] {
        state.insert(key.into(), or_empty(value));
    }
    JsonValue::Object(state)
}

fn is_plain(value: Option<&JsonValue>) -> bool {
    value.is_some_and(JsonValue::is_object)
}

fn conversation(value: Option<&JsonValue>) -> JsonValue {
    if !is_plain(value) {
        return JsonValue::Null;
    }
    let value = value.expect("plain");
    let turns = value
        .get("turns")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    let recent = &turns[turns.len().saturating_sub(20)..];
    let turns: Vec<JsonValue> = recent
        .iter()
        .filter(|turn| turn.is_object())
        .map(|turn| {
            let mut entry = JsonMap::new();
            entry.insert("role".into(), json!(bounded(turn.get("role"), 20)));
            if js::truthy(turn.get("name")) {
                entry.insert("name".into(), json!(bounded(turn.get("name"), 120)));
            }
            entry.insert("text".into(), json!(bounded(turn.get("text"), 1000)));
            JsonValue::Object(entry)
        })
        .collect();
    json!({ "id": bounded(value.get("id"), 80), "model": bounded(value.get("model"), 80),
        "level": bounded(value.get("level"), 40), "turns": turns })
}

// The contact rides along only when the user agreed to give it.
fn contact(value: Option<&JsonValue>) -> JsonValue {
    let Some(value) = value.filter(|value| value.is_object()) else {
        return JsonValue::Null;
    };
    let (phone, name, email) = (
        bounded(value.get("phone"), 40),
        bounded(value.get("name"), 160),
        bounded(value.get("email"), 200),
    );
    if phone.is_empty() && name.is_empty() && email.is_empty() {
        return JsonValue::Null;
    }
    json!({ "phone": phone, "name": name, "email": email })
}

// `normalizeBugReport(input)`: the bounded report both sides keep.
fn normalize(input: Option<&JsonValue>) -> Result<JsonValue, JsonValue> {
    let input = match input {
        None => &json!({}),
        Some(input) if input.is_object() => input,
        Some(_) => return Err(fail("bug_report_invalid")),
    };
    let id = super::common::or_empty(input.get("id"));
    if !id_shape(&id) {
        return Err(fail("bug_report_id_invalid"));
    }
    let origin = input
        .get("origin")
        .and_then(JsonValue::as_str)
        .filter(|origin| ORIGINS.contains(origin));
    let Some(origin) = origin else {
        return Err(fail("bug_report_origin_invalid"));
    };
    let Some(created_iso) = created(input.get("created_iso")) else {
        return Err(fail("bug_report_date_invalid"));
    };
    let title = bounded(input.get("title"), 200);
    if title.is_empty() {
        return Err(fail("bug_report_title_required"));
    }
    let context = input
        .get("context")
        .filter(|context| context.is_object())
        .cloned()
        .unwrap_or(JsonValue::Null);
    if !context.is_null() && plain(&context).to_string().encode_utf16().count() > MAX_CONTEXT_BYTES
    {
        return Err(fail("bug_report_context_too_large"));
    }
    // `bugReportKindOf`: every report filed before requests existed is a bug.
    let kind = input.get("kind").cloned().unwrap_or(json!("bug"));
    if !kind.as_str().is_some_and(|kind| KINDS.contains(&kind)) {
        return Err(fail("bug_report_kind_invalid"));
    }
    let consent = input.get("contact_consent") == Some(&json!(true));
    let attempted: Vec<String> = input
        .get("attempted")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .take(20)
        .map(|entry| bounded(Some(entry), 200))
        .filter(|entry| !entry.is_empty())
        .collect();
    let versions = input
        .get("versions")
        .filter(|versions| versions.is_object());
    Ok(
        json!({ "id": id, "kind": kind, "origin": origin, "created_iso": created_iso, "title": title,
        "description": bounded(input.get("description"), 8000), "request": bounded(input.get("request"), 2000),
        "reason": bounded(input.get("reason"), 4000), "attempted": attempted, "platform": bounded(input.get("platform"), 20),
        "versions": { "atome": bounded(versions.and_then(|v| v.get("atome")), 40),
            "eve": bounded(versions.and_then(|v| v.get("eve")), 40) },
        "context": plain(&context), "conversation": conversation(input.get("conversation")),
        "contact_consent": consent, "contact": if consent { contact(input.get("contact")) } else { JsonValue::Null } }),
    )
}

// `loadVersionFile`: a version file's trimmed text, `unknown` when empty or unreadable.
fn version(file: PathBuf) -> String {
    std::fs::read(file)
        .map(|bytes| js::trim(&String::from_utf8_lossy(&bytes)).to_string())
        .ok()
        .filter(|version| !version.is_empty())
        .unwrap_or_else(|| "unknown".into())
}

fn status(message: &JsonValue, root: &Path) -> JsonValue {
    let refs = match normalize_refs(message.get("refs")) {
        Ok(refs) => refs,
        Err(failure) => return failure,
    };
    let (mut resolved, mut requests) = (Vec::new(), Vec::new());
    for (id, created_iso) in &refs {
        let stored = match read_file(&file_path(root, id, created_iso)) {
            Ok(stored) => stored,
            Err(error) => {
                eprintln!("[bug_reports] status read failed {error}");
                return fail("bug_report_status_failed");
            }
        };
        let Some(stored) = stored.filter(|stored| stored.get("id") == Some(&json!(id))) else {
            continue;
        };
        let resolution = stored.get("resolution");
        if js::truthy(resolution.and_then(|r| r.get("resolved_at"))) {
            let mut entry = JsonMap::from_iter([("id".to_string(), json!(id))]);
            entry.extend(
                resolution
                    .and_then(JsonValue::as_object)
                    .cloned()
                    .unwrap_or_default(),
            );
            resolved.push(JsonValue::Object(entry));
        }
        if stored.get("kind") == Some(&json!("request")) {
            requests.push(request_state(&stored));
        }
    }
    json!({ "ok": true, "resolved": resolved, "requests": requests })
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let kind = js::text(message.get("type"));
    let now = chrono::Utc::now().timestamp_millis();
    let root = root()?;
    if kind == STATUS {
        if STATUS_LIMITED.limited(asker.address, now) {
            return Ok(reply(&kind, message, fail("bug_report_rate_limited")));
        }
        let asked = message.clone();
        let fields = tokio::task::spawn_blocking(move || status(&asked, &root))
            .await
            .map_err(|error| error.to_string())?;
        return Ok(reply(&kind, message, fields));
    }
    if LIMITED.limited(asker.address, now) {
        return Ok(reply(&kind, message, fail("bug_report_rate_limited")));
    }
    let report = match normalize(message.get("report")) {
        Ok(report) => report,
        Err(failure) => return Ok(reply(&kind, message, failure)),
    };
    // `_wsApiUserId` while its signed session lasts (`resolveWsApiPrincipal(connection)`).
    let front = asker
        .connection
        .connection_of(json!({ "message": message, "current": true }))
        .await?;
    if let Some(session_error) = front.get("session_error") {
        return Ok(session_error.clone());
    }
    let user = front
        .get("principal")
        .filter(|user| js::truthy(Some(user)))
        .cloned()
        .unwrap_or(JsonValue::Null);
    let (_, project) = environment()?;
    let mut stored = report.as_object().cloned().unwrap_or_default();
    stored.insert("received_at".into(), json!(js::iso(now)));
    stored.insert("ws_user_id".into(), user);
    stored.insert(
        "server_versions".into(),
        json!({
        "atome": version(project.join("atome").join("version.txt")),
        "eve": version(project.join("eVe").join("version.txt")) }),
    );
    let id = report["id"].clone();
    let file = file_path(&root, &js::string(&id), &js::string(&report["created_iso"]));
    let written = tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(file.parent().expect("day folder"))?;
        let mut options = std::fs::OpenOptions::new();
        let mut handle = options.write(true).create_new(true).open(&file)?;
        std::io::Write::write_all(&mut handle, pretty(&JsonValue::Object(stored)).as_bytes())
    })
    .await
    .map_err(|error| error.to_string())?;
    Ok(reply(
        &kind,
        message,
        match written {
            Ok(()) => json!({ "ok": true, "id": id }),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                json!({ "ok": true, "id": id, "duplicate": true })
            }
            Err(error) => {
                // The report stays unsent on the device, which sends it again later.
                eprintln!("[bug_reports] storage failed {error}");
                fail("bug_report_storage_failed")
            }
        },
    ))
}
