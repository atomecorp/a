// The SFU's signaling (server/visio_ws_handler.js, ported): a connection joins a room as one peer
// (the account's id), opens and connects its send and receive WebRTC transports, resumes what it
// consumes, and leaves; its producers and consumers are streams.rs's. Each answer is the Node reply without its `type`, which becomes
// `signal`; a refusal is its `error`.
use super::events::Event;
use super::shapes;
use super::state;
use super::state::{Caller, Meta, Peer, Room};
use super::{Visio, worker};
use crate::vault_router::js;
use indexmap::IndexMap;
use mediasoup::prelude::*;
use serde_json::{Value as JsonValue, json};

pub(super) fn field(input: &JsonValue, keys: &[&str]) -> Option<String> {
    js::first(input, keys).map(js::string)
}

pub(super) fn signal(name: &str, mut fields: JsonValue) -> Result<JsonValue, String> {
    fields["signal"] = json!(name);
    Ok(fields)
}

pub(super) fn parsed<T: serde::de::DeserializeOwned>(
    value: Option<&JsonValue>,
) -> Result<T, String> {
    serde_json::from_value(value.cloned().unwrap_or(JsonValue::Null)).map_err(|e| e.to_string())
}

impl Visio {
    async fn ensure_room(&self, room_id: &str, owner: &str) -> Result<(), String> {
        if self.state().rooms.contains_key(room_id) {
            return Ok(());
        }
        let router = self
            .sfu
            .worker
            .create_router(RouterOptions::new(worker::media_codecs()))
            .await
            .map_err(|e| e.to_string())?;
        let mut state = self.state();
        state.rooms.entry(room_id.to_string()).or_insert(Room {
            router,
            peers: IndexMap::new(),
        });
        state
            .metas
            .entry(room_id.to_string())
            .or_insert_with(|| Meta::new(room_id, Some(owner.into()), None));
        Ok(())
    }

    async fn join(&self, caller: &Caller, input: &JsonValue) -> Result<JsonValue, String> {
        let Some(room_id) = field(input, &["room_id", "roomId"]) else {
            return Err("Missing room_id".into());
        };
        if !self
            .can_join(&caller.user, &room_id, caller.device_key.as_deref())
            .await?
        {
            return Err("Access denied".into());
        }
        self.ensure_room(&room_id, &caller.user).await?;
        let (fields, frames) = {
            let mut guard = self.state();
            let state = &mut *guard;
            state.serial += 1;
            let seat = state.seats.entry(caller.live).or_default();
            let Some(room) = state.rooms.get_mut(&room_id) else {
                return Err("Room not found".into());
            };
            let held = seat.peer_id.clone().unwrap_or_default();
            let peer_id = if room
                .peers
                .get(&held)
                .is_some_and(|peer| peer.serial == seat.serial)
            {
                held
            } else {
                let id = seat.peer_id.clone().unwrap_or_else(|| caller.user.clone());
                room.peers.insert(
                    id.clone(),
                    Peer {
                        id: id.clone(),
                        serial: state.serial,
                        user: caller.user.clone(),
                        sender: caller.sender.clone(),
                        consumers: IndexMap::new(),
                        producers: IndexMap::new(),
                        transports: IndexMap::new(),
                    },
                );
                seat.peer_id = Some(id.clone());
                seat.room_id = Some(room_id.clone());
                seat.serial = state.serial;
                id
            };
            let (mut existing, mut participants) = (Vec::new(), Vec::new());
            for other in room.peers.values().filter(|other| other.id != peer_id) {
                participants.push(json!({ "peer_user_id": other.user, "username": null }));
                for (id, produced) in &other.producers {
                    existing.push(json!({ "producer_id": id, "kind": produced.producer.kind(),
                        "peer_user_id": other.user, "paused": produced.producer.paused() }));
                }
            }
            let user = room.peers[&peer_id].user.clone();
            let fields = json!({ "room_id": room_id, "rtpCapabilities": shapes::rtp_capabilities(&room.router),
                "existingProducers": existing, "participants": participants });
            let joined =
                json!({ "type": "participantJoined", "peer_user_id": user, "username": null });
            (fields, state.notify_room(&room_id, &joined, Some(&peer_id)))
        };
        state::send(frames).await;
        signal("roomJoined", fields)
    }

    async fn leave(&self, caller: &Caller, input: &JsonValue) -> Result<JsonValue, String> {
        let closed = {
            let mut state = self.state();
            let seat = state.seats.entry(caller.live).or_default();
            let room_id = seat
                .room_id
                .take()
                .or_else(|| field(input, &["room_id", "roomId"]));
            let (peer_id, serial) = (seat.peer_id.take(), seat.serial);
            match (room_id, peer_id) {
                (Some(room_id), Some(peer_id)) => state
                    .close_peer(&room_id, &peer_id, serial)
                    .map(|closed| (room_id, closed)),
                _ => None,
            }
        };
        if let Some((room_id, (user, frames))) = closed {
            state::send(frames).await;
            self.peer_left(&room_id, &user).await;
        }
        signal("leftRoom", json!({}))
    }

