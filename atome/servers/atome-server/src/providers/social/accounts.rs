// A network's accounts in the person's vault (R-190, 16 Nov. 2026): the record `social.<network>`
// holds `accounts: [{ account, label, identity, scopes, enabled, tokens… }]`, the tokens never
// leaving the server. A record written before several accounts existed (one session at its top
// level) reads as its one account. Every change is a read-modify-write of the record under one
// lock per person and network, so a refresh, a poll's cursor and a connection never lose each
// other's writes.
use super::net::{self, Sd, Se};
use super::network::Network;
use crate::providers::credentials::Credentials;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};

/// The longest account id a destination carries.
pub const ACCOUNT_MAX: usize = 120;

/// An account id as a destination carries it: `[A-Za-z0-9._@-]`, at most 120 characters.
pub fn sanitize(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || "._@-".contains(c) {
                c
            } else {
                '-'
            }
        })
        .take(ACCOUNT_MAX)
        .collect()
}

/// Whether `id` is shaped as an account id.
pub fn shaped(id: &str) -> bool {
    (1..=ACCOUNT_MAX).contains(&id.len())
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._@-".contains(&c))
}

/// The id an account takes: its own `account`, else what its network names it by.
pub fn id_of(network: Network, account: &JsonValue) -> String {
    let own = net::text(account.get("account"));
    if !own.is_empty() {
        return sanitize(&own);
    }
    let identity = |key: &str| net::text(account.pointer(&format!("/identity/{key}")));
    let raw = match network {
        Network::Mastodon => format!(
            "{}@{}",
            identity("username"),
            net::text(account.get("host"))
        ),
        _ => identity("id"),
    };
    sanitize(&raw)
}

/// The accounts a record holds, in their order, each with its id.
pub fn list(network: Network, record: Option<&JsonValue>) -> Vec<JsonValue> {
    let Some(record) = record.filter(|r| r.is_object()) else {
        return Vec::new();
    };
    let items = match record.get("accounts") {
        Some(JsonValue::Array(items)) => items.clone(),
        _ if js::truthy(record.get("access_token")) => vec![record.clone()],
        _ => Vec::new(),
    };
    items
        .into_iter()
        .filter(JsonValue::is_object)
        .map(|mut account| {
            account["account"] = json!(id_of(network, &account));
            account
        })
        .collect()
}

pub fn enabled(account: &JsonValue) -> bool {
    account.get("enabled") != Some(&JsonValue::Bool(false))
}

/// The account `wanted` names, or with none the first enabled one (an older bare destination,
/// `instagram` or `tiktok`, is its network's first account).
pub fn pick(accounts: &[JsonValue], wanted: Option<&str>) -> Option<JsonValue> {
    match wanted.filter(|w| !w.is_empty()) {
        Some(wanted) => accounts
            .iter()
            .find(|a| net::text(a.get("account")) == wanted)
            .cloned(),
        None => accounts.iter().find(|a| enabled(a)).cloned(),
    }
}

/// The record holding `accounts`.
pub fn record_of(network: Network, accounts: Vec<JsonValue>) -> JsonValue {
    json!({ "network": network.name(), "accounts": accounts })
}

/// The record with `account` in, replacing the one of the same id (a reconnection keeps the
/// account's place, its cursor and whether it is enabled).
pub fn with_account(network: Network, record: Option<&JsonValue>, account: JsonValue) -> JsonValue {
    let mut accounts = list(network, record);
    let mut account = account;
    let id = id_of(network, &account);
    account["account"] = json!(id);
    match accounts
        .iter_mut()
        .find(|a| net::text(a.get("account")) == id)
    {
        Some(known) => {
            for kept in ["enabled", "cursor", "posts"] {
                if let Some(value) = known.get(kept).filter(|_| account.get(kept).is_none()) {
                    account[kept] = value.clone();
                }
            }
            *known = account;
        }
        None => accounts.push(account),
    }
    record_of(network, accounts)
}

type Lock = Arc<tokio::sync::Mutex<()>>;

static LOCKS: LazyLock<Mutex<HashMap<String, Lock>>> = LazyLock::new(Mutex::default);

