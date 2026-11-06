// The feature requests (« Demandes », server/ws_feature_requests.js, ported): bug reports of kind
// `request`, kept in the same JSON files as the bugs (bug_reports.rs, logs/bug_reports/<day>/). An
// account with the `admin` role (account_roles.rs) validates or refuses them: a refusal writes
// `review` `{ state: 'refused', at, by, reason }`, a validation `review` `{ state: 'validated' }` and
// `roadmap` `{ state: 'planned' }`. The Roadmap then moves planned → in_progress → done, in the app
// by an admin or on the server by scripts/bug_reports_admin.mjs (`roadmap`). Every move is appended
// to the file's `steps`. The Roadmap (validated requests, titles only) is public
// (`feature-request-roadmap`); the admin frames check the role on the server, whatever the app shows.
use super::bug_reports::{
    bounded, file_path, normalize_refs, pretty, read_file, request_state, root,
};
use super::public_source::RateLimit;
use super::{Asker, account_roles, response};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

pub(super) const ROADMAP: &str = "feature-request-roadmap";
pub(super) const ADMIN: &str = "feature-request-admin";
const REVIEWS: [&str; 2] = ["validated", "refused"];
const ROADMAP_STATES: [&str; 3] = ["planned", "in_progress", "done"];
const ACTIONS: [&str; 3] = ["pending", "review", "roadmap"];
const REASON_MAX: usize = 1000;

static ROADMAP_LIMITED: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 30));

fn fail(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

// `listBugReportFiles(root)` kept to the requests: every report file, oldest day first.
fn requests(root: &Path) -> Result<Vec<(PathBuf, JsonValue)>, String> {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let mut days = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let day = name.len() == 10
            && name.bytes().enumerate().all(|(at, b)| {
                if at == 4 || at == 7 {
                    b == b'-'
                } else {
                    b.is_ascii_digit()
                }
            });
        if day
            && entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_dir()
        {
            days.push(name);
        }
    }
    days.sort();
    let mut found = Vec::new();
    for day in days {
        let mut names: Vec<String> = std::fs::read_dir(root.join(&day))
            .map_err(|error| error.to_string())?
            .map(|entry| entry.map(|entry| entry.file_name().to_string_lossy().into_owned()))
            .collect::<Result<_, _>>()
            .map_err(|error| error.to_string())?;
        names.retain(|name| name.ends_with(".json"));
        names.sort();
        for name in names {
            let file = root.join(&day).join(name);
            if let Some(report) =
                read_file(&file)?.filter(|report| report.get("kind") == Some(&json!("request")))
            {
                found.push((file, report));
            }
        }
    }
    Ok(found)
}

// `{ key: report[key] }` of the fields present (an undefined field is left out by JSON).
fn fields_of(report: &JsonValue, keys: &[&str]) -> JsonMap<String, JsonValue> {
    keys.iter()
        .filter_map(|key| {
            report
                .get(*key)
                .map(|value| (key.to_string(), value.clone()))
        })
        .collect()
}

// Newest first: `b.created_iso.localeCompare(a.created_iso)`, which throws on a missing date.
fn newest_first(
    mut entries: Vec<JsonMap<String, JsonValue>>,
) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    if entries.len() > 1
        && entries
            .iter()
            .any(|entry| !entry.get("created_iso").is_some_and(JsonValue::is_string))
    {
        return Err("TypeError: created_iso.localeCompare".into());
    }
    entries.sort_by(|a, b| js::string(&b["created_iso"]).cmp(&js::string(&a["created_iso"])));
    Ok(entries)
}

// `featureRoadmap(root)`: the validated requests, their title, day and state.
fn roadmap(root: &Path) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    let mut entries = Vec::new();
    for (_, report) in requests(root)? {
        if report.pointer("/review/state") != Some(&json!("validated")) {
            continue;
        }
        let Some(plan) = report.get("roadmap").filter(|plan| !plan.is_null()) else {
            return Err("TypeError: report.roadmap is undefined".into());
        };
        let mut entry = fields_of(&report, &["id", "created_iso", "title"]);
        entry.extend(fields_of(plan, &["state"]));
        if let Some(at) = plan.get("at") {
            entry.insert("state_at".into(), at.clone());
        }
        entries.push(entry);
    }
    newest_first(entries)
}

// The requests from every account still waiting for an admin, without who filed them.
fn pending(root: &Path) -> Result<JsonValue, String> {
    let entries = requests(root)?
        .into_iter()
        .filter(|(_, report)| !js::truthy(report.get("review")))
        .map(|(_, report)| {
            fields_of(
                &report,
                &[
                    "id",
                    "created_iso",
                    "title",
                    "description",
                    "platform",
                    "versions",
                ],
            )
        })
        .collect();
    Ok(json!({ "ok": true, "requests": newest_first(entries)? }))
}

// `findFeatureRequest(root, { id, created_iso })` by its id and day.
fn find(root: &Path, id: &str, created_iso: &str) -> Result<Option<(PathBuf, JsonValue)>, String> {
    let file = file_path(root, id, created_iso);
    Ok(read_file(&file)?
        .filter(|report| {
            report.get("id") == Some(&json!(id)) && report.get("kind") == Some(&json!("request"))
        })
        .map(|report| (file, report)))
}

