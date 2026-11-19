// The Appel aléatoire (R-173 lot L5; temp/cb_sociale_2026-11-15/CAHIER_DES_CHARGES.md §3.1, §5, §7 and §9, tests 31 to 36).
//
// Wired on 18 Nov. 2026 (cahier § L5): social/cb/mod.rs (`calls`, `handle`, `closed`, `block`), main.rs (`Limits`),
// visio/rights.rs (a call's room entered by its two members only) and visio/streams.rs (a duplex voice, recorded as
// `RoomKind::Call`). What remains is listed at the foot of this file.
//
// - Availability lives in memory, by connection, in the zone the connection set (`zone-set`, zones.rs): Dispo. (`on`, findable)
//   and Chercher (`search`, a match asked now). The server tries a match at each new availability (cahier §5): a searcher
//   meets anyone available in the very same zone, a person turning Dispo. on meets someone already searching; two people
//   merely findable wait for one of them to search.
// - Never someone blocked either way, nor someone hidden by three reports (`Cb::may_meet`), nor oneself, nor a pair already
//   put in touch in the last 21 days (`cb.call_pair_days`): the pair is remembered from its invitation on, so a refusal or an
//   invitation left unanswered also counts, and nobody can be invited again and again by the same person.
// - An invitation lasts 21 s (`cb.call_invite_ms`): both must accept; refused or unanswered it falls (`lapsed`) for both,
//   without any penalty: each one is available again as they were. The call opens only once both accepted (`open`).
// - A call is a room `cbr_…` (the visio's and the live translation's, `RoomKind::Call`), two pseudonyms `cbh_…` issued in
//   its context `call:cbr_…` (so a report holds the call's takes, mod.rs `report`). Fin (`call-end`), a block or a
//   disconnection closes it for both (`ended`, the other told, never why: a block stays unknown to the person blocked).
// - Frames (`cb-call`, on the person's own `/ws/api` connection): `state` (`invited`, `open`, `lapsed`, `ended`), `invite`
//   `cbi_…`, `room` `cbr_…` (given at `open` only), `handle` (one's own, at `open`), `peer` (the other's), `expires_ms`.
//   Never an account, a name, a phone, a zone, a cell or a country.
// - An invitation its connection did not take (the app closed, its socket gone) is pushed instead (`Notifier::notify`, as
//   a reply to a bottle is): « Quelqu'un est disponible pour un appel », nothing else: no pseudonym, name, zone nor country.
// - The live translation, in duplex (lot TR): each side joins the call's room in the language they speak, refusing every
//   translation or not (`call-respond {lang, no_translate}`), and asks for the other's voice (`tr-subscribe {room}`). Each
//   voice's takes are cut at the silence (recordings/tap.rs, live_translate/segments.rs `PacketCut`), each one an Ogg piece
//   handed whole to the translation (decision Q4), paid by its listener; the end of the call closes the room's
//   subscriptions (`call_closed_room`).
// Availabilities, invitations and calls are forgotten with the process. The pairs met alone are written, in the central
// table `cb_call_pairs` (central_schema/social_tables.rs), each one a keyed fingerprint only, never an account: HMAC-SHA256
// of its two accounts in order, its key derived from the recordings' (recordings/seal.rs `call_pairs_key`). Read back at
// the first match after a restart, purged past `cb.call_pair_days`. Without that key (a production server without one)
// the table is neither read nor written: the pairs stay in memory, under a key drawn for the process.
use super::channels::new_room;
use super::live_translate::{RoomKind, Sink};
use super::zones::Zone;
use super::{Cb, country};
use crate::social::news::db::{all, run, text};
use futures_util::future::BoxFuture;
use ring::hmac;
use ring::rand::SystemRandom;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// The frame telling a person about their invitation or their call.
pub const CALL_FRAME: &str = "cb-call";
pub const INVITE_SETTING: &str = "cb.call_invite_ms";
const INVITE_ENV: &str = "CB_CALL_INVITE_MS";
pub const PAIR_SETTING: &str = "cb.call_pair_days";
const PAIR_ENV: &str = "CB_CALL_PAIR_DAYS";
const INVITE_PREFIX: &str = "cbi_";
const ROOM_PREFIX: &str = "cbr_";
const DAY_MS: u64 = 86_400_000;
/// The notice of an invitation its connection did not take: who is calling is never said.
pub const INVITE_NOTICE_KIND: &str = "cb-call-invite";
pub const INVITE_NOTICE_SUBJECT: &str = "Quelqu'un est disponible pour un appel";

