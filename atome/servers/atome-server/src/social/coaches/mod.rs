// The coaches (server/coaches.js and ws_coaches.js, ported; cahier FEAT-010/012): the shared
// directory of public coaching agendas and their free slots (directory.rs), the bookings and
// their answers (bookings.rs). `coaches-public` is searching, open to everyone, visitor and guest
// included (`browse`, `one`, `slots`); `coaches` needs an account (a request, a coach's answer, a
// cancellation, one's own bookings). Each side is told live and in its notifications, every open
// screen hears a coach changed (social/live.rs).
mod bookings;
pub mod contract;
mod directory;

use super::directory::Directory;
use super::live::Notifier;
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use crate::ws_sync::SyncRuntime;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const ACCOUNT_ACTIONS: [&str; 4] = ["request", "answer", "cancel", "bookings"];

pub struct Coaches {
    central: Central,
    router: Arc<VaultRouter>,
    sync: Arc<SyncRuntime>,
    chains: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    notifier: Notifier,
}

impl Coaches {
    pub fn new(
        central: Central,
        router: Arc<VaultRouter>,
        sync: Arc<SyncRuntime>,
        notifier: Notifier,
    ) -> Self {
        Self {
            central,
            router,
            sync,
            chains: Mutex::new(HashMap::new()),
            notifier,
        }
    }

    // One coach's bookings move one at a time.
    fn serial(&self, coach: &str) -> Arc<tokio::sync::Mutex<()>> {
        let mut chains = self
            .chains
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        chains.entry(coach.to_string()).or_default().clone()
    }

    async fn blocked(&self, viewer: Option<&str>, other: &str) -> Result<bool, String> {
        let Some(viewer) = viewer.filter(|viewer| !viewer.is_empty() && *viewer != other) else {
            return Ok(false);
        };
        let (viewer, other) = (viewer.to_string(), other.to_string());
        self.central
            .transaction(move |db| super::relations::blocked_either_way(db, &viewer, &other))
            .await
    }

    fn action(message: &JsonValue) -> String {
        message
            .get("action")
            .filter(|action| js::truthy(Some(action)))
            .map(|action| js::text(Some(action)))
            .unwrap_or_default()
    }

    pub fn account_action(message: &JsonValue) -> bool {
        ACCOUNT_ACTIONS.contains(&Self::action(message).as_str())
    }

    /// `coaches-public`, the reader an account or nobody: none for another action.
    pub async fn public(
        &self,
        message: &JsonValue,
        viewer: Option<&str>,
    ) -> Result<Option<JsonValue>, String> {
        let coach = message.get("coachId");
        Ok(Some(match Self::action(message).as_str() {
            "browse" => self.browse(message, viewer).await?,
            "one" => self.one(coach, viewer).await?,
            "slots" => self.slots(coach, viewer).await?,
            _ => return Ok(None),
        }))
    }

    /// `coaches`, an account's action (`account_action`).
    pub async fn account(
        &self,
        directory: &Directory,
        message: &JsonValue,
        user: &str,
    ) -> Result<JsonValue, String> {
        match Self::action(message).as_str() {
            "request" => {
                let input = message
                    .get("booking")
                    .filter(|input| js::truthy(Some(input)))
                    .cloned()
                    .unwrap_or(serde_json::json!({}));
                self.request(directory, user, &input).await
            }
            "answer" => self.answer(user, message).await,
            "cancel" => self.cancel(user, message).await,
            _ => self.list(user, message.get("side")).await,
        }
    }
}
