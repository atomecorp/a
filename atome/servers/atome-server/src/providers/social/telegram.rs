// Telegram (R-190): the person's own bot, an administrator of their channel, entered once in the
// settings (its token and the channel), kept in the vault. Posts in the channel (text, a photo, a
// video); what people write to the bot or in the channel's discussion group read by the polling
// (`getUpdates`), answered in the same chat.
use super::inbox::{self, Polled, Received};
use super::net::{self, Sd, Se};
use super::poll;
use super::reply::Out;
use super::{Config, Ctx, Media};
use crate::providers::http;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

fn method(config: &Config, token: &str, name: &str) -> String {
    format!(
        "{}/bot{token}/{name}",
        config.api("telegram", "https://api.telegram.org")
    )
}

fn call(config: &Config, account: &JsonValue, name: &str) -> String {
    method(config, &net::text(account.get("bot_token")), name)
}

/// A bot token as BotFather gives it.
pub fn token_shaped(token: &str) -> bool {
    let Some((id, secret)) = token.split_once(':') else {
        return false;
    };
    !id.is_empty()
        && id.bytes().all(|c| c.is_ascii_digit())
        && (30..=64).contains(&secret.len())
        && secret
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
}

/// A channel as the person names it: `@name` or its numeric id.
pub fn chat_shaped(chat: &str) -> bool {
    match chat.strip_prefix('@') {
        Some(name) => {
            (4..=32).contains(&name.len())
                && name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
        }
        None => {
            let digits = chat.strip_prefix('-').unwrap_or(chat);
            !digits.is_empty() && digits.len() <= 20 && digits.bytes().all(|c| c.is_ascii_digit())
        }
    }
}

/// Telegram answers `{ ok, result }`; a refusal is classified as any other.
async fn result(request: reqwest::RequestBuilder, reaches: bool) -> Sd<JsonValue> {
    let body = net::fetch(request, reaches).await?;
    if body["ok"] != true {
        return Err(Se::new("social_provider_rejected"));
    }
    Ok(body["result"].clone())
}

/// The bot and its channel checked: the bot exists, the channel is reachable and the bot may
/// post there.
pub async fn connect(config: &Config, fields: &JsonValue, now: i64) -> Sd<JsonValue> {
    let token = js::trim(&net::text(fields.get("bot_token"))).to_string();
    let chat = js::trim(&net::text(fields.get("chat_id"))).to_string();
    if !token_shaped(&token) || !chat_shaped(&chat) {
        return Err(Se::new("social_credentials_invalid"));
    }
    let invalid = |failure: Se| match failure.http_status {
        Some(401 | 404) => Se::new("social_credentials_invalid"),
        _ => failure,
    };
    let bot = result(http::client().get(method(config, &token, "getMe")), false)
        .await
        .map_err(invalid)?;
    let query = net::json_post(
        &method(config, &token, "getChat"),
        &json!({ "chat_id": chat }),
    );
    let found = result(query, false)
        .await
        .map_err(|f| match f.http_status {
            Some(400 | 403) => Se::new("social_credentials_invalid"),
            _ => invalid(f),
        })?;
    let member = net::json_post(
        &method(config, &token, "getChatMember"),
        &json!({ "chat_id": found["id"], "user_id": bot["id"] }),
    );
    let member = result(member, false).await?;
    let admin =
        ["administrator", "creator"].contains(&member["status"].as_str().unwrap_or_default());
    let posts = found["type"] != "channel"
        || member["can_post_messages"] == true
        || member["status"] == "creator";
    if !admin || !posts {
        return Err(Se::new("social_permission_missing"));
    }
    let id = net::text(found.get("id"));
    Ok(
        json!({ "network": "telegram", "account": id, "bot_token": token, "chat_id": id,
        "bot": { "id": net::text(bot.get("id")), "username": net::text(bot.get("username")) },
        "identity": { "id": id, "display_name": net::text(found.get("title")), "username": net::text(found.get("username")) },
        "scopes": [], "connected_at": now }),
    )
}

