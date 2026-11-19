// What Meta's webhook tells (R-190): a Page's Messenger messages and comments, an Instagram
// professional account's direct messages and comments, Threads' replies and mentions, each named
// by the account it reached (`owner`). Messenger and Instagram answer a direct message within
// 24 hours of it; Instagram answers a comment privately once, within 7 days. The replies go back
// through the same Graph APIs.
use super::inbox::{self, Received};
use super::net::{self, Sd, Se};
use super::network::Network;
use super::reply::Out;
use super::{Config, facebook, instagram, threads};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const DAY_MS: i64 = 86_400_000;

/// One item for the account `owner` names.
pub struct Told {
    pub network: Network,
    pub owner: String,
    pub item: Received,
}

fn seconds(value: Option<&JsonValue>) -> i64 {
    match value {
        Some(JsonValue::String(text)) => net::millis(text),
        other => js::number(other) as i64 * 1000,
    }
}

fn messaging(network: Network, owner: &str, entry: &JsonValue) -> Vec<Told> {
    let mut told = Vec::new();
    for event in entry["messaging"].as_array().into_iter().flatten() {
        let sender = net::text(event.pointer("/sender/id"));
        let message = &event["message"];
        if !message.is_object()
            || message["is_echo"] == true
            || sender == owner
            || sender.is_empty()
        {
            continue;
        }
        let at = js::number(event.get("timestamp")) as i64;
        told.push(Told {
            network,
            owner: owner.into(),
            item: Received {
                kind: "dm",
                thread: sender.clone(),
                remote_id: net::text(message.get("mid")),
                text: net::text(message.get("text")),
                at,
                author: inbox::author(&sender, "", "", ""),
                post: JsonValue::Null,
                reply: inbox::reply("dm", Some(at + DAY_MS), None),
                reference: json!({ "recipient": sender }),
            },
        });
    }
    told
}

fn page_change(owner: &str, value: &JsonValue, time: i64) -> Option<Told> {
    let from = &value["from"];
    let fresh = value["item"] == "comment" && value["verb"] == "add";
    if !fresh || net::text(from.get("id")) == owner {
        return None;
    }
    let comment = net::text(value.get("comment_id"));
    let post = net::text(value.get("post_id"));
    let at = match seconds(value.get("created_time")) {
        0 => time,
        at => at,
    };
    Some(Told {
        network: Network::Facebook,
        owner: owner.into(),
        item: Received {
            kind: "comment",
            thread: post.clone(),
            remote_id: comment.clone(),
            text: net::text(value.get("message")),
            at,
            author: inbox::author(
                &net::text(from.get("id")),
                &net::text(from.get("name")),
                "",
                "",
            ),
            post: inbox::post(&post, ""),
            reply: inbox::reply("comment", None, None),
            reference: json!({ "comment": comment }),
        },
    })
}

fn instagram_change(owner: &str, value: &JsonValue, time: i64) -> Option<Told> {
    let from = &value["from"];
    let comment = net::text(value.get("id"));
    if comment.is_empty() || net::text(from.get("id")) == owner {
        return None;
    }
    let media = net::text(value.pointer("/media/id"));
    let handle = net::text(from.get("username"));
    Some(Told {
        network: Network::Instagram,
        owner: owner.into(),
        item: Received {
            kind: "comment",
            thread: media.clone(),
            remote_id: comment.clone(),
            text: net::text(value.get("text")),
            at: time,
            author: inbox::author(&net::text(from.get("id")), &handle, &handle, ""),
            post: inbox::post(&media, ""),
            reply: inbox::reply("comment", None, Some(time + 7 * DAY_MS)),
            reference: json!({ "comment": comment }),
        },
    })
}

