// The recording of the CB's voices (R-173 lot L4; temp/cb_sociale_2026-11-15/CAHIER_DES_CHARGES.md §7.2–7.4, §9): every
// take of a channel's voice (one floor turn: a speaker's first packet to the pause of their microphone) is written as an
// Ogg Opus file, its packets copied without transcoding (ogg_opus.rs), from a consumer the server attaches to each audio
// producer of a `cb` room (tap.rs, on a mediasoup DirectTransport; an Appel's room, lot L5, attaches the same brick).
//
// - What is kept: the file, in the server's own folder (`data/cb_recordings`, 0700, each file 0600), never in a person's
//   vault and never served (the static roots are atome/, eVe/ and atome/src only); and its metadata in `cb_recordings`:
//   the room's token (`cbr_…`), the speaker's pseudonym of the channel (`cbh_…`), its start, end and length, its file and
//   how the file is sealed. No account, name, phone, zone nor country: a pseudonym leads back to its account through
//   `cb_handles`, on the server only, as a report or a block does.
// - How long: 21 days (`cb.recordings_keep_days`), purged by the server's daily loop (main.rs, as media::trash::purge).
// - A report on a person (`report`, social/cb/mod.rs) holds the takes of the 13 last minutes (`cb.recordings_freeze_minutes`)
//   of the channel concerned, the take in progress included, in `cb_recording_holds`: they leave the purge while the
//   report's case (`moderation_cases`) is open.
// - Listening (actions.rs): an `admin` account only, case by case, every reading written in `cb_recording_listens`.
// - The live translation (lot TR): each take, once closed, is handed whole to its branch point (`segment` with the Ogg
//   file, `Audio::Encoded`), for the listeners who asked for it and are entitled to it; nothing of the translation is kept
//   here: the original voice alone is recorded.
// - Sealed at rest (AIPD « À trancher » 2, decided by the user on 18 Nov. 2026): the server sets an AES-256-GCM `Sealer`
//   at its start (seal.rs, its key from the environment); its name is kept with each file, so a file written plain
//   before still reads, and the moderation opens every take through the server's key. A production server without a key
//   records nothing and refuses the floor. `Recordings::new` alone (the tests) writes plain.
mod actions;
pub mod ogg_opus;
pub mod seal;

pub use actions::ADMIN_ACTIONS;
#[cfg(all(unix, feature = "visio"))]
pub mod tap;

use super::live_translate::{Audio, LiveTranslate, RoomKind};
use crate::settings::Settings;
use crate::social::news::db::{all, get, run, text};
use crate::vault_router::central::Central;
use crate::vault_router::js;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub const KEEP_SETTING: &str = "cb.recordings_keep_days";
const KEEP_ENV: &str = "CB_RECORDINGS_KEEP_DAYS";
pub const FREEZE_SETTING: &str = "cb.recordings_freeze_minutes";
const FREEZE_ENV: &str = "CB_RECORDINGS_FREEZE_MINUTES";
const DAY_MS: u64 = 24 * 60 * 60 * 1000;
const PREFIX: &str = "cbrec_";
/// The listens' journal is kept a year (AIPD: « 1 an (à fixer) »).
pub const JOURNAL_KEEP_MS: u64 = 365 * DAY_MS;
/// What a take's file is served as to an admin and handed to the live translation.
pub const MIME: &str = "audio/ogg";

/// How long takes are kept, and how far back a report holds them (rule 19: 21 days, 13 minutes).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    pub keep_ms: u64,
    pub freeze_ms: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            keep_ms: 21 * DAY_MS,
            freeze_ms: 13 * 60 * 1000,
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
            keep_ms: read(KEEP_SETTING, KEEP_ENV).map_or(defaults.keep_ms, |days| days * DAY_MS),
            freeze_ms: read(FREEZE_SETTING, FREEZE_ENV)
                .map_or(defaults.freeze_ms, |minutes| minutes * 60 * 1000),
        }
    }
}

