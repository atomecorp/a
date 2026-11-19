// The anonymous threads of a bottle (bottles/mod.rs): its sender and the one who caught and
// answered it, each under a pseudonym proper to that bottle (handles.rs), stored here, never as a
// direct message; and what a person reads of their own bottles.
use super::super::{BOTTLE_CONTEXT, handles};
use super::{AT_SEA, DAY_MS, EXCERPT, number};
use crate::social::news::db::{all, get, run, text};
use crate::social::relations;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};

/// Who `me` is in a bottle's thread: its sender, or the one who caught and answered it.
enum Side {
    Sender,
    Replier,
}

/// The thread of `bottle` with `me`, created for its catcher's first reply; `(thread, side)`.
fn thread_of(
    db: &Connection,
    me: &str,
    bottle: &str,
    thread: &str,
    create: bool,
    now: i64,
) -> Result<Option<(String, Side)>, String> {
    let Some(row) = get(
        db,
        "SELECT sender_id, holder_id, state FROM cb_bottles WHERE bottle_id = ?",
        &[&bottle],
    )?
    else {
        return Ok(None);
    };
    if text(row.get("sender_id")) == me {
        // Opened from Mes bouteilles › Fil without naming one: the bottle's first thread.
        let found = if thread.is_empty() {
            get(
                db,
                "SELECT thread_id FROM cb_bottle_threads WHERE bottle_id = ? ORDER BY created_ms, rowid LIMIT 1",
                &[&bottle],
            )?
        } else {
            get(
                db,
                "SELECT thread_id FROM cb_bottle_threads WHERE thread_id = ? AND bottle_id = ?",
                &[&thread, &bottle],
            )?
        };
        return Ok(found.map(|found| (text(found.get("thread_id")), Side::Sender)));
    }
    if let Some(found) = get(
        db,
        "SELECT thread_id FROM cb_bottle_threads WHERE bottle_id = ? AND replier_id = ?",
        &[&bottle, &me],
    )? {
        return Ok(Some((text(found.get("thread_id")), Side::Replier)));
    }
    let holds = text(row.get("holder_id")) == me
        && ["opened", "kept"].contains(&text(row.get("state")).as_str());
    if !create || !holds {
        return Ok(None);
    }
    let id = format!("cbt_{}", uuid::Uuid::new_v4().simple());
    let handle = handles::issue(db, &format!("{BOTTLE_CONTEXT}{bottle}"), me)?;
    run(
        db,
        "INSERT INTO cb_bottle_threads (thread_id, bottle_id, replier_id, replier_handle, created_ms) VALUES (?, ?, ?, ?, ?)",
        &[&id, &bottle, &me, &handle, &now],
    )?;
    run(
        db,
        "UPDATE cb_bottles SET state = 'replied', updated_ms = ? WHERE bottle_id = ?",
        &[&now, &bottle],
    )?;
    Ok(Some((id, Side::Replier)))
}

/// One message of `me` in a bottle's thread; the person to tell, and whether they sent the bottle.
pub fn reply(
    db: &Connection,
    me: &str,
    bottle: &str,
    thread: &str,
    body: &str,
    now: i64,
) -> Result<Result<(String, String, bool), &'static str>, String> {
    reply_in(db, me, bottle, thread, body, &Written::default(), now)
}

/// What travels with each message (lot L2b): its author's application language, and whether its author refuses that
/// it be translated (`no_translate`, applied by the translation action itself, providers/translate.rs).
#[derive(Clone, Debug, Default)]
pub struct Written {
    pub lang: String,
    pub no_translate: bool,
}

