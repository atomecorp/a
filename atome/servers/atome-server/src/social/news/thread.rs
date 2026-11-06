// VideoTrain on the News (server/news_thread.js, ported): a thread's origin is a News publication
// sent to chosen people (audience `{ group }`) with a `thread_ref` (the exercise,
// atome/src/shared/video_train_contract.js); a reply carries its `parent_id`, its origin
// (`root_id`), the moment of the parent it answers (`anchor_ms`) and the audience `{ thread }`.
// A thread is read by its origin's author and the people it was sent to, never across a block;
// a contribution is hidden from one blocking or blocked by its author, or who reported it. One
// vote per voter and contribution, never on one's own. A withdrawn contribution keeps its row,
// its words and media gone. Its author closes or opens its replies, takes its media into their
// own (another reader only when allowed at the send) and sends it again (`forward_source`); the
// thread's owner keeps or withdraws what was reported in it.
use super::db::{all, get, parsed, run, text};
use crate::social::relations::blocked_either_way;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::{HashMap, HashSet};

mod actions;
use actions::reported_rows;
pub use actions::{
    dismiss, forward_source, import_source, report, reported, retire, set_replies, vote,
};

pub const ANCHOR_MAX_MS: f64 = 24.0 * 3600.0 * 1000.0;
const REPORT_REASON_MAX: usize = 300;
pub const IMPORT_PROPERTY: &str = "video_train_import";

/// What a contribution needs before it is stored: its thread, origin, parent and anchor.
pub struct Context {
    pub thread_ref: String,
    pub root: Option<String>,
    pub parent: Option<String>,
    pub anchor: Option<i64>,
}

fn fail<T>(code: &str) -> Result<T, String> {
    Err(code.into())
}

/// `isVideoTrainThreadRef`: `training:` and 1 to 80 of `[a-z0-9_]`.
pub fn is_thread_ref(value: &str) -> bool {
    value.strip_prefix("training:").is_some_and(|rest| {
        (1..=80).contains(&rest.len())
            && rest
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    })
}

fn has(member: &JsonValue, key: &str) -> bool {
    js::truthy(member.get("properties").and_then(|props| props.get(key)))
}

fn members_of(props: &JsonValue) -> Vec<JsonValue> {
    match props
        .get("news_payload")
        .and_then(|payload| payload.get("members"))
    {
        Some(JsonValue::Array(members)) => members.clone(),
        Some(members) if js::truthy(Some(members)) => Vec::new(),
        _ => Vec::new(),
    }
}

/// `videoTrainKindOf`: the kind of the first member with a media, else text.
pub fn kind_of(members: &[JsonValue]) -> &'static str {
    let kind = members
        .iter()
        .find(|member| has(member, "media_src"))
        .and_then(|member| member.get("type"))
        .filter(|kind| js::truthy(Some(kind)))
        .map(js::string)
        .unwrap_or_default()
        .to_lowercase();
    if kind.contains("video") {
        "video"
    } else if kind.contains("audio") || kind.contains("sound") {
        "audio"
    } else if kind.contains("image") || kind.contains("photo") {
        "image"
    } else {
        "text"
    }
}

// `bestVideoReply`: a video reply still there, the most voted, then the older, then the id.
fn best_reply(replies: &[JsonValue]) -> Option<&JsonValue> {
    let mut eligible: Vec<&JsonValue> = replies
        .iter()
        .filter(|reply| {
            reply["kind"] == "video"
                && reply["retired"] != true
                && reply["origin_retired"] != true
                && js::truthy(reply.get("media_src"))
        })
        .collect();
    eligible.sort_by(|a, b| {
        let votes = |reply: &JsonValue| js::number_or(reply.get("votes"), 0.0);
        votes(b)
            .total_cmp(&votes(a))
            .then_with(|| js::string(&a["created_at"]).cmp(&js::string(&b["created_at"])))
            .then_with(|| js::string(&a["id"]).cmp(&js::string(&b["id"])))
    });
    eligible.first().copied()
}

pub fn row_of(db: &Connection, id: &str) -> Result<Option<JsonValue>, String> {
    get(
        db,
        "SELECT * FROM news_publications WHERE news_id = ?",
        &[&id],
    )
}

fn root_of(db: &Connection, row: &JsonValue) -> Result<Option<JsonValue>, String> {
    let root = text(row.get("root_id"));
    if root.is_empty() {
        Ok(Some(row.clone()))
    } else {
        row_of(db, &root)
    }
}

// The audience's `group`, each one `text`ed, when it is one.
pub fn group_of(audience: &JsonValue) -> Option<Vec<String>> {
    audience
        .get("group")
        .and_then(JsonValue::as_array)
        .map(|group| group.iter().map(|id| text(Some(id))).collect())
}

