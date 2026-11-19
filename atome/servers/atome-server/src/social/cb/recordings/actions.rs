// Listening to the takes (cahier §7.4, test 28; the moderator's screen, mockup 29 option 2 « Frise », validated by the
// user on 18 Nov. 2026): the `cb` frames of an `admin` account only (ws_api/sources/account_roles.rs), case by case:
// - `recordings-cases`: the open cases that hold takes — for each, the case, its way (`cb` and the channel's number while
//   it is still in use, or `call`), the window held (`from_ms`–`held_ms`), the reports' instants, how many voices and takes,
//   and the pseudonyms (`cbh_…`) of the person reported among its takes; never the account the case is opened on;
// - `recordings-case`: a case's takes (their pseudonym, start, end, length);
// - `recording-listen`: one take's Ogg Opus file, base64; a take is given only through a case that holds it;
// - `recordings-journal`: a case's journal, newest first (what was done, when, which take's pseudonym, and whether by the
//   admin asking: never an admin's account nor name).
// Every reading — a listing of the cases, of a case's takes, of its journal, as a listening — is written in
// `cb_recording_listens` (the admin, the case, the take, when) before the answer.
use super::Recordings;
use crate::social::cb::Cb;
use crate::social::news::db::{all, get, run, text};
use crate::ws_api::sources::account_roles;
use base64::Engine;
use serde_json::{Value as JsonValue, json};
use std::collections::BTreeSet;

/// The admin's frames, answered before the CB's own gates (an admin listens without a channel nor the notice).
pub const ADMIN_ACTIONS: [&str; 4] = [
    "recordings-case",
    "recording-listen",
    "recordings-cases",
    "recordings-journal",
];

/// A case's journal as it is read: its last rows (the journal is kept a year, `JOURNAL_KEEP_MS`).
const JOURNAL_ROWS: i64 = 200;

