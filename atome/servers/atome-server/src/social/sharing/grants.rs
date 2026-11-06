// A share asked, answered and made live (server/syncSharingService.js `request`,
// `grantAuthority`, `activate`, `respond`, `publish`, ported): who may grant an atome (its owner,
// or a holder of a share carrying the capability), what reaches the recipient (never more than
// held), and what accepting does — a linked share opens its streams, a detached one copies.
use super::rights::{self, Rights};
use super::{Effect, Sharing, visible};
use crate::social::news::db::parsed;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

// `granterId`'s authority on an atome: the real owner, the owner's stream, the rights held and
// the share holding them (none for the owner).
pub(super) struct Authority {
    pub(super) owner: String,
    stream: JsonValue,
    rights: Rights,
    share: Option<JsonValue>,
}

// `sqlTime`: SQLite compares `expires_at` as text, 'YYYY-MM-DD HH:MM:SS' in UTC.
fn sql_time(value: Option<&JsonValue>) -> Option<String> {
    let text = js::string(value.filter(|value| js::truthy(Some(value)))?);
    let instant = if text.contains('T') || text.ends_with('Z') {
        chrono::DateTime::parse_from_rfc3339(&text)
            .map(|instant| instant.with_timezone(&chrono::Utc))
            .ok()
            .or_else(|| {
                ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"]
                    .iter()
                    .find_map(|format| {
                        chrono::NaiveDateTime::parse_from_str(&text, format)
                            .ok()
                            .and_then(|local| local.and_local_timezone(chrono::Local).single())
                            .map(|instant| instant.with_timezone(&chrono::Utc))
                    })
            })
    } else {
        let utc = text.replacen(' ', "T", 1);
        ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"]
            .iter()
            .find_map(|format| {
                chrono::NaiveDateTime::parse_from_str(&utc, format)
                    .ok()
                    .map(|naive| naive.and_utc())
            })
    }?;
    Some(instant.format("%Y-%m-%d %H:%M:%S").to_string())
}

fn mode_of(value: Option<&JsonValue>) -> &'static str {
    let mode = value
        .filter(|value| js::truthy(Some(value)))
        .map(js::string)
        .unwrap_or_default();
    match mode.trim().to_lowercase().as_str() {
        "manual" | "validation-based" | "non-real-time" => "manual",
        _ => "real-time",
    }
}

fn type_of(value: Option<&JsonValue>) -> &'static str {
    let kind = value
        .filter(|value| js::truthy(Some(value)))
        .map(js::string)
        .unwrap_or_default();
    match kind.trim().to_lowercase().as_str() {
        "copy" | "detached" => "detached",
        _ => "linked",
    }
}

// The list a request names in its older shapes (`allowed_properties`, `property_overrides`).
fn allowed_properties(message: &JsonValue) -> Option<JsonValue> {
    let names = |items: &Vec<JsonValue>| {
        let mut names: Vec<String> = Vec::new();
        for name in items.iter().map(js::string).filter(|name| !name.is_empty()) {
            if !names.contains(&name) {
                names.push(name);
            }
        }
        json!(names)
    };
    if let Some(JsonValue::Array(direct)) =
        js::first(message, &["allowed_properties", "allowedProperties"])
    {
        return Some(names(direct));
    }
    let overrides = js::first(message, &["property_overrides", "propertyOverrides"])
        .cloned()
        .unwrap_or_else(|| json!({}));
    if let Some(JsonValue::Array(nested)) =
        js::first(&overrides, &["allowed_properties", "allowedProperties"])
    {
        return Some(names(nested));
    }
    let keys: Vec<String> = overrides
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(key, value)| {
            !key.starts_with("__")
                && *key != "shareType"
                && (**value == json!(true)
                    || value.get("read") == Some(&json!(true))
                    || value.get("can_read") == Some(&json!(true)))
        })
        .map(|(key, _)| key.clone())
        .collect();
    (!keys.is_empty()).then(|| json!(keys))
}

// `a ?? b`: the first that is neither absent nor null.
fn defined<'a>(values: &[Option<&'a JsonValue>]) -> Option<&'a JsonValue> {
    values
        .iter()
        .flatten()
        .copied()
        .find(|value| !value.is_null())
}

