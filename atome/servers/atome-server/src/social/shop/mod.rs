// The shop (server/shop.js and ws_shop.js, ported; user decisions of 28 Oct. 2026): the shared base
// of sales (listings.rs), the orders and their escrow (orders.rs, delivery.rs), a sale's private
// conversations (messages.rs). `shop-public` is browsing, open to everyone, visitor and guest
// included (`browse`, `one`); `shop` needs an account (buying, an order's moves, writing to a
// seller, a report). The other side is told in its notifications and every open screen hears a
// sale changed (social/live.rs); the clock (`clock`, started by ws_api `clocks`) releases what
// time makes due every five minutes (two days after a delivery without dispute, an event or
// appointment over), and every orders read releases it too.
pub mod contract;
mod delivery;
mod listings;
mod messages;
mod orders;
mod store;

pub use super::public_events::contract::{clip, parse};

use super::directory::Directory;
use super::live::Notifier;
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use crate::ws_sync::SyncRuntime;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use std::time::Duration;

const TICK: Duration = Duration::from_secs(5 * 60);

pub struct Shop {
    store: store::Store,
    router: Arc<VaultRouter>,
    sync: Arc<SyncRuntime>,
    notifier: Notifier,
}

/// The release clock (server/shop.js `setInterval`): every five minutes, what time made due.
pub async fn clock(social: Arc<super::Social>) {
    loop {
        tokio::time::sleep(TICK).await;
        if let Err(error) = social.shop.tick().await {
            eprintln!("[shop] release clock failed {error}");
        }
    }
}

// `String(value || '')` of a message field, `undefined` read as nothing.
fn raw(value: Option<&JsonValue>) -> String {
    value
        .filter(|value| js::truthy(Some(value)))
        .map(|value| js::text(Some(value)))
        .unwrap_or_default()
}

impl Shop {
    pub fn new(
        central: Central,
        router: Arc<VaultRouter>,
        sync: Arc<SyncRuntime>,
        notifier: Notifier,
    ) -> Self {
        Self {
            store: store::Store { central },
            router,
            sync,
            notifier,
        }
    }

    // `findUserName`: the name the account shares on its public card, '' when none.
    async fn name_of(directory: &Directory, principal: &str) -> String {
        match directory.source_profile(principal).await {
            Ok(Some(profile)) => profile.display_name,
            _ => String::new(),
        }
    }

    async fn blocked(&self, viewer: Option<&str>, other: &str) -> Result<bool, String> {
        let Some(viewer) = viewer.filter(|viewer| !viewer.is_empty() && *viewer != other) else {
            return Ok(false);
        };
        let (viewer, other) = (viewer.to_string(), other.to_string());
        self.store
            .central
            .transaction(move |db| super::relations::blocked_either_way(db, &viewer, &other))
            .await
    }

    /// `shop-public` (`browse`, `one`), the reader an account or nobody: none for another action.
    pub async fn public(
        &self,
        message: &JsonValue,
        viewer: Option<&str>,
    ) -> Result<Option<JsonValue>, String> {
        match raw(message.get("action")).as_str() {
            "browse" => self.browse(message, viewer).await.map(Some),
            "one" => self.one(message, viewer).await.map(Some),
            _ => Ok(None),
        }
    }

    /// Whether `action` is one of `shop`'s (an account's).
    pub fn account_action(action: &str) -> bool {
        [
            "report",
            "buy",
            "move",
            "refund_all",
            "orders",
            "send",
            "thread",
            "threads",
        ]
        .contains(&action)
    }

    /// `shop`, for an account.
    pub async fn account(
        &self,
        directory: &Directory,
        message: &JsonValue,
        user: &str,
    ) -> Result<JsonValue, String> {
        match raw(message.get("action")).as_str() {
            "report" => self.report(user, message).await,
            "buy" => {
                let order = message
                    .get("order")
                    .filter(|order| js::truthy(Some(order)))
                    .cloned()
                    .unwrap_or(json!({}));
                self.buy(user, &order).await
            }
            "move" => {
                let action = message
                    .get("move")
                    .filter(|action| !action.is_null())
                    .map(|value| js::text(Some(value)))
                    .unwrap_or_default();
                let order_id = message
                    .get("orderId")
                    .filter(|id| !id.is_null())
                    .map(|value| js::text(Some(value)))
                    .unwrap_or_default();
                self.move_order(
                    Some(user),
                    &order_id,
                    &action,
                    message.get("tracking"),
                    None,
                )
                .await
            }
            "refund_all" => {
                let listing = message
                    .get("listingId")
                    .filter(|id| !id.is_null())
                    .map(|value| js::text(Some(value)))
                    .unwrap_or_default();
                self.refund_all(user, &listing).await
            }
            "orders" => {
                self.tick().await?;
                self.orders(user, message.get("side")).await
            }
            "send" => self.send(directory, user, message).await,
            "thread" => self.thread(user, message).await,
            "threads" => self.threads(directory, user, message).await,
            other => Err(format!("shop_action_unknown:{other}")),
        }
    }
}
