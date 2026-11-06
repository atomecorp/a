// What the worker tells on its own threads, handled in order on one task (server/
// visio_ws_handler.js's `dtlsstatechange` and `producerclose` handlers, ported): a transport whose
// DTLS closed ends with its producers (the room hears each, as Node's `transportclose`) and its
// consumers; a consumer whose producer closed is forgotten and its connection told.
use super::Visio;
use super::state::{self, Outbound};
use axum::extract::ws::Message;
use serde_json::{Value as JsonValue, json};
use tokio::sync::mpsc::{Sender, UnboundedReceiver};

#[derive(Clone)]
pub(super) enum Event {
    TransportClosed {
        room_id: String,
        serial: u64,
        transport_id: String,
    },
    ProducerClosed {
        room_id: String,
        serial: u64,
        consumer_id: String,
        live: u64,
        sender: Sender<Message>,
        data: JsonValue,
    },
}

impl Visio {
    /// The worker's events, one after another, for the server's life.
    pub(super) async fn follow(&'static self, mut events: UnboundedReceiver<Event>) {
        while let Some(event) = events.recv().await {
            let frames = self.on_event(event);
            state::send(frames).await;
        }
    }

    fn on_event(&self, event: Event) -> Vec<Outbound> {
        let mut state = self.state();
        match event {
            Event::TransportClosed {
                room_id,
                serial,
                transport_id,
            } => {
                let Some(room) = state.rooms.get_mut(&room_id) else {
                    return Vec::new();
                };
                let Some(peer) = room.peers.values_mut().find(|peer| peer.serial == serial) else {
                    return Vec::new();
                };
                let closed: Vec<String> = peer
                    .producers
                    .iter()
                    .filter(|(_, produced)| produced.transport_id == transport_id)
                    .map(|(id, _)| id.clone())
                    .collect();
                peer.producers
                    .retain(|_, produced| produced.transport_id != transport_id);
                peer.consumers
                    .retain(|_, consumed| consumed.transport_id != transport_id);
                peer.transports.shift_remove(&transport_id);
                let (peer_id, user) = (peer.id.clone(), peer.user.clone());
                closed
                    .iter()
                    .flat_map(|id| {
                        let data = json!({ "type": "producerClosed", "producer_id": id, "peer_user_id": user });
                        state.notify_room(&room_id, &data, Some(&peer_id))
                    })
                    .collect()
            }
            Event::ProducerClosed {
                room_id,
                serial,
                consumer_id,
                live,
                sender,
                data,
            } => {
                if let Some(peer) = state
                    .rooms
                    .get_mut(&room_id)
                    .and_then(|room| room.peers.values_mut().find(|peer| peer.serial == serial))
                {
                    peer.consumers.shift_remove(&consumer_id);
                }
                let seat_room = state.seats.get(&live).and_then(|seat| seat.room_id.clone());
                vec![(sender, state::event(seat_room.as_deref(), data))]
            }
        }
    }
}
