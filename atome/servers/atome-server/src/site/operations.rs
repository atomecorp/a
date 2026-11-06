// A site's versions after their making (server/site_publishing.js, ported): a rollback is a
// new version copied from an old one, a retirement, a planned operation cancelled or moved, the
// history, a site's state and an account's sites, a check and a preview made without a version,
// and the clock running what time makes due.
use super::contract::slugify;
use super::projection::{self, Wanted};
use super::publishing::{live, next_of, pages_of, unmade};
use super::{Preview, Site, fail, now_ms};
use crate::media::downloads::Downloads;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::path::Path;

fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

impl Site {
    pub(super) async fn owned(
        &self,
        owner: &str,
        site_id: &str,
    ) -> Result<Option<JsonValue>, String> {
        Ok(self
            .store
            .site(site_id)
            .await?
            .filter(|row| row["owner_id"] == json!(owner)))
    }
    pub(super) async fn rollback(
        &self,
        owner: &str,
        input: &JsonValue,
        site_id: &str,
    ) -> Result<JsonValue, String> {
        let wanted = js::number_json(js::number(input.get("version")));
        let old = match self.owned(owner, site_id).await? {
            Some(_) => self.store.version(site_id, &wanted).await?,
            None => None,
        };
        let Some(old) = old else {
            return Ok(fail("NOT_FOUND"));
        };
        let next = self.store.next_version(site_id).await?;
        let (from, to) = (
            self.version_dir(site_id, &old["version"]),
            self.version_dir(site_id, &json!(next)),
        );
        tokio::task::spawn_blocking(move || copy_tree(&from, &to))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        let manifest = js::with(
            &old["manifest"],
            [("restored_from", old["version"].clone())],
        );
        self.store
            .add_version(site_id, next, "user", &manifest)
            .await?;
        let from = old["version"].as_i64().unwrap_or_default();
        self.store.copy_media(site_id, from, next).await?;
        self.store.cancel_pending(site_id).await?;
        Ok(
            json!({ "ok": true, "version": next, "site": self.activate(owner, site_id, &json!(next)).await? }),
        )
    }
    pub(super) async fn retire(&self, owner: &str, site_id: &str) -> Result<JsonValue, String> {
        if self.owned(owner, site_id).await?.is_none() {
            return Ok(fail("NOT_FOUND"));
        }
        self.store.cancel_pending(site_id).await?;
        self.store
            .update(site_id, vec![("state", json!("retired"))])
            .await?;
        Ok(json!({ "ok": true, "site": self.write_status(owner, site_id, Vec::new()).await? }))
    }
    pub(super) async fn cancel(&self, owner: &str, site_id: &str) -> Result<JsonValue, String> {
        if self.owned(owner, site_id).await?.is_none() {
            return Ok(fail("NOT_FOUND"));
        }
        self.store.cancel_pending(site_id).await?;
        Ok(json!({ "ok": true, "site": self.write_status(owner, site_id, Vec::new()).await? }))
    }
    // A planned operation moved (the Agenda): the same frozen version, at its new time.
    pub(super) async fn reschedule(
        &self,
        owner: &str,
        input: &JsonValue,
        site_id: &str,
    ) -> Result<JsonValue, String> {
        if self.owned(owner, site_id).await?.is_none() {
            return Ok(fail("NOT_FOUND"));
        }
        let due = js::date(Some(&json!(js::text(input.get("at")))));
        let Some(due) = due.filter(|due| *due > now_ms()) else {
            return Ok(fail("INVALID_ARGUMENT"));
        };
        if self.store.pending(site_id).await?.is_none() {
            return Ok(fail("NOT_FOUND"));
        }
        self.store.move_pending(site_id, &js::iso(due)).await?;
        self.clock.notify_one();
        Ok(json!({ "ok": true, "site": self.write_status(owner, site_id, Vec::new()).await? }))
    }
    pub(super) async fn history(&self, owner: &str, site_id: &str) -> Result<JsonValue, String> {
        let Some(row) = self.owned(owner, site_id).await? else {
            return Ok(fail("NOT_FOUND"));
        };
        let next = self.store.pending(site_id).await?;
        let versions: Vec<JsonValue> = self
            .store
            .versions(site_id)
            .await?
            .into_iter()
            .map(|v| {
                let state = if v["version"] == row["live_version"] && row["state"] == json!("online") {
                    "online"
                } else if next.as_ref().is_some_and(|next| next["version"] == v["version"]) {
                    "planned"
                } else {
                    ""
                };
                json!({ "version": v["version"], "author": v["author"], "created_at": v["created_at"], "state": state })
            })
            .collect();
        Ok(json!({ "ok": true, "versions": versions, "next": next_of(next.as_ref()) }))
    }
    pub(super) async fn state(&self, owner: &str, site_id: &str) -> Result<JsonValue, String> {
        let row = self.store.site(site_id).await?;
        if row
            .as_ref()
            .is_some_and(|row| row["owner_id"] != json!(owner))
        {
            return Ok(fail("NOT_ALLOWED"));
        }
        let live = match row.as_ref().map(|row| &row["live_version"]) {
            Some(version) if js::truthy(Some(version)) => {
                self.store.version(site_id, version).await?
            }
            _ => None,
        };
        let manifest = live.as_ref().map(|live| &live["manifest"]);
        let or_empty = |key: &str| {
            manifest
                .and_then(|manifest| manifest.get(key))
                .filter(|value| js::truthy(Some(value)))
                .cloned()
                .unwrap_or(json!([]))
        };
        let site = js::with(
            &self.status_of(row.as_ref()).await?,
            [("pages", or_empty("pages")), ("issues", or_empty("issues"))],
        );
        Ok(json!({ "ok": true, "site": site }))
    }
    pub(super) async fn list(&self, owner: &str) -> Result<JsonValue, String> {
        let mut sites = Vec::new();
        for row in self.store.of_owner(owner).await? {
            let mut site = serde_json::Map::new();
            site.insert("site_id".into(), row["site_id"].clone());
            site.insert("project_id".into(), row["project_id"].clone());
            if let JsonValue::Object(status) = self.status_of(Some(&row)).await? {
                site.extend(status);
            }
            sites.push(JsonValue::Object(site));
        }
        Ok(json!({ "ok": true, "sites": sites }))
    }
    // A check before publishing: the version that would be made, without making it.
    pub(super) async fn check(
        &self,
        files: &Downloads<'_>,
        owner: &str,
        site_id: &str,
    ) -> Result<JsonValue, String> {
        let Some(settings) = self.read_site(owner, site_id).await else {
            return Ok(fail("NOT_FOUND"));
        };
        let slug = if settings.slug.is_empty() {
            slugify(&settings.title)
        } else {
            settings.slug.clone()
        };
        let records = self.records(owner, &settings.project_id).await?;
        let (media, _) = self.resolve_media(files, owner, &records).await?;
        let wanted = Wanted {
            title: "",
            description: "",
            credit: true,
            ..self.wanted(site_id, &settings, &slug, &media)
        };
        let projected = projection::project_site(&records, &wanted)?;
        Ok(
            json!({ "ok": true, "report": { "ok": projected.error.is_none(), "error": projected.error.unwrap_or_default(),
            "slug": self.slug_state(&slug, site_id).await?, "pages": pages_of(&projected), "issues": projected.issues } }),
        )
    }
    // A preview (« Aperçu »): the version that would be made, kept in memory for half an hour
    // under a random token, its pages and media readable by whoever holds the token (http.rs).
    // One per site.
    pub(super) async fn preview(
        &self,
        files: &Downloads<'_>,
        owner: &str,
        site_id: &str,
    ) -> Result<JsonValue, String> {
        let Some(settings) = self.read_site(owner, site_id).await else {
            return Ok(fail("NOT_FOUND"));
        };
        let now = now_ms();
        self.previews
            .lock()
            .expect("previews")
            .retain(|_, entry| entry.site_id != site_id && entry.expires >= now);
        let token = super::random_token(18);
        let slug = if settings.slug.is_empty() {
            slugify(&settings.title)
        } else {
            settings.slug.clone()
        };
        let records = live(self.records(owner, &settings.project_id).await?);
        let (media, found) = self.resolve_media(files, owner, &records).await?;
        let base = format!("/_site/preview/{token}/");
        let wanted = Wanted {
            base: Some(&base),
            ..self.wanted(site_id, &settings, &slug, &media)
        };
        let projected = projection::project_site(&records, &wanted)?;
        if projected.error.is_some() {
            return Ok(unmade(&projected));
        }
        let issues = projected.issues.clone();
        self.previews.lock().expect("previews").insert(
            token.clone(),
            Preview {
                site_id: site_id.to_string(),
                expires: now_ms() + 30 * 60_000,
                pages: projected
                    .pages
                    .into_iter()
                    .map(|page| (page.slug, page.html))
                    .collect(),
                media: found.into_iter().collect(),
            },
        );
        Ok(
            json!({ "ok": true, "url": format!("{}{base}", self.origin), "path": base, "issues": issues }),
        )
    }
    /// The clock: due planned operations run, then it waits for the next one (or a change).
    pub async fn clock(self: std::sync::Arc<Self>) {
        loop {
            let wait = match self.store.next_due().await {
                Ok(Some(at)) => js::date(Some(&json!(at)))
                    .map(|due| (due - now_ms()).clamp(0, 3_600_000) as u64),
                Ok(None) => None,
                Err(error) => {
                    eprintln!("[site] clock {error}");
                    None
                }
            };
            let sleep = async {
                match wait {
                    Some(ms) => tokio::time::sleep(std::time::Duration::from_millis(ms)).await,
                    None => std::future::pending().await,
                }
            };
            tokio::select! {
                () = sleep => {
                    if let Err(error) = self.tick().await {
                        eprintln!("[site] clock {error}");
                    }
                }
                () = self.clock.notified() => {}
            }
        }
    }
    pub(super) async fn tick(&self) -> Result<(), String> {
        for op in self.store.due(&js::iso(now_ms())).await? {
            let op_id = js::text(op.get("op_id"));
            let Some(row) = self.store.site(&js::text(op.get("site_id"))).await? else {
                self.store
                    .finish_operation(&op_id, "failed", Some("site_missing"))
                    .await?;
                continue;
            };
            let (owner, site_id) = (js::text(row.get("owner_id")), js::text(row.get("site_id")));
            if !self.store.finish_operation(&op_id, "done", None).await? {
                continue;
            }
            if let Err(error) = self.activate(&owner, &site_id, &op["version"]).await
                && let Err(written) = self
                    .write_status(&owner, &site_id, vec![("last_error", json!(error))])
                    .await
            {
                eprintln!("[site] status {written}");
            }
        }
        Ok(())
    }
}