/// A message's link, for a public channel.
fn link(account: &JsonValue, message: &str) -> JsonValue {
    let name = net::text(account.pointer("/identity/username"));
    if name.is_empty() {
        JsonValue::Null
    } else {
        json!(format!("https://t.me/{name}/{message}"))
    }
}

/// A photo or a video with its caption, as one multipart request.
async fn media_request(
    config: &Config,
    account: &JsonValue,
    chat: &str,
    media: &Media,
    caption: &str,
    reply_to: Option<&str>,
) -> Sd<reqwest::RequestBuilder> {
    let (name, field) = if media.kind == "image" {
        ("sendPhoto", "photo")
    } else {
        ("sendVideo", "video")
    };
    let bytes = tokio::fs::read(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    let mut parts = vec![
        ("chat_id", None, chat.as_bytes().to_vec()),
        (
            field,
            Some((media.name.as_str(), media.mime.as_str())),
            bytes,
        ),
    ];
    if !caption.is_empty() {
        parts.push(("caption", None, caption.as_bytes().to_vec()));
    }
    if let Some(reply_to) = reply_to {
        let reference = json!({ "message_id": reply_to.parse::<i64>().unwrap_or(0) }).to_string();
        parts.push(("reply_parameters", None, reference.into_bytes()));
    }
    let (kind, body) = net::multipart(&parts);
    Ok(http::client()
        .post(call(config, account, name))
        .header("Content-Type", kind)
        .body(body))
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let chat = net::text(ctx.record.get("chat_id"));
    let request = match ctx.media {
        Some(media) => media_request(ctx.config, ctx.record, &chat, media, ctx.text, None).await?,
        None => net::json_post(
            &call(ctx.config, ctx.record, "sendMessage"),
            &json!({ "chat_id": chat, "text": ctx.text }),
        ),
    };
    ctx.hooks.publishing(json!({})).await?;
    let sent = ctx.hooks.reaching(result(request, true)).await?;
    let id = net::text(sent.get("message_id"));
    Ok(
        json!({ "status": "published", "remote": { "message_id": id, "chat_id": chat }, "url": link(ctx.record, &id) }),
    )
}

/// The channel's message removed by the bot.
pub async fn remove(config: &Config, account: &JsonValue, remote: &JsonValue) -> Sd<()> {
    let message = net::text(remote.get("message_id"))
        .parse::<i64>()
        .map_err(|_| Se::new("social_update_unsupported"))?;
    let body = json!({ "chat_id": net::text(remote.get("chat_id")), "message_id": message });
    result(
        net::json_post(&call(config, account, "deleteMessage"), &body),
        true,
    )
    .await
    .map(|_| ())
}

/// The updates read: messages to the bot (a conversation per chat), in the discussion group
/// (comments, by the post they answer); the bot's own never.
pub fn received(updates: &JsonValue, bot: &str) -> (Vec<Received>, Option<i64>) {
    let mut next = None;
    let mut items = Vec::new();
    for update in updates.as_array().into_iter().flatten() {
        next = Some(js::number(update.get("update_id")) as i64 + 1);
        let message = &update["message"];
        let from = &message["from"];
        if !message.is_object() || net::text(from.get("id")) == bot {
            continue;
        }
        let chat = net::text(message.pointer("/chat/id"));
        let id = net::text(message.get("message_id"));
        let private = message.pointer("/chat/type") == Some(&json!("private"));
        let root = net::text(message.pointer("/reply_to_message/message_id"));
        let thread = match (private, root.is_empty()) {
            (true, _) => format!("chat:{chat}"),
            (false, true) => format!("chat:{chat}"),
            (false, false) => format!("chat:{chat}:{root}"),
        };
        let name = [
            net::text(from.get("first_name")),
            net::text(from.get("last_name")),
        ]
        .into_iter()
        .filter(|n| !n.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
        let text = [message.get("text"), message.get("caption")]
            .into_iter()
            .map(net::text)
            .find(|t| !t.is_empty())
            .unwrap_or_default();
        items.push(Received {
            kind: if private { "dm" } else { "comment" },
            thread,
            remote_id: format!("{chat}:{id}"),
            text,
            at: js::number(message.get("date")) as i64 * 1000,
            author: inbox::author(
                &net::text(from.get("id")),
                &name,
                &net::text(from.get("username")),
                "",
            ),
            post: JsonValue::Null,
            reply: inbox::reply(if private { "dm" } else { "comment" }, None, None),
            reference: json!({ "chat": chat, "message": id }),
        });
    }
    (items, next)
}

pub async fn poll(config: &Config, account: &JsonValue) -> Sd<Polled> {
    let offset = poll::cursor(account, "offset").parse::<i64>().unwrap_or(0);
    let body = json!({ "offset": offset, "timeout": 0, "allowed_updates": ["message"] });
    let updates = result(
        net::json_post(&call(config, account, "getUpdates"), &body),
        false,
    )
    .await?;
    let (items, next) = received(&updates, &net::text(account.pointer("/bot/id")));
    Ok(Polled {
        items,
        cursor: next.map(|next| poll::with_cursor(account, &[("offset", json!(next.to_string()))])),
    })
}

pub async fn reply(out: &Out<'_>) -> Sd<String> {
    let (chat, message) = (out.reference("chat"), out.reference("message"));
    let request = match out.media {
        Some(media) => {
            media_request(
                out.config,
                out.account,
                &chat,
                media,
                out.text,
                Some(&message),
            )
            .await?
        }
        None => net::json_post(
            &call(out.config, out.account, "sendMessage"),
            &json!({ "chat_id": chat, "text": out.text,
                "reply_parameters": { "message_id": message.parse::<i64>().unwrap_or(0) } }),
        ),
    };
    let sent = result(request, true).await?;
    Ok(format!("{chat}:{}", net::text(sent.get("message_id"))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bot_and_a_channel_are_shaped() {
        assert!(token_shaped("123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789"));
        assert!(!token_shaped("abc:def"));
        assert!(chat_shaped("@my_channel"));
        assert!(chat_shaped("-1001234567890"));
        assert!(!chat_shaped("my channel"));
        let config = Config::of(&[("SOCIAL_API_BASE_TELEGRAM", "http://127.0.0.1:4100")]);
        assert_eq!(
            method(&config, "1:x", "getMe"),
            "http://127.0.0.1:4100/bot1:x/getMe"
        );
    }

    #[test]
    fn updates_are_read_from_their_offset_and_the_bots_own_skipped() {
        let updates = json!([
            { "update_id": 10, "message": { "message_id": 5, "date": 1_700_000_000, "text": "hello",
                "chat": { "id": 77, "type": "private" }, "from": { "id": 77, "first_name": "Ann", "username": "ann" } } },
            { "update_id": 11, "message": { "message_id": 6, "date": 1_700_000_001, "caption": "nice",
                "chat": { "id": -100, "type": "supergroup" }, "reply_to_message": { "message_id": 2 },
                "from": { "id": 88, "first_name": "Bob" } } },
            { "update_id": 12, "message": { "message_id": 7, "chat": { "id": -100, "type": "supergroup" }, "from": { "id": 1 } } } ]);
        let (items, next) = received(&updates, "1");
        assert_eq!(next, Some(13));
        assert_eq!(items.len(), 2);
        assert_eq!((items[0].kind, items[0].thread.as_str()), ("dm", "chat:77"));
        assert_eq!(items[0].author["name"], "Ann");
        assert_eq!(
            (items[1].kind, items[1].thread.as_str()),
            ("comment", "chat:-100:2")
        );
        assert_eq!(items[1].text, "nice");
        assert_eq!(items[1].reference["message"], "6");
    }
}
