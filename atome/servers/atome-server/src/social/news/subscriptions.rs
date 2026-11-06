// A person's tags and the reads a News opens (server/news_broadcast.js, ported): the whitelist
// of tags they receive, the tags known by search, and whether a News reached them with a file
// (the `news` file-read resolver).

use super::db::{all, get, parsed, run, text};
use super::{Circle, News, bounded, tags, thread};
use crate::social::notice::Notice;
use crate::social::relations::blocked_either_way;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};

impl News {
    pub(super) async fn set_subscriptions(
        &self,
        user: &str,
        tags: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        let slugs: Vec<JsonValue> = tags::normalize(tags)
            .into_iter()
            .map(|tag| tag["slug"].clone())
            .collect();
        let (user, stored) = (
            js::trim(user).to_string(),
            atome_store::intent::js_stringify(&json!(slugs)),
        );
        self.db(move |db| {
            run(db, "INSERT INTO news_subscriptions (user_id, tags_json) VALUES (?, ?)
                 ON CONFLICT(user_id) DO UPDATE SET tags_json = excluded.tags_json, updated_at = datetime('now')", &[&user, &stored])
        })
        .await?;
        Ok(json!({ "ok": true, "tags": slugs }))
    }

    pub(super) async fn search_tags(
        &self,
        query: Option<&JsonValue>,
        limit: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        let needle = format!("%{}%", tags::slugify(&text(query)));
        let plain = format!("%{}%", text(query).to_lowercase());
        let limit = bounded(limit, 100.0, 20.0);
        let rows = self
            .db(move |db| all(db, "SELECT slug, label, origin, use_count FROM news_tags
                 WHERE slug LIKE ? OR lower(label) LIKE ? ORDER BY use_count DESC, slug ASC LIMIT ?", &[&needle, &plain, &limit]))
            .await?;
        let tags: Vec<JsonValue> = rows
            .iter()
            .map(|row| {
                json!({ "slug": row["slug"], "label": row["label"], "origin": row["origin"],
                "count": js::number_json(js::number_or(row.get("use_count"), 0.0)) })
            })
            .collect();
        Ok(json!({ "ok": true, "tags": tags }))
    }

    /// `canReadNewsMedia`: a real account, not blocked, whom a News of the file's owner reached.
    pub async fn can_read_media(
        &self,
        user: &str,
        atome_id: &str,
        author: &str,
        out: &mut Vec<Notice>,
    ) -> Result<bool, String> {
        let reader = js::trim(user).to_string();
        if reader.is_empty() || reader == "anonymous" {
            return Ok(false);
        }
        let (atome_id, author) = (js::trim(atome_id).to_string(), js::trim(author).to_string());
        let rows = {
            let (reader, atome_id) = (reader.clone(), atome_id.clone());
            self.db(move |db| {
                let quoted = json!(atome_id).to_string();
                let pattern = format!("%{}%", &quoted[1..quoted.len() - 1]);
                let rows: Vec<JsonValue> = all(db, "SELECT news_id, author_id, audience_json, tags_json, payload_json, media_json, thread_ref, root_id
                     FROM news_publications WHERE media_json LIKE ?", &[&pattern])?
                    .into_iter()
                    .filter(|row| parsed(row.get("media_json"), json!([])).as_array().is_some_and(|media| media.iter().any(|id| text(Some(id)) == atome_id)))
                    .filter(|row| {
                        let reposted = parsed(row.get("payload_json"), json!({}));
                        let reposted = text(reposted.pointer("/properties/reposted_from/author_id"));
                        let owner = if reposted.is_empty() { text(row.get("author_id")) } else { reposted };
                        author.is_empty() || owner == author
                    })
                    .collect();
                if rows.is_empty() {
                    return Ok(Vec::new());
                }
                let account = get(db, "SELECT atome_id FROM atomes WHERE atome_id = ? AND atome_type = 'user' AND deleted_at IS NULL", &[&reader])?;
                if account.is_none() {
                    return Ok(Vec::new());
                }
                // Each row the reader may reach, the rows of a circle left to its members.
                let mut reachable = Vec::new();
                for row in rows {
                    let row_author = text(row.get("author_id"));
                    if row_author == reader {
                        return Ok(vec![(row, true)]);
                    }
                    if blocked_either_way(db, &row_author, &reader)? {
                        continue;
                    }
                    if !text(row.get("thread_ref")).is_empty() {
                        if thread::readable(db, &reader, Some(&row))? {
                            return Ok(vec![(row, true)]);
                        }
                        continue;
                    }
                    reachable.push((row, false));
                }
                Ok(reachable)
            })
            .await?
        };
        for (row, granted) in rows {
            if granted {
                return Ok(true);
            }
            let audience = parsed(row.get("audience_json"), json!("all"));
            if let Some(circle) = Circle::of(&audience) {
                if self.is_member(&circle, &reader, out).await? {
                    return Ok(true);
                }
                continue;
            }
            if let Some(group) = thread::group_of(&audience) {
                if group.contains(&reader) {
                    return Ok(true);
                }
                continue;
            }
            if tags::accepts(
                &self.subscription_of(&reader).await?,
                &parsed(row.get("tags_json"), json!([])),
            ) {
                return Ok(true);
            }
        }
        Ok(false)
    }
}

pub(super) fn subscription(db: &Connection, user: &str) -> Result<JsonValue, String> {
    let row = get(
        db,
        "SELECT tags_json FROM news_subscriptions WHERE user_id = ?",
        &[&user],
    )?;
    Ok(parsed(
        row.as_ref().and_then(|row| row.get("tags_json")),
        json!([]),
    ))
}

pub(super) fn register_tags(db: &Connection, tags: &[JsonValue]) -> Result<(), String> {
    for tag in tags {
        let (slug, label) = (text(tag.get("slug")), text(tag.get("label")));
        run(db, "INSERT INTO news_tags (slug, label, use_count) VALUES (?, ?, 1)
             ON CONFLICT(slug) DO UPDATE SET use_count = news_tags.use_count + 1, updated_at = datetime('now')", &[&slug, &label])?;
    }
    Ok(())
}
