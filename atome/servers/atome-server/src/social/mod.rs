// The communication services of the central database (server/notificationStack.js,
// communication_relations.js, communication_push.js and their neighbours, ported one by one
// from Fastify, retired), each on its own connection to that database.
pub mod cb;
pub mod coaches;
pub(crate) mod conditions;
mod contact_book;
pub mod contract;
pub mod direct_messages;
pub mod directory;
pub mod live;
pub mod message_guard;
mod message_store;
pub mod moderation;
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
    // The CB sociale's `cb` family (cb/): zones, the recording notice, its reports and blocks, the bottles.
    pub cb: cb::Cb,
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
                storage.clone(),
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
            cb: cb::Cb::new(
                Central::open(central)?,
                router.clone(),
                sync.clone(),
                storage.clone(),
                notifier()?,
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
}
