// The bottles of the CB sociale (temp/cb_sociale_2026-11-15/CAHIER_DES_CHARGES.md §6, lot L2): a
// message left blind in a zone (zones.rs), caught at random by someone who looks in a zone that
// contains it. Its life: `at_sea` → `reserved` (13 min) → `opened` → `kept` | `replied`, or
// ignored back `at_sea`; a reservation run out goes back too; after 3 returns, or 21 days, it is
// `expired`; three reports hide it (`hidden`); its sender may take it back while at sea
// (`withdrawn`). A catch is one immediate transaction: the candidates are read, filtered (the
// zone, never one's own, never one already seen, never from or to a person blocked either way or
// hidden, a video only for whom the switch allows), then one is reserved by an update that holds
// only while it is still at sea. Its content is given only to the one who holds a reservation
// still running (« La bouteille vous a échappé. » otherwise). A reply opens an anonymous thread of
// two pseudonyms proper to that bottle and that person (handles.rs), stored here, never as a
// direct message (direct_messages.rs carries the account, name and phone); the sender is told
// « Une réponse à votre bouteille » without any name (live.rs `Notifier`, push.rs). What the
// catcher reads of a media is a clean copy the server made (media/clean.rs), kept outside every
// vault and erased with the bottle; it is read through an unguessable link valid 13 minutes.
use super::zones::{Range, WORLD, Zone};
use super::{BOTTLE_CASE, PERSON_CASE, refused};
use crate::media::clean::VideoBounds;
use crate::social::moderation;
use crate::social::news::db::{all, get, run, text};
use crate::social::relations;
use crate::social::request_guard;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};
use std::path::{Path, PathBuf};

mod actions;
mod media;
mod purge;
#[cfg(test)]
mod tests;
mod threads;

pub(super) use media::Grant;
pub use purge::{forget_principal, purge, withdraw};
pub use threads::{Translatable, Written, mine, read_thread, reply, reply_in, translatable};

const MINUTE_MS: i64 = 60_000;

const DAY_MS: i64 = 24 * 60 * MINUTE_MS;

/// A bottle's life at sea (cahier §9).
pub const LIFE_MS: i64 = 21 * DAY_MS;

/// A catch's reservation.
pub const RESERVATION_MS: i64 = 13 * MINUTE_MS;

/// Returns to the sea before it expires.
pub const RECIRCULATIONS: i64 = 3;

pub const LAUNCHES_PER_DAY: i64 = 5;

pub const YOUNG_LAUNCHES_PER_DAY: i64 = 1;

const YOUNG_ACCOUNT_MS: i64 = 3 * DAY_MS;

pub const CATCHES_PER_DAY: i64 = 13;

pub const VOICE_MAX_S: f64 = 89.0;

pub const VIDEO_MAX_S: f64 = 21.0;

const MIB: u64 = 1024 * 1024;

pub const IMAGE_MAX_BYTES: u64 = 2 * MIB;

pub const VIDEO_MAX_BYTES: u64 = 13 * MIB;

// What the server accepts to read before cleaning: a voice of 89 s and a video before its encoding.
const VOICE_INPUT_BYTES: u64 = 13 * MIB;

const VIDEO_INPUT_BYTES: u64 = 144 * MIB;

const VIDEO: VideoBounds = VideoBounds {
    long_side: 720,
    video_kbps: 3000,
    audio_kbps: 96,
};

const THUMB_SIDE: u32 = 360;

// A thread's message: as long as a bottle's text.
const EXCERPT: usize = 55;

// The candidates read for one catch, before they are filtered.
const CANDIDATES: i64 = 89;

// What the sea shows at most: a few bottles approaching, never how many are out there.
const SEA_MAX: usize = 3;

const AT_SEA: &str = "at_sea";

/// The server setting naming the video switch (cahier §6.8), read like every other setting (settings.rs:
/// `.env.local`, the environment, `.env`).
pub const VIDEO_SETTING: &str = "cb.bottle_video";

// The same setting where a dotted name cannot be written (a shell's `export`): read only when
// `cb.bottle_video` is not set.
const VIDEO_SETTING_ENV: &str = "CB_BOTTLE_VIDEO";

/// The `cb.bottle_video` switch: `off` in production (the default), `testers` for the accounts
/// holding the role `tester` (account_roles.rs, on the account, in the central database), `all`
/// once moderation has its screen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BottleVideo {
    Off,
    Testers,
    All,
}

impl BottleVideo {
    /// `off` for anything but `testers` or `all`.
    pub fn parse(value: Option<&str>) -> Self {
        match value.map(|value| value.trim().to_lowercase()).as_deref() {
            Some("testers") => Self::Testers,
            Some("all") => Self::All,
            _ => Self::Off,
        }
    }

    /// The switch as the server's settings set it: `cb.bottle_video`, else its environment
    /// spelling `CB_BOTTLE_VIDEO`; `off` when neither says `testers` or `all`.
    pub fn from_settings(settings: &crate::settings::Settings) -> Self {
        Self::parse(
            settings
                .get(VIDEO_SETTING)
                .or_else(|| settings.get(VIDEO_SETTING_ENV))
                .as_deref(),
        )
    }
}