fn reads_origin(db: &Connection, reader: &str, root: Option<&JsonValue>) -> Result<bool, String> {
    let Some(root) = root else { return Ok(false) };
    if reader.is_empty() || reader == "anonymous" {
        return Ok(false);
    }
    let author = text(root.get("author_id"));
    if author == reader {
        return Ok(true);
    }
    let audience = parsed(root.get("audience_json"), json!("all"));
    if !group_of(&audience).is_some_and(|group| group.iter().any(|id| id == reader)) {
        return Ok(false);
    }
    Ok(!blocked_either_way(db, &author, reader)?)
}

/// `row` readable by `user`: its thread's origin is, and neither side of its own author blocks the other.
pub fn readable(db: &Connection, user: &str, row: Option<&JsonValue>) -> Result<bool, String> {
    let reader = js::trim(user);
    let Some(row) = row else { return Ok(false) };
    if text(row.get("thread_ref")).is_empty()
        || !reads_origin(db, reader, root_of(db, row)?.as_ref())?
    {
        return Ok(false);
    }
    let author = text(row.get("author_id"));
    Ok(author == reader || !blocked_either_way(db, &author, reader)?)
}

fn readable_row(
    db: &Connection,
    user: &str,
    news_id: Option<&JsonValue>,
) -> Result<JsonValue, String> {
    let row = row_of(db, &text(news_id))?;
    if !readable(db, user, row.as_ref())? {
        return fail("news_not_found");
    }
    Ok(row.expect("readable row"))
}

/// Who a new reply is told to: its parent's author and its origin's, never its own author.
pub fn reply_recipients(
    db: &Connection,
    author: &str,
    parent: &str,
) -> Result<Vec<String>, String> {
    let parent = row_of(db, parent)?;
    let root = match &parent {
        Some(parent) => root_of(db, parent)?,
        None => None,
    };
    let mut recipients: Vec<String> = Vec::new();
    for id in [
        text(parent.as_ref().and_then(|row| row.get("author_id"))),
        text(root.as_ref().and_then(|row| row.get("author_id"))),
    ] {
        if !id.is_empty() && id != author && !recipients.contains(&id) {
            recipients.push(id);
        }
    }
    Ok(recipients)
}

/// A reply's parent readable and still there, its origin, its anchor.
pub fn reply_context(db: &Connection, author: &str, reply: &JsonValue) -> Result<Context, String> {
    let parent = readable_row(db, author, reply.get("parent_id"))?;
    let root = root_of(db, &parent)?.ok_or("news_not_found")?;
    if js::truthy(parent.get("retired_at")) || js::truthy(root.get("retired_at")) {
        return fail("news_retired");
    }
    if js::truthy(parent.get("replies_closed_at")) {
        return fail("news_replies_closed");
    }
    let anchor = js::number(reply.get("anchor_ms"));
    let anchor = (anchor.is_finite() && anchor.round() >= 0.0)
        .then(|| (anchor + 0.5).floor().min(ANCHOR_MAX_MS) as i64);
    Ok(Context {
        thread_ref: text(root.get("thread_ref")),
        root: Some(text(root.get("news_id"))),
        parent: Some(text(parent.get("news_id"))),
        anchor,
    })
}

/// An origin's reference checked: a thread is private, sent to chosen people only.
pub fn origin_context(thread_ref: &str, audience: Option<&JsonValue>) -> Result<Context, String> {
    if !is_thread_ref(thread_ref) {
        return fail("news_thread_ref_invalid");
    }
    let group = audience.and_then(|audience| audience.get("group"));
    if group
        .and_then(JsonValue::as_array)
        .is_none_or(Vec::is_empty)
    {
        return fail("news_thread_audience_private");
    }
    Ok(Context {
        thread_ref: thread_ref.into(),
        root: None,
        parent: None,
        anchor: None,
    })
}

struct Votes {
    votes: HashMap<String, i64>,
    voted: HashSet<String>,
}

fn count_votes(db: &Connection, ids: &[String], reader: &str) -> Result<Votes, String> {
    if ids.is_empty() {
        return Ok(Votes {
            votes: HashMap::new(),
            voted: HashSet::new(),
        });
    }
    let marks = vec!["?"; ids.len()].join(",");
    let values: Vec<&dyn rusqlite::ToSql> =
        ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    let rows = all(
        db,
        &format!(
            "SELECT news_id, COUNT(*) AS n FROM news_votes WHERE news_id IN ({marks}) GROUP BY news_id"
        ),
        &values,
    )?;
    let mut own_values: Vec<&dyn rusqlite::ToSql> = vec![&reader];
    own_values.extend(values);
    let own = all(
        db,
        &format!("SELECT news_id FROM news_votes WHERE voter_id = ? AND news_id IN ({marks})"),
        &own_values,
    )?;
    Ok(Votes {
        votes: rows
            .iter()
            .map(|row| (text(row.get("news_id")), row["n"].as_i64().unwrap_or(0)))
            .collect(),
        voted: own.iter().map(|row| text(row.get("news_id"))).collect(),
    })
}

