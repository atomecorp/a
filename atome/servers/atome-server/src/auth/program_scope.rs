// What a program may reach on the server (R-316). A program is an MCP client behind the stdio bridge
// (scripts/mcp/atome_mcp_stdio.mjs): its key is enrolled as `mcp_program` (devices.rs), class
// `program`, and its session tokens carry the `prg` claim (device_sessions.rs `issue_access`). It acts
// only through an eVe page the person runs, which checks the families the person granted it
// (atome/src/squirrel/atome/mcp_surface_grants.js). On the server it reaches its own seat, the relay
// and its own session's renewal, nothing else: every other `/ws/api` family, `/ws/sync` and the HTTP
// routes refuse it, so a paired program never reads, writes, shares or deletes as the whole account
// by speaking to the server directly. The table names what is reachable; anything new stays closed.
use super::Sessions;
use super::connection::{Identity, SECRET_ALGORITHMS};
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension};
use serde_json::{Value as JsonValue, json};

/// The refusal a program receives for anything outside its scope.
pub const DENIED: &str = "program_scope_denied";

/// The `auth` actions a program's session may sign: its own renewal.
pub const SESSION_ACTIONS: [&str; 2] = ["session-challenge", "session-renew"];

// Each `/ws/api` family a program reaches, with its actions: its renewal, its seat, the relay.
const REACHABLE: [(&str, &[&str]); 3] = [
    ("auth", &SESSION_ACTIONS),
    ("surface", &["announce", "list", "ping", "retire"]),
    ("remote-control", &["command"]),
];

/// Whether claims are a program's session.
pub fn is_program(claims: &JsonValue) -> bool {
    claims
        .get("prg")
        .and_then(JsonValue::as_str)
        .is_some_and(|program| !program.is_empty())
}

/// Whether a `/ws/api` frame (its `type`, its `action` as the families read it) lies in a program's scope.
pub fn reachable(message: &JsonValue) -> bool {
    let kind = js::id(message.get("type"));
    let action = js::id(js::first(message, &["action", "op"])).to_lowercase();
    REACHABLE
        .iter()
        .any(|(family, actions)| *family == kind && actions.contains(&action.as_str()))
}

/// Whether the session a signed `auth` request names (`sessionId`) belongs to a program's key.
pub fn names_program_session(db: &Connection, session: Option<&JsonValue>) -> Result<bool, String> {
    let Some(session) = session
        .and_then(JsonValue::as_str)
        .filter(|id| !id.is_empty())
    else {
        return Ok(false);
    };
    db.query_row(
        "SELECT k.device_class FROM auth_device_sessions s
         JOIN auth_device_keys k ON k.key_id = s.key_id WHERE s.session_id = ?",
        [session],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(|class| class.flatten().as_deref() == Some("program"))
    .map_err(|e| e.to_string())
}

impl Sessions {
    /// Whether a frame comes from a program: the `prg` claim of its own token, or of the session
    /// installed on its connection. Either one is enough: a program never borrows another scope.
    pub fn names_program(&self, identity: &Identity, message: &JsonValue) -> bool {
        let token = message
            .get("token")
            .and_then(JsonValue::as_str)
            .map(js::trim)
            .unwrap_or_default();
        let signed = (!token.is_empty())
            .then(|| self.verify(&json!(token), &SECRET_ALGORITHMS).ok())
            .flatten();
        signed.as_ref().is_some_and(is_program)
            || identity.held().claims.as_ref().is_some_and(is_program)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_program_reaches_its_seat_the_relay_and_its_renewal_alone() {
        let frame = |kind: &str, action: &str| json!({ "type": kind, "action": action });
        for (kind, action) in [
            ("auth", "session-challenge"),
            ("auth", "session-renew"),
            ("surface", "announce"),
            ("surface", "ping"),
            ("remote-control", "command"),
        ] {
            assert!(reachable(&frame(kind, action)), "{kind} {action}");
        }
        for (kind, action) in [
            ("atome", "create"),
            ("events", "commit"),
            ("file", "read"),
            ("share", "send"),
            ("shell", "run"),
            ("teleport", "send"),
            ("surface-grant", "accept"),
            ("remote-control", "command-result"),
            ("remote-control", "request"),
            ("auth", "session-delete-account"),
            ("auth", "devices-list"),
            ("auth", "update-user"),
            ("auth", "session-local-bind"),
        ] {
            assert!(!reachable(&frame(kind, action)), "{kind} {action}");
        }
        assert!(!reachable(&json!({ "type": "surface" })));
    }

    #[test]
    fn only_a_prg_claim_names_a_program() {
        assert!(is_program(&json!({ "sub": "u", "prg": "device-1" })));
        assert!(!is_program(&json!({ "sub": "u" })));
        assert!(!is_program(&json!({ "sub": "u", "prg": "" })));
    }

    #[test]
    fn a_program_session_is_known_by_its_key_class() {
        let db = Connection::open_in_memory().expect("db");
        db.execute_batch(
            "CREATE TABLE auth_device_keys (key_id TEXT, device_class TEXT);
             CREATE TABLE auth_device_sessions (session_id TEXT, key_id TEXT);
             INSERT INTO auth_device_keys VALUES ('kp', 'program'), ('kh', 'personal');
             INSERT INTO auth_device_sessions VALUES ('sp', 'kp'), ('sh', 'kh');",
        )
        .expect("schema");
        let named = |id: JsonValue| names_program_session(&db, Some(&id)).expect("read");
        assert!(named(json!("sp")));
        assert!(!named(json!("sh")));
        assert!(!named(json!("unknown")));
        assert!(!names_program_session(&db, None).expect("read"));
    }
}
