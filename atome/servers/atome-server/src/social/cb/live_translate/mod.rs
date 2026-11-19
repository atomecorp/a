// Live translation for the CB and the Appel (R-173 lot TR, validated by the user on 17 Nov. 2026; temp/cb_sociale_2026-11-15/
// CONCEPT_TRADUCTION_TEMPS_REEL.md). A listener who asked for it (`tr-subscribe`, one subscription per room, listener and
// language) receives what a speaker said in another language: transcribed, translated into the listener's language, and in
// the Voice mode read by the assistant's voice, pushed as `cb-tr-segment` frames on the listener's own `/ws/api`
// connection. Each piece of voice is transcribed once, translated once per target language whatever the number of
// listeners (`pipeline.rs`), and forgotten as soon as it is delivered: nothing is written, the original voice alone is
// recorded (lot L4). A speaker who refused every translation (`no_translate`) is never transcribed. The listener pays,
// with their own key or their seat on the platform's (`Backend::pay`, providers/live_translate.rs, through R-193's money
// guard): a refusal reads « Traduction épuisée » on their device. Frames carry pseudonyms only (`cbh_…`): no account, no
// name, no phone, no zone, no country, not even the room's token.
//
// The branch point (`join`, `segment`, `push_pcm`, `flush`): the CB's channels (L3), the recording (L4) and the Appel (L5)
// feed it; until they exist, a temporary server started with `ATOME_CB_TR_PROBE=1` lets a test connection feed it
// (`tr-probe`, actions.rs), refused otherwise.
mod actions;
mod pipeline;
pub mod segments;

use futures_util::future::BoxFuture;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub use pipeline::Outcome;

/// The frame pushed to a listener.
pub const FRAME: &str = "cb-tr-segment";
const ROOM_PREFIX: &str = "cbr_";
const SUBSCRIPTION_PREFIX: &str = "trs_";
const TAKE_PREFIX: &str = "trt_";

/// A CB channel (by turns) or an Appel (two people, in duplex).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RoomKind {
    Cb,
    Call,
}

/// What a listener receives: the subtitle alone, or the subtitle and the assistant's voice.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Text,
    Voice,
}

/// A piece of voice: mono 16-bit PCM at 24 kHz, or an encoded file (an Ogg Opus take of the recording, lot L4).
#[derive(Clone, Debug)]
pub enum Audio {
    Pcm(Vec<i16>),
    Encoded {
        mime: String,
        bytes: Vec<u8>,
        duration_ms: u64,
    },
}

impl Audio {
    pub fn duration_ms(&self) -> u64 {
        match self {
            Self::Pcm(pcm) => segments::duration_ms(pcm),
            Self::Encoded { duration_ms, .. } => *duration_ms,
        }
    }
}

/// Who pays one computation: a listener's own key, or their seat on the platform's (`shared`, with the money held).
pub struct Payment {
    pub principal: String,
    pub key: String,
    pub hold: Option<String>,
    pub shared: bool,
}

/// The provider side (providers/live_translate.rs; a counting stand-in in the tests). Every error is a code.
pub trait Backend: Send + Sync {
    /// The payment of `principal` for `action` (`translate`, `speech`), refused before any provider is asked.
    fn pay<'a>(
        &'a self,
        principal: &'a str,
        action: &'a str,
    ) -> BoxFuture<'a, Result<Payment, String>>;
    /// The words of `audio`, spoken in `lang`.
    fn transcribe<'a>(
        &'a self,
        payment: &'a Payment,
        audio: &'a Audio,
        lang: &'a str,
    ) -> BoxFuture<'a, Result<String, String>>;
    /// `text` in `target`, and the provider's usage.
    fn translate<'a>(
        &'a self,
        payment: &'a Payment,
        text: &'a str,
        target: &'a str,
    ) -> BoxFuture<'a, Result<(String, JsonValue), String>>;
    /// `text` read by the assistant's voice: 24 kHz mono 16-bit PCM.
    fn speak<'a>(
        &'a self,
        payment: &'a Payment,
        text: &'a str,
    ) -> BoxFuture<'a, Result<Vec<u8>, String>>;
    /// The real cost of an answer settled on its payment.
    fn settle<'a>(
        &'a self,
        payment: &'a Payment,
        usage: &'a JsonValue,
    ) -> BoxFuture<'a, Result<(), String>>;
    /// A payment nothing was bought with: what it held goes back (none by default).
    fn release<'a>(&'a self, _payment: &'a Payment) -> BoxFuture<'a, ()> {
        Box::pin(async {})
    }
    /// Whether `principal` may have a translation themselves (their own key, or a seat the money guard lets pay), nothing
    /// kept: a payment made, then given back (user decision Q1, 17 Nov. 2026: a computation paid once, served only to the
    /// listeners who are entitled to it).
    fn entitled<'a>(&'a self, principal: &'a str) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            let payment = self.pay(principal, "translate").await?;
            self.release(&payment).await;
            Ok(())
        })
    }
}

