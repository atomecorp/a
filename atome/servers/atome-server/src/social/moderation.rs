// A report and what it opens in eVe's moderation queue (`moderation_cases`), one brick for every
// family that lets a person report another or a thing (the objectives network, the CB sociale):
// a report is recorded once per reporter in the family's own table of (target, reporter, reason);
// the third distinct one hides the target and its case waits, opened, for eVe's moderators.
use super::news::db::{get, run};
use crate::vault_router::js;
use rusqlite::Connection;

pub const REPORTS_TO_HIDE: i64 = 3;
const REASONS: [&str; 4] = ["spam", "abuse", "fake", "other"];

/// A reason as reported, `other` when it is none of the known ones.
pub fn reason(value: &str) -> &'static str {
    REASONS
        .into_iter()
        .find(|known| *known == value)
        .unwrap_or("other")
}

/// One report by `reporter` on `target`, in `reports` (a table of `target_id`, `reporter_id`,
/// `reason`), its case of `kind` opened or counted again. Whether the target is now hidden.
pub fn record(
    db: &Connection,
    reports: &'static str,
    kind: &str,
    target: &str,
    reporter: &str,
    reason: &str,
) -> Result<bool, String> {
    run(
        db,
        &format!(
            "INSERT INTO {reports} (target_id, reporter_id, reason) VALUES (?, ?, ?)
             ON CONFLICT(target_id, reporter_id) DO NOTHING"
        ),
        &[&target, &reporter, &reason],
    )?;
    let total = get(
        db,
        &format!("SELECT COUNT(*) AS total FROM {reports} WHERE target_id = ?"),
        &[&target],
    )?
    .map_or(0, |row| js::number(row.get("total")) as i64);
    let now = atome_js_values::iso(atome_js_values::dates::now_ms());
    let hidden = (total >= REPORTS_TO_HIDE).then_some(now);
    let case_id = uuid::Uuid::new_v4().to_string();
    run(
        db,
        "INSERT INTO moderation_cases (case_id, kind, target_id, reports, hidden_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kind, target_id) DO UPDATE SET reports = excluded.reports, updated_at = datetime('now'),
         hidden_at = COALESCE(moderation_cases.hidden_at, excluded.hidden_at), status = 'open'",
        &[&case_id, &kind, &target, &total, &hidden],
    )?;
    hidden_case(db, kind, target)
}

/// Whether `target`'s case of `kind` hides it.
pub fn hidden_case(db: &Connection, kind: &str, target: &str) -> Result<bool, String> {
    Ok(get(
        db,
        "SELECT hidden_at FROM moderation_cases WHERE kind = ? AND target_id = ? AND hidden_at IS NOT NULL",
        &[&kind, &target],
    )?
    .is_some())
}
