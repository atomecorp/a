// The adapters' requests against a fake provider (R-190): `SOCIAL_API_BASE_<NETWORK>` points
// each network at a local server that records what it is asked and answers as the network
// would, so the request shapes (method, path, authorisation, body) are checked end to end.
use super::reply::Out;
use super::{Config, discord, mastodon, telegram};
use axum::Router;
use axum::body::Bytes;
use axum::http::{HeaderMap, Method, Uri};
use serde_json::{Value as JsonValue, json};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
struct Seen {
    method: String,
    path: String,
    authorization: String,
    body: String,
}

type Answers = fn(&str, &str) -> JsonValue;

/// A provider on a free loopback port answering through `answers(method, path)`.
async fn fake(answers: Answers) -> (String, Arc<Mutex<Vec<Seen>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let kept = seen.clone();
    let app = Router::new().fallback(
        move |method: Method, uri: Uri, headers: HeaderMap, body: Bytes| {
            let kept = kept.clone();
            async move {
                let path = uri
                    .path_and_query()
                    .map_or(uri.path(), |p| p.as_str())
                    .to_string();
                let authorization = headers
                    .get("authorization")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or_default()
                    .to_string();
                let answer = answers(method.as_str(), &path);
                kept.lock().unwrap().push(Seen {
                    method: method.to_string(),
                    path,
                    authorization,
                    body: String::from_utf8_lossy(&body).into_owned(),
                });
                axum::Json(answer)
            }
        },
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{address}"), seen)
}

fn telegram_answers(_: &str, path: &str) -> JsonValue {
    let result = match path.rsplit('/').next().unwrap_or_default() {
        "getMe" => json!({ "id": 42, "username": "eve_bot" }),
        "getChat" => {
            json!({ "id": -1001, "type": "channel", "title": "Studio", "username": "studio" })
        }
        "getChatMember" => json!({ "status": "administrator", "can_post_messages": true }),
        "getUpdates" => {
            json!([{ "update_id": 7, "message": { "message_id": 3, "date": 1_700_000_000,
            "text": "hi", "chat": { "id": 9, "type": "private" }, "from": { "id": 9, "first_name": "Ann" } } }])
        }
        "sendMessage" => json!({ "message_id": 4 }),
        _ => JsonValue::Null,
    };
    json!({ "ok": true, "result": result })
}

#[tokio::test]
async fn telegram_connects_polls_and_replies_through_the_bot_api() {
    let (base, seen) = fake(telegram_answers).await;
    let config = Config::of(&[("SOCIAL_API_BASE_TELEGRAM", base.as_str())]);
    let token = "123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789";
    let fields = json!({ "bot_token": token, "chat_id": "@studio" });
    let account = telegram::connect(&config, &fields, 1).await.unwrap();
    assert_eq!(account["account"], "-1001");
    assert_eq!(account["identity"]["display_name"], "Studio");
    let polled = telegram::poll(&config, &account).await.unwrap();
    assert_eq!(polled.items.len(), 1);
    assert_eq!(polled.cursor.unwrap()["offset"], "8");
    let (origin, reference) = (
        json!({ "kind": "dm" }),
        json!({ "chat": "9", "message": "3" }),
    );
    let out = Out {
        config: &config,
        account: &account,
        origin: &origin,
        reference: &reference,
        text: "thanks",
        private: false,
        media: None,
    };
    assert_eq!(telegram::reply(&out).await.unwrap(), "9:4");
    let seen = seen.lock().unwrap().clone();
    let paths: Vec<_> = seen
        .iter()
        .map(|s| s.path.rsplit('/').next().unwrap().to_string())
        .collect();
    assert_eq!(
        paths,
        [
            "getMe",
            "getChat",
            "getChatMember",
            "getUpdates",
            "sendMessage"
        ]
    );
    assert!(
        seen.iter()
            .all(|s| s.path.starts_with(&format!("/bot{token}/")))
    );
    let chat: JsonValue = serde_json::from_str(&seen[1].body).unwrap();
    assert_eq!(chat, json!({ "chat_id": "@studio" }));
    let sent: JsonValue = serde_json::from_str(&seen[4].body).unwrap();
    assert_eq!(
        sent,
        json!({ "chat_id": "9", "text": "thanks", "reply_parameters": { "message_id": 3 } })
    );
}

fn mastodon_answers(_: &str, path: &str) -> JsonValue {
    match path.split('?').next().unwrap_or_default() {
        "/api/v1/apps" => json!({ "client_id": "cid", "client_secret": "csecret" }),
        "/oauth/token" => json!({ "access_token": "tok", "token_type": "Bearer" }),
        "/api/v1/accounts/verify_credentials" => {
            json!({ "id": "11", "username": "eve", "display_name": "Eve" })
        }
        "/api/v1/notifications" => {
            json!([{ "id": "501", "type": "mention", "created_at": "2026-11-16T10:00:00.000Z",
            "account": { "id": "12", "acct": "bob@other.social", "display_name": "Bob" },
            "status": { "id": "900", "visibility": "direct", "content": "<p>Hello <b>you</b></p>" } }])
        }
        _ => JsonValue::Null,
    }
}

#[tokio::test]
async fn mastodon_registers_on_the_instance_then_exchanges_and_polls() {
    let (base, seen) = fake(mastodon_answers).await;
    let config = Config::of(&[
        ("SOCIAL_API_BASE_MASTODON", base.as_str()),
        ("SOCIAL_PUBLIC_BASE_URL", "https://atome.one"),
    ]);
    let redirect = "https://atome.one/api/social/oauth/callback/mastodon";
    let app = mastodon::register(&config, "Mastodon.Social", redirect)
        .await
        .unwrap();
    assert_eq!(app["host"], "mastodon.social");
    let consent = mastodon::authorize_url(&app, "st", redirect);
    assert!(consent.starts_with(&format!("{base}/oauth/authorize?client_id=cid&")));
    let account = mastodon::exchange(&config, &app, "code1", redirect, 1)
        .await
        .unwrap();
    assert_eq!(account["identity"]["id"], "11");
    let polled = mastodon::poll(&config, &account).await.unwrap();
    assert_eq!(polled.items.len(), 1);
    assert_eq!(polled.items[0].text, "Hello you");
    let seen = seen.lock().unwrap().clone();
    assert_eq!(
        (seen[0].method.as_str(), seen[0].path.as_str()),
        ("POST", "/api/v1/apps")
    );
    assert!(
        seen[0].body.contains("client_name=atome") && seen[0].body.contains("scopes=read+write")
    );
    assert!(
        seen[1].body.contains("grant_type=authorization_code")
            && seen[1].body.contains("code=code1")
    );
    assert_eq!(seen[2].authorization, "Bearer tok");
    assert!(
        seen[3]
            .path
            .starts_with("/api/v1/notifications?types%5B%5D=mention")
    );
    assert_eq!(seen[3].authorization, "Bearer tok");
}

fn discord_answers(_: &str, path: &str) -> JsonValue {
    match path.split('?').next().unwrap_or_default() {
        "/api/webhooks/123/secret-token-abcdefghij0123" => {
            json!({ "id": "123", "name": "Studio", "channel_id": "77", "guild_id": "5" })
        }
        "/api/v10/channels/77" => json!({ "id": "77" }),
        _ => JsonValue::Null,
    }
}

#[tokio::test]
async fn discord_checks_the_webhook_and_the_bot_before_keeping_them() {
    let (base, seen) = fake(discord_answers).await;
    let config = Config::of(&[("SOCIAL_API_BASE_DISCORD", base.as_str())]);
    let fields = json!({ "webhook_url": "https://discord.com/api/webhooks/123/secret-token-abcdefghij0123", "bot_token": "bot-1" });
    let account = discord::connect(&config, &fields, 1).await.unwrap();
    assert_eq!(
        (account["account"].as_str(), account["channel_id"].as_str()),
        (Some("123"), Some("77"))
    );
    assert!(discord::reads(&account));
    let seen = seen.lock().unwrap().clone();
    assert_eq!(
        seen[0].path,
        "/api/webhooks/123/secret-token-abcdefghij0123"
    );
    assert_eq!(
        (seen[1].path.as_str(), seen[1].authorization.as_str()),
        ("/api/v10/channels/77", "Bot bot-1")
    );
}
