// The public directory (server/directoryPublicService.js, ported): each user's public card,
// projected from their profile into `directory_public_profiles`, every change of it an
// invalidation event of the `directory.public` stream that the devices following it hear
// (ws_sync/). Read by `/ws/api`'s `directory` family (entries.rs), the contacts' list, and
// Fastify's thin client (`directory:*` SERVICE frames).
mod card;
mod entries;
mod meeting;

pub use card::Profile;

use crate::social::news::db::{get, run, text};
use crate::vault_router::central::Central;
use crate::vault_router::{VaultRouter, js};
use crate::ws_sync::SyncRuntime;
use atome_store::append::iso_now;
use futures_util::future::join_all;
use rusqlite::Connection;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::HashSet;
use std::sync::Arc;

const STREAM: &str = "directory.public";
// The profiles refreshed at once by a rebuild.
const REBUILDING: usize = 8;

// A user's profile particles in the central database, one row per user.
const PROFILE_SELECT: &str = "SELECT a.atome_id,
        MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility,
        MAX(CASE WHEN p.particle_key = 'access' THEN p.particle_value END) AS access,
        MAX(CASE WHEN p.particle_key = 'name' THEN p.particle_value END) AS name,
        MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
        MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
        MAX(CASE WHEN p.particle_key IN ('first_name', 'firstname', 'firstName') THEN p.particle_value END) AS first_name,
        MAX(CASE WHEN p.particle_key = 'nickname' THEN p.particle_value END) AS nickname,
        MAX(CASE WHEN p.particle_key = 'user_face' THEN p.particle_value END) AS user_face,
        MAX(CASE WHEN p.particle_key = 'eve_profile' THEN p.particle_value END) AS eve_profile
    FROM atomes a LEFT JOIN particles p ON p.atome_id = a.atome_id
    WHERE a.atome_id = ? AND a.atome_type = 'user' AND a.deleted_at IS NULL
    GROUP BY a.atome_id";

pub struct Directory {
    central: Central,
    router: Arc<VaultRouter>,
    sync: Arc<SyncRuntime>,
}

fn next_revision(db: &Connection, principal: &str) -> Result<i64, String> {
    db.query_row(
        "SELECT COALESCE(MAX(revision), 0) FROM directory_public_events WHERE principal_id = ?",
        [principal],
        |row| row.get::<_, i64>(0),
    )
    .map(|revision| revision + 1)
    .map_err(|e| e.to_string())
}

// One invalidation of `principal`'s entry, stored in the stream it is replayed from.
fn record(
    db: &Connection,
    principal: &str,
    action: &str,
    revision: i64,
) -> Result<JsonValue, String> {
    let id = uuid::Uuid::new_v4().to_string();
    run(
        db,
        "INSERT INTO directory_public_events (event_id, principal_id, action, revision) VALUES (?, ?, ?, ?)",
        &[&id, &principal, &action, &revision],
    )?;
    Ok(json!({
        "id": id,
        "stream_id": STREAM,
        "kind": "directory.invalidate",
        "source": "directory-service",
        "payload": { "principal_id": principal, "action": action, "revision": revision },
        "ts": iso_now(),
        "sequence": db.last_insert_rowid(),
    }))
}

/// The stream's events after `cursor`, oldest first, as a device replays them.
pub async fn events(central: &Central, cursor: u64, limit: u64) -> Result<Vec<JsonValue>, String> {
    let rows = central
        .all(
            "SELECT sequence, event_id, principal_id, action, revision, created_at
             FROM directory_public_events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?"
                .into(),
            vec![json!(cursor), json!(limit.clamp(1, 1000))],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row["event_id"],
                "stream_id": STREAM,
                "sequence": row["sequence"],
                "source": "directory-service",
                "kind": "directory.invalidate",
                "payload": { "principal_id": row["principal_id"], "action": row["action"], "revision": row["revision"] },
                "projection": null,
                "lww_decisions": null,
                "ts": row["created_at"],
            })
        })
        .collect())
}

impl Directory {
    pub fn new(central: Central, router: Arc<VaultRouter>, sync: Arc<SyncRuntime>) -> Self {
        Self {
            central,
            router,
            sync,
        }
    }

