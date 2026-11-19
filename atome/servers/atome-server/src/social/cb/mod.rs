// The CB sociale (temp/cb_sociale_2026-11-15/CAHIER_DES_CHARGES.md): CB, Appel and Bouteille, three
// ways to meet people one does not know, by zone (zones.rs) and pseudonym (handles.rs), never by
// account, name, phone, cell or distance. This is the `/ws/api` family `cb` (routed as
// `public-events`, ws_api/projection_ops.rs): every action asks an account, an adult on the
// person's own card (`Profile::adult`, the birth date read by directory/meeting.rs `allowed`), and
// for the CB and Appel ones the recording notice accepted in its current version; that acceptance
// is an Atome of the person's vault (`cb_notice_consent:<id>`, a `record` as the other agreements
// are, body_data_consent and sensor_recording_consent), written through the one commit pipeline.
// A report goes to eVe's moderation queue (moderation.rs: three distinct ones hide the person from
// the three modes, or the bottle); a block is the contacts' own (relations.rs), silent for the
// person blocked and good for the three modes and Rencontre. A presence zone lives in memory for
// its connection only, never with a country (lot L2c: the country a device computed travels in a
// catch only, compared then forgotten, bottles/actions.rs `catch_bottle`). The bottles (lot L2)
// are bottles.rs. The CB's channels and their floor (lot L3) are channels.rs, floor.rs and channel_actions.rs. Their voices
// are recorded take by take, a report holding the last 13 minutes of the channel, an admin alone listening (lot L4,
// recordings/). The Appel aléatoire (lot L5) is random_call.rs: two people of the same zone invited for 21 s, a call in
// duplex under two pseudonyms of its room, closed for both by Fin, a block or a disconnection.
pub mod bottles;
mod channel_actions;
pub mod channels;
pub mod country;
pub mod floor;
pub mod handles;
pub mod live_translate;
pub mod random_call;
pub mod recordings;
pub mod zones;

use super::directory::Directory;
use super::live::Notifier;
use super::moderation;
use super::news::db::{get, text};
use super::rate::Rate;
use super::relations;
use crate::media::Storage;
use crate::vault_router::central::Central;
use crate::vault_router::{VaultRouter, js};
use crate::ws_sync::SyncRuntime;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use zones::{Range, Zone};

/// The recording notice's version: a new text asks everyone again (2: the line on automatic translation, lot L2b; 3: the
/// voice translated live for whoever hears it, lot TR, validated on 17 Nov. 2026).
pub const NOTICE_VERSION: i64 = 3;
const NOTICE_KEY: &str = "cb_notice_consent";
const SOURCE: &str = "cb_social";
const PERSON_CASE: &str = "cb_person";
const BOTTLE_CASE: &str = "bottle";
const BOTTLE_CONTEXT: &str = "bottle:";
// The family's actions (cahier §3.1, with the bottle's sea, options and withdrawal of lot L2, and the live translation
// of lot TR), the channels and their floor (lot L3), the calls (lot L5).
const ACTIONS: [&str; 26] = [
    "zone-set",
    "notice-get",
    "notice-accept",
    "report",
    "block",
    "channels-active",
    "tune",
    "leave",
    "floor-take",
    "floor-release",
    "call-available",
    "call-respond",
    "call-end",
    "bottle-launch",
    "bottle-catch",
    "bottle-open",
    "bottle-decide",
    "bottle-reply",
    "bottle-thread",
    "bottles-mine",
    "bottle-sea",
    "bottle-options",
    "bottle-withdraw",
    "tr-subscribe",
    "tr-unsubscribe",
    "tr-probe",
];
// Entering a channel or a call: recorded, so never without the notice accepted (cahier §7.1); hearing it translated
// (lot TR) as well. The Appel's availability and answer; Fin (`call-end`) never asks it (user, 19 Nov. 2026): a call
// always ends, even once the notice changed its version.
const RECORDED: [&str; 7] = [
    "channels-active",
    "tune",
    "floor-take",
    "floor-release",
    "call-available",
    "call-respond",
    "tr-subscribe",
];
// Entering Bouteille asks the same notice (lot L2c, user 16 Nov. 2026: what one reads there may be translated by a
// third party): the sea, a launch, a catch, opening, replying and reading a thread. One's own bottles, taking one back,
// a decision, a report and a block stay open without it (cahier §3.1).
const NOTICED: [&str; 6] = [
    "bottle-sea",
    "bottle-launch",
    "bottle-catch",
    "bottle-open",
    "bottle-reply",
    "bottle-thread",
];