impl Sharing {
    async fn owned_stream(&self, owner: &str, atome_id: &str) -> Result<JsonValue, String> {
        let object = self
            .router
            .central()
            .get(
                "SELECT vault_principal_id FROM vault_object_registry WHERE atome_id = ?",
                vec![json!(atome_id)],
            )
            .await?;
        if object.is_none_or(|object| js::string(&object["vault_principal_id"]) != owner) {
            return Err("share_owner_required".into());
        }
        // The stream the object's events live in (one a project), not the registry's row.
        self.router
            .stream_for_atome(owner, &json!(atome_id))
            .await?
            .filter(|stream| js::truthy(Some(stream)))
            .ok_or_else(|| "share_stream_not_found".into())
    }

    /// `grantAuthority(granterId, atomeId)`: a programme leaves as its plan alone.
    pub(super) async fn grant_authority(
        &self,
        granter: &str,
        atome_id: &str,
    ) -> Result<Authority, String> {
        if self
            .router
            .within_private_program(granter, atome_id)
            .await?
        {
            return Err("program_interior_not_shareable".into());
        }
        if let Ok(stream) = self.owned_stream(granter, atome_id).await {
            return Ok(Authority {
                owner: granter.to_string(),
                stream,
                rights: rights::OWNER,
                share: None,
            });
        }
        let Some(share) = self.router.share_for_atome(granter, atome_id, None).await? else {
            return Err("share_owner_required".into());
        };
        let held = rights::normalized(&parsed(share.get("permissions_json"), json!({})));
        if !rights::has(held, "reshare") {
            return Err("share_reshare_denied".into());
        }
        let owner = js::string(&share["owner_id"]);
        let stream = self.owned_stream(&owner, atome_id).await?;
        Ok(Authority {
            owner,
            stream,
            rights: held,
            share: Some(share),
        })
    }

    // A conversation's voice or video message reads as the message carrying it: nothing to accept
    // while the recipient accepted its owner as a contact and nobody blocked the other.
    async fn conversation_recording_for(
        &self,
        authority: &Authority,
        atome_id: &str,
        principal: &str,
        granted: Rights,
    ) -> Result<bool, String> {
        if authority.share.is_some() || granted[1..].iter().any(|on| *on) {
            return Ok(false);
        }
        let state = self
            .router
            .get_state(&authority.owner, &json!(atome_id))
            .await
            .unwrap_or(JsonValue::Null);
        let contact = state
            .get("properties")
            .and_then(|props| props.get("conversation_contact_id"));
        if js::id(contact).is_empty() {
            return Ok(false);
        }
        let (owner, recipient) = (authority.owner.clone(), principal.to_string());
        let verdict = self
            .central
            .transaction(move |db| {
                crate::social::relations::can_communicate(db, &owner, &recipient)
            })
            .await?;
        Ok(verdict["ok"] == json!(true))
    }