// `report[key] = value`, its place kept when it was already there.
fn set(report: &mut JsonValue, key: &str, value: JsonValue) {
    if let Some(object) = report.as_object_mut() {
        object.insert(key.into(), value);
    }
}

fn step(report: &mut JsonValue, entry: JsonValue) -> Result<(), String> {
    let mut steps = match report.get("steps") {
        Some(JsonValue::Array(steps)) => steps.clone(),
        steps if !js::truthy(steps) => Vec::new(),
        _ => return Err("TypeError: report.steps is not iterable".into()),
    };
    steps.push(entry);
    set(report, "steps", JsonValue::Array(steps));
    Ok(())
}

fn save(file: &Path, report: &JsonValue) -> Result<JsonValue, String> {
    std::fs::write(file, pretty(report)).map_err(|error| error.to_string())?;
    Ok(json!({ "ok": true, "request": request_state(report) }))
}

// The admin's action on one request (`review` or `roadmap`), `by` the admin.
fn decide(
    root: &Path,
    data: &JsonValue,
    action: &str,
    by: &str,
    at: &str,
) -> Result<JsonValue, String> {
    let refs = json!([{ "id": data.get("id"), "created_iso": data.get("created_iso") }]);
    let Ok(refs) = normalize_refs(Some(&refs)) else {
        return Ok(fail("bug_report_refs_invalid"));
    };
    let (id, created_iso) = &refs[0];
    let wanted = data
        .get(if action == "review" {
            "decision"
        } else {
            "state"
        })
        .and_then(JsonValue::as_str);
    let allowed: &[&str] = if action == "review" {
        &REVIEWS
    } else {
        &ROADMAP_STATES
    };
    let Some(wanted) = wanted.filter(|wanted| allowed.contains(wanted)) else {
        return Ok(fail(if action == "review" {
            "feature_request_decision_invalid"
        } else {
            "feature_request_state_invalid"
        }));
    };
    let Some((file, mut report)) = find(root, id, created_iso)? else {
        return Ok(fail("feature_request_unknown"));
    };
    if action == "roadmap" {
        if report.pointer("/review/state") != Some(&json!("validated")) {
            return Ok(fail("feature_request_not_validated"));
        }
        set(
            &mut report,
            "roadmap",
            json!({ "state": wanted, "at": at, "by": by }),
        );
        step(
            &mut report,
            json!({ "at": at, "by": by, "roadmap": wanted }),
        )?;
        return save(&file, &report);
    }
    // A request is reviewed once.
    if js::truthy(report.get("review")) {
        return Ok(fail("feature_request_already_reviewed"));
    }
    let review = if wanted == "refused" {
        json!({ "state": "refused", "at": at, "by": by, "reason": bounded(data.get("reason"), REASON_MAX) })
    } else {
        json!({ "state": "validated", "at": at, "by": by })
    };
    set(&mut report, "review", review);
    let mut entry = json!({ "at": at, "by": by, "review": wanted });
    if wanted == "validated" {
        set(
            &mut report,
            "roadmap",
            json!({ "state": "planned", "at": at, "by": by }),
        );
        entry["roadmap"] = json!("planned");
    }
    step(&mut report, entry)?;
    save(&file, &report)
}

pub(super) async fn answer(asker: &Asker<'_>, data: &JsonValue) -> Result<JsonValue, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let root = root()?;
    if js::text(data.get("type")) == ROADMAP {
        if ROADMAP_LIMITED.limited(asker.address, now) {
            return Ok(response(
                ROADMAP,
                data,
                false,
                fail("bug_report_rate_limited"),
            ));
        }
        let entries = tokio::task::spawn_blocking(move || roadmap(&root))
            .await
            .map_err(|error| error.to_string())??;
        return Ok(response(
            ROADMAP,
            data,
            true,
            json!({ "ok": true, "roadmap": entries }),
        ));
    }
    let action = super::common::or_empty(data.get("action"));
    if !ACTIONS.contains(&action.as_str()) {
        return Ok(response(
            ADMIN,
            data,
            false,
            fail("feature_request_action_invalid"),
        ));
    }
    // The role is the server's to check: an app showing the admin's tools proves nothing.
    let principal = match account_roles::signed_principal(asker, data).await? {
        Ok(principal) => principal,
        Err(session_error) => return Ok(session_error),
    };
    let Some(by) = principal else {
        return Ok(response(ADMIN, data, false, fail("admin_required")));
    };
    if !account_roles::has(asker, &by, "admin").await? {
        return Ok(response(ADMIN, data, false, fail("admin_required")));
    }
    let asked = data.clone();
    let result = tokio::task::spawn_blocking(move || match action.as_str() {
        "pending" => pending(&root),
        _ => decide(&root, &asked, &action, &by, &js::iso(now)),
    })
    .await
    .map_err(|error| error.to_string())?;
    Ok(match result {
        Ok(result) => {
            let ok = result.get("ok") == Some(&json!(true));
            response(ADMIN, data, ok, result)
        }
        Err(error) => {
            eprintln!("[feature_requests] admin action failed {error}");
            response(ADMIN, data, false, fail("feature_request_storage_failed"))
        }
    })
}
