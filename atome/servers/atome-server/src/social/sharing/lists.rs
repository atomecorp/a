// A list sent to someone (server/sync_share_lists.js, ported): what the share engine adds when
// the shared root is a list. The recipient reads the whole list before answering, from the
// sender's vault; validated, the version they validated is copied into their own account (root and
// entries, each by its domain's id rule, `list_link` naming where it comes from) and their
// `list_receipt` keeps it; linked, each later version is offered and copied only once validated,
// a refusal recorded; « Détacher » keeps the copies and ends the link. A list worked on together
// (a right beyond reading) is no copy: its recipient works in the sender's list itself.
use super::list_view::{self, LIST_RECEIPT_ATOME_TYPE};
use super::{Effect, Sharing, rights};
use crate::social::news::db::parsed;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

/// The list a share names, as its owner's vault holds it now.
pub(super) struct Source {
    root: JsonValue,
    states: Vec<JsonValue>,
    pub(super) view: JsonValue,
}

fn receipt_id(share_id: &str) -> String {
    format!("list_receipt_{share_id}")
}

// A share only to read is a list sent; one granting more is worked on together.
fn read_only(row: &JsonValue) -> bool {
    let held = rights::normalized(&parsed(row.get("permissions_json"), json!({})));
    held[1..].iter().all(|on| !on)
}

// The unique part a copy's id was made with (after its last ':' or '_').
fn fresh_of(copy_id: &JsonValue) -> String {
    let id = js::text(Some(copy_id));
    let tail = id.rsplit(':').next().unwrap_or("");
    tail.rsplit('_').next().unwrap_or("").to_string()
}

fn number(value: Option<&JsonValue>) -> f64 {
    js::number(value)
}

fn share_of(row: &JsonValue) -> String {
    js::string(&row["share_id"])
}

impl Sharing {
    pub(super) async fn source_of(&self, row: &JsonValue) -> Result<Option<Source>, String> {
        let root_id = js::string(&row["atome_id"]);
        let states = self
            .router
            .states_within_shared_root(&js::string(&row["owner_id"]), &root_id)
            .await?;
        let Some(root) = states
            .iter()
            .find(|state| list_view::state_id(state) == root_id)
            .cloned()
        else {
            return Ok(None);
        };
        if list_view::kind_of(&root).is_none() {
            return Ok(None);
        }
        let readable = parsed(row.get("readable_properties_json"), JsonValue::Null);
        let states = match readable.as_array().filter(|keys| !keys.is_empty()) {
            Some(keys) => states
                .iter()
                .map(|state| {
                    let kept: JsonMap<String, JsonValue> = list_view::properties(state)
                        .as_object()
                        .into_iter()
                        .flatten()
                        .filter(|(key, _)| *key == "type" || keys.contains(&json!(key)))
                        .map(|(key, value)| (key.clone(), value.clone()))
                        .collect();
                    js::with(state, [("properties", JsonValue::Object(kept))])
                })
                .collect(),
            None => states,
        };
        let view = list_view::view_of(&root, &states).expect("a list root");
        Ok(Some(Source { root, states, view }))
    }

    pub(super) async fn receipt_of(&self, row: &JsonValue) -> Option<JsonValue> {
        let id = json!(receipt_id(&share_of(row)));
        let state = self
            .router
            .get_state(&js::string(&row["principal_id"]), &id)
            .await
            .ok()?;
        let properties = state.get("properties")?;
        js::truthy(properties.get("share_id")).then(|| properties.clone())
    }