    pub(crate) async fn request(
        &self,
        granter: &str,
        message: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let principal = self.target_id(message).await?.unwrap_or_default();
        if principal.is_empty() || !self.relations.provisioned(&principal).await? {
            return Err("target_not_provisioned".into());
        }
        if principal == granter {
            return Err("share_target_is_self".into());
        }
        let ids: Vec<String> = match message.get("atome_ids") {
            Some(JsonValue::Array(ids)) => ids
                .iter()
                .map(js::string)
                .filter(|id| !id.is_empty())
                .collect(),
            _ => js::first(message, &["atome_id", "atomeId"])
                .map(js::string)
                .into_iter()
                .collect(),
        };
        if ids.is_empty() {
            return Err("share_atome_required".into());
        }
        let peer_policy = self.policy(&principal, granter).await?;
        let policy = peer_policy
            .as_ref()
            .map(|policy| js::string(&policy["policy"]))
            .unwrap_or_default();
        if policy == "block" {
            return Err("blocked".into());
        }
        let requested = rights::normalized(
            js::first(message, &["permissions", "permission"]).unwrap_or(&json!({})),
        );
        let accepted = parsed(
            peer_policy
                .as_ref()
                .and_then(|policy| policy.get("permissions_json")),
            JsonValue::Null,
        );
        let share_mode = mode_of(js::first(message, &["mode", "share_mode"]));
        let overridden = message
            .get("property_overrides")
            .and_then(|overrides| overrides.get("__shareType"));
        let share_type = type_of(
            js::first(message, &["share_type", "shareType"])
                .or(overridden.filter(|kind| js::truthy(Some(kind)))),
        );
        // The sender's own words with what they send: the invitation's message.
        let note = js::slice(
            js::trim(
                &message
                    .get("note")
                    .filter(|note| js::truthy(Some(note)))
                    .map(js::string)
                    .unwrap_or_default(),
            ),
            1000,
        );
        let mut rows = Vec::new();
        for atome_id in ids {
            let authority = self.grant_authority(granter, &atome_id).await?;
            if principal == authority.owner {
                return Err("share_target_is_owner".into());
            }
            if self
                .policy(&principal, &authority.owner)
                .await?
                .is_some_and(|policy| policy["policy"] == "block")
            {
                return Err("blocked".into());
            }
            // Never more than held: rights, properties and duration.
            let granted = rights::attenuated(authority.rights, requested);
            let permissions = if policy == "always" {
                rights::attenuated(granted, rights::normalized(&accepted))
            } else {
                granted
            };
            let parent_list = |column: &str| {
                authority.share.as_ref().map_or(JsonValue::Null, |share| {
                    let own = parsed(share.get(column), JsonValue::Null);
                    if own.is_null() {
                        parsed(share.get("allowed_properties_json"), JsonValue::Null)
                    } else {
                        own
                    }
                })
            };
            let readable = rights::attenuated_list(
                Some(&parent_list("readable_properties_json")),
                defined(&[
                    message.get("readable_properties"),
                    message.get("readableProperties"),
                ]),
            );
            let legacy = allowed_properties(message);
            let writable = rights::attenuated_list(
                Some(&parent_list("writable_properties_json")),
                defined(&[
                    message.get("writable_properties"),
                    message.get("writableProperties"),
                    legacy.as_ref(),
                ]),
            );
            let requested_expiry = sql_time(js::first(message, &["expires_at", "expiresAt"]));
            let parent_expiry = authority
                .share
                .as_ref()
                .and_then(|share| share.get("expires_at"))
                .filter(|at| js::truthy(Some(at)))
                .map(js::string);
            let expires_at = match (&parent_expiry, &requested_expiry) {
                (Some(parent), None) => Some(parent.clone()),
                (Some(parent), Some(asked)) if asked > parent => Some(parent.clone()),
                _ => requested_expiry.clone(),
            };
            let auto = policy == "always"
                || self
                    .conversation_recording_for(&authority, &atome_id, &principal, granted)
                    .await?;
            let status = match (auto, share_type) {
                (true, "linked") => "active",
                (true, _) => "accepted",
                (false, _) if policy == "never" => "rejected",
                _ => "pending",
            };
            let share_id = uuid::Uuid::new_v4().to_string();
            let list = |names: &Option<Vec<String>>| {
                names
                    .as_ref()
                    .map_or(JsonValue::Null, |names| json!(json!(names).to_string()))
            };
            self.run(
                "INSERT INTO sync_share_requests
                 (share_id, owner_id, principal_id, atome_id, stream_id, share_type,
                  share_mode, status, permissions_json, allowed_properties_json,
                  readable_properties_json, writable_properties_json, parent_share_id, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    json!(share_id),
                    json!(authority.owner),
                    json!(principal),
                    json!(atome_id),
                    authority.stream["stream_id"].clone(),
                    json!(share_type),
                    json!(share_mode),
                    json!(status),
                    json!(rights::stored(permissions).to_string()),
                    JsonValue::Null,
                    list(&readable),
                    list(&writable),
                    authority
                        .share
                        .as_ref()
                        .and_then(|share| share.get("share_id"))
                        .filter(|id| js::truthy(Some(id)))
                        .cloned()
                        .unwrap_or(JsonValue::Null),
                    json!(expires_at),
                ],
            )
            .await?;
            let mut row = self
                .get(&share_id)
                .await?
                .ok_or("share_request_not_found")?;
            if matches!(status, "active" | "accepted") {
                row = self.activate(&row).await?;
            }
            let shown = visible(&row);
            if shown["status"] == "pending" {
                self.deliver_invitation(&principal, granter, &authority.owner, &shown, &note, out)
                    .await?;
            }
            let streams = if shown["share_type"] == "linked" && shown["status"] == "active" {
                json!([shown["stream_id"]])
            } else {
                json!([])
            };
            out.push(Effect::Tell(
                principal.clone(),
                json!({ "type": "share-invitation", "share": shown, "streams": streams }),
            ));
            rows.push(shown);
        }
        let streams: Vec<JsonValue> = rows
            .iter()
            .filter(|row| row["share_type"] == "linked")
            .map(|row| row["stream_id"].clone())
            .collect();
        Ok(json!({ "ok": true, "requests": rows, "streams": streams }))
    }