/// The Appel's limits (rule 19: 21 s, 21 days), both configurable.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    pub invite_ms: u64,
    pub pair_ms: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            invite_ms: 21_000,
            pair_ms: 21 * DAY_MS,
        }
    }
}

impl Limits {
    /// Read as the other CB settings are: the setting, else its environment spelling, else the default.
    pub fn from_settings(settings: &crate::settings::Settings) -> Self {
        let read = |name: &str, env: &str| {
            settings
                .get(name)
                .or_else(|| settings.get(env))
                .and_then(|value| value.trim().parse::<u64>().ok())
                .filter(|value| *value > 0)
        };
        let defaults = Self::default();
        Self {
            invite_ms: read(INVITE_SETTING, INVITE_ENV).unwrap_or(defaults.invite_ms),
            pair_ms: read(PAIR_SETTING, PAIR_ENV)
                .map_or(defaults.pair_ms, |days| days.saturating_mul(DAY_MS)),
        }
    }
}

/// A frame for one connection.
#[derive(Clone, Debug, PartialEq)]
pub struct Tell {
    pub live: u64,
    pub frame: JsonValue,
}

/// One side of an invitation or a call: who (never sent), on which connection, under which pseudonym.
#[derive(Clone, Debug)]
pub struct Seat {
    pub principal: String,
    pub live: u64,
    pub handle: String,
    pub accepted: bool,
    pub lang: String,
    pub no_translate: bool,
    // What they were before the invitation, given back if it falls.
    zone: Zone,
    searching: bool,
}

#[derive(Clone, Debug)]
pub struct Invitation {
    pub token: String,
    pub room: String,
    pub expires_ms: u64,
    pub seats: [Seat; 2],
}

#[derive(Clone, Debug)]
pub struct Call {
    pub room: String,
    pub since_ms: u64,
    pub seats: [Seat; 2],
}

impl Call {
    /// The seat of `principal`, and the other's.
    pub fn sides(&self, principal: &str) -> Option<(&Seat, &Seat)> {
        let [a, b] = &self.seats;
        if a.principal == principal {
            Some((a, b))
        } else if b.principal == principal {
            Some((b, a))
        } else {
            None
        }
    }
}

/// What an answer to an invitation did.
#[derive(Debug)]
pub enum Responded {
    /// Accepted, the other not yet.
    Waiting,
    /// Both accepted: the call (boxed: its two seats outweigh the other variants), and the frames telling both.
    Open(Box<Call>, Vec<Tell>),
    /// Refused or too late: the frames telling both it fell.
    Lapsed(Vec<Tell>),
}

#[derive(Clone, Debug)]
struct Available {
    principal: String,
    zone: Zone,
    searching: bool,
    since_ms: u64,
}

#[derive(Default)]
struct State {
    available: HashMap<u64, Available>,
    invitations: HashMap<String, Invitation>,
    calls: HashMap<String, Call>,
    // A connection's invitation token or call room while it has one.
    busy: HashMap<u64, String>,
    // The pairs put in touch, and when: each under its fingerprint (`PairKey`), never its accounts.
    met: HashMap<String, u64>,
}

// The key a pair's fingerprint is made with: the server's (`kept`, the pairs then written in `cb_call_pairs`), or one
// drawn for the process (the pairs in memory only).
struct PairKey {
    key: hmac::Key,
    kept: bool,
}

impl PairKey {
    fn drawn() -> Self {
        Self {
            key: hmac::Key::generate(hmac::HMAC_SHA256, &SystemRandom::new())
                .expect("a random HMAC key"),
            kept: false,
        }
    }

    // hex(HMAC-SHA256(key, "<smaller account>\n<greater account>")).
    fn fingerprint(&self, a: &str, b: &str) -> String {
        let (low, high) = if a <= b { (a, b) } else { (b, a) };
        hex::encode(hmac::sign(&self.key, format!("{low}\n{high}").as_bytes()).as_ref())
    }
}

fn token(prefix: &str) -> String {
    format!("{prefix}{}", uuid::Uuid::new_v4().simple())
}

fn well_formed(value: &str, prefix: &str) -> bool {
    value.strip_prefix(prefix).is_some_and(|random| {
        random.len() == 32
            && random
                .bytes()
                .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    })
}

