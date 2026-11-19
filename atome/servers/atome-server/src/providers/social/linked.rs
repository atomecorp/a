// Who is linked to which network account (R-190): the Meta webhook names a Page or a
// professional account, never an atome person, and the polling must reach only the accounts
// that exist. Each person's entries (no token, only the ids the networks name them by) are kept
// in their vault directory (`social/linked.json`) and in memory, read once from every vault at
// the first webhook or tick.
use super::net::{Sd, Se};
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tokio::sync::OnceCell;

const FILE: &str = "linked.json";

/// One enabled account of a person.
#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub network: String,
    pub account: String,
    /// The ids the network's webhooks name it by (its own id, a Facebook account's Pages).
    pub remote_ids: Vec<String>,
    /// Read by the 60 s polling.
    pub polled: bool,
}

impl Entry {
    fn json(&self) -> JsonValue {
        json!({ "network": self.network, "account": self.account, "remote_ids": self.remote_ids, "polled": self.polled })
    }

    fn of(value: &JsonValue) -> Option<Self> {
        let text = |key: &str| value.get(key)?.as_str().map(str::to_string);
        Some(Self {
            network: text("network")?,
            account: text("account")?,
            remote_ids: value
                .get("remote_ids")?
                .as_array()?
                .iter()
                .filter_map(|id| id.as_str().map(str::to_string))
                .collect(),
            polled: value.get("polled")?.as_bool()?,
        })
    }
}

#[derive(Default)]
pub struct Linked {
    people: Mutex<HashMap<String, Vec<Entry>>>,
    loaded: OnceCell<()>,
}

impl Linked {
    fn people(&self) -> std::sync::MutexGuard<'_, HashMap<String, Vec<Entry>>> {
        self.people.lock().expect("linked accounts")
    }

    /// The person's entries, written to their directory then held; none removes them.
    pub async fn set(&self, principal: &str, social_root: &Path, entries: Vec<Entry>) -> Sd<()> {
        let file = social_root.join(FILE);
        if entries.is_empty() {
            match tokio::fs::remove_file(&file).await {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                    return Err(Se::from(error.to_string()));
                }
                _ => {}
            }
            self.people().remove(principal);
            return Ok(());
        }
        super::media::create_private_dir(social_root)
            .await
            .map_err(|e| Se::from(e.to_string()))?;
        let body = json!({ "principal": principal, "entries": entries.iter().map(Entry::json).collect::<Vec<_>>() });
        super::kept::write_json(&file, &body).await?;
        self.people().insert(principal.into(), entries);
        Ok(())
    }

    /// Every vault's entries read once (a person linked since then is already held).
    pub async fn load(&self, vault_root: &Path) {
        self.loaded
            .get_or_init(|| async {
                let Ok(mut dirs) = tokio::fs::read_dir(vault_root).await else {
                    return;
                };
                while let Ok(Some(dir)) = dirs.next_entry().await {
                    let file = dir.path().join("social").join(FILE);
                    let Ok(bytes) = tokio::fs::read(&file).await else {
                        continue;
                    };
                    let Ok(value) = serde_json::from_slice::<JsonValue>(&bytes) else {
                        eprintln!("[social] unreadable {}", file.display());
                        continue;
                    };
                    let principal = value["principal"].as_str().unwrap_or_default().to_string();
                    let entries: Vec<Entry> = value["entries"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(Entry::of)
                        .collect();
                    if !principal.is_empty() {
                        self.people().entry(principal).or_insert(entries);
                    }
                }
            })
            .await;
    }

    /// The people with an account to poll, and those accounts.
    pub fn polled(&self) -> Vec<(String, Vec<Entry>)> {
        self.people()
            .iter()
            .map(|(principal, entries)| {
                let polled: Vec<Entry> = entries.iter().filter(|e| e.polled).cloned().collect();
                (principal.clone(), polled)
            })
            .filter(|(_, entries)| !entries.is_empty())
            .collect()
    }

    /// Who holds the account a network's webhook names: each person and their account id.
    pub fn owners(&self, network: &str, remote_id: &str) -> Vec<(String, String)> {
        self.people()
            .iter()
            .flat_map(|(principal, entries)| {
                entries
                    .iter()
                    .filter(|e| {
                        e.network == network && e.remote_ids.iter().any(|id| id == remote_id)
                    })
                    .map(|e| (principal.clone(), e.account.clone()))
                    .collect::<Vec<_>>()
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn entries_are_kept_found_and_reloaded() {
        let root = tempfile::tempdir().unwrap();
        let social = root.path().join("vault-a").join("social");
        let linked = Linked::default();
        let entry = Entry {
            network: "facebook".into(),
            account: "9".into(),
            remote_ids: vec!["9".into(), "55".into()],
            polled: false,
        };
        let polled = Entry {
            network: "mastodon".into(),
            account: "ann@m.social".into(),
            remote_ids: vec!["1".into()],
            polled: true,
        };
        linked
            .set("alice", &social, vec![entry, polled.clone()])
            .await
            .unwrap();
        assert_eq!(
            linked.owners("facebook", "55"),
            vec![("alice".into(), "9".into())]
        );
        assert!(linked.owners("instagram", "55").is_empty());
        assert_eq!(linked.polled(), vec![("alice".into(), vec![polled])]);
        let fresh = Linked::default();
        fresh.load(root.path()).await;
        assert_eq!(fresh.owners("facebook", "9").len(), 1);
        linked.set("alice", &social, vec![]).await.unwrap();
        assert!(linked.polled().is_empty());
        assert!(!social.join(FILE).exists());
    }
}
