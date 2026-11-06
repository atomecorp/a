// A thread's moderation and its author's own actions (server/news_thread.js, ported): the
// reported contributions kept or withdrawn by the thread's owner, the replies closed or opened,
// a contribution taken into one's own media or sent again, the votes and the reports.
use super::*;
// The contributions reported in the threads `owner` started, still there and not kept, each with
// its count of reports not dismissed; the latest reported first.
pub(super) fn reported_rows(
    db: &Connection,
    owner: &str,
    thread_ref: &str,
) -> Result<Vec<JsonValue>, String> {
    all(
        db,
        "SELECT p.*, COUNT(r.reporter_id) AS reports, o.retired_at AS origin_retired_at
        FROM news_reports r JOIN news_publications p ON p.news_id = r.news_id
        JOIN news_publications o ON o.news_id = COALESCE(NULLIF(p.root_id, ''), p.news_id)
        WHERE r.dismissed_at IS NULL AND p.retired_at IS NULL AND p.thread_ref = ? AND o.author_id = ?
        GROUP BY p.news_id ORDER BY MAX(r.created_at) DESC, p.news_id ASC",
        &[&thread_ref, &owner],
    )
}

pub fn reported(db: &Connection, user: &str, thread_ref: &str) -> Result<JsonValue, String> {
    let owner = js::trim(user);
    if !is_thread_ref(thread_ref) {
        return fail("news_thread_ref_invalid");
    }
    let rows = reported_rows(db, owner, thread_ref)?;
    let ids: Vec<String> = rows.iter().map(|row| text(row.get("news_id"))).collect();
    let votes = count_votes(db, &ids, owner)?;
    let reported: Vec<JsonValue> = rows
        .iter()
        .map(|row| {
            let mut item =
                contribution(row, &votes, owner, js::truthy(row.get("origin_retired_at")));
            item["reports"] = json!(row["reports"].as_i64().unwrap_or(0));
            item
        })
        .collect();
    Ok(json!({ "ok": true, "thread_ref": thread_ref, "reported": reported }))
}

// `row` of a thread `user` started (its origin's author): the moderator's.
fn owned_thread_row(
    db: &Connection,
    user: &str,
    news_id: Option<&JsonValue>,
) -> Result<JsonValue, String> {
    let row = row_of(db, &text(news_id))?;
    let owner = match &row {
        Some(row) if !text(row.get("thread_ref")).is_empty() => {
            root_of(db, row)?.map(|root| text(root.get("author_id")))
        }
        _ => None,
    };
    if owner.as_deref() != Some(js::trim(user)) {
        return fail("news_thread_owner_required");
    }
    Ok(row.expect("owned row"))
}

/// « Garder »: its reports dismissed (each reporter still does not see it).
pub fn dismiss(db: &Connection, user: &str, message: &JsonValue) -> Result<JsonValue, String> {
    let row = owned_thread_row(db, user, message.get("newsId"))?;
    let id = text(row.get("news_id"));
    run(
        db,
        "UPDATE news_reports SET dismissed_at = datetime('now') WHERE news_id = ? AND dismissed_at IS NULL",
        &[&id],
    )?;
    Ok(json!({ "ok": true, "news_id": id, "dismissed": true }))
}

// One's own contribution, never withdrawn.
fn own_row(db: &Connection, user: &str, news_id: Option<&JsonValue>) -> Result<JsonValue, String> {
    let row = row_of(db, &text(news_id))?;
    let Some(row) = row.filter(|row| {
        !text(row.get("thread_ref")).is_empty() && text(row.get("author_id")) == js::trim(user)
    }) else {
        return fail("news_author_required");
    };
    if js::truthy(row.get("retired_at")) {
        return fail("news_retired");
    }
    Ok(row)
}

/// « Avis »: its replies opened or closed by its author; the replies made stay.
pub fn set_replies(db: &Connection, user: &str, message: &JsonValue) -> Result<JsonValue, String> {
    let row = own_row(db, user, message.get("newsId"))?;
    let open = message.get("open") != Some(&json!(false));
    let id = text(row.get("news_id"));
    let sql = if open {
        "UPDATE news_publications SET replies_closed_at = NULL, updated_at = datetime('now') WHERE news_id = ?"
    } else {
        "UPDATE news_publications SET replies_closed_at = datetime('now'), updated_at = datetime('now') WHERE news_id = ?"
    };
    run(db, sql, &[&id])?;
    Ok(json!({ "ok": true, "news_id": id, "replies_open": open }))
}

fn properties_of(row: &JsonValue) -> JsonValue {
    parsed(row.get("payload_json"), json!({}))
        .get("properties")
        .filter(|props| js::truthy(Some(props)))
        .cloned()
        .unwrap_or_else(|| json!({}))
}

