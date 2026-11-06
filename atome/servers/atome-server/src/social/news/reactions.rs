// What a recipient does with a News received (server/news_broadcast.js, ported): like it
// (its author alone learns it), take it up again to their own audience, and for a VideoTrain
// contribution take its media into their own or send it to other chosen people.
use super::db::{parsed, text};
use super::{Circle, News, tags, thread};
use crate::social::notice::Notice;
use crate::social::relations::blocked_either_way;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

impl News {
    // A publication `user` received: one of its audience, neither side blocking the other.
    pub(super) async fn received(
        &self,
        user: &str,
        news_id: Option<&JsonValue>,
        out: &mut Vec<Notice>,
    ) -> Result<Option<JsonValue>, String> {
        let (user, id) = (js::trim(user).to_string(), text(news_id));
        let row = {
            let user = user.clone();
            self.db(move |db| {
                let row = thread::row_of(db, &id)?;
                match row {
                    Some(row)
                        if text(row.get("author_id")) != user
                            && !blocked_either_way(db, &text(row.get("author_id")), &user)? =>
                    {
                        if !text(row.get("thread_ref")).is_empty() {
                            let readable = thread::readable(db, &user, Some(&row))?
                                && !js::truthy(row.get("retired_at"));
                            return Ok(readable.then_some(row).map(|row| (row, true)));
                        }
                        Ok(Some((row, false)))
                    }
                    _ => Ok(None),
                }
            })
            .await?
        };
        let Some((row, settled)) = row else {
            return Ok(None);
        };
        if settled {
            return Ok(Some(row));
        }
        let audience = parsed(row.get("audience_json"), json!("all"));
        if let Some(circle) = Circle::of(&audience) {
            return Ok(self.is_member(&circle, &user, out).await?.then_some(row));
        }
        let reached = match thread::group_of(&audience) {
            Some(group) => group.contains(&user),
            None => tags::accepts(
                &self.subscription_of(&user).await?,
                &parsed(row.get("tags_json"), json!([])),
            ),
        };
        Ok(reached.then_some(row))
    }

    /// Aimer: the author alone learns it. Unknown or not received: nothing, silently.
    pub(super) async fn like(
        &self,
        user: &str,
        message: &JsonValue,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let Some(row) = self.received(user, message.get("newsId"), out).await? else {
            return Ok(json!({ "ok": true, "delivered": false }));
        };
        let stored = parsed(row.get("payload_json"), json!({}));
        let title = stored
            .get("properties")
            .and_then(|props| props.get("title"));
        let title = text(if js::truthy(title) {
            title
        } else {
            row.get("title")
        });
        let user = js::trim(user);
        let notification = json!({ "kind": "news-like", "id": format!("like_{}_{user}", text(row.get("news_id"))),
            "subject": if title.is_empty() { JsonValue::Null } else { json!(title) }, "message": title });
        out.push(
            self.stack
                .notice(&text(row.get("author_id")), Some(user), &notification)
                .await?,
        );
        Ok(json!({ "ok": true, "delivered": true }))
    }