/// Where a frame goes: one `/ws/api` connection (social/live.rs; recorded in the tests).
pub trait Sink: Send + Sync {
    fn send(&self, live: u64, frame: JsonValue) -> BoxFuture<'static, bool>;
}

struct LiveSink;

impl Sink for LiveSink {
    fn send(&self, live: u64, frame: JsonValue) -> BoxFuture<'static, bool> {
        Box::pin(async move { crate::social::live::tell_connection(live, &frame).await })
    }
}

#[derive(Clone)]
struct Member {
    principal: String,
    live: u64,
    handle: String,
    lang: String,
    no_translate: bool,
}

struct Room {
    kind: RoomKind,
    members: Vec<Member>,
}

#[derive(Clone)]
struct Subscription {
    id: String,
    live: u64,
    principal: String,
    room: String,
    lang: String,
    mode: Mode,
}

#[derive(Default)]
struct State {
    rooms: HashMap<String, Room>,
    // In the order they were made: the first listener of a language is the first asked to pay.
    subscriptions: Vec<Subscription>,
    // (room, handle) -> the voice being gathered.
    streams: HashMap<(String, String), segments::Segmenter>,
    // Seconds of voice each listener's payments covered, since the server started (never written).
    metered_ms: HashMap<String, u64>,
}

pub struct LiveTranslate {
    state: Mutex<State>,
    backend: Mutex<Option<Arc<dyn Backend>>>,
    sink: Mutex<Arc<dyn Sink>>,
    probe: AtomicBool,
}

impl Default for LiveTranslate {
    fn default() -> Self {
        Self::new()
    }
}

fn token(prefix: &str) -> String {
    format!("{prefix}{}", uuid::Uuid::new_v4().simple())
}

