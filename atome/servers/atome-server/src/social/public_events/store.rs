// The shared base of public events (database/adole_public_events_schema.js; server/
// public_events_store.js and public_events_guard.js, ported): its SQL, and the guard that decides
// whether a NEW publication goes live (decided with the user on 2026-10-26,
// todo/evenements_publics_2026-10-26.md Q3): 5 publications a day, 1 while the account is younger
// than 72 h; 30 events still to come at most; 3 events hidden by reports within 30 days suspend
// publishing for 30 days. Three reports from distinct accounts hide an event.
use super::super::news::db::{all, get, run};
use crate::vault_router::central::Central;
use crate::vault_router::js;
use crate::vault_router::js::iso;
use rusqlite::Connection;
use serde_json::Value as JsonValue;

const DAY_MS: i64 = 24 * 3600 * 1000;
const PER_DAY: i64 = 5;
const NEW_ACCOUNT_MS: i64 = 3 * DAY_MS;
const NEW_ACCOUNT_PER_DAY: i64 = 1;
const ACTIVE: i64 = 30;
const HIDDEN_TO_SUSPEND: usize = 3;
const HIDDEN_WINDOW_MS: i64 = 30 * DAY_MS;
const SUSPENSION_MS: i64 = 30 * DAY_MS;
pub const REPORTS_TO_HIDE: i64 = 3;

// `sqlTime(ms).replace('T', ' ').slice(0, 19)`: SQLite's `datetime('now')` form.
fn sql_seconds(ms: i64) -> String {
    iso(ms).replace('T', " ")[..19].to_string()
}

// `timeOf(value)`: SQLite's `YYYY-MM-DD HH:MM:SS` read as UTC, else an ISO date; none when unreadable.
fn time_of(value: &str) -> Option<i64> {
    let value = js::trim(value);
    chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
        .map(|time| time.and_utc().timestamp_millis())
        .or_else(|_| {
            chrono::DateTime::parse_from_rfc3339(value).map(|time| time.timestamp_millis())
        })
        .ok()
}

fn count(db: &Connection, sql: &str, values: &[&dyn rusqlite::ToSql]) -> Result<i64, String> {
    Ok(get(db, sql, values)?.map_or(0, |row| js::number(row.get("total")) as i64))
}

/// One occurrence of a series as stored.
pub struct Occurrence {
    pub id: String,
    pub start: String,
    pub end: String,
}

/// A series as projected: its author, the payload readers receive, its occurrences.
pub struct Series {
    pub event_id: String,
    pub author_id: String,
    pub author_name: String,
    pub payload: JsonValue,
    pub occurrences: Vec<Occurrence>,
    pub projected_until: Option<String>,
}

pub struct Store {
    central: Central,
}

impl Store {
    pub fn new(central: Central) -> Self {
        Self { central }
    }

    pub async fn series(&self, event_id: &str) -> Result<Option<JsonValue>, String> {
        let event_id = event_id.to_string();
        self.central
            .transaction(move |db| {
                get(
                    db,
                    "SELECT * FROM public_event_series WHERE event_id = ?",
                    &[&event_id],
                )
            })
            .await
    }

    /// A series and its occurrences, replaced together (`published_at` and the reports kept).
    pub async fn put(&self, series: Series) -> Result<(), String> {
        self.central
            .transaction(move |db| {
                let payload = series.payload.to_string();
                run(
                    db,
                    "INSERT INTO public_event_series (event_id, author_id, author_name, payload_json, projected_until)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(event_id) DO UPDATE SET author_name = excluded.author_name, payload_json = excluded.payload_json,
                     projected_until = excluded.projected_until, updated_at = datetime('now')",
                    &[&series.event_id, &series.author_id, &series.author_name, &payload, &series.projected_until],
                )?;
                run(db, "DELETE FROM public_events WHERE event_id = ?", &[&series.event_id])?;
                let place = &series.payload["place"];
                let (lat, lon) = (js::number(place.get("lat")), js::number(place.get("lon")));
                let cell = super::contract::cell(place.get("lat"), place.get("lon"));
                let categories = format!(
                    ",{},",
                    series.payload["categories"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(js::string)
                        .collect::<Vec<_>>()
                        .join(",")
                );
                let free = i64::from(js::truthy(series.payload["price"].get("free")));
                for occurrence in &series.occurrences {
                    run(
                        db,
                        "INSERT INTO public_events (occurrence_id, event_id, start_at, end_at, cell, lat, lon, categories, free)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        &[&occurrence.id, &series.event_id, &occurrence.start, &occurrence.end, &cell, &lat, &lon,
                            &categories, &free],
                    )?;
                }
                Ok(())
            })
            .await
    }