fn now_ms() -> i64 {
    atome_js_values::dates::now_ms()
}

fn number(row: &JsonValue, key: &str) -> i64 {
    js::number(row.get(key)) as i64
}

/// Reservations run out, a bottle opened and left undecided included: back to the sea, or expired once
/// returned enough.
pub fn release_expired(db: &Connection, now: i64) -> Result<usize, String> {
    run(
        db,
        "UPDATE cb_bottles SET state = CASE WHEN recirculations >= ? THEN 'expired' ELSE 'at_sea' END,
         recirculations = recirculations + 1, holder_id = NULL, reserved_until = NULL, updated_ms = ?
         WHERE state IN ('reserved', 'opened') AND reserved_until <= ?",
        &[&RECIRCULATIONS, &now, &now],
    )
}

/// Whether `me` may catch what a bottle of `sender` holds: neither blocked the other, neither is
/// hidden, the bottle itself is not (social/cb `may_meet`, on this transaction).
fn reachable(db: &Connection, me: &str, sender: &str, bottle: &str) -> Result<bool, String> {
    Ok(!relations::blocked_either_way(db, me, sender)?
        && !moderation::hidden_case(db, PERSON_CASE, me)?
        && !moderation::hidden_case(db, PERSON_CASE, sender)?
        && !moderation::hidden_case(db, BOTTLE_CASE, bottle)?)
}

/// Who looks for a bottle: their zone, whether the video switch lets them catch one, and the country their device
/// computed for this catch only (none without a location accepted). That country is compared with the countries bottles
/// were thrown to, then forgotten: never written, never logged, never given back (lot L2c, user 16 Nov. 2026).
#[derive(Clone, Copy)]
pub struct Seeker<'a> {
    pub zone: &'a Zone,
    pub video: bool,
    pub country: Option<&'a str>,
}

impl<'a> Seeker<'a> {
    /// A seeker without a country: the sea, or a catch without a location (no bottle thrown to a country).
    pub fn of(zone: &'a Zone, video: bool) -> Self {
        Self {
            zone,
            video,
            country: None,
        }
    }
}

/// The bottles at sea `me` could catch, at random: those of a zone theirs contains, and those thrown to the country
/// their device is in (a bottle thrown to a country is caught there only, whatever the catcher's reach).
fn candidates(db: &Connection, me: &str, seeker: &Seeker, now: i64) -> Result<Vec<String>, String> {
    let prefix = format!("{}%", seeker.zone.cell());
    let country = seeker.country.unwrap_or_default();
    let rows = all(
        db,
        "SELECT b.bottle_id, b.sender_id, b.zone_range, b.zone_cell, b.kind, b.target_country FROM cb_bottles b
         WHERE b.state = 'at_sea' AND b.expires_ms > ? AND b.sender_id <> ?
         AND (b.zone_cell LIKE ? OR (b.target_country IS NOT NULL AND b.target_country = ?))
         AND NOT EXISTS (SELECT 1 FROM cb_bottle_seen s WHERE s.bottle_id = b.bottle_id AND s.principal_id = ?)
         ORDER BY random() LIMIT ?",
        &[&now, &me, &prefix, &country, &me, &CANDIDATES],
    )?;
    let mut found = Vec::new();
    for row in rows {
        // A bottle left in the world keeps no cell.
        let origin = Range::parse(row.get("zone_range")).and_then(|range| {
            let cell = text(row.get("zone_cell"));
            let cell = if range == Range::World {
                WORLD
            } else {
                cell.as_str()
            };
            Zone::parse(range, cell).ok()
        });
        let (id, sender) = (text(row.get("bottle_id")), text(row.get("sender_id")));
        let target = text(row.get("target_country"));
        let placed = if target.is_empty() {
            origin.is_some_and(|origin| seeker.zone.contains(&origin))
        } else {
            seeker.country == Some(target.as_str())
        };
        if placed
            && (seeker.video || text(row.get("kind")) != "video")
            && reachable(db, me, &sender, &id)?
        {
            found.push(id);
        }
    }
    Ok(found)
}

/// How many bottles approach `me` in `zone`: a few at most, never their count.
pub fn sea(db: &Connection, me: &str, zone: &Zone, video: bool) -> Result<usize, String> {
    sea_for(db, me, &Seeker::of(zone, video))
}

/// How many bottles approach `seeker`: a few at most, never their count.
pub fn sea_for(db: &Connection, me: &str, seeker: &Seeker) -> Result<usize, String> {
    let now = now_ms();
    release_expired(db, now)?;
    Ok(candidates(db, me, seeker, now)?.len().min(SEA_MAX))
}

/// One bottle of `zone` reserved for `me`, atomically; its kind and thumbnail only.
pub fn catch(
    db: &Connection,
    me: &str,
    zone: &Zone,
    video: bool,
    now: i64,
) -> Result<JsonValue, String> {
    catch_for(db, me, &Seeker::of(zone, video), now)
}

