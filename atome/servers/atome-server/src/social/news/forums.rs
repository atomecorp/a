// Forums (server/forums.js, ported; atome/src/shared/forum_contract.js): a name and its people,
// made by a founder. The people chosen are invited (a Communication notice, as a contact
// request: never one blocking or blocked) and become members by accepting; until then they read
// nothing, not even who belongs (decision 7 of 26 Oct. 2026). A person not on eVe is invited by
// an e-mail the founder's device sends (decision 6): its link's token makes the account that
// opens it a member. A forum's posts are News publications whose audience is the forum (mod.rs);
// here, who belongs and the thread read back.
use super::News;
use super::communities::thread_of;
use super::db::{all, get, run, text};
use crate::social::notice::Notice;
use crate::social::relations::blocked_either_way;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};

const NAME_MAX: usize = 60;
const MEMBERS_MAX: usize = 200;

/// `isForumId`: `^forum_[a-z0-9-]{8,64}$`.
pub fn is_forum_id(id: &str) -> bool {
    id.strip_prefix("forum_").is_some_and(|rest| {
        (8..=64).contains(&rest.len())
            && rest
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    })
}

struct Forum {
    id: String,
    owner: String,
    name: String,
}

fn forum_of(db: &Connection, id: Option<&JsonValue>) -> Result<Forum, String> {
    let id = text(id);
    if !is_forum_id(&id) {
        return Err("forum_not_found".into());
    }
    let row = get(
        db,
        "SELECT forum_id, owner_id, name FROM forums WHERE forum_id = ?",
        &[&id],
    )?
    .ok_or("forum_not_found")?;
    Ok(Forum {
        id: text(row.get("forum_id")),
        owner: text(row.get("owner_id")),
        name: text(row.get("name")),
    })
}

fn status_of(db: &Connection, id: &str, user: &str) -> Result<String, String> {
    let row = get(
        db,
        "SELECT status FROM forum_members WHERE forum_id = ? AND user_id = ?",
        &[&js::trim(id), &js::trim(user)],
    )?;
    Ok(row.map(|row| text(row.get("status"))).unwrap_or_default())
}

pub fn is_member(db: &Connection, id: &str, user: &str) -> Result<bool, String> {
    Ok(!js::trim(user).is_empty()
        && is_forum_id(js::trim(id))
        && status_of(db, id, user)? == "member")
}

pub fn member_ids(db: &Connection, id: &str) -> Result<Vec<String>, String> {
    Ok(all(
        db,
        "SELECT user_id FROM forum_members WHERE forum_id = ? AND status = 'member'",
        &[&js::trim(id)],
    )?
    .iter()
    .map(|row| text(row.get("user_id")))
    .collect())
}

fn member_forum(db: &Connection, user: &str, id: Option<&JsonValue>) -> Result<Forum, String> {
    let forum = forum_of(db, id)?;
    if !is_member(db, &forum.id, user)? {
        return Err("forum_not_member".into());
    }
    Ok(forum)
}

fn summary(forum: &Forum, user: &str) -> JsonValue {
    json!({ "id": forum.id, "name": forum.name, "owner": forum.owner == user, "status": "member" })
}

fn token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

// Each invitation's notice to send, once the database holds it.
struct Invited {
    answer: JsonValue,
    notify: Vec<String>,
}

// The people chosen (`{ key, id?, phone?, name? }`: an account by its id, else by its number):
// each account is invited once (never one blocking or blocked by the inviter), a member stays
// one; a person with no account gets a token their e-mail's link carries (the inviter's device
// sends it). Answered by `key`.
fn invite_people(
    db: &Connection,
    forum: &Forum,
    inviter: &str,
    people: Option<&JsonValue>,
) -> Result<Invited, String> {
    let (mut invited, mut unreachable, mut guests, mut notify) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for person in people
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .take(MEMBERS_MAX)
    {
        let field = |key: &str| person.get(key).filter(|value| js::truthy(Some(value)));
        let key = text(
            field("key")
                .or_else(|| field("id"))
                .or_else(|| field("phone")),
        );
        let mut account = text(person.get("id"));
        let phone = text(person.get("phone"));
        if account.is_empty() && !phone.is_empty() {
            account = text(
                crate::auth::accounts::find_by_phone(db, &phone)?
                    .as_ref()
                    .and_then(|user| user.get("user_id")),
            );
        }
        if account.is_empty() {
            let token = token();
            let name = js::slice(&text(person.get("name")), 120);
            run(
                db,
                "INSERT INTO forum_guests (token, forum_id, name, invited_by) VALUES (?, ?, ?, ?)",
                &[&token, &forum.id, &name, &inviter],
            )?;
            guests.push(json!({ "key": key, "token": token }));
            continue;
        }
        if account == inviter || !status_of(db, &forum.id, &account)?.is_empty() {
            invited.push(json!(key));
            continue;
        }
        if blocked_either_way(db, inviter, &account)? {
            unreachable.push(json!(key));
            continue;
        }
        run(
            db,
            "INSERT INTO forum_members (forum_id, user_id, status, invited_by) VALUES (?, ?, 'invited', ?)",
            &[&forum.id, &account, &inviter],
        )?;
        notify.push(account);
        invited.push(json!(key));
    }
    Ok(Invited {
        answer: json!({ "invited": invited, "unreachable": unreachable, "guests": guests }),
        notify,
    })
}