    async fn db<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Connection) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        self.central.transaction(move |db| work(db)).await
    }

    /// `sourceProfile`: the user's central particles under their vault's own properties.
    pub async fn source_profile(&self, principal: &str) -> Result<Option<Profile>, String> {
        let id = principal.to_string();
        let auth_row = self.db(move |db| get(db, PROFILE_SELECT, &[&id])).await?;
        let state = self.router.get_state(principal, &json!(principal)).await?;
        let properties = state
            .get("properties")
            .and_then(JsonValue::as_object)
            .cloned()
            .unwrap_or_default();
        let mut row: JsonMap<String, JsonValue> = match auth_row {
            Some(JsonValue::Object(row)) => row,
            _ if properties.is_empty() => return Ok(None),
            _ => JsonMap::new(),
        };
        let stored = row.get("eve_profile").cloned();
        row.extend(properties.clone());
        row.insert("atome_id".into(), json!(principal));
        row.insert(
            "eve_profile".into(),
            properties
                .get("eve_profile")
                .cloned()
                .or(stored)
                .unwrap_or(JsonValue::Null),
        );
        Ok(Some(card::project(&JsonValue::Object(row), principal)))
    }

    /// `refreshPrincipal`: the entry projected again (gone once `deleted`), and the stream told.
    pub async fn refresh(&self, principal: &str, deleted: bool) -> Result<JsonValue, String> {
        let profile = if deleted {
            None
        } else {
            self.source_profile(principal).await?
        };
        let next = profile
            .filter(|profile| profile.public && !profile.display_name.is_empty())
            .map(|profile| {
                let card = serde_json::to_string(&profile.card).map_err(|e| e.to_string());
                card.map(|card| (profile.display_name, profile.user_face, card))
            })
            .transpose()?;
        let id = principal.to_string();
        let event = self
            .db(move |db| {
                let previous = get(
                    db,
                    "SELECT display_name, user_face, card_json, revision FROM directory_public_profiles WHERE principal_id = ?",
                    &[&id],
                )?;
                let Some((name, face, card)) = next else {
                    if previous.is_none() {
                        return Ok(None);
                    }
                    run(db, "DELETE FROM directory_public_profiles WHERE principal_id = ?", &[&id])?;
                    let action = if deleted { "delete" } else { "revoke" };
                    return record(db, &id, action, next_revision(db, &id)?).map(Some);
                };
                if previous.as_ref().is_some_and(|previous| {
                    text(previous.get("display_name")) == name
                        && text(previous.get("user_face")) == face
                        && text(previous.get("card_json")) == card
                }) {
                    return Ok(None);
                }
                let revision = next_revision(db, &id)?;
                let photo = Some(face).filter(|face| !face.is_empty());
                run(
                    db,
                    "INSERT INTO directory_public_profiles (principal_id, display_name, user_face, card_json, revision)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(principal_id) DO UPDATE SET display_name = excluded.display_name,
                     user_face = excluded.user_face, card_json = excluded.card_json, revision = excluded.revision,
                     updated_at = datetime('now')",
                    &[&id, &name, &photo, &card, &revision],
                )?;
                record(db, &id, "upsert", revision).map(Some)
            })
            .await?;
        Ok(match event {
            Some(event) => {
                self.sync.publish_directory(&event);
                event
            }
            None => json!({ "unchanged": true, "principal_id": principal }),
        })
    }

    /// `rebuild`: every user's entry projected again, the entries of users gone removed. A
    /// profile that cannot be read is named in `failed`; the others are rebuilt all the same.
    pub async fn rebuild(&self) -> Result<JsonValue, String> {
        let (active, projected) = self
            .db(|db| {
                let ids = |sql: &str| -> Result<Vec<String>, String> {
                    let mut statement = db.prepare_cached(sql).map_err(|e| e.to_string())?;
                    let rows = statement
                        .query_map([], |row| row.get::<_, String>(0))
                        .map_err(|e| e.to_string())?;
                    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
                };
                Ok((
                    ids("SELECT atome_id FROM atomes WHERE atome_type = 'user' AND deleted_at IS NULL")?,
                    ids("SELECT principal_id FROM directory_public_profiles")?,
                ))
            })
            .await?;
        let kept: HashSet<&String> = active.iter().collect();
        let refreshed: Vec<(&String, bool)> = active
            .iter()
            .map(|id| (id, false))
            .chain(
                projected
                    .iter()
                    .filter(|id| !kept.contains(id))
                    .map(|id| (id, true)),
            )
            .collect();
        let mut failed = Vec::new();
        for batch in refreshed.chunks(REBUILDING) {
            let outcomes =
                join_all(batch.iter().map(|(id, deleted)| self.refresh(id, *deleted))).await;
            for ((id, _), outcome) in batch.iter().zip(outcomes) {
                if let Err(error) = outcome {
                    failed.push(json!({ "principal_id": id, "error": error }));
                }
            }
        }
        let profiles = self.list(String::new(), 500, 0, String::new()).await?.len();
        Ok(json!({ "profiles": profiles, "failed": failed }))
    }

    /// The SERVICE frames of Fastify's thin client (server/directory_client.js).
    pub async fn service(&self, operation: &str, payload: &JsonValue) -> Result<JsonValue, String> {
        let principal = js::id(payload.get("principal_id"));
        match operation {
            "directory:refresh" => {
                self.refresh(&principal, payload.get("deleted") == Some(&json!(true)))
                    .await
            }
            "directory:source-profile" => Ok(self
                .source_profile(&principal)
                .await?
                .map_or(JsonValue::Null, |profile| profile.json())),
            _ => Err(format!("directory_operation_unknown:{operation}")),
        }
    }
}

// `card_json` of an entry: its card fields, an empty card when unreadable.
fn stored_card(row: &JsonValue) -> JsonMap<String, JsonValue> {
    match card::parse(row.get("card_json")) {
        JsonValue::Object(card) => card,
        _ => JsonMap::new(),
    }
}