/// How a take's file is kept at rest (AIPD « À trancher » 2): `id`, the take's recording id, is bound to its bytes.
pub trait Sealer: Send + Sync {
    /// The name kept with each file (`plain`, `aes-256-gcm`), so a file reads with the sealer that wrote it.
    fn name(&self) -> &'static str;
    /// The file's extension.
    fn extension(&self) -> &'static str {
        "ogg"
    }
    /// Whether a take can be kept now: a producer is refused before its first packet otherwise.
    fn ready(&self) -> Result<(), String> {
        Ok(())
    }
    fn seal(&self, id: &str, plain: &[u8]) -> Result<Vec<u8>, String>;
    fn open(&self, id: &str, stored: &[u8]) -> Result<Vec<u8>, String>;
}

/// The files as written: the files kept before the sealing, and the tests' store.
pub struct Plain;

impl Sealer for Plain {
    fn name(&self) -> &'static str {
        "plain"
    }
    fn seal(&self, _id: &str, plain: &[u8]) -> Result<Vec<u8>, String> {
        Ok(plain.to_vec())
    }
    fn open(&self, _id: &str, stored: &[u8]) -> Result<Vec<u8>, String> {
        Ok(stored.to_vec())
    }
}

/// A take closed, before it is kept.
pub struct Take {
    pub room: String,
    pub kind: RoomKind,
    pub handle: String,
    pub started_ms: u64,
    pub ended_ms: u64,
    pub written: ogg_opus::Written,
}

/// A take as kept (the admins' view).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Kept {
    pub recording: String,
    pub room: String,
    pub handle: String,
    pub started_ms: u64,
    pub ended_ms: u64,
    pub duration_ms: u64,
}

/// What a purge erased.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Purged {
    pub recordings: usize,
    pub holds: usize,
    pub handles: usize,
    pub listens: usize,
}

/// The takes' folder, beside the bottles' (`data/cb_recordings`), out of every vault and every static root.
pub fn dir_of(uploads_tmp: &Path) -> PathBuf {
    uploads_tmp
        .parent()
        .unwrap_or(uploads_tmp)
        .join("cb_recordings")
}

fn kind_name(kind: RoomKind) -> &'static str {
    match kind {
        RoomKind::Cb => "cb",
        RoomKind::Call => "call",
    }
}

fn now_ms() -> u64 {
    u64::try_from(atome_js_values::dates::now_ms()).unwrap_or_default()
}

fn number(value: Option<&serde_json::Value>) -> u64 {
    js::number(value).max(0.0) as u64
}

// A file name the table gave back: one plain name in the folder, never a path.
fn safe_name(name: &str) -> bool {
    name.starts_with(PREFIX)
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.')
        && !name.contains("..")
}

#[cfg(unix)]
fn private(path: &Path, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
}

#[cfg(not(unix))]
fn private(_path: &Path, _mode: u32) -> std::io::Result<()> {
    Ok(())
}

// A recording's case-held clause: a hold of an open case on its room whose window it overlaps.
const HELD: &str = "EXISTS (SELECT 1 FROM cb_recording_holds h JOIN moderation_cases c ON c.case_id = h.case_id
    WHERE c.status = 'open' AND h.room = r.room AND r.ended_ms >= h.from_ms AND r.started_ms <= h.held_ms)";

pub struct Recordings {
    central: Central,
    dir: PathBuf,
    live: Arc<LiveTranslate>,
    sealer: Mutex<Arc<dyn Sealer>>,
    limits: Mutex<Limits>,
}

