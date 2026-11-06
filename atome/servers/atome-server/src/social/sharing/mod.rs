// The canonical share engine (server/syncSharingService.js and server/sync_share_lists.js,
// ported): a share is asked of a contact, waits for their answer (unless a policy answers it),
// is accepted or refused, linked (the recipient follows the owner's stream) or detached (a copy);
// never more is granted than held (rights, properties, duration), a re-share's chain restricted
// with its link and revoked with it; a list's every new version is validated by its recipient
// (lists.rs); a programme's interior is never shared. What the engine tells people (a frame to
// their live connections, a notice on their stack) is handed back to its caller as `Effect`s.
mod grants;
mod list_view;
mod lists;
mod manage;
mod rights;

use super::{Notice, NotificationStack, Relations};
use crate::social::news::db::{all, get, parsed, run};
use crate::vault_router::central::Central;
use crate::vault_router::{VaultRouter, js};
use crate::ws_sync::SyncRuntime;
use rusqlite::ToSql;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

pub(super) const ACTIVE_LINKED: &str = "status IN ('active', 'accepted') AND share_type = 'linked'
    AND (expires_at IS NULL OR expires_at > datetime('now'))";

/// What a share's life tells someone, in the order it happened.
pub enum Effect {
    /// A frame to the person's live connections (`notifyPrincipal`), none queued.
    Tell(String, JsonValue),
    /// A notice stored on the person's stack, to deliver live or queue, then push.
    Notice(Notice),
}

pub struct Sharing {
    central: Central,
    router: Arc<VaultRouter>,
    sync: Arc<SyncRuntime>,
    stack: NotificationStack,
    relations: Relations,
}

// A share row as its readers see it (`visibleRow`).
fn visible(row: &JsonValue) -> JsonValue {
    let permissions = parsed(row.get("permissions_json"), json!({}));
    let held = rights::normalized(&permissions);
    let list = |column: &str| parsed(row.get(column), JsonValue::Null);
    let allowed = list("allowed_properties_json");
    let or_allowed = |column: &str| {
        let own = list(column);
        if own.is_null() { allowed.clone() } else { own }
    };
    let or_null = |key: &str| {
        row.get(key)
            .filter(|value| js::truthy(Some(value)))
            .cloned()
            .unwrap_or(JsonValue::Null)
    };
    json!({ "share_id": row["share_id"], "request_id": row["share_id"], "owner_id": row["owner_id"],
        "principal_id": row["principal_id"], "atome_id": row["atome_id"], "stream_id": row["stream_id"],
        "share_type": row["share_type"], "share_mode": row["share_mode"], "status": row["status"],
        "permissions": permissions, "rights": rights::object(held), "role": rights::role(held),
        "allowed_properties": allowed, "readable_properties": or_allowed("readable_properties_json"),
        "writable_properties": or_allowed("writable_properties_json"), "parent_share_id": or_null("parent_share_id"),
        "publication_cursor": js::number_json(js::number_or(row.get("publication_cursor"), 0.0)),
        "detached_atome_id": or_null("detached_atome_id"), "expires_at": or_null("expires_at"),
        "created_at": row["created_at"], "updated_at": row["updated_at"] })
}

fn values(values: &[JsonValue]) -> Vec<rusqlite::types::Value> {
    values
        .iter()
        .map(crate::vault_router::central::sql_value)
        .collect()
}

impl Sharing {
    pub fn new(
        central: Central,
        router: Arc<VaultRouter>,
        sync: Arc<SyncRuntime>,
        stack: NotificationStack,
        relations: Relations,
    ) -> Self {
        Self {
            central,
            router,
            sync,
            stack,
            relations,
        }
    }

    async fn get(&self, share_id: &str) -> Result<Option<JsonValue>, String> {
        let id = share_id.to_string();
        self.central
            .transaction(move |db| {
                get(
                    db,
                    "SELECT * FROM sync_share_requests WHERE share_id = ?",
                    &[&id],
                )
            })
            .await
    }

