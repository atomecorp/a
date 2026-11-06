// The News (server/news_broadcast.js, ported; done/communication_news_broadcast_2026-09-30.md):
// a publication stored once, then its recipients chosen here —
// - audience 'all': every account (subscribed by default), never its author;
// - `{ group: [ids] }`: those people, when in contact with the author;
// - never anyone blocking or blocked by the author;
// - the recipient's whitelist of tags: empty takes all, else one tag in common;
// - `{ community: id }` / `{ forum: id }`: that circle's members (communities.rs, forums.rs),
//   with no tag filter, its author a member.
// A recipient in failure never stops the next. A VideoTrain origin (`news_thread_ref`) goes to
// chosen people only; a reply is told to its parent's and origin's authors (thread.rs). A media
// leaves as a clean copy (media.rs). Each recipient's notice is stored here; its live frame and
// push are its caller's (`Notice`).
mod communities;
pub mod db;
mod forums;
mod media;
mod publish;
mod reactions;
mod subscriptions;
pub mod tags;
pub mod thread;

use super::NotificationStack;
use super::notice::Notice;
use super::rate::Rate;
use super::relations::can_communicate;
use crate::media::Storage;
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use db::{all, text};
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use subscriptions::subscription;

pub use communities::COMMUNITY_IDS;

/// A community or a forum: an allow-list of members, its posts never leaving them.
#[derive(Clone)]
enum Circle {
    Community(String),
    Forum(String),
}

impl Circle {
    fn of(audience: &JsonValue) -> Option<Self> {
        let named = |key: &str| audience.get(key).and_then(JsonValue::as_str);
        if let Some(id) = named("community").filter(|id| COMMUNITY_IDS.contains(id)) {
            return Some(Self::Community(id.into()));
        }
        named("forum")
            .filter(|id| forums::is_forum_id(id))
            .map(|id| Self::Forum(id.into()))
    }

    fn audience(&self) -> JsonValue {
        match self {
            Self::Community(id) => json!({ "community": id }),
            Self::Forum(id) => json!({ "forum": id }),
        }
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::Community(_) => "community",
            Self::Forum(_) => "forum",
        }
    }
}

pub struct News {
    central: Central,
    router: Arc<VaultRouter>,
    storage: Arc<Storage>,
    stack: NotificationStack,
    // A community is created once, whoever asks first.
    creating: tokio::sync::Mutex<()>,
    // 10 publications per minute per author, on `/ws/api`.
    pub publish_rate: Rate,
}

fn is_object(value: Option<&JsonValue>) -> bool {
    matches!(value, Some(JsonValue::Object(_) | JsonValue::Array(_)))
}

// `Math.max(1, Math.min(max, Number(value) || fallback))`.
fn bounded(value: Option<&JsonValue>, max: f64, fallback: f64) -> i64 {
    js::number_or(value, fallback).clamp(1.0, max) as i64
}

impl News {
    pub fn new(
        central: Central,
        router: Arc<VaultRouter>,
        storage: Arc<Storage>,
        stack: NotificationStack,
    ) -> Self {
        Self {
            central,
            router,
            storage,
            stack,
            creating: tokio::sync::Mutex::new(()),
            publish_rate: Rate::new(10, 60_000),
        }
    }