impl Recordings {
    pub fn new(central: Central, dir: PathBuf, live: Arc<LiveTranslate>) -> Self {
        Self {
            central,
            dir,
            live,
            sealer: Mutex::new(Arc::new(Plain)),
            limits: Mutex::new(Limits::default()),
        }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn limits(&self) -> Limits {
        *self.limits.lock().expect("cb recordings limits")
    }

    pub fn set_limits(&self, limits: Limits) {
        *self.limits.lock().expect("cb recordings limits") = limits;
    }

    /// The sealing of the files at rest (the server's, seal.rs; plain until it is set).
    pub fn set_sealer(&self, sealer: Arc<dyn Sealer>) {
        *self.sealer.lock().expect("cb recordings sealer") = sealer;
    }

    fn sealer(&self) -> Arc<dyn Sealer> {
        self.sealer.lock().expect("cb recordings sealer").clone()
    }

    /// Whether a take can be kept now (a key there to seal it).
    pub fn ready(&self) -> Result<(), String> {
        self.sealer().ready()
    }

    /// A take closed: handed whole to the live translation, then its file written and its metadata kept. Its id.
    pub async fn keep(&self, take: Take) -> Result<String, String> {
        let Take {
            room,
            kind,
            handle,
            started_ms,
            ended_ms,
            written,
        } = take;
        let sealer = self.sealer();
        sealer.ready()?;
        // The live translation first (its listeners wait for it); the voice alone is kept, never what it becomes.
        let (live, room_tr, handle_tr) = (self.live.clone(), room.clone(), handle.clone());
        let audio = Audio::Encoded {
            mime: MIME.into(),
            bytes: written.bytes.clone(),
            duration_ms: written.duration_ms,
        };
        tokio::spawn(async move {
            live.segment(&room_tr, &handle_tr, audio).await;
        });
        let recording = format!("{PREFIX}{}", uuid::Uuid::new_v4().simple());
        let file = format!("{recording}.{}", sealer.extension());
        let (dir, path) = (self.dir.clone(), self.dir.join(&file));
        let sealed = sealer.seal(&recording, &written.bytes)?;
        let size = sealed.len() as u64;
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            private(&dir, 0o700).map_err(|e| e.to_string())?;
            let partial = path.with_extension("partial");
            std::fs::write(&partial, sealed).map_err(|e| e.to_string())?;
            private(&partial, 0o600).map_err(|e| e.to_string())?;
            std::fs::rename(&partial, &path).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())??;
        let (id, sealing) = (recording.clone(), sealer.name());
        let duration = written.duration_ms;
        self.central
            .transaction(move |db| {
                run(
                    db,
                    "INSERT INTO cb_recordings (recording_id, room, room_kind, handle, started_ms, ended_ms, duration_ms,
                     file, bytes, sealing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    &[
                        &id,
                        &room,
                        &kind_name(kind),
                        &handle,
                        &(started_ms as i64),
                        &(ended_ms as i64),
                        &(duration as i64),
                        &file,
                        &(size as i64),
                        &sealing,
                    ],
                )
                .map(|_| ())
            })
            .await?;
        Ok(recording)
    }

    /// The number of each channel a report's case `case_id` froze (`cb_recording_hold_channels`, the moderator's case
    /// file), kept once the channel is no longer in use; the first number written for a room holds.
    pub async fn hold_channels(
        &self,
        case_id: &str,
        channels: Vec<(String, u8)>,
        now_ms: u64,
    ) -> Result<(), String> {
        let (case_id, now) = (case_id.to_string(), now_ms as i64);
        self.central
            .transaction(move |db| {
                for (room, channel) in channels.iter().filter(|(room, _)| !room.is_empty()) {
                    run(
                        db,
                        "INSERT OR IGNORE INTO cb_recording_hold_channels (case_id, room, channel, held_ms)
                         VALUES (?, ?, ?, ?)",
                        &[&case_id, room, &i64::from(*channel), &now],
                    )?;
                }
                Ok(())
            })
            .await
    }

