// The visio SFU (server/visio.js, visio_commands.js, visio_helpers.js, visio_ws_handler.js, ported
// on the mediasoup crate): one worker for the process, started with the server (worker.rs), the
// rooms, peers and calls it holds (state.rs), who may join and whom a call reaches (rights.rs),
// the calls (calls.rs, invites.rs), the signaling of a peer's transports, producers and consumers
// (signaling.rs, streams.rs, in Node's JSON shapes: shapes.rs) and what the worker tells on its own
// (events.rs). `/ws/api`'s `visio` frame reaches it through ws_api/message_ops.rs; a connection's
// close leaves its room. Like the live registry, the SFU is one per process.
mod calls;
mod events;
mod invites;
mod rights;
mod shapes;
mod signaling;
mod state;
mod streams;
mod worker;

pub use state::Caller;

use crate::settings::Settings;
use crate::social::Social;
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use serde_json::{Value as JsonValue, json};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tokio::sync::mpsc;

// The actions the SFU signals; every other is a room command.
const SIGNALING: [&str; 10] = [
    "joinRoom",
    "leaveRoom",
    "createTransport",
    "connectTransport",
    "produce",
    "consume",
    "pauseProducer",
    "resumeProducer",
    "closeProducer",
    "resumeConsumer",
];

pub struct Visio {
    sfu: worker::Sfu,
    // The planned rooms, the accounts and the contacts' verdicts.
    central: Central,
    // The notices, the live connections' pushes and the devices' pushes.
    social: Arc<Social>,
    // A callee's own profile (do not disturb).
    router: Arc<VaultRouter>,
    state: Mutex<state::State>,
    events: mpsc::UnboundedSender<events::Event>,
}

static VISIO: OnceLock<Visio> = OnceLock::new();

/// The SFU started once, before the server listens: a worker that cannot start is the server's
/// startup error.
pub async fn start(
    settings: &Settings,
    central: Central,
    social: Arc<Social>,
    router: Arc<VaultRouter>,
) -> Result<(), String> {
    let sfu = worker::start(settings).await?;
    let (events, followed) = mpsc::unbounded_channel();
    let visio = Visio {
        sfu,
        central,
        social,
        router,
        state: Mutex::default(),
        events,
    };
    VISIO
        .set(visio)
        .map_err(|_| "visio_already_started".to_string())?;
    let visio = VISIO.get().expect("visio started");
    tokio::spawn(visio.follow(followed));
    Ok(())
}

fn running() -> Result<&'static Visio, String> {
    VISIO.get().ok_or_else(|| "visio_not_started".into())
}

/// One `visio` frame (`handleCommand`): `action` with `input`, for the connection `caller`; the
/// answer's fields, a signal's with its `signal`.
pub async fn answer(
    caller: Caller,
    action: Option<&JsonValue>,
    input: Option<&JsonValue>,
) -> Result<JsonValue, String> {
    let visio = running()?;
    let action = action.and_then(JsonValue::as_str).unwrap_or_default();
    let mut input = match input {
        Some(input @ JsonValue::Object(_)) => input.clone(),
        _ => json!({}),
    };
    if SIGNALING.contains(&action) {
        return visio.signal(&caller, action, &input).await;
    }
    input["deviceKey"] = json!(caller.device_key);
    visio.command(&caller.user, action, &input).await
}

/// A `/ws/api` connection closed (`closeConnection`): it leaves its room.
pub async fn closed(live: u64) {
    let Ok(visio) = running() else {
        return;
    };
    let left = {
        let mut state = visio.state();
        let seat = state.seats.remove(&live).unwrap_or_default();
        match (seat.room_id, seat.peer_id) {
            (Some(room_id), Some(peer_id)) => state
                .close_peer(&room_id, &peer_id, seat.serial)
                .map(|closed| (room_id, closed)),
            _ => None,
        }
    };
    if let Some((room_id, (user, frames))) = left {
        state::send(frames).await;
        visio.peer_left(&room_id, &user).await;
    }
}

impl Visio {
    fn state(&self) -> MutexGuard<'_, state::State> {
        self.state.lock().expect("visio state")
    }
}