    async fn rows(&self, sql: String, bound: Vec<JsonValue>) -> Result<Vec<JsonValue>, String> {
        self.central
            .transaction(move |db| {
                let bound = values(&bound);
                let refs: Vec<&dyn ToSql> = bound.iter().map(|value| value as &dyn ToSql).collect();
                all(db, &sql, &refs)
            })
            .await
    }

    async fn run(&self, sql: &'static str, bound: Vec<JsonValue>) -> Result<(), String> {
        self.central
            .transaction(move |db| {
                let bound = values(&bound);
                let refs: Vec<&dyn ToSql> = bound.iter().map(|value| value as &dyn ToSql).collect();
                run(db, sql, &refs).map(|_| ())
            })
            .await
    }

    // `deliverCommNotification(target, sender, notification)`: stored, then told.
    async fn deliver(
        &self,
        target: &str,
        sender: &str,
        notification: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<(), String> {
        let notice = self
            .stack
            .notice(target, Some(sender), notification)
            .await?;
        out.push(Effect::Notice(notice));
        Ok(())
    }

    /// `targetId(message)`: the account named, else the one holding the number named.
    pub async fn target_id(&self, message: &JsonValue) -> Result<Option<String>, String> {
        if let Some(direct) = js::first(
            message,
            &[
                "target_user_id",
                "targetUserId",
                "principal_id",
                "principalId",
            ],
        ) {
            return Ok(Some(js::string(direct)));
        }
        let phone = js::id(js::first(message, &["target_phone", "targetPhone"]));
        if phone.is_empty() {
            return Ok(None);
        }
        let phone = super::phone::book_phone(&phone);
        self.central
            .transaction(move |db| crate::auth::accounts::find_by_phone(db, &phone))
            .await
            .map(|user| {
                user.and_then(|user| {
                    user.get("user_id")
                        .filter(|id| js::truthy(Some(id)))
                        .map(js::string)
                })
            })
    }

    // The policy `owner` keeps for `peer`, while not revoked.
    async fn policy(&self, owner: &str, peer: &str) -> Result<Option<JsonValue>, String> {
        let (owner, peer) = (owner.to_string(), peer.to_string());
        self.central
            .transaction(move |db| {
                get(
                    db,
                    "SELECT * FROM sync_share_policies WHERE owner_id = ? AND peer_id = ? AND revoked_at IS NULL",
                    &[&owner, &peer],
                )
            })
            .await
    }

    /// `handle(message, principal)`: one action of the `share` family.
    pub async fn handle(
        &self,
        message: &JsonValue,
        principal: &str,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let action = if js::truthy(message.get("action")) {
            js::string(&message["action"]).to_lowercase()
        } else {
            String::new()
        };
        // `message.peer_user_id || message.peerUserId`.
        let peer = js::first(message, &["peer_user_id"]).or_else(|| message.get("peerUserId"));
        match action.as_str() {
            // `create` follows the same consent as `request`.
            "request" | "create" => self.request(principal, message, out).await,
            "respond" => self.respond(principal, message, out).await,
            "publish" => self.publish(principal, message).await,
            "policy" => {
                self.set_policy(
                    principal,
                    peer,
                    message.get("policy"),
                    message.get("permissions"),
                )
                .await
            }
            "revoke" => self.revoke(principal, message, out).await,
            "update-rights" => self.update_rights(principal, message, out).await,
            "with-peer" => self.with_peer(principal, message).await,
            "inbox" | "shared-with-me" => self.list(principal, "principal_id").await,
            "my-shares" | "sent" => self.list(principal, "owner_id").await,
            "pending" => self.pending(principal).await,
            "list-view" => self.list_view(principal, message).await,
            "accept-version" => self.accept_version(principal, message, out).await,
            "refuse-version" => self.refuse_version(principal, message, out).await,
            "detach" => self.detach(principal, message, out).await,
            "announce" => self.announce(principal, message, out).await,
            "" => Err("unsupported_sync_share_action:missing".into()),
            other => Err(format!("unsupported_sync_share_action:{other}")),
        }
    }
}
