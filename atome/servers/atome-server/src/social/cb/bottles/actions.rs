// The bottles' `cb` actions (bottles/mod.rs), each on the connection's zone (zone-set).
use super::super::zones::{Range, WORLD, Zone};
use super::super::{BOTTLE_CONTEXT, Cb, country, handles, refused};
use super::media::Media;
use super::purge::named_files;
use super::{
    AT_SEA, BottleVideo, DAY_MS, LIFE_MS, Seeker, Written, admit, catch_for, decide, mine, now_ms,
    number, open, purge, read_thread, reply_in, sea_for, withdraw,
};
use crate::social::message_guard::TEXT_MAX;
use crate::social::news::db::{get, run, text};
use serde_json::{Value as JsonValue, json};

impl Cb {
    /// Whether `principal` may launch and catch a video bottle under the switch.
    pub async fn video_allowed(&self, principal: &str) -> Result<bool, String> {
        let mode = *self.video.lock().expect("cb video");
        match mode {
            BottleVideo::Off => Ok(false),
            BottleVideo::All => Ok(true),
            BottleVideo::Testers => {
                let principal = principal.to_string();
                self.central
                    .transaction(move |db| {
                        crate::ws_api::sources::account_roles::holds(
                            db,
                            &principal,
                            crate::ws_api::sources::account_roles::TESTER,
                        )
                    })
                    .await
            }
        }
    }

    /// The switch, as the server's settings set it (main.rs).
    pub fn set_bottle_video(&self, mode: BottleVideo) {
        *self.video.lock().expect("cb video") = mode;
    }

    fn zone_for(&self, live: u64, principal: &str) -> Result<Zone, JsonValue> {
        self.zone_of(live, principal)
            .ok_or_else(|| refused("cb_zone_required"))
    }

    // What a message carries of its author (lot L2b): their application's language and their refusal of translation.
    fn written(message: &JsonValue) -> Written {
        Written {
            lang: country::language(message.get("lang")),
            no_translate: message.get("no_translate") == Some(&json!(true)),
        }
    }