fn contribution(row: &JsonValue, votes: &Votes, reader: &str, origin_retired: bool) -> JsonValue {
    let publication = parsed(row.get("payload_json"), json!({}));
    let props = publication
        .get("properties")
        .filter(|props| js::truthy(Some(props)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let members = members_of(&props);
    let retired = js::truthy(row.get("retired_at"));
    let id = text(row.get("news_id"));
    let author = text(row.get("author_id"));
    let mine = author == reader;
    let found = |key: &str| {
        (!retired)
            .then(|| members.iter().find(|member| has(member, key)))
            .flatten()
    };
    let media = found("media_src");
    let link = found("media_link");
    let or_null = |value: String| {
        if value.is_empty() {
            JsonValue::Null
        } else {
            json!(value)
        }
    };
    let mut item = JsonMap::new();
    for (key, value) in [
        ("id", json!(id)),
        ("parent_id", or_null(text(row.get("parent_id")))),
        ("root_id", or_null(text(row.get("root_id")))),
        ("author_id", json!(author)),
        ("author_name", json!(text(props.get("author_name")))),
        ("kind", json!(kind_of(&members))),
        (
            "media_src",
            json!(media.map_or(String::new(), |m| text(m["properties"].get("media_src")))),
        ),
        (
            "media_link",
            json!(link.map_or(String::new(), |m| text(m["properties"].get("media_link")))),
        ),
        (
            "title",
            json!(if retired {
                String::new()
            } else {
                text(props.get("title"))
            }),
        ),
        (
            "text",
            json!(if retired {
                String::new()
            } else {
                text(props.get("preview"))
            }),
        ),
        (
            "training",
            props
                .get("training")
                .filter(|training| !retired && js::truthy(Some(training)))
                .cloned()
                .unwrap_or(JsonValue::Null),
        ),
        (
            "anchor_ms",
            match row.get("anchor_ms") {
                None | Some(JsonValue::Null) => JsonValue::Null,
                Some(anchor) => js::number_json(js::number(Some(anchor))),
            },
        ),
        ("created_at", json!(text(row.get("created_at")))),
        ("votes", json!(votes.votes.get(&id).copied().unwrap_or(0))),
        ("voted", json!(votes.voted.contains(&id))),
        ("mine", json!(mine)),
        ("retired", json!(retired)),
        ("origin_retired", json!(origin_retired)),
        (
            "replies_open",
            json!(!retired && !js::truthy(row.get("replies_closed_at"))),
        ),
        (
            "importable",
            json!(media.is_some() && (mine || props.get(IMPORT_PROPERTY) == Some(&json!(true)))),
        ),
    ] {
        item.insert(key.into(), value);
    }
    JsonValue::Object(item)
}

/// The exercise's threads `user` reads, the newest origin first, each with its replies in their
/// original order and its « Mieux noté » (`best_id`).
pub fn thread(db: &Connection, user: &str, thread_ref: &str) -> Result<JsonValue, String> {
    let reader = js::trim(user);
    if !is_thread_ref(thread_ref) {
        return fail("news_thread_ref_invalid");
    }
    let rows = all(
        db,
        "SELECT * FROM news_publications WHERE thread_ref = ? ORDER BY created_at ASC, news_id ASC",
        &[&thread_ref],
    )?;
    let reported: HashSet<String> = all(
        db,
        "SELECT news_id FROM news_reports WHERE reporter_id = ?",
        &[&reader],
    )?
    .iter()
    .map(|row| text(row.get("news_id")))
    .collect();
    let mut shown = Vec::new();
    for row in rows {
        if !reported.contains(&text(row.get("news_id"))) && readable(db, reader, Some(&row))? {
            shown.push(row);
        }
    }
    let ids: Vec<String> = shown.iter().map(|row| text(row.get("news_id"))).collect();
    let votes = count_votes(db, &ids, reader)?;
    let threads: Vec<JsonValue> = shown
        .iter()
        .filter(|row| text(row.get("root_id")).is_empty())
        .rev()
        .map(|root| {
            let origin_retired = js::truthy(root.get("retired_at"));
            let root_id = text(root.get("news_id"));
            let replies: Vec<JsonValue> = shown
                .iter()
                .filter(|row| text(row.get("root_id")) == root_id)
                .map(|row| contribution(row, &votes, reader, origin_retired))
                .collect();
            let best = best_reply(&replies).map_or(JsonValue::Null, |reply| reply["id"].clone());
            json!({ "origin": contribution(root, &votes, reader, false), "replies": replies, "best_id": best })
        })
        .collect();
    let moderation = reported_rows(db, reader, thread_ref)?.len();
    Ok(
        json!({ "ok": true, "thread_ref": thread_ref, "threads": threads, "moderation": moderation }),
    )
}