/// `reply` with its author's language and refusal.
pub fn reply_in(
    db: &Connection,
    me: &str,
    bottle: &str,
    thread: &str,
    body: &str,
    written: &Written,
    now: i64,
) -> Result<Result<(String, String, bool), &'static str>, String> {
    let Some((thread, side)) = thread_of(db, me, bottle, thread, true, now)? else {
        return Ok(Err("cb_bottle_thread_unavailable"));
    };
    let peers = get(
        db,
        "SELECT b.sender_id, t.replier_id FROM cb_bottle_threads t JOIN cb_bottles b ON b.bottle_id = t.bottle_id WHERE t.thread_id = ?",
        &[&thread],
    )?
    .ok_or("cb_bottle_thread_missing")?;
    let (sender, replier) = (text(peers.get("sender_id")), text(peers.get("replier_id")));
    if relations::blocked_either_way(db, &sender, &replier)? {
        return Ok(Err("cb_bottle_thread_unavailable"));
    }
    let from_sender = matches!(side, Side::Sender);
    run(
        db,
        "INSERT INTO cb_bottle_messages (message_id, thread_id, from_sender, body, created_ms, lang, no_translate)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        &[
            &format!("cbm_{}", uuid::Uuid::new_v4().simple()),
            &thread,
            &(from_sender as i64),
            &body,
            &now,
            &written.lang,
            &(written.no_translate as i64),
        ],
    )?;
    let target = if from_sender { replier } else { sender };
    Ok(Ok((thread, target, !from_sender)))
}

// The bottle a thread starts with, as both sides read it: its words (a media named by its kind), the
// reach it was left in, its age in days, its author's language and refusal of translation; never its sender, its
// cell, its distance, the country it was thrown to or the one it was caught in.
fn bottle_head(db: &Connection, bottle: &str, now: i64) -> Result<JsonValue, String> {
    let row = get(
        db,
        "SELECT kind, body, zone_range, created_ms, duration_ms, lang, no_translate FROM cb_bottles WHERE bottle_id = ?",
        &[&bottle],
    )?
    .ok_or("cb_bottle_thread_missing")?;
    Ok(
        json!({ "id": bottle, "kind": text(row.get("kind")), "text": text(row.get("body")),
        "range": text(row.get("zone_range")), "at": number(&row, "created_ms"),
        "days": (now - number(&row, "created_ms")).max(0) / DAY_MS,
        "duration_ms": row.get("duration_ms").cloned().unwrap_or(JsonValue::Null),
        "lang": text(row.get("lang")), "no_translate": number(&row, "no_translate") == 1 }),
    )
}

/// A thread as `me` reads it at `now`: which side `me` is, the bottle it starts with, the other
/// side's handle, each message (`mine`, its text, its date). A bottle opened or kept and not
/// answered yet reads as a thread without messages, its first reply opening it.
pub fn read_thread(
    db: &Connection,
    me: &str,
    bottle: &str,
    thread: &str,
    now: i64,
) -> Result<Option<JsonValue>, String> {
    let Some((thread, side)) = thread_of(db, me, bottle, thread, false, 0)? else {
        let kept = get(
            db,
            "SELECT sender_handle FROM cb_bottles WHERE bottle_id = ? AND holder_id = ?
             AND (state = 'kept' OR (state = 'opened' AND reserved_until > ?))",
            &[&bottle, &me, &now],
        )?;
        return match kept {
            Some(kept) => Ok(Some(json!({ "ok": true, "thread": "", "side": "replier",
                "bottle": bottle_head(db, bottle, now)?, "peer": text(kept.get("sender_handle")), "messages": [] }))),
            None => Ok(None),
        };
    };
    let row = get(
        db,
        "SELECT b.sender_handle, t.replier_handle FROM cb_bottle_threads t JOIN cb_bottles b ON b.bottle_id = t.bottle_id WHERE t.thread_id = ?",
        &[&thread],
    )?
    .ok_or("cb_bottle_thread_missing")?;
    let mine_from_sender = matches!(side, Side::Sender);
    let peer = text(row.get(if mine_from_sender {
        "replier_handle"
    } else {
        "sender_handle"
    }));
    let messages: Vec<JsonValue> = all(
        db,
        "SELECT message_id, from_sender, body, created_ms, lang, no_translate FROM cb_bottle_messages WHERE thread_id = ?
         ORDER BY created_ms, rowid",
        &[&thread],
    )?
    .into_iter()
    .map(|message| {
        json!({ "id": text(message.get("message_id")), "mine": (number(&message, "from_sender") == 1) == mine_from_sender,
            "text": text(message.get("body")), "at": number(&message, "created_ms"),
            "lang": text(message.get("lang")), "no_translate": number(&message, "no_translate") == 1 })
    })
    .collect();
    let mut read = json!({ "ok": true, "thread": thread,
        "side": if mine_from_sender { "sender" } else { "replier" },
        "bottle": bottle_head(db, bottle, now)?, "peer": peer, "messages": messages });
    // Its sender alone reads the country they chose to throw it to (« Vers : Japon », lot L2c); its catcher never.
    if mine_from_sender {
        let to = get(
            db,
            "SELECT target_country FROM cb_bottles WHERE bottle_id = ?",
            &[&bottle],
        )?
        .map(|row| text(row.get("target_country")))
        .filter(|to| !to.is_empty());
        if let Some(to) = to {
            read["to"] = json!(to);
        }
    }
    Ok(Some(read))
}