    async fn write_receipt(&self, row: &JsonValue, props: &JsonValue) -> Result<(), String> {
        let (share, recipient) = (share_of(row), js::string(&row["principal_id"]));
        let mut fields = json!({ "type": LIST_RECEIPT_ATOME_TYPE, "share_id": share, "source_id": row["atome_id"],
            "sender_id": row["owner_id"], "access": "private", "visibility": "private",
            "updated_at": atome_store::append::iso_now() });
        if let (Some(fields), Some(props)) = (fields.as_object_mut(), props.as_object()) {
            fields.extend(props.clone());
        }
        let event = json!({ "id": uuid::Uuid::new_v4().to_string(), "kind": "set", "atome_id": receipt_id(&share),
            "scope": "global", "actor": { "type": "user", "id": recipient }, "payload": { "props": fields } });
        self.router
            .commit(
                &recipient,
                &event,
                &json!({ "source": format!("share-list:{share}") }),
            )
            .await
            .map(|_| ())
    }

    // The source's root and entries copied into the recipient's account; `copies` (source id →
    // copy id) of the version before is kept, so a new version updates the same copies and removes
    // the entries gone.
    async fn copy_into(
        &self,
        row: &JsonValue,
        source: &Source,
        copies: &JsonValue,
    ) -> Result<JsonMap<String, JsonValue>, String> {
        let recipient = js::string(&row["principal_id"]);
        let root_id = js::string(&row["atome_id"]);
        let share = share_of(row);
        let options = json!({ "source": format!("share-list:{share}") });
        let link = json!({ "share_id": row["share_id"], "owner_id": js::string(&row["owner_id"]), "source_id": root_id });
        let listed = |id: &str| {
            source.view["entries"].as_array().is_some_and(|entries| {
                entries
                    .iter()
                    .any(|entry| entry.get("key") == Some(&json!(id)))
            })
        };
        let ordered = std::iter::once(&source.root).chain(source.states.iter().filter(|state| {
            let id = list_view::state_id(state);
            id != root_id && !list_view::state_parent(state).is_empty() && listed(&id)
        }));
        let mut next = JsonMap::new();
        let mut root: Option<(String, JsonValue)> = None;
        for state in ordered {
            let source_id = list_view::state_id(state);
            let known = copies
                .get(&source_id)
                .filter(|known| js::truthy(Some(known)));
            let fresh = known.map_or_else(|| uuid::Uuid::new_v4().to_string(), fresh_of);
            let copy_id = known
                .map(js::string)
                .unwrap_or_else(|| list_view::copy_id_of(state, &recipient, &fresh));
            let parent = if source_id == root_id {
                None
            } else {
                next.get(&list_view::state_parent(state))
                    .filter(|parent| js::truthy(Some(parent)))
                    .or_else(|| next.get(&root_id))
                    .cloned()
            };
            let kind = list_view::type_of(state);
            // A media list's revision is its copy's own write count.
            let revision = if kind != "media_list" {
                None
            } else if known.is_some() {
                let current = self.router.get_state(&recipient, &json!(copy_id)).await?;
                let written = current
                    .get("properties")
                    .and_then(|props| props.get("revision"))
                    .filter(|revision| !revision.is_null())
                    .map_or(-1.0, |revision| number(Some(revision)));
                Some(js::number_json(written + 1.0))
            } else {
                Some(json!(0))
            };
            // A basket's items join the recipient's own basket, whose root stays theirs.
            if source_id == root_id && source.view["kind"] == "shopping" {
                next.insert(source_id, json!(copy_id));
                continue;
            }
            let mut props = JsonMap::new();
            props.insert("type".into(), json!(kind));
            props.extend(list_view::copy_props_of(
                state,
                &fresh,
                &recipient,
                root.as_ref(),
            ));
            if let Some(revision) = revision {
                props.insert("revision".into(), revision);
            }
            if let Some(parent) = &parent {
                props.insert("list_root".into(), parent.clone());
            }
            props.insert(
                "list_link".into(),
                js::with(&link, [("source_atome_id", json!(source_id))]),
            );
            let mut event = JsonMap::new();
            event.insert("id".into(), json!(uuid::Uuid::new_v4().to_string()));
            event.insert("kind".into(), json!("set"));
            event.insert("atome_id".into(), json!(copy_id));
            event.insert("scope".into(), json!("global"));
            event.insert("actor".into(), json!({ "type": "user", "id": recipient }));
            if let Some(parent) = &parent {
                event.insert("parent_id".into(), parent.clone());
            }
            event.insert("payload".into(), json!({ "props": props }));
            self.router
                .commit(&recipient, &JsonValue::Object(event), &options)
                .await?;
            next.insert(source_id.clone(), json!(copy_id));
            if source_id == root_id {
                let person = list_view::copy_props_of(state, &fresh, &recipient, None)
                    .get("for_person")
                    .filter(|person| js::truthy(Some(person)))
                    .cloned()
                    .unwrap_or(JsonValue::Null);
                root = Some((copy_id, person));
            }
        }
        for (source_id, copy_id) in copies.as_object().into_iter().flatten() {
            if next
                .get(source_id)
                .is_some_and(|kept| js::truthy(Some(kept)))
            {
                continue;
            }
            let event = json!({ "id": uuid::Uuid::new_v4().to_string(), "kind": "delete", "atome_id": copy_id,
                "actor": { "type": "user", "id": recipient }, "payload": {} });
            self.router.commit(&recipient, &event, &options).await?;
        }
        Ok(next)
    }

