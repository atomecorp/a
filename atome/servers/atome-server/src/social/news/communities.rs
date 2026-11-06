// Communities (server/communities.js, ported; atome/src/shared/community_contract.js): a network
// in the network, an allow-list of members kept by its host account. Its posts are News
// publications whose audience is the community (mod.rs stores and delivers them); here, who
// belongs and the thread read back. Joining is the person's opt-in; the host moderates: Refuse
// (the person may join again after REFUSAL_DAYS), Ban (never again, and their posts leave the
// thread). A refused or banned person who asks to join learns nothing (silent, like a refused
// contact request). Created on first use: the host account (the account of the phone its
// environment names, else a new account in the host's name) and its opening posts.
use super::db::{all, get, parsed, run, text};
use super::{Circle, News};
use crate::social::notice::Notice;
use crate::social::relations::blocked_either_way;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

pub const COMMUNITY_IDS: &[&str] = &["sleep_circle"];
const REFUSAL_DAYS: f64 = 30.0;

struct Definition {
    id: &'static str,
    host_name: &'static str,
    host_phone_env: &'static str,
    // Newest first: (key, picture, age in hours).
    opening_posts: &'static [(&'static str, &'static str, i64)],
}

const SLEEP_CIRCLE: Definition = Definition {
    id: "sleep_circle",
    host_name: "Morphée",
    host_phone_env: "SLEEP_CIRCLE_HOST_PHONE",
    opening_posts: &[
        ("ritual", "./assets/images/sleep/candle.jpg", 0),
        ("dinner", "./assets/images/sleep/pumpkin_soup.jpg", 24),
        ("welcome", "./assets/images/sleep/moon_clouds.jpg", 48),
    ],
};

fn definition_of(id: &str) -> Result<&'static Definition, String> {
    (js::trim(id) == SLEEP_CIRCLE.id)
        .then_some(&SLEEP_CIRCLE)
        .ok_or_else(|| "community_unknown".to_string())
}

fn audience_json(id: &str) -> String {
    atome_store::intent::js_stringify(&json!({ "community": id }))
}

struct Community {
    id: String,
    host: String,
}

// `{ status, age_days }` of a person in a community.
fn member_row(
    db: &rusqlite::Connection,
    id: &str,
    user: &str,
) -> Result<Option<JsonValue>, String> {
    get(
        db,
        "SELECT status, julianday('now') - julianday(updated_at) AS age_days FROM community_members WHERE community_id = ? AND user_id = ?",
        &[&id, &js::trim(user)],
    )
}

