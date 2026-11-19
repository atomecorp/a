// The conversations a person had on the networks, kept on atome (rule 21, R-190): every message
// or comment received and every reply sent, in the person's vault directory
// (`social/threads/<network>/<account>/<thread>.json`), each item shaped as a conversation
// message (`id, message, timestamp, box: sent|inbox, from_id, from_name, origin`), its network's
// reply reference (`ref`) kept beside it on the server only. Erased with the account.
use super::net::{Sd, Se};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

const PAGE: usize = 50;
const NOTICES_MAX: usize = 5000;

// One writer at a time for every kept conversation of the process: a webhook, a tick and a
// reply may append to the same one.
static WRITING: LazyLock<tokio::sync::Mutex<()>> = LazyLock::new(Default::default);

/// A path segment: letters, digits, `-`, `_` and `@` as they are, anything else `%XX`; a long
/// one by its digest.
fn segment(raw: &str) -> String {
    let mut out = String::new();
    for byte in raw.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_@".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    if out.is_empty() || out.len() > 180 {
        let digest = ring::digest::digest(&ring::digest::SHA256, raw.as_bytes());
        return hex::encode(digest.as_ref());
    }
    out
}

fn account_dir(root: &Path, network: &str, account: &str) -> PathBuf {
    root.join("threads")
        .join(segment(network))
        .join(segment(account))
}

pub fn path(root: &Path, network: &str, account: &str, thread: &str) -> PathBuf {
    account_dir(root, network, account).join(format!("{}.json", segment(thread)))
}

/// A JSON file written whole (a temporary beside it, then renamed), readable by its owner only.
pub async fn write_json(file: &Path, value: &JsonValue) -> Sd<()> {
    let failed = |e: std::io::Error| Se::from(e.to_string());
    if let Some(dir) = file.parent() {
        super::media::create_private_dir(dir)
            .await
            .map_err(failed)?;
    }
    let temporary = file.with_extension(format!("tmp{}", crate::providers::oauth::hex(4)));
    tokio::fs::write(&temporary, value.to_string())
        .await
        .map_err(failed)?;
    tokio::fs::rename(&temporary, file).await.map_err(failed)
}

async fn read_json(file: &Path) -> Sd<Option<JsonValue>> {
    match tokio::fs::read(file).await {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|e| Se::from(format!("social_thread_unreadable:{e}"))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(Se::from(error.to_string())),
    }
}

/// Every kept item of a conversation, in time order.
pub async fn items(root: &Path, place: &Place) -> Sd<Vec<JsonValue>> {
    items_of(&path(root, &place.network, &place.account, &place.thread)).await
}

async fn items_of(file: &Path) -> Sd<Vec<JsonValue>> {
    Ok(read_json(file)
        .await?
        .and_then(|kept| kept.get("items").and_then(JsonValue::as_array).cloned())
        .unwrap_or_default())
}

/// Where a kept item lies.
#[derive(Clone, Debug, PartialEq)]
pub struct Place {
    pub network: String,
    pub account: String,
    pub thread: String,
}

/// The item appended in time order; an item already kept (the same id: a webhook told twice, a
/// poll seeing it again) is not, and `false` tells it.
pub async fn append(root: &Path, place: &Place, item: JsonValue) -> Sd<bool> {
    let _writing = WRITING.lock().await;
    let file = path(root, &place.network, &place.account, &place.thread);
    let mut items = items_of(&file).await?;
    if items.iter().any(|kept| kept.get("id") == item.get("id")) {
        return Ok(false);
    }
    let at = item["timestamp"].as_str().unwrap_or_default().to_string();
    let index = items
        .iter()
        .rposition(|kept| kept["timestamp"].as_str().unwrap_or_default() <= at.as_str())
        .map_or(0, |found| found + 1);
    items.insert(index, item);
    write_json(&file, &json!({ "items": items })).await?;
    Ok(true)
}

/// One kept item.
pub async fn find(root: &Path, place: &Place, id: &str) -> Sd<Option<JsonValue>> {
    let file = path(root, &place.network, &place.account, &place.thread);
    Ok(items_of(&file)
        .await?
        .into_iter()
        .find(|item| item.get("id") == Some(&json!(id))))
}

/// As the client reads it: the server's reply reference left out.
fn shown(item: &JsonValue) -> JsonValue {
    let mut shown = item.as_object().cloned().unwrap_or_default();
    shown.remove("ref");
    JsonValue::Object(shown)
}