    // The version shown now validated: copied, unless worked on together or applied by its
    // domain (a protocol template is imported on the recipient's profile).
    async fn validate(
        &self,
        row: &JsonValue,
        source: &Source,
        receipt: Option<&JsonValue>,
    ) -> Result<(JsonValue, JsonValue), String> {
        let version = list_view::version_of(&source.view, receipt);
        let known = receipt
            .and_then(|receipt| receipt.get("copies"))
            .filter(|copies| js::truthy(Some(copies)))
            .cloned()
            .unwrap_or_else(|| json!({}));
        let copies = if read_only(row) && source.view["kind"] != "protocol" {
            JsonValue::Object(self.copy_into(row, source, &known).await?)
        } else {
            known
        };
        let status = if row["share_type"] == "detached" {
            "detached"
        } else {
            "linked"
        };
        let refused = receipt
            .and_then(|receipt| receipt.get("refused_version"))
            .filter(|refused| js::truthy(Some(refused)))
            .cloned()
            .unwrap_or_else(|| json!(0));
        self.write_receipt(
            row,
            &json!({ "list_kind": source.view["kind"], "name": source.view["name"], "status": status,
                "accepted_version": version, "refused_version": refused, "entries": source.view["entries"],
                "copies": copies }),
        )
        .await?;
        Ok((version, copies))
    }

    async fn recipient_row(
        &self,
        principal: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let id = js::id(js::first(message, &["share_id", "request_id"]));
        match self.get(&id).await? {
            Some(row) if js::string(&row["principal_id"]) == principal => Ok(row),
            _ => Err("share_request_not_found".into()),
        }
    }

    /// Accepted (an answer or a policy `always`): a list root becomes the recipient's.
    pub(super) async fn list_accepted(&self, row: &JsonValue) -> Result<Option<JsonValue>, String> {
        let Some(source) = self.source_of(row).await? else {
            return Ok(None);
        };
        let receipt = self.receipt_of(row).await;
        let (version, copies) = self.validate(row, &source, receipt.as_ref()).await?;
        Ok(Some(json!({ "version": version, "copies": copies })))
    }

    /// What the invitation says of a list (its kind, name, count), `None` for another root.
    pub(super) async fn list_summary(&self, row: &JsonValue) -> Result<Option<JsonValue>, String> {
        Ok(self.source_of(row).await?.map(|source| {
            json!({ "list_kind": source.view["kind"], "list_name": source.view["name"],
                "list_count": source.view["entries"].as_array().map_or(0, Vec::len) })
        }))
    }

