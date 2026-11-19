// Bluesky (R-190): the person's PDS through XRPC, every call bound to the account's DPoP key
// (bluesky_auth.rs). Posts with an image or a video blob; replies, mentions and quotes read by
// the polling (`listNotifications`), the direct messages through the chat service
// (`chat.bsky.convo.getLog`); a reply answers in the same thread or the same conversation.
use super::bluesky_auth::{self, Dpop};
use super::inbox::{self, Polled, Received};
use super::net::{self, Sd, Se};
use super::poll;
use super::reply::Out;
use super::{Config, Ctx, Media};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const CHAT: &str = "did:web:api.bsky.chat#bsky_chat";

pub fn needs_refresh(account: &JsonValue, now: i64) -> bool {
    now as f64 >= js::number(account.get("expires_at")) - 120_000.0
}

pub async fn refresh(config: &Config, account: &JsonValue, now: i64) -> Sd<JsonValue> {
    bluesky_auth::refresh(config, account, now).await
}

fn xrpc_url(account: &JsonValue, nsid: &str) -> String {
    format!("{}/xrpc/{nsid}", net::text(account.get("pds")))
}

/// One XRPC call to the PDS: a query (`GET`, its parameters) or a procedure (`POST`, its body).
async fn xrpc(
    account: &JsonValue,
    nsid: &str,
    query: Option<&[(&str, &str)]>,
    body: Option<(&str, Vec<u8>)>,
    proxy: Option<&str>,
    reaches: bool,
) -> Sd<JsonValue> {
    let dpop = Dpop::of(account)?;
    let token = net::text(account.get("access_token"));
    let base = xrpc_url(account, nsid);
    let url = match query {
        Some(pairs) => format!("{base}?{}", form(pairs)),
        None => base.clone(),
    };
    let method = if body.is_some() { "POST" } else { "GET" };
    let build = || {
        let mut request = match &body {
            Some((kind, bytes)) => http::client()
                .post(&url)
                .header("Content-Type", *kind)
                .body(bytes.clone()),
            None => http::client().get(&url),
        };
        if let Some(proxy) = proxy {
            request = request.header("atproto-proxy", proxy);
        }
        request
    };
    let nonce = net::text(account.get("dpop_nonce"));
    let (answer, _) =
        bluesky_auth::call(&dpop, method, &base, &nonce, Some(&token), reaches, build).await?;
    Ok(answer.body)
}

fn procedure(body: &JsonValue) -> Option<(&'static str, Vec<u8>)> {
    Some(("application/json", body.to_string().into_bytes()))
}

pub async fn profile(_config: &Config, account: &JsonValue, actor: &str) -> Sd<JsonValue> {
    xrpc(
        account,
        "app.bsky.actor.getProfile",
        Some(&[("actor", actor)]),
        None,
        None,
        false,
    )
    .await
}

