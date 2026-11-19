// The pseudonyms of the CB sociale (cahier §3.1, §7.5): what the modes show of a person is an opaque
// random handle, never their account, name or phone. A handle belongs to one context (a channel
// entry, by its room's token since lot L4, never its zone; a call; a bottle and its thread:
// `kind:id`), a new one at each entry; only the server turns it back into the account behind it, to
// block or report that person. Kept in the central database (`cb_handles`) as long as the context
// lives (a channel's, as long as the takes of its voices: recordings/), forgotten with it or with the
// person.
use crate::social::news::db::{get, run, text};
use rusqlite::Connection;

const PREFIX: &str = "cbh_";
const CONTEXT_MAX: usize = 200;

/// Who stands behind a handle, in which context.
pub struct Handle {
    pub context: String,
    pub principal: String,
}

// `cbh_` and 32 lowercase hexadecimal digits: anything else is never looked up.
fn well_formed(handle: &str) -> bool {
    handle.strip_prefix(PREFIX).is_some_and(|random| {
        random.len() == 32
            && random
                .bytes()
                .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    })
}

/// A new handle for `principal` in `context`.
pub fn issue(db: &Connection, context: &str, principal: &str) -> Result<String, String> {
    if context.is_empty() || context.len() > CONTEXT_MAX || principal.is_empty() {
        return Err("cb_handle_context_invalid".into());
    }
    let handle = format!("{PREFIX}{}", uuid::Uuid::new_v4().simple());
    run(
        db,
        "INSERT INTO cb_handles (handle, context, principal_id) VALUES (?, ?, ?)",
        &[&handle, &context, &principal],
    )?;
    Ok(handle)
}

/// The person behind `handle`, none for an unknown or malformed one.
pub fn resolve(db: &Connection, handle: &str) -> Result<Option<Handle>, String> {
    if !well_formed(handle) {
        return Ok(None);
    }
    Ok(get(
        db,
        "SELECT context, principal_id FROM cb_handles WHERE handle = ?",
        &[&handle],
    )?
    .map(|row| Handle {
        context: text(row.get("context")),
        principal: text(row.get("principal_id")),
    }))
}

/// `handle` given in `context` after all (a channel another made at the same instant, social/cb/channel_actions.rs).
pub fn move_context(db: &Connection, handle: &str, context: &str) -> Result<usize, String> {
    run(
        db,
        "UPDATE cb_handles SET context = ? WHERE handle = ?",
        &[&context, &handle],
    )
}

/// Every handle of a context that ended (a channel left, a bottle gone).
pub fn forget_context(db: &Connection, context: &str) -> Result<usize, String> {
    run(db, "DELETE FROM cb_handles WHERE context = ?", &[&context])
}

/// Every handle of a person (their account deleted).
pub fn forget_principal(db: &Connection, principal: &str) -> Result<usize, String> {
    run(
        db,
        "DELETE FROM cb_handles WHERE principal_id = ?",
        &[&principal],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let db = Connection::open_in_memory().expect("db");
        for statement in crate::central_schema::CB_TABLES {
            db.execute_batch(statement).expect("cb tables");
        }
        db
    }

    #[test]
    fn a_handle_is_opaque_and_new_at_each_entry() {
        let db = db();
        let first = issue(&db, "channel:5:u09tv:19", "alice").expect("issue");
        let again = issue(&db, "channel:5:u09tv:19", "alice").expect("issue");
        assert_ne!(first, again, "a new handle at each entry");
        assert!(well_formed(&first) && !first.contains("alice"));
        let found = resolve(&db, &first).expect("resolve").expect("known");
        assert_eq!(
            (found.context.as_str(), found.principal.as_str()),
            ("channel:5:u09tv:19", "alice")
        );
        assert!(resolve(&db, "cbh_0123").expect("short").is_none());
        assert!(resolve(&db, "alice").expect("an id").is_none());
        assert!(
            resolve(&db, &format!("{PREFIX}{}", "0".repeat(32)))
                .expect("unknown")
                .is_none()
        );
        assert!(issue(&db, "", "alice").is_err());
        assert!(issue(&db, "bottle:b1", "").is_err());
    }

    #[test]
    fn a_handle_goes_with_its_context_or_its_person() {
        let db = db();
        let kept = issue(&db, "bottle:b1", "alice").expect("issue");
        let left = issue(&db, "channel:5:u09tv:19", "alice").expect("issue");
        let bob = issue(&db, "channel:5:u09tv:19", "bob").expect("issue");
        assert_eq!(forget_context(&db, "channel:5:u09tv:19"), Ok(2));
        assert!(resolve(&db, &left).expect("left").is_none());
        assert!(resolve(&db, &bob).expect("bob").is_none());
        assert!(resolve(&db, &kept).expect("kept").is_some());
        assert_eq!(forget_principal(&db, "alice"), Ok(1));
        assert!(resolve(&db, &kept).expect("gone").is_none());
    }
}