fn frame(state: &str, fields: JsonValue) -> JsonValue {
    let mut frame = json!({ "type": CALL_FRAME, "state": state });
    if let (Some(frame), Some(fields)) = (frame.as_object_mut(), fields.as_object()) {
        frame.extend(fields.clone());
    }
    frame
}

fn open_tells(call: &Call, invite: &str) -> Vec<Tell> {
    let [a, b] = &call.seats;
    [(a, b), (b, a)]
        .into_iter()
        .map(|(me, other)| Tell {
            live: me.live,
            frame: frame(
                "open",
                json!({ "invite": invite, "room": call.room, "handle": me.handle, "peer": other.handle }),
            ),
        })
        .collect()
}

fn lapsed_tells(invitation: &Invitation) -> Vec<Tell> {
    invitation
        .seats
        .iter()
        .map(|seat| Tell {
            live: seat.live,
            frame: frame("lapsed", json!({ "invite": invitation.token })),
        })
        .collect()
}

// The person's own `/ws/api` connection.
struct LiveSink;

impl Sink for LiveSink {
    fn send(&self, live: u64, frame: JsonValue) -> BoxFuture<'static, bool> {
        Box::pin(async move { crate::social::live::tell_connection(live, &frame).await })
    }
}

/// The Appel's availabilities, invitations and calls, in memory.
pub struct RandomCalls {
    limits: Mutex<Limits>,
    state: Mutex<State>,
    sink: Mutex<Arc<dyn Sink>>,
    pair_key: Mutex<PairKey>,
    // Whether the pairs kept in `cb_call_pairs` were read back since the key was set.
    pairs_read: AtomicBool,
}

impl Default for RandomCalls {
    fn default() -> Self {
        Self::new()
    }
}

