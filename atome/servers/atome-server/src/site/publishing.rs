// Websites (server/site_publishing.js, ported; todo/publication_web_2026-10-28.md): a project
// published at atome.one/<slug>[/<page>]. The settings are the author's `site` Atome (address,
// title, description, pages, credit line); this service claims the address, freezes a version
// from the project's atomes (projection.rs) on disk, points the site at it now or at a planned
// time, keeps every version (a rollback is a new version, the history is never rewritten), and
// writes its word back on the Atome (`site_status`). Media are never copied: a version points to
// the original file by its content (SHA-256).
use super::contract::{SITE_ATOME_TYPE, site_project_id, slug_error, slugify};
use super::projection::{self, Projected, Wanted, parse};
use super::{Site, fail, now_ms};
use crate::media::downloads::Downloads;
use crate::social::public_events::contract::clip;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::path::PathBuf;

pub(super) struct Settings {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub page_ids: Option<Vec<String>>,
    pub credit: bool,
}

/// A failure answered as it is, or the work's value.
pub(super) type Answer<T> = Result<T, JsonValue>;

// `vaultRouter.listStates` answered as a list.
fn listed(states: JsonValue) -> Vec<JsonValue> {
    match states {
        JsonValue::Array(states) => states,
        other => js::first(&other, &["items", "states"])
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default(),
    }
}

pub(super) fn live(records: Vec<JsonValue>) -> Vec<JsonValue> {
    records
        .into_iter()
        .filter(|record| record.pointer("/properties/__deleted") != Some(&JsonValue::Bool(true)))
        .collect()
}

pub(super) fn pages_of(projected: &Projected) -> JsonValue {
    JsonValue::Array(
        projected
            .pages
            .iter()
            .map(|page| page.entry.clone())
            .collect(),
    )
}

// The failure of a projection that made no page.
pub(super) fn unmade(projected: &Projected) -> JsonValue {
    json!({ "ok": false, "error": projected.error.unwrap_or_default(), "pages": [], "issues": projected.issues })
}

pub(super) fn next_of(next: Option<&JsonValue>) -> JsonValue {
    next.map_or(
        JsonValue::Null,
        |next| json!({ "kind": next["kind"], "at": next["due_at"], "version": next["version"] }),
    )
}

impl Site {
    pub(super) async fn read_site(&self, owner: &str, site_id: &str) -> Option<Settings> {
        let state = self.router.get_state(owner, &json!(site_id)).await.ok()?;
        let kind = state
            .get("type")
            .filter(|kind| js::truthy(Some(kind)))
            .map(|kind| js::text(Some(kind)).to_lowercase());
        if kind.as_deref() != Some(SITE_ATOME_TYPE)
            || state.pointer("/properties/__deleted") == Some(&JsonValue::Bool(true))
        {
            return None;
        }
        let p = &state["properties"];
        let page_ids = match parse(p.get("page_ids")) {
            Some(JsonValue::Array(ids)) => Some(ids.iter().map(|id| js::text(Some(id))).collect()),
            _ => None,
        };
        let credit = p.get("credit");
        Some(Settings {
            project_id: clip(Some(&json!(site_project_id(site_id))), 200),
            slug: clip(p.get("slug"), 60),
            title: clip(p.get("title"), 120),
            description: clip(p.get("description"), 300),
            page_ids,
            credit: credit != Some(&JsonValue::Bool(false))
                && credit.and_then(JsonValue::as_str) != Some("false"),
        })
    }

    pub(super) fn url_of(&self, row: &JsonValue) -> String {
        format!("{}/{}/", self.origin, js::text(row.get("slug")))
    }

    pub(super) async fn status_of(&self, row: Option<&JsonValue>) -> Result<JsonValue, String> {
        let Some(row) = row else {
            return Ok(json!({ "state": "draft" }));
        };
        let next = self.store.pending(&js::text(row.get("site_id"))).await?;
        let domain = if js::truthy(row.get("domain")) {
            json!({ "name": row["domain"], "state": row["domain_state"], "primary": row["primary_host"] })
        } else {
            JsonValue::Null
        };
        Ok(
            json!({ "state": row["state"], "slug": row["slug"], "url": self.url_of(row),
            "live_version": row["live_version"], "next": next_of(next.as_ref()), "domain": domain,
            "updated_at": js::iso(now_ms()) }),
        )
    }

