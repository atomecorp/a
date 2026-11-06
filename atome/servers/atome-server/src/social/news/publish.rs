// A News published (server/news_broadcast.js `publish`, `distribute`, ported): its sources
// checked (never a private programme's), its media leaving as clean copies, its circle or
// thread placed, then stored once and told to each recipient it reaches.
use super::db::{get, run, text};
use super::subscriptions::register_tags;
use super::{Circle, News, is_object, tags, thread};
use crate::social::notice::Notice;
use crate::social::relations::blocked_either_way;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

impl News {
    pub async fn publish(
        &self,
        author: &str,
        message: &JsonValue,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let author = js::trim(author).to_string();
        let source = message
            .get("publication")
            .filter(|source| is_object(Some(source)))
            .ok_or("news_publication_required")?;
        let props = source
            .get("properties")
            .filter(|props| js::truthy(Some(props)))
            .and_then(JsonValue::as_object)
            .cloned()
            .unwrap_or_default();
        let source_members = props
            .get("news_payload")
            .and_then(|payload| payload.get("members"))
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default();
        let mut source_ids = vec![
            text(props.get("news_source_project_id")),
            text(source.get("id")),
        ];
        for member in &source_members {
            source_ids.push(text(member.get("id")));
            source_ids.push(text(
                member
                    .get("properties")
                    .and_then(|props| props.get("media_atome_id")),
            ));
        }
        let mut checked: Vec<&String> = Vec::new();
        for id in source_ids.iter().filter(|id| !id.is_empty()) {
            if checked.contains(&id) {
                continue;
            }
            checked.push(id);
            if self
                .router
                .has_private_program_ancestor(&author, id)
                .await?
            {
                return Err("program_sharing_not_finalized".into());
            }
        }
        let news_id = text(
            [props.get("news_id"), source.get("id")]
                .into_iter()
                .find(|value| js::truthy(*value))
                .flatten(),
        );
        let post_id = match [source.get("id"), props.get("news_post_id")]
            .into_iter()
            .find(|value| js::truthy(*value))
            .flatten()
        {
            Some(id) => text(Some(id)),
            None => news_id.clone(),
        };
        if news_id.is_empty() || post_id.is_empty() {
            return Err("news_id_required".into());
        }
        let existing = {
            let post_id = post_id.clone();
            self.db(move |db| {
                get(
                    db,
                    "SELECT author_id FROM news_publications WHERE news_id = ?",
                    &[&post_id],
                )
            })
            .await?
        };
        if existing
            .as_ref()
            .is_some_and(|row| text(row.get("author_id")) != author)
        {
            return Err("news_author_mismatch".into());
        }
        let tags_input = match message.get("tags") {
            Some(JsonValue::Null) | None => props
                .get("news_payload")
                .and_then(|payload| payload.get("tags")),
            tags => tags,
        };
        let tags = tags::normalize(tags_input);
        let author_name = self.user_name(&author).await.unwrap_or_default();
        let mut media = Vec::new();
        let mut members = Vec::new();
        let mut linked = 0;
        for member in &source_members {
            if text(
                member
                    .get("properties")
                    .and_then(|props| props.get("media_atome_id")),
            )
            .is_empty()
            {
                members.push(member.clone());
                continue;
            }
            if let Some(link) = self.link_only_member(&author, member).await? {
                members.push(link);
                linked += 1;
                continue;
            }
            let Some((file, src)) = self.published_media(&author, member).await? else {
                continue;
            };
            media.push(json!(file));
            let properties = js::with(&member["properties"], [("media_src", json!(src))]);
            members.push(js::with(member, [("properties", properties)]));
        }
        let payload = match props.get("news_payload") {
            Some(payload) if is_object(Some(payload)) => {
                Some(js::with(payload, [("members", json!(members))]))
            }
            other => other.cloned(),
        };
        let mut properties = props.clone();
        if let Some(payload) = payload.clone().filter(|payload| js::truthy(Some(payload))) {
            properties.insert("news_payload".into(), payload);
        }
        properties.insert("author_id".into(), json!(author));
        properties.insert("author_name".into(), json!(author_name));
        properties.insert("news_tags".into(), json!(tags));
        let audience_input = message.get("audience");
        let circle = audience_input.and_then(Circle::of);
        if let Some(circle) = &circle
            && !self.is_member(circle, &author, out).await?
        {
            return Err(format!("{}_not_member", circle.kind()));
        }
        let reply = message
            .get("reply")
            .filter(|reply| is_object(Some(reply)))
            .cloned();
        let thread_ref = text(props.get("news_thread_ref"));
        let context = match reply {
            Some(reply) => {
                let author = author.clone();
                Some(
                    self.db(move |db| thread::reply_context(db, &author, &reply))
                        .await?,
                )
            }
            None if !thread_ref.is_empty() => {
                Some(thread::origin_context(&thread_ref, audience_input)?)
            }
            None => None,
        };
        if let Some(context) = &context {
            properties.insert("news_thread_ref".into(), json!(context.thread_ref));
            properties.insert("parent_id".into(), json!(context.parent));
            properties.insert("anchor_ms".into(), json!(context.anchor));
        }
        let audience = match (&context, &circle) {
            (Some(context), _) if context.root.is_some() => json!({ "thread": context.root }),
            (Some(_), _) => {
                json!({ "group": self.resolve_audience(&author, audience_input.unwrap_or(&JsonValue::Null), out).await? })
            }
            (None, Some(circle)) => circle.audience(),
            (None, None) => match audience_input {
                Some(audience) if is_object(Some(audience)) => audience.clone(),
                _ => json!("all"),
            },
        };
        if context
            .as_ref()
            .is_some_and(|context| context.root.is_none())
            && audience["group"].as_array().is_some_and(Vec::is_empty)
        {
            return Err("news_thread_audience_private".into());
        }
        if existing.is_none() {
            let tags = tags.clone();
            self.db(move |db| register_tags(db, &tags)).await?;
        }
        let publication = js::with(
            &js::with(source, [("id", json!(post_id))]),
            [("properties", JsonValue::Object(properties))],
        );
        let project = Some(text(props.get("news_source_project_id"))).filter(|id| !id.is_empty());
        let mut sent = self
            .distribute(
                &author,
                &post_id,
                project,
                publication,
                json!(tags),
                audience,
                json!(media),
                context,
                out,
            )
            .await?;
        if linked > 0 {
            sent["link_only"] = json!(linked);
        }
        Ok(sent)
    }

