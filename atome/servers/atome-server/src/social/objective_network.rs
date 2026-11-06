// The objectives network (server/objective_network.js, ported): the people who may be found for
// an objective, for those who share it. The truth is each person's own `objective_visibility`
// Atome in their vault (« Visib. » lit, and what they chose to show: the objective's shown name,
// its moments, a language, an approximate zone) and their `objective_network` switch; this only
// PROJECTS what a lit « Visib. » shows into the shared base after every commit touching them.
// Never a health value, a precise place or the person's notebook. For adults only, on both
// sides; searching is not being findable. A report is recorded once per reporter; three
// distinct ones hide the person, their case waiting in eVe's moderation queue.
use super::directory::Directory;
use super::news::db::{all, get, run, text};
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

const VISIBILITY_TYPE: &str = "objective_visibility";
const NETWORK_TYPE: &str = "objective_network";
const CASE_KIND: &str = "objective_network_person";
const REPORTS_TO_HIDE: i64 = 3;
const REPORT_REASONS: [&str; 4] = ["spam", "abuse", "fake", "other"];
const MOMENTS: [&str; 3] = ["morning", "noon", "evening"];
const PEOPLE_LIMIT: i64 = 200;

// `text(value, max)`: trimmed, then its first `max` UTF-16 units.
fn clip(value: Option<&JsonValue>, max: usize) -> String {
    js::slice(&text(value), max)
}

// `parse(value)`: a JSON text read back (null when unreadable), any other value as it is.
fn parse(value: Option<&JsonValue>) -> JsonValue {
    match value {
        Some(JsonValue::String(raw)) => serde_json::from_str(raw).unwrap_or(JsonValue::Null),
        Some(value) => value.clone(),
        None => JsonValue::Null,
    }
}

// `String(state?.type || '').toLowerCase()`.
fn kind_of(state: &JsonValue) -> String {
    let kind = state.get("type").filter(|kind| js::truthy(Some(kind)));
    kind.map(js::string).unwrap_or_default().to_lowercase()
}

/// `objectiveNetworkSwitchId(ownerId)`.
pub fn switch_id(owner: &str) -> String {
    format!("{NETWORK_TYPE}:{owner}")
}

pub struct ObjectiveNetwork {
    central: Central,
    router: Arc<VaultRouter>,
}

impl ObjectiveNetwork {
    pub fn new(central: Central, router: Arc<VaultRouter>) -> Self {
        Self { central, router }
    }

    async fn state_of(&self, owner: &str, atome_id: &str) -> JsonValue {
        // `getState(...).catch(() => null)`.
        self.router
            .get_state(owner, &json!(atome_id))
            .await
            .unwrap_or(JsonValue::Null)
    }

    async fn sql(&self, sql: &'static str, values: Vec<String>) -> Result<(), String> {
        self.central
            .transaction(move |db| {
                let values: Vec<&dyn rusqlite::ToSql> = values
                    .iter()
                    .map(|value| value as &dyn rusqlite::ToSql)
                    .collect();
                run(db, sql, &values).map(drop)
            })
            .await
    }

    async fn remove(&self, atome_id: &str) -> Result<(), String> {
        self.sql(
            "DELETE FROM objective_network_entries WHERE objective_atome_id = ?",
            vec![atome_id.to_string()],
        )
        .await
    }

    // `profileOf(id)` as the directory reads it, `null` on a failure.
    async fn adult(directory: &Directory, principal: &str) -> bool {
        matches!(directory.source_profile(principal).await, Ok(Some(profile)) if profile.adult)
    }

    /// After a commit touching `atome_id` (in `owner`'s vault): the base follows the Atome. The
    /// switch turned on projects every « Visib. » of the owner again: one lit while the switch
    /// was still off was taken out and must come back.
    pub async fn project(
        &self,
        directory: &Directory,
        owner: &str,
        atome_id: &str,
    ) -> Result<(), String> {
        let state = self.state_of(owner, atome_id).await;
        if kind_of(&state) != NETWORK_TYPE {
            return self.visibility(directory, owner, atome_id, &state).await;
        }
        let properties = &state["properties"];
        if properties.get("enabled") == Some(&json!(false))
            || properties.get("__deleted") == Some(&json!(true))
        {
            return self
                .sql(
                    "DELETE FROM objective_network_entries WHERE principal_id = ?",
                    vec![owner.to_string()],
                )
                .await;
        }
        let listed = self
            .router
            .list_states(
                owner,
                &json!({ "atomeType": VISIBILITY_TYPE, "limit": 1000 }),
            )
            .await?;
        for listed in listed.as_array().into_iter().flatten() {
            let id = js::first(listed, &["atome_id", "id"])
                .map(js::string)
                .unwrap_or_default();
            let state = self.state_of(owner, &id).await;
            self.visibility(directory, owner, &id, &state).await?;
        }
        Ok(())
    }