/// « Import »: the media a reader may take into their own.
pub fn import_source(
    db: &Connection,
    user: &str,
    message: &JsonValue,
) -> Result<JsonValue, String> {
    let reader = js::trim(user);
    let row = readable_row(db, reader, message.get("newsId"))?;
    if js::truthy(row.get("retired_at")) {
        return fail("news_retired");
    }
    let props = properties_of(&row);
    let members = members_of(&props);
    let media = members.iter().find(|member| has(member, "media_src"));
    let Some(media) = media else {
        if members.iter().any(|member| has(member, "media_link")) {
            return fail("news_media_link_only");
        }
        return fail("news_media_missing");
    };
    if text(row.get("author_id")) != reader && props.get(IMPORT_PROPERTY) != Some(&json!(true)) {
        return fail("news_import_not_allowed");
    }
    Ok(
        json!({ "ok": true, "news_id": text(row.get("news_id")), "kind": kind_of(std::slice::from_ref(media)),
        "media_src": text(media["properties"].get("media_src")), "title": text(props.get("title")) }),
    )
}

/// « Envoi »: one's own contribution as it was sent, without its place in the thread.
pub fn forward_source(
    db: &Connection,
    user: &str,
    news_id: Option<&JsonValue>,
) -> Result<JsonValue, String> {
    let row = own_row(db, user, news_id)?;
    let mut kept = properties_of(&row).as_object().cloned().unwrap_or_default();
    kept.insert("news_thread_ref".into(), json!(text(row.get("thread_ref"))));
    for key in [
        "parent_id",
        "anchor_ms",
        "author_id",
        "author_name",
        "news_tags",
        IMPORT_PROPERTY,
    ] {
        kept.shift_remove(key);
    }
    Ok(JsonValue::Object(kept))
}

pub fn vote(db: &Connection, user: &str, message: &JsonValue) -> Result<JsonValue, String> {
    let voter = js::trim(user);
    let row = readable_row(db, voter, message.get("newsId"))?;
    if text(row.get("author_id")) == voter {
        return fail("news_vote_own");
    }
    if js::truthy(row.get("retired_at")) {
        return fail("news_retired");
    }
    let id = text(row.get("news_id"));
    if message.get("on") == Some(&json!(false)) {
        run(
            db,
            "DELETE FROM news_votes WHERE news_id = ? AND voter_id = ?",
            &[&id, &voter],
        )?;
    } else {
        run(
            db,
            "INSERT OR IGNORE INTO news_votes (news_id, voter_id) VALUES (?, ?)",
            &[&id, &voter],
        )?;
    }
    let votes = count_votes(db, std::slice::from_ref(&id), voter)?;
    Ok(
        json!({ "ok": true, "news_id": id, "votes": votes.votes.get(&id).copied().unwrap_or(0),
        "voted": votes.voted.contains(&id) }),
    )
}

/// A report is kept once per reader and hides the contribution from them.
pub fn report(db: &Connection, user: &str, message: &JsonValue) -> Result<JsonValue, String> {
    let reporter = js::trim(user);
    let row = readable_row(db, reporter, message.get("newsId"))?;
    if text(row.get("author_id")) == reporter {
        return fail("news_report_own");
    }
    let id = text(row.get("news_id"));
    let reason: Vec<u16> = text(Some(message.get("reason").unwrap_or(&json!(""))))
        .encode_utf16()
        .take(REPORT_REASON_MAX)
        .collect();
    let reason = String::from_utf16_lossy(&reason);
    run(
        db,
        "INSERT OR IGNORE INTO news_reports (news_id, reporter_id, reason) VALUES (?, ?, ?)",
        &[&id, &reporter, &reason],
    )?;
    Ok(json!({ "ok": true, "news_id": id, "reported": true }))
}

/// Withdrawn by its author, or by its thread's owner: its row stays, its words and media go.
pub fn retire(db: &Connection, user: &str, message: &JsonValue) -> Result<JsonValue, String> {
    let row = row_of(db, &text(message.get("newsId")))?;
    let Some(row) = row.filter(|row| !text(row.get("thread_ref")).is_empty()) else {
        return fail("news_author_required");
    };
    let user = js::trim(user);
    let root_author = root_of(db, &row)?.map(|root| text(root.get("author_id")));
    if text(row.get("author_id")) != user && root_author.as_deref() != Some(user) {
        return fail("news_author_required");
    }
    let publication = parsed(row.get("payload_json"), json!({}));
    let props = publication
        .get("properties")
        .filter(|props| js::truthy(Some(props)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let payload = props
        .get("news_payload")
        .filter(|payload| js::truthy(Some(payload)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let emptied_props = js::with(
        &props,
        [
            ("title", json!("")),
            ("preview", json!("")),
            ("training", JsonValue::Null),
            ("news_payload", js::with(&payload, [("members", json!([]))])),
        ],
    );
    let emptied = js::with(&publication, [("properties", emptied_props)]);
    let id = text(row.get("news_id"));
    run(
        db,
        "UPDATE news_publications SET retired_at = datetime('now'), title = '', summary = '', payload_json = ?, media_json = '[]',
            updated_at = datetime('now') WHERE news_id = ?",
        &[&atome_store::intent::js_stringify(&emptied), &id],
    )?;
    Ok(json!({ "ok": true, "news_id": id, "retired": true }))
}