fn threads_value(field: &str, value: &JsonValue, target: &str) -> Option<Told> {
    let root = &value["root_post"];
    let owner = [net::text(root.get("owner_id")), target.to_string()]
        .into_iter()
        .find(|id| !id.is_empty())?;
    let id = net::text(value.get("id"));
    if id.is_empty() || !["replies", "mentions"].contains(&field) {
        return None;
    }
    let handle = net::text(value.get("username"));
    let thread = [net::text(root.get("id")), id.clone()]
        .into_iter()
        .find(|t| !t.is_empty())
        .unwrap_or_default();
    Some(Told {
        network: Network::Threads,
        owner,
        item: Received {
            kind: if field == "replies" {
                "comment"
            } else {
                "mention"
            },
            thread: thread.clone(),
            remote_id: id.clone(),
            text: net::text(value.get("text")),
            at: net::millis(&net::text(value.get("timestamp"))),
            author: inbox::author("", &handle, &handle, ""),
            post: inbox::post(&thread, &net::text(value.get("permalink"))),
            reply: inbox::reply("comment", None, None),
            reference: json!({ "reply_to": id }),
        },
    })
}

/// Every item of one webhook body.
pub fn parse(body: &JsonValue) -> Vec<Told> {
    let object = body["object"].as_str().unwrap_or_default();
    let mut told = Vec::new();
    if let Some(values) = body.get("values").filter(|v| v.is_object()) {
        let target = net::text(body.get("target_id"));
        told.extend(threads_value(
            &net::text(values.get("field")),
            &values["value"],
            &target,
        ));
    }
    for entry in body["entry"].as_array().into_iter().flatten() {
        let owner = net::text(entry.get("id"));
        let time = seconds(entry.get("time"));
        let network = match object {
            "page" => Network::Facebook,
            "instagram" => Network::Instagram,
            "threads" => Network::Threads,
            _ => continue,
        };
        if network != Network::Threads {
            told.extend(messaging(network, &owner, entry));
        }
        for change in entry["changes"].as_array().into_iter().flatten() {
            let (field, value) = (net::text(change.get("field")), &change["value"]);
            told.extend(match (network, field.as_str()) {
                (Network::Facebook, "feed") => page_change(&owner, value, time),
                (Network::Instagram, "comments") => instagram_change(&owner, value, time),
                (Network::Threads, field) => threads_value(field, value, &owner),
                _ => None,
            });
        }
    }
    told
}

/// A Page's token, from the account that administers it.
fn page_token(account: &JsonValue, page: &str) -> Sd<String> {
    account["pages"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|p| net::text(p.get("id")) == page)
        .map(|p| net::text(p.get("access_token")))
        .filter(|token| !token.is_empty())
        .ok_or_else(|| Se::new("social_permission_missing"))
}

/// The name of a person who wrote to a Page or a professional account (a webhook gives only
/// their id).
pub async fn name_of(
    config: &Config,
    network: Network,
    account: &JsonValue,
    owner: &str,
    id: &str,
) -> Sd<String> {
    let (url, token, fields) = match network {
        Network::Facebook => (
            facebook::graph(config, &format!("/{id}")),
            page_token(account, owner)?,
            "name",
        ),
        Network::Instagram => (
            format!(
                "{}/{}/{id}",
                instagram::graph_host(config),
                instagram::VERSION
            ),
            net::text(account.get("access_token")),
            "name,username",
        ),
        _ => return Ok(String::new()),
    };
    let url = format!(
        "{url}?{}",
        form(&[("fields", fields), ("access_token", token.as_str())])
    );
    let body = net::fetch(http::client().get(url), false).await?;
    Ok(
        [net::text(body.get("name")), net::text(body.get("username"))]
            .into_iter()
            .find(|n| !n.is_empty())
            .unwrap_or_default(),
    )
}