fn refused(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

fn now_ms() -> i64 {
    atome_js_values::dates::now_ms()
}

/// An open case that holds takes, as the moderation lists it: its target's account stays on the server.
struct OpenCase {
    case: String,
    kind: &'static str,
    rooms: Vec<String>,
    from_ms: u64,
    held_ms: u64,
    reported_ms: Vec<u64>,
    reports: u64,
    voices: usize,
    takes: usize,
    targets: Vec<String>,
}

impl Recordings {
    // Whether `principal` is an admin and `case` a case of the CB; the reading journaled when both hold.
    async fn journaled(
        &self,
        principal: &str,
        case: &str,
        recording: &str,
        action: &'static str,
    ) -> Result<Result<(), &'static str>, String> {
        let (principal, case, recording) = (
            principal.to_string(),
            case.to_string(),
            recording.to_string(),
        );
        self.central
            .transaction(move |db| {
                if !account_roles::holds(db, &principal, account_roles::ADMIN)? {
                    return Ok(Err("cb_admin_required"));
                }
                if get(
                    db,
                    "SELECT 1 AS found FROM moderation_cases WHERE case_id = ? AND kind = 'cb_person'",
                    &[&case],
                )?
                .is_none()
                {
                    return Ok(Err("cb_case_unknown"));
                }
                let listen = uuid::Uuid::new_v4().to_string();
                let recording = (!recording.is_empty()).then_some(recording);
                run(
                    db,
                    "INSERT INTO cb_recording_listens (listen_id, case_id, recording_id, admin_id, action, at_ms)
                     VALUES (?, ?, ?, ?, ?, ?)",
                    &[&listen, &case, &recording, &principal, &action, &now_ms()],
                )?;
                Ok(Ok(()))
            })
            .await
    }

    // The open cases of the CB that hold at least one take, the latest report first, each journaled (`cases`) for
    // `principal`, an admin.
    async fn open_cases(
        &self,
        principal: &str,
    ) -> Result<Result<Vec<OpenCase>, &'static str>, String> {
        let principal = principal.to_string();
        self.central
            .transaction(move |db| {
                if !account_roles::holds(db, &principal, account_roles::ADMIN)? {
                    return Ok(Err("cb_admin_required"));
                }
                let opened = all(
                    db,
                    "SELECT c.case_id, c.target_id, c.reports FROM moderation_cases c
                     WHERE c.status = 'open' AND c.kind = 'cb_person'
                     AND EXISTS (SELECT 1 FROM cb_recording_holds h WHERE h.case_id = c.case_id)",
                    &[],
                )?;
                let mut cases = Vec::new();
                for row in &opened {
                    let (case, target) = (text(row.get("case_id")), text(row.get("target_id")));
                    let holds = all(
                        db,
                        "SELECT room, from_ms, held_ms FROM cb_recording_holds WHERE case_id = ? ORDER BY held_ms",
                        &[&case],
                    )?;
                    let takes = all(
                        db,
                        "SELECT DISTINCT r.recording_id, r.room_kind, r.handle
                         FROM cb_recordings r JOIN cb_recording_holds h ON h.room = r.room
                         WHERE h.case_id = ? AND r.ended_ms >= h.from_ms AND r.started_ms <= h.held_ms",
                        &[&case],
                    )?;
                    if takes.is_empty() {
                        continue;
                    }
                    // The pseudonyms of the person reported, among the case's takes: the account never leaves.
                    let targets = all(
                        db,
                        "SELECT DISTINCT r.handle FROM cb_recordings r
                         JOIN cb_recording_holds h ON h.room = r.room
                         JOIN cb_handles k ON k.handle = r.handle
                         WHERE h.case_id = ? AND r.ended_ms >= h.from_ms AND r.started_ms <= h.held_ms
                         AND k.principal_id = ? ORDER BY r.handle",
                        &[&case, &target],
                    )?;
                    let mut rooms: Vec<String> = Vec::new();
                    for hold in &holds {
                        let room = text(hold.get("room"));
                        if !rooms.contains(&room) {
                            rooms.push(room);
                        }
                    }
                    let voices: BTreeSet<String> =
                        takes.iter().map(|take| text(take.get("handle"))).collect();
                    let call = takes
                        .iter()
                        .all(|take| text(take.get("room_kind")) == "call");
                    let from_ms = holds
                        .iter()
                        .map(|hold| super::number(hold.get("from_ms")))
                        .min()
                        .unwrap_or_default();
                    let reported_ms: Vec<u64> = holds
                        .iter()
                        .map(|hold| super::number(hold.get("held_ms")))
                        .collect();
                    let held_ms = reported_ms.iter().copied().max().unwrap_or_default();
                    let listen = uuid::Uuid::new_v4().to_string();
                    let none: Option<String> = None;
                    run(
                        db,
                        "INSERT INTO cb_recording_listens (listen_id, case_id, recording_id, admin_id, action, at_ms)
                         VALUES (?, ?, ?, ?, 'cases', ?)",
                        &[&listen, &case, &none, &principal, &now_ms()],
                    )?;
                    cases.push(OpenCase {
                        case,
                        kind: if call { "call" } else { "cb" },
                        rooms,
                        from_ms,
                        held_ms,
                        reported_ms,
                        reports: super::number(row.get("reports")),
                        voices: voices.len(),
                        takes: takes.len(),
                        targets: targets
                            .iter()
                            .map(|found| text(found.get("handle")))
                            .collect(),
                    });
                }
                cases.sort_by(|a, b| b.held_ms.cmp(&a.held_ms).then(a.case.cmp(&b.case)));
                Ok(Ok(cases))
            })
            .await
    }

    // A case's journal, newest first, the reading itself journaled (`journal`) before it is read.
    async fn journal_of(&self, message: &JsonValue, user: &str) -> Result<JsonValue, String> {
        let case = text(message.get("case"));
        if let Err(code) = self.journaled(user, &case, "", "journal").await? {
            return Ok(refused(code));
        }
        let (wanted, me) = (case.clone(), user.to_string());
        let rows = self
            .central
            .transaction(move |db| {
                all(
                    db,
                    "SELECT l.action, l.at_ms, l.recording_id, CASE WHEN l.admin_id = ? THEN 1 ELSE 0 END AS mine,
                     r.handle, r.started_ms, r.duration_ms
                     FROM cb_recording_listens l LEFT JOIN cb_recordings r ON r.recording_id = l.recording_id
                     WHERE l.case_id = ? ORDER BY l.at_ms DESC, l.rowid DESC LIMIT ?",
                    &[&me, &wanted, &JOURNAL_ROWS],
                )
            })
            .await?;
        let journal: Vec<JsonValue> = rows
            .iter()
            .map(|row| {
                let mut entry = json!({ "action": text(row.get("action")),
                    "at_ms": super::number(row.get("at_ms")), "by_me": super::number(row.get("mine")) == 1 });
                let (recording, handle) = (text(row.get("recording_id")), text(row.get("handle")));
                if !recording.is_empty() && !handle.is_empty() {
                    entry["recording"] = json!(recording);
                    entry["handle"] = json!(handle);
                    entry["started_ms"] = json!(super::number(row.get("started_ms")));
                    entry["duration_ms"] = json!(super::number(row.get("duration_ms")));
                }
                entry
            })
            .collect();
        Ok(json!({ "ok": true, "case": case, "journal": journal }))
    }

    pub(in crate::social::cb) async fn admin_action(
        &self,
        action: &str,
        message: &JsonValue,
        user: &str,
    ) -> Result<JsonValue, String> {
        if action == "recordings-journal" {
            return self.journal_of(message, user).await;
        }
        let case = text(message.get("case"));
        let recording = if action == "recording-listen" {
            text(message.get("recording"))
        } else {
            String::new()
        };
        // A listening names a take of this case: checked before anything is journaled.
        let takes = self.of_case(&case).await?;
        if action == "recording-listen" && !takes.iter().any(|take| take.recording == recording) {
            let admin = self.journaled(user, &case, "", "refused").await?;
            return Ok(refused(match admin {
                Err(code) => code,
                Ok(()) => "cb_recording_not_in_case",
            }));
        }
        let kind = if action == "recording-listen" {
            "listen"
        } else {
            "list"
        };
        if let Err(code) = self.journaled(user, &case, &recording, kind).await? {
            return Ok(refused(code));
        }
        if action == "recordings-case" {
            let listed: Vec<JsonValue> = takes
                .iter()
                .map(|take| json!({ "recording": take.recording, "handle": take.handle, "room": take.room,
                    "started_ms": take.started_ms, "ended_ms": take.ended_ms, "duration_ms": take.duration_ms }))
                .collect();
            return Ok(json!({ "ok": true, "case": case, "recordings": listed }));
        }
        let take = takes
            .iter()
            .find(|take| take.recording == recording)
            .expect("checked");
        Ok(match self.read(&recording).await? {
            Some(bytes) => {
                json!({ "ok": true, "case": case, "recording": recording, "mime": super::MIME,
                "duration_ms": take.duration_ms, "handle": take.handle,
                "base64": base64::engine::general_purpose::STANDARD.encode(bytes) })
            }
            None => refused("cb_recording_missing"),
        })
    }
}

