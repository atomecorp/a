// The contact book (server/communication_relations.js, ported with relations.rs): the
// preference « accept requests from people absent from my book » (yes by default), the
// book itself as fingerprints salted by its owner, and the list of one's relations.
use super::phone;
use super::relations::{contact_status, sql};
use crate::auth::accounts;
use crate::vault_router::central::row_json;
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const MAX_BOOK_HASHES: usize = 5000;

pub(super) fn preferences(db: &Connection, user: &str) -> Result<(bool, Vec<String>), String> {
    let row: Option<(Option<i64>, Option<String>)> = db
        .query_row(
            "SELECT accept_unknown, address_book_json FROM communication_preferences WHERE user_id = ?",
            params![user],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(sql)?;
    let Some((accept, book)) = row else {
        return Ok((true, Vec::new()));
    };
    let book = book
        .filter(|book| !book.is_empty())
        .unwrap_or_else(|| "[]".into());
    let book = match serde_json::from_str::<JsonValue>(&book) {
        Ok(JsonValue::Array(items)) => items.iter().map(js::string).collect(),
        _ => Vec::new(),
    };
    Ok((accept.unwrap_or(0) != 0, book))
}

pub(super) fn upsert_preferences(
    db: &Connection,
    user: &str,
    accept: Option<i64>,
    book: Option<&str>,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO communication_preferences (user_id, accept_unknown, address_book_json)
         VALUES (?1, COALESCE(?2, 1), COALESCE(?3, '[]'))
         ON CONFLICT(user_id) DO UPDATE SET
           accept_unknown = COALESCE(?2, communication_preferences.accept_unknown),
           address_book_json = COALESCE(?3, communication_preferences.address_book_json),
           updated_at = datetime('now')",
        params![user, accept, book],
    )
    .map(|_| ())
    .map_err(sql)
}

fn account_phone(db: &Connection, user: &str) -> Result<String, String> {
    Ok(accounts::find_by_id(db, user)?
        .and_then(|account| account["phone"].as_str().map(str::to_string))
        .unwrap_or_default())
}

// Whether `target` takes a request from `sender`: they take strangers, or the sender's number is in their book.
pub(super) fn accepts_request_from(
    db: &Connection,
    target: &str,
    sender: &str,
) -> Result<bool, String> {
    let (accept_unknown, book) = preferences(db, target)?;
    if accept_unknown {
        return Ok(true);
    }
    let number = account_phone(db, sender)?;
    let hash = if number.is_empty() {
        String::new()
    } else {
        phone::book_hash(target, &number)
    };
    Ok(!hash.is_empty() && book.contains(&hash))
}

/// `list` without the contacts' cards: `people` is left empty for the caller, who reads
/// each card of `contacts` (`readCard`) and keeps those naming someone.
pub(super) fn list(db: &Connection, owner: &str) -> Result<JsonValue, String> {
    let mut statement = db
        .prepare_cached(
            "SELECT peer_id, status, requested_by FROM communication_contacts WHERE owner_id = ?",
        )
        .map_err(sql)?;
    let rows: Vec<(String, Option<String>, String)> = statement
        .query_map(params![owner], row_json)
        .map_err(sql)?
        .map(|row| {
            row.map(|row| {
                let status = row["status"].as_str().map(str::to_string);
                (
                    js::text(Some(&row["peer_id"])),
                    status,
                    js::text(Some(&row["requested_by"])),
                )
            })
        })
        .collect::<Result<_, _>>()
        .map_err(sql)?;
    let mut blocked_statement = db
        .prepare_cached("SELECT peer_id FROM sync_share_policies WHERE owner_id = ? AND policy = 'block' AND revoked_at IS NULL")
        .map_err(sql)?;
    let mut blocked: Vec<String> = Vec::new();
    for peer in blocked_statement
        .query_map(params![owner], row_json)
        .map_err(sql)?
    {
        let peer = js::text(Some(&peer.map_err(sql)?["peer_id"]));
        if !blocked.contains(&peer) {
            blocked.push(peer);
        }
    }
    let mut statuses = JsonMap::new();
    for (peer, status, _) in &rows {
        let label = match status.as_deref() {
            Some("pending") => "incoming",
            Some("refused") => "refused",
            _ if contact_status(db, peer, owner)?.as_deref() == Some("accepted") => "contact",
            _ => "outgoing",
        };
        statuses.insert(peer.clone(), json!(label));
    }
    for peer in &blocked {
        statuses.insert(peer.clone(), json!("blocked"));
    }
    let contacts: Vec<&String> = rows
        .iter()
        .filter(|(_, status, _)| status.as_deref() == Some("accepted"))
        .map(|(peer, ..)| peer)
        .collect();
    let pending: Vec<&String> = rows
        .iter()
        .filter(|(_, status, by)| status.as_deref() == Some("pending") && by != owner)
        .map(|(peer, ..)| peer)
        .collect();
    Ok(
        json!({ "ok": true, "statuses": statuses, "contacts": contacts, "people": [], "pending": pending, "blocked": blocked }),
    )
}

// `hashes`: the book's fingerprints, unique, lowercase hex SHA-256, 5 000 at most.
pub(super) fn book_of(hashes: Option<&JsonValue>) -> Vec<String> {
    let mut book: Vec<String> = Vec::new();
    for hash in hashes.and_then(JsonValue::as_array).into_iter().flatten() {
        let hash = js::id(Some(hash)).to_lowercase();
        if hash.len() == 64
            && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            && !book.contains(&hash)
        {
            book.push(hash);
        }
    }
    book.truncate(MAX_BOOK_HASHES);
    book
}
