// What the directory publishes (server/directoryPublicService.js `list`, `publish`, `meet`,
// `meetCard`, and `/ws/api`'s `directory` family of server/wsAtomeOperations.js, ported): the
// entries a reader may read, never the Rencontre declarations.
use super::card::MEETING_KEY;
use super::meeting::Search;
use super::{Directory, stored_card};
use crate::social::news::db::{all, get, text};
use crate::social::privacy_rules;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const ENTRY_SELECT: &str =
    "SELECT principal_id, display_name, user_face, card_json, revision, updated_at
     FROM directory_public_profiles";

// A shared field protected by a privacy rule is only published to a reader the rule lets
// through; the others are shared as they are.
const PRIVATE_FIELDS: [&str; 5] = ["user_face", "phone", "email", "bio", "competences"];

// `Math.max(1, Math.min(Number(limit) || 100, 500))`.
fn limit_of(message: &JsonValue) -> i64 {
    js::number_or(message.get("limit"), 100.0).clamp(1.0, 500.0) as i64
}

fn search_of(message: &JsonValue, query: bool) -> Search {
    let field = |key: &str| text(message.get(key));
    Search {
        goal: field("goal"),
        theme: field("theme"),
        scope: field("scope"),
        query: if query { field("query") } else { String::new() },
    }
}

/// One published entry: the shared fields `reader` may read, never the Rencontre declarations.
fn publish(db: &Connection, row: &JsonValue, reader: &str) -> Result<JsonValue, String> {
    let principal = js::string(&row["principal_id"]);
    let readable = |field: &str| -> Result<bool, String> {
        if !PRIVATE_FIELDS.contains(&field) {
            return Ok(true);
        }
        if reader.is_empty() {
            return Ok(false);
        }
        privacy_rules::allows_read(db, &principal, field, reader, "directory")
    };
    let mut entry = JsonMap::new();
    for (field, value) in stored_card(row) {
        if field != MEETING_KEY && readable(&field)? {
            entry.insert(field, value);
        }
    }
    let face = if js::truthy(row.get("user_face")) && readable("user_face")? {
        json!(text(row.get("user_face")))
    } else {
        JsonValue::Null
    };
    entry.insert("principal_id".into(), row["principal_id"].clone());
    entry.insert("display_name".into(), json!(text(row.get("display_name"))));
    entry.insert("user_face".into(), face);
    entry.insert(
        "revision".into(),
        js::number_json(js::number_or(row.get("revision"), 0.0)),
    );
    entry.insert("updated_at".into(), row["updated_at"].clone());
    Ok(JsonValue::Object(entry))
}

impl Directory {
    /// `list`: the entries whose name holds `query` (lowered), the reader's own left out.
    pub(super) async fn list(
        &self,
        query: String,
        limit: i64,
        offset: i64,
        reader: String,
    ) -> Result<Vec<JsonValue>, String> {
        self.db(move |db| {
            let rows = if query.is_empty() {
                all(
                    db,
                    &format!("{ENTRY_SELECT} ORDER BY lower(display_name), principal_id LIMIT ? OFFSET ?"),
                    &[&limit, &offset],
                )?
            } else {
                all(
                    db,
                    &format!("{ENTRY_SELECT} WHERE lower(display_name) LIKE ? ORDER BY lower(display_name), principal_id LIMIT ? OFFSET ?"),
                    &[&format!("%{query}%"), &limit, &offset],
                )?
            };
            rows.iter()
                .filter(|row| {
                    !text(row.get("display_name")).is_empty()
                        && (reader.is_empty() || text(row.get("principal_id")) != reader)
                })
                .map(|row| publish(db, row, &reader))
                .collect()
        })
        .await
    }

    /// `meet`: the public cards declaring what the search asks, matched against the searcher's
    /// own declarations. Nobody is added to fill an empty answer.
    async fn meet(&self, message: &JsonValue, reader: &str) -> Result<Vec<JsonValue>, String> {
        let source = self.source_profile(reader).await?;
        let Some(source) = source.filter(|source| source.adult) else {
            return Err("meeting_adult_required".into());
        };
        let search = search_of(message, true);
        let limit = limit_of(message) as usize;
        let reader = reader.to_string();
        self.db(move |db| {
            let rows = all(
                db,
                &format!("{ENTRY_SELECT} ORDER BY lower(display_name), principal_id LIMIT 5000"),
                &[],
            )?;
            rows.iter()
                .filter(|row| {
                    let id = text(row.get("principal_id"));
                    let name = text(row.get("display_name"));
                    !name.is_empty()
                        && id != reader
                        && source.meeting.matches(
                            stored_card(row).get(MEETING_KEY),
                            &search,
                            &name,
                            &id,
                        )
                })
                .take(limit)
                .map(|row| publish(db, row, &reader))
                .collect()
        })
        .await
    }

    /// `meetCard`: one person's Rencontre card (hook, presentation, photos), for a searcher their
    /// card answers under the same search; anyone else gets nothing.
    async fn meet_card(
        &self,
        message: &JsonValue,
        reader: &str,
    ) -> Result<Option<JsonValue>, String> {
        let principal = text(message.get("principalId"));
        if principal.is_empty() || principal == reader {
            return Ok(None);
        }
        let id = principal.clone();
        let row = self
            .db(move |db| {
                get(
                    db,
                    &format!("{ENTRY_SELECT} WHERE principal_id = ?"),
                    &[&id],
                )
            })
            .await?;
        let source = self.source_profile(reader).await?;
        let Some(source) = source.filter(|source| source.adult) else {
            return Err("meeting_adult_required".into());
        };
        let Some(row) = row.filter(|row| {
            source.meeting.matches(
                stored_card(row).get(MEETING_KEY),
                &search_of(message, false),
                &text(row.get("display_name")),
                &principal,
            )
        }) else {
            return Ok(None);
        };
        // The person's own card, read now: one who is no longer an adult on it is never shown.
        let Some(candidate) = self
            .source_profile(&principal)
            .await?
            .filter(|candidate| candidate.adult)
        else {
            return Ok(None);
        };
        let reader = reader.to_string();
        let mut card = self.db(move |db| publish(db, &row, &reader)).await?;
        let meeting = candidate.meeting;
        card["area"] = json!(meeting.area);
        card["country"] = json!(meeting.country);
        card["hook"] = json!(meeting.hook);
        card["presentation"] = json!(meeting.presentation);
        card["photos"] = json!(meeting.photos);
        Ok(Some(card))
    }

    /// `/ws/api`'s `directory` family for `user`: the reply's fields, or its error.
    pub async fn answer(
        &self,
        action: &str,
        message: &JsonValue,
        user: &str,
    ) -> Result<JsonValue, String> {
        match action {
            "meet" => Ok(json!({ "entries": self.meet(message, user).await? })),
            "meet_card" => match self.meet_card(message, user).await? {
                Some(card) => Ok(json!({ "card": card })),
                None => Err("meeting_card_unavailable".into()),
            },
            "list" | "search" => {
                let query = match message.get("query") {
                    query if action == "search" && js::truthy(query) => {
                        js::trim(&js::text(query)).to_lowercase()
                    }
                    _ => String::new(),
                };
                let offset = js::number_or(message.get("offset"), 0.0).max(0.0) as i64;
                let entries = self
                    .list(query, limit_of(message), offset, user.to_string())
                    .await?;
                Ok(json!({ "entries": entries }))
            }
            _ => Err(format!(
                "Unknown directory action: {}",
                if action.is_empty() { "missing" } else { action }
            )),
        }
    }
}