    pub(super) async fn write_status(
        &self,
        owner: &str,
        site_id: &str,
        extra: Vec<(&'static str, JsonValue)>,
    ) -> Result<JsonValue, String> {
        let row = self.store.site(site_id).await?;
        let status = js::with(&self.status_of(row.as_ref()).await?, extra);
        let event = json!({ "kind": "set", "atome_id": site_id,
            "payload": { "props": { "site_status": status.to_string() } },
            "actor": { "type": "user", "id": owner } });
        let entry = self
            .router
            .commit(owner, &event, &json!({ "source": "site" }))
            .await?;
        if js::truthy(entry.get("inserted")) {
            self.sync.publish(&entry["event"]).await?;
        }
        Ok(status)
    }

    // The address: free, or already this site's. A changed address keeps the old one
    // redirecting (Q7). The site's row once claimed.
    async fn claim(
        &self,
        owner: &str,
        site_id: &str,
        settings: &Settings,
    ) -> Result<Answer<JsonValue>, String> {
        let slug = if settings.slug.is_empty() {
            slugify(&settings.title)
        } else {
            settings.slug.clone()
        };
        match slug_error(&slug) {
            "" => {}
            "site_slug_reserved" => return Ok(Err(fail("SLUG_RESERVED"))),
            _ => return Ok(Err(fail("SLUG_INVALID"))),
        }
        if self
            .store
            .slug_owner(&slug)
            .await?
            .is_some_and(|holder| holder != site_id)
        {
            return Ok(Err(fail("SLUG_TAKEN")));
        }
        match self.store.site(site_id).await? {
            Some(row) if row["owner_id"] != json!(owner) => return Ok(Err(fail("NOT_ALLOWED"))),
            Some(row) if row["slug"] != json!(slug) => {
                self.store
                    .update(site_id, vec![("slug", json!(slug))])
                    .await?
            }
            Some(_) => {}
            None => {
                self.store
                    .create(site_id, owner, &settings.project_id, &slug)
                    .await?
            }
        }
        self.store.claim_slug(&slug, site_id).await?;
        Ok(Ok(self.store.site(site_id).await?.unwrap_or_default()))
    }

    /// The site's row, made at its first server action (a domain chosen before the first
    /// publication).
    pub(super) async fn ensure_row(
        &self,
        owner: &str,
        site_id: &str,
    ) -> Result<Answer<JsonValue>, String> {
        match self.read_site(owner, site_id).await {
            Some(settings) => self.claim(owner, site_id, &settings).await,
            None => Ok(Err(fail("NOT_FOUND"))),
        }
    }

    pub(super) async fn slug_state(&self, slug: &str, site_id: &str) -> Result<JsonValue, String> {
        let reason = match slug_error(slug) {
            "" => "",
            "site_slug_reserved" => "SLUG_RESERVED",
            _ => "SLUG_INVALID",
        };
        if !reason.is_empty() {
            return Ok(json!({ "ok": true, "free": false, "reason": reason }));
        }
        let holder = self.store.slug_owner(slug).await?;
        let taken = holder.is_some_and(|holder| holder != site_id);
        Ok(json!({ "ok": true, "free": !taken, "reason": if taken { "SLUG_TAKEN" } else { "" } }))
    }

    pub(super) fn version_dir(&self, site_id: &str, version: &JsonValue) -> PathBuf {
        let safe: String = site_id
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        self.sites_root.join(safe).join(js::text(Some(version)))
    }

    pub(super) async fn records(
        &self,
        owner: &str,
        project_id: &str,
    ) -> Result<Vec<JsonValue>, String> {
        let states = self
            .router
            .list_states(owner, &json!({ "project_id": project_id, "limit": 10000 }))
            .await?;
        Ok(listed(states))
    }

    pub(super) fn wanted<'a>(
        &'a self,
        site_id: &'a str,
        settings: &'a Settings,
        slug: &'a str,
        media: &'a HashMap<String, String>,
    ) -> Wanted<'a> {
        Wanted {
            project_id: &settings.project_id,
            site_id,
            slug,
            title: &settings.title,
            description: &settings.description,
            page_ids: settings.page_ids.as_deref(),
            credit: settings.credit,
            media,
            origin: &self.origin,
            base: None,
        }
    }

    // A version frozen: its pages on disk, its manifest and media recorded.
    async fn build(
        &self,
        files: &Downloads<'_>,
        owner: &str,
        site_id: &str,
        settings: &Settings,
        row: &JsonValue,
        author: &str,
    ) -> Result<Answer<(i64, JsonValue)>, String> {
        let records = live(self.records(owner, &settings.project_id).await?);
        let (media, found) = self.resolve_media(files, owner, &records).await?;
        let slug = js::text(row.get("slug"));
        let site =
            projection::project_site(&records, &self.wanted(site_id, settings, &slug, &media))?;
        if site.error.is_some() {
            return Ok(Err(unmade(&site)));
        }
        let version = self.store.next_version(site_id).await?;
        let dir = self.version_dir(site_id, &json!(version));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        for page in &site.pages {
            let name = if page.slug.is_empty() {
                "_home"
            } else {
                &page.slug
            };
            std::fs::write(dir.join(format!("{name}.html")), &page.html)
                .map_err(|e| e.to_string())?;
        }
        let manifest = json!({ "title": site.title, "home": site.home, "issues": site.issues, "pages": pages_of(&site) });
        self.store
            .add_version(site_id, version, author, &manifest)
            .await?;
        for (sha256, held) in &found {
            self.store
                .add_media(
                    sha256,
                    site_id,
                    version,
                    &held.file_path.to_string_lossy(),
                    held.mime,
                )
                .await?;
        }
        Ok(Ok((version, manifest)))
    }

    pub(super) async fn activate(
        &self,
        owner: &str,
        site_id: &str,
        version: &JsonValue,
    ) -> Result<JsonValue, String> {
        self.store
            .update(
                site_id,
                vec![
                    ("live_version", version.clone()),
                    ("state", json!("online")),
                ],
            )
            .await?;
        self.write_status(owner, site_id, vec![("last_error", JsonValue::Null)])
            .await
    }

    async fn publish(
        &self,
        files: &Downloads<'_>,
        owner: &str,
        input: &JsonValue,
        site_id: &str,
    ) -> Result<JsonValue, String> {
        let Some(settings) = self.read_site(owner, site_id).await else {
            return Ok(fail("NOT_FOUND"));
        };
        let row = match self.claim(owner, site_id, &settings).await? {
            Ok(row) => row,
            Err(failure) => return Ok(failure),
        };
        let author = if input.get("author") == Some(&json!("eve")) {
            "eve"
        } else {
            "user"
        };
        let (version, manifest) = match self
            .build(files, owner, site_id, &settings, &row, author)
            .await?
        {
            Ok(built) => built,
            Err(failure) => return Ok(failure),
        };
        self.store.cancel_pending(site_id).await?;
        let due = input
            .get("at")
            .filter(|at| js::truthy(Some(at)))
            .and_then(|at| js::date(Some(&json!(js::text(Some(at))))));
        if let Some(due) = due.filter(|due| *due > now_ms()) {
            let op = uuid::Uuid::new_v4().to_string();
            self.store
                .add_operation(&op, site_id, version, &js::iso(due))
                .await?;
            self.clock.notify_one();
            return Ok(
                json!({ "ok": true, "scheduled": true, "version": version, "issues": manifest["issues"],
                "site": self.write_status(owner, site_id, Vec::new()).await? }),
            );
        }
        Ok(
            json!({ "ok": true, "version": version, "issues": manifest["issues"], "url": self.url_of(&row),
            "site": self.activate(owner, site_id, &json!(version)).await? }),
        )
    }

    pub(super) async fn publishing(
        &self,
        files: &Downloads<'_>,
        data: &JsonValue,
        user: &str,
        action: &str,
    ) -> Result<Option<JsonValue>, String> {
        if action == "slug" {
            let (slug, site_id) = (clip(data.get("slug"), 60), clip(data.get("site_id"), 200));
            return self.slug_state(&slug, &site_id).await.map(Some);
        }
        if action == "list" {
            return self.list(user).await.map(Some);
        }
        let site_id = clip(data.get("site_id"), 200);
        if site_id.is_empty() {
            return Ok(Some(fail("INVALID_ARGUMENT")));
        }
        let site_id = site_id.as_str();
        Ok(Some(match action {
            "publish" => self.publish(files, user, data, site_id).await?,
            "rollback" => self.rollback(user, data, site_id).await?,
            "retire" => self.retire(user, site_id).await?,
            "cancel" => self.cancel(user, site_id).await?,
            "reschedule" => self.reschedule(user, data, site_id).await?,
            "history" => self.history(user, site_id).await?,
            "state" => self.state(user, site_id).await?,
            "check" => self.check(files, user, site_id).await?,
            "preview" => self.preview(files, user, site_id).await?,
            _ => return Ok(None),
        }))
    }
}
