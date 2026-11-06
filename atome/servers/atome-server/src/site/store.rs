// The websites' tables (database/adole_site_schema.js; server/site_store.js, ported): their SQL,
// nothing else. publishing.rs decides what a site's row holds, domains.rs its domain and mail.
use crate::vault_router::central::{Central, sql_value};
use serde_json::{Value as JsonValue, json};

pub struct Store {
    pub central: Central,
}

impl Store {
    pub async fn site(&self, site_id: &str) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT * FROM site_publications WHERE site_id = ?",
                vec![json!(site_id)],
            )
            .await
    }

    pub async fn slug_owner(&self, slug: &str) -> Result<Option<String>, String> {
        Ok(self
            .central
            .get(
                "SELECT site_id FROM site_slugs WHERE slug = ?",
                vec![json!(slug)],
            )
            .await?
            .and_then(|row| row["site_id"].as_str().map(str::to_string)))
    }

    pub async fn by_slug(&self, slug: &str) -> Result<Option<JsonValue>, String> {
        match self.slug_owner(slug).await? {
            Some(site_id) => self.site(&site_id).await,
            None => Ok(None),
        }
    }

    pub async fn by_domain(&self, domain: &str) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT * FROM site_publications WHERE domain = ?",
                vec![json!(domain)],
            )
            .await
    }

    pub async fn of_owner(&self, owner: &str) -> Result<Vec<JsonValue>, String> {
        self.central
            .all(
                "SELECT * FROM site_publications WHERE owner_id = ? ORDER BY updated_at DESC"
                    .into(),
                vec![json!(owner)],
            )
            .await
    }

    pub async fn create(
        &self,
        site_id: &str,
        owner: &str,
        project_id: &str,
        slug: &str,
    ) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO site_publications (site_id, owner_id, project_id, slug) VALUES (?, ?, ?, ?)",
                vec![json!(site_id), json!(owner), json!(project_id), json!(slug)],
            )
            .await
    }

    pub async fn claim_slug(&self, slug: &str, site_id: &str) -> Result<(), String> {
        self.central
            .run(
                "INSERT OR IGNORE INTO site_slugs (slug, site_id) VALUES (?, ?)",
                vec![json!(slug), json!(site_id)],
            )
            .await
    }

    /// `update(siteId, fields)`: the named columns, and `updated_at`.
    pub async fn update(
        &self,
        site_id: &str,
        fields: Vec<(&'static str, JsonValue)>,
    ) -> Result<(), String> {
        let site_id = site_id.to_string();
        self.central
            .transaction(move |db| {
                let set: Vec<String> = fields.iter().map(|(key, _)| format!("{key} = ?")).collect();
                let sql = format!(
                    "UPDATE site_publications SET {}, updated_at = datetime('now') WHERE site_id = ?",
                    set.join(", ")
                );
                let mut values: Vec<rusqlite::types::Value> =
                    fields.iter().map(|(_, value)| sql_value(value)).collect();
                values.push(rusqlite::types::Value::Text(site_id));
                db.execute(&sql, rusqlite::params_from_iter(values))
                    .map(|_| ())
                    .map_err(|e| e.to_string())
            })
            .await
    }

    pub async fn next_version(&self, site_id: &str) -> Result<i64, String> {
        let row = self
            .central
            .get(
                "SELECT MAX(version) AS v FROM site_versions WHERE site_id = ?",
                vec![json!(site_id)],
            )
            .await?;
        Ok(row.and_then(|row| row["v"].as_i64()).unwrap_or(0) + 1)
    }

    pub async fn add_version(
        &self,
        site_id: &str,
        version: i64,
        author: &str,
        manifest: &JsonValue,
    ) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO site_versions (site_id, version, author, manifest_json) VALUES (?, ?, ?, ?)",
                vec![json!(site_id), json!(version), json!(author), json!(manifest.to_string())],
            )
            .await
    }

    /// A version, its manifest read back.
    pub async fn version(
        &self,
        site_id: &str,
        version: &JsonValue,
    ) -> Result<Option<JsonValue>, String> {
        let row = self
            .central
            .get(
                "SELECT * FROM site_versions WHERE site_id = ? AND version = ?",
                vec![json!(site_id), version.clone()],
            )
            .await?;
        row.map(|mut row| {
            let manifest: JsonValue =
                serde_json::from_str(row["manifest_json"].as_str().unwrap_or(""))
                    .map_err(|e| e.to_string())?;
            row["manifest"] = manifest;
            Ok(row)
        })
        .transpose()
    }

    pub async fn versions(&self, site_id: &str) -> Result<Vec<JsonValue>, String> {
        self.central
            .all(
                "SELECT site_id, version, author, created_at FROM site_versions WHERE site_id = ? ORDER BY version DESC".into(),
                vec![json!(site_id)],
            )
            .await
    }

    pub async fn add_media(
        &self,
        sha256: &str,
        site_id: &str,
        version: i64,
        file_path: &str,
        mime: &str,
    ) -> Result<(), String> {
        self.central
            .run(
                "INSERT OR IGNORE INTO site_media (sha256, site_id, version, file_path, mime) VALUES (?, ?, ?, ?, ?)",
                vec![json!(sha256), json!(site_id), json!(version), json!(file_path), json!(mime)],
            )
            .await
    }

    pub async fn copy_media(&self, site_id: &str, from: i64, to: i64) -> Result<(), String> {
        self.central
            .run(
                "INSERT OR IGNORE INTO site_media (sha256, site_id, version, file_path, mime)
                 SELECT sha256, site_id, ?, file_path, mime FROM site_media WHERE site_id = ? AND version = ?",
                vec![json!(to), json!(site_id), json!(from)],
            )
            .await
    }

    /// A media is public while a version online points to it.
    pub async fn live_media(&self, sha256: &str) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT m.file_path, m.mime, p.owner_id FROM site_media m JOIN site_publications p
                 ON p.site_id = m.site_id AND p.live_version = m.version AND p.state = 'online' WHERE m.sha256 = ? LIMIT 1",
                vec![json!(sha256)],
            )
            .await
    }

    pub async fn add_operation(
        &self,
        op_id: &str,
        site_id: &str,
        version: i64,
        due_at: &str,
    ) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO site_operations (op_id, site_id, kind, version, due_at) VALUES (?, ?, 'publish', ?, ?)",
                vec![json!(op_id), json!(site_id), json!(version), json!(due_at)],
            )
            .await
    }

    pub async fn pending(&self, site_id: &str) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT * FROM site_operations WHERE site_id = ? AND state = 'pending' ORDER BY due_at LIMIT 1",
                vec![json!(site_id)],
            )
            .await
    }

    pub async fn due(&self, at: &str) -> Result<Vec<JsonValue>, String> {
        self.central
            .all(
                "SELECT * FROM site_operations WHERE state = 'pending' AND due_at <= ? ORDER BY due_at".into(),
                vec![json!(at)],
            )
            .await
    }

    pub async fn next_due(&self) -> Result<Option<String>, String> {
        Ok(self
            .central
            .get(
                "SELECT MIN(due_at) AS at FROM site_operations WHERE state = 'pending'",
                vec![],
            )
            .await?
            .and_then(|row| row["at"].as_str().map(str::to_string)))
    }

    /// Whether this call ended the operation (another clock may have ended it first).
    pub async fn finish_operation(
        &self,
        op_id: &str,
        state: &'static str,
        error: Option<&'static str>,
    ) -> Result<bool, String> {
        let op_id = op_id.to_string();
        self.central
            .transaction(move |db| {
                db.execute(
                    "UPDATE site_operations SET state = ?, error = ?, done_at = datetime('now') WHERE op_id = ? AND state = 'pending'",
                    rusqlite::params![state, error, op_id],
                )
                .map(|changed| changed > 0)
                .map_err(|e| e.to_string())
            })
            .await
    }

    pub async fn move_pending(&self, site_id: &str, due_at: &str) -> Result<(), String> {
        self.central
            .run(
                "UPDATE site_operations SET due_at = ? WHERE site_id = ? AND state = 'pending'",
                vec![json!(due_at), json!(site_id)],
            )
            .await
    }

    pub async fn cancel_pending(&self, site_id: &str) -> Result<(), String> {
        self.central
            .run(
                "UPDATE site_operations SET state = 'cancelled', done_at = datetime('now') WHERE site_id = ? AND state = 'pending'",
                vec![json!(site_id)],
            )
            .await
    }

    pub async fn add_traffic(&self, owner: &str, month: &str, bytes: u64) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO site_traffic (owner_id, month, bytes) VALUES (?, ?, ?)
                 ON CONFLICT(owner_id, month) DO UPDATE SET bytes = bytes + excluded.bytes",
                vec![json!(owner), json!(month), json!(bytes)],
            )
            .await
    }

    pub async fn traffic(&self, owner: &str, month: &str) -> Result<i64, String> {
        Ok(self
            .central
            .get(
                "SELECT bytes FROM site_traffic WHERE owner_id = ? AND month = ?",
                vec![json!(owner), json!(month)],
            )
            .await?
            .and_then(|row| row["bytes"].as_i64())
            .unwrap_or(0))
    }

    pub async fn log_contact(&self, site_id: &str, ip_key: &str, at: i64) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO site_contact_log (site_id, ip_key, created_at) VALUES (?, ?, ?)",
                vec![json!(site_id), json!(ip_key), json!(at)],
            )
            .await
    }

    /// The contact messages a site took since `since`, from one address when `ip_key` is given.
    pub async fn contact_count(
        &self,
        site_id: &str,
        ip_key: &str,
        since: i64,
    ) -> Result<i64, String> {
        let mut sql =
            "SELECT COUNT(*) AS n FROM site_contact_log WHERE site_id = ? AND created_at >= ?"
                .to_string();
        let mut values = vec![json!(site_id), json!(since)];
        if !ip_key.is_empty() {
            sql.push_str(" AND ip_key = ?");
            values.push(json!(ip_key));
        }
        let rows = self.central.all(sql, values).await?;
        Ok(rows.first().and_then(|row| row["n"].as_i64()).unwrap_or(0))
    }
}