impl Cb {
    // The number of the channel `room` is, while someone still listens in it (a channel lives in memory only).
    pub(in crate::social::cb) fn channel_of(&self, room: &str) -> Option<u8> {
        self.channels
            .lives(room)
            .first()
            .and_then(|live| self.channels.of(*live))
            .filter(|(of, _)| of == room)
            .map(|(_, number)| number)
    }

    // `recordings-cases`: the open cases that hold takes, their channel's number read from the channels in use, else
    // from the number the report froze (`cb_recording_hold_channels`) once the channel is no longer in use.
    async fn recordings_cases(&self, user: &str) -> Result<JsonValue, String> {
        let listed = match self.recordings.open_cases(user).await? {
            Ok(listed) => listed,
            Err(code) => return Ok(refused(code)),
        };
        let frozen = self.recordings.held_channels().await?;
        let cases: Vec<JsonValue> = listed
            .iter()
            .map(|case| {
                let channel = (case.kind == "cb")
                    .then(|| {
                        case.rooms
                            .iter()
                            .find_map(|room| self.channel_of(room))
                            .or_else(|| {
                                case.rooms.iter().find_map(|room| {
                                    frozen.get(&(case.case.clone(), room.clone())).copied()
                                })
                            })
                    })
                    .flatten();
                json!({ "case": case.case, "kind": case.kind, "channel": channel, "from_ms": case.from_ms,
                    "held_ms": case.held_ms, "reported_ms": case.reported_ms, "reports": case.reports,
                    "voices": case.voices, "takes": case.takes, "targets": case.targets })
            })
            .collect();
        Ok(json!({ "ok": true, "cases": cases }))
    }

    /// An admin's frame (`recordings-cases`, `recordings-case`, `recording-listen`, `recordings-journal`).
    pub(in crate::social::cb) async fn recordings_admin(
        &self,
        action: &str,
        message: &JsonValue,
        user: &str,
    ) -> Result<JsonValue, String> {
        if action == "recordings-cases" {
            return self.recordings_cases(user).await;
        }
        self.recordings.admin_action(action, message, user).await
    }

    /// The takes' limits (`cb.recordings_keep_days`, `cb.recordings_freeze_minutes`), read by main.rs from the settings.
    pub fn set_recording_limits(&self, limits: super::Limits) {
        self.recordings.set_limits(limits);
    }

    /// The daily purge of the takes past their 21 days and held by no open case (main.rs).
    pub async fn purge_recordings(&self) -> Result<super::Purged, String> {
        self.recordings.purge_now().await
    }
}