impl LiveTranslate {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(State::default()),
            backend: Mutex::new(None),
            sink: Mutex::new(Arc::new(LiveSink)),
            probe: AtomicBool::new(false),
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().expect("live translation")
    }

    /// The provider side, set once the providers load (main.rs).
    pub fn attach(&self, backend: Arc<dyn Backend>) {
        *self.backend.lock().expect("live backend") = Some(backend);
    }

    /// Where frames go (the live connections unless a test records them).
    pub fn set_sink(&self, sink: Arc<dyn Sink>) {
        *self.sink.lock().expect("live sink") = sink;
    }

    /// The test door `tr-probe` (`ATOME_CB_TR_PROBE=1`, temporary servers only).
    pub fn enable_probe(&self, on: bool) {
        self.probe.store(on, Ordering::Relaxed);
    }

    pub fn probe_enabled(&self) -> bool {
        self.probe.load(Ordering::Relaxed)
    }

    fn backend(&self) -> Option<Arc<dyn Backend>> {
        self.backend.lock().expect("live backend").clone()
    }

    fn sink(&self) -> Arc<dyn Sink> {
        self.sink.lock().expect("live sink").clone()
    }

    /// A new room (a CB channel's entry, an Appel): its token, given to its members only, never with its zone.
    pub fn open_room(&self, kind: RoomKind) -> String {
        let room = token(ROOM_PREFIX);
        self.state().rooms.insert(
            room.clone(),
            Room {
                kind,
                members: Vec::new(),
            },
        );
        room
    }

    /// The room `room` (a CB channel's own token, lot L3), opened if it is not yet.
    pub fn ensure_room(&self, room: &str, kind: RoomKind) {
        self.state()
            .rooms
            .entry(room.to_string())
            .or_insert_with(|| Room {
                kind,
                members: Vec::new(),
            });
    }

    /// The room closed: its subscriptions and voices go with it.
    pub fn close_room(&self, room: &str) {
        let mut state = self.state();
        state.rooms.remove(room);
        state.subscriptions.retain(|sub| sub.room != room);
        state.streams.retain(|(r, _), _| r != room);
    }

    /// `principal` entered `room` on connection `live` under `handle`, speaking `lang`, refusing translation or not.
    pub fn join(
        &self,
        room: &str,
        principal: &str,
        live: u64,
        handle: &str,
        lang: &str,
        no_translate: bool,
    ) -> Result<(), &'static str> {
        let mut state = self.state();
        let Some(entry) = state.rooms.get_mut(room) else {
            return Err("cb_tr_room_unknown");
        };
        entry.members.retain(|member| member.principal != principal);
        entry.members.push(Member {
            principal: principal.to_string(),
            live,
            handle: handle.to_string(),
            lang: lang.to_string(),
            no_translate,
        });
        Ok(())
    }

    /// The pseudonym `principal` holds in `room`.
    pub fn handle_of(&self, room: &str, principal: &str) -> Option<String> {
        self.state()
            .rooms
            .get(room)?
            .members
            .iter()
            .find(|member| member.principal == principal)
            .map(|member| member.handle.clone())
    }

    /// `principal` left `room`: their subscriptions there end, their voice is dropped.
    pub fn leave(&self, room: &str, principal: &str) {
        let mut state = self.state();
        let mut handles = Vec::new();
        if let Some(entry) = state.rooms.get_mut(room) {
            entry.members.retain(|member| {
                let leaving = member.principal == principal;
                if leaving {
                    handles.push(member.handle.clone());
                }
                !leaving
            });
        }
        state
            .subscriptions
            .retain(|sub| !(sub.room == room && sub.principal == principal));
        state
            .streams
            .retain(|(r, h), _| !(r == room && handles.contains(h)));
    }

    /// A connection closed: everything it held ends, and no provider is asked for it again.
    pub fn closed(&self, live: u64) {
        let mut state = self.state();
        let mut gone = Vec::new();
        for (room, entry) in &mut state.rooms {
            entry.members.retain(|member| {
                if member.live == live {
                    gone.push((room.clone(), member.handle.clone()));
                }
                member.live != live
            });
        }
        state.subscriptions.retain(|sub| sub.live != live);
        state.streams.retain(|key, _| !gone.contains(key));
    }

    /// The seconds of voice `principal`'s payments covered (kept in memory only).
    pub fn metered_ms(&self, principal: &str) -> u64 {
        self.state().metered_ms.get(principal).copied().unwrap_or(0)
    }

    /// How many subscriptions are open (a test's view: none once everyone left).
    pub fn subscriptions(&self) -> usize {
        self.state().subscriptions.len()
    }

    /// A subscription of `principal` on connection `live` to `room` in `lang`: its id, or a refusal's code. The
    /// mode Aucune makes none (nothing is ever computed for it).
    pub fn subscribe(
        &self,
        principal: &str,
        live: u64,
        room: &str,
        lang: &str,
        mode: Option<Mode>,
    ) -> Result<Option<String>, &'static str> {
        if self.backend().is_none() {
            return Err("cb_tr_unavailable");
        }
        if lang.is_empty() {
            return Err("cb_tr_lang_invalid");
        }
        let mut state = self.state();
        let Some(entry) = state.rooms.get(room) else {
            return Err("cb_tr_room_unknown");
        };
        if !entry
            .members
            .iter()
            .any(|member| member.principal == principal)
        {
            return Err("cb_tr_not_member");
        }
        state
            .subscriptions
            .retain(|sub| !(sub.room == room && sub.principal == principal));
        let Some(mode) = mode else {
            return Ok(None);
        };
        let id = token(SUBSCRIPTION_PREFIX);
        state.subscriptions.push(Subscription {
            id: id.clone(),
            live,
            principal: principal.to_string(),
            room: room.to_string(),
            lang: lang.to_string(),
            mode,
        });
        Ok(Some(id))
    }

    /// The subscription `id` of `principal` ends: whether it was theirs.
    pub fn unsubscribe(&self, principal: &str, id: &str) -> bool {
        let mut state = self.state();
        let before = state.subscriptions.len();
        state
            .subscriptions
            .retain(|sub| !(sub.id == id && sub.principal == principal));
        state.subscriptions.len() != before
    }

    /// The branch point for a whole piece (a CB take at the release, an Ogg take of the recording): `handle`'s voice
    /// in `room`, translated for whoever asked.
    pub async fn segment(&self, room: &str, handle: &str, audio: Audio) -> Outcome {
        pipeline::process(self, room, handle, audio).await
    }

    /// The branch point for live voice (24 kHz mono PCM, as it arrives): an Appel's pieces are translated as soon as a
    /// silence closes them; a CB take waits for `flush`.
    pub async fn push_pcm(&self, room: &str, handle: &str, pcm: &[i16]) -> Vec<Outcome> {
        let pieces = {
            let mut state = self.state();
            let Some(kind) = state.rooms.get(room).map(|entry| entry.kind) else {
                return Vec::new();
            };
            state
                .streams
                .entry((room.to_string(), handle.to_string()))
                .or_insert_with(|| segments::Segmenter::new(kind))
                .push(pcm)
        };
        let mut out = Vec::new();
        for piece in pieces {
            out.push(self.segment(room, handle, Audio::Pcm(piece)).await);
        }
        out
    }

    /// `handle` stopped speaking (the floor released, the call ended): the last piece.
    pub async fn flush(&self, room: &str, handle: &str) -> Option<Outcome> {
        let piece = self
            .state()
            .streams
            .remove(&(room.to_string(), handle.to_string()))
            .and_then(|mut stream| stream.flush())?;
        Some(self.segment(room, handle, Audio::Pcm(piece)).await)
    }
}
