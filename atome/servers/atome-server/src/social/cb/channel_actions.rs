// The CB's `cb` frames (lot L3): `channels-active` (Scan: the channels in use of the zone, a presence without any sound),
// `tune` (a channel entered under a new pseudonym; its room's token given to its members only), `leave`, `floor-take` and
// `floor-release`. Who speaks is told to the channel's listeners as `cb-floor` frames on their own `/ws/api` connection:
// the channel's number, the speaker's pseudonym, `taken` or `free` and why (`released`, `left`, `expired`), never an
// account. The voices go through the visio room of the same token (visio/: pseudonyms in its frames, a microphone produced
// only with the floor, the entry by membership); the live translation (lot TR) has its room under that token too.
use super::channels::{CHANNELS, Channels, Key, Left, context_of, new_room};
use super::floor::Holder;
use super::live_translate::{LiveTranslate, RoomKind};
use super::{Cb, country, handles, moderation, relations};
use crate::vault_router::central::Central;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

/// The frame telling a channel's listeners who speaks.
pub const FLOOR_FRAME: &str = "cb-floor";
const PERSON_CASE: &str = "cb_person";

fn refused(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

fn now_ms() -> u64 {
    u64::try_from(atome_js_values::dates::now_ms()).unwrap_or_default()
}

// The listeners of `room` to tell about `speaker`: never one of them blocked by them, or who blocked them (they never
// hear each other: visio/streams.rs), never the speaker.
async fn audience(central: &Central, channels: &Channels, room: &str, speaker: &str) -> Vec<u64> {
    let listeners = channels.listeners(room);
    let (speaker, pairs) = (
        speaker.to_string(),
        listeners
            .iter()
            .map(|listener| (listener.principal.clone(), listener.live))
            .collect::<Vec<_>>(),
    );
    central
        .transaction(move |db| {
            let mut lives = Vec::new();
            for (principal, live) in pairs {
                if principal != speaker && !relations::blocked_either_way(db, &principal, &speaker)?
                {
                    lives.push(live);
                }
            }
            Ok(lives)
        })
        .await
        .unwrap_or_default()
}

async fn tell_floor(
    central: &Central,
    channels: &Channels,
    room: &str,
    number: u8,
    holder: &Holder,
    state: &str,
    reason: &str,
) {
    let mut frame =
        json!({ "type": FLOOR_FRAME, "channel": number, "state": state, "handle": holder.handle });
    if state == "taken" {
        frame["until_ms"] = json!(holder.until_ms.saturating_sub(holder.since_ms));
    } else {
        frame["reason"] = json!(reason);
    }
    for live in audience(central, channels, room, &holder.principal).await {
        crate::social::live::tell_connection(live, &frame).await;
    }
    // The speaker hears their own end too (the beep at 45 s), never their own start.
    if state == "free" {
        crate::social::live::tell_connection(holder.live, &frame).await;
    }
}

// What a channel's end needs, cloned out of the Cb so a closed connection and a timer can run it on their own task.
#[derive(Clone)]
pub(in crate::social::cb) struct Wire {
    central: Central,
    channels: Arc<Channels>,
    live: Arc<LiveTranslate>,
}

impl Wire {
    /// The floor ended (released, left, expired): the channel told, the speaker's microphone stopped by the SFU, their
    /// last piece handed to the live translation.
    async fn floor_ended(&self, room: &str, number: u8, holder: Holder, reason: &str) {
        tell_floor(
            &self.central,
            &self.channels,
            room,
            number,
            &holder,
            "free",
            reason,
        )
        .await;
        #[cfg(all(unix, feature = "visio"))]
        crate::visio::cb_floor_lost(room, &holder.principal).await;
        let (live, room, handle) = (self.live.clone(), room.to_string(), holder.handle);
        tokio::spawn(async move {
            live.flush(&room, &handle).await;
        });
    }

    /// A channel left (`leave`, another tuned, a connection closed): its floor given back, its translation and visio
    /// rooms left, the channel's rooms closed once nobody listens.
    async fn left(&self, left: Left) {
        if let Some(holder) = left.released {
            self.floor_ended(&left.room, left.number, holder, "left")
                .await;
        }
        self.live.leave(&left.room, &left.principal);
        if left.ended {
            self.live.close_room(&left.room);
        }
        #[cfg(all(unix, feature = "visio"))]
        crate::visio::cb_evict(&left.room, &left.principal).await;
    }

    // The turn's end at its 45 s, unless it ended before (a newer turn is never touched).
    fn expire_later(&self, room: &str, number: u8, holder: &Holder) {
        let (wire, room, turn) = (self.clone(), room.to_string(), holder.turn);
        let wait = holder.until_ms.saturating_sub(holder.since_ms);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
            if let Some(holder) = wire.channels.expire(&room, turn) {
                wire.floor_ended(&room, number, holder, "expired").await;
            }
        });
    }
}

impl Cb {
    /// The CB's limits (`cb.channel_listeners`, `cb.floor_max_ms`), read by main.rs from the settings.
    pub fn set_channel_limits(&self, limits: super::channels::Limits) {
        self.channels.set_limits(limits);
    }

