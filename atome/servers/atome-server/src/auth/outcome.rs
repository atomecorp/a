// What an `auth` operation of `/ws/api` answers, with the effects ws_api/auth_effects.rs
// carries out before replying, and the account's public directory entry it projects again.
use serde_json::{Value as JsonValue, json};

/// What an operation answers, and its effects before the reply, in the order Fastify met them
/// (ws_api/auth_effects.rs): the account's devices told, the sessions ended disconnected, a
/// pairing followed or told, the connection joined to its account, a phone link told.
pub struct Outcome {
    pub result: JsonValue,
    pub effects: Vec<(&'static str, JsonValue)>,
    /// The principal whose directory entry is projected again, and whether it is gone.
    pub directory: Option<(String, bool)>,
}

impl Outcome {
    pub fn answer(result: JsonValue) -> Self {
        Self {
            result,
            effects: Vec::new(),
            directory: None,
        }
    }

    /// `notify(principal, notice, options)`.
    pub fn notify(mut self, principal: &str, notice: JsonValue, options: JsonValue) -> Self {
        self.effects.push((
            "notify",
            json!({ "principal": principal, "notice": notice, "options": options }),
        ));
        self
    }

    /// `disconnectSession` of each; this connection's own close waits for its reply.
    pub fn disconnect(mut self, sessions: Vec<String>) -> Self {
        if !sessions.is_empty() {
            self.effects
                .push(("disconnect", json!({ "sessions": sessions })));
        }
        self
    }

    pub fn directory(mut self, principal: &str, deleted: bool) -> Self {
        self.directory = Some((principal.to_string(), deleted));
        self
    }

    pub fn effect(mut self, kind: &'static str, fields: JsonValue) -> Self {
        self.effects.push((kind, fields));
        self
    }
}
