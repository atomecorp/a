// The live translation's `cb` frames (lot TR): `tr-subscribe` (a member of a room asks for its voices in their language,
// Text or Voice; Aucune subscribes to nothing), `tr-unsubscribe`, and the temporary servers' test door `tr-probe`, which
// stands for the CB's channels (L3) and the Appel (L5) until they exist: it opens a room, joins it under a pseudonym and
// feeds it synthetic voice. Refused (`cb_action_invalid`) unless the server was started with `ATOME_CB_TR_PROBE=1`.
use super::{Mode, RoomKind, segments};
use crate::social::cb::{Cb, country};
use crate::social::news::db::text;
use base64::Engine;
use serde_json::{Value as JsonValue, json};

// A fed piece: a CB take at most (45 s of 24 kHz 16-bit PCM).
const FEED_MAX_BYTES: usize = segments::TAKE_MAX_MS * segments::SAMPLE_RATE / 1000 * 2;

fn refused(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

fn pcm_of(message: &JsonValue) -> Result<Vec<i16>, &'static str> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(text(message.get("pcm")))
        .map_err(|_| "cb_tr_audio_invalid")?;
    if bytes.is_empty() || bytes.len() > FEED_MAX_BYTES || bytes.len() % 2 != 0 {
        return Err("cb_tr_audio_invalid");
    }
    Ok(bytes
        .chunks_exact(2)
        .map(|pair| i16::from_le_bytes([pair[0], pair[1]]))
        .collect())
}

impl Cb {
    /// `tr-subscribe`, `tr-unsubscribe`, `tr-probe` for `user` on connection `live`.
    pub(in crate::social::cb) async fn live_translate(
        &self,
        action: &str,
        message: &JsonValue,
        user: &str,
        live: u64,
    ) -> Result<JsonValue, String> {
        let room = text(message.get("room"));
        Ok(match action {
            "tr-subscribe" => {
                let mode = match text(message.get("mode")).as_str() {
                    "" | "text" => Some(Mode::Text),
                    "voice" => Some(Mode::Voice),
                    "none" => None,
                    _ => return Ok(refused("cb_tr_mode_invalid")),
                };
                let lang = country::language(message.get("lang"));
                match self.live.subscribe(user, live, &room, &lang, mode) {
                    Ok(Some(id)) => json!({ "ok": true, "subscription": id, "lang": lang,
                        "mode": if mode == Some(Mode::Voice) { "voice" } else { "text" } }),
                    Ok(None) => json!({ "ok": true, "subscription": "", "mode": "none" }),
                    Err(code) => refused(code),
                }
            }
            "tr-unsubscribe" => {
                let ended = self
                    .live
                    .unsubscribe(user, &text(message.get("subscription")));
                json!({ "ok": true, "ended": ended })
            }
            "tr-probe" if self.live.probe_enabled() => {
                self.probe(message, user, live, &room).await?
            }
            _ => refused("cb_action_invalid"),
        })
    }

    // The test door: `room` (open one), `join` (under a new pseudonym), `feed` (voice as it arrives, `end` closing the
    // turn) and `segment` (one whole piece). The pieces are translated after the answer, as L3, L4 and L5 will feed them.
    async fn probe(
        &self,
        message: &JsonValue,
        user: &str,
        live: u64,
        room: &str,
    ) -> Result<JsonValue, String> {
        let speaker = || self.live.handle_of(room, user).ok_or("cb_tr_not_member");
        Ok(match text(message.get("op")).as_str() {
            "room" => {
                let kind = if text(message.get("kind")) == "call" {
                    RoomKind::Call
                } else {
                    RoomKind::Cb
                };
                json!({ "ok": true, "room": self.live.open_room(kind) })
            }
            "join" => {
                let handle = self.issue_handle(&format!("cb_tr:{room}"), user).await?;
                let lang = country::language(message.get("lang"));
                let no_translate = message.get("no_translate") == Some(&json!(true));
                match self
                    .live
                    .join(room, user, live, &handle, &lang, no_translate)
                {
                    Ok(()) => json!({ "ok": true, "handle": handle }),
                    Err(code) => refused(code),
                }
            }
            "feed" | "segment" => {
                let handle = match speaker() {
                    Ok(handle) => handle,
                    Err(code) => return Ok(refused(code)),
                };
                let pcm = match pcm_of(message) {
                    Ok(pcm) => pcm,
                    Err(code) => return Ok(refused(code)),
                };
                let whole = text(message.get("op")) == "segment";
                let end = message.get("end") == Some(&json!(true));
                let (engine, room) = (self.live.clone(), room.to_string());
                tokio::spawn(async move {
                    if whole {
                        engine.segment(&room, &handle, super::Audio::Pcm(pcm)).await;
                        return;
                    }
                    engine.push_pcm(&room, &handle, &pcm).await;
                    if end {
                        engine.flush(&room, &handle).await;
                    }
                });
                json!({ "ok": true, "queued": true })
            }
            _ => refused("cb_tr_probe_invalid"),
        })
    }
}
