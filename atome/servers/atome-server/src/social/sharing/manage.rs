// A share's life after it was asked (server/syncSharingService.js `updateRights`, `revoke`,
// `setPolicy`, `list`, `pending`, `withPeer`, ported): who may act on a share (its owner, the one
// who re-shared it, a holder of `manage`), a link restricted or revoked with the whole chain
// coming from it, and the readings of one's shares.
use super::rights::{self, Rights};
use super::{ACTIVE_LINKED, Effect, Sharing, visible};
use crate::social::news::db::parsed;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::{HashMap, HashSet, VecDeque};

const POLICIES: [&str; 4] = ["one-shot", "always", "never", "block"];

fn list_text(names: Option<Vec<String>>) -> JsonValue {
    names.map_or(JsonValue::Null, |names| json!(json!(names).to_string()))
}

impl Sharing {
    // Every share coming from `share_id` (re-shares in a chain), without a cycle.
    async fn descendants(&self, share_id: &str) -> Result<Vec<JsonValue>, String> {
        let mut result = Vec::new();
        let mut queue = VecDeque::from([share_id.to_string()]);
        let mut seen: HashSet<String> = queue.iter().cloned().collect();
        while let Some(parent) = queue.pop_front() {
            let children = self
                .rows(
                    "SELECT * FROM sync_share_requests WHERE parent_share_id = ?".into(),
                    vec![json!(parent)],
                )
                .await?;
            for child in children {
                let id = js::string(&child["share_id"]);
                if !seen.insert(id.clone()) {
                    continue;
                }
                queue.push_back(id);
                result.push(child);
            }
        }
        Ok(result)
    }

    // Who may act on a share: its owner, who granted it (a re-share) or a holder of `manage` on
    // the same atome; the rights they hold.
    async fn authority_over(&self, actor: &str, row: &JsonValue) -> Result<Option<Rights>, String> {
        if actor == js::string(&row["owner_id"]) {
            return Ok(Some(rights::OWNER));
        }
        if js::truthy(row.get("parent_share_id")) {
            let parent = self.get(&js::string(&row["parent_share_id"])).await?;
            if let Some(parent) = parent.filter(|parent| {
                js::string(&parent["principal_id"]) == actor
                    && matches!(parent["status"].as_str(), Some("active" | "accepted"))
            }) {
                return Ok(Some(rights::normalized(&parsed(
                    parent.get("permissions_json"),
                    json!({}),
                ))));
            }
        }
        let held = self
            .router
            .share_for_atome(
                actor,
                &js::string(&row["atome_id"]),
                Some(js::string(&row["owner_id"])),
            )
            .await?;
        Ok(held.and_then(|held| {
            let rights = rights::normalized(&parsed(held.get("permissions_json"), json!({})));
            (rights::has(rights, "manage")
                && js::string(&held["share_id"]) != js::string(&row["share_id"]))
            .then_some(rights)
        }))
    }

