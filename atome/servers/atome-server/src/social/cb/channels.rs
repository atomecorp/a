// The CB's channels (cahier §3.1 and §5, lot L3): a channel is (reach, cell, number 1–40), the reach and cell being the
// zone the listener set (zones.rs), never shown. A channel lives in memory while someone listens: who listens (each under
// a pseudonym of the channel and the person, `cbh_…`, a new one at each entry: handles.rs), its room (`cbr_…`: the visio
// room its voices go through, and the live translation's room, the same token), and its floor (floor.rs). No more than
// 55 listeners (`cb.channel_listeners`); the 56th is refused (`cb_channel_full`). Scan reads the channels in use of a zone
// (`channels-active`): their numbers, how many listen and whether one speaks, never who. A connection is in one channel at
// most; tuning another leaves the first. Everything here is forgotten with the channel: nothing is written.
use super::floor::{Floor, Holder};
use super::zones::Zone;
use crate::settings::Settings;
use std::collections::HashMap;
use std::sync::Mutex;

/// The channels of the CB: 1 to 40, the 19 by default (the client's).
pub const CHANNELS: u8 = 40;
pub const LISTENERS_SETTING: &str = "cb.channel_listeners";
const LISTENERS_ENV: &str = "CB_CHANNEL_LISTENERS";
pub const FLOOR_SETTING: &str = "cb.floor_max_ms";
const FLOOR_ENV: &str = "CB_FLOOR_MAX_MS";
const ROOM_PREFIX: &str = "cbr_";

/// The channel's limits (rule 19: 55 listeners, 45 s of floor), all configurable.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    pub listeners: usize,
    pub floor_ms: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            listeners: 55,
            floor_ms: 45_000,
        }
    }
}

impl Limits {
    /// Read as the other CB settings are: the setting, else its environment spelling, else the default.
    pub fn from_settings(settings: &Settings) -> Self {
        let read = |name: &str, env: &str| {
            settings
                .get(name)
                .or_else(|| settings.get(env))
                .and_then(|value| value.trim().parse::<u64>().ok())
                .filter(|value| *value > 0)
        };
        let defaults = Self::default();
        Self {
            listeners: read(LISTENERS_SETTING, LISTENERS_ENV)
                .map_or(defaults.listeners, |value| value as usize),
            floor_ms: read(FLOOR_SETTING, FLOOR_ENV).unwrap_or(defaults.floor_ms),
        }
    }
}

/// A channel's key: the zone's reach and cell, and its number.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Key {
    zone: String,
    pub number: u8,
}

impl Key {
    pub fn new(zone: &Zone, number: u8) -> Self {
        Self {
            zone: format!("{}:{}", zone.range().name(), zone.cell()),
            number,
        }
    }
}

/// The pseudonyms' context of an entry in the channel of `room` (handles.rs): its room's token, never its zone (the cell
/// is kept no longer than the presence, cahier §4), and the room a report holds the takes of (lot L4).
pub fn context_of(room: &str) -> String {
    format!("channel:{room}")
}

/// A new channel's room token.
pub fn new_room() -> String {
    room_token()
}

#[derive(Clone, Debug)]
pub struct Listener {
    pub principal: String,
    pub live: u64,
    pub handle: String,
}

struct Channel {
    room: String,
    listeners: Vec<Listener>,
    floor: Floor,
}

/// A channel entered: its room, and the one left on the way (if any).
#[derive(Debug)]
pub struct Entered {
    pub room: String,
    pub listeners: usize,
    pub speaking: Option<String>,
    pub left: Option<Left>,
}

/// A channel left: its room, who left (their pseudonym), the floor they held, and whether the channel ended.
#[derive(Debug)]
pub struct Left {
    pub room: String,
    pub number: u8,
    pub principal: String,
    pub handle: String,
    pub released: Option<Holder>,
    pub ended: bool,
}

/// A channel in use, as Scan reads it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Active {
    pub number: u8,
    pub listeners: usize,
    pub speaking: bool,
}

#[derive(Default)]
struct State {
    channels: HashMap<Key, Channel>,
    rooms: HashMap<String, Key>,
    lives: HashMap<u64, Key>,
}

