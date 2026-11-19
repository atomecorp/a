// The 60 s relève (R-190 §5 bis) of the networks that tell nothing by webhook: Bluesky, Mastodon,
// YouTube, LinkedIn, Telegram, Discord. Only the linked accounts are read (linked.rs), each from
// its own cursor; with none linked a tick costs no call at all. What arrived before the account
// was linked is never told.
use super::Config;
use super::accounts;
use super::inbox;
use super::linked::{Entry, Linked};
use super::net::{self, Sd};
use super::network::Network;
use super::sessions;
use crate::providers::credentials::Credentials;
use crate::social::live::Notifier;
use crate::vault_router::{VaultRouter, js};
use serde_json::{Value as JsonValue, json};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

const TICK: Duration = Duration::from_secs(60);

/// What the webhook and the polling reach: the configuration, who is linked, the vaults, the
/// one notification writer.
pub struct Reach<'a> {
    pub config: &'a Config,
    pub linked: &'a Linked,
    pub router: &'a Arc<VaultRouter>,
    pub vault_root: &'a Path,
    pub notifier: &'a Notifier,
}

impl Reach<'_> {
    pub async fn vault(&self, principal: &str) -> Sd<Credentials> {
        Ok(Credentials::open(self.router, self.vault_root, principal).await?)
    }
}

/// Every tick, forever.
pub async fn run(reach: &Reach<'_>) {
    let mut ticks = tokio::time::interval(TICK);
    ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        ticks.tick().await;
        reach.linked.load(reach.vault_root).await;
        for (principal, entries) in reach.linked.polled() {
            if let Err(failure) = person(reach, &principal, &entries).await {
                eprintln!("[social] polling stopped for one person: {}", failure.code);
            }
        }
    }
}

async fn person(reach: &Reach<'_>, principal: &str, entries: &[Entry]) -> Sd<()> {
    let vault = reach.vault(principal).await?;
    for entry in entries {
        let Ok(network) = Network::of(&entry.network) else {
            continue;
        };
        if let Err(failure) = account(reach, principal, &vault, network, &entry.account).await {
            eprintln!(
                "[social] {} polling failed: {}",
                network.name(),
                failure.code
            );
        }
    }
    Ok(())
}

/// The items newer than the account itself: what came before it was linked is history.
pub fn fresh(items: Vec<inbox::Received>, connected_at: i64) -> Vec<inbox::Received> {
    items
        .into_iter()
        .filter(|item| item.at >= connected_at)
        .collect()
}

async fn account(
    reach: &Reach<'_>,
    principal: &str,
    vault: &Credentials,
    network: Network,
    id: &str,
) -> Sd<()> {
    let session = sessions::load(network, Some(id), vault, reach.config).await?;
    let session = sessions::connected_only(session)?;
    let record = session.record.unwrap_or_else(|| json!({}));
    let polled = network.poll(reach.config, &record).await?;
    let connected_at = js::number(record.get("connected_at")) as i64;
    let root = vault.social_root();
    for item in fresh(polled.items, connected_at) {
        inbox::deliver(principal, &root, reach.notifier, network.name(), id, item).await?;
    }
    if let Some(cursor) = polled.cursor.filter(|c| record.get("cursor") != Some(c)) {
        accounts::update(vault, network, id, |account| {
            account["cursor"] = cursor;
        })
        .await?;
    }
    Ok(())
}

/// An account's cursor field, read as text.
pub fn cursor(account: &JsonValue, key: &str) -> String {
    net::text(account.pointer(&format!("/cursor/{key}")))
}

/// The account's cursor with `key` set.
pub fn with_cursor(account: &JsonValue, pairs: &[(&str, JsonValue)]) -> JsonValue {
    let mut cursor = account
        .get("cursor")
        .and_then(JsonValue::as_object)
        .cloned()
        .unwrap_or_default();
    for (key, value) in pairs {
        cursor.insert((*key).into(), value.clone());
    }
    JsonValue::Object(cursor)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_from_before_the_link_is_not_told() {
        let item = |at| inbox::Received {
            at,
            ..inbox::Received::default()
        };
        let kept = fresh(vec![item(5), item(10), item(15)], 10);
        assert_eq!(kept.iter().map(|i| i.at).collect::<Vec<_>>(), vec![10, 15]);
    }

    #[test]
    fn a_cursor_keeps_its_other_fields() {
        let account = json!({ "cursor": { "a": 1 } });
        let next = with_cursor(&account, &[("b", json!(2))]);
        assert_eq!(next, json!({ "a": 1, "b": 2 }));
        assert_eq!(cursor(&json!({ "cursor": { "since": "9" } }), "since"), "9");
    }
}