/// `social.thread.read`: the latest page before `cursor` (the end by default), in time order,
/// and the cursor of the page before it (`null` at the first).
pub async fn read(root: &Path, place: &Place, cursor: Option<&str>) -> Sd<JsonValue> {
    let file = path(root, &place.network, &place.account, &place.thread);
    let items = items_of(&file).await?;
    let end = match cursor.filter(|c| !c.is_empty()) {
        Some(cursor) => cursor
            .parse::<usize>()
            .map_err(|_| Se::new("social_request_invalid"))?
            .min(items.len()),
        None => items.len(),
    };
    let start = end.saturating_sub(PAGE);
    let page: Vec<JsonValue> = items[start..end].iter().map(shown).collect();
    let next = if start > 0 {
        json!(start.to_string())
    } else {
        JsonValue::Null
    };
    Ok(json!({ "items": page, "nextCursor": next }))
}

fn notices_file(root: &Path) -> PathBuf {
    root.join("threads").join("notices.json")
}

/// The notice told for a kept item, to find the item again from the notice (`social.reply`
/// with a `notification_id`).
pub async fn remember(root: &Path, notice: &str, place: &Place, item: &str) -> Sd<()> {
    let _writing = WRITING.lock().await;
    let file = notices_file(root);
    let mut notices: JsonMap<String, JsonValue> = read_json(&file)
        .await?
        .and_then(|kept| kept.as_object().cloned())
        .unwrap_or_default();
    notices.insert(
        notice.into(),
        json!({ "network": place.network, "account": place.account, "thread": place.thread, "item": item }),
    );
    while notices.len() > NOTICES_MAX {
        let oldest = notices.keys().next().cloned().unwrap_or_default();
        notices.remove(&oldest);
    }
    write_json(&file, &JsonValue::Object(notices)).await
}

/// The item a notice was told for.
pub async fn noticed(root: &Path, notice: &str) -> Sd<Option<(Place, String)>> {
    let Some(found) = read_json(&notices_file(root))
        .await?
        .and_then(|kept| kept.get(notice).cloned())
    else {
        return Ok(None);
    };
    let text = |key: &str| found[key].as_str().unwrap_or_default().to_string();
    Ok(Some((
        Place {
            network: text("network"),
            account: text("account"),
            thread: text("thread"),
        },
        text("item"),
    )))
}

/// Every conversation of an account, gone with it.
pub async fn erase(root: &Path, network: &str, account: &str) -> Sd<()> {
    let _writing = WRITING.lock().await;
    match tokio::fs::remove_dir_all(account_dir(root, network, account)).await {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            Err(Se::from(error.to_string()))
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, at: &str) -> JsonValue {
        json!({ "id": id, "message": id, "timestamp": at, "box": "inbox", "ref": { "cid": "x" } })
    }

    #[tokio::test]
    async fn items_are_kept_in_order_once_and_paged() {
        let root = tempfile::tempdir().unwrap();
        let place = Place {
            network: "bluesky".into(),
            account: "did-plc-a".into(),
            thread: "at://did:plc:a/app.bsky.feed.post/1".into(),
        };
        assert!(
            append(root.path(), &place, item("b", "2026-11-16T10:00:00.000Z"))
                .await
                .unwrap()
        );
        assert!(
            append(root.path(), &place, item("a", "2026-11-16T09:00:00.000Z"))
                .await
                .unwrap()
        );
        assert!(
            !append(root.path(), &place, item("a", "2026-11-16T09:00:00.000Z"))
                .await
                .unwrap()
        );
        let page = read(root.path(), &place, None).await.unwrap();
        assert_eq!(page["items"][0]["id"], "a");
        assert_eq!(page["items"][1]["id"], "b");
        assert!(page["items"][0].get("ref").is_none());
        assert_eq!(page["nextCursor"], JsonValue::Null);
        for n in 0..60 {
            let at = format!("2026-11-17T00:{:02}:00.000Z", n % 60);
            append(root.path(), &place, item(&format!("n{n}"), &at))
                .await
                .unwrap();
        }
        let last = read(root.path(), &place, None).await.unwrap();
        assert_eq!(last["items"].as_array().unwrap().len(), 50);
        let before = read(root.path(), &place, last["nextCursor"].as_str())
            .await
            .unwrap();
        assert_eq!(before["items"].as_array().unwrap().len(), 12);
        assert!(
            find(root.path(), &place, "a")
                .await
                .unwrap()
                .unwrap()
                .get("ref")
                .is_some()
        );
        remember(root.path(), "social_bluesky_1", &place, "a")
            .await
            .unwrap();
        assert_eq!(
            noticed(root.path(), "social_bluesky_1").await.unwrap(),
            Some((place.clone(), "a".into()))
        );
        erase(root.path(), "bluesky", "did-plc-a").await.unwrap();
        assert!(find(root.path(), &place, "a").await.unwrap().is_none());
    }
}
