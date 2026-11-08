// Which vault holds what, and who may reach it (server/userVaultRouter.js, ported):
// the central registries name the vault of each atome and stream, an atome
// created under another vault's object joins that vault when a share allows it,
// and a state, a list or a stream seen through a share shows what the share
// grants. Fastify asks it through SERVICE frames on the control socket; its
// `/ws/api` envelope and authentication stay there until they are ported.
pub mod central;
pub(crate) use atome_js_values as js;
pub(crate) mod shares;
mod stream_listing;
mod streams;

use crate::media::Storage;
use crate::vaults::Vaults;
use atome_vault::frame;
use central::Central;
use js::{first, truthy};
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::Arc;

pub struct VaultRouter {
    vaults: Arc<Vaults>,
    central: Central,
    // The people's homes: a media's bytes leave them once its delete is committed.
    storage: Arc<Storage>,
}

pub(crate) fn vault_key(principal: &str) -> String {
    Sha256::digest(principal.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn principal(payload: &JsonValue, key: &str) -> String {
    js::id(payload.get(key))
}

fn optional<T: Into<JsonValue>>(value: Option<T>) -> JsonValue {
    value.map_or(JsonValue::Null, Into::into)
}

impl VaultRouter {
    pub fn new(vaults: Arc<Vaults>, central: Central, storage: Arc<Storage>) -> Arc<Self> {
        Arc::new(Self {
            vaults,
            central,
            storage,
        })
    }

    /// The central database the router's registries live in.
    pub fn central(&self) -> &Central {
        &self.central
    }

    pub(crate) async fn ask(
        &self,
        principal: &str,
        operation: &str,
        payload: JsonValue,
    ) -> Result<JsonValue, String> {
        let payload = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
        // A vault answers its requests one after another: a timeout names the operation awaited.
        let reply = self
            .vaults
            .request(principal, frame::request_body(operation, &payload))
            .await
            .map_err(|error| match error.as_str() {
                "vault_request_timeout" => format!("{error}:{operation}"),
                _ => error,
            })?;
        serde_json::from_slice(&reply).map_err(|_| "vault_reply_invalid".to_string())
    }

    pub async fn provision(&self, principal: &str) -> Result<(), String> {
        let id = principal.trim();
        if id.is_empty() {
            return Err("vault_principal_required".into());
        }
        self.central
            .run(
                "INSERT INTO vault_principal_registry (principal_id, provider, vault_key, status)
                 VALUES (?, 'process', ?, 'active')
                 ON CONFLICT(principal_id) DO UPDATE SET status = 'active', updated_at = datetime('now')",
                vec![json!(id), json!(vault_key(id))],
            )
            .await
    }

    pub async fn owner_of(&self, atome_id: &str) -> Result<Option<String>, String> {
        let id = atome_id.trim();
        if id.is_empty() {
            return Ok(None);
        }
        let row = self
            .central
            .get(
                "SELECT vault_principal_id FROM vault_object_registry WHERE atome_id = ?",
                vec![json!(id)],
            )
            .await?;
        Ok(row.and_then(|row| {
            row.get("vault_principal_id")
                .filter(|owner| truthy(Some(owner)))
                .map(js::string)
        }))
    }

    async fn register_atome(&self, atome_id: &JsonValue, owner: &str) -> Result<(), String> {
        self.provision(owner).await?;
        self.central
            .run(
                "INSERT INTO vault_object_registry (atome_id, vault_principal_id)
                 VALUES (?, ?) ON CONFLICT(atome_id) DO NOTHING",
                vec![atome_id.clone(), json!(owner)],
            )
            .await?;
        if self.owner_of(&js::id(Some(atome_id))).await?.as_deref() != Some(owner) {
            return Err("vault_object_owner_conflict".into());
        }
        Ok(())
    }

    async fn register_stream(&self, event: &JsonValue, owner: &str) -> Result<(), String> {
        let stream_id = js::id(first(event, &["stream_id", "stream"]));
        if stream_id.is_empty() {
            return Err("vault_stream_required".into());
        }
        self.central
            .run(
                "INSERT INTO vault_stream_registry (stream_id, vault_principal_id, project_id, atome_id)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(stream_id) DO UPDATE SET
                     vault_principal_id = excluded.vault_principal_id,
                     project_id = COALESCE(excluded.project_id, vault_stream_registry.project_id),
                     atome_id = COALESCE(excluded.atome_id, vault_stream_registry.atome_id)",
                vec![
                    json!(stream_id),
                    json!(owner),
                    optional(first(event, &["project_id"]).cloned()),
                    optional(first(event, &["atome_id"]).cloned()),
                ],
            )
            .await
    }

    pub async fn commit(
        &self,
        actor: &str,
        event: &JsonValue,
        options: &JsonValue,
    ) -> Result<JsonValue, String> {
        if actor.is_empty() {
            return Err("authenticated_user_missing".into());
        }
        let actor_of_event = js::with(
            event
                .get("actor")
                .filter(|a| truthy(Some(a)))
                .unwrap_or(&json!({})),
            [("type", json!("user")), ("id", json!(actor))],
        );
        let source = first(options, &["source"])
            .or_else(|| first(event, &["source"]))
            .cloned();
        let mut normalized = js::with(
            event,
            [("actor", actor_of_event), ("source", optional(source))],
        );
        let atome_id = js::id(normalized.get("atome_id"));
        let registered = self.owner_of(&atome_id).await?;
        let mut owner = registered.clone();
        if owner.is_none() {
            let props = normalized
                .get("payload")
                .and_then(|p| p.get("props"))
                .filter(|p| truthy(Some(p)));
            let parent = props
                .and_then(|props| first(props, &["parent_id", "parentId"]))
                .or_else(|| {
                    first(
                        &normalized,
                        &["parent_id", "parentId", "project_id", "projectId"],
                    )
                });
            let parent = js::id(parent);
            if let Some(parent_owner) = self
                .owner_of(&parent)
                .await?
                .filter(|parent_owner| parent_owner != actor)
            {
                self.authorize_shared_create(actor, &parent_owner, &parent)
                    .await?;
                owner = Some(parent_owner);
            }
        }
        let owner = owner.unwrap_or_else(|| actor.to_string());
        if owner != actor && registered.is_some() {
            self.authorize_shared_write(actor, &normalized, Some(owner.clone()))
                .await?;
        }
        // Created through a share, the object is its vault's: the patch names that owner, never the writer.
        if owner != actor
            && normalized.get("kind").and_then(JsonValue::as_str) == Some("set")
            && registered.is_none()
        {
            let payload = normalized
                .get("payload")
                .filter(|p| truthy(Some(p)))
                .cloned()
                .unwrap_or_else(|| json!({}));
            let props = payload
                .get("props")
                .filter(|p| truthy(Some(p)))
                .cloned()
                .unwrap_or_else(|| json!({}));
            let props = js::with(&props, [("owner_id", json!(owner))]);
            normalized = js::with(
                &normalized,
                [("payload", js::with(&payload, [("props", props)]))],
            );
        }
        let conflict_mode = first(options, &["conflictMode"]).cloned();
        let committed = self
            .ask(
                &owner,
                "event:commit",
                json!({
                    "event": normalized,
                    "source": normalized["source"],
                    "conflictMode": optional(conflict_mode),
                    "authorized_actor_id": actor,
                }),
            )
            .await?;
        self.register_atome(
            normalized.get("atome_id").unwrap_or(&JsonValue::Null),
            &owner,
        )
        .await?;
        self.register_stream(&committed, &owner).await?;
        let inserted = committed.get("inserted") == Some(&JsonValue::Bool(true));
        // A media deleted, by any path: its stored bytes go with it (media/removal.rs, D36).
        if inserted && normalized.get("kind").and_then(JsonValue::as_str) == Some("delete") {
            crate::media::removal::remove_deleted_media(
                &self.central,
                self.storage.clone(),
                &owner,
                &atome_id,
            )
            .await?;
        }
        Ok(json!({ "event": committed, "inserted": inserted, "vaultPrincipalId": owner }))
    }

    async fn commit_batch(
        &self,
        actor: &str,
        events: &JsonValue,
        options: &JsonValue,
    ) -> Result<JsonValue, String> {
        let mut results = Vec::new();
        for event in events.as_array().into_iter().flatten() {
            let tx_id = first(event, &["tx_id", "txId"])
                .or_else(|| first(options, &["txId"]))
                .cloned();
            let event = js::with(event, [("tx_id", optional(tx_id))]);
            results.push(self.commit(actor, &event, options).await?);
        }
        Ok(JsonValue::Array(results))
    }

    pub async fn get_state(
        &self,
        principal: &str,
        atome_id: &JsonValue,
    ) -> Result<JsonValue, String> {
        let id = js::id(Some(atome_id));
        let owner = self
            .owner_of(&id)
            .await?
            .unwrap_or_else(|| principal.to_string());
        self.provision(&owner).await?;
        let state = self
            .ask(&owner, "state:get", json!({ "atome_id": atome_id }))
            .await?;
        if !truthy(Some(&state)) {
            return Ok(JsonValue::Null);
        }
        if owner == principal {
            return Ok(js::with(&state, [("vault_principal_id", json!(owner))]));
        }
        match self.share_for_atome(principal, &id, Some(owner)).await? {
            Some(share) => Ok(shares::project_shared_state(&state, &share)),
            None => Ok(JsonValue::Null),
        }
    }

    fn owned(states: JsonValue, principal: &str) -> Vec<JsonValue> {
        let states = states.as_array().cloned().unwrap_or_default();
        states
            .iter()
            .map(|state| js::with(state, [("vault_principal_id", json!(principal))]))
            .collect()
    }

    pub async fn list_states(
        &self,
        principal: &str,
        options: &JsonValue,
    ) -> Result<JsonValue, String> {
        self.provision(principal).await?;
        let include_shared = [options.get("includeShared"), options.get("include_shared")]
            .contains(&Some(&JsonValue::Bool(true)));
        if !include_shared {
            let states = self.ask(principal, "state:list", options.clone()).await?;
            return Ok(JsonValue::Array(Self::owned(states, principal)));
        }
        // Pagination over the MERGED set (own, then shared): the client moves its offset by
        // the states it received, so shares added to every page made duplicates and skipped own states.
        let limit = js::number_or(options.get("limit"), 1000.0).clamp(1.0, 10000.0);
        let offset = js::number_or(options.get("offset"), 0.0).max(0.0);
        let own = js::with(
            options,
            [
                ("limit", js::number_json((offset + limit).min(10000.0))),
                ("offset", json!(0)),
            ],
        );
        let mut merged = Self::owned(self.ask(principal, "state:list", own).await?, principal);
        let mut seen: HashSet<String> = merged
            .iter()
            .map(|state| {
                shares::state_atome_id(state)
                    .map(js::string)
                    .unwrap_or_else(|| "null".into())
            })
            .collect();
        let active = self
            .central
            .all(
                format!(
                    "SELECT * FROM sync_share_requests WHERE principal_id = ? AND {}",
                    shares::ACTIVE_LINKED
                ),
                vec![json!(principal)],
            )
            .await?;
        for share in active {
            let states = self
                .states_within_shared_root(
                    &js::id(share.get("owner_id")),
                    &js::string(&share["atome_id"]),
                )
                .await?;
            for state in states {
                let id = shares::state_atome_id(&state)
                    .map(js::string)
                    .unwrap_or_else(|| "null".into());
                // The request's filters (project, type, system) hold for shares too: opening
                // a project otherwise brought every shared object into it.
                if seen.contains(&id) || !shares::matches_list_scope(&state, options) {
                    continue;
                }
                seen.insert(id);
                merged.push(shares::project_shared_state(&state, &share));
            }
        }
        let start = (offset as usize).min(merged.len());
        let end = ((offset + limit) as usize).min(merged.len());
        Ok(JsonValue::Array(merged[start..end].to_vec()))
    }

    // An operation of `principal`'s own vault, provisioned first.
    pub(crate) async fn own(
        &self,
        principal: &str,
        operation: &str,
        payload: JsonValue,
    ) -> Result<JsonValue, String> {
        self.provision(principal).await?;
        self.ask(principal, operation, payload).await
    }

    async fn apply_history(
        &self,
        principal: &str,
        options: &JsonValue,
    ) -> Result<JsonValue, String> {
        let result = self
            .own(principal, "history:apply", options.clone())
            .await?;
        if truthy(result.get("ok")) {
            for event in result
                .get("events")
                .and_then(JsonValue::as_array)
                .into_iter()
                .flatten()
            {
                self.register_stream(event, principal).await?;
            }
        }
        Ok(result)
    }

    // A snapshot lies in the vault of the object it keeps: each action (create, list, get, restore) runs there.
    // A snapshot id without its object names one of the asker's own vault. A sharer needs the right to write
    // the object; to read a whole copy, a share hiding none of its properties; to restore it, one barring none.
    async fn snapshot(
        &self,
        principal: &str,
        action: &str,
        request: &JsonValue,
    ) -> Result<JsonValue, String> {
        let target = first(request, &["project_id", "atome_id"]).cloned();
        let owner = match &target {
            Some(target) => self.owner_of(&js::id(Some(target))).await?,
            None if action == "create" => None,
            None => Some(principal.to_string()),
        };
        let Some(owner) = owner else {
            return Err("Access denied".into());
        };
        let target = target.unwrap_or(JsonValue::Null);
        if owner != principal {
            let event = json!({ "kind": "snapshot", "atome_id": target });
            self.authorize_shared_write(principal, &event, Some(owner.clone()))
                .await?;
            let share = self
                .share_for_atome(principal, &js::id(Some(&target)), Some(owner.clone()))
                .await?;
            let hides = share
                .as_ref()
                .is_some_and(|share| shares::readable(share).is_some());
            let bars = share
                .as_ref()
                .is_some_and(|share| shares::writable(share).is_some());
            if action != "create" && (hides || (action == "restore" && bars)) {
                return Err("Access denied".into());
            }
        }
        let payload = json!({ "request": request, "authorized_actor_id": principal });
        if action == "restore" {
            // Restored records join the vault's objects only: one held by another vault is refused before any write.
            let found = self.ask(&owner, "snapshot:get", payload.clone()).await?;
            let snapshot = found
                .get("snapshot")
                .filter(|snapshot| snapshot.is_object());
            let Some(snapshot) = snapshot else {
                return Err("Snapshot is required".into());
            };
            for atome_id in atome_store::restored_atome_ids(snapshot) {
                if self
                    .owner_of(&atome_id)
                    .await?
                    .unwrap_or_else(|| owner.clone())
                    != owner
                {
                    return Err(format!("Access denied for {atome_id}"));
                }
            }
        }
        let result = self
            .ask(&owner, &format!("snapshot:{action}"), payload)
            .await?;
        if action == "restore" {
            for event in result
                .get("events")
                .and_then(JsonValue::as_array)
                .into_iter()
                .flatten()
            {
                self.register_atome(event.get("atome_id").unwrap_or(&JsonValue::Null), &owner)
                    .await?;
                self.register_stream(event, &owner).await?;
            }
        }
        Ok(result)
    }

    /// One SERVICE request from Fastify: `router:<operation>` and its JSON payload.
    pub async fn service(&self, operation: &str, payload: &JsonValue) -> Result<JsonValue, String> {
        let at = |key: &str| payload.get(key).unwrap_or(&JsonValue::Null);
        let options = payload
            .get("options")
            .filter(|o| o.is_object())
            .cloned()
            .unwrap_or_else(|| json!({}));
        let who = principal(payload, "principal_id");
        let owner = principal(payload, "owner_id");
        match operation {
            "router:provision" => {
                self.provision(&who).await?;
                Ok(json!({ "principalId": who }))
            }
            "router:owner-of" => Ok(optional(
                self.owner_of(&js::id(Some(at("atome_id")))).await?,
            )),
            "router:register-atome" => self
                .register_atome(at("atome_id"), &who)
                .await
                .map(|()| JsonValue::Null),
            "router:commit" => self.commit(&who, at("event"), &options).await,
            "router:commit-batch" => self.commit_batch(&who, at("events"), &options).await,
            "router:teleport-hosted" => {
                self.own(
                    &owner,
                    "teleport:hosted",
                    json!({ "surface_id": at("surface_id") }),
                )
                .await
            }
            "router:describe-files" => {
                self.own(
                    &owner,
                    "files:described",
                    json!({ "file_names": at("file_names") }),
                )
                .await
            }
            "router:state-get" => self.get_state(&who, at("atome_id")).await,
            "router:state-list" => self.list_states(&who, &options).await,
            "router:events-list" => self.own(&who, "events:list", options).await,
            "router:history-apply" => self.apply_history(&who, &options).await,
            "router:stream-access" => Ok(optional(
                self.stream_access(&who, payload.get("stream_id")).await?,
            )),
            "router:stream-heads" => {
                let ids = at("stream_ids").as_array().cloned().unwrap_or_default();
                let heads = self.authorized_stream_heads(&who, &ids).await?;
                Ok(JsonValue::Array(
                    heads
                        .into_iter()
                        .map(|(stream, head)| json!([stream, head]))
                        .collect(),
                ))
            }
            "router:stream-of-atome" => Ok(optional(
                self.stream_for_atome(&owner, at("atome_id")).await?,
            )),
            "router:streams-authorized" => Ok(json!(self.list_authorized_streams(&who).await?)),
            "router:streams-of-share" => {
                Ok(json!(self.list_share_streams(&who, at("share_id")).await?))
            }
            "router:stream-events" => Ok(json!(
                self.list_stream_events(&who, at("stream_id"), &options)
                    .await?
            )),
            "router:own-streams-events" => {
                let pairs = at("streams").as_array().cloned().unwrap_or_default();
                let (events, others) = self.list_own_streams_events(&who, &pairs).await?;
                Ok(json!({ "events": events, "others": others }))
            }
            "router:stream-head" => self.stream_head(&who, at("stream_id")).await,
            "router:project-event" => Ok(optional(
                self.project_event_for_principal(&who, at("event")).await?,
            )),
            "router:share-for-atome" => {
                let owner = Some(owner).filter(|owner| !owner.is_empty());
                Ok(optional(
                    self.share_for_atome(&who, &js::id(Some(at("atome_id"))), owner)
                        .await?,
                ))
            }
            "router:snapshot" => {
                self.snapshot(&who, &js::string(at("action")), at("request"))
                    .await
            }
            "router:states-within-share" => Ok(json!(
                self.states_within_shared_root(&owner, &js::string(at("root_atome_id")))
                    .await?
            )),
            "router:within-share" => Ok(json!(
                self.within_shared_root(
                    &owner,
                    &js::id(Some(at("atome_id"))),
                    &js::id(Some(at("root_atome_id")))
                )
                .await?
            )),
            "router:private-ancestor" => Ok(json!(
                self.has_private_program_ancestor(&owner, &js::id(Some(at("atome_id"))))
                    .await?
            )),
            "router:program-interior" => Ok(json!(
                self.within_private_program(&owner, &js::id(Some(at("atome_id"))))
                    .await?
            )),
            _ => Err(format!("vault_router_operation_unknown:{operation}")),
        }
    }
}