    /// Reprendre: the publication again, to the reposter's audience, credited to its author; a
    /// community's or a forum's post is taken up in it.
    pub(super) async fn repost(
        &self,
        user: &str,
        message: &JsonValue,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let row = self
            .received(user, message.get("newsId"), out)
            .await?
            .ok_or("news_not_found")?;
        if !text(row.get("thread_ref")).is_empty() {
            return Err("news_thread_private".into());
        }
        let source = parsed(row.get("payload_json"), JsonValue::Null);
        let Some(props) = source
            .get("properties")
            .filter(|props| js::truthy(Some(props)))
        else {
            return Err("news_not_found".into());
        };
        let user = js::trim(user).to_string();
        let news_id = text(row.get("news_id"));
        let post_id = format!("repost_{news_id}_{user}");
        let origin = props
            .get("reposted_from")
            .filter(|origin| js::truthy(Some(origin)))
            .cloned()
            .unwrap_or_else(|| json!({ "news_id": row["news_id"], "author_id": text(row.get("author_id")), "author_name": text(props.get("author_name")) }));
        let name = self.user_name(&user).await.unwrap_or_default();
        let properties = js::with(
            props,
            [
                ("news_id", json!(post_id)),
                ("news_post_id", json!(post_id)),
                ("news_source_project_id", json!("")),
                ("author_id", json!(user)),
                ("author_name", json!(name)),
                ("reposted_from", origin),
            ],
        );
        let publication = js::with(
            &source,
            [("id", json!(post_id)), ("properties", properties)],
        );
        let audience = Circle::of(&parsed(row.get("audience_json"), json!("all")))
            .map_or(json!("all"), |circle| circle.audience());
        self.distribute(
            &user,
            &post_id,
            None,
            publication,
            parsed(row.get("tags_json"), json!([])),
            audience,
            parsed(row.get("media_json"), json!([])),
            None,
            out,
        )
        .await
    }

    /// VideoTrain « Import »: the contribution's clean copy with its file's name.
    pub(super) async fn import_source(
        &self,
        user: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let (user, message) = (user.to_string(), message.clone());
        let source = self
            .db(move |db| thread::import_source(db, &user, &message))
            .await?;
        let src = text(source.get("media_src"));
        let file = crate::http::uri::decode_uri_component(
            src.split('?')
                .next()
                .unwrap_or_default()
                .rsplit('/')
                .next()
                .unwrap_or_default(),
        )?;
        let meta = self
            .db(move |db| crate::media::files::metadata(db, &file, None))
            .await?;
        let name = meta
            .as_ref()
            .and_then(|meta| js::first(meta, &["original_name", "file_name"]))
            .map(|name| text(Some(name)))
            .unwrap_or_default();
        if name.is_empty() {
            return Err("news_media_missing".into());
        }
        Ok(js::with(&source, [("file_name", json!(name))]))
    }

    /// VideoTrain « Envoi »: one's own contribution sent to other chosen people, a new origin of its thread.
    pub(super) async fn forward(
        &self,
        user: &str,
        message: &JsonValue,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let source = {
            let (user, news_id) = (user.to_string(), message.get("newsId").cloned());
            self.db(move |db| thread::forward_source(db, &user, news_id.as_ref()))
                .await?
        };
        let id = text(message.get("id"));
        if id.is_empty() {
            return Err("news_id_required".into());
        }
        let payload = source
            .get("news_payload")
            .filter(|payload| js::truthy(Some(payload)))
            .cloned()
            .unwrap_or_else(|| json!({}));
        let mut members = payload
            .get("members")
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default();
        members.extend(
            message
                .get("members")
                .and_then(JsonValue::as_array)
                .cloned()
                .unwrap_or_default(),
        );
        let preview = [text(message.get("comment")), text(source.get("preview"))]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        let mut properties: Vec<(&'static str, JsonValue)> = vec![
            ("publication_id", json!(id)),
            ("news_id", json!(id)),
            ("news_post_id", json!(id)),
            ("created_iso", json!(atome_store::append::iso_now())),
            ("preview", json!(preview)),
            (
                "news_payload",
                js::with(&payload, [("members", json!(members))]),
            ),
        ];
        if message.get("allowImport") == Some(&json!(true)) {
            properties.push((thread::IMPORT_PROPERTY, json!(true)));
        }
        let publication = json!({ "id": id, "type": "news_publication", "properties": js::with(&source, properties) });
        let mut forwarded = JsonMap::new();
        forwarded.insert(
            "audience".into(),
            message.get("audience").cloned().unwrap_or(JsonValue::Null),
        );
        forwarded.insert("tags".into(), json!([]));
        forwarded.insert("publication".into(), publication);
        Box::pin(self.publish(user, &JsonValue::Object(forwarded), out)).await
    }
}