// A text's first words, for a list.
fn excerpt(body: &str) -> String {
    let words: String = body.chars().take(EXCERPT).collect();
    if body.chars().count() > EXCERPT {
        format!("{}…", words.trim_end())
    } else {
        words
    }
}

/// `me`'s bottles at `now` (Mes bouteilles): those launched, newest first (their state, the days
/// left at sea, the replies received and their threads), then those kept (their age, a voice's
/// length, the thread `me` opened by answering, if any). A bottle hidden by reports is not listed.
pub fn mine(db: &Connection, me: &str, now: i64) -> Result<JsonValue, String> {
    // A reservation run out (a bottle opened and left undecided included) reads as back at sea.
    super::release_expired(db, now)?;
    let launched: Vec<JsonValue> = all(
        db,
        "SELECT bottle_id, kind, body, state, created_ms, expires_ms, duration_ms FROM cb_bottles
         WHERE sender_id = ? AND state NOT IN ('withdrawn', 'hidden') ORDER BY created_ms DESC",
        &[&me],
    )?
    .into_iter()
    .map(|row| {
        let id = text(row.get("bottle_id"));
        let threads = all(
            db,
            "SELECT t.thread_id, t.replier_handle, (SELECT COUNT(*) FROM cb_bottle_messages m WHERE m.thread_id = t.thread_id AND m.from_sender = 0) AS replies
             FROM cb_bottle_threads t WHERE t.bottle_id = ? ORDER BY t.created_ms",
            &[&id],
        )
        .unwrap_or_default()
        .into_iter()
        .map(|thread| json!({ "thread": text(thread.get("thread_id")), "peer": text(thread.get("replier_handle")),
            "replies": number(&thread, "replies") }))
        .collect::<Vec<_>>();
        let state = text(row.get("state"));
        let days_left = if state == AT_SEA {
            ((number(&row, "expires_ms") - now).max(0) + DAY_MS - 1) / DAY_MS
        } else {
            0
        };
        let replies: i64 = threads.iter().map(|thread| number(thread, "replies")).sum();
        json!({ "id": id, "kind": text(row.get("kind")), "excerpt": excerpt(&text(row.get("body"))),
            "state": state, "at": number(&row, "created_ms"), "days_left": days_left, "replies": replies,
            "duration_ms": row.get("duration_ms").cloned().unwrap_or(JsonValue::Null), "threads": threads })
    })
    .collect();
    let kept: Vec<JsonValue> = all(
        db,
        "SELECT b.bottle_id, b.kind, b.body, b.created_ms, b.duration_ms,
         (SELECT t.thread_id FROM cb_bottle_threads t WHERE t.bottle_id = b.bottle_id AND t.replier_id = ?) AS thread_id
         FROM cb_bottles b WHERE b.holder_id = ? AND b.state IN ('kept', 'replied') ORDER BY b.updated_ms DESC",
        &[&me, &me],
    )?
    .into_iter()
    .map(|row| json!({ "id": text(row.get("bottle_id")), "kind": text(row.get("kind")),
        "excerpt": excerpt(&text(row.get("body"))), "at": number(&row, "created_ms"),
        "days": (now - number(&row, "created_ms")).max(0) / DAY_MS,
        "duration_ms": row.get("duration_ms").cloned().unwrap_or(JsonValue::Null),
        "thread": text(row.get("thread_id")) }))
    .collect();
    Ok(json!({ "ok": true, "launched": launched, "kept": kept }))
}