    // A share to accept is one more received request: Communication shows it and answers it.
    async fn deliver_invitation(
        &self,
        principal: &str,
        granter: &str,
        owner: &str,
        share: &JsonValue,
        note: &str,
        out: &mut Vec<Effect>,
    ) -> Result<(), String> {
        let state = self
            .router
            .own(owner, "state:get", json!({ "atome_id": share["atome_id"] }))
            .await?;
        let row = self
            .get(&js::string(&share["share_id"]))
            .await?
            .unwrap_or(JsonValue::Null);
        let list = self.list_summary(&row).await?;
        let atome_type = js::first(&state, &["atome_type", "type"])
            .cloned()
            .unwrap_or(JsonValue::Null);
        let mut extra = json!({ "share_id": share["share_id"], "atomeIds": [share["atome_id"]], "atome_type": atome_type,
            "mode": share["share_mode"], "share_type": share["share_type"], "status": "pending" });
        if let (Some(extra), Some(JsonValue::Object(list))) = (extra.as_object_mut(), list) {
            extra.extend(list);
        }
        let notification = json!({ "kind": "share-request", "id": format!("share_{}", js::string(&share["share_id"])),
            "message": note, "extra": extra });
        self.deliver(principal, granter, &notification, out).await
    }

    // Accepted: a detached share copies (a list whole, any other atome alone, only what the
    // recipient may see, naming its source); a linked one opens its streams, a list copied in the
    // version its recipient validates.
    pub(super) async fn activate(&self, row: &JsonValue) -> Result<JsonValue, String> {
        let share_id = js::string(&row["share_id"]);
        let (owner, principal) = (
            js::string(&row["owner_id"]),
            js::string(&row["principal_id"]),
        );
        if row["share_type"] == "detached" {
            let copied = self.list_accepted(row).await?;
            let mut detached = copied
                .as_ref()
                .and_then(|copied| copied["copies"].get(js::string(&row["atome_id"])))
                .filter(|id| js::truthy(Some(id)))
                .cloned()
                .unwrap_or(JsonValue::Null);
            if copied.is_none() {
                let state = self.router.get_state(&owner, &row["atome_id"]).await?;
                if !js::truthy(Some(&state)) {
                    return Err("share_source_state_missing".into());
                }
                let readable = parsed(row.get("readable_properties_json"), JsonValue::Null);
                let allowed = if readable.is_null() {
                    parsed(row.get("allowed_properties_json"), JsonValue::Null)
                } else {
                    readable
                };
                let all = state
                    .get("properties")
                    .and_then(JsonValue::as_object)
                    .cloned()
                    .unwrap_or_default();
                let mut properties: JsonMap<String, JsonValue> =
                    match allowed.as_array().filter(|keys| !keys.is_empty()) {
                        Some(keys) => all
                            .into_iter()
                            .filter(|(key, _)| keys.contains(&json!(key)))
                            .collect(),
                        None => all,
                    };
                properties.insert(
                    "list_link".into(),
                    json!({ "share_id": row["share_id"], "owner_id": owner, "source_id": row["atome_id"], "source_atome_id": row["atome_id"] }),
                );
                let copy = uuid::Uuid::new_v4().to_string();
                let event = json!({ "id": uuid::Uuid::new_v4().to_string(), "kind": "set", "atome_id": copy,
                    "actor": { "type": "user", "id": principal }, "payload": { "props": properties } });
                self.router
                    .commit(
                        &principal,
                        &event,
                        &json!({ "source": format!("share-detached:{share_id}") }),
                    )
                    .await?;
                detached = json!(copy);
            }
            self.run(
                "UPDATE sync_share_requests SET status = 'accepted', detached_atome_id = ?, updated_at = datetime('now') WHERE share_id = ?",
                vec![detached, json!(share_id)],
            )
            .await?;
        } else {
            self.run(
                "UPDATE sync_share_requests SET status = 'active', updated_at = datetime('now') WHERE share_id = ?",
                vec![json!(share_id)],
            )
            .await?;
            for stream in self
                .router
                .list_share_streams(&principal, &row["share_id"])
                .await?
            {
                self.sync.grant_stream(&principal, &js::string(&stream));
            }
            let current = self
                .get(&share_id)
                .await?
                .ok_or("share_request_not_found")?;
            self.list_accepted(&current).await?;
        }
        self.get(&share_id)
            .await?
            .ok_or_else(|| "share_request_not_found".into())
    }