fn lock_of(vault: &Credentials, network: Network) -> Lock {
    let key = format!("{}\u{0}{}", vault.social_root().display(), network.name());
    LOCKS
        .lock()
        .expect("social record locks")
        .entry(key)
        .or_default()
        .clone()
}

/// The record read, changed by `change` and written back, under the person's lock for that
/// network; an empty account list removes the record. What `change` answers comes back.
pub async fn change<R>(
    vault: &Credentials,
    network: Network,
    change: impl FnOnce(Vec<JsonValue>) -> Sd<(Vec<JsonValue>, R)>,
) -> Sd<R> {
    let lock = lock_of(vault, network);
    let _held = lock.lock().await;
    let record = vault.read_record(&network.record()).await?;
    let (accounts, answer) = change(list(network, record.as_ref()))?;
    if accounts.is_empty() {
        vault.remove_record(&network.record()).await?;
    } else {
        vault
            .store_record(&network.record(), record_of(network, accounts))
            .await?;
    }
    Ok(answer)
}

/// One account changed in place; refused when it is not there.
pub async fn update(
    vault: &Credentials,
    network: Network,
    account: &str,
    patch: impl FnOnce(&mut JsonValue),
) -> Sd<()> {
    change(vault, network, |mut accounts| {
        let found = accounts
            .iter_mut()
            .find(|a| net::text(a.get("account")) == account)
            .ok_or_else(|| Se::new("social_account_not_found"))?;
        patch(found);
        Ok((accounts, ()))
    })
    .await
}

/// The account's own public label: its name as the network shows it.
pub fn label(account: &JsonValue) -> String {
    ["display_name", "username", "name"]
        .iter()
        .map(|key| net::text(account.pointer(&format!("/identity/{key}"))))
        .find(|label| !label.is_empty())
        .or_else(|| Some(net::text(account.get("label"))).filter(|l| !l.is_empty()))
        .unwrap_or_else(|| net::text(account.get("account")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_legacy_record_reads_as_its_one_account() {
        let legacy = json!({ "network": "instagram", "access_token": "t", "identity": { "id": "178", "username": "me" } });
        let accounts = list(Network::Instagram, Some(&legacy));
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0]["account"], "178");
        assert_eq!(pick(&accounts, None).unwrap()["account"], "178");
    }

    #[test]
    fn several_accounts_are_listed_and_picked() {
        let record = json!({ "accounts": [
            { "account": "a", "enabled": false, "access_token": "1" },
            { "identity": { "id": "b c" }, "access_token": "2" },
        ] });
        let accounts = list(Network::Bluesky, Some(&record));
        assert_eq!(accounts[1]["account"], "b-c");
        assert_eq!(pick(&accounts, None).unwrap()["account"], "b-c");
        assert_eq!(pick(&accounts, Some("a")).unwrap()["account"], "a");
        assert!(pick(&accounts, Some("z")).is_none());
    }

    #[test]
    fn a_reconnection_replaces_its_account_and_keeps_its_cursor() {
        let record = json!({ "accounts": [{ "account": "x", "enabled": false, "cursor": { "since": 3 }, "access_token": "old" }] });
        let next = with_account(
            Network::Mastodon,
            Some(&record),
            json!({ "account": "x", "access_token": "new" }),
        );
        let accounts = list(Network::Mastodon, Some(&next));
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0]["access_token"], "new");
        assert_eq!(accounts[0]["cursor"]["since"], 3);
        assert_eq!(accounts[0]["enabled"], false);
        let added = with_account(Network::Mastodon, Some(&next), json!({ "account": "y" }));
        assert_eq!(list(Network::Mastodon, Some(&added)).len(), 2);
    }

    #[test]
    fn a_mastodon_account_is_named_by_its_handle_and_instance() {
        let account =
            json!({ "host": "mastodon.social", "identity": { "id": "1", "username": "ann" } });
        assert_eq!(id_of(Network::Mastodon, &account), "ann@mastodon.social");
        assert!(shaped("ann@mastodon.social"));
        assert!(!shaped("a/b"));
    }
}