/// What the translation action may read for `me` (providers/translate.rs, lot L2b): the words of a bottle or of a
/// thread's message found here by its id — never a text a client sends of someone else's —, their language, a voice's
/// or a video's clean copy to transcribe, and whether their author refused translation. Only a side of it reads it:
/// the bottle's sender, the one who holds it opened (or kept, or answered it), a replier of its threads; never across
/// a block, never a bottle hidden by reports. `Err` is the refusal's code.
#[derive(Clone, Debug)]
pub struct Translatable {
    pub text: String,
    pub lang: String,
    pub kind: String,
    pub media_file: String,
    pub media_mime: String,
}

pub fn translatable(
    db: &Connection,
    me: &str,
    source: &str,
    id: &str,
) -> Result<Result<Translatable, &'static str>, String> {
    let unavailable = Ok(Err("provider_translation_unavailable"));
    let row = match source {
        "bottle" => get(
            db,
            "SELECT b.body, b.lang, b.no_translate, b.kind, b.media_file, b.media_mime, b.sender_id AS sender, b.state,
             CASE WHEN b.sender_id = ? THEN b.sender_id
                  WHEN b.holder_id = ? AND b.state IN ('opened', 'kept', 'replied') THEN b.holder_id
                  ELSE (SELECT t.replier_id FROM cb_bottle_threads t WHERE t.bottle_id = b.bottle_id AND t.replier_id = ?) END AS side
             FROM cb_bottles b WHERE b.bottle_id = ?",
            &[&me, &me, &me, &id],
        )?,
        "message" => get(
            db,
            "SELECT m.body, m.lang, m.no_translate, 'text' AS kind, '' AS media_file, '' AS media_mime, b.sender_id AS sender,
             b.state, CASE WHEN b.sender_id = ? OR t.replier_id = ? THEN ? END AS side, t.replier_id AS replier
             FROM cb_bottle_messages m JOIN cb_bottle_threads t ON t.thread_id = m.thread_id
             JOIN cb_bottles b ON b.bottle_id = t.bottle_id WHERE m.message_id = ?",
            &[&me, &me, &me, &id],
        )?,
        _ => return Ok(Err("provider_parameter_invalid")),
    };
    let Some(row) = row else {
        return unavailable;
    };
    if text(row.get("side")) != me || text(row.get("state")) == "hidden" {
        return unavailable;
    }
    let sender = text(row.get("sender"));
    let other = if sender == me {
        text(row.get("replier"))
    } else {
        sender
    };
    if !other.is_empty() && other != me && relations::blocked_either_way(db, me, &other)? {
        return unavailable;
    }
    // The author's refusal travels with the message and is applied here, before any provider is asked.
    if number(&row, "no_translate") == 1 {
        return Ok(Err("provider_translation_refused"));
    }
    Ok(Ok(Translatable {
        text: text(row.get("body")),
        lang: text(row.get("lang")),
        kind: text(row.get("kind")),
        media_file: text(row.get("media_file")),
        media_mime: text(row.get("media_mime")),
    }))
}
