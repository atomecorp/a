// A peer's streams (server/visio_ws_handler.js `produce`, `consume`, `pauseProducer`,
// `resumeProducer`, `closeProducer`, ported): its microphone and camera produced, the room told; the
// others' producers consumed, paused until resumed, their close heard from the worker (events.rs);
// a producer paused, resumed or closed, the others told.
use super::Visio;
use super::events::Event;
use super::shapes;
use super::signaling::{field, parsed, signal};
use super::state::{self, Caller, Consumed, Produced};
use crate::vault_router::js;
use mediasoup::prelude::*;
use serde_json::{Value as JsonValue, json};

impl Visio {
    pub(super) async fn produce(
        &self,
        seat: &(String, String, u64, Router),
        input: &JsonValue,
    ) -> Result<JsonValue, String> {
        let (room_id, peer_id, serial, _) = seat;
        let transport = self.transport(seat, input)?;
        let kind: MediaKind = parsed(input.get("kind"))?;
        let rtp_parameters = parsed(input.get("rtpParameters"))?;
        let producer = transport
            .produce(ProducerOptions::new(kind, rtp_parameters))
            .await
            .map_err(|e| e.to_string())?;
        let id = producer.id().to_string();
        let transport_id = transport.id().to_string();
        let user = self.with_peer(room_id, peer_id, *serial, |peer| {
            peer.producers.insert(
                id.clone(),
                Produced {
                    producer,
                    transport_id,
                },
            );
            peer.user.clone()
        });
        if let Some(user) = user {
            let data = json!({ "type": "newProducer", "producer_id": id, "kind": kind, "peer_user_id": user });
            let frames = self.state().notify_room(room_id, &data, Some(peer_id));
            state::send(frames).await;
        }
        signal("produced", json!({ "producer_id": id }))
    }

    pub(super) async fn consume(
        &self,
        caller: &Caller,
        seat: &(String, String, u64, Router),
        input: &JsonValue,
    ) -> Result<JsonValue, String> {
        let (room_id, peer_id, serial, router) = seat;
        let transport = self.transport(seat, input)?;
        let Some(producer) = js::first(input, &["producer_id", "producerId"]).cloned() else {
            return Err("Missing producer_id".into());
        };
        if !js::truthy(input.get("rtpCapabilities")) {
            return Err("Missing rtpCapabilities".into());
        }
        let wanted = js::string(&producer).parse::<ProducerId>().ok();
        let capabilities = parsed::<RtpCapabilities>(input.get("rtpCapabilities")).ok();
        let (Some(producer_id), Some(capabilities)) = (wanted, capabilities) else {
            return Err("Cannot consume".into());
        };
        if !router.can_consume(&producer_id, &capabilities) {
            return Err("Cannot consume".into());
        }
        let mut options = ConsumerOptions::new(producer_id, capabilities);
        options.paused = true;
        let consumer = transport
            .consume(options)
            .await
            .map_err(|e| e.to_string())?;
        let request_id = js::first(input, &["requestId", "request_id"])
            .cloned()
            .unwrap_or(JsonValue::Null);
        let events = self.events.clone();
        let closed = Event::ProducerClosed {
            room_id: room_id.clone(),
            serial: *serial,
            consumer_id: consumer.id().to_string(),
            live: caller.live,
            sender: caller.sender.clone(),
            data: json!({ "type": "producerClosed", "producer_id": producer, "requestId": request_id }),
        };
        consumer
            .on_producer_close(move || {
                let _ = events.send(closed);
            })
            .detach();
        let options = json!({ "id": consumer.id().to_string(), "producerId": producer, "kind": consumer.kind(),
            "rtpParameters": shapes::consumer_rtp_parameters(&consumer), "type": consumer.r#type(), "appData": {} });
        let transport_id = transport.id().to_string();
        self.with_peer(room_id, peer_id, *serial, |peer| {
            peer.consumers.insert(
                consumer.id().to_string(),
                Consumed {
                    consumer,
                    transport_id,
                },
            )
        });
        signal("consumerCreated", json!({ "consumerOptions": options }))
    }

    /// Microphone or camera cut: the producer paused (or closed), and the others know.
    pub(super) async fn producer_state(
        &self,
        seat: &(String, String, u64, Router),
        action: &str,
        input: &JsonValue,
    ) -> Result<JsonValue, String> {
        let (room_id, peer_id, serial, _) = seat;
        let id = field(input, &["producer_id", "producerId"]).unwrap_or_default();
        let found = self.with_peer(room_id, peer_id, *serial, |peer| {
            let producer = peer
                .producers
                .get(&id)
                .map(|produced| produced.producer.clone());
            if action == "closeProducer" {
                peer.producers.shift_remove(&id);
            }
            producer.map(|producer| (producer, peer.user.clone()))
        });
        let (producer, user) = found.flatten().ok_or("Producer not found")?;
        let kind = producer.kind();
        let data = match action {
            "closeProducer" => {
                let paused = producer.paused();
                drop(producer);
                let data =
                    json!({ "type": "producerClosed", "producer_id": id, "peer_user_id": user });
                let frames = self.state().notify_room(room_id, &data, Some(peer_id));
                state::send(frames).await;
                return signal(
                    "producerUpdated",
                    json!({ "producer_id": id, "paused": paused }),
                );
            }
            "pauseProducer" => {
                producer.pause().await.map_err(|e| e.to_string())?;
                json!({ "type": "producerPaused", "producer_id": id, "kind": kind, "peer_user_id": user })
            }
            _ => {
                producer.resume().await.map_err(|e| e.to_string())?;
                json!({ "type": "producerResumed", "producer_id": id, "kind": kind, "peer_user_id": user })
            }
        };
        let frames = self.state().notify_room(room_id, &data, Some(peer_id));
        state::send(frames).await;
        signal(
            "producerUpdated",
            json!({ "producer_id": id, "paused": producer.paused() }),
        )
    }
}