    // `bottle-launch`: a text, and a voice, an image or a video, left blind in the zone set.
    pub(in crate::social::cb) async fn launch(
        &self,
        message: &JsonValue,
        sender: &str,
        live: u64,
    ) -> Result<JsonValue, String> {
        let zone = match self.zone_for(live, sender) {
            Ok(zone) => zone,
            Err(refusal) => return Ok(refusal),
        };
        // « Vers un pays… » (lot L2b): a bottle thrown to a country is left in the world and caught only by someone whose
        // device is in that country; the thrower needs no location of their own.
        let target = match country::parse(message.get("target_country")) {
            Ok(target) => target,
            Err(error) => return Ok(refused(error)),
        };
        let zone = if target.is_some() {
            Zone::parse(Range::World, WORLD).expect("world")
        } else {
            zone
        };
        let written = Self::written(message);
        let body = message
            .get("text")
            .and_then(JsonValue::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        if body.encode_utf16().count() > TEXT_MAX {
            return Ok(refused("cb_bottle_text_too_long"));
        }
        let media = message.get("media").filter(|media| media.is_object());
        let kind = media.map(|media| Media::parse(&text(media.get("kind"))));
        let media_kind = match kind {
            None => None,
            Some(None) => return Ok(refused("cb_bottle_media_invalid")),
            Some(Some(kind)) => Some(kind),
        };
        if body.is_empty() && media_kind.is_none() {
            return Ok(refused("cb_bottle_empty"));
        }
        if media_kind == Some(Media::Video) && !self.video_allowed(sender).await? {
            return Ok(refused("bottle_video_disabled"));
        }
        let now = now_ms();
        let me = sender.to_string();
        let admitted = self
            .central
            .transaction(move |db| admit(db, &me, now))
            .await?;
        if let Err(error) = admitted {
            return Ok(refused(error));
        }
        let bottle = format!("cbb_{}", uuid::Uuid::new_v4().simple());
        let copies = match media_kind {
            None => None,
            Some(kind) => {
                let atome_id = text(media.and_then(|media| media.get("atome_id")));
                if atome_id.is_empty() {
                    return Ok(refused("cb_bottle_media_missing"));
                }
                match self.media_copies(sender, kind, &atome_id, &bottle).await {
                    Ok(Ok(copies)) => Some(copies),
                    Ok(Err(error)) => return Ok(refused(error)),
                    Err(error) => {
                        eprintln!("[cb] bottle media not cleaned {error}");
                        self.erase(vec![format!("{bottle}.mp4"), format!("{bottle}_thumb.jpg")])
                            .await;
                        return Ok(refused("cb_bottle_media_unreadable"));
                    }
                }
            }
        };
        let kind = media_kind.map_or("text", Media::name);
        let (me, id, cell) = (sender.to_string(), bottle.clone(), zone.cell().to_string());
        let range = zone.range().name();
        let (file, mime, thumb, duration) = copies.as_ref().map_or((None, None, None, None), |c| {
            (
                Some(c.file.clone()),
                Some(c.mime.clone()),
                c.thumb.clone(),
                c.duration_ms,
            )
        });
        let written = self
            .central
            .transaction(move |db| {
                admit(db, &me, now)?.map_err(str::to_string)?;
                let handle = handles::issue(db, &format!("{BOTTLE_CONTEXT}{id}"), &me)?;
                run(
                    db,
                    "INSERT INTO cb_bottles (bottle_id, sender_id, sender_handle, zone_range, zone_cell, kind, body,
                     media_file, media_mime, thumb_file, duration_ms, state, created_ms, expires_ms, updated_ms,
                     lang, no_translate, target_country)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'at_sea', ?, ?, ?, ?, ?, ?)",
                    &[
                        &id,
                        &me,
                        &handle,
                        &range,
                        &cell,
                        &kind,
                        &body,
                        &file,
                        &mime,
                        &thumb,
                        &duration,
                        &now,
                        &(now + LIFE_MS),
                        &now,
                        &written.lang,
                        &(written.no_translate as i64),
                        &target,
                    ],
                )
            })
            .await;
        match written {
            Ok(_) => {
                Ok(json!({ "ok": true, "bottle": { "id": bottle, "kind": kind, "state": AT_SEA } }))
            }
            Err(error) => {
                if let Some(copies) = copies {
                    self.erase(
                        [Some(copies.file), copies.thumb]
                            .into_iter()
                            .flatten()
                            .collect(),
                    )
                    .await;
                }
                if !error.starts_with("cb_") {
                    eprintln!("[cb] bottle not written {error}");
                }
                Ok(refused(if error.starts_with("cb_") {
                    &error
                } else {
                    "cb_bottle_write_failed"
                }))
            }
        }
    }

    // `bottle-catch`: one bottle reserved at random among those the zone reaches, and those thrown to the country the
    // device computed for this catch (`country`, lot L2c). That country is compared, then forgotten with this call: never
    // written, never logged (a refusal names only its error), never given back. Without it, no bottle thrown to a country.
    pub(in crate::social::cb) async fn catch_bottle(
        &self,
        message: &JsonValue,
        principal: &str,
        live: u64,
    ) -> Result<JsonValue, String> {
        let zone = match self.zone_for(live, principal) {
            Ok(zone) => zone,
            Err(refusal) => return Ok(refusal),
        };
        let country = match country::parse(message.get("country")) {
            Ok(country) => country,
            Err(error) => return Ok(refused(error)),
        };
        let video = self.video_allowed(principal).await?;
        let me = principal.to_string();
        let mut caught = self
            .central
            .transaction(move |db| {
                let seeker = Seeker {
                    zone: &zone,
                    video,
                    country: country.as_deref(),
                };
                catch_for(db, &me, &seeker, now_ms())
            })
            .await?;
        // A video's thumbnail shows on its plate before it is opened.
        if caught["bottle"]["thumb"] == json!(true) {
            let id = text(caught["bottle"].get("id"));
            let thumb = self
                .central
                .transaction(move |db| {
                    get(
                        db,
                        "SELECT thumb_file FROM cb_bottles WHERE bottle_id = ?",
                        &[&id],
                    )
                })
                .await?
                .map(|row| text(row.get("thumb_file")))
                .unwrap_or_default();
            caught["bottle"]["thumb"] = json!(self.grant(&thumb, "image/jpeg"));
        } else if caught["bottle"].is_object() {
            caught["bottle"]["thumb"] = JsonValue::Null;
        }
        Ok(caught)
    }

    // `bottle-sea`: whether bottles approach, a few at most (those of the zone; never one thrown to a country).
    pub(in crate::social::cb) async fn sea_of(
        &self,
        principal: &str,
        live: u64,
    ) -> Result<JsonValue, String> {
        let zone = match self.zone_for(live, principal) {
            Ok(zone) => zone,
            Err(refusal) => return Ok(refusal),
        };
        let video = self.video_allowed(principal).await?;
        let me = principal.to_string();
        // The sea knows no country (lot L2c): a bottle thrown to a country is found by a catch only.
        let count = self
            .central
            .transaction(move |db| sea_for(db, &me, &Seeker::of(&zone, video)))
            .await?;
        Ok(json!({ "ok": true, "approaching": count }))
    }

    // `bottle-open`: the content, only within a reservation still running and one's own.
    pub(in crate::social::cb) async fn open_bottle(
        &self,
        message: &JsonValue,
        principal: &str,
    ) -> Result<JsonValue, String> {
        let (me, id) = (principal.to_string(), text(message.get("id")));
        let now = now_ms();
        let Some(row) = self
            .central
            .transaction(move |db| open(db, &me, &id, now))
            .await?
        else {
            return Ok(refused("cb_bottle_escaped"));
        };
        let media_file = text(row.get("media_file"));
        let media = (!media_file.is_empty()).then(|| {
            json!({ "url": self.grant(&media_file, &text(row.get("media_mime"))),
                "mime": text(row.get("media_mime")), "duration_ms": row.get("duration_ms").cloned().unwrap_or(JsonValue::Null) })
        });
        let days = (now - number(&row, "created_ms")).max(0) / DAY_MS;
        Ok(
            json!({ "ok": true, "bottle": { "id": text(row.get("bottle_id")), "kind": text(row.get("kind")),
            "text": text(row.get("body")), "media": media, "range": text(row.get("zone_range")),
            "days": days, "handle": text(row.get("sender_handle")),
            // Its author's language and refusal of translation (lot L2b); never where it was thrown from or to.
            "lang": text(row.get("lang")), "no_translate": number(&row, "no_translate") == 1 } }),
        )
    }

    pub(in crate::social::cb) async fn decide_bottle(
        &self,
        message: &JsonValue,
        principal: &str,
    ) -> Result<JsonValue, String> {
        let (me, id) = (principal.to_string(), text(message.get("id")));
        let decision = text(message.get("decision"));
        self.central
            .transaction(move |db| decide(db, &me, &id, &decision, now_ms()))
            .await
    }

    // `bottle-reply`: a message in the bottle's anonymous thread; the other side told, never named.
    pub(in crate::social::cb) async fn reply_bottle(
        &self,
        message: &JsonValue,
        principal: &str,
    ) -> Result<JsonValue, String> {
        if !self.replies.allowed(principal) {
            return Ok(refused("cb_rate_limited"));
        }
        let body = message
            .get("text")
            .and_then(JsonValue::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        if body.is_empty() {
            return Ok(refused("cb_bottle_reply_empty"));
        }
        if body.encode_utf16().count() > TEXT_MAX {
            return Ok(refused("cb_bottle_text_too_long"));
        }
        let (me, id, thread) = (
            principal.to_string(),
            text(message.get("id")),
            text(message.get("thread")),
        );
        let now = now_ms();
        let bottle = id.clone();
        let author = Self::written(message);
        let written = self
            .central
            .transaction(move |db| reply_in(db, &me, &id, &thread, &body, &author, now))
            .await?;
        let (thread, target, to_sender) = match written {
            Ok(written) => written,
            Err(error) => return Ok(refused(error)),
        };
        live_thread(&target, &bottle, &thread).await;
        if to_sender {
            let notification = json!({ "kind": "cb-bottle-reply", "subject": "Une réponse à votre bouteille",
                "message": "", "id": format!("cb_bottle_reply_{thread}_{now}"), "extra": { "bottle_id": bottle, "thread_id": thread } });
            if let Err(error) = self.notifier.notify(&target, None, &notification).await {
                eprintln!("[cb] bottle reply notice not stacked {error}");
            }
        }
        Ok(json!({ "ok": true, "thread": thread }))
    }

    pub(in crate::social::cb) async fn thread_bottle(
        &self,
        message: &JsonValue,
        principal: &str,
    ) -> Result<JsonValue, String> {
        let (me, id, thread) = (
            principal.to_string(),
            text(message.get("id")),
            text(message.get("thread")),
        );
        Ok(self
            .central
            .transaction(move |db| read_thread(db, &me, &id, &thread, now_ms()))
            .await?
            .unwrap_or_else(|| refused("cb_bottle_thread_unavailable")))
    }

    pub(in crate::social::cb) async fn bottles_mine(
        &self,
        principal: &str,
    ) -> Result<JsonValue, String> {
        let me = principal.to_string();
        self.central
            .transaction(move |db| mine(db, &me, now_ms()))
            .await
    }

    pub(in crate::social::cb) async fn withdraw_bottle(
        &self,
        message: &JsonValue,
        principal: &str,
    ) -> Result<JsonValue, String> {
        let (me, id) = (principal.to_string(), text(message.get("id")));
        let files = self
            .central
            .transaction(move |db| {
                let files = withdraw(db, &me, &id, now_ms())?;
                let state = get(
                    db,
                    "SELECT state FROM cb_bottles WHERE bottle_id = ? AND sender_id = ?",
                    &[&id, &me],
                )?
                .map(|row| text(row.get("state")));
                Ok((files, state))
            })
            .await?;
        if files.1.as_deref() != Some("withdrawn") {
            return Ok(refused("cb_bottle_not_at_sea"));
        }
        self.erase(files.0).await;
        Ok(json!({ "ok": true, "state": "withdrawn" }))
    }

    /// The daily purge (main.rs): expired bottles, their copies, and copies no bottle names.
    pub async fn purge_bottles(&self) -> Result<usize, String> {
        let (files, named) = self
            .central
            .transaction(|db| Ok((purge(db, now_ms())?, named_files(db)?)))
            .await?;
        let mut erased = files.len();
        self.erase(files).await;
        if let Ok(mut entries) = tokio::fs::read_dir(&self.media_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().into_owned();
                if !named.contains(&name) {
                    let _ = tokio::fs::remove_file(entry.path()).await;
                    erased += 1;
                }
            }
        }
        Ok(erased)
    }
}

// The other side's open screens read the thread again.
async fn live_thread(target: &str, bottle: &str, thread: &str) {
    crate::social::live::tell(
        target,
        &json!({ "type": "cb-bottle-thread", "bottle": bottle, "thread": thread }),
    )
    .await;
}