    /// The channels' numbers the open cases froze, by case and room.
    pub async fn held_channels(&self) -> Result<HashMap<(String, String), u8>, String> {
        self.central
            .transaction(move |db| {
                let rows = all(
                    db,
                    "SELECT h.case_id, h.room, h.channel FROM cb_recording_hold_channels h
                     JOIN moderation_cases c ON c.case_id = h.case_id WHERE c.status = 'open'",
                    &[],
                )?;
                Ok(rows
                    .iter()
                    .filter_map(|row| {
                        let channel = u8::try_from(number(row.get("channel"))).ok()?;
                        Some(((text(row.get("case_id")), text(row.get("room"))), channel))
                    })
                    .collect())
            })
            .await
    }

    /// A report's case `case_id` holds the takes of `rooms` of its last minutes (13 by default, up to `now_ms`), those
    /// still being spoken included: how many kept takes it holds now.
    pub async fn hold(
        &self,
        case_id: &str,
        rooms: Vec<String>,
        now_ms: u64,
    ) -> Result<usize, String> {
        let from = now_ms.saturating_sub(self.limits().freeze_ms) as i64;
        let (case_id, now) = (case_id.to_string(), now_ms as i64);
        self.central
            .transaction(move |db| {
                let mut held = 0;
                for room in rooms.iter().filter(|room| !room.is_empty()) {
                    run(
                        db,
                        "INSERT OR IGNORE INTO cb_recording_holds (case_id, room, from_ms, held_ms) VALUES (?, ?, ?, ?)",
                        &[&case_id, room, &from, &now],
                    )?;
                    held += get(
                        db,
                        "SELECT COUNT(*) AS total FROM cb_recordings WHERE room = ? AND ended_ms >= ? AND started_ms <= ?",
                        &[room, &from, &now],
                    )?
                    .map_or(0, |row| number(row.get("total")) as usize);
                }
                Ok(held)
            })
            .await
    }

    /// The takes a case holds, oldest first.
    pub async fn of_case(&self, case_id: &str) -> Result<Vec<Kept>, String> {
        let case_id = case_id.to_string();
        self.central
            .transaction(move |db| {
                let rows = all(
                    db,
                    "SELECT DISTINCT r.recording_id, r.room, r.handle, r.started_ms, r.ended_ms, r.duration_ms
                     FROM cb_recordings r JOIN cb_recording_holds h ON h.room = r.room
                     WHERE h.case_id = ? AND r.ended_ms >= h.from_ms AND r.started_ms <= h.held_ms
                     ORDER BY r.started_ms",
                    &[&case_id],
                )?;
                Ok(rows
                    .iter()
                    .map(|row| Kept {
                        recording: text(row.get("recording_id")),
                        room: text(row.get("room")),
                        handle: text(row.get("handle")),
                        started_ms: number(row.get("started_ms")),
                        ended_ms: number(row.get("ended_ms")),
                        duration_ms: number(row.get("duration_ms")),
                    })
                    .collect())
            })
            .await
    }

