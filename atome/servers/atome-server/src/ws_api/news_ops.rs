// The `news`, `community` and `forum` families of `/ws/api` (server/ws_api_message_handlers.js
// `handleWsNewsRequest`, `handleWsMembershipRequest`, ported): decided by social/news/.
// The connection says who it is (identity.rs `connection_of`); each recipient's notice goes
// to their live connections or their queue (social/live.rs); the pushes to their devices leave
// after the answer.
use super::Connection;
use crate::social::push::Audience;
use crate::social::{Notice, live};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const KINDS: [&str; 3] = ["news", "community", "forum"];

async fn decide(
    connection: &Connection,
    message: &JsonValue,
    kind: &str,
    user: &str,
    out: &mut Vec<Notice>,
) -> Result<JsonValue, String> {
    let news = &connection.ws_api.social.news;
    match kind {
        "news" => {
            if js::text(message.get("action")).to_lowercase() == "publish"
                && !news.publish_rate.allowed(user)
            {
                return Err("news_rate_limited".into());
            }
            news.handle(message, user, out).await
        }
        "community" => news.community(message, user, out).await,
        _ => news.forum(message, user, out).await,
    }
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let kind = js::text(message.get("type"));
    let front = connection
        .connection_of(json!({ "message": message }))
        .await;
    let mut notices = Vec::new();
    let outcome = match front {
        Ok(front) if front.get("session_error").is_some() => {
            connection.reply(front["session_error"].clone()).await;
            return;
        }
        Ok(front) => match front.get("principal").and_then(JsonValue::as_str) {
            Some(user) if front.get("provisioned") == Some(&json!(true)) => {
                decide(&connection, &message, &kind, user, &mut notices).await
            }
            _ => Err(format!("{kind}_auth_required")),
        },
        Err(error) => Err(error),
    };
    // Each notice stored reaches its recipient live, else their queue, before the answer.
    for notice in &notices {
        live::deliver(&notice.target, &notice.frame).await;
    }
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!(format!("{kind}-response")));
    if let Some(request_id) = js::first(&message, &["requestId", "request_id"]) {
        reply.insert("requestId".into(), request_id.clone());
    }
    match outcome {
        Ok(result) => {
            reply.insert(
                "success".into(),
                json!(result.get("ok") != Some(&json!(false))),
            );
            if let JsonValue::Object(fields) = result {
                reply.extend(fields);
            }
        }
        Err(error) => {
            reply.insert("success".into(), json!(false));
            reply.insert("error".into(), json!(error));
        }
    }
    connection.reply(JsonValue::Object(reply)).await;
    for notice in notices {
        if let Some(push) = notice.push {
            // Its outcome reaches nobody: the notice is stored and answered.
            let _ = connection
                .ws_api
                .social
                .push
                .deliver(&notice.target, &push, &Audience::default())
                .await;
        }
    }
}