impl RandomCalls {
    pub fn new() -> Self {
        Self {
            limits: Mutex::new(Limits::default()),
            state: Mutex::new(State::default()),
            sink: Mutex::new(Arc::new(LiveSink)),
            pair_key: Mutex::new(PairKey::drawn()),
            pairs_read: AtomicBool::new(false),
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().expect("cb random calls")
    }

    /// The key of the pairs' fingerprints (main.rs, from recordings/seal.rs `call_pairs_key`): with one, the pairs are
    /// kept in `cb_call_pairs`; without, in memory only. The pairs in memory are forgotten (their fingerprints no longer
    /// match), the table read again at the next match.
    pub fn set_pair_key(&self, key: Option<[u8; 32]>) {
        *self.pair_key.lock().expect("cb call pair key") = match key {
            Some(key) => PairKey {
                key: hmac::Key::new(hmac::HMAC_SHA256, &key),
                kept: true,
            },
            None => PairKey::drawn(),
        };
        self.state().met.clear();
        self.pairs_read.store(false, Ordering::SeqCst);
    }

    /// Whether the pairs are kept in the central base (a key is set).
    pub fn keeps_pairs(&self) -> bool {
        self.pair_key.lock().expect("cb call pair key").kept
    }

    /// The fingerprint of the pair `a`, `b` (either order), the only form a pair is held or written in.
    pub fn fingerprint(&self, a: &str, b: &str) -> String {
        self.pair_key
            .lock()
            .expect("cb call pair key")
            .fingerprint(a, b)
    }

    /// The pairs read back from the central base (their fingerprints and when they were invited), merged with those in
    /// memory: the later instant holds.
    pub fn remember(&self, pairs: Vec<(String, u64)>) {
        let mut state = self.state();
        for (fingerprint, at) in pairs {
            let held = state.met.entry(fingerprint).or_insert(at);
            *held = (*held).max(at);
        }
    }

    /// Where the `cb-call` frames go (the live connections unless a test records them).
    pub fn set_sink(&self, sink: Arc<dyn Sink>) {
        *self.sink.lock().expect("cb call sink") = sink;
    }

    /// The frames sent, each to its connection: the connections that did not take theirs.
    pub async fn send(&self, tells: Vec<Tell>) -> Vec<u64> {
        let sink = self.sink.lock().expect("cb call sink").clone();
        let mut missed = Vec::new();
        for tell in tells {
            if !sink.send(tell.live, tell.frame).await {
                missed.push(tell.live);
            }
        }
        missed
    }

    pub fn limits(&self) -> Limits {
        *self.limits.lock().expect("cb call limits")
    }

    pub fn set_limits(&self, limits: Limits) {
        *self.limits.lock().expect("cb call limits") = limits;
    }

    /// Dispo. (`on`) and Chercher (`search`, which implies it) for `principal` on `live` in `zone`. Answers what holds now:
    /// `(available, searching)`; a connection with an invitation or a call keeps it and stays out of the pool.
    pub fn set_available(
        &self,
        live: u64,
        principal: &str,
        zone: &Zone,
        on: bool,
        search: bool,
        now_ms: u64,
    ) -> (bool, bool) {
        let mut state = self.state();
        if state.busy.contains_key(&live) {
            return (false, false);
        }
        if !(on || search) {
            state.available.remove(&live);
            return (false, false);
        }
        let since_ms = state
            .available
            .get(&live)
            .map_or(now_ms, |was| was.since_ms);
        state.available.insert(
            live,
            Available {
                principal: principal.to_string(),
                zone: zone.clone(),
                searching: search,
                since_ms,
            },
        );
        (true, search)
    }

    /// Whom `live` may be put in touch with now, the longest waiting first: in the very same zone, never oneself, never a
    /// pair met within the limit; a searcher meets anyone available, someone merely findable meets searchers only. The
    /// block and the reports are the caller's to check (`Cb::may_meet`, a read of the central base).
    pub fn candidates(&self, live: u64, now_ms: u64) -> Vec<(u64, String)> {
        let pair_ms = self.limits().pair_ms;
        let mut state = self.state();
        state
            .met
            .retain(|_, at| now_ms.saturating_sub(*at) < pair_ms);
        let Some(me) = state.available.get(&live).cloned() else {
            return Vec::new();
        };
        let mut found: Vec<(u64, &Available)> = state
            .available
            .iter()
            .filter(|(other, entry)| {
                **other != live
                    && entry.principal != me.principal
                    && entry.zone == me.zone
                    && (me.searching || entry.searching)
                    && !state
                        .met
                        .contains_key(&self.fingerprint(&me.principal, &entry.principal))
            })
            .map(|(other, entry)| (*other, entry))
            .collect();
        found.sort_by_key(|(other, entry)| (entry.since_ms, *other));
        found
            .into_iter()
            .map(|(other, entry)| (other, entry.principal.clone()))
            .collect()
    }

    /// The invitation between `a` and `b` (connections still available, atomically taken out of the pool), under the
    /// pseudonyms `handles` issued for `room`; the pair remembered from now. None if either is no longer available.
    pub fn invite(
        &self,
        a: u64,
        b: u64,
        room: &str,
        handles: [&str; 2],
        now_ms: u64,
    ) -> Option<(Invitation, Vec<Tell>)> {
        let invite_ms = self.limits().invite_ms;
        let mut state = self.state();
        if a == b || state.busy.contains_key(&a) || state.busy.contains_key(&b) {
            return None;
        }
        let (first, second) = (
            state.available.get(&a).cloned()?,
            state.available.get(&b).cloned()?,
        );
        if first.principal == second.principal || first.zone != second.zone {
            return None;
        }
        state.available.remove(&a);
        state.available.remove(&b);
        let seat = |live: u64, entry: Available, handle: &str| Seat {
            principal: entry.principal,
            live,
            handle: handle.to_string(),
            accepted: false,
            lang: String::new(),
            no_translate: false,
            zone: entry.zone,
            searching: entry.searching,
        };
        let invitation = Invitation {
            token: token(INVITE_PREFIX),
            room: room.to_string(),
            expires_ms: now_ms.saturating_add(invite_ms),
            seats: [seat(a, first, handles[0]), seat(b, second, handles[1])],
        };
        state.met.insert(
            self.fingerprint(
                &invitation.seats[0].principal,
                &invitation.seats[1].principal,
            ),
            now_ms,
        );
        for seat in &invitation.seats {
            state.busy.insert(seat.live, invitation.token.clone());
        }
        state
            .invitations
            .insert(invitation.token.clone(), invitation.clone());
        let [one, two] = &invitation.seats;
        let tells = [(one, two), (two, one)]
            .into_iter()
            .map(|(me, other)| Tell {
                live: me.live,
                frame: frame(
                    "invited",
                    json!({ "invite": invitation.token, "peer": other.handle, "expires_ms": invite_ms }),
                ),
            })
            .collect();
        Some((invitation, tells))
    }

    // The invitation `token` taken away; its seats given back to the pool as they were (no penalty).
    fn fall(state: &mut State, token: &str, now_ms: u64) -> Option<Invitation> {
        let invitation = state.invitations.remove(token)?;
        for seat in &invitation.seats {
            state.busy.remove(&seat.live);
            state.available.insert(
                seat.live,
                Available {
                    principal: seat.principal.clone(),
                    zone: seat.zone.clone(),
                    searching: seat.searching,
                    since_ms: now_ms,
                },
            );
        }
        Some(invitation)
    }

    /// `principal` on `live` answers the invitation `token`: accepted (with the language they speak and their refusal of
    /// translation), or refused. `cb_call_invite_unknown` for a token that is not theirs or no longer stands.
    pub fn respond(
        &self,
        live: u64,
        principal: &str,
        token: &str,
        accept: bool,
        lang: &str,
        no_translate: bool,
        now_ms: u64,
    ) -> Result<Responded, &'static str> {
        if !well_formed(token, INVITE_PREFIX) {
            return Err("cb_call_invite_invalid");
        }
        let mut state = self.state();
        let Some(invitation) = state.invitations.get_mut(token) else {
            return Err("cb_call_invite_unknown");
        };
        let Some(at) = invitation
            .seats
            .iter()
            .position(|seat| seat.principal == principal && seat.live == live)
        else {
            return Err("cb_call_invite_unknown");
        };
        if !accept || now_ms >= invitation.expires_ms {
            let fallen = Self::fall(&mut state, token, now_ms).expect("the invitation stands");
            return Ok(Responded::Lapsed(lapsed_tells(&fallen)));
        }
        let seat = &mut invitation.seats[at];
        seat.accepted = true;
        seat.lang = lang.to_string();
        seat.no_translate = no_translate;
        if !invitation.seats.iter().all(|seat| seat.accepted) {
            return Ok(Responded::Waiting);
        }
        let invitation = state
            .invitations
            .remove(token)
            .expect("the invitation stands");
        let call = Call {
            room: invitation.room.clone(),
            since_ms: now_ms,
            seats: invitation.seats.clone(),
        };
        for seat in &call.seats {
            state.busy.insert(seat.live, call.room.clone());
        }
        state.calls.insert(call.room.clone(), call.clone());
        let tells = open_tells(&call, &invitation.token);
        Ok(Responded::Open(Box::new(call), tells))
    }