impl State {
    fn leave(&mut self, live: u64) -> Option<Left> {
        let key = self.lives.remove(&live)?;
        let channel = self.channels.get_mut(&key)?;
        let at = channel
            .listeners
            .iter()
            .position(|listener| listener.live == live)?;
        let listener = channel.listeners.remove(at);
        let released = channel.floor.release(&listener.principal);
        let room = channel.room.clone();
        let ended = channel.listeners.is_empty();
        if ended {
            self.channels.remove(&key);
            self.rooms.remove(&room);
        }
        Some(Left {
            room,
            number: key.number,
            principal: listener.principal,
            handle: listener.handle,
            released,
            ended,
        })
    }
}

#[derive(Default)]
pub struct Channels {
    limits: Mutex<Limits>,
    state: Mutex<State>,
}

fn room_token() -> String {
    format!("{ROOM_PREFIX}{}", uuid::Uuid::new_v4().simple())
}

impl Channels {
    pub fn new() -> Self {
        Self::default()
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().expect("cb channels")
    }

    pub fn limits(&self) -> Limits {
        *self.limits.lock().expect("cb limits")
    }

    pub fn set_limits(&self, limits: Limits) {
        *self.limits.lock().expect("cb limits") = limits;
    }

    /// The room of `key` while someone listens there.
    pub fn room_of(&self, key: &Key) -> Option<String> {
        self.state()
            .channels
            .get(key)
            .map(|channel| channel.room.clone())
    }

