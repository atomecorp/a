// The feature requests (« Demandes », server/ws_feature_requests.js, ported): bug reports of kind
// `request`, kept in the same table as the bugs (crate::team_reports, `team_reports`). An
// account with the `admin` role (account_roles.rs) validates or refuses them: a refusal writes
// `review` `{ state: 'refused', at, by, reason }`, a validation `review` `{ state: 'validated' }` and
// `roadmap` `{ state: 'planned' }`. The Roadmap then moves planned → in_progress → done, in the app
// by an admin or on the server by the `team_reports` tool (`roadmap`). Every move is appended
// to the row's `steps`. A message of the Atome contact's thread that the team classified as a
// request (atome_thread.rs) is reviewed the same way. The Roadmap (validated requests, titles only) is public
// (`feature-request-roadmap`); the admin frames check the role on the server, whatever the app shows.
use super::bug_reports::{bounded, normalize_refs, request_state};
use super::common::environment;
use super::public_source::RateLimit;
use super::{Asker, account_roles, response};
use crate::team_reports;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
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

// Every feature request, oldest first.
fn requests(db: &Connection) -> Result<Vec<JsonValue>, String> {
    team_reports::of_kind(db, "request")
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
fn roadmap(db: &Connection) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    let mut entries = Vec::new();
    for report in requests(db)? {
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
fn pending(db: &Connection) -> Result<JsonValue, String> {
    let entries = requests(db)?
        .into_iter()
        .filter(|report| !js::truthy(report.get("review")))
        .map(|report| {
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
fn find(db: &Connection, id: &str, created_iso: &str) -> Result<Option<JsonValue>, String> {
    Ok(team_reports::get(db, id)?
        .map(|(_, report)| report)
        .filter(|report| {
            report.get("created_iso") == Some(&json!(created_iso))
                && report.get("kind") == Some(&json!("request"))
        }))
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

fn save(db: &Connection, report: &JsonValue) -> Result<JsonValue, String> {
    team_reports::save(db, report)?;
    Ok(json!({ "ok": true, "request": request_state(report) }))
}

// The admin's action on one request (`review` or `roadmap`), `by` the admin.
fn decide(
    db: &Connection,
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
    let Some(mut report) = find(db, id, created_iso)? else {
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
        return save(db, &report);
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
    save(db, &report)
}

pub(super) async fn answer(asker: &Asker<'_>, data: &JsonValue) -> Result<JsonValue, String> {
    let now = atome_js_values::dates::now_ms();
    let project = environment()?.1.clone();
    let central = asker.connection.ws_api.sessions.central();
    if js::text(data.get("type")) == ROADMAP {
        if ROADMAP_LIMITED.limited(asker.address, now) {
            return Ok(response(
                ROADMAP,
                data,
                false,
                fail("bug_report_rate_limited"),
            ));
        }
        let entries = central
            .transaction(move |db| {
                team_reports::import_files(db, &project)?;
                roadmap(db)
            })
            .await?;
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
    if !account_roles::has(asker, &by, account_roles::ADMIN).await? {
        return Ok(response(ADMIN, data, false, fail("admin_required")));
    }
    let asked = data.clone();
    let result = central
        .transaction(move |db| {
            team_reports::import_files(db, &project)?;
            match action.as_str() {
                "pending" => pending(db),
                _ => decide(db, &asked, &action, &by, &js::iso(now)),
            }
        })
        .await;
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