impl News {
    async fn invite(
        &self,
        forum: &Forum,
        inviter: &str,
        invited: Invited,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let notification = json!({ "kind": "forum-invite", "id": format!("forum_invite_{}", forum.id), "subject": forum.name, "message": forum.name });
        for account in &invited.notify {
            out.push(
                self.stack
                    .notice(account, Some(inviter), &notification)
                    .await?,
            );
        }
        Ok(invited.answer)
    }

    /// The `forum` family: `message.action` for `user`.
    pub async fn forum(
        &self,
        message: &JsonValue,
        user: &str,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let action = text(message.get("action")).to_lowercase();
        let user = js::trim(user).to_string();
        let message = message.clone();
        match action.as_str() {
            "create" | "invite" => {
                let creating = action == "create";
                let inviter = user.clone();
                let (forum, invited) = self
                    .db(move |db| {
                        let forum = if creating {
                            let name = js::slice(&text(message.get("name")), NAME_MAX);
                            if name.is_empty() {
                                return Err("forum_name_required".to_string());
                            }
                            let forum = Forum { id: format!("forum_{}", uuid::Uuid::new_v4()), owner: inviter.clone(), name };
                            run(db, "INSERT INTO forums (forum_id, owner_id, name) VALUES (?, ?, ?)", &[&forum.id, &forum.owner, &forum.name])?;
                            run(db, "INSERT INTO forum_members (forum_id, user_id, status, invited_by) VALUES (?, ?, 'member', ?)",
                                &[&forum.id, &forum.owner, &forum.owner])?;
                            forum
                        } else {
                            member_forum(db, &inviter, message.get("forum"))?
                        };
                        let invited = invite_people(db, &forum, &inviter, message.get("people"))?;
                        Ok((forum, invited))
                    })
                    .await?;
                let answer = self.invite(&forum, &user, invited, out).await?;
                let mut result = json!({ "ok": true });
                if creating {
                    result["forum"] = summary(&forum, &user);
                }
                for (key, value) in answer.as_object().into_iter().flatten() {
                    result[key] = value.clone();
                }
                Ok(result)
            }
            other => {
                let other = other.to_string();
                let answer = self
                    .db(move |db| forum_action(db, &other, &user, &message))
                    .await?;
                let JsonValue::Array(list) = answer else {
                    return Ok(answer);
                };
                // `members`: each one's name, read once the forum is known.
                let mut members = Vec::new();
                for member in list {
                    let name = self
                        .user_name(&text(member.get("id")))
                        .await
                        .unwrap_or_default();
                    members.push(
                        json!({ "id": member["id"], "name": name, "owner": member["owner"] }),
                    );
                }
                Ok(json!({ "ok": true, "members": members }))
            }
        }
    }
}

// A publication of a forum's thread gone, its votes and reports with it.
fn remove_publication(db: &Connection, id: &str) -> Result<(), String> {
    run(db, "DELETE FROM news_votes WHERE news_id = ?", &[&id])?;
    run(db, "DELETE FROM news_reports WHERE news_id = ?", &[&id])?;
    run(
        db,
        "DELETE FROM news_publications WHERE news_id = ?",
        &[&id],
    )?;
    Ok(())
}