    /// The series leaves the base; its reports stay with nobody to read them.
    pub async fn remove(&self, event_id: &str) -> Result<(), String> {
        let event_id = event_id.to_string();
        self.central
            .transaction(move |db| {
                run(
                    db,
                    "DELETE FROM public_events WHERE event_id = ?",
                    &[&event_id],
                )?;
                run(
                    db,
                    "DELETE FROM public_event_series WHERE event_id = ?",
                    &[&event_id],
                )
                .map(drop)
            })
            .await
    }

    /// One report recorded once per reporter; the series' total of reports.
    pub async fn report(
        &self,
        event_id: &str,
        reporter: &str,
        reason: &str,
    ) -> Result<i64, String> {
        let (event_id, reporter, reason) = (
            event_id.to_string(),
            reporter.to_string(),
            reason.to_string(),
        );
        self.central
            .transaction(move |db| {
                run(
                    db,
                    "INSERT INTO public_event_reports (event_id, reporter_id, reason) VALUES (?, ?, ?)
                     ON CONFLICT(event_id, reporter_id) DO NOTHING",
                    &[&event_id, &reporter, &reason],
                )?;
                let total = count(
                    db,
                    "SELECT COUNT(*) AS total FROM public_event_reports WHERE event_id = ?",
                    &[&event_id],
                )?;
                run(
                    db,
                    "UPDATE public_event_series SET reports = ? WHERE event_id = ?",
                    &[&total, &event_id],
                )?;
                Ok(total)
            })
            .await
    }

    pub async fn hide(&self, event_id: &str) -> Result<(), String> {
        let event_id = event_id.to_string();
        self.central
            .transaction(move |db| {
                run(
                    db,
                    "UPDATE public_event_series SET hidden_at = datetime('now') WHERE event_id = ? AND hidden_at IS NULL",
                    &[&event_id],
                )
                .map(drop)
            })
            .await
    }

    /// The occurrences in `cells` still to end, with their series, soonest first (`around`).
    pub async fn around(
        &self,
        cells: Vec<i64>,
        now: i64,
        limit: i64,
    ) -> Result<Vec<JsonValue>, String> {
        if cells.is_empty() {
            return Ok(Vec::new());
        }
        self.central
            .transaction(move |db| {
                let marks = vec!["?"; cells.len()].join(",");
                let sql = format!(
                    "SELECT e.occurrence_id, e.event_id, e.start_at, e.end_at, e.lat, e.lon,
                     e.categories, e.free, s.author_id, s.author_name, s.payload_json
                     FROM public_events e JOIN public_event_series s ON s.event_id = e.event_id
                     WHERE e.cell IN ({marks}) AND e.end_at >= ? AND s.hidden_at IS NULL
                     ORDER BY e.start_at, e.occurrence_id LIMIT ?"
                );
                let at = iso(now);
                let mut values: Vec<&dyn rusqlite::ToSql> = cells
                    .iter()
                    .map(|cell| cell as &dyn rusqlite::ToSql)
                    .collect();
                values.push(&at);
                values.push(&limit);
                all(db, &sql, &values)
            })
            .await
    }

