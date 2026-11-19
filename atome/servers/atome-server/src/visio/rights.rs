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

    /// `can_join` for the connection `live` (signaling.rs `join`): an Appel's room only on the connection that accepted
    /// its invitation (lot L5); every other room exactly as `can_join` decides.
    pub(super) async fn can_join_on(
        &self,
        user: &str,
        room_id: &str,
        device_key: Option<&str>,
        live: u64,
    ) -> Result<bool, String> {
        if super::state::cb_room(room_id) {
            return Ok(!user.is_empty() && self.cb_handle_on(room_id, user, live).is_some());
        }
        self.can_join(user, room_id, device_key).await
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
        // A CB channel's room: its listeners only, under their pseudonym (lot L3, social/cb/channels.rs); an Appel's room:
        // its two members only, under their pseudonym of the call (lot L5, social/cb/random_call.rs).
        if super::state::cb_room(room_id) {
            return Ok(!user.is_empty() && self.cb_handle(room_id, user).is_some());
        }
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

    /// `cb_handle` on the connection `live`: a channel's pseudonym as it is, an Appel's only on the connection that accepted
    /// its invitation (random_call.rs `member_on`), never on another device of the same account.
    pub(super) fn cb_handle_on(&self, room_id: &str, user: &str, live: u64) -> Option<String> {
        let cb = &self.social.cb;
        cb.channels
            .member(room_id, user)
            .or_else(|| cb.calls.member_on(room_id, user, live))
    }

    /// The pseudonym `user` holds in the CB channel of `room_id`, or in the Appel of `room_id`, none if they are in neither.
    pub(super) fn cb_handle(&self, room_id: &str, user: &str) -> Option<String> {
        let cb = &self.social.cb;
        cb.channels
            .member(room_id, user)
            .or_else(|| cb.calls.member(room_id, user))
    }

    /// Whether `room_id` is an open Appel (lot L5): two voices in duplex, no floor.
    pub(super) fn cb_call_of(&self, room_id: &str) -> bool {
        self.social.cb.calls.is_call(room_id)
    }

    /// Whether `user` holds the floor of the CB channel of `room_id` now.
    pub(super) fn holds_floor(&self, room_id: &str, user: &str) -> bool {
        let now = u64::try_from(super::calls::now()).unwrap_or_default();
        self.social.cb.channels.holds_floor(room_id, user, now)
    }

    pub(super) fn cb_room_of(&self, room_id: &str) -> bool {
        self.state().rooms.get(room_id).is_some_and(|room| room.cb)
    }

    /// The peers of the CB room `room_id` that `user` blocked or that blocked them: they never hear each other.
    pub(super) async fn apart_in(
        &self,
        room_id: &str,
        user: &str,
    ) -> Result<std::collections::HashSet<String>, String> {
        let others: Vec<(String, String)> = self
            .state()
            .rooms
            .get(room_id)
            .map(|room| {
                room.peers
                    .values()
                    .filter(|peer| peer.user != user)
                    .map(|peer| (peer.id.clone(), peer.user.clone()))
                    .collect()
            })
            .unwrap_or_default();
        let user = user.to_string();
        self.central
            .transaction(move |db| {
                let mut apart = std::collections::HashSet::new();
                for (id, other) in others {
                    if relations::blocked_either_way(db, &user, &other)? {
                        apart.insert(id);
                    }
                }
                Ok(apart)
            })
            .await
    }

    /// Whether the producer `producer_id` belongs to a peer kept apart from `peer_id`.
    pub(super) fn apart_from_producer(
        &self,
        room_id: &str,
        peer_id: &str,
        producer_id: &str,
    ) -> bool {
        let state = self.state();
        let Some(room) = state.rooms.get(room_id) else {
            return false;
        };
        let Some(me) = room.peers.get(peer_id) else {
            return false;
        };
        room.peers
            .values()
            .any(|peer| peer.producers.contains_key(producer_id) && me.apart.contains(&peer.id))
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
