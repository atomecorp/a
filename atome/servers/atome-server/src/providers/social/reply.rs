// A reply to what a network told the person (R-190 §5 bis): `social.reply` sends it through the
// adapter of the network the message came from, and that one only (a direct message, a reply
// under a comment, Instagram's private reply), refuses it once the network's window closed, and
// keeps it in the same conversation (`box: sent`). Only a kept item can be answered: the server
// never replies to an id the client made up. `social.thread.read` reads a kept conversation.
use super::kept::{self, Place};
use super::net::{self, Sd, Se};
use super::network::Network;
use super::ops::Env;
use super::{Config, Media, accounts, plan, sessions};
use crate::providers::generation::now_ms;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const TEXT_MAX: usize = 10_000;

/// What an adapter's reply reads.
pub struct Out<'a> {
    pub config: &'a Config,
    pub account: &'a JsonValue,
    pub origin: &'a JsonValue,
    /// The network's reference kept with the item (a post's cid, a chat's id…).
    pub reference: &'a JsonValue,
    pub text: &'a str,
    pub private: bool,
    pub media: Option<&'a Media>,
}

impl Out<'_> {
    pub fn origin(&self, key: &str) -> String {
        net::text(self.origin.get(key))
    }

    pub fn reference(&self, key: &str) -> String {
        net::text(self.reference.get(key))
    }

    pub fn token(&self) -> String {
        net::text(self.account.get("access_token"))
    }
}

fn closed(at: &JsonValue, now: i64) -> bool {
    at.as_str()
        .is_some_and(|at| net::millis(at) > 0 && net::millis(at) <= now)
}

/// The network's window: a reply after it is refused before anything is sent.
pub fn window(origin: &JsonValue, private: bool, now: i64) -> Sd<()> {
    let reply = &origin["reply"];
    let mode = reply["mode"].as_str().unwrap_or("none");
    if private {
        let instagram_comment = origin["network"] == "instagram" && origin["kind"] == "comment";
        if !instagram_comment {
            return Err(Se::new("social_reply_unsupported"));
        }
        if closed(&reply["private_until"], now) {
            return Err(Se::new("social_reply_window_closed"));
        }
        return Ok(());
    }
    if mode == "none" {
        return Err(Se::new("social_reply_unsupported"));
    }
    if closed(&reply["until"], now) {
        return Err(Se::new("social_reply_window_closed"));
    }
    Ok(())
}

fn place_of(origin: &JsonValue) -> Place {
    Place {
        network: net::text(origin.get("network")),
        account: net::text(origin.get("account")),
        thread: net::text(origin.get("thread")),
    }
}

/// The post itself commented (an origin of kind `comment` whose `remote_id` is its post's id):
/// the origin and the network reference that comment the post rather than answer a comment,
/// read from a comment kept under that post.
pub fn on_post(item: &JsonValue, post: &str) -> Sd<(JsonValue, JsonValue)> {
    let (origin, reference) = (&item["origin"], &item["ref"]);
    let at = |key: &str| net::text(reference.get(key));
    let reference = match origin["network"].as_str().unwrap_or_default() {
        "facebook" => json!({ "page": at("page"), "comment": post }),
        "instagram" => json!({ "media": post }),
        "threads" => json!({ "reply_to": post }),
        "youtube" => json!({ "video": post }),
        "linkedin" => json!({ "post": at("post") }),
        "mastodon" => json!({ "status": post, "acct": "", "visibility": at("visibility") }),
        "bluesky" => json!({ "uri": at("root_uri"), "cid": at("root_cid"),
            "root_uri": at("root_uri"), "root_cid": at("root_cid") }),
        _ => return Err(Se::new("social_reply_unsupported")),
    };
    let mut origin = origin.clone();
    origin["remote_id"] = json!(post);
    origin["kind"] = json!("comment");
    Ok((origin, reference))
}

/// The kept comment under `post` in the conversation, the latest.
async fn under_post(env: &Env, place: &Place, post: &str) -> Sd<JsonValue> {
    let items = kept::items(&env.vault.social_root(), place).await?;
    items
        .into_iter()
        .rev()
        .find(|item| {
            item["box"] == "inbox" && item.pointer("/origin/post/id") == Some(&json!(post))
        })
        .ok_or_else(|| Se::new("social_request_invalid"))
}