    /// The invitation `token` at its end (its 21 s run out, nobody having refused): it falls for both, without penalty.
    pub fn expire(&self, token: &str, now_ms: u64) -> Vec<Tell> {
        let mut state = self.state();
        let due = state
            .invitations
            .get(token)
            .is_some_and(|invitation| now_ms >= invitation.expires_ms);
        if !due {
            return Vec::new();
        }
        Self::fall(&mut state, token, now_ms)
            .map(|fallen| lapsed_tells(&fallen))
            .unwrap_or_default()
    }

    fn close(state: &mut State, room: &str, by: &str) -> Option<(Call, Vec<Tell>)> {
        let call = state.calls.remove(room)?;
        let mut tells = Vec::new();
        for seat in &call.seats {
            state.busy.remove(&seat.live);
            if seat.principal != by {
                tells.push(Tell {
                    live: seat.live,
                    frame: frame("ended", json!({ "room": call.room })),
                });
            }
        }
        Some((call, tells))
    }

    /// Fin: `principal` on `live` closes the call `room`, for both (the other told `ended`).
    pub fn end(&self, live: u64, principal: &str, room: &str) -> Option<(Call, Vec<Tell>)> {
        if !well_formed(room, ROOM_PREFIX) {
            return None;
        }
        let mut state = self.state();
        let theirs = state.calls.get(room).is_some_and(|call| {
            call.seats
                .iter()
                .any(|seat| seat.principal == principal && seat.live == live)
        });
        if !theirs {
            return None;
        }
        Self::close(&mut state, room, principal)
    }

    /// `owner` blocked `blocked`: an invitation between them falls at once for both (each told `lapsed`, never why; the
    /// pair stays noted), a call between them closes (`blocked` told `ended`, never why). The frames, and the call closed.
    pub fn blocked(&self, owner: &str, blocked: &str, now_ms: u64) -> (Vec<Tell>, Option<Call>) {
        let mut state = self.state();
        let between = |seats: &[Seat; 2]| {
            let [a, b] = seats;
            (a.principal == owner && b.principal == blocked)
                || (a.principal == blocked && b.principal == owner)
        };
        let invited = state
            .invitations
            .values()
            .find(|invitation| between(&invitation.seats))
            .map(|invitation| invitation.token.clone());
        if let Some(token) = invited {
            let tells = Self::fall(&mut state, &token, now_ms)
                .map(|fallen| lapsed_tells(&fallen))
                .unwrap_or_default();
            return (tells, None);
        }
        let room = state
            .calls
            .values()
            .find(|call| between(&call.seats))
            .map(|call| call.room.clone());
        match room.and_then(|room| Self::close(&mut state, &room, owner)) {
            Some((call, tells)) => (tells, Some(call)),
            None => (Vec::new(), None),
        }
    }

