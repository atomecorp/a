// What a network told the person (R-190 §5 bis, reception): a direct message, a comment or a
// mention, kept in its conversation on atome first (rule 21), then told once through the one
// notification writer (`live::Notifier`: the stack, the live frame, the push) as a
// `social-message` or `social-comment` carrying its `origin`, the reply's route.
use super::kept::{self, Place};
use super::net::{self, Sd};
use crate::social::live::Notifier;
use serde_json::{Value as JsonValue, json};
use std::path::Path;

/// A message or comment as an adapter read it.
#[derive(Clone, Debug, Default)]
pub struct Received {
    /// `dm`, `comment` or `mention`.
    pub kind: &'static str,
    pub thread: String,
    pub remote_id: String,
    pub text: String,
    /// When it was written, in milliseconds.
    pub at: i64,
    /// `{ id, name, handle, avatar_url }`.
    pub author: JsonValue,
    /// `{ id, url, title, job_id }` of the post it answers, or null.
    pub post: JsonValue,
    /// `{ mode: dm|comment|none, until, private_until }`.
    pub reply: JsonValue,
    /// What the network needs to answer it (kept on the server only).
    pub reference: JsonValue,
}

/// What one poll read, and the account's cursor after it.
#[derive(Default)]
pub struct Polled {
    pub items: Vec<Received>,
    pub cursor: Option<JsonValue>,
}

/// The author shape every adapter gives.
pub fn author(id: &str, name: &str, handle: &str, avatar: &str) -> JsonValue {
    let or_null = |text: &str| {
        if text.is_empty() {
            JsonValue::Null
        } else {
            json!(text)
        }
    };
    json!({ "id": id, "name": name, "handle": or_null(handle), "avatar_url": or_null(avatar) })
}

/// The reply route: `until` and `private_until` in milliseconds when a window closes.
pub fn reply(mode: &str, until: Option<i64>, private_until: Option<i64>) -> JsonValue {
    let at = |ms: Option<i64>| ms.map_or(JsonValue::Null, |ms| json!(net::iso(ms)));
    json!({ "mode": mode, "until": at(until), "private_until": at(private_until) })
}

pub fn post(id: &str, url: &str) -> JsonValue {
    if id.is_empty() {
        return JsonValue::Null;
    }
    json!({ "id": id, "url": if url.is_empty() { JsonValue::Null } else { json!(url) }, "title": null, "job_id": null,
        "thumbnail_url": null })
}

/// A post's picture, where the network names one.
pub fn with_thumbnail(mut post: JsonValue, url: &str) -> JsonValue {
    if post.is_object() && !url.is_empty() {
        post["thumbnail_url"] = json!(url);
    }
    post
}

/// The origin a notice and a kept item carry (§5 bis).
pub fn origin(network: &str, account: &str, item: &Received) -> JsonValue {
    json!({ "network": network, "account": account, "kind": item.kind, "thread": item.thread,
        "remote_id": item.remote_id, "post": item.post, "author": item.author, "reply": item.reply })
}

/// A notice's id: one per network item, so a second delivery of it is the same notice.
pub fn notice_id(network: &str, account: &str, remote_id: &str) -> String {
    let digest = ring::digest::digest(
        &ring::digest::SHA256,
        format!("{network}\u{0}{account}\u{0}{remote_id}").as_bytes(),
    );
    format!("social_{network}_{}", &hex::encode(digest.as_ref())[..24])
}

/// The item kept then told; one already kept is not told again (`false`).
pub async fn deliver(
    principal: &str,
    social_root: &Path,
    notifier: &Notifier,
    network: &str,
    account: &str,
    item: Received,
) -> Sd<bool> {
    let place = Place {
        network: network.into(),
        account: account.into(),
        thread: item.thread.clone(),
    };
    let origin = origin(network, account, &item);
    let name = item.author["name"].as_str().unwrap_or_default().to_string();
    let notice = notice_id(network, account, &item.remote_id);
    let kept = json!({ "id": item.remote_id, "message": item.text, "timestamp": net::iso(item.at),
        "box": "inbox", "from_id": item.author["id"], "from_name": name, "origin": origin,
        "notification_id": notice, "ref": item.reference });
    if !kept::append(social_root, &place, kept).await? {
        return Ok(false);
    }
    kept::remember(social_root, &notice, &place, &item.remote_id).await?;
    let kind = if item.kind == "dm" {
        "social-message"
    } else {
        "social-comment"
    };
    let notification = json!({ "id": notice, "kind": kind, "subject": "", "message": item.text,
        "extra": { "from_name": name, "fromName": name, "origin": origin } });
    notifier.notify(principal, None, &notification).await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_notice_id_is_stable_per_item() {
        let a = notice_id("mastodon", "ann@m.social", "1");
        assert_eq!(a, notice_id("mastodon", "ann@m.social", "1"));
        assert_ne!(a, notice_id("mastodon", "ann@m.social", "2"));
        assert!(a.starts_with("social_mastodon_"));
    }

    #[test]
    fn the_origin_carries_the_reply_route() {
        let item = Received {
            kind: "dm",
            thread: "t".into(),
            remote_id: "m1".into(),
            author: author("u", "Ann", "ann", ""),
            reply: reply("dm", Some(86_400_000), None),
            ..Received::default()
        };
        let origin = origin("instagram", "178", &item);
        assert_eq!(origin["reply"]["mode"], "dm");
        assert_eq!(origin["reply"]["until"], "1970-01-02T00:00:00.000Z");
        assert_eq!(origin["author"]["handle"], "ann");
        assert_eq!(origin["author"]["avatar_url"], JsonValue::Null);
    }
}