/// The kept item a reply answers: by its notice, or by the origin the client holds.
async fn answered(payload: &JsonValue, env: &Env) -> Sd<(Place, JsonValue)> {
    let root = env.vault.social_root();
    let notice = net::text(payload.get("notification_id"));
    let (place, id) = if notice.is_empty() {
        let origin = payload
            .get("origin")
            .filter(|o| o.is_object())
            .ok_or_else(|| Se::new("social_request_invalid"))?;
        (place_of(origin), net::text(origin.get("remote_id")))
    } else {
        kept::noticed(&root, &notice)
            .await?
            .ok_or_else(|| Se::new("social_request_invalid"))?
    };
    if place.network.is_empty() || place.thread.is_empty() || id.is_empty() {
        return Err(Se::new("social_request_invalid"));
    }
    let item = kept::find(&root, &place, &id)
        .await?
        .filter(|item| item["box"] == "inbox")
        .ok_or_else(|| Se::new("social_request_invalid"))?;
    Ok((place, item))
}

/// The one attachment a reply carries: one of the person's files.
async fn attachment(payload: &JsonValue, env: &Env) -> Sd<Option<Media>> {
    let ids = payload
        .get("attachment_ids")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    let Some(id) = ids.first() else {
        return Ok(None);
    };
    if ids.len() > 1 {
        return Err(Se::detail("social_media_constraint", "one_attachment"));
    }
    let path = (env.files)(net::text(Some(id)), env.principal.clone())
        .await
        .ok_or_else(|| Se::new("social_media_missing"))?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|_| Se::new("social_media_unreadable"))?;
    let mime = plan::sniff(&bytes[..bytes.len().min(16)])
        .ok_or_else(|| Se::new("social_media_type_unsupported"))?;
    let kind = if mime.starts_with("image/") {
        "image"
    } else {
        "video"
    };
    let name = path
        .file_name()
        .map_or("atome".into(), |n| n.to_string_lossy().into_owned());
    Ok(Some(Media {
        kind: kind.into(),
        size: bytes.len() as f64,
        mime: mime.into(),
        probe: json!({}),
        name,
        path,
        public_url: None,
    }))
}

/// `social.reply { notification_id | origin, text, attachment_ids?, private? }`.
pub async fn reply(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let text = js::trim(&net::text(payload.get("text"))).to_string();
    let media = attachment(payload, env).await?;
    if text.encode_utf16().count() > TEXT_MAX || (text.is_empty() && media.is_none()) {
        return Err(Se::new("social_request_invalid"));
    }
    let private = payload.get("private") == Some(&JsonValue::Bool(true));
    let asked = payload.get("origin").filter(|o| o.is_object());
    let post = asked
        .map(|o| net::text(o.pointer("/post/id")))
        .unwrap_or_default();
    let commented = asked.is_some_and(|o| {
        o["kind"] == "comment" && !post.is_empty() && net::text(o.get("remote_id")) == post
    });
    let (place, item, origin, reference) = if commented {
        let place = place_of(asked.unwrap_or(&JsonValue::Null));
        let item = under_post(env, &place, &post).await?;
        let (origin, reference) = on_post(&item, &post)?;
        if private {
            return Err(Se::new("social_reply_unsupported"));
        }
        (place, json!({ "id": post }), origin, reference)
    } else {
        let (place, item) = answered(payload, env).await?;
        let (origin, reference) = (item["origin"].clone(), item["ref"].clone());
        (place, item, origin, reference)
    };
    let network = Network::of(&place.network)?;
    let now = now_ms();
    window(&origin, private, now)?;
    let session = sessions::load(network, Some(&place.account), &env.vault, &env.config).await?;
    let session = sessions::connected_only(session)?;
    let account = session.record.unwrap_or_else(|| json!({}));
    let out = Out {
        config: &env.config,
        account: &account,
        origin: &origin,
        reference: &reference,
        text: &text,
        private,
        media: media.as_ref(),
    };
    let remote_id = network.reply(&out).await?;
    let id = if remote_id.is_empty() {
        format!("sent_{}", crate::providers::oauth::hex(12))
    } else {
        remote_id.clone()
    };
    let sent = json!({ "id": id, "message": text, "timestamp": net::iso(now), "box": "sent",
        "from_id": net::text(account.pointer("/identity/id")), "from_name": accounts::label(&account),
        "origin": origin, "private": private, "in_reply_to": item["id"] });
    kept::append(&env.vault.social_root(), &place, sent.clone()).await?;
    Ok(
        json!({ "status": "sent", "remote_id": if remote_id.is_empty() { JsonValue::Null } else { json!(remote_id) }, "item": sent }),
    )
}