    // A « Visib. » projected, or taken out of the base.
    async fn visibility(
        &self,
        directory: &Directory,
        owner: &str,
        atome_id: &str,
        state: &JsonValue,
    ) -> Result<(), String> {
        let properties = &state["properties"];
        if kind_of(state) != VISIBILITY_TYPE
            || properties.get("__deleted") == Some(&json!(true))
            || properties.get("visible") != Some(&json!(true))
        {
            return self.remove(atome_id).await;
        }
        let switch = self.state_of(owner, &switch_id(owner)).await;
        if switch.pointer("/properties/enabled") == Some(&json!(false))
            || !Self::adult(directory, owner).await
        {
            return self.remove(atome_id).await;
        }
        let key = clip(properties.get("objective_key"), 120);
        if key.is_empty() {
            return self.remove(atome_id).await;
        }
        let moments: Vec<JsonValue> = match parse(properties.get("moments")) {
            JsonValue::Array(moments) => moments
                .into_iter()
                .filter(|moment| {
                    moment
                        .as_str()
                        .is_some_and(|moment| MOMENTS.contains(&moment))
                })
                .collect(),
            _ => Vec::new(),
        };
        let payload = json!({ "shown_name": clip(properties.get("shown_name"), 80),
            "language": clip(properties.get("language"), 16), "zone": clip(properties.get("zone"), 80),
            "moments": moments });
        self.sql(
            "INSERT INTO objective_network_entries (objective_atome_id, principal_id, objective_key, payload_json)
             VALUES (?, ?, ?, ?) ON CONFLICT(objective_atome_id) DO UPDATE SET principal_id = excluded.principal_id,
             objective_key = excluded.objective_key, payload_json = excluded.payload_json, updated_at = datetime('now')",
            vec![atome_id.to_string(), owner.to_string(), key, payload.to_string()],
        )
        .await
    }

    /// The commits of one request: each `objective_visibility` or `objective_network` Atome.
    pub async fn after_commit(
        &self,
        directory: &Directory,
        events: &[JsonValue],
    ) -> Result<(), String> {
        for event in events {
            let atome_id = clip(event.get("atome_id"), 300);
            if !atome_id.starts_with(&format!("{VISIBILITY_TYPE}:"))
                && !atome_id.starts_with(&format!("{NETWORK_TYPE}:"))
            {
                continue;
            }
            if let Some(owner) = self.router.owner_of(&atome_id).await? {
                self.project(directory, &owner, &atome_id).await?;
            }
        }
        Ok(())
    }