    /// The bytes of `recording` (opened by the sealer that wrote it).
    async fn read(&self, recording: &str) -> Result<Option<Vec<u8>>, String> {
        let wanted = recording.to_string();
        let row = self
            .central
            .transaction(move |db| {
                get(
                    db,
                    "SELECT file, sealing FROM cb_recordings WHERE recording_id = ?",
                    &[&wanted],
                )
            })
            .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let (file, sealing) = (text(row.get("file")), text(row.get("sealing")));
        // A file opens with the sealer that wrote it: the server's, or plain (the takes kept before the sealing).
        let sealer: Arc<dyn Sealer> = match self.sealer() {
            _ if sealing == Plain.name() => Arc::new(Plain),
            sealer if sealing == sealer.name() => sealer,
            _ => return Err("cb_recording_unreadable".into()),
        };
        if !safe_name(&file) {
            return Err("cb_recording_unreadable".into());
        }
        let path = self.dir.join(file);
        let stored = tokio::task::spawn_blocking(move || std::fs::read(path))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|_| "cb_recording_missing".to_string())?;
        sealer.open(recording, &stored).map(Some)
    }

    /// The daily purge at `now_ms`: the takes past their time and held by no open case (their files, then their rows);
    /// the holds of the cases closed; the channels' pseudonyms past the same time that no kept take names; the
    /// journal past a year; a file left by an interrupted write.
    pub async fn purge(&self, now_ms: u64) -> Result<Purged, String> {
        let limits = self.limits();
        let before = now_ms.saturating_sub(limits.keep_ms) as i64;
        let journal = now_ms.saturating_sub(JOURNAL_KEEP_MS) as i64;
        let keep_days = format!("-{} seconds", limits.keep_ms / 1000);
        let (files, mut purged) = self
            .central
            .transaction(move |db| {
                let gone = all(
                    db,
                    &format!(
                        "SELECT recording_id, file FROM cb_recordings r WHERE r.ended_ms < ? AND NOT {HELD}"
                    ),
                    &[&before],
                )?;
                let mut files = Vec::new();
                for row in &gone {
                    run(
                        db,
                        "DELETE FROM cb_recordings WHERE recording_id = ?",
                        &[&text(row.get("recording_id"))],
                    )?;
                    files.push(text(row.get("file")));
                }
                let holds = run(
                    db,
                    "DELETE FROM cb_recording_holds WHERE case_id NOT IN
                     (SELECT case_id FROM moderation_cases WHERE status = 'open')",
                    &[],
                )?;
                // The channels' numbers of the cases closed go with their holds.
                run(
                    db,
                    "DELETE FROM cb_recording_hold_channels WHERE case_id NOT IN
                     (SELECT case_id FROM moderation_cases WHERE status = 'open')",
                    &[],
                )?;
                // A channel's pseudonym carried its zone before lot L4: the zone is dropped from those still kept.
                run(
                    db,
                    "UPDATE cb_handles SET context = 'channel:' WHERE context LIKE 'channel:%'
                     AND context NOT LIKE 'channel:cbr\\_%' ESCAPE '\\' AND context <> 'channel:'",
                    &[],
                )?;
                let handles = run(
                    db,
                    "DELETE FROM cb_handles WHERE context LIKE 'channel:%' AND created_at < datetime('now', ?)
                     AND handle NOT IN (SELECT handle FROM cb_recordings)",
                    &[&keep_days],
                )?;
                let listens = run(
                    db,
                    "DELETE FROM cb_recording_listens WHERE at_ms < ?",
                    &[&journal],
                )?;
                Ok((
                    files,
                    Purged {
                        recordings: gone.len(),
                        holds,
                        handles,
                        listens,
                    },
                ))
            })
            .await?;
        let dir = self.dir.clone();
        let removed = tokio::task::spawn_blocking(move || {
            let mut removed = 0;
            for file in files.iter().filter(|file| safe_name(file)) {
                if std::fs::remove_file(dir.join(file)).is_ok() {
                    removed += 1;
                }
            }
            // A partial file an interrupted write left.
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    if entry.path().extension().is_some_and(|ext| ext == "partial") {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
            removed
        })
        .await
        .map_err(|e| e.to_string())?;
        if removed != purged.recordings {
            eprintln!(
                "[cb] recordings purge: {} rows, {removed} files",
                purged.recordings
            );
        }
        purged.recordings = purged.recordings.max(removed);
        Ok(purged)
    }

    /// The daily purge now.
    pub async fn purge_now(&self) -> Result<Purged, String> {
        self.purge(now_ms()).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_defaults_are_21_days_and_13_minutes() {
        assert_eq!(
            Limits::default(),
            Limits {
                keep_ms: 21 * DAY_MS,
                freeze_ms: 13 * 60 * 1000
            }
        );
        assert!(safe_name("cbrec_0a1b.ogg"));
        assert!(!safe_name("../cbrec_0a1b.ogg") && !safe_name("cbrec_/etc") && !safe_name("x.ogg"));
    }
}
