// Person-to-person relations (server/communication_relations.js, ported): a first
// contact and a block. A block lives in `sync_share_policies` (policy 'block'), which
// sharing already applies; an accepted contact in `communication_contacts`, where a row
// (owner, peer, status) is owner's decision about peer. `sender` may write to
// `recipient` only when (recipient, sender) is 'accepted' and neither blocked the other.
// A refusal is not a block: it silences the peer without telling them, and their new
// request is only delivered after 30 days.
//
// What a decision sets off outside the database — the peer told, an accepted request's
// note made the conversation's first message — comes back as `effects`, in order, for
// the caller to carry out before the answer leaves (and, for a request, before the
// guard's floor).
use super::contact_book::{accepts_request_from, book_of, list, preferences, upsert_preferences};
use super::{phone, request_guard as guard};
use crate::auth::accounts;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

const REFUSAL_WAIT_DAYS: f64 = 30.0;

pub struct Relations {
    central: Central,
}

/// A decision's answer and what it sets off.
pub struct Decided {
    pub result: JsonValue,
    pub effects: Vec<JsonValue>,
}

fn decided(result: JsonValue) -> Decided {
    Decided {
        result,
        effects: Vec::new(),
    }
}

fn notify(target: &str, sender: &str, kind: &str, message: &str) -> JsonValue {
    json!({ "effect": "notify", "target": target, "sender": sender, "notification": { "kind": kind, "message": message } })
}

pub(super) fn sql(error: rusqlite::Error) -> String {
    error.to_string()
}

// `String(value || '').trim()`.
fn id(value: Option<&JsonValue>) -> String {
    js::id(value)
}