    async fn db<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Connection) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        self.central.transaction(move |db| work(db)).await
    }

    /// `findUserName`: the account's username, else None.
    async fn user_name(&self, id: &str) -> Option<String> {
        let id = id.to_string();
        self.db(move |db| crate::auth::accounts::find_by_id(db, &id))
            .await
            .ok()
            .flatten()
            .and_then(|user| {
                user.get("username")
                    .and_then(JsonValue::as_str)
                    .map(str::to_string)
            })
            .filter(|name| !name.is_empty())
    }

    async fn is_member(
        &self,
        circle: &Circle,
        user: &str,
        out: &mut Vec<Notice>,
    ) -> Result<bool, String> {
        match circle {
            Circle::Community(id) => self.community_member(id, user, out).await,
            Circle::Forum(id) => {
                let (id, user) = (id.clone(), user.to_string());
                self.db(move |db| forums::is_member(db, &id, &user)).await
            }
        }
    }

    async fn member_ids(
        &self,
        circle: &Circle,
        out: &mut Vec<Notice>,
    ) -> Result<Vec<String>, String> {
        match circle {
            Circle::Community(id) => self.community_member_ids(id, out).await,
            Circle::Forum(id) => {
                let id = id.clone();
                self.db(move |db| forums::member_ids(db, &id)).await
            }
        }
    }

    async fn subscription_of(&self, user: &str) -> Result<JsonValue, String> {
        let user = js::trim(user).to_string();
        self.db(move |db| subscription(db, &user)).await
    }

    async fn resolve_audience(
        &self,
        author: &str,
        audience: &JsonValue,
        out: &mut Vec<Notice>,
    ) -> Result<Vec<String>, String> {
        if let Some(circle) = Circle::of(audience) {
            return Ok(self
                .member_ids(&circle, out)
                .await?
                .into_iter()
                .filter(|id| id != author)
                .collect());
        }
        let author = author.to_string();
        if let Some(group) = audience.get("group").and_then(JsonValue::as_array) {
            let mut ids: Vec<String> = Vec::new();
            for id in group.iter().map(|id| text(Some(id))) {
                if !id.is_empty() && id != author && !ids.contains(&id) {
                    ids.push(id);
                }
            }
            return self
                .db(move |db| {
                    let mut allowed = Vec::new();
                    for id in ids {
                        if can_communicate(db, &author, &id)?["ok"] == true {
                            allowed.push(id);
                        }
                    }
                    Ok(allowed)
                })
                .await;
        }
        self.db(move |db| {
            Ok(all(db, "SELECT atome_id FROM atomes WHERE atome_type = 'user' AND deleted_at IS NULL ORDER BY created_at DESC", &[])?
                .iter()
                .map(|row| text(row.get("atome_id")))
                .filter(|id| !id.is_empty() && *id != author)
                .collect())
        })
        .await
    }

    /// The `news` family: `message.action` for `user`.
    pub async fn handle(
        &self,
        message: &JsonValue,
        user: &str,
        out: &mut Vec<Notice>,
    ) -> Result<JsonValue, String> {
        let action = text(message.get("action")).to_lowercase();
        let thread_ref = text(message.get("threadRef"));
        let on_db = |work: fn(&Connection, &str, &JsonValue) -> Result<JsonValue, String>| {
            let (user, message) = (user.to_string(), message.clone());
            self.db(move |db| work(db, &user, &message))
        };
        match action.as_str() {
            "publish" => self.publish(user, message, out).await,
            "subscriptions-get" => {
                Ok(json!({ "ok": true, "tags": self.subscription_of(user).await? }))
            }
            "subscriptions-set" => self.set_subscriptions(user, message.get("tags")).await,
            "tags-search" => {
                self.search_tags(message.get("query"), message.get("limit"))
                    .await
            }
            "like" => self.like(user, message, out).await,
            "repost" => self.repost(user, message, out).await,
            "thread" => {
                let user = user.to_string();
                self.db(move |db| thread::thread(db, &user, &thread_ref))
                    .await
            }
            "reported" => {
                let user = user.to_string();
                self.db(move |db| thread::reported(db, &user, &thread_ref))
                    .await
            }
            "vote" => on_db(thread::vote).await,
            "report" => on_db(thread::report).await,
            "retire" => on_db(thread::retire).await,
            "dismiss" => on_db(thread::dismiss).await,
            "replies" => on_db(thread::set_replies).await,
            "import-source" => self.import_source(user, message).await,
            "forward" => self.forward(user, message, out).await,
            _ => Err(format!(
                "news_action_unsupported:{}",
                if action.is_empty() {
                    "missing"
                } else {
                    &action
                }
            )),
        }
    }
}