fn set_status(db: &rusqlite::Connection, id: &str, user: &str, status: &str) -> Result<(), String> {
    run(
        db,
        "INSERT INTO community_members (community_id, user_id, status) VALUES (?, ?, ?)
         ON CONFLICT(community_id, user_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')",
        &[&id, &js::trim(user), &status],
    )?;
    Ok(())
}

fn host_row(db: &rusqlite::Connection, id: &str) -> Result<Option<Community>, String> {
    Ok(get(
        db,
        "SELECT community_id, host_id FROM communities WHERE community_id = ?",
        &[&id],
    )?
    .map(|row| Community {
        id: text(row.get("community_id")),
        host: text(row.get("host_id")),
    }))
}

// `Math.max(1, Math.min(500, Number(limit) || 200))`.
pub(super) fn feed_limit(limit: Option<&JsonValue>) -> i64 {
    js::number_or(limit, 200.0).clamp(1.0, 500.0) as i64
}

/// A circle's thread, newest first: no author `skip` names, none blocking or blocked by the reader.
pub(super) fn thread_of(
    db: &rusqlite::Connection,
    audience: &str,
    reader: &str,
    limit: Option<&JsonValue>,
    skip: &[String],
) -> Result<Vec<JsonValue>, String> {
    let rows = all(
        db,
        "SELECT news_id, author_id, payload_json FROM news_publications WHERE audience_json = ? ORDER BY created_at DESC LIMIT ?",
        &[&audience, &feed_limit(limit)],
    )?;
    let mut publications = Vec::new();
    for row in rows {
        let author = text(row.get("author_id"));
        let publication = parsed(row.get("payload_json"), JsonValue::Null);
        if !js::truthy(publication.get("properties")) || skip.contains(&author) {
            continue;
        }
        if author != reader && blocked_either_way(db, &author, reader)? {
            continue;
        }
        publications.push(js::with(
            &publication,
            [("id", json!(text(row.get("news_id"))))],
        ));
    }
    publications.sort_by(|a, b| {
        text(b["properties"].get("created_iso")).cmp(&text(a["properties"].get("created_iso")))
    });
    Ok(publications)
}

impl News {
    // Two first requests at once create the community once.
    async fn ensure(&self, id: &str, out: &mut Vec<Notice>) -> Result<Community, String> {
        let definition = definition_of(id)?;
        let found = self.db(move |db| host_row(db, definition.id)).await?;
        if let Some(community) = found {
            return Ok(community);
        }
        let _creating = self.creating.lock().await;
        if let Some(community) = self.db(move |db| host_row(db, definition.id)).await? {
            return Ok(community);
        }
        let phone = std::env::var(definition.host_phone_env).unwrap_or_default();
        let phone = js::trim(&phone).to_string();
        let host = self
            .db(move |db| {
                let existing = if phone.is_empty() {
                    None
                } else {
                    crate::auth::accounts::find_by_phone(db, &phone)?
                };
                let host = match existing
                    .map(|user| text(user.get("user_id")))
                    .filter(|id| !id.is_empty())
                {
                    Some(host) => host,
                    None => {
                        let principal = uuid::Uuid::new_v4().to_string();
                        let phone = Some(phone.as_str()).filter(|phone| !phone.is_empty());
                        text(
                            crate::auth::accounts::create(
                                db,
                                &principal,
                                definition.host_name,
                                phone,
                                "private",
                                &serde_json::json!({}),
                            )?
                            .get("user_id"),
                        )
                    }
                };
                run(
                    db,
                    "INSERT INTO communities (community_id, host_id) VALUES (?, ?)",
                    &[&definition.id, &host],
                )?;
                Ok(host)
            })
            .await?;
        self.seed(definition, &host, out).await?;
        Ok(Community {
            id: definition.id.into(),
            host,
        })
    }

    async fn seed(
        &self,
        definition: &Definition,
        host: &str,
        out: &mut Vec<Notice>,
    ) -> Result<(), String> {
        let author_name = self
            .user_name(host)
            .await
            .unwrap_or_else(|| definition.host_name.into());
        let now = chrono::Utc::now();
        for (key, image, age_hours) in definition.opening_posts {
            let post_id = format!("{}_{key}", definition.id);
            let created = (now - chrono::Duration::hours(*age_hours))
                .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                .to_string();
            let publication = json!({ "id": post_id, "type": "news_publication", "properties": {
                "source_domain": "community", "community": definition.id, "community_post_key": key, "news_id": post_id,
                "news_post_id": post_id, "author_id": host, "author_name": author_name, "title": "", "preview": "",
                "created_iso": created,
                "news_payload": { "schema_version": 1, "tags": [],
                    "members": [{ "id": format!("{post_id}_image"), "type": "image", "properties": { "media_src": image } }] } } });
            let audience = Circle::Community(definition.id.into()).audience();
            // The seed reaches the community once its row exists: its members read it, never this again.
            Box::pin(self.distribute(
                host,
                &post_id,
                None,
                publication,
                json!([]),
                audience,
                json!([]),
                None,
                out,
            ))
            .await?;
        }
        Ok(())
    }

    pub(super) async fn community_member(
        &self,
        id: &str,
        user: &str,
        out: &mut Vec<Notice>,
    ) -> Result<bool, String> {
        let community = self.ensure(id, out).await?;
        let user = js::trim(user).to_string();
        if user.is_empty() {
            return Ok(false);
        }
        if user == community.host {
            return Ok(true);
        }
        let row = self
            .db(move |db| member_row(db, &community.id, &user))
            .await?;
        Ok(row.is_some_and(|row| row["status"] == "member"))
    }

    pub(super) async fn community_member_ids(
        &self,
        id: &str,
        out: &mut Vec<Notice>,
    ) -> Result<Vec<String>, String> {
        let community = self.ensure(id, out).await?;
        self.db(move |db| {
            let mut ids = vec![community.host];
            for row in all(db, "SELECT user_id FROM community_members WHERE community_id = ? AND status = 'member'", &[&community.id])? {
                let id = text(row.get("user_id"));
                if !ids.contains(&id) {
                    ids.push(id);
                }
            }
            Ok(ids)
        })
        .await
    }

    async fn host_of(
        &self,
        user: &str,
        id: &str,
        out: &mut Vec<Notice>,
    ) -> Result<Community, String> {
        let community = self.ensure(id, out).await?;
        if js::trim(user) != community.host {
            return Err("community_host_required".into());
        }
        Ok(community)
    }

    /// The `community` family: `message.action` for `user`.
    pub async fn community(
        &self,
        message: &JsonValue,
        user: &str,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let action = text(message.get("action")).to_lowercase();
        let id = text(message.get("community"));
        let user = js::trim(user).to_string();
        match action.as_str() {
            "join" => {
                let community = self.ensure(&id, out).await?;
                if user == community.host {
                    return Ok(json!({ "ok": true, "joined": true }));
                }
                self.db(move |db| {
                    let row = member_row(db, &community.id, &user)?;
                    let status = row
                        .as_ref()
                        .map(|row| text(row.get("status")))
                        .unwrap_or_default();
                    let age = row
                        .as_ref()
                        .map_or(f64::NAN, |row| js::number(row.get("age_days")));
                    if status == "banned" || (status == "refused" && age < REFUSAL_DAYS) {
                        return Ok(json!({ "ok": true, "joined": false }));
                    }
                    set_status(db, &community.id, &user, "member")?;
                    Ok(json!({ "ok": true, "joined": true }))
                })
                .await
            }
            // Leaving keeps a refusal or a ban: it never clears the host's decision.
            "leave" => {
                let community = self.ensure(&id, out).await?;
                self.db(move |db| {
                    run(db, "DELETE FROM community_members WHERE community_id = ? AND user_id = ? AND status = 'member'", &[&community.id, &user])?;
                    Ok(json!({ "ok": true }))
                })
                .await
            }
            "feed" => {
                let community = self.ensure(&id, out).await?;
                if !self.community_member(&community.id, &user, out).await? {
                    return Ok(
                        json!({ "ok": true, "member": false, "host": false, "publications": [] }),
                    );
                }
                let limit = message.get("limit").cloned();
                self.db(move |db| {
                    let banned: Vec<String> = all(db, "SELECT user_id FROM community_members WHERE community_id = ? AND status = 'banned'", &[&community.id])?
                        .iter()
                        .map(|row| text(row.get("user_id")))
                        .collect();
                    let publications = thread_of(db, &audience_json(&community.id), &user, limit.as_ref(), &banned)?;
                    Ok(json!({ "ok": true, "member": true, "host": user == community.host, "host_id": community.host, "publications": publications }))
                })
                .await
            }
            "members" => {
                let community = self.host_of(&user, &id, out).await?;
                let rows = self
                    .db(move |db| all(db, "SELECT user_id, status FROM community_members WHERE community_id = ? ORDER BY updated_at DESC", &[&community.id]))
                    .await?;
                let mut members = Vec::new();
                for row in rows {
                    let name = self
                        .user_name(&text(row.get("user_id")))
                        .await
                        .unwrap_or_default();
                    members.push(json!({ "id": text(row.get("user_id")), "status": row["status"], "name": name }));
                }
                Ok(json!({ "ok": true, "members": members }))
            }
            "refuse" | "ban" | "unban" => {
                let community = self.host_of(&user, &id, out).await?;
                let target = text(message.get("userId"));
                if target.is_empty() || target == community.host {
                    return Err("community_target_invalid".into());
                }
                self.db(move |db| {
                    match action.as_str() {
                        "unban" => {
                            run(db, "DELETE FROM community_members WHERE community_id = ? AND user_id = ?", &[&community.id, &target])?;
                        }
                        "ban" => set_status(db, &community.id, &target, "banned")?,
                        _ => set_status(db, &community.id, &target, "refused")?,
                    }
                    Ok(json!({ "ok": true }))
                })
                .await
            }
            // A post leaves the thread by its author or the host, with its reposts.
            "remove-post" => {
                let community = self.ensure(&id, out).await?;
                let post_id = text(message.get("newsId"));
                self.db(move |db| {
                    let audience = audience_json(&community.id);
                    let row = get(db, "SELECT author_id FROM news_publications WHERE news_id = ? AND audience_json = ?", &[&post_id, &audience])?
                        .ok_or("community_post_not_found")?;
                    if user != community.host && user != text(row.get("author_id")) {
                        return Err("community_host_required".into());
                    }
                    let mut escaped = String::new();
                    for c in post_id.chars() {
                        if matches!(c, '\\' | '%' | '_') {
                            escaped.push('\\');
                        }
                        escaped.push(c);
                    }
                    let reposts = format!("repost\\_{escaped}\\_%");
                    run(db, "DELETE FROM news_publications WHERE audience_json = ? AND (news_id = ? OR news_id LIKE ? ESCAPE '\\')",
                        &[&audience, &post_id, &reposts])?;
                    Ok(json!({ "ok": true }))
                })
                .await
            }
            _ => Err(format!(
                "community_action_unsupported:{}",
                if action.is_empty() {
                    "missing"
                } else {
                    &action
                }
            )),
        }
    }
}
