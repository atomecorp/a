// The communication services Fastify kept in the central database
// (server/notificationStack.js, communication_relations.js, communication_push.js and
// their neighbours), ported one by one, each on its own connection to that database.
pub mod coaches;
pub(crate) mod conditions;
mod contact_book;
pub mod contract;
pub mod direct_messages;
pub mod directory;
pub mod live;
pub mod message_guard;
mod message_store;
pub mod news;
mod notice;
pub mod notification_stack;
pub mod objective_network;
pub mod permissions;
pub mod phone;
pub mod privacy_rules;
pub mod public_events;
pub mod push;
pub mod rate;
pub mod relations;
pub mod request_guard;
pub mod sharing;
pub mod shop;
pub mod surfaces;

pub use notice::Notice;
pub use notification_stack::NotificationStack;
pub use relations::Relations;

use crate::media::Storage;
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::ws_sync::SyncRuntime;
use serde_json::Value as JsonValue;
use std::path::Path;
use std::sync::Arc;

pub struct Social {
    pub stack: NotificationStack,
    pub relations: Relations,
    pub push: Arc<push::Push>,
    // A notice told to one person (a relation's peer, a website's contact form, a scheduled send's owner).
    pub notifier: live::Notifier,
    pub messages: direct_messages::DirectMessages,
    pub news: news::News,
    pub directory: directory::Directory,
    pub sharing: sharing::Sharing,
    pub objectives: objective_network::ObjectiveNetwork,
    pub events: public_events::PublicEvents,
    pub shop: shop::Shop,
    pub coaches: coaches::Coaches,
    pub surfaces: surfaces::Surfaces,
    // The devices following the streams (/ws/sync), told each committed event.
    pub sync: Arc<SyncRuntime>,
}

impl Social {
    /// On the central database at `central`, the people's vaults and files, the push transports
    /// from the environment, the devices following the directory's stream.
    pub fn open(
        central: &Path,
        router: Arc<VaultRouter>,
        storage: Arc<Storage>,
        sync: Arc<SyncRuntime>,
    ) -> Result<Arc<Self>, String> {
        let push = Arc::new(push::Push::new(
            Central::open(central)?,
            Arc::new(push::Apns::from_environment()?),
            Arc::new(push::Fcm::from_environment()?),
        ));
        let notifier = || -> Result<live::Notifier, String> {
            Ok(live::Notifier {
                stack: NotificationStack::new(Central::open(central)?),
                push: push.clone(),
            })
        };
        Ok(Arc::new(Self {
            stack: NotificationStack::new(Central::open(central)?),
            relations: Relations::new(Central::open(central)?),
            notifier: notifier()?,
            messages: direct_messages::DirectMessages::new(Central::open(central)?, router.clone()),
            news: news::News::new(
                Central::open(central)?,
                router.clone(),
                storage,
                NotificationStack::new(Central::open(central)?),
            ),
            directory: directory::Directory::new(
                Central::open(central)?,
                router.clone(),
                sync.clone(),
            ),
            objectives: objective_network::ObjectiveNetwork::new(
                Central::open(central)?,
                router.clone(),
            ),
            events: public_events::PublicEvents::new(
                Central::open(central)?,
                router.clone(),
                sync.clone(),
            ),
            shop: shop::Shop::new(
                Central::open(central)?,
                router.clone(),
                sync.clone(),
                notifier()?,
            ),
            coaches: coaches::Coaches::new(
                Central::open(central)?,
                router.clone(),
                sync.clone(),
                notifier()?,
            ),
            surfaces: surfaces::Surfaces::new(
                Central::open(central)?,
                router.clone(),
                sync.clone(),
            ),
            sharing: sharing::Sharing::new(
                Central::open(central)?,
                router,
                sync.clone(),
                NotificationStack::new(Central::open(central)?),
                Relations::new(Central::open(central)?),
            ),
            push,
            sync,
        }))
    }

    /// The SERVICE frames of Fastify's thin clients, `None` for another prefix.
    pub async fn service(
        &self,
        operation: &str,
        payload: &JsonValue,
    ) -> Option<Result<JsonValue, String>> {
        let (prefix, _) = operation.split_once(':')?;
        Some(match prefix {
            "stack" => self.stack.service(operation, payload).await,
            "relations" => self.relations_service(operation, payload).await,
            "push" => self.push.service(operation, payload).await,
            "messages" => self.messages_service(operation, payload).await,
            "news" => self.news_service(operation, payload).await,
            "directory" => self.directory.service(operation, payload).await,
            _ => return None,
        })
    }

    // A relation's decision; its `accepted` effects (a note made a first message) are carried
    // out here, what remains (peers to tell) is the caller's.
    async fn relations_service(
        &self,
        operation: &str,
        payload: &JsonValue,
    ) -> Result<JsonValue, String> {
        let decided = self.relations.service(operation, payload).await?;
        let mut rest = Vec::new();
        for effect in decided["effects"].as_array().into_iter().flatten() {
            if effect["effect"] == "accepted" {
                self.messages.accepted(effect).await?;
            } else {
                rest.push(effect.clone());
            }
        }
        Ok(serde_json::json!({ "result": decided["result"], "effects": rest }))
    }

    // `messages:send` answers what the send leaves to its caller (the frame to deliver, the
    // notice to push); `messages:conversation` reads or deletes.
    async fn messages_service(
        &self,
        operation: &str,
        payload: &JsonValue,
    ) -> Result<JsonValue, String> {
        let user = crate::vault_router::js::id(payload.get("user"));
        let data = payload
            .get("data")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        match operation {
            "messages:send" => {
                let sent = self.messages.send(&self.stack, &user, &data).await?;
                Ok(
                    serde_json::json!({ "result": sent.result, "target": sent.target, "deliver": sent.deliver, "push": sent.push }),
                )
            }
            "messages:conversation" => self.messages.conversation(&user, &data).await,
            "messages:read" => self.messages.read(&user, &data).await,
            "messages:persist" => {
                let owner = crate::vault_router::js::id(payload.get("owner"));
                self.messages
                    .persist(
                        &owner,
                        payload.get("properties").unwrap_or(&JsonValue::Null),
                    )
                    .await
            }
            other => Err(format!("messages_operation_unknown:{other}")),
        }
    }

    // A News decided for Fastify (a scheduled publication, a file read through a News): its
    // answer and each recipient's notice, carried by the thin client.
    async fn news_service(
        &self,
        operation: &str,
        payload: &JsonValue,
    ) -> Result<JsonValue, String> {
        let user = crate::vault_router::js::id(payload.get("user"));
        let mut notices = Vec::new();
        let result = match operation {
            "news:publish" => {
                let message = payload.get("message").unwrap_or(&JsonValue::Null);
                self.news.publish(&user, message, &mut notices).await?
            }
            "news:can-read-media" => {
                let at = |key: &str| crate::vault_router::js::text(payload.get(key));
                serde_json::json!(
                    self.news
                        .can_read_media(&user, &at("atome_id"), &at("owner_id"), &mut notices)
                        .await?
                )
            }
            other => return Err(format!("news_operation_unknown:{other}")),
        };
        let notices: Vec<JsonValue> = notices.iter().map(Notice::carried).collect();
        Ok(serde_json::json!({ "result": result, "notices": notices }))
    }
}