    // The people who show themselves for `key`, as the searcher may see them.
    async fn people(
        &self,
        directory: &Directory,
        viewer: &str,
        key: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        if !Self::adult(directory, viewer).await {
            return Ok(json!({ "ok": false, "error": "objective_network_adult_required" }));
        }
        let (key, me) = (clip(key, 120), viewer.to_string());
        let rows = self
            .central
            .transaction(move |db| {
                all(
                    db,
                    "SELECT principal_id, payload_json FROM objective_network_entries WHERE objective_key = ? AND principal_id != ?
                     ORDER BY updated_at DESC LIMIT ?",
                    &[&key, &me, &PEOPLE_LIMIT],
                )
            })
            .await?;
        let mut entries = Vec::new();
        for row in rows {
            let principal = js::string(&row["principal_id"]);
            let (target, me) = (principal.clone(), viewer.to_string());
            let excluded = self
                .central
                .transaction(move |db| {
                    let hidden = get(
                        db,
                        "SELECT hidden_at FROM moderation_cases WHERE kind = ? AND target_id = ? AND hidden_at IS NOT NULL",
                        &[&CASE_KIND, &target],
                    )?
                    .is_some();
                    Ok(hidden || super::relations::blocked_either_way(db, &me, &target)?)
                })
                .await?;
            if excluded {
                continue;
            }
            let Ok(Some(card)) = directory.source_profile(&principal).await else {
                continue;
            };
            if !card.adult {
                continue;
            }
            let payload = match parse(row.get("payload_json")) {
                JsonValue::Null => json!({}),
                payload => payload,
            };
            let display_name = clip(Some(&json!(card.display_name)), 80);
            let mut entry = serde_json::Map::new();
            entry.insert("principal_id".into(), json!(principal));
            // `text(card.display_name) || payload.shown_name`, left out when neither.
            match (display_name.is_empty(), payload.get("shown_name")) {
                (false, _) => drop(entry.insert("display_name".into(), json!(display_name))),
                (true, Some(shown)) => drop(entry.insert("display_name".into(), shown.clone())),
                (true, None) => {}
            }
            entry.insert(
                "user_face".into(),
                if card.user_face.is_empty() {
                    JsonValue::Null
                } else {
                    json!(card.user_face)
                },
            );
            // `undefined` fields are left out of the frame.
            for (name, value) in [
                ("shown_name", payload.get("shown_name").cloned()),
                (
                    "moments",
                    Some(
                        payload
                            .get("moments")
                            .filter(|m| js::truthy(Some(m)))
                            .cloned()
                            .unwrap_or(json!([])),
                    ),
                ),
                ("language", payload.get("language").cloned()),
                ("zone", payload.get("zone").cloned()),
            ] {
                if let Some(value) = value {
                    entry.insert(name.into(), value);
                }
            }
            entries.push(JsonValue::Object(entry));
        }
        Ok(json!({ "ok": true, "entries": entries }))
    }

    // One report by an account on another (never themselves); the third distinct one hides them
    // and opens their case.
    async fn report(
        &self,
        viewer: &str,
        target: Option<&JsonValue>,
        reason: &str,
    ) -> Result<JsonValue, String> {
        let target = clip(target, 200);
        if target.is_empty() || target == viewer {
            return Ok(json!({ "ok": false, "error": "objective_network_report_target_invalid" }));
        }
        let reason = if REPORT_REASONS.contains(&reason) {
            reason
        } else {
            "other"
        }
        .to_string();
        let (me, case_id) = (viewer.to_string(), uuid::Uuid::new_v4().to_string());
        let now = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string();
        self.central
            .transaction(move |db| {
                run(
                    db,
                    "INSERT INTO objective_network_reports (target_id, reporter_id, reason) VALUES (?, ?, ?)
                     ON CONFLICT(target_id, reporter_id) DO NOTHING",
                    &[&target, &me, &reason],
                )?;
                let total = get(
                    db,
                    "SELECT COUNT(*) AS total FROM objective_network_reports WHERE target_id = ?",
                    &[&target],
                )?
                .map_or(0, |row| js::number(row.get("total")) as i64);
                let hidden = (total >= REPORTS_TO_HIDE).then_some(now);
                run(
                    db,
                    "INSERT INTO moderation_cases (case_id, kind, target_id, reports, hidden_at) VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(kind, target_id) DO UPDATE SET reports = excluded.reports, updated_at = datetime('now'),
                     hidden_at = COALESCE(moderation_cases.hidden_at, excluded.hidden_at), status = 'open'",
                    &[&case_id, &CASE_KIND, &target, &total, &hidden],
                )
                .map(drop)
            })
            .await?;
        Ok(json!({ "ok": true, "status": "recorded" }))
    }

    /// The `objective-network` frame of `/ws/api` (an account only): `people`, `report`.
    pub async fn handle(
        &self,
        directory: &Directory,
        message: &JsonValue,
        viewer: &str,
    ) -> Result<JsonValue, String> {
        match clip(message.get("action"), 40).as_str() {
            "people" => {
                let key =
                    js::first(message, &["objectiveKey"]).or_else(|| message.get("objective_key"));
                self.people(directory, viewer, key).await
            }
            "report" => {
                let target = js::first(message, &["userId"]).or_else(|| message.get("peerId"));
                let reason = clip(message.get("reason"), 40);
                self.report(viewer, target, &reason).await
            }
            _ => Ok(json!({ "ok": false, "error": "objective_network_action_invalid" })),
        }
    }
}