/// `social.thread.read { network, account, thread, cursor? }` → `{ items, nextCursor }`.
pub async fn thread(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let network = Network::of(&net::text(payload.get("network")))?;
    let account = net::text(payload.get("account"));
    let thread = net::text(payload.get("thread"));
    if !accounts::shaped(&account) || thread.is_empty() || thread.len() > 512 {
        return Err(Se::new("social_request_invalid"));
    }
    let place = Place {
        network: network.name().into(),
        account,
        thread,
    };
    let cursor = net::text(payload.get("cursor"));
    kept::read(&env.vault.social_root(), &place, Some(&cursor)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin(network: &str, kind: &str, reply: JsonValue) -> JsonValue {
        json!({ "network": network, "kind": kind, "reply": reply })
    }

    #[test]
    fn a_reply_after_its_window_is_refused() {
        let now = net::millis("2026-11-16T12:00:00Z");
        let open = origin(
            "instagram",
            "dm",
            json!({ "mode": "dm", "until": "2026-11-17T00:00:00.000Z" }),
        );
        assert!(window(&open, false, now).is_ok());
        let shut = origin(
            "instagram",
            "dm",
            json!({ "mode": "dm", "until": "2026-11-16T11:00:00.000Z" }),
        );
        assert_eq!(
            window(&shut, false, now).unwrap_err().code,
            "social_reply_window_closed"
        );
        let none = origin("youtube", "comment", json!({ "mode": "none" }));
        assert_eq!(
            window(&none, false, now).unwrap_err().code,
            "social_reply_unsupported"
        );
        let endless = origin(
            "mastodon",
            "comment",
            json!({ "mode": "comment", "until": null }),
        );
        assert!(window(&endless, false, now).is_ok());
    }

    #[test]
    fn the_post_itself_is_commented_not_the_comment_kept_under_it() {
        let item = json!({ "origin": { "network": "bluesky", "kind": "comment", "remote_id": "at://b/2",
            "post": { "id": "at://a/1" } }, "ref": { "uri": "at://b/2", "cid": "c2", "root_uri": "at://a/1", "root_cid": "c1" } });
        let (origin, reference) = on_post(&item, "at://a/1").unwrap();
        assert_eq!(origin["remote_id"], "at://a/1");
        assert_eq!(
            (reference["uri"].as_str(), reference["cid"].as_str()),
            (Some("at://a/1"), Some("c1"))
        );
        let video = json!({ "origin": { "network": "youtube" }, "ref": { "parent": "c9" } });
        assert_eq!(on_post(&video, "v1").unwrap().1, json!({ "video": "v1" }));
        let chat = json!({ "origin": { "network": "telegram" }, "ref": {} });
        assert_eq!(
            on_post(&chat, "1").unwrap_err().code,
            "social_reply_unsupported"
        );
    }

    #[test]
    fn a_private_reply_is_instagram_comments_only_within_seven_days() {
        let now = net::millis("2026-11-16T12:00:00Z");
        let comment = origin(
            "instagram",
            "comment",
            json!({ "mode": "comment", "private_until": "2026-11-20T00:00:00.000Z" }),
        );
        assert!(window(&comment, true, now).is_ok());
        let late = origin(
            "instagram",
            "comment",
            json!({ "mode": "comment", "private_until": "2026-11-10T00:00:00.000Z" }),
        );
        assert_eq!(
            window(&late, true, now).unwrap_err().code,
            "social_reply_window_closed"
        );
        let facebook = origin("facebook", "comment", json!({ "mode": "comment" }));
        assert_eq!(
            window(&facebook, true, now).unwrap_err().code,
            "social_reply_unsupported"
        );
    }
}