    /// The next occurrence of one series still to end (an announcement's link), with its series.
    pub async fn upcoming(&self, event_id: &str, now: i64) -> Result<Option<JsonValue>, String> {
        let event_id = event_id.to_string();
        self.central
            .transaction(move |db| {
                get(
                    db,
                    "SELECT e.occurrence_id, e.event_id, e.start_at, e.end_at, e.lat, e.lon,
                     e.categories, e.free, s.author_id, s.author_name, s.payload_json
                     FROM public_events e JOIN public_event_series s ON s.event_id = e.event_id
                     WHERE e.event_id = ? AND e.end_at >= ? AND s.hidden_at IS NULL
                     ORDER BY e.start_at, e.occurrence_id LIMIT 1",
                    &[&event_id, &iso(now)],
                )
            })
            .await
    }

    /// The ended occurrences gone (a day after their end), then the repeated series whose
    /// projection ends before `until` (their next dates to publish), ten at most.
    pub async fn purge_and_stale(&self, now: i64, until: i64) -> Result<Vec<JsonValue>, String> {
        self.central
            .transaction(move |db| {
                run(db, "DELETE FROM public_events WHERE end_at < ?", &[&iso(now - DAY_MS)])?;
                all(
                    db,
                    "SELECT event_id, author_id FROM public_event_series
                     WHERE hidden_at IS NULL AND projected_until IS NOT NULL AND projected_until < ? LIMIT ?",
                    &[&iso(until), &10],
                )
            })
            .await
    }

    /// `relations.blockedEitherWay(viewer, author)`.
    pub async fn blocked(&self, viewer: &str, author: &str) -> Result<bool, String> {
        let (viewer, author) = (viewer.to_string(), author.to_string());
        self.central
            .transaction(move |db| {
                crate::social::relations::blocked_either_way(db, &viewer, &author)
            })
            .await
    }

    /// `admit(authorId)`: the reason refusing a NEW publication (`quota`, `suspended`), or none.
    pub async fn admit(&self, author: &str, now: i64) -> Result<Option<&'static str>, String> {
        let author = author.to_string();
        self.central
            .transaction(move |db| {
                let published = count(
                    db,
                    "SELECT COUNT(*) AS total FROM public_event_series WHERE author_id = ? AND published_at >= ?",
                    &[&author, &sql_seconds(now - DAY_MS)],
                )?;
                let active = count(
                    db,
                    "SELECT COUNT(DISTINCT s.event_id) AS total FROM public_event_series s JOIN public_events e ON e.event_id = s.event_id
                     WHERE s.author_id = ? AND e.end_at >= ?",
                    &[&author, &iso(now)],
                )?;
                let hidden: Vec<i64> = all(
                    db,
                    "SELECT hidden_at FROM public_event_series WHERE author_id = ? AND hidden_at >= ? ORDER BY hidden_at",
                    &[&author, &sql_seconds(now - HIDDEN_WINDOW_MS - SUSPENSION_MS)],
                )?
                .iter()
                .filter_map(|row| time_of(&js::string(&row["hidden_at"])))
                .collect();
                for index in HIDDEN_TO_SUSPEND - 1..hidden.len() {
                    if hidden[index] - hidden[index + 1 - HIDDEN_TO_SUSPEND] <= HIDDEN_WINDOW_MS
                        && now - hidden[index] < SUSPENSION_MS
                    {
                        return Ok(Some("suspended"));
                    }
                }
                // `findUserById(authorId).catch(() => null)?.created_at`.
                let created = crate::auth::accounts::find_by_id(db, &author)
                    .ok()
                    .flatten()
                    .and_then(|account| time_of(&js::id(account.get("created_at"))));
                let young = created.is_none_or(|created| now - created < NEW_ACCOUNT_MS);
                let limit = if young { NEW_ACCOUNT_PER_DAY } else { PER_DAY };
                Ok((published >= limit || active >= ACTIVE).then_some("quota"))
            })
            .await
    }
}