    fn wire(&self) -> Wire {
        Wire {
            central: self.central.clone(),
            channels: self.channels.clone(),
            live: self.live.clone(),
        }
    }

    // `principal` hidden by three distinct reports joins no channel, nor the Appel (random_call.rs).
    pub(in crate::social::cb) async fn hidden(&self, principal: &str) -> Result<bool, String> {
        let principal = principal.to_string();
        self.central
            .transaction(move |db| moderation::hidden_case(db, PERSON_CASE, &principal))
            .await
    }

    /// A connection closed (social/cb `closed`): its channel is left and its floor given back, told on a task of its own.
    pub(in crate::social::cb) fn channel_closed(&self, live: u64) {
        if let Some(left) = self.channels.leave(live) {
            let wire = self.wire();
            tokio::spawn(async move { wire.left(left).await });
        }
    }

    pub(in crate::social::cb) async fn channel_action(
        &self,
        action: &str,
        message: &JsonValue,
        user: &str,
        live: u64,
    ) -> Result<JsonValue, String> {
        Ok(match action {
            "channels-active" => {
                let Some(zone) = self.zone_of(live, user) else {
                    return Ok(refused("cb_zone_required"));
                };
                let channels: Vec<JsonValue> = self
                    .channels
                    .active(&zone, now_ms())
                    .into_iter()
                    .map(|active| json!({ "channel": active.number, "listeners": active.listeners, "speaking": active.speaking }))
                    .collect();
                json!({ "ok": true, "channels": channels })
            }
            "tune" => self.tune(message, user, live).await?,
            "leave" => match self.channels.leave(live) {
                Some(left) => {
                    self.wire().left(left).await;
                    json!({ "ok": true, "left": true })
                }
                None => json!({ "ok": true, "left": false }),
            },
            "floor-take" => {
                let at = now_ms();
                match self.channels.take(live, at) {
                    Ok((room, holder)) => {
                        let number = self.channels.of(live).map_or(0, |(_, number)| number);
                        // A new turn (not the one already held): the channel told, its end set.
                        if holder.since_ms == at {
                            tell_floor(
                                &self.central,
                                &self.channels,
                                &room,
                                number,
                                &holder,
                                "taken",
                                "",
                            )
                            .await;
                            self.wire().expire_later(&room, number, &holder);
                        }
                        json!({ "ok": true, "channel": number, "handle": holder.handle,
                        "until_ms": holder.until_ms.saturating_sub(at) })
                    }
                    Err(code) => refused(code),
                }
            }
            "floor-release" => match self.channels.release(live) {
                Some((room, holder)) => {
                    let number = self.channels.of(live).map_or(0, |(_, number)| number);
                    self.wire()
                        .floor_ended(&room, number, holder, "released")
                        .await;
                    json!({ "ok": true, "released": true })
                }
                None => json!({ "ok": true, "released": false }),
            },
            _ => refused("cb_action_unavailable"),
        })
    }

    // `tune`: channel `channel` (1–40) of the zone set, under a new pseudonym (the same while one stays in it).
    async fn tune(&self, message: &JsonValue, user: &str, live: u64) -> Result<JsonValue, String> {
        let number = message
            .get("channel")
            .and_then(JsonValue::as_u64)
            .filter(|n| (1..=u64::from(CHANNELS)).contains(n));
        let Some(number) = number.and_then(|n| u8::try_from(n).ok()) else {
            return Ok(refused("cb_channel_invalid"));
        };
        let Some(zone) = self.zone_of(live, user) else {
            return Ok(refused("cb_zone_required"));
        };
        if self.hidden(user).await? {
            return Ok(refused("cb_channel_unavailable"));
        }
        let key = Key::new(&zone, number);
        // The pseudonym's context is the channel's room (its token, never its zone): a channel made now takes this one.
        let room = self.channels.room_of(&key).unwrap_or_else(new_room);
        let (handle, issued) = match self.channels.handle_in(live, &key) {
            Some(handle) => (handle, false),
            None => (self.issue_handle(&context_of(&room), user).await?, true),
        };
        let entered = match self
            .channels
            .enter(&key, user, live, &handle, now_ms(), &room)
        {
            Ok(entered) => entered,
            Err(code) => return Ok(refused(code)),
        };
        // Another made the channel in between: the pseudonym follows the room it was really given in.
        if issued && entered.room != room {
            let (handle, context) = (handle.clone(), context_of(&entered.room));
            self.central
                .transaction(move |db| handles::move_context(db, &handle, &context))
                .await?;
        }
        if let Some(left) = entered.left {
            self.wire().left(left).await;
        }
        // The live translation's room is the channel's: its member under the same pseudonym, in the language they speak.
        self.live.ensure_room(&entered.room, RoomKind::Cb);
        let lang = country::language(message.get("lang"));
        let no_translate = message.get("no_translate") == Some(&json!(true));
        let _ = self
            .live
            .join(&entered.room, user, live, &handle, &lang, no_translate);
        Ok(
            json!({ "ok": true, "channel": number, "handle": handle, "room": entered.room,
            "listeners": entered.listeners, "speaking": entered.speaking }),
        )
    }
}