    /// The connection `live` closed: out of the pool, its invitation fallen for the other, its call ended for the other.
    /// Answers the frames, and the call ended (its room to close) if there was one.
    pub fn closed(&self, live: u64, now_ms: u64) -> (Vec<Tell>, Option<Call>) {
        let mut state = self.state();
        state.available.remove(&live);
        let Some(held) = state.busy.get(&live).cloned() else {
            return (Vec::new(), None);
        };
        if let Some(fallen) = Self::fall(&mut state, &held, now_ms) {
            // The one who left is not back in the pool.
            state.available.remove(&live);
            let tells = lapsed_tells(&fallen)
                .into_iter()
                .filter(|tell| tell.live != live)
                .collect();
            return (tells, None);
        }
        let principal = state
            .calls
            .get(&held)
            .and_then(|call| call.seats.iter().find(|seat| seat.live == live))
            .map(|seat| seat.principal.clone())
            .unwrap_or_default();
        match Self::close(&mut state, &held, &principal) {
            Some((call, tells)) => (tells, Some(call)),
            None => (Vec::new(), None),
        }
    }

    /// The pseudonym `principal` holds in the call of `room` on the connection `live`, the one that accepted the
    /// invitation (the visio's entry, visio/rights.rs): none on any other connection of the same account.
    pub fn member_on(&self, room: &str, principal: &str, live: u64) -> Option<String> {
        self.state()
            .calls
            .get(room)
            .and_then(|call| call.sides(principal))
            .filter(|(me, _)| me.live == live)
            .map(|(me, _)| me.handle.clone())
    }

    /// The pseudonym `principal` holds in the call of `room` (the visio's entry, visio/rights.rs), none otherwise.
    pub fn member(&self, room: &str, principal: &str) -> Option<String> {
        self.state()
            .calls
            .get(room)
            .and_then(|call| call.sides(principal))
            .map(|(me, _)| me.handle.clone())
    }

    /// Whether `room` is an open Appel (visio/streams.rs: a duplex voice, no floor; recorded as `RoomKind::Call`).
    pub fn is_call(&self, room: &str) -> bool {
        self.state().calls.contains_key(room)
    }

    /// Whether `live` is available, searching, or busy: what the tests read.
    pub fn status(&self, live: u64) -> (bool, bool, bool) {
        let state = self.state();
        let available = state.available.get(&live);
        (
            available.is_some(),
            available.is_some_and(|entry| entry.searching),
            state.busy.contains_key(&live),
        )
    }

    /// The invitation `live` has now (what its `invited` frame carried: its token and the other's pseudonym), for the tests.
    pub fn invitation_of(&self, live: u64) -> Option<(String, String)> {
        let state = self.state();
        let token = state.busy.get(&live)?;
        let invitation = state.invitations.get(token)?;
        let other = invitation.seats.iter().find(|seat| seat.live != live)?;
        Some((invitation.token.clone(), other.handle.clone()))
    }
}

