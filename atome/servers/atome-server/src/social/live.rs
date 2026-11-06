// The live `/ws/api` connections (server/wsApiState.js, ported): every connection, each joined to
// the account it acts as (ws_api/identity.rs decides who a connection is and joins or leaves its
// account's set). A frame to a person reaches all their live connections (or all but
// one); a direct message or a notice for someone offline waits in their queue, flushed to the
// first connection that attaches to them. `notify` is `deliverNotification`
// (server/communication_delivery.js): a notice stacked, then told live or queued, then pushed.
use super::NotificationStack;
use super::push::{Audience, Push};
use crate::ws_api::Connection;
use axum::extract::ws::Message;
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, LazyLock, Mutex, Weak};
use tokio::sync::mpsc::Sender;

// Each queue holds 200 frames at most, and 500 people at most have one: the oldest queue goes first.
const PENDING_QUEUE_MAX: usize = 200;
const PENDING_USERS_MAX: usize = 500;

#[derive(Default)]
struct Registry {
    next: u64,
    // Every connection, authenticated or not (`wsApiConnections`), in the order it opened.
    all: IndexMap<u64, Weak<Connection>>,
    // account -> its connections (`wsApiClientsByUserId`).
    users: HashMap<String, IndexMap<u64, ()>>,
    // connection -> the account it is attached to (`_wsApiUserId`).
    attached: HashMap<u64, String>,
    // account -> what waits for its next connection, the oldest queue first.
    pending: IndexMap<String, VecDeque<JsonValue>>,
}

static LIVE: LazyLock<Mutex<Registry>> = LazyLock::new(Mutex::default);

fn registry() -> std::sync::MutexGuard<'static, Registry> {
    LIVE.lock().expect("live connections")
}

impl Registry {
    fn detach(&mut self, id: u64) -> bool {
        let Some(user) = self.attached.remove(&id) else {
            return false;
        };
        if let Some(set) = self.users.get_mut(&user) {
            set.shift_remove(&id);
            if set.is_empty() {
                self.users.remove(&user);
            }
        }
        true
    }

    fn senders(&self, user: &str, except: Option<u64>) -> Vec<Sender<Message>> {
        self.users
            .get(user)
            .into_iter()
            .flat_map(IndexMap::keys)
            .filter(|id| Some(**id) != except)
            .filter_map(|id| self.all.get(id).and_then(Weak::upgrade))
            .map(|connection| connection.sender())
            .collect()
    }
}

/// What a frame to a person reached: whether one connection took it, and how many it was sent to.
pub struct Delivery {
    pub delivered: bool,
    pub recipient_connections: usize,
}

impl Delivery {
    /// `{ delivered, recipientConnections }`.
    pub fn json(&self) -> JsonValue {
        json!({ "delivered": self.delivered, "recipientConnections": self.recipient_connections })
    }
}

// `wsSendJsonToTargets`: one text to each target, delivered when one of them took it.
async fn send_all(targets: Vec<Sender<Message>>, payload: &JsonValue) -> Delivery {
    let raw = payload.to_string();
    let mut delivered = false;
    for target in &targets {
        if target.send(Message::text(raw.clone())).await.is_ok() {
            delivered = true;
        }
    }
    Delivery {
        delivered,
        recipient_connections: targets.len(),
    }
}

/// A connection's place in the registry, drawn before it opens.
pub fn next_id() -> u64 {
    let mut live = registry();
    live.next += 1;
    live.next
}

/// The connection opened under `id`.
pub(crate) fn open(id: u64, connection: &Arc<Connection>) {
    registry().all.insert(id, Arc::downgrade(connection));
}

/// Every open connection, in the order they opened (`wsApiConnections`).
pub(crate) fn connections() -> Vec<Arc<Connection>> {
    registry().all.values().filter_map(Weak::upgrade).collect()
}

/// How many connections are open, and how many accounts have one (`/dev/state`).
pub fn counts() -> (usize, usize) {
    let live = registry();
    (live.all.len(), live.users.len())
}

/// The connection closed: it leaves every set.
pub fn close(id: u64) {
    let mut live = registry();
    live.all.shift_remove(&id);
    live.detach(id);
}