    pub(super) async fn respond(
        &self,
        principal: &str,
        message: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let share_id = js::id(js::first(
            message,
            &["share_id", "request_id", "request_atome_id"],
        ));
        let row = match self.get(&share_id).await? {
            Some(row) if js::string(&row["principal_id"]) == principal => row,
            _ => return Err("share_request_not_found".into()),
        };
        let decision = js::first(message, &["status", "decision"])
            .map(js::string)
            .unwrap_or_default()
            .to_lowercase();
        match decision.as_str() {
            "rejected" => {
                self.run(
                    "UPDATE sync_share_requests SET status = 'rejected', updated_at = datetime('now') WHERE share_id = ?",
                    vec![json!(share_id)],
                )
                .await?
            }
            "accepted" => {
                self.activate(&row).await?;
            }
            _ => return Err("share_decision_invalid".into()),
        }
        if let Some(policy) = message
            .get("policy")
            .filter(|policy| js::truthy(Some(policy)) && **policy != json!("one-shot"))
        {
            let permissions = parsed(row.get("permissions_json"), json!({}));
            self.set_policy(
                principal,
                Some(&row["owner_id"]),
                Some(policy),
                Some(&permissions),
            )
            .await?;
        }
        let updated = self
            .get(&share_id)
            .await?
            .ok_or("share_request_not_found")?;
        out.push(Effect::Tell(
            js::string(&updated["owner_id"]),
            json!({ "type": "share-decision", "share": visible(&updated) }),
        ));
        let streams = if updated["share_type"] == "linked" {
            json!([updated["stream_id"]])
        } else {
            json!([])
        };
        Ok(json!({ "ok": true, "request": visible(&updated), "streams": streams }))
    }

    /// A manual linked share's owner publishes: its recipient's stream replays up to now.
    pub(super) async fn publish(
        &self,
        owner: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let share_id = js::id(js::first(
            message,
            &["share_id", "request_id", "request_atome_id"],
        ));
        let row = match self.get(&share_id).await? {
            Some(row) if js::string(&row["owner_id"]) == owner => row,
            _ => return Err("share_owner_required".into()),
        };
        if row["share_type"] != "linked"
            || row["share_mode"] != "manual"
            || row["status"] != "active"
        {
            return Err("manual_linked_share_required".into());
        }
        let cursor = self.router.stream_head(owner, &row["stream_id"]).await?;
        self.run(
            "UPDATE sync_share_requests SET publication_cursor = ?, updated_at = datetime('now') WHERE share_id = ?",
            vec![cursor.clone(), json!(share_id)],
        )
        .await?;
        self.sync
            .replay_principal_stream(
                &js::string(&row["principal_id"]),
                &js::string(&row["stream_id"]),
            )
            .await?;
        Ok(
            json!({ "ok": true, "share_id": share_id, "stream_id": row["stream_id"], "publication_cursor": cursor }),
        )
    }
}