pub async fn reply(network: Network, out: &Out<'_>) -> Sd<String> {
    if out.media.is_some() {
        return Err(Se::new("social_media_type_unsupported"));
    }
    let dm = out.origin("kind") == "dm";
    match network {
        Network::Facebook => {
            let page = out.reference("page");
            let token = page_token(out.account, &page)?;
            if dm {
                let body = json!({ "recipient": { "id": out.reference("recipient") },
                    "messaging_type": "RESPONSE", "message": { "text": out.text } });
                let url = format!(
                    "{}?{}",
                    facebook::graph(out.config, &format!("/{page}/messages")),
                    form(&[("access_token", token.as_str())])
                );
                let sent = net::fetch(net::json_post(&url, &body), true).await?;
                return Ok(net::text(sent.get("message_id")));
            }
            let fields = [("message", json!(out.text)), ("access_token", json!(token))];
            let url = facebook::graph(
                out.config,
                &format!("/{}/comments", out.reference("comment")),
            );
            let sent = net::fetch(net::form_post(&url, &fields), true).await?;
            Ok(net::text(sent.get("id")))
        }
        Network::Instagram => {
            let host = format!(
                "{}/{}",
                instagram::graph_host(out.config),
                instagram::VERSION
            );
            let ig = net::text(out.account.pointer("/identity/id"));
            let bearer = format!("Bearer {}", out.token());
            if dm || out.private {
                let recipient = if dm {
                    json!({ "id": out.reference("recipient") })
                } else {
                    json!({ "comment_id": out.reference("comment") })
                };
                let body = json!({ "recipient": recipient, "message": { "text": out.text } });
                let request = net::json_post(&format!("{host}/{ig}/messages"), &body)
                    .header("Authorization", bearer);
                let sent = net::fetch(request, true).await?;
                return Ok(net::text(sent.get("message_id")));
            }
            let fields = [
                ("message", json!(out.text)),
                ("access_token", json!(out.token())),
            ];
            // The media itself commented, or a comment answered.
            let media = out.reference("media");
            let url = if media.is_empty() {
                format!("{host}/{}/replies", out.reference("comment"))
            } else {
                format!("{host}/{media}/comments")
            };
            let sent = net::fetch(net::form_post(&url, &fields), true).await?;
            Ok(net::text(sent.get("id")))
        }
        Network::Threads => {
            threads::answer(
                out.config,
                out.account,
                &out.reference("reply_to"),
                out.text,
            )
            .await
        }
        _ => Err(Se::new("social_reply_unsupported")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_page_message_and_comment_are_read() {
        let body = json!({ "object": "page", "entry": [{ "id": "55", "time": 1_763_290_000,
            "messaging": [
                { "sender": { "id": "u1" }, "recipient": { "id": "55" }, "timestamp": 1_763_290_000_000_i64,
                  "message": { "mid": "m1", "text": "hello" } },
                { "sender": { "id": "55" }, "message": { "mid": "m2", "is_echo": true } } ],
            "changes": [{ "field": "feed", "value": { "item": "comment", "verb": "add", "comment_id": "55_9",
                "post_id": "55_1", "message": "great", "from": { "id": "u2", "name": "Ann" }, "created_time": 1_763_290_100 } }] }] });
        let told = parse(&body);
        assert_eq!(told.len(), 2);
        assert_eq!(
            (told[0].network, told[0].owner.as_str()),
            (Network::Facebook, "55")
        );
        assert_eq!(told[0].item.kind, "dm");
        assert_eq!(
            told[0].item.reply["until"],
            net::iso(1_763_290_000_000 + DAY_MS)
        );
        assert_eq!(
            (told[1].item.kind, told[1].item.thread.as_str()),
            ("comment", "55_1")
        );
        assert_eq!(told[1].item.author["name"], "Ann");
    }

    #[test]
    fn an_instagram_comment_opens_a_seven_day_private_reply() {
        let body = json!({ "object": "instagram", "entry": [{ "id": "178", "time": 1_763_290_000,
            "changes": [{ "field": "comments", "value": { "id": "c1", "text": "wow",
                "from": { "id": "u3", "username": "eve" }, "media": { "id": "m9" } } }] }] });
        let told = parse(&body);
        assert_eq!(told.len(), 1);
        let reply = &told[0].item.reply;
        assert_eq!(
            reply["private_until"],
            net::iso(1_763_290_000_000 + 7 * DAY_MS)
        );
        assert_eq!(told[0].item.thread, "m9");
    }

    #[test]
    fn a_threads_reply_names_its_owner() {
        let body = json!({ "app_id": "1", "target_id": "t", "values": { "field": "replies", "value": {
            "id": "r1", "username": "bob", "text": "yes", "timestamp": "2026-11-16T10:00:00+0000",
            "root_post": { "id": "p1", "owner_id": "777" } } } });
        let told = parse(&body);
        assert_eq!(told.len(), 1);
        assert_eq!(
            (
                told[0].network,
                told[0].owner.as_str(),
                told[0].item.thread.as_str()
            ),
            (Network::Threads, "777", "p1")
        );
    }
}