    /// A publication stored once, then delivered to its audience (blocks and tag whitelists respected).
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn distribute(
        &self,
        author: &str,
        post_id: &str,
        project: Option<String>,
        publication: JsonValue,
        tags: JsonValue,
        audience: JsonValue,
        media: JsonValue,
        context: Option<thread::Context>,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let props = publication
            .get("properties")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let title = text(props.get("title"));
        let preview = text(props.get("preview"));
        {
            let (author, post_id) = (author.to_string(), post_id.to_string());
            let values = (
                title.clone(),
                preview.clone(),
                atome_store::intent::js_stringify(&tags),
                atome_store::intent::js_stringify(&audience),
                atome_store::intent::js_stringify(&publication),
                atome_store::intent::js_stringify(&media),
            );
            let thread = context.as_ref().map(|context| {
                (
                    context.thread_ref.clone(),
                    context.root.clone(),
                    context.parent.clone(),
                    context.anchor,
                )
            });
            self.db(move |db| {
                let (thread_ref, root, parent, anchor) = match thread {
                    Some((thread_ref, root, parent, anchor)) => (Some(thread_ref).filter(|r| !r.is_empty()), root.filter(|r| !r.is_empty()),
                        parent.filter(|p| !p.is_empty()), anchor),
                    None => (None, None, None, None),
                };
                run(db,
                    "INSERT INTO news_publications (news_id, author_id, project_id, title, summary, tags_json, audience_json, payload_json, media_json,
                     thread_ref, root_id, parent_id, anchor_ms)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(news_id) DO UPDATE SET title = excluded.title, summary = excluded.summary,
                     tags_json = excluded.tags_json, audience_json = excluded.audience_json,
                     payload_json = excluded.payload_json, media_json = excluded.media_json, updated_at = datetime('now')",
                    &[&post_id, &author, &project, &values.0, &values.1, &values.2, &values.3, &values.4, &values.5,
                        &thread_ref, &root, &parent, &anchor])
            })
            .await?;
        }
        let candidates = match context
            .as_ref()
            .and_then(|context| context.root.as_ref().map(|_| context.parent.clone()))
        {
            Some(parent) => {
                let (author, parent) = (author.to_string(), parent.unwrap_or_default());
                self.db(move |db| thread::reply_recipients(db, &author, &parent))
                    .await?
            }
            None => self.resolve_audience(author, &audience, out).await?,
        };
        let filtered_by_tags = Circle::of(&audience).is_none() && context.is_none();
        let mut result = json!({ "ok": true, "news_id": post_id, "tags": tags, "delivered": 0, "filtered": 0,
            "blocked": 0, "failed": 0, "recipients": [] });
        let count = |result: &mut JsonValue, key: &str| {
            result[key] = json!(result[key].as_i64().unwrap_or(0) + 1)
        };
        let notification = json!({ "kind": "publication", "id": post_id,
            "subject": if title.is_empty() { JsonValue::Null } else { json!(title) }, "message": preview, "publication": publication });
        for user in candidates {
            let step: Result<&str, String> = async {
                let (a, b) = (author.to_string(), user.clone());
                if self.db(move |db| blocked_either_way(db, &a, &b)).await? {
                    return Ok("blocked");
                }
                if filtered_by_tags && !tags::accepts(&self.subscription_of(&user).await?, &tags) {
                    return Ok("filtered");
                }
                out.push(
                    self.stack
                        .notice(&user, Some(author), &notification)
                        .await?,
                );
                Ok("delivered")
            }
            .await;
            match step {
                Ok("delivered") => {
                    count(&mut result, "delivered");
                    result["recipients"]
                        .as_array_mut()
                        .expect("recipients")
                        .push(json!(user));
                }
                Ok(outcome) => count(&mut result, outcome),
                Err(_) => count(&mut result, "failed"),
            }
        }
        Ok(result)
    }
}