fn has_blocked(db: &Connection, owner: &str, peer: &str) -> Result<bool, String> {
    db.query_row(
        "SELECT policy FROM sync_share_policies WHERE owner_id = ? AND peer_id = ? AND revoked_at IS NULL",
        params![owner, peer],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(|policy| policy.flatten().as_deref() == Some("block"))
    .map_err(sql)
}

pub(super) fn contact_status(
    db: &Connection,
    owner: &str,
    peer: &str,
) -> Result<Option<String>, String> {
    db.query_row(
        "SELECT status FROM communication_contacts WHERE owner_id = ? AND peer_id = ?",
        params![owner, peer],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(|status| status.flatten().filter(|status| !status.is_empty()))
    .map_err(sql)
}

fn refusal_stands(db: &Connection, owner: &str, peer: &str) -> Result<bool, String> {
    let age: Option<Option<f64>> = db
        .query_row(
            "SELECT julianday('now') - julianday(updated_at) FROM communication_contacts
             WHERE owner_id = ? AND peer_id = ? AND status = 'refused'",
            params![owner, peer],
            |row| row.get(0),
        )
        .optional()
        .map_err(sql)?;
    Ok(age.is_some_and(|age| age.is_some_and(|age| age < REFUSAL_WAIT_DAYS)))
}

fn set_contact(
    db: &Connection,
    owner: &str,
    peer: &str,
    status: &str,
    requested_by: Option<&str>,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO communication_contacts (owner_id, peer_id, status, requested_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(owner_id, peer_id) DO UPDATE SET status = excluded.status,
         requested_by = COALESCE(excluded.requested_by, communication_contacts.requested_by),
         updated_at = datetime('now')",
        params![owner, peer, status, requested_by],
    )
    .map(|_| ())
    .map_err(sql)
}

/// `canCommunicate`: one verdict for every peer-to-peer communication. `silent` is an
/// accepted contact who then blocked the sender, which the sender must not learn.
pub fn can_communicate(
    db: &Connection,
    sender: &str,
    recipient: &str,
) -> Result<JsonValue, String> {
    if sender.is_empty() || recipient.is_empty() {
        return Ok(json!({ "ok": false, "error": "contact_required" }));
    }
    if sender == recipient {
        return Ok(json!({ "ok": true }));
    }
    let status = contact_status(db, recipient, sender)?;
    let accepted = status.as_deref() == Some("accepted");
    if has_blocked(db, recipient, sender)? {
        return Ok(if accepted {
            json!({ "ok": false, "silent": true, "error": "blocked" })
        } else {
            json!({ "ok": false, "error": "contact_required" })
        });
    }
    if has_blocked(db, sender, recipient)? {
        return Ok(json!({ "ok": false, "error": "contact_blocked_by_you" }));
    }
    Ok(if accepted {
        json!({ "ok": true })
    } else {
        json!({ "ok": false, "error": "contact_required" })
    })
}

pub fn blocked_either_way(db: &Connection, a: &str, b: &str) -> Result<bool, String> {
    Ok(has_blocked(db, a, b)? || has_blocked(db, b, a)?)
}

// `String(note || '').slice(0, 280)` in UTF-16 units.
fn note_text(note: Option<&JsonValue>) -> String {
    let note = if js::truthy(note) {
        note.map(js::string).unwrap_or_default()
    } else {
        String::new()
    };
    js::slice(&note, 280)
}

// `admitRequest`: one recipient, admitted by the guard unless they already accepted the sender.
fn admit_request(
    db: &Connection,
    sender: &str,
    target: &JsonValue,
    note: Option<&JsonValue>,
    number: Option<&JsonValue>,
) -> Result<Decided, String> {
    let mut target = id(Some(target));
    if js::truthy(number) {
        let known = !target.is_empty()
            && accounts::find_by_id(db, &target)?
                .is_some_and(|account| js::truthy(account.get("user_id")));
        if !known {
            let e164 = phone::book_phone(&number.map(js::string).unwrap_or_default());
            if e164.is_empty() {
                return Err("contact_phone_invalid".into());
            }
            target = id(accounts::find_by_phone(db, &e164)?
                .as_ref()
                .and_then(|account| account.get("user_id")));
            if target.is_empty() {
                guard::admit(db, sender, guard::now_ms())?;
                guard::record(db, sender, None, None, guard::now_ms())?;
                return Ok(decided(json!({ "ok": true, "status": "pending" })));
            }
        }
    }
    if sender.is_empty() || target.is_empty() || sender == target {
        return Err("contact_target_invalid".into());
    }
    if has_blocked(db, sender, &target)? {
        return Err("contact_blocked_by_you".into());
    }
    let current = contact_status(db, &target, sender)?;
    let blocked = has_blocked(db, &target, sender)?;
    if current.as_deref() == Some("accepted") && !blocked {
        set_contact(db, sender, &target, "accepted", Some(sender))?;
        return Ok(decided(json!({ "ok": true, "status": "accepted" })));
    }
    guard::admit(db, sender, guard::now_ms())?;
    set_contact(db, sender, &target, "accepted", Some(sender))?;
    // Blocked, already waiting, refused lately, or outside a closed book: nothing delivered, nothing told.
    let reaches = !blocked
        && current.as_deref() != Some("pending")
        && !(current.as_deref() == Some("refused") && refusal_stands(db, &target, sender)?)
        && accepts_request_from(db, &target, sender)?;
    let text = note_text(note);
    guard::record(
        db,
        sender,
        Some(&target),
        reaches.then_some(text.as_str()),
        guard::now_ms(),
    )?;
    let pending = json!({ "ok": true, "status": "pending" });
    if !reaches {
        return Ok(decided(pending));
    }
    set_contact(db, &target, sender, "pending", Some(sender))?;
    Ok(Decided {
        result: pending,
        effects: vec![notify(&target, sender, "connection-request", &text)],
    })
}

fn block(db: &Connection, owner: &str, peer: &str) -> Result<JsonValue, String> {
    if owner.is_empty() || peer.is_empty() || owner == peer {
        return Err("contact_target_invalid".into());
    }
    db.execute(
        "INSERT INTO sync_share_policies (owner_id, peer_id, policy, permissions_json, revoked_at)
         VALUES (?, ?, 'block', NULL, NULL)
         ON CONFLICT(owner_id, peer_id) DO UPDATE SET policy = 'block', revoked_at = NULL,
         updated_at = datetime('now')",
        params![owner, peer],
    )
    .map_err(sql)?;
    Ok(json!({ "ok": true, "status": "blocked" }))
}

fn respond(
    db: &Connection,
    owner: &str,
    peer: &str,
    decision: Option<&JsonValue>,
) -> Result<Decided, String> {
    let value = if js::truthy(decision) {
        decision.map(js::string).unwrap_or_default()
    } else {
        String::new()
    }
    .to_lowercase();
    if value == "block" {
        return block(db, owner, peer).map(decided);
    }
    if value != "accept" && value != "refuse" {
        return Err("contact_decision_invalid".into());
    }
    if contact_status(db, owner, peer)?.is_none() {
        return Err("contact_request_not_found".into());
    }
    set_contact(
        db,
        owner,
        peer,
        if value == "accept" {
            "accepted"
        } else {
            "refused"
        },
        None,
    )?;
    if value == "refuse" {
        return Ok(decided(json!({ "ok": true, "status": "refused" })));
    }
    let mut effects = Vec::new();
    if let Some(first) = guard::resolve(db, peer, owner, guard::now_ms())? {
        effects.push(json!({ "effect": "accepted", "ownerId": owner, "peerId": peer, "note": first["note"], "at": first["at"] }));
    }
    effects.push(notify(peer, owner, "connection-accepted", ""));
    Ok(Decided {
        result: json!({ "ok": true, "status": "accepted" }),
        effects,
    })
}

fn unblock(db: &Connection, owner: &str, peer: &str) -> Result<JsonValue, String> {
    db.execute(
        "DELETE FROM sync_share_policies WHERE owner_id = ? AND peer_id = ? AND policy = 'block'",
        params![owner, peer],
    )
    .map_err(sql)?;
    db.execute(
        "DELETE FROM communication_contacts WHERE owner_id = ? AND peer_id = ? AND status = 'refused'",
        params![owner, peer],
    )
    .map_err(sql)?;
    let status = contact_status(db, owner, peer)?.unwrap_or_else(|| "none".into());
    Ok(json!({ "ok": true, "status": status }))
}

// « Fin du lien »: the contact leaves both books, the shares between them stop; a block stays.
fn end(db: &Connection, owner: &str, peer: &str) -> Result<JsonValue, String> {
    if owner.is_empty() || peer.is_empty() || owner == peer {
        return Err("contact_target_invalid".into());
    }
    db.execute(
        "DELETE FROM communication_contacts WHERE (owner_id = ?1 AND peer_id = ?2) OR (owner_id = ?2 AND peer_id = ?1)",
        params![owner, peer],
    )
    .map_err(sql)?;
    db.execute(
        "UPDATE sync_share_policies SET revoked_at = datetime('now'), updated_at = datetime('now')
         WHERE ((owner_id = ?1 AND peer_id = ?2) OR (owner_id = ?2 AND peer_id = ?1)) AND policy != 'block' AND revoked_at IS NULL",
        params![owner, peer],
    )
    .map_err(sql)?;
    Ok(json!({ "ok": true, "status": "none" }))
}

// The requests this account sent and nobody answered, taken back as if never sent.
fn withdraw_requests(db: &Connection, owner: &str) -> Result<JsonValue, String> {
    let mut statement = db
        .prepare_cached("SELECT owner_id FROM communication_contacts WHERE peer_id = ?1 AND status = 'pending' AND requested_by = ?1")
        .map_err(sql)?;
    let peers: Vec<Option<String>> = statement
        .query_map(params![owner], |row| row.get(0))
        .map_err(sql)?
        .collect::<Result<_, _>>()
        .map_err(sql)?;
    for peer in &peers {
        db.execute(
            "DELETE FROM communication_contacts WHERE owner_id = ? AND peer_id = ? AND status = 'pending'",
            params![peer, owner],
        )
        .map_err(sql)?;
        db.execute(
            "DELETE FROM communication_contacts WHERE owner_id = ? AND peer_id = ?",
            params![owner, peer],
        )
        .map_err(sql)?;
    }
    Ok(json!({ "ok": true, "withdrawn": peers.len() }))
}

/// `handle(message, userId)`: the `contact` family's actions.
fn handle(db: &Connection, message: &JsonValue, user: &str) -> Result<Decided, String> {
    let action = js::first(message, &["action"])
        .map(js::string)
        .unwrap_or_default()
        .to_lowercase();
    let peer_value = js::first(message, &["userId", "toUserId", "fromUserId", "peerId"])
        .cloned()
        .unwrap_or(JsonValue::Null);
    let peer = id(Some(&peer_value));
    match action.as_str() {
        "request" => admit_request(
            db,
            user,
            &peer_value,
            message.get("note"),
            message.get("phone"),
        ),
        "preferences-get" => Ok(decided(
            json!({ "ok": true, "acceptUnknown": preferences(db, user)?.0 }),
        )),
        "preferences-set" => {
            let accept = message.get("acceptUnknown") != Some(&JsonValue::Bool(false));
            upsert_preferences(db, user, Some(i64::from(accept)), None)?;
            Ok(decided(json!({ "ok": true, "acceptUnknown": accept })))
        }
        "address-book-set" => {
            let book = book_of(message.get("hashes"));
            upsert_preferences(
                db,
                user,
                None,
                Some(&serde_json::to_string(&book).map_err(|e| e.to_string())?),
            )?;
            Ok(decided(json!({ "ok": true, "count": book.len() })))
        }
        "respond" => respond(db, user, &peer, message.get("decision")),
        "block" => block(db, user, &peer).map(decided),
        "unblock" => unblock(db, user, &peer).map(decided),
        "list" => list(db, user).map(decided),
        "end" => end(db, user, &peer).map(decided),
        "withdraw-requests" => withdraw_requests(db, user).map(decided),
        other => Err(format!(
            "contact_action_unsupported:{}",
            if other.is_empty() { "missing" } else { other }
        )),
    }
}

impl Relations {
    pub fn new(central: Central) -> Self {
        Self { central }
    }

    /// `isWsApiPrincipalProvisioned`: a live user atome.
    pub async fn provisioned(&self, principal: &str) -> Result<bool, String> {
        if principal.is_empty() {
            return Ok(false);
        }
        let row = self
            .central
            .get(
                "SELECT atome_type FROM atomes WHERE atome_id = ? AND deleted_at IS NULL",
                vec![json!(principal)],
            )
            .await?;
        Ok(row.is_some_and(|row| row["atome_type"] == "user"))
    }

    /// The `contact` family's action, its writes kept whatever comes after (Fastify's
    /// statements stand alone), with the moment a request started for the guard's floor.
    pub async fn handle(&self, message: JsonValue, user: String) -> Result<Decided, String> {
        self.central
            .committed(move |db| handle(db, &message, &user))
            .await?
    }

    /// The `relations:<op>` SERVICE frames of Fastify's thin client (server/communication_relations.js).
    pub async fn service(&self, operation: &str, payload: &JsonValue) -> Result<JsonValue, String> {
        let operation = operation.to_string();
        let payload = payload.clone();
        let decided = self
            .central
            .committed(move |db| {
                let text = |key: &str| id(payload.get(key));
                match operation.as_str() {
                    "relations:can-communicate" => {
                        can_communicate(db, &text("sender"), &text("recipient")).map(decided)
                    }
                    "relations:blocked-either-way" => {
                        blocked_either_way(db, &text("a"), &text("b"))
                            .map(|blocked| decided(json!(blocked)))
                    }
                    "relations:has-blocked" => has_blocked(db, &text("owner"), &text("peer"))
                        .map(|blocked| decided(json!(blocked))),
                    "relations:request" => {
                        let target = payload.get("target").cloned().unwrap_or(JsonValue::Null);
                        admit_request(
                            db,
                            &text("sender"),
                            &target,
                            payload.get("note"),
                            payload.get("phone"),
                        )
                    }
                    "relations:respond" => {
                        respond(db, &text("owner"), &text("peer"), payload.get("decision"))
                    }
                    "relations:block" => block(db, &text("owner"), &text("peer")).map(decided),
                    "relations:unblock" => unblock(db, &text("owner"), &text("peer")).map(decided),
                    "relations:end" => end(db, &text("owner"), &text("peer")).map(decided),
                    "relations:withdraw-requests" => {
                        withdraw_requests(db, &text("owner")).map(decided)
                    }
                    "relations:list" => list(db, &text("owner")).map(decided),
                    "relations:handle" => handle(db, &payload["message"], &text("user")),
                    other => Err(format!("relations_operation_unknown:{other}")),
                }
            })
            .await??;
        Ok(json!({ "result": decided.result, "effects": decided.effects }))
    }
}