    pub(super) async fn update_rights(
        &self,
        actor: &str,
        message: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let share_id = js::id(js::first(message, &["share_id", "request_id"]));
        let row = self
            .get(&share_id)
            .await?
            .filter(|row| {
                !matches!(
                    row["status"].as_str(),
                    Some("revoked" | "rejected" | "expired")
                )
            })
            .ok_or("share_request_not_found")?;
        if js::string(&row["principal_id"]) == actor {
            return Err("share_rights_self_denied".into());
        }
        let authority = self
            .authority_over(actor, &row)
            .await?
            .ok_or("share_manage_denied")?;
        let asked = rights::normalized(
            js::first(message, &["permissions", "rights"]).unwrap_or(&json!({})),
        );
        let granted = rights::attenuated(authority, asked);
        let property_list = |key: &str, column: &str| {
            let given = message.get(key).filter(|value| !value.is_null()).cloned();
            rights::property_list(Some(
                &given.unwrap_or_else(|| parsed(row.get(column), JsonValue::Null)),
            ))
        };
        let readable = property_list("readable_properties", "readable_properties_json");
        let writable = property_list("writable_properties", "writable_properties_json");
        self.run(
            "UPDATE sync_share_requests SET permissions_json = ?, readable_properties_json = ?, writable_properties_json = ?,
             updated_at = datetime('now') WHERE share_id = ?",
            vec![json!(rights::stored(granted).to_string()), list_text(readable), list_text(writable), json!(share_id)],
        )
        .await?;
        // A link restricted restricts the whole chain coming from it.
        let mut limits: HashMap<String, Rights> = HashMap::from([(share_id.clone(), granted)]);
        for child in self.descendants(&share_id).await? {
            let parent_rights = limits
                .get(&js::string(&child["parent_share_id"]))
                .copied()
                .unwrap_or(granted);
            let child_rights = rights::attenuated(
                parent_rights,
                rights::normalized(&parsed(child.get("permissions_json"), json!({}))),
            );
            limits.insert(js::string(&child["share_id"]), child_rights);
            self.run(
                "UPDATE sync_share_requests SET permissions_json = ?, updated_at = datetime('now') WHERE share_id = ?",
                vec![json!(rights::stored(child_rights).to_string()), child["share_id"].clone()],
            )
            .await?;
        }
        let updated = visible(
            &self
                .get(&share_id)
                .await?
                .ok_or("share_request_not_found")?,
        );
        out.push(Effect::Tell(
            js::string(&row["principal_id"]),
            json!({ "type": "share-updated", "share": updated }),
        ));
        Ok(json!({ "ok": true, "request": updated }))
    }

    /// The shares between me and a peer, both ways (who gave what to whom).
    pub(super) async fn with_peer(
        &self,
        principal: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let peer = js::id(js::first(
            message,
            &["peer_user_id", "peerUserId", "user_id"],
        ));
        if peer.is_empty() {
            return Err("share_peer_required".into());
        }
        let rows = self
            .rows(
                "SELECT * FROM sync_share_requests
                 WHERE ((owner_id = ? AND principal_id = ?) OR (owner_id = ? AND principal_id = ?)
                    OR (principal_id = ? AND parent_share_id IN (SELECT share_id FROM sync_share_requests WHERE principal_id = ?)))
                   AND status NOT IN ('revoked', 'rejected')
                 ORDER BY created_at DESC"
                    .into(),
                vec![json!(principal), json!(peer), json!(peer), json!(principal), json!(peer), json!(principal)],
            )
            .await?;
        Ok(json!({ "ok": true, "requests": rows.iter().map(visible).collect::<Vec<_>>() }))
    }

    pub(super) async fn set_policy(
        &self,
        owner: &str,
        peer: Option<&JsonValue>,
        policy: Option<&JsonValue>,
        permissions: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        let value = policy
            .filter(|policy| js::truthy(Some(policy)))
            .map_or_else(|| "one-shot".to_string(), js::string)
            .to_lowercase();
        if !POLICIES.contains(&value.as_str()) {
            return Err("share_policy_invalid".into());
        }
        let stored = permissions
            .filter(|permissions| js::truthy(Some(permissions)))
            .map_or(JsonValue::Null, |permissions| {
                json!(rights::stored(rights::normalized(permissions)).to_string())
            });
        let given = peer.cloned();
        let peer = given.clone().unwrap_or(JsonValue::Null);
        self.run(
            "INSERT INTO sync_share_policies (owner_id, peer_id, policy, permissions_json, revoked_at)
             VALUES (?, ?, ?, ?, NULL)
             ON CONFLICT(owner_id, peer_id) DO UPDATE SET policy = excluded.policy,
             permissions_json = excluded.permissions_json, revoked_at = NULL, updated_at = datetime('now')",
            vec![json!(owner), peer.clone(), json!(value), stored],
        )
        .await?;
        let mut result = json!({ "ok": true, "owner_id": owner });
        // An absent peer (`undefined`) is left out, as JSON writes it.
        if let Some(peer) = given {
            result["peer_id"] = peer;
        }
        result["policy"] = json!(value);
        Ok(result)
    }