fn refused(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

/// The notice's Atome in `principal`'s vault.
pub fn notice_id(principal: &str) -> String {
    format!(
        "{NOTICE_KEY}:{}",
        crate::http::uri::encode_uri_component(principal)
    )
}

struct Presence {
    principal: String,
    zone: Zone,
}

pub struct Cb {
    central: Central,
    router: Arc<VaultRouter>,
    sync: Arc<SyncRuntime>,
    // The senders' files a bottle's media is read from; the clean copies' own folder.
    storage: Arc<Storage>,
    media_dir: PathBuf,
    // A reply told to the bottle's sender, without a name.
    notifier: Notifier,
    // The `cb.bottle_video` switch, `off` until the settings say otherwise.
    video: Mutex<bottles::BottleVideo>,
    // The copies' links, each valid for a reservation's time.
    grants: Mutex<HashMap<String, bottles::Grant>>,
    // Each connection's zone, while it stays open.
    presence: Mutex<HashMap<u64, Presence>>,
    frames: Rate,
    reports: Rate,
    blocks: Rate,
    replies: Rate,
    /// The live translation of the CB and the Appel (lot TR): its rooms, subscriptions and branch point.
    pub live: Arc<live_translate::LiveTranslate>,
    /// The CB's channels, their listeners and their floor (lot L3), read by the visio's `cb` rooms.
    pub channels: Arc<channels::Channels>,
    /// The takes of the channels' voices (lot L4): written by the visio's recording consumers, purged daily.
    pub recordings: Arc<recordings::Recordings>,
    /// The Appel's availabilities, invitations and calls (lot L5), read by the visio's `cb` rooms.
    pub calls: Arc<random_call::RandomCalls>,
}

impl Cb {
    pub fn new(
        central: Central,
        router: Arc<VaultRouter>,
        sync: Arc<SyncRuntime>,
        storage: Arc<Storage>,
        notifier: Notifier,
    ) -> Self {
        let live = Arc::new(live_translate::LiveTranslate::new());
        let recordings = Arc::new(recordings::Recordings::new(
            central.clone(),
            recordings::dir_of(&storage.uploads_tmp),
            live.clone(),
        ));
        Self {
            central,
            router,
            sync,
            media_dir: bottles::media_dir_of(&storage.uploads_tmp),
            storage,
            notifier,
            video: Mutex::new(bottles::BottleVideo::Off),
            grants: Mutex::new(HashMap::new()),
            presence: Mutex::new(HashMap::new()),
            frames: Rate::new(34, 10_000),
            reports: Rate::new(13, 3_600_000),
            blocks: Rate::new(21, 3_600_000),
            // As the direct messages: 30 every 10 s.
            replies: Rate::new(30, 10_000),
            live,
            channels: Arc::new(channels::Channels::new()),
            recordings,
            calls: Arc::new(random_call::RandomCalls::new()),
        }
    }

    async fn adult(directory: &Directory, principal: &str) -> bool {
        matches!(directory.source_profile(principal).await, Ok(Some(profile)) if profile.adult)
    }

    /// Whether `principal` accepted the notice in its current version.
    pub async fn notice_accepted(&self, principal: &str) -> bool {
        let state = self
            .router
            .get_state(principal, &json!(notice_id(principal)))
            .await
            .unwrap_or(JsonValue::Null);
        let properties = &state["properties"];
        let consent = match properties.get(NOTICE_KEY) {
            Some(JsonValue::String(raw)) => serde_json::from_str(raw).unwrap_or(JsonValue::Null),
            Some(consent) => consent.clone(),
            None => JsonValue::Null,
        };
        properties.get("__deleted") != Some(&json!(true))
            && consent["version"] == json!(NOTICE_VERSION)
            && consent["granted"] == json!(true)
    }

    // The acceptance written in the person's vault, its event told to their devices.
    async fn accept_notice(&self, principal: &str, version: Option<&JsonValue>) -> JsonValue {
        if version.and_then(JsonValue::as_i64) != Some(NOTICE_VERSION) {
            return refused("cb_notice_version_invalid");
        }
        let at = js::iso(atome_js_values::dates::now_ms());
        let event = json!({ "kind": "set", "atome_id": notice_id(principal),
            "payload": { "scope": "global", "props": { "type": "record", "source_domain": SOURCE,
                NOTICE_KEY: { "version": NOTICE_VERSION, "granted": true, "date": at }, "updated_iso": at } },
            "actor": { "type": "user", "id": principal } });
        let written = async {
            let entry = self
                .router
                .commit(principal, &event, &json!({ "source": SOURCE }))
                .await?;
            if entry["inserted"] == json!(true) {
                self.sync.publish(&entry["event"]).await?;
            }
            Ok::<_, String>(())
        };
        match written.await {
            Ok(()) => json!({ "ok": true, "version": NOTICE_VERSION, "accepted": true }),
            Err(error) => {
                eprintln!("[cb] notice not written {error}");
                refused("cb_notice_write_failed")
            }
        }
    }

    // `zone-set`: the reach chosen and its cell, computed on the device; never a coordinate.
    fn zone_set(&self, message: &JsonValue, principal: &str, live: u64) -> JsonValue {
        if zones::carries_coordinates(message) {
            return refused("cb_zone_coordinates_refused");
        }
        let Some(range) = Range::parse(message.get("range")) else {
            return refused("cb_zone_range_invalid");
        };
        let cell = message
            .get("zone")
            .and_then(JsonValue::as_str)
            .unwrap_or_default();
        // A zone never carries a country (lot L2c): it is sent with a catch only, and never kept.
        if message.get("country").is_some() || message.get("share_country").is_some() {
            return refused("cb_zone_country_refused");
        }
        match Zone::parse(range, cell) {
            Ok(zone) => {
                self.presence.lock().expect("cb presence").insert(
                    live,
                    Presence {
                        principal: principal.to_string(),
                        zone,
                    },
                );
                json!({ "ok": true, "range": range.name() })
            }
            Err(error) => refused(error),
        }
    }

    /// The zone `principal` set on connection `live`, none once it closed.
    pub fn zone_of(&self, live: u64, principal: &str) -> Option<Zone> {
        let presence = self.presence.lock().expect("cb presence");
        presence
            .get(&live)
            .filter(|presence| presence.principal == principal)
            .map(|presence| presence.zone.clone())
    }

    /// A connection closed: its zone is forgotten, its live translations end, its channel is left and its floor given back,
    /// its availability withdrawn, its invitation fallen and its call ended for the other (told after this returns).
    pub fn closed(&self, live: u64) {
        self.presence.lock().expect("cb presence").remove(&live);
        self.live.closed(live);
        self.channel_closed(live);
        self.call_connection_closed(live);
    }

    /// A new pseudonym for `principal` in `context` (a channel entry, a call, a bottle).
    pub async fn issue_handle(&self, context: &str, principal: &str) -> Result<String, String> {
        let (context, principal) = (context.to_string(), principal.to_string());
        self.central
            .transaction(move |db| handles::issue(db, &context, &principal))
            .await
    }

    /// Whether `a` and `b` may meet in any mode: neither blocked the other, neither is hidden.
    pub async fn may_meet(&self, a: &str, b: &str) -> Result<bool, String> {
        let (a, b) = (a.to_string(), b.to_string());
        self.central
            .transaction(move |db| {
                Ok(!relations::blocked_either_way(db, &a, &b)?
                    && !moderation::hidden_case(db, PERSON_CASE, &a)?
                    && !moderation::hidden_case(db, PERSON_CASE, &b)?)
            })
            .await
    }

    // `report`: the person (or the bottle) behind a handle, once per reporter; never themselves. A person reported has the
    // takes of the channel concerned held for the case (lot L4): those of the room the handle was given in and of the
    // room the reporter listens to, over the last 13 minutes.
    async fn report(
        &self,
        message: &JsonValue,
        reporter: &str,
        live: u64,
    ) -> Result<JsonValue, String> {
        let kind = match text(message.get("kind")).as_str() {
            "" | PERSON_CASE => PERSON_CASE,
            BOTTLE_CASE => BOTTLE_CASE,
            _ => return Ok(refused("cb_report_kind_invalid")),
        };
        if !self.reports.allowed(reporter) {
            return Ok(refused("cb_rate_limited"));
        }
        let handle = text(message.get("handle"));
        let reason = moderation::reason(&js::slice(&text(message.get("reason")), 40));
        let me = reporter.to_string();
        let recorded = self
            .central
            .transaction(move |db| {
                let Some(found) = handles::resolve(db, &handle)? else {
                    return Ok(None);
                };
                if found.principal == me {
                    return Ok(None);
                }
                let (reports, target) = if kind == BOTTLE_CASE {
                    match found.context.strip_prefix(BOTTLE_CONTEXT) {
                        Some(bottle) if !bottle.is_empty() => ("cb_bottle_reports", bottle),
                        _ => return Ok(None),
                    }
                } else {
                    ("cb_person_reports", found.principal.as_str())
                };
                if moderation::record(db, reports, kind, target, &me, reason)?
                    && kind == BOTTLE_CASE
                {
                    // Hidden: it leaves the sea at once (its copies erased by the next purge).
                    super::news::db::run(
                        db,
                        "UPDATE cb_bottles SET state = 'hidden' WHERE bottle_id = ?",
                        &[&target],
                    )?;
                }
                let case = get(
                    db,
                    "SELECT case_id FROM moderation_cases WHERE kind = ? AND target_id = ?",
                    &[&kind, &target],
                )?
                .map(|row| text(row.get("case_id")))
                .unwrap_or_default();
                Ok(Some((case, found.context)))
            })
            .await?;
        if let Some((case, context)) = recorded.as_ref().filter(|_| kind == PERSON_CASE) {
            let mut rooms: Vec<String> = context
                .split(':')
                .nth(1)
                .filter(|room| room.starts_with("cbr_"))
                .map(str::to_string)
                .into_iter()
                .collect();
            if let Some((room, _)) = self.channels.of(live)
                && !rooms.contains(&room)
            {
                rooms.push(room);
            }
            let now = u64::try_from(atome_js_values::dates::now_ms()).unwrap_or_default();
            // Each frozen channel's number, kept for the moderator's case file once the channel is no longer in use.
            let reporter = self.channels.of(live);
            let channels: Vec<(String, u8)> = rooms
                .iter()
                .filter_map(|room| {
                    let number = self.channel_of(room).or_else(|| {
                        reporter
                            .as_ref()
                            .filter(|(of, _)| of == room)
                            .map(|(_, number)| *number)
                    })?;
                    Some((room.clone(), number))
                })
                .collect();
            if let Err(error) = self.recordings.hold(case, rooms, now).await {
                eprintln!("[cb] takes not held for a report: {error}");
            }
            if !channels.is_empty()
                && let Err(error) = self.recordings.hold_channels(case, channels, now).await
            {
                eprintln!("[cb] channels not kept for a report: {error}");
            }
        }
        Ok(if recorded.is_some() {
            json!({ "ok": true, "status": "recorded" })
        } else {
            refused("cb_report_target_invalid")
        })
    }

    // `block`: the person behind a handle, through the contacts' block; they never learn it. A call between them closes
    // for both (lot L5: the person blocked told `ended`, never why).
    async fn block(&self, message: &JsonValue, owner: &str) -> Result<JsonValue, String> {
        if !self.blocks.allowed(owner) {
            return Ok(refused("cb_rate_limited"));
        }
        let (handle, me) = (text(message.get("handle")), owner.to_string());
        let blocked = self
            .central
            .transaction(move |db| {
                let Some(found) = handles::resolve(db, &handle)? else {
                    return Ok(None);
                };
                if found.principal == me {
                    return Ok(None);
                }
                relations::block(db, &me, &found.principal)?;
                Ok(Some(found.principal))
            })
            .await?;
        Ok(match blocked {
            Some(principal) => {
                self.call_blocked(owner, &principal).await;
                json!({ "ok": true, "status": "blocked" })
            }
            None => refused("cb_block_target_invalid"),
        })
    }

    /// The `cb` frame of `/ws/api` for `user` on connection `live`. No answer ever holds an
    /// account, a name, a phone, a cell or a distance.
    pub async fn handle(
        &self,
        directory: &Directory,
        message: &JsonValue,
        user: &str,
        live: u64,
    ) -> Result<JsonValue, String> {
        if !self.frames.allowed(user) {
            return Ok(refused("cb_rate_limited"));
        }
        // An admin listens to a case's takes without a channel, an age read or the notice (lot L4).
        let asked = text(message.get("action"));
        if recordings::ADMIN_ACTIONS.contains(&asked.as_str()) {
            return self.recordings_admin(&asked, message, user).await;
        }
        if !Self::adult(directory, user).await {
            return Ok(refused("cb_adult_required"));
        }
        let action = js::slice(&text(message.get("action")), 40);
        if !ACTIONS.contains(&action.as_str()) {
            return Ok(refused("cb_action_invalid"));
        }
        if (RECORDED.contains(&action.as_str()) || NOTICED.contains(&action.as_str()))
            && !self.notice_accepted(user).await
        {
            return Ok(refused("cb_notice_required"));
        }
        Ok(match action.as_str() {
            "zone-set" => self.zone_set(message, user, live),
            "notice-get" => json!({ "ok": true, "version": NOTICE_VERSION,
                "accepted": self.notice_accepted(user).await }),
            "notice-accept" => self.accept_notice(user, message.get("version")).await,
            "report" => self.report(message, user, live).await?,
            "block" => self.block(message, user).await?,
            "bottle-options" => json!({ "ok": true, "video": self.video_allowed(user).await? }),
            "bottle-sea" => self.sea_of(user, live).await?,
            "bottle-launch" => self.launch(message, user, live).await?,
            "bottle-catch" => self.catch_bottle(message, user, live).await?,
            "bottle-open" => self.open_bottle(message, user).await?,
            "bottle-decide" => self.decide_bottle(message, user).await?,
            "bottle-reply" => self.reply_bottle(message, user).await?,
            "bottle-thread" => self.thread_bottle(message, user).await?,
            "bottles-mine" => self.bottles_mine(user).await?,
            "bottle-withdraw" => self.withdraw_bottle(message, user).await?,
            "tr-subscribe" | "tr-unsubscribe" | "tr-probe" => {
                self.live_translate(&action, message, user, live).await?
            }
            "channels-active" | "tune" | "leave" | "floor-take" | "floor-release" => {
                self.channel_action(&action, message, user, live).await?
            }
            "call-available" | "call-respond" | "call-end" => {
                self.call_action(&action, message, user, live).await?
            }
            _ => refused("cb_action_unavailable"),
        })
    }
}
