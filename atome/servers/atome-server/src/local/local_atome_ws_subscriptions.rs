// The subscriptions of one connection to the account's server: sent in bounded batches,
// settled by their `replay-complete`, and what a restore still awaits.
use super::local_atome_sync_progress as progress;
use super::local_atome_ws_sync::send_json;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet, VecDeque};
use tokio_tungstenite::tungstenite::Message;

// A restore's batches go a few at a time: the server answers one while the device persists the
// one before. Its queue never holds tens of thousands of streams' events for a phone that
// persists a few hundred a second, and a connection lost (the app sent to the background)
// leaves no replay behind it holding the account's vault.
const BATCHES_IN_FLIGHT: usize = 2;

#[derive(Default)]
pub(super) struct Subscriptions {
    pub(super) streams: HashSet<String>,
    pending: HashMap<String, Vec<String>>,
    order: VecDeque<String>,
    // The batches not sent yet: their id, their message and their streams.
    queued: VecDeque<(String, Value, Vec<String>)>,
    pub(super) applied: HashSet<String>,
    // Streams subscribed at cursor 0 not received yet: a restore's remaining work.
    pub(super) waiting: HashSet<String>,
    pub(super) batch: bool,
    pub(super) settlement: bool,
}
impl Subscriptions {
    pub(super) async fn subscribe<S>(
        &mut self,
        sink: &mut S,
        cursors: Vec<(String, i64)>,
        announced: Vec<String>,
    ) -> Result<(), String>
    where
        S: futures_util::Sink<Message> + Unpin,
        S::Error: std::fmt::Display,
    {
        let mut known: HashMap<String, i64> = cursors.into_iter().collect();
        known.entry("directory.public".into()).or_insert(0);
        for stream in &announced {
            known.entry(stream.clone()).or_insert(0);
        }
        // The server's order is kept (the account's own record, its profile, comes first:
        // a new device's home awaits it); the streams it does not name follow by id.
        let rank: HashMap<&str, usize> = announced
            .iter()
            .enumerate()
            .rev()
            .map(|(index, stream)| (stream.as_str(), index))
            .collect();
        let mut fresh: Vec<_> = known
            .into_iter()
            .filter(|(stream, _)| !self.streams.contains(stream))
            .collect();
        fresh.sort_by(|a, b| {
            let place = |stream: &str| rank.get(stream).copied().unwrap_or(usize::MAX);
            place(&a.0).cmp(&place(&b.0)).then_with(|| a.0.cmp(&b.0))
        });
        for batch in fresh.chunks(if self.batch { 500 } else { 1 }) {
            let id = if self.batch {
                uuid::Uuid::new_v4().to_string()
            } else {
                batch[0].0.clone()
            };
            let mut message = if self.batch {
                json!({"type":"subscribe", "streams":batch.iter().map(|(stream,cursor)| json!({"stream":stream,"cursor":cursor})).collect::<Vec<_>>()})
            } else {
                json!({"type":"subscribe","stream":batch[0].0,"cursor":batch[0].1})
            };
            if self.batch && self.settlement {
                message["subscription_id"] = json!(id);
            }
            let streams: Vec<String> = batch.iter().map(|(stream, _)| stream.clone()).collect();
            self.waiting.extend(
                batch
                    .iter()
                    .filter(|(_, cursor)| *cursor == 0)
                    .map(|(stream, _)| stream.clone()),
            );
            self.streams.extend(streams.iter().cloned());
            self.queued.push_back((id, message, streams));
        }
        self.send_ready(sink).await
    }
    // The queued batches sent while fewer than BATCHES_IN_FLIGHT await their answer (a server
    // without batches answers every single subscription: they all go at once).
    pub(super) async fn send_ready<S>(&mut self, sink: &mut S) -> Result<(), String>
    where
        S: futures_util::Sink<Message> + Unpin,
        S::Error: std::fmt::Display,
    {
        while !self.batch || self.pending.len() < BATCHES_IN_FLIGHT {
            let Some((id, message, streams)) = self.queued.pop_front() else {
                break;
            };
            send_json(sink, message).await?;
            self.pending.insert(id.clone(), streams);
            self.order.push_back(id);
        }
        Ok(())
    }
    // No batch awaits its answer nor waits to be sent.
    pub(super) fn settled(&self) -> bool {
        self.pending.is_empty() && self.queued.is_empty()
    }
    pub(super) fn settle(&mut self, message: &Value) -> bool {
        if self.batch && self.settlement && message.get("subscription_id").is_none() {
            return false;
        }
        let id = message
            .get("subscription_id")
            .or_else(|| message.get("stream"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| self.order.front().cloned());
        let Some(id) = id else {
            return false;
        };
        let Some(streams) = self.pending.remove(&id) else {
            return false;
        };
        for stream in &streams {
            self.waiting.remove(stream);
        }
        self.order.retain(|entry| entry != &id);
        true
    }
    pub(super) fn replay(&self) -> progress::Replay {
        progress::Replay {
            pending: self.pending.len() + self.queued.len(),
            total: self.streams.len(),
            waiting: self.waiting.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn batches_are_bounded_correlated_and_settled_once() {
        let sent = Arc::new(Mutex::new(Vec::<Value>::new()));
        let captured = sent.clone();
        let mut sink = Box::pin(futures_util::sink::unfold(
            captured,
            |captured, message: Message| async move {
                if let Message::Text(text) = message {
                    captured
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str(&text).unwrap());
                }
                Ok::<_, std::convert::Infallible>(captured)
            },
        ));
        let mut state = Subscriptions {
            batch: true,
            settlement: true,
            ..Default::default()
        };
        state
            .subscribe(
                &mut sink,
                vec![],
                (0..1200).map(|index| format!("stream-{index}")).collect(),
            )
            .await
            .unwrap();
        let sizes = |sent: &Arc<Mutex<Vec<Value>>>| {
            sent.lock()
                .unwrap()
                .iter()
                .map(|message| message["streams"].as_array().unwrap().len())
                .collect::<Vec<_>>()
        };
        // Two batches in flight; the third goes once the first is answered.
        assert_eq!(sizes(&sent), vec![500, 500]);
        assert_eq!(state.replay().pending, 3);
        assert_eq!(state.waiting.len(), 1201);
        let mut answered = 0;
        while answered < sent.lock().unwrap().len() {
            let message = sent.lock().unwrap()[answered].clone();
            let reply = json!({"subscription_id":message["subscription_id"]});
            assert!(state.settle(&reply));
            assert!(!state.settle(&reply));
            state.send_ready(&mut sink).await.unwrap();
            answered += 1;
        }
        assert_eq!(sizes(&sent), vec![500, 500, 201]);
        assert!(state.settled());
        state
            .subscribe(&mut sink, vec![], vec!["stream-1".into()])
            .await
            .unwrap();
        assert_eq!(sent.lock().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn the_announced_order_is_kept_before_the_known_streams() {
        let sent = Arc::new(Mutex::new(Vec::<Value>::new()));
        let captured = sent.clone();
        let mut sink = Box::pin(futures_util::sink::unfold(
            captured,
            |captured, message: Message| async move {
                if let Message::Text(text) = message {
                    captured
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str(&text).unwrap());
                }
                Ok::<_, std::convert::Infallible>(captured)
            },
        ));
        let mut state = Subscriptions {
            batch: true,
            ..Default::default()
        };
        state
            .subscribe(
                &mut sink,
                vec![("0-known".into(), 7)],
                vec!["f-profile".into(), "1-other".into(), "0-known".into()],
            )
            .await
            .unwrap();
        let streams = sent.lock().unwrap()[0]["streams"].clone();
        assert_eq!(
            streams
                .as_array()
                .unwrap()
                .iter()
                .map(|entry| (
                    entry["stream"].as_str().unwrap().to_string(),
                    entry["cursor"].as_i64().unwrap()
                ))
                .collect::<Vec<_>>(),
            vec![
                ("f-profile".to_string(), 0),
                ("1-other".to_string(), 0),
                ("0-known".to_string(), 7),
                ("directory.public".to_string(), 0)
            ]
        );
    }

    #[test]
    fn an_unrelated_receipt_cannot_complete_another_subscription() {
        let mut state = Subscriptions::default();
        state
            .pending
            .insert("expected".into(), vec!["stream".into()]);
        state.order.push_back("expected".into());
        assert!(!state.settle(&json!({"subscription_id":"old-socket"})));
        assert_eq!(state.pending.len(), 1);
        assert!(state.settle(&json!({"streams":[]})));
    }
}