    /// The shares this account received (`principal_id`) or gave (`owner_id`), newest first.
    pub(super) async fn list(
        &self,
        principal: &str,
        column: &'static str,
    ) -> Result<JsonValue, String> {
        let rows = self
            .rows(
                format!(
                    "SELECT * FROM sync_share_requests WHERE {column} = ? ORDER BY created_at DESC"
                ),
                vec![json!(principal)],
            )
            .await?;
        Ok(json!({ "ok": true, "requests": rows.iter().map(visible).collect::<Vec<_>>() }))
    }

    /// What waits for this account's answer: the shares not answered yet, and each linked list
    /// whose newer version is not decided.
    pub(super) async fn pending(&self, principal: &str) -> Result<JsonValue, String> {
        let rows = self
            .rows(
                format!(
                    "SELECT * FROM sync_share_requests WHERE principal_id = ? AND (status = 'pending'
                     OR (share_type = 'linked' AND {ACTIVE_LINKED})) ORDER BY created_at DESC"
                ),
                vec![json!(principal)],
            )
            .await?;
        let mut waiting = Vec::new();
        for row in rows {
            let asked = row["status"] == "pending";
            let list = if asked {
                None
            } else {
                self.list_view(principal, &json!({ "share_id": row["share_id"] }))
                    .await
                    .ok()
            };
            if asked
                || list
                    .as_ref()
                    .is_some_and(|list| js::truthy(list.get("pending")))
            {
                let mut shown = visible(&row);
                if let Some(list) = list {
                    shown["list_version"] = list["list"]["version"].clone();
                }
                waiting.push(shown);
            }
        }
        Ok(json!({ "ok": true, "requests": waiting }))
    }

    /// The recipient may always renounce; anyone else needs an authority over the share. The whole
    /// chain coming from it goes with it, each stream closed once no active share keeps it.
    pub(super) async fn revoke(
        &self,
        principal: &str,
        message: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let share_id = js::id(js::first(
            message,
            &["share_id", "permission_id", "request_id"],
        ));
        let row = self.get(&share_id).await?.ok_or("share_revoke_denied")?;
        if js::string(&row["principal_id"]) != principal
            && self.authority_over(principal, &row).await?.is_none()
        {
            return Err("share_revoke_denied".into());
        }
        let mut chain = vec![row];
        chain.extend(self.descendants(&share_id).await?);
        for link in &chain {
            self.run(
                "UPDATE sync_share_requests SET status = 'revoked', updated_at = datetime('now') WHERE share_id = ?",
                vec![link["share_id"].clone()],
            )
            .await?;
            let remaining = self
                .rows(
                    format!("SELECT share_id FROM sync_share_requests WHERE principal_id = ? AND stream_id = ? AND {ACTIVE_LINKED} LIMIT 1"),
                    vec![link["principal_id"].clone(), link["stream_id"].clone()],
                )
                .await?;
            if remaining.is_empty() {
                self.sync.revoke_stream(
                    &js::string(&link["principal_id"]),
                    &js::string(&link["stream_id"]),
                );
            }
            let told = if js::string(&link["principal_id"]) == principal {
                &link["owner_id"]
            } else {
                &link["principal_id"]
            };
            out.push(Effect::Tell(
                js::string(told),
                json!({ "type": "share-revoked", "share_id": link["share_id"], "stream_id": link["stream_id"] }),
            ));
        }
        let revoked: Vec<JsonValue> = chain.iter().map(|link| link["share_id"].clone()).collect();
        Ok(json!({ "ok": true, "share_id": share_id, "revoked": revoked }))
    }
}