    /// `principal` tunes `key` on connection `live` under `handle`: the channel they were in is left first, a full one
    /// refused (`cb_channel_full`) before anything changes. A channel made now takes `room` as its token.
    pub fn enter(
        &self,
        key: &Key,
        principal: &str,
        live: u64,
        handle: &str,
        now_ms: u64,
        room: &str,
    ) -> Result<Entered, &'static str> {
        let limit = self.limits().listeners;
        let mut state = self.state();
        if state.lives.get(&live) == Some(key)
            && let Some(channel) = state.channels.get(key)
        {
            // Already there: nothing changes (the caller asked `handle_in` first and kept its pseudonym).
            return Ok(Entered {
                room: channel.room.clone(),
                listeners: channel.listeners.len(),
                speaking: channel
                    .floor
                    .speaking(now_ms)
                    .map(|holder| holder.handle.clone()),
                left: None,
            });
        }
        if state
            .channels
            .get(key)
            .is_some_and(|channel| channel.listeners.len() >= limit)
        {
            return Err("cb_channel_full");
        }
        let left = state.leave(live);
        let channel = state
            .channels
            .entry(key.clone())
            .or_insert_with(|| Channel {
                room: room.to_string(),
                listeners: Vec::new(),
                floor: Floor::default(),
            });
        // One entry a person in a channel (another device of theirs leaves it).
        let others: Vec<u64> = channel
            .listeners
            .iter()
            .filter(|listener| listener.principal == principal)
            .map(|listener| listener.live)
            .collect();
        channel
            .listeners
            .retain(|listener| listener.principal != principal);
        channel.listeners.push(Listener {
            principal: principal.to_string(),
            live,
            handle: handle.to_string(),
        });
        let (room, listeners) = (channel.room.clone(), channel.listeners.len());
        let speaking = channel
            .floor
            .speaking(now_ms)
            .map(|holder| holder.handle.clone());
        for other in others {
            state.lives.remove(&other);
        }
        state.rooms.insert(room.clone(), key.clone());
        state.lives.insert(live, key.clone());
        Ok(Entered {
            room,
            listeners,
            speaking,
            left,
        })
    }

    /// Connection `live` leaves its channel (`leave`, a closed connection), its floor with it.
    pub fn leave(&self, live: u64) -> Option<Left> {
        self.state().leave(live)
    }

    /// The channels in use of `zone`, by number: how many listen, whether one speaks.
    pub fn active(&self, zone: &Zone, now_ms: u64) -> Vec<Active> {
        let probe = Key::new(zone, 0);
        let state = self.state();
        let mut found: Vec<Active> = state
            .channels
            .iter()
            .filter(|(key, _)| key.zone == probe.zone)
            .map(|(key, channel)| Active {
                number: key.number,
                listeners: channel.listeners.len(),
                speaking: channel.floor.speaking(now_ms).is_some(),
            })
            .collect();
        found.sort_by_key(|active| active.number);
        found
    }

    /// The pseudonym `principal` holds in the channel of `room`: the visio room's right of entry (visio/rights.rs).
    pub fn member(&self, room: &str, principal: &str) -> Option<String> {
        let state = self.state();
        let key = state.rooms.get(room)?;
        state
            .channels
            .get(key)?
            .listeners
            .iter()
            .find(|listener| listener.principal == principal)
            .map(|listener| listener.handle.clone())
    }

    /// The pseudonym connection `live` holds in `key`, if it is already there (tuning it again keeps it).
    pub fn handle_in(&self, live: u64, key: &Key) -> Option<String> {
        let state = self.state();
        if state.lives.get(&live) != Some(key) {
            return None;
        }
        state
            .channels
            .get(key)?
            .listeners
            .iter()
            .find(|listener| listener.live == live)
            .map(|listener| listener.handle.clone())
    }

    /// The channel connection `live` is in: its room and number.
    pub fn of(&self, live: u64) -> Option<(String, u8)> {
        let state = self.state();
        let key = state.lives.get(&live)?;
        Some((state.channels.get(key)?.room.clone(), key.number))
    }

    /// The connections listening in `room` (to tell them who speaks).
    pub fn lives(&self, room: &str) -> Vec<u64> {
        let state = self.state();
        state
            .rooms
            .get(room)
            .and_then(|key| state.channels.get(key))
            .map(|channel| channel.listeners.iter().map(|l| l.live).collect())
            .unwrap_or_default()
    }

    /// Who listens in `room` (accounts kept on the server: the visio's blocks, the live translation's members).
    pub fn listeners(&self, room: &str) -> Vec<Listener> {
        let state = self.state();
        state
            .rooms
            .get(room)
            .and_then(|key| state.channels.get(key))
            .map(|channel| channel.listeners.clone())
            .unwrap_or_default()
    }

    /// The floor asked on connection `live`: the turn, or the refusal (`cb_floor_busy`, `cb_channel_required`).
    pub fn take(&self, live: u64, now_ms: u64) -> Result<(String, Holder), &'static str> {
        let max = self.limits().floor_ms;
        let mut state = self.state();
        let key = state
            .lives
            .get(&live)
            .cloned()
            .ok_or("cb_channel_required")?;
        let channel = state.channels.get_mut(&key).ok_or("cb_channel_required")?;
        let listener = channel
            .listeners
            .iter()
            .find(|listener| listener.live == live)
            .cloned()
            .ok_or("cb_channel_required")?;
        let holder =
            channel
                .floor
                .take(&listener.principal, live, &listener.handle, now_ms, max)?;
        Ok((channel.room.clone(), holder))
    }

    /// The floor let go on connection `live`: the turn it ended, none if it held none.
    pub fn release(&self, live: u64) -> Option<(String, Holder)> {
        let mut state = self.state();
        let key = state.lives.get(&live).cloned()?;
        let channel = state.channels.get_mut(&key)?;
        let principal = channel
            .listeners
            .iter()
            .find(|listener| listener.live == live)?
            .principal
            .clone();
        let holder = channel.floor.release(&principal)?;
        Some((channel.room.clone(), holder))
    }

    /// The timer of `turn` in `room` rang: that turn ends if it still holds.
    pub fn expire(&self, room: &str, turn: u64) -> Option<Holder> {
        let mut state = self.state();
        let key = state.rooms.get(room).cloned()?;
        state.channels.get_mut(&key)?.floor.expire(turn)
    }

    /// Whether `principal` holds the floor of `room` now (the visio's producer rule).
    pub fn holds_floor(&self, room: &str, principal: &str, now_ms: u64) -> bool {
        let state = self.state();
        state
            .rooms
            .get(room)
            .and_then(|key| state.channels.get(key))
            .is_some_and(|channel| channel.floor.held_by(principal, now_ms))
    }

    /// Who speaks in `room` now: their pseudonym.
    pub fn speaking(&self, room: &str, now_ms: u64) -> Option<String> {
        let state = self.state();
        let key = state.rooms.get(room)?;
        state
            .channels
            .get(key)?
            .floor
            .speaking(now_ms)
            .map(|holder| holder.handle.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::social::cb::zones::Range;

    fn zone(cell: &str) -> Zone {
        Zone::parse(Range::Km5, cell).expect("zone")
    }

    // Test 21: the 56th listener of a channel is refused; one already in stays; the limit is configurable.
    #[test]
    fn a_channel_holds_55_listeners() {
        let channels = Channels::new();
        let key = Key::new(&zone("u09tv"), 19);
        for n in 0..55u64 {
            channels
                .enter(
                    &key,
                    &format!("p{n}"),
                    n,
                    &format!("cbh_{n}"),
                    0,
                    &new_room(),
                )
                .expect("in");
        }
        assert_eq!(
            channels
                .enter(&key, "p55", 55, "cbh_55", 0, &new_room())
                .err(),
            Some("cb_channel_full")
        );
        assert!(
            channels
                .enter(&key, "p3", 3, "cbh_3b", 0, &new_room())
                .is_ok(),
            "one already in tunes again"
        );
        channels.leave(0);
        assert!(
            channels
                .enter(&key, "p55", 55, "cbh_55", 0, &new_room())
                .is_ok()
        );
        let small = Channels::new();
        small.set_limits(Limits {
            listeners: 2,
            floor_ms: 45_000,
        });
        small
            .enter(&key, "a", 1, "cbh_a", 0, &new_room())
            .expect("a");
        small
            .enter(&key, "b", 2, "cbh_b", 0, &new_room())
            .expect("b");
        assert_eq!(
            small.enter(&key, "c", 3, "cbh_c", 0, &new_room()).err(),
            Some("cb_channel_full")
        );
    }

    // Scan's view: the channels in use of a zone only, with whether one speaks; tuning elsewhere leaves the first.
    #[test]
    fn scan_reads_the_zone_s_channels_in_use() {
        let channels = Channels::new();
        let paris = zone("u09tv");
        channels
            .enter(&Key::new(&paris, 19), "ana", 1, "cbh_a", 0, &new_room())
            .expect("19");
        channels
            .enter(&Key::new(&paris, 24), "bob", 2, "cbh_b", 0, &new_room())
            .expect("24");
        channels
            .enter(
                &Key::new(&zone("u09tw"), 9),
                "cyd",
                3,
                "cbh_c",
                0,
                &new_room(),
            )
            .expect("neighbour");
        channels.take(2, 0).expect("bob speaks");
        assert_eq!(
            channels.active(&paris, 1),
            vec![
                Active {
                    number: 19,
                    listeners: 1,
                    speaking: false
                },
                Active {
                    number: 24,
                    listeners: 1,
                    speaking: true
                }
            ]
        );
        let entered = channels
            .enter(&Key::new(&paris, 24), "ana", 1, "cbh_a2", 1, &new_room())
            .expect("ana tunes 24");
        let left = entered.left.expect("19 left");
        assert!(left.ended && left.number == 19);
        assert_eq!(entered.speaking.as_deref(), Some("cbh_b"));
        assert_eq!(channels.active(&paris, 1).len(), 1);
    }

    // Test 18 (the leaving): a speaker who leaves or disconnects gives the floor back; the room's members only.
    #[test]
    fn leaving_gives_the_floor_back() {
        let channels = Channels::new();
        let key = Key::new(&zone("u09tv"), 19);
        let room = channels
            .enter(&key, "ana", 1, "cbh_a", 0, &new_room())
            .expect("ana")
            .room;
        channels
            .enter(&key, "bob", 2, "cbh_b", 0, &new_room())
            .expect("bob");
        let (_, turn) = channels.take(1, 0).expect("ana speaks");
        assert_eq!(channels.take(2, 1).err(), Some("cb_floor_busy"));
        assert!(channels.holds_floor(&room, "ana", 1));
        assert_eq!(channels.member(&room, "bob").as_deref(), Some("cbh_b"));
        assert_eq!(channels.member(&room, "eve"), None);
        let left = channels.leave(1).expect("ana left");
        assert_eq!(left.released.map(|h| h.turn), Some(turn.turn));
        assert!(!left.ended);
        assert!(channels.take(2, 2).is_ok(), "free once she left");
        assert_eq!(channels.take(9, 2).err(), Some("cb_channel_required"));
    }

    #[test]
    fn limits_read_from_the_settings_or_by_default() {
        assert_eq!(
            Limits::default(),
            Limits {
                listeners: 55,
                floor_ms: 45_000
            }
        );
    }
}