/// `attachWsApiClientToUser`: the connection joins `user`'s set (leaving another account's), then
/// what waited for `user` is sent to it, in order, until a send fails.
pub async fn attach(id: u64, user: &str) {
    let (sender, mut queued) = {
        let mut live = registry();
        if live.attached.get(&id).is_some_and(|held| held != user) {
            live.detach(id);
        }
        live.attached.insert(id, user.to_string());
        live.users
            .entry(user.to_string())
            .or_default()
            .insert(id, ());
        let sender = live
            .all
            .get(&id)
            .and_then(Weak::upgrade)
            .map(|connection| connection.sender());
        let queued = match sender {
            Some(_) => live.pending.shift_remove(user).unwrap_or_default(),
            None => VecDeque::new(),
        };
        (sender, queued)
    };
    let Some(sender) = sender else {
        return;
    };
    while let Some(payload) = queued.pop_front() {
        if sender
            .send(Message::text(payload.to_string()))
            .await
            .is_err()
        {
            break;
        }
    }
    // What a failed send left waits again, before anything queued meanwhile.
    if !queued.is_empty() {
        let mut live = registry();
        let queue = live.pending.entry(user.to_string()).or_default();
        while let Some(payload) = queued.pop_back() {
            queue.push_front(payload);
        }
    }
}

/// `detachWsApiClient`: whether the connection was attached to an account.
pub fn detach(id: u64) -> bool {
    registry().detach(id)
}

/// `Boolean(wsApiClientsByUserId.get(user)?.size)`: `user` has a live connection.
pub fn present(user: &str) -> bool {
    registry()
        .users
        .get(user)
        .is_some_and(|set| !set.is_empty())
}

/// `wsSendJsonToUser`: to every live connection of `user`.
pub async fn tell(user: &str, payload: &JsonValue) -> Delivery {
    let targets = registry().senders(user, None);
    send_all(targets, payload).await
}

/// `wsSendJsonToUserExcept`: to every live connection of `user` but `except`.
pub async fn tell_except(user: &str, payload: &JsonValue, except: u64) -> Delivery {
    let targets = registry().senders(user, Some(except));
    send_all(targets, payload).await
}

/// `enqueuePendingConsoleMessage`: the frame waits, stamped `_queuedAt`; the queue's length.
pub fn enqueue(user: &str, payload: &JsonValue) -> usize {
    if user.is_empty() || payload.is_null() {
        return 0;
    }
    let mut stamped = payload.clone();
    if let Some(fields) = stamped.as_object_mut() {
        fields.insert("_queuedAt".into(), json!(atome_store::append::iso_now()));
    }
    let mut live = registry();
    let queue = live.pending.entry(user.to_string()).or_default();
    queue.push_back(stamped);
    while queue.len() > PENDING_QUEUE_MAX {
        queue.pop_front();
    }
    let length = queue.len();
    while live.pending.len() > PENDING_USERS_MAX {
        if live
            .pending
            .get_index(0)
            .is_some_and(|(oldest, _)| oldest == user)
        {
            break;
        }
        live.pending.shift_remove_index(0);
    }
    length
}

/// A frame for `user` delivered live, else queued: what it reached, and the queue's length then
/// (0 when delivered).
pub async fn deliver(user: &str, payload: &JsonValue) -> (Delivery, usize) {
    let delivery = tell(user, payload).await;
    let queued = if delivery.delivered {
        0
    } else {
        enqueue(user, payload)
    };
    (delivery, queued)
}

/// `wsBroadcastJson(wsApiConnections, …)`: to every open connection; how many took it.
pub async fn broadcast(payload: &JsonValue) -> usize {
    let targets: Vec<Sender<Message>> = connections()
        .iter()
        .map(|connection| connection.sender())
        .collect();
    let raw = payload.to_string();
    let mut sent = 0;
    for target in targets {
        if target.send(Message::text(raw.clone())).await.is_ok() {
            sent += 1;
        }
    }
    sent
}

/// A notice to one person, on its own connection to the notification stacks.
pub struct Notifier {
    pub stack: NotificationStack,
    pub push: Arc<Push>,
}

impl Notifier {
    /// `deliverNotification(target, sender, notification)`: stacked (its failure the caller's),
    /// told live or queued, then pushed to the person's devices (its outcome reaching nobody).
    pub async fn notify(
        &self,
        target: &str,
        sender: Option<&str>,
        notification: &JsonValue,
    ) -> Result<(), String> {
        let notice = self.stack.notice(target, sender, notification).await?;
        deliver(&notice.target, &notice.frame).await;
        if let Some(push) = notice.push {
            let _ = self
                .push
                .deliver(&notice.target, &push, &Audience::default())
                .await;
        }
        Ok(())
    }
}
