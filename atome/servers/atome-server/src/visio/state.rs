// What the SFU holds in memory (server/visio.js `rooms`, `roomMeta`, the `_visio*` fields of a
// connection, ported): each room's description and call state (`Meta`), each live room's router
// and peers with their transports, producers and consumers (`Room`, `Peer`), and the room and
// peer each `/ws/api` connection is in (`Seat`). Dropping a mediasoup object closes it.
use axum::extract::ws::Message;
use indexmap::{IndexMap, IndexSet};
use mediasoup::prelude::*;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use tokio::sync::mpsc::Sender;

/// The `/ws/api` connection a visio frame came from: its account, its place in the live registry,
/// its queue to the client and its device key (`_wsApiDeviceClaims.cnf.kid`).
pub struct Caller {
    pub user: String,
    pub live: u64,
    pub sender: Sender<Message>,
    pub device_key: Option<String>,
}

/// A room's description and its call (`roomMeta` entry).
pub(super) struct Meta {
    pub room_id: String,
    pub owner: Option<String>,
    pub name: String,
    pub visibility: String,
    pub invites: IndexSet<String>,
    pub call_mode: Option<String>,
    // None for a planned room (`schedule`, `visio_rooms`): its call is live (`status`).
    pub call_status: Option<String>,
    pub expires_at: Option<i64>,
    pub call_target: Option<String>,
    pub accepted_devices: Option<IndexMap<String, String>>,
    pub accepted_principal: Option<String>,
    pub accepted_key: Option<String>,
    pub starts_at: Option<JsonValue>,
    pub ends_at: Option<JsonValue>,
}

impl Meta {
    /// `ensureRoomMeta`'s new entry.
    pub fn new(room_id: &str, owner: Option<String>, name: Option<String>) -> Self {
        let short: String = room_id.chars().take(6).collect();
        Self {
            room_id: room_id.to_string(),
            owner,
            name: name.unwrap_or_else(|| format!("Room {short}")),
            visibility: "private".into(),
            invites: IndexSet::new(),
            call_mode: None,
            call_status: None,
            expires_at: None,
            call_target: None,
            accepted_devices: None,
            accepted_principal: None,
            accepted_key: None,
            starts_at: None,
            ends_at: None,
        }
    }

    /// The call as the client reads it (`snapshot`).
    pub fn snapshot(&self) -> JsonValue {
        json!({
            "roomId": self.room_id,
            "mode": self.call_mode.as_deref().unwrap_or("visio"),
            "status": self.status(),
            "expiresAt": self.expires_at.filter(|at| *at != 0),
            "targetId": self.call_target,
            "acceptedPrincipalId": self.accepted_principal,
            "acceptedKeyId": self.accepted_key,
        })
    }

    /// The call's status, one reading for the answers and for every rule: a room with none (a
    /// planned room) is live.
    pub fn status(&self) -> &str {
        self.call_status.as_deref().unwrap_or("live")
    }

    pub fn status_is(&self, status: &str) -> bool {
        self.status() == status
    }

    pub fn owned_by(&self, user: &str) -> bool {
        self.owner.as_deref() == Some(user)
    }
}

pub(super) struct Produced {
    pub producer: Producer,
    pub transport_id: String,
}

pub(super) struct Consumed {
    pub consumer: Consumer,
    pub transport_id: String,
}

/// One connection in a room. `serial` tells a peer apart from a later one under the same id.
pub(super) struct Peer {
    pub id: String,
    pub serial: u64,
    pub user: String,
    pub sender: Sender<Message>,
    pub consumers: IndexMap<String, Consumed>,
    pub producers: IndexMap<String, Produced>,
    pub transports: IndexMap<String, WebRtcTransport>,
}

pub(super) struct Room {
    pub router: Router,
    pub peers: IndexMap<String, Peer>,
}

/// The room and peer a connection is in (`_visioRoomId`, `_visioPeerId`), and the serial of the
/// peer it made: a later connection of the same account taking that peer's id leaves this one no
/// hold on it.
#[derive(Default)]
pub(super) struct Seat {
    pub room_id: Option<String>,
    pub peer_id: Option<String>,
    pub serial: u64,
}

#[derive(Default)]
pub(super) struct State {
    pub rooms: HashMap<String, Room>,
    pub metas: HashMap<String, Meta>,
    pub seats: HashMap<u64, Seat>,
    pub timers: HashMap<String, tokio::task::AbortHandle>,
    pub serial: u64,
}

/// A frame to one client queue.
pub(super) type Outbound = (Sender<Message>, JsonValue);

/// `{ type: 'visio-event', room_id, data }`.
pub(super) fn event(room_id: Option<&str>, data: JsonValue) -> JsonValue {
    json!({ "type": "visio-event", "room_id": room_id, "data": data })
}

impl State {
    /// `notifyRoom`: the frames to every peer of the room but `except`.
    pub fn notify_room(
        &self,
        room_id: &str,
        data: &JsonValue,
        except: Option<&str>,
    ) -> Vec<Outbound> {
        let Some(room) = self.rooms.get(room_id) else {
            return Vec::new();
        };
        room.peers
            .values()
            .filter(|peer| Some(peer.id.as_str()) != except)
            .map(|peer| (peer.sender.clone(), event(Some(room_id), data.clone())))
            .collect()
    }

    /// `closeRoom`: the router closed. Every producer still open first ends with its transport,
    /// and its room hears it (Node's `transportclose`), then the room and all it holds go.
    pub fn close_room(&mut self, room_id: &str) -> Vec<Outbound> {
        let mut frames = Vec::new();
        if let Some(room) = self.rooms.get(room_id) {
            for peer in room.peers.values() {
                for id in peer.producers.keys() {
                    let data = json!({ "type": "producerClosed", "producer_id": id, "peer_user_id": peer.user });
                    frames.extend(self.notify_room(room_id, &data, Some(&peer.id)));
                }
            }
        }
        // Every consumer ends before any producer: none hears its producer close.
        if let Some(room) = self.rooms.get_mut(room_id) {
            room.peers
                .values_mut()
                .for_each(|peer| peer.consumers.clear());
        }
        self.rooms.remove(room_id);
        frames
    }

    /// `closePeer` of the peer `serial` made: its consumers, producers and transports closed, the
    /// room told, the room closed once empty; the peer's account, for the call's own end
    /// (`peerLeft`).
    pub fn close_peer(
        &mut self,
        room_id: &str,
        peer_id: &str,
        serial: u64,
    ) -> Option<(String, Vec<Outbound>)> {
        let room = self.rooms.get_mut(room_id)?;
        if room.peers.get(peer_id)?.serial != serial {
            return None;
        }
        let mut peer = room.peers.shift_remove(peer_id)?;
        peer.consumers.clear();
        peer.producers.clear();
        peer.transports.clear();
        let empty = room.peers.is_empty();
        let data = json!({ "type": "participantLeft", "peer_id": peer_id, "user_id": peer.user });
        let mut frames = self.notify_room(room_id, &data, Some(peer_id));
        if empty {
            frames.extend(self.close_room(room_id));
        }
        Some((peer.user, frames))
    }
}

/// Each frame queued to its client, in order.
pub(super) async fn send(frames: Vec<Outbound>) {
    for (sender, frame) in frames {
        let _ = sender.send(Message::text(frame.to_string())).await;
    }
}
