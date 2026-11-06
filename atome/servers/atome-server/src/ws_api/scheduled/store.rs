// The scheduled sends' table (database/adole_scheduled_sends_schema.js; server/scheduled_sends_store.js,
// ported): its SQL, nothing else. mod.rs decides what a row holds and how it moves.
use crate::vault_router::central::Central;
use atome_store::intent::js_stringify;
use serde_json::{Value as JsonValue, json};

pub struct Store<'a>(pub &'a Central);

/// A send as its owner saved it.
pub struct Saved<'a> {
    pub send_id: &'a str,
    pub owner_id: &'a str,
    pub kind: &'a str,
    pub parent_id: Option<&'a str>,
    pub title: &'a str,
    pub due_at: &'a str,
    pub payload: &'a JsonValue,
}

impl Store<'_> {
    pub async fn get(&self, send_id: &str) -> Result<Option<JsonValue>, String> {
        self.0
            .get(
                "SELECT * FROM scheduled_sends WHERE send_id = ?",
                vec![json!(send_id)],
            )
            .await
    }

    /// A pending send replaced whole (content, time, title) until it leaves.
    pub async fn put(&self, saved: Saved<'_>) -> Result<(), String> {
        self.0
            .run(
                "INSERT INTO scheduled_sends
            (send_id, owner_id, kind, parent_id, title, due_at, state, payload_json) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
        ON CONFLICT(send_id) DO UPDATE SET title = excluded.title, due_at = excluded.due_at, payload_json = excluded.payload_json,
            updated_at = datetime('now') WHERE scheduled_sends.state = 'pending'",
                vec![
                    json!(saved.send_id),
                    json!(saved.owner_id),
                    json!(saved.kind),
                    json!(saved.parent_id),
                    json!(saved.title),
                    json!(saved.due_at),
                    json!(js_stringify(saved.payload)),
                ],
            )
            .await
    }

    /// Taken by one clock only: the row moves from pending to sending once.
    pub async fn take(&self, send_id: &str) -> Result<bool, String> {
        let send_id = send_id.to_string();
        self.0
            .transaction(move |db| {
                db.execute(
                    "UPDATE scheduled_sends SET state = 'sending', updated_at = datetime('now')
        WHERE send_id = ? AND state = 'pending'",
                    [&send_id],
                )
                .map(|changes| changes == 1)
                .map_err(|e| e.to_string())
            })
            .await
    }

    pub async fn finish(
        &self,
        send_id: &str,
        from: &str,
        to: &str,
        result: Option<&JsonValue>,
    ) -> Result<(), String> {
        self.0
            .run(
                "UPDATE scheduled_sends SET state = ?, result_json = ?, done_at = datetime('now'),
        updated_at = datetime('now') WHERE send_id = ? AND state = ?",
                vec![
                    json!(to),
                    json!(result.map(js_stringify)),
                    json!(send_id),
                    json!(from),
                ],
            )
            .await
    }

    /// The pending sends due at `at` (ISO times compare as text).
    pub async fn due(&self, at: &str) -> Result<Vec<JsonValue>, String> {
        self.0
            .all(
                "SELECT * FROM scheduled_sends WHERE state = 'pending' AND due_at <= ? ORDER BY due_at LIMIT 200".into(),
                vec![json!(at)],
            )
            .await
    }

    pub async fn next(&self) -> Result<Option<JsonValue>, String> {
        self.0
            .get(
                "SELECT due_at FROM scheduled_sends WHERE state = 'pending' ORDER BY due_at LIMIT 1",
                Vec::new(),
            )
            .await
    }

    pub async fn children(&self, parent_id: &str) -> Result<Vec<JsonValue>, String> {
        self.0
            .all(
                "SELECT * FROM scheduled_sends WHERE parent_id = ?".into(),
                vec![json!(parent_id)],
            )
            .await
    }

    /// An owner's sends, those changed since `since` (an ISO time) when it is given.
    pub async fn of_owner(
        &self,
        owner_id: &str,
        since: Option<&str>,
    ) -> Result<Vec<JsonValue>, String> {
        let mut values = vec![json!(owner_id)];
        let mut sql = "SELECT * FROM scheduled_sends WHERE owner_id = ?".to_string();
        if let Some(since) = since {
            sql.push_str(" AND updated_at >= ?");
            let since: String = since.replacen('T', " ", 1).chars().take(19).collect();
            values.push(json!(since));
        }
        sql.push_str(" ORDER BY due_at LIMIT 500");
        self.0.all(sql, values).await
    }
}
