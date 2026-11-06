// Who may reach a room and whom a call reaches (server/visio.js `resolveRoomMeta`,
// `saveScheduledRoom`, `canJoinRoom`, `resolveUserInfo`, `isConnected`, ported): a planned room read
// back from `visio_rooms` at its first need, the accounts by id or by number (auth/accounts.rs),
// and the one peer-to-peer verdict and block of the contacts (social/relations.rs).
use super::Visio;
use super::state::Meta;
use crate::auth::accounts;
use crate::social::{phone, relations};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

impl Visio {
    /// `resolveRoomMeta`: the room's description, read from the planned rooms when not in memory.
    pub(super) async fn resolve_meta(&self, room_id: &str) -> Result<bool, String> {
        if room_id.is_empty() {
            return Ok(false);
        }
        if self.state().metas.contains_key(room_id) {
            return Ok(true);
        }
        let row = self
            .central
            .get(
                "SELECT * FROM visio_rooms WHERE room_id = ?",
                vec![json!(room_id)],
            )
            .await?;
        let Some(row) = row else {
            return Ok(false);
        };
        let title = js::first(&row, &["title"]).map(js::string);
        let mut meta = Meta::new(
            room_id,
            Some(js::string(&row["owner_id"])),
            title.or(Some("Visio".into())),
        );
        if let Ok(JsonValue::Array(invitees)) =
            serde_json::from_str::<JsonValue>(&js::text(row.get("invitees_json")))
        {
            meta.invites = invitees.iter().map(js::string).collect();
        }
        meta.starts_at = Some(row["starts_at"].clone());
        meta.ends_at = Some(row["ends_at"].clone());
        self.state()
            .metas
            .entry(room_id.to_string())
            .or_insert(meta);
        Ok(true)
    }

    /// `saveScheduledRoom`.
    pub(super) async fn save_scheduled(&self, room_id: &str) -> Result<(), String> {
        let values = {
            let state = self.state();
            let meta = &state.metas[room_id];
            let invites: Vec<&String> = meta.invites.iter().collect();
            vec![
                json!(meta.room_id),
                json!(meta.owner),
                json!(meta.name),
                meta.starts_at.clone().unwrap_or(JsonValue::Null),
                meta.ends_at.clone().unwrap_or(JsonValue::Null),
                json!(serde_json::to_string(&invites).map_err(|e| e.to_string())?),
            ]
        };
        self.central
            .run(
                "INSERT INTO visio_rooms (room_id, owner_id, title, starts_at, ends_at, invitees_json)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(room_id) DO UPDATE SET title = excluded.title, starts_at = excluded.starts_at,
                   ends_at = excluded.ends_at, invitees_json = excluded.invitees_json",
                values,
            )
            .await
    }

    /// `canJoinRoom`: the owner, an invited account or the owner's accepted contact of a room
    /// opened to them, never across a block, never a call ended, ringing for another, or answered
    /// on another device.
    pub(super) async fn can_join(
        &self,
        user: &str,
        room_id: &str,
        device_key: Option<&str>,
    ) -> Result<bool, String> {
        if !self.resolve_meta(room_id).await? || user.is_empty() {
            return Ok(false);
        }
        let (owner, invited, visibility) = {
            let state = self.state();
            let Some(meta) = state.metas.get(room_id) else {
                return Ok(false);
            };
            if !["preparing", "ringing", "live"].contains(&meta.status()) {
                return Ok(false);
            }
            if meta.status_is("ringing") && !meta.owned_by(user) {
                return Ok(false);
            }
            let accepted = meta
                .accepted_devices
                .as_ref()
                .and_then(|devices| devices.get(user));
            if accepted.is_some_and(|key| Some(key.as_str()) != device_key) {
                return Ok(false);
            }
            if meta.call_target.as_deref() == Some(user) && accepted.is_none() {
                return Ok(false);
            }
            if meta.owned_by(user) {
                return Ok(true);
            }
            (
                meta.owner.clone(),
                meta.invites.contains(user),
                meta.visibility.clone(),
            )
        };
        if let Some(owner) = &owner
            && self.blocked_either_way(owner, user).await?
        {
            return Ok(false);
        }
        if invited || visibility == "public" {
            return Ok(true);
        }
        Ok(visibility == "connections"
            && self
                .verdict(owner.as_deref().unwrap_or_default(), user)
                .await?["ok"]
                == true)
    }

    /// `relations.canCommunicate(sender, recipient)`: `{ ok, silent?, error? }`.
    pub(super) async fn verdict(&self, sender: &str, recipient: &str) -> Result<JsonValue, String> {
        let (sender, recipient) = (sender.to_string(), recipient.to_string());
        self.central
            .transaction(move |db| relations::can_communicate(db, &sender, &recipient))
            .await
    }

    async fn blocked_either_way(&self, a: &str, b: &str) -> Result<bool, String> {
        let (a, b) = (a.to_string(), b.to_string());
        self.central
            .transaction(move |db| relations::blocked_either_way(db, &a, &b))
            .await
    }

    /// `resolveUserInfo(userId, phone)`: the live account with that id, else the one holding that
    /// number; its id.
    pub(super) async fn account(
        &self,
        id: Option<String>,
        number: Option<String>,
    ) -> Result<Option<String>, String> {
        let user = self
            .central
            .transaction(move |db| {
                if let Some(id) = id.filter(|id| !id.is_empty())
                    && let Some(user) = accounts::find_by_id(db, &id)?
                {
                    return Ok(Some(user));
                }
                match number.filter(|number| !number.is_empty()) {
                    Some(number) => accounts::find_by_phone(db, &phone::book_phone(&number)),
                    None => Ok(None),
                }
            })
            .await?;
        Ok(user
            .map(|user| js::string(&user["user_id"]))
            .filter(|id| !id.is_empty()))
    }
}