    /// `view`: the list a share names, for its recipient or its owner.
    pub(super) async fn list_view(
        &self,
        principal: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let id = js::id(js::first(message, &["share_id", "request_id"]));
        let row = self
            .get(&id)
            .await?
            .filter(|row| {
                [&row["principal_id"], &row["owner_id"]]
                    .iter()
                    .any(|who| js::string(who) == principal)
            })
            .ok_or("share_request_not_found")?;
        let pending_share = row["status"] == "pending";
        let Some(source) = self.source_of(&row).await? else {
            return Ok(
                json!({ "ok": true, "share_id": row["share_id"], "status": row["status"],
                "share_type": row["share_type"], "owner_id": row["owner_id"], "list": null, "receipt": null,
                "pending": pending_share }),
            );
        };
        let receipt = self.receipt_of(&row).await;
        let version = list_view::version_of(&source.view, receipt.as_ref());
        let current = source.view["entries"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let (entries, removed) = match &receipt {
            Some(receipt) => list_view::diff(
                receipt["entries"].as_array().map_or(&[][..], Vec::as_slice),
                &current,
            ),
            None => (current, Vec::new()),
        };
        let list = js::with(
            &source.view,
            [
                ("version", version.clone()),
                ("entries", json!(entries)),
                ("removed", json!(removed)),
            ],
        );
        let refused = |receipt: &JsonValue| {
            let refused = receipt
                .get("refused_version")
                .filter(|value| js::truthy(Some(value)));
            refused.cloned().unwrap_or_else(|| json!(0))
        };
        let newer = receipt.as_ref().is_some_and(|receipt| {
            let version = number(Some(&version));
            receipt["status"] == "linked"
                && version > number(receipt.get("accepted_version"))
                && version > number(Some(&refused(receipt)))
        });
        let shown = receipt.as_ref().map_or(JsonValue::Null, |receipt| {
            let mut fields = JsonMap::new();
            // An absent field (`undefined`) is left out, as JSON writes it.
            for key in ["status", "accepted_version"] {
                if let Some(value) = receipt.get(key) {
                    fields.insert(key.into(), value.clone());
                }
            }
            fields.insert("refused_version".into(), refused(receipt));
            JsonValue::Object(fields)
        });
        Ok(
            json!({ "ok": true, "share_id": row["share_id"], "status": row["status"], "share_type": row["share_type"],
            "owner_id": row["owner_id"], "list": list, "receipt": shown, "pending": pending_share || newer }),
        )
    }

    pub(super) async fn accept_version(
        &self,
        principal: &str,
        message: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let row = self.recipient_row(principal, message).await?;
        if !matches!(row["status"].as_str(), Some("active" | "accepted"))
            || row["share_type"] != "linked"
        {
            return Err("share_list_not_linked".into());
        }
        let source = self.source_of(&row).await?.ok_or("share_list_unknown")?;
        let receipt = self.receipt_of(&row).await;
        let (version, _) = self.validate(&row, &source, receipt.as_ref()).await?;
        out.push(Effect::Tell(
            js::string(&row["owner_id"]),
            json!({ "type": "share-version-decision", "share_id": row["share_id"], "version": version, "decision": "accepted" }),
        ));
        Ok(json!({ "ok": true, "share_id": row["share_id"], "version": version }))
    }

    pub(super) async fn refuse_version(
        &self,
        principal: &str,
        message: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let row = self.recipient_row(principal, message).await?;
        let receipt = self
            .receipt_of(&row)
            .await
            .ok_or("share_list_not_accepted")?;
        let source = self.source_of(&row).await?.ok_or("share_list_unknown")?;
        let version = list_view::version_of(&source.view, Some(&receipt));
        self.write_receipt(
            &row,
            &js::with(&receipt, [("refused_version", version.clone())]),
        )
        .await?;
        out.push(Effect::Tell(
            js::string(&row["owner_id"]),
            json!({ "type": "share-version-decision", "share_id": row["share_id"], "version": version, "decision": "refused" }),
        ));
        Ok(json!({ "ok": true, "share_id": row["share_id"], "refused_version": version }))
    }

    /// « Détacher »: the copies of the version validated stay the recipient's, the link ends; a
    /// list worked on together is copied at that moment.
    pub(super) async fn detach(
        &self,
        principal: &str,
        message: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let row = self.recipient_row(principal, message).await?;
        if row["share_type"] != "linked"
            || !matches!(row["status"].as_str(), Some("active" | "accepted"))
        {
            return Err("share_list_not_linked".into());
        }
        let mut receipt = self
            .receipt_of(&row)
            .await
            .ok_or("share_list_not_accepted")?;
        let known = receipt
            .get("copies")
            .filter(|copies| js::truthy(Some(copies)))
            .cloned()
            .unwrap_or_else(|| json!({}));
        if !read_only(&row) || known.as_object().is_none_or(JsonMap::is_empty) {
            let source = self.source_of(&row).await?.ok_or("share_list_unknown")?;
            let copies = self.copy_into(&row, &source, &known).await?;
            receipt = js::with(&receipt, [("copies", JsonValue::Object(copies))]);
        }
        self.write_receipt(&row, &js::with(&receipt, [("status", json!("detached"))]))
            .await?;
        self.revoke(principal, &json!({ "share_id": row["share_id"] }), out)
            .await?;
        let mut result = json!({ "ok": true, "share_id": row["share_id"] });
        if let Some(copies) = receipt.get("copies") {
            result["copies"] = copies.clone();
        }
        Ok(result)
    }

    /// A list just changed by its owner: each linked recipient whose version is behind is told,
    /// once a version.
    pub(super) async fn announce(
        &self,
        owner: &str,
        message: &JsonValue,
        out: &mut Vec<Effect>,
    ) -> Result<JsonValue, String> {
        let atome_id = js::id(message.get("atome_id"));
        let rows = self
            .rows(
                format!(
                    "SELECT * FROM sync_share_requests WHERE owner_id = ? AND atome_id = ? AND {}",
                    super::ACTIVE_LINKED
                ),
                vec![json!(owner), json!(atome_id)],
            )
            .await?;
        if atome_id.is_empty() {
            return Err("share_atome_required".into());
        }
        let mut told = Vec::new();
        for row in rows.iter().filter(|row| {
            js::string(&row["owner_id"]) == owner && js::string(&row["atome_id"]) == atome_id
        }) {
            let (Some(source), Some(receipt)) =
                (self.source_of(row).await?, self.receipt_of(row).await)
            else {
                continue;
            };
            if receipt["status"] != "linked" {
                continue;
            }
            let version = list_view::version_of(&source.view, Some(&receipt));
            let at = number(Some(&version));
            let announced = receipt
                .get("announced_version")
                .filter(|value| js::truthy(Some(value)))
                .map_or(0.0, |value| number(Some(value)));
            if at <= number(receipt.get("accepted_version")) || at <= announced {
                continue;
            }
            self.write_receipt(
                row,
                &js::with(&receipt, [("announced_version", version.clone())]),
            )
            .await?;
            let notification = json!({ "kind": "share-request", "id": format!("share_{}_v{}", share_of(row), js::text(Some(&version))),
                "extra": { "share_id": row["share_id"], "atomeIds": [row["atome_id"]], "share_type": row["share_type"],
                    "status": "pending", "list_kind": source.view["kind"], "list_name": source.view["name"],
                    "list_count": source.view["entries"].as_array().map_or(0, Vec::len), "list_version": version } });
            self.deliver(&js::string(&row["principal_id"]), owner, &notification, out)
                .await?;
            told.push(json!({ "share_id": row["share_id"], "principal_id": row["principal_id"], "version": version }));
        }
        Ok(json!({ "ok": true, "announced": told }))
    }
}