fn refused(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

fn now_ms() -> u64 {
    u64::try_from(atome_js_values::dates::now_ms()).unwrap_or_default()
}

// The call's visio room left by both peers (visio/mod.rs `cb_evict`: no entry outlives the call). Without the SFU (iOS,
// a build without `visio`) there is no room to leave.
#[cfg(all(unix, feature = "visio"))]
async fn evict(call: &Call) {
    for seat in &call.seats {
        crate::visio::cb_evict(&call.room, &seat.principal).await;
    }
}

#[cfg(not(all(unix, feature = "visio")))]
async fn evict(_call: &Call) {}

impl Cb {
    // The call's room closed everywhere: its live translation, its visio room (each peer evicted).
    async fn call_closed_room(&self, call: &Call) {
        self.live.close_room(&call.room);
        evict(call).await;
    }

    // The pairs met within the limit read back from `cb_call_pairs` once (those past it purged first); nothing without a
    // key.
    async fn read_call_pairs(&self) -> Result<(), String> {
        if !self.calls.keeps_pairs() || self.calls.pairs_read.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        let since = now_ms().saturating_sub(self.calls.limits().pair_ms) as i64;
        let rows = self
            .central
            .transaction(move |db| {
                run(db, "DELETE FROM cb_call_pairs WHERE met_ms < ?", &[&since])?;
                all(db, "SELECT pair_hash, met_ms FROM cb_call_pairs", &[])
            })
            .await;
        let rows = match rows {
            Ok(rows) => rows,
            Err(error) => {
                // Read again at the next match.
                self.calls.pairs_read.store(false, Ordering::SeqCst);
                return Err(error);
            }
        };
        self.calls.remember(
            rows.iter()
                .map(|row| {
                    let at = row.get("met_ms").and_then(JsonValue::as_i64).unwrap_or(0);
                    (text(row.get("pair_hash")), u64::try_from(at).unwrap_or(0))
                })
                .collect(),
        );
        Ok(())
    }

    // The pair of `invitation` written in `cb_call_pairs` (its fingerprint and the instant), the pairs past the limit
    // purged at the same time; nothing without a key. A failure leaves the pair in memory only, told in the log.
    async fn keep_call_pair(&self, invitation: &Invitation, at_ms: u64) {
        if !self.calls.keeps_pairs() {
            return;
        }
        let fingerprint = self.calls.fingerprint(
            &invitation.seats[0].principal,
            &invitation.seats[1].principal,
        );
        let since = at_ms.saturating_sub(self.calls.limits().pair_ms) as i64;
        let at = at_ms as i64;
        let kept = self
            .central
            .transaction(move |db| {
                run(
                    db,
                    "INSERT INTO cb_call_pairs (pair_hash, met_ms) VALUES (?, ?)
                     ON CONFLICT(pair_hash) DO UPDATE SET met_ms = excluded.met_ms",
                    &[&fingerprint, &at],
                )?;
                run(db, "DELETE FROM cb_call_pairs WHERE met_ms < ?", &[&since])
            })
            .await;
        if let Err(error) = kept {
            eprintln!("[cb] call pair not kept: {error}");
        }
    }

    /// The pairs past `cb.call_pair_days` erased from `cb_call_pairs`: how many (none touched without a key).
    pub async fn purge_call_pairs(&self) -> Result<usize, String> {
        if !self.calls.keeps_pairs() {
            return Ok(0);
        }
        let since = now_ms().saturating_sub(self.calls.limits().pair_ms) as i64;
        self.central
            .transaction(move |db| run(db, "DELETE FROM cb_call_pairs WHERE met_ms < ?", &[&since]))
            .await
    }

    // A match tried for `live` (a new availability): the first candidate `user` may meet, invited under two new
    // pseudonyms of the call's room; its end set at its 21 s.
    async fn try_match(&self, user: &str, live: u64) -> Result<(), String> {
        self.read_call_pairs().await?;
        for (other, principal) in self.calls.candidates(live, now_ms()) {
            if !self.may_meet(user, &principal).await? {
                continue;
            }
            let room = new_room();
            let context = format!("call:{room}");
            let mine = self.issue_handle(&context, user).await?;
            let theirs = self.issue_handle(&context, &principal).await?;
            let Some((invitation, tells)) =
                self.calls
                    .invite(live, other, &room, [&mine, &theirs], now_ms())
            else {
                continue;
            };
            self.keep_call_pair(&invitation, now_ms()).await;
            let missed = self.calls.send(tells).await;
            for seat in invitation
                .seats
                .iter()
                .filter(|seat| missed.contains(&seat.live))
            {
                self.push_invitation(&seat.principal).await;
            }
            let (calls, token, wait) = (
                self.calls.clone(),
                invitation.token.clone(),
                invitation.expires_ms.saturating_sub(now_ms()),
            );
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
                calls.send(calls.expire(&token, now_ms())).await;
            });
            return Ok(());
        }
        Ok(())
    }

    // An invitation `principal`'s connection did not take: a notice stacked and pushed to their devices, as a reply to a
    // bottle is; it says nobody's pseudonym, name, zone nor country, and carries nothing to answer with.
    async fn push_invitation(&self, principal: &str) {
        let notification =
            json!({ "kind": INVITE_NOTICE_KIND, "subject": INVITE_NOTICE_SUBJECT, "message": "" });
        if let Err(error) = self.notifier.notify(principal, None, &notification).await {
            eprintln!("[cb] call invitation notice not stacked {error}");
        }
    }

    /// A connection closed (social/cb `closed`): out of the pool, its invitation fallen, its call ended for the other
    /// (told, its rooms closed, on a task of its own; nothing spawned when the connection held nothing).
    pub(in crate::social::cb) fn call_connection_closed(&self, live: u64) {
        let (tells, call) = self.calls.closed(live, now_ms());
        if tells.is_empty() && call.is_none() {
            return;
        }
        let (calls, live_translate) = (self.calls.clone(), self.live.clone());
        tokio::spawn(async move {
            calls.send(tells).await;
            if let Some(call) = call {
                live_translate.close_room(&call.room);
                evict(&call).await;
            }
        });
    }

    /// `owner` blocked `blocked` (mod.rs `block`): an invitation between them falls, a call between them closes, for both.
    pub(in crate::social::cb) async fn call_blocked(&self, owner: &str, blocked: &str) {
        let (tells, call) = self.calls.blocked(owner, blocked, now_ms());
        self.calls.send(tells).await;
        if let Some(call) = call {
            self.call_closed_room(&call).await;
        }
    }

    /// `call-available`, `call-respond` and `call-end` for `user` on connection `live` (the notice and the age checked by
    /// `handle`). No answer holds an account, a name, a phone, a zone or a country.
    pub(in crate::social::cb) async fn call_action(
        &self,
        action: &str,
        message: &JsonValue,
        user: &str,
        live: u64,
    ) -> Result<JsonValue, String> {
        Ok(match action {
            "call-available" => {
                let Some(zone) = self.zone_of(live, user) else {
                    return Ok(refused("cb_zone_required"));
                };
                if self.hidden(user).await? {
                    return Ok(refused("cb_call_unavailable"));
                }
                let flag = |key: &str| message.get(key) == Some(&json!(true));
                let (available, searching) = self.calls.set_available(
                    live,
                    user,
                    &zone,
                    flag("on"),
                    flag("search"),
                    now_ms(),
                );
                if available {
                    self.try_match(user, live).await?;
                }
                json!({ "ok": true, "available": available, "searching": searching })
            }
            "call-respond" => {
                let token = message
                    .get("invite")
                    .and_then(JsonValue::as_str)
                    .unwrap_or_default();
                let accept = message.get("accept") == Some(&json!(true));
                let lang = country::language(message.get("lang"));
                let no_translate = message.get("no_translate") == Some(&json!(true));
                match self
                    .calls
                    .respond(live, user, token, accept, &lang, no_translate, now_ms())
                {
                    Err(code) => refused(code),
                    Ok(Responded::Waiting) => json!({ "ok": true, "state": "waiting" }),
                    Ok(Responded::Lapsed(tells)) => {
                        self.calls.send(tells).await;
                        json!({ "ok": true, "state": "lapsed" })
                    }
                    Ok(Responded::Open(call, tells)) => {
                        // The live translation's room is the call's, each side under its pseudonym, in the language they
                        // speak; a side refusing every translation is never transcribed (live_translate/pipeline.rs).
                        self.live.ensure_room(&call.room, RoomKind::Call);
                        for seat in &call.seats {
                            let _ = self.live.join(
                                &call.room,
                                &seat.principal,
                                seat.live,
                                &seat.handle,
                                &seat.lang,
                                seat.no_translate,
                            );
                        }
                        self.calls.send(tells).await;
                        let (me, other) = call.sides(user).expect("a side of the call");
                        json!({ "ok": true, "state": "open", "room": call.room, "handle": me.handle, "peer": other.handle })
                    }
                }
            }
            "call-end" => {
                let room = message
                    .get("room")
                    .and_then(JsonValue::as_str)
                    .unwrap_or_default();
                match self.calls.end(live, user, room) {
                    Some((call, tells)) => {
                        self.calls.send(tells).await;
                        self.call_closed_room(&call).await;
                        json!({ "ok": true, "ended": true })
                    }
                    None => json!({ "ok": true, "ended": false }),
                }
            }
            _ => refused("cb_action_unavailable"),
        })
    }
}

// Done on 19 Nov. 2026 (cahier § L5, items 4 and 5): the live translation in duplex, the takes cut at the silence (tap.rs,
// segments.rs `PacketCut`, `cb.call_silence_dbov` and `cb.call_silence_ms`), the push of an invitation (tests 81 to 85).
// The pairs met kept in `cb_call_pairs` under a keyed fingerprint through a restart, with their twin in
// database/adole_cb_social_schema.js (test 86).