/// One bottle reserved for `seeker`, atomically; its kind and thumbnail only. The catcher's country only chose which
/// bottles could be caught: nothing of it is written.
pub fn catch_for(
    db: &Connection,
    me: &str,
    seeker: &Seeker,
    now: i64,
) -> Result<JsonValue, String> {
    release_expired(db, now)?;
    let today = get(
        db,
        "SELECT COUNT(*) AS total FROM cb_bottle_seen WHERE principal_id = ? AND seen_ms > ?",
        &[&me, &(now - DAY_MS)],
    )?
    .map_or(0, |row| number(&row, "total"));
    if today >= CATCHES_PER_DAY {
        return Ok(refused("cb_bottle_catch_quota"));
    }
    let until = now + RESERVATION_MS;
    for id in candidates(db, me, seeker, now)? {
        let Some(row) = get(
            db,
            "UPDATE cb_bottles SET state = 'reserved', holder_id = ?, reserved_until = ?, updated_ms = ?
             WHERE bottle_id = ? AND state = 'at_sea' RETURNING bottle_id, kind, thumb_file",
            &[&me, &until, &now, &id],
        )?
        else {
            continue;
        };
        run(
            db,
            "INSERT OR IGNORE INTO cb_bottle_seen (bottle_id, principal_id, seen_ms) VALUES (?, ?, ?)",
            &[&id, &me, &now],
        )?;
        return Ok(
            json!({ "ok": true, "bottle": { "id": id, "kind": text(row.get("kind")),
            "reserved_until": until, "thumb": !text(row.get("thumb_file")).is_empty() } }),
        );
    }
    Ok(refused("cb_bottle_none"))
}

/// The bottle `me` holds a reservation on, still running: it becomes `opened`. None otherwise.
pub fn open(db: &Connection, me: &str, id: &str, now: i64) -> Result<Option<JsonValue>, String> {
    let Some(row) = get(
        db,
        "SELECT * FROM cb_bottles WHERE bottle_id = ? AND holder_id = ? AND state IN ('reserved', 'opened')
         AND (state = 'opened' OR reserved_until > ?)",
        &[&id, &me, &now],
    )?
    else {
        return Ok(None);
    };
    if !reachable(db, me, &text(row.get("sender_id")), id)? {
        return Ok(None);
    }
    run(
        db,
        "UPDATE cb_bottles SET state = 'opened', updated_ms = ? WHERE bottle_id = ?",
        &[&now, &id],
    )?;
    Ok(Some(row))
}

/// Ignore (back to the sea, or expired once returned enough) or keep (read only, its own).
pub fn decide(
    db: &Connection,
    me: &str,
    id: &str,
    decision: &str,
    now: i64,
) -> Result<JsonValue, String> {
    let held = get(
        db,
        "SELECT recirculations FROM cb_bottles WHERE bottle_id = ? AND holder_id = ? AND state = 'opened'",
        &[&id, &me],
    )?;
    let Some(held) = held else {
        return Ok(refused("cb_bottle_not_held"));
    };
    let state = match decision {
        "ignore" if number(&held, "recirculations") >= RECIRCULATIONS => "expired",
        "ignore" => AT_SEA,
        "keep" => "kept",
        _ => return Ok(refused("cb_bottle_decision_invalid")),
    };
    if state == "kept" {
        run(
            db,
            "UPDATE cb_bottles SET state = 'kept', updated_ms = ? WHERE bottle_id = ?",
            &[&now, &id],
        )?;
    } else {
        run(
            db,
            "UPDATE cb_bottles SET state = ?, holder_id = NULL, reserved_until = NULL,
             recirculations = recirculations + 1, updated_ms = ? WHERE bottle_id = ?",
            &[&state, &now, &id],
        )?;
    }
    Ok(json!({ "ok": true, "state": state }))
}

/// The launch limits (`request_guard.rs`'s model): 5 a day, 1 in the account's first 72 hours,
/// none while three blocks received within 30 days suspend the account.
fn admit(db: &Connection, sender: &str, now: i64) -> Result<Result<(), &'static str>, String> {
    if request_guard::suspended(db, sender, now)? {
        return Ok(Err("cb_suspended"));
    }
    let created = crate::auth::accounts::find_by_id(db, sender)?
        .as_ref()
        .and_then(|account| account["created_at"].as_str())
        .and_then(request_guard::time_of)
        .unwrap_or(now);
    let quota = if now - created < YOUNG_ACCOUNT_MS {
        YOUNG_LAUNCHES_PER_DAY
    } else {
        LAUNCHES_PER_DAY
    };
    let today = get(
        db,
        "SELECT COUNT(*) AS total FROM cb_bottles WHERE sender_id = ? AND created_ms > ?",
        &[&sender, &(now - DAY_MS)],
    )?
    .map_or(0, |row| number(&row, "total"));
    Ok(if today >= quota {
        Err("cb_bottle_launch_quota")
    } else {
        Ok(())
    })
}

/// The bottles' folder beside the uploads' temporary one, outside every vault.
pub fn media_dir_of(uploads_tmp: &Path) -> PathBuf {
    uploads_tmp
        .parent()
        .unwrap_or(uploads_tmp)
        .join("cb_bottles")
}