async fn blob(account: &JsonValue, media: &Media) -> Sd<JsonValue> {
    let bytes = tokio::fs::read(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    let uploaded = xrpc(
        account,
        "com.atproto.repo.uploadBlob",
        None,
        Some((media.mime.as_str(), bytes)),
        None,
        false,
    )
    .await?;
    uploaded
        .get("blob")
        .filter(|b| b.is_object())
        .cloned()
        .ok_or_else(|| Se::new("social_provider_rejected"))
}

/// The post record: its text, its media's embed, the thread it answers.
pub fn post_record(
    text: &str,
    at: &str,
    embed: Option<JsonValue>,
    reply: Option<JsonValue>,
) -> JsonValue {
    let mut record = json!({ "$type": "app.bsky.feed.post", "text": text, "createdAt": at });
    if let Some(embed) = embed {
        record["embed"] = embed;
    }
    if let Some(reply) = reply {
        record["reply"] = reply;
    }
    record
}

pub fn embed(media: &Media, blob: JsonValue) -> JsonValue {
    let (width, height) = (
        js::number(media.probe.get("width")),
        js::number(media.probe.get("height")),
    );
    let ratio = (width > 0.0 && height > 0.0)
        .then(|| json!({ "width": width as u64, "height": height as u64 }));
    if media.kind == "image" {
        let mut image = json!({ "alt": "", "image": blob });
        if let Some(ratio) = ratio {
            image["aspectRatio"] = ratio;
        }
        json!({ "$type": "app.bsky.embed.images", "images": [image] })
    } else {
        let mut video = json!({ "$type": "app.bsky.embed.video", "video": blob });
        if let Some(ratio) = ratio {
            video["aspectRatio"] = ratio;
        }
        video
    }
}

async fn create_post(account: &JsonValue, record: JsonValue, reaches: bool) -> Sd<JsonValue> {
    let body = json!({ "repo": net::text(account.get("did")), "collection": "app.bsky.feed.post", "record": record });
    xrpc(
        account,
        "com.atproto.repo.createRecord",
        None,
        procedure(&body),
        None,
        reaches,
    )
    .await
}

/// The post's record removed from the person's repository (only one of theirs).
pub async fn remove(account: &JsonValue, remote: &JsonValue) -> Sd<()> {
    let uri = net::text(remote.get("uri"));
    let did = net::text(account.get("did"));
    let rkey = uri
        .strip_prefix(&format!("at://{did}/app.bsky.feed.post/"))
        .filter(|key| !did.is_empty() && !key.is_empty() && !key.contains('/'))
        .ok_or_else(|| Se::new("social_update_unsupported"))?;
    let body = json!({ "repo": did, "collection": "app.bsky.feed.post", "rkey": rkey });
    xrpc(
        account,
        "com.atproto.repo.deleteRecord",
        None,
        procedure(&body),
        None,
        true,
    )
    .await
    .map(|_| ())
}

pub fn post_url(handle: &str, uri: &str) -> String {
    let key = uri.rsplit('/').next().unwrap_or("");
    format!("https://bsky.app/profile/{handle}/post/{key}")
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let embedded = match ctx.media {
        Some(media) => Some(embed(media, blob(ctx.record, media).await?)),
        None => None,
    };
    let record = post_record(
        ctx.text,
        &net::iso(crate::providers::generation::now_ms()),
        embedded,
        None,
    );
    ctx.hooks.publishing(json!({})).await?;
    let created = ctx
        .hooks
        .reaching(create_post(ctx.record, record, true))
        .await?;
    let uri = net::text(created.get("uri"));
    if uri.is_empty() {
        return Err(Se::reached("social_provider_rejected"));
    }
    let handle = net::text(ctx.record.pointer("/identity/username"));
    Ok(
        json!({ "status": "published", "remote": { "uri": uri, "cid": net::text(created.get("cid")) },
        "url": post_url(&handle, &uri) }),
    )
}

/// Replies, mentions and quotes indexed after the cursor.
pub fn notifications(body: &JsonValue, seen: &str) -> (Vec<Received>, String) {
    let mut latest = seen.to_string();
    let mut items = Vec::new();
    for notice in body["notifications"].as_array().into_iter().flatten() {
        let indexed = net::text(notice.get("indexedAt"));
        let reason = net::text(notice.get("reason"));
        if net::millis(&indexed) <= net::millis(seen)
            || !["reply", "mention", "quote"].contains(&reason.as_str())
        {
            continue;
        }
        if net::millis(&indexed) > net::millis(&latest) {
            latest = indexed.clone();
        }
        let record = &notice["record"];
        let (uri, cid) = (net::text(notice.get("uri")), net::text(notice.get("cid")));
        let root_uri = net::text(record.pointer("/reply/root/uri"));
        let (root_uri, root_cid) = if root_uri.is_empty() {
            (uri.clone(), cid.clone())
        } else {
            (root_uri, net::text(record.pointer("/reply/root/cid")))
        };
        let who = &notice["author"];
        let handle = net::text(who.get("handle"));
        items.push(Received {
            kind: if reason == "reply" { "comment" } else { "mention" },
            thread: root_uri.clone(),
            remote_id: uri.clone(),
            text: net::text(record.get("text")),
            at: match net::millis(&net::text(record.get("createdAt"))) {
                0 => net::millis(&indexed),
                created => created,
            },
            author: inbox::author(&net::text(who.get("did")), &net::text(who.get("displayName")), &handle,
                &net::text(who.get("avatar"))),
            post: inbox::post(&root_uri, &post_url(&handle, &root_uri)),
            reply: inbox::reply("comment", None, None),
            reference: json!({ "uri": uri, "cid": cid, "root_uri": root_uri, "root_cid": root_cid }),
        });
    }
    (items, latest)
}

/// The messages of the chat log, the account's own left out; each conversation its thread.
pub fn messages(body: &JsonValue, own: &str) -> Vec<Received> {
    let mut items = Vec::new();
    for log in body["logs"].as_array().into_iter().flatten() {
        let message = &log["message"];
        let sender = net::text(message.pointer("/sender/did"));
        if net::text(log.get("$type")) != "chat.bsky.convo.defs#logCreateMessage" || sender == own {
            continue;
        }
        let convo = net::text(log.get("convoId"));
        items.push(Received {
            kind: "dm",
            thread: format!("convo:{convo}"),
            remote_id: net::text(message.get("id")),
            text: net::text(message.get("text")),
            at: net::millis(&net::text(message.get("sentAt"))),
            author: inbox::author(&sender, "", "", ""),
            post: JsonValue::Null,
            reply: inbox::reply("dm", None, None),
            reference: json!({ "convo": convo }),
        });
    }
    items
}

async fn chat(account: &JsonValue) -> Sd<(Vec<Received>, String)> {
    let cursor = poll::cursor(account, "chat");
    let pairs: Vec<(&str, &str)> = if cursor.is_empty() {
        vec![]
    } else {
        vec![("cursor", cursor.as_str())]
    };
    let body = xrpc(
        account,
        "chat.bsky.convo.getLog",
        Some(&pairs),
        None,
        Some(CHAT),
        false,
    )
    .await?;
    let mut items = messages(&body, &net::text(account.get("did")));
    let senders: Vec<String> = items
        .iter()
        .map(|i| net::text(i.author.get("id")))
        .collect();
    for (item, sender) in items.iter_mut().zip(senders) {
        let profile = xrpc(
            account,
            "app.bsky.actor.getProfile",
            Some(&[("actor", sender.as_str())]),
            None,
            None,
            false,
        )
        .await?;
        item.author = inbox::author(
            &sender,
            &net::text(profile.get("displayName")),
            &net::text(profile.get("handle")),
            &net::text(profile.get("avatar")),
        );
    }
    Ok((items, net::text(body.get("cursor"))))
}

pub async fn poll(_config: &Config, account: &JsonValue) -> Sd<Polled> {
    let seen = poll::cursor(account, "seen");
    let body = xrpc(
        account,
        "app.bsky.notification.listNotifications",
        Some(&[("limit", "50")]),
        None,
        None,
        false,
    )
    .await?;
    let (mut items, latest) = notifications(&body, &seen);
    let mut pairs = vec![("seen", json!(latest))];
    // The chat needs its own consent (`transition:chat.bsky`): its refusal leaves the posts' replies.
    match chat(account).await {
        Ok((messages, cursor)) => {
            items.extend(messages);
            if !cursor.is_empty() {
                pairs.push(("chat", json!(cursor)));
            }
        }
        Err(failure) => eprintln!("[social] bluesky chat not read: {}", failure.code),
    }
    Ok(Polled {
        items,
        cursor: Some(poll::with_cursor(account, &pairs)),
    })
}

pub async fn reply(out: &Out<'_>) -> Sd<String> {
    if out.origin("kind") == "dm" {
        if out.media.is_some() {
            return Err(Se::new("social_media_type_unsupported"));
        }
        let body = json!({ "convoId": out.reference("convo"), "message": { "text": out.text } });
        let sent = xrpc(
            out.account,
            "chat.bsky.convo.sendMessage",
            None,
            procedure(&body),
            Some(CHAT),
            true,
        )
        .await?;
        return Ok(net::text(sent.get("id")));
    }
    let embedded = match out.media {
        Some(media) => Some(embed(media, blob(out.account, media).await?)),
        None => None,
    };
    let thread = json!({ "root": { "uri": out.reference("root_uri"), "cid": out.reference("root_cid") },
        "parent": { "uri": out.reference("uri"), "cid": out.reference("cid") } });
    let record = post_record(
        out.text,
        &net::iso(crate::providers::generation::now_ms()),
        embedded,
        Some(thread),
    );
    let created = create_post(out.account, record, true).await?;
    Ok(net::text(created.get("uri")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notifications_after_the_cursor_carry_their_thread() {
        let body = json!({ "notifications": [
            { "uri": "at://did:plc:b/app.bsky.feed.post/2", "cid": "c2", "reason": "reply", "indexedAt": "2026-11-16T10:00:00Z",
              "author": { "did": "did:plc:b", "handle": "bob.bsky.social", "displayName": "Bob" },
              "record": { "text": "yes", "createdAt": "2026-11-16T09:59:00Z",
                "reply": { "root": { "uri": "at://did:plc:a/app.bsky.feed.post/1", "cid": "c1" }, "parent": { "uri": "x", "cid": "y" } } } },
            { "uri": "at://x/like", "reason": "like", "indexedAt": "2026-11-16T11:00:00Z", "author": {}, "record": {} },
            { "uri": "at://old", "reason": "mention", "indexedAt": "2026-11-15T10:00:00Z", "author": {}, "record": {} } ] });
        let (items, latest) = notifications(&body, "2026-11-16T00:00:00Z");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].thread, "at://did:plc:a/app.bsky.feed.post/1");
        assert_eq!(items[0].reference["root_cid"], "c1");
        assert_eq!(items[0].author["name"], "Bob");
        assert_eq!(latest, "2026-11-16T10:00:00Z");
    }

    #[test]
    fn chat_messages_from_others_are_conversations() {
        let body = json!({ "logs": [
            { "$type": "chat.bsky.convo.defs#logCreateMessage", "convoId": "k",
              "message": { "id": "m1", "text": "hi", "sender": { "did": "did:plc:b" }, "sentAt": "2026-11-16T10:00:00Z" } },
            { "$type": "chat.bsky.convo.defs#logCreateMessage", "convoId": "k",
              "message": { "id": "m2", "text": "mine", "sender": { "did": "did:plc:a" } } },
            { "$type": "chat.bsky.convo.defs#logBeginConvo", "convoId": "k" } ] });
        let items = messages(&body, "did:plc:a");
        assert_eq!(items.len(), 1);
        assert_eq!(
            (
                items[0].thread.as_str(),
                items[0].reference["convo"].as_str()
            ),
            ("convo:k", Some("k"))
        );
    }

    #[test]
    fn a_reply_record_names_its_root_and_parent() {
        let record = post_record(
            "ok",
            "2026-11-16T00:00:00.000Z",
            None,
            Some(
                json!({ "root": { "uri": "r", "cid": "rc" }, "parent": { "uri": "p", "cid": "pc" } }),
            ),
        );
        assert_eq!(record["reply"]["parent"]["cid"], "pc");
        assert_eq!(
            post_url("ann.bsky.social", "at://did/app.bsky.feed.post/3k"),
            "https://bsky.app/profile/ann.bsky.social/post/3k"
        );
    }
}