    /// The connection's room and peer once joined (`Join a room first`, `Room not found`), with
    /// the peer's serial and the room's router.
    fn seated(
        &self,
        caller: &Caller,
        input: &JsonValue,
    ) -> Result<(String, String, u64, Router), String> {
        let state = self.state();
        let seat = state.seats.get(&caller.live);
        let room_id = seat
            .and_then(|seat| seat.room_id.clone())
            .or_else(|| field(input, &["room_id", "roomId"]));
        let (Some(room_id), Some(peer_id)) = (room_id, seat.and_then(|seat| seat.peer_id.clone()))
        else {
            return Err("Join a room first".into());
        };
        let room = state.rooms.get(&room_id).ok_or("Room not found")?;
        let serial = seat.map_or(0, |seat| seat.serial);
        let peer = room
            .peers
            .get(&peer_id)
            .filter(|peer| peer.serial == serial)
            .ok_or("Room not found")?;
        Ok((
            room_id.clone(),
            peer_id.clone(),
            peer.serial,
            room.router.clone(),
        ))
    }

    /// The peer, when it is still the one `serial` names.
    pub(super) fn with_peer<T>(
        &self,
        room_id: &str,
        peer_id: &str,
        serial: u64,
        work: impl FnOnce(&mut Peer) -> T,
    ) -> Option<T> {
        let mut state = self.state();
        let peer = state.rooms.get_mut(room_id)?.peers.get_mut(peer_id)?;
        (peer.serial == serial).then(|| work(peer))
    }

    pub(super) fn transport(
        &self,
        seat: &(String, String, u64, Router),
        input: &JsonValue,
    ) -> Result<WebRtcTransport, String> {
        let id = field(input, &["transport_id", "transportId"]).unwrap_or_default();
        self.with_peer(&seat.0, &seat.1, seat.2, |peer| {
            peer.transports.get(&id).cloned()
        })
        .flatten()
        .ok_or_else(|| "Transport not found".into())
    }

    pub(super) async fn signal(
        &self,
        caller: &Caller,
        action: &str,
        input: &JsonValue,
    ) -> Result<JsonValue, String> {
        match action {
            "joinRoom" => return self.join(caller, input).await,
            "leaveRoom" => return self.leave(caller, input).await,
            _ => {}
        }
        let seat = self.seated(caller, input)?;
        let (room_id, peer_id, serial, router) = &seat;
        match action {
            "createTransport" => {
                let direction = if input.get("direction") == Some(&json!("recv")) {
                    "recv"
                } else {
                    "send"
                };
                let transport = router
                    .create_webrtc_transport(self.sfu.network.transport_options())
                    .await
                    .map_err(|e| e.to_string())?;
                let events = self.events.clone();
                let closed = Event::TransportClosed {
                    room_id: room_id.clone(),
                    serial: *serial,
                    transport_id: transport.id().to_string(),
                };
                transport
                    .on_dtls_state_change(move |dtls| {
                        if dtls == mediasoup::types::data_structures::DtlsState::Closed {
                            let _ = events.send(closed.clone());
                        }
                    })
                    .detach();
                let options = shapes::transport_options(&transport);
                self.with_peer(room_id, peer_id, *serial, |peer| {
                    peer.transports
                        .insert(transport.id().to_string(), transport)
                });
                signal(
                    "transportCreated",
                    json!({ "direction": direction, "transportOptions": options }),
                )
            }
            "connectTransport" => {
                let transport = self.transport(&seat, input)?;
                let dtls_parameters = parsed(input.get("dtlsParameters"))?;
                transport
                    .connect(WebRtcTransportRemoteParameters { dtls_parameters })
                    .await
                    .map_err(|e| e.to_string())?;
                signal(
                    "transportConnected",
                    json!({ "transport_id": transport.id().to_string() }),
                )
            }
            "produce" => self.produce(&seat, input).await,
            "consume" => self.consume(caller, &seat, input).await,
            "pauseProducer" | "resumeProducer" | "closeProducer" => {
                self.producer_state(&seat, action, input).await
            }
            "resumeConsumer" => {
                let id = field(input, &["consumer_id", "consumerId"]).unwrap_or_default();
                let consumer = self
                    .with_peer(room_id, peer_id, *serial, |peer| {
                        peer.consumers
                            .get(&id)
                            .map(|consumed| consumed.consumer.clone())
                    })
                    .flatten()
                    .ok_or("Consumer not found")?;
                consumer.resume().await.map_err(|e| e.to_string())?;
                signal(
                    "consumerResumed",
                    json!({ "consumer_id": consumer.id().to_string() }),
                )
            }
            other => Err(format!("Unknown message type: {other}")),
        }
    }
}