// The actions that touch the database alone; `members` answers its list, named by its caller.
fn forum_action(
    db: &Connection,
    action: &str,
    user: &str,
    message: &JsonValue,
) -> Result<JsonValue, String> {
    match action {
        "respond" => {
            let forum = forum_of(db, message.get("forum"))?;
            let status = status_of(db, &forum.id, user)?;
            if status != "invited" {
                return Ok(
                    json!({ "ok": true, "status": if status.is_empty() { "none" } else { &status } }),
                );
            }
            if text(message.get("decision")) == "accept" {
                run(
                    db,
                    "UPDATE forum_members SET status = 'member', updated_at = datetime('now') WHERE forum_id = ? AND user_id = ?",
                    &[&forum.id, &user],
                )?;
                return Ok(
                    json!({ "ok": true, "status": "member", "forum": { "id": forum.id, "name": forum.name } }),
                );
            }
            run(
                db,
                "DELETE FROM forum_members WHERE forum_id = ? AND user_id = ?",
                &[&forum.id, &user],
            )?;
            Ok(json!({ "ok": true, "status": "none" }))
        }
        // The e-mail's link, opened by an account: the invitation's acceptance. A token serves once.
        // It travels as `invite`: a message's `token` is read by the WS layer as its session.
        "claim" => {
            let invite = text(message.get("invite"));
            let row = get(
                db,
                "SELECT forum_id, claimed_by FROM forum_guests WHERE token = ?",
                &[&invite],
            )?;
            let row = row
                .filter(|row| {
                    let claimed = text(row.get("claimed_by"));
                    claimed.is_empty() || claimed == user
                })
                .ok_or("forum_invite_invalid")?;
            let forum = forum_of(db, row.get("forum_id"))?;
            run(
                db,
                "UPDATE forum_guests SET claimed_by = ? WHERE token = ?",
                &[&user, &invite],
            )?;
            run(db, "INSERT INTO forum_members (forum_id, user_id, status, invited_by) VALUES (?, ?, 'member', ?)
                 ON CONFLICT(forum_id, user_id) DO UPDATE SET status = 'member', updated_at = datetime('now')", &[&forum.id, &user, &forum.owner])?;
            Ok(json!({ "ok": true, "forum": summary(&forum, user) }))
        }
        // Its founder keeps it: only the others leave.
        "leave" => {
            let forum = forum_of(db, message.get("forum"))?;
            if forum.owner == user {
                return Err("forum_owner_stays".into());
            }
            run(
                db,
                "DELETE FROM forum_members WHERE forum_id = ? AND user_id = ?",
                &[&forum.id, &user],
            )?;
            Ok(json!({ "ok": true }))
        }
        // Deleted by its founder (D36): the forum, its people, its invitations and every post of its
        // thread (their votes and reports with them).
        "delete" => {
            let forum = forum_of(db, message.get("forum"))?;
            if forum.owner != user {
                return Err("forum_owner_required".into());
            }
            let audience = atome_store::intent::js_stringify(&json!({ "forum": forum.id }));
            for row in all(
                db,
                "SELECT news_id FROM news_publications WHERE audience_json = ?",
                &[&audience],
            )? {
                remove_publication(db, &text(row.get("news_id")))?;
            }
            run(
                db,
                "DELETE FROM forum_guests WHERE forum_id = ?",
                &[&forum.id],
            )?;
            run(
                db,
                "DELETE FROM forum_members WHERE forum_id = ?",
                &[&forum.id],
            )?;
            run(db, "DELETE FROM forums WHERE forum_id = ?", &[&forum.id])?;
            Ok(json!({ "ok": true, "forum": forum.id, "deleted": true }))
        }
        // A post of the thread deleted by its author or by the forum's founder (D36), with its votes and reports.
        "remove_post" => {
            let forum = member_forum(db, user, message.get("forum"))?;
            let id = text(message.get("post"));
            let audience = atome_store::intent::js_stringify(&json!({ "forum": forum.id }));
            let row = get(
                db,
                "SELECT author_id FROM news_publications WHERE news_id = ? AND audience_json = ?",
                &[&id, &audience],
            )?
            .ok_or("forum_post_not_found")?;
            if text(row.get("author_id")) != user && forum.owner != user {
                return Err("forum_post_author_required".into());
            }
            remove_publication(db, &id)?;
            Ok(json!({ "ok": true, "post": id, "deleted": true }))
        }
        // The forums a person belongs to or is invited to, by name.
        "list" => {
            let rows = all(db, "SELECT f.forum_id, f.name, f.owner_id, m.status FROM forum_members m JOIN forums f ON f.forum_id = m.forum_id
                 WHERE m.user_id = ? ORDER BY f.name", &[&user])?;
            let forums: Vec<JsonValue> = rows
                .iter()
                .map(|row| json!({ "id": text(row.get("forum_id")), "name": text(row.get("name")), "status": text(row.get("status")),
                    "owner": text(row.get("owner_id")) == user }))
                .collect();
            Ok(json!({ "ok": true, "forums": forums }))
        }
        // Who belongs, for a member only (an invited person learns nothing before accepting).
        "members" => {
            let forum = member_forum(db, user, message.get("forum"))?;
            Ok(json!(
                member_ids(db, &forum.id)?
                    .into_iter()
                    .map(|id| json!({ "id": id, "owner": id == forum.owner }))
                    .collect::<Vec<_>>()
            ))
        }
        // The thread, newest first, for its members: no author blocking (or blocked by) the reader.
        "feed" => {
            let forum = member_forum(db, user, message.get("forum"))?;
            let audience = atome_store::intent::js_stringify(&json!({ "forum": forum.id }));
            let publications = thread_of(db, &audience, user, message.get("limit"), &[])?;
            Ok(
                json!({ "ok": true, "forum": { "id": forum.id, "name": forum.name, "owner": forum.owner == user }, "publications": publications }),
            )
        }
        _ => Err(format!(
            "forum_action_unsupported:{}",
            if action.is_empty() { "missing" } else { action }
        )),
    }
}
