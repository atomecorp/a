// The atome types only their owner ever writes (`owner_only` in eVe/registry/generated/atome_types.json, from
// atome/src/shared/access_social_atome_types.js): a script's trust, a program's grant, an objective's visibility.
// A co-editor of a shared document may create under it, and what he creates lands in its owner's vault, owned by
// them (VaultRouter::commit); for these types that would be a trust or a grant the owner never gave. So a write of
// one of them by anyone but the vault's owner is refused, whether the event names the type or the atome already holds it.
// Their ids name their account (`script_trust:<account>:…`, `mcp_program_grant:<account>:…`, `objective_network:<account>`):
// such an id is written by that account alone, wherever it would land, so no one squats another's predictable id
// (registered first in their own vault, it would refuse the owner's record for good: vault_object_owner_conflict).
// A shared create is stamped with its vault's owner here too (`with_vault_owner`).
use super::VaultRouter;
use super::js::{self, first, truthy};
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;
use std::sync::LazyLock;

pub(crate) const OWNER_ONLY_REFUSED: &str = "atome_owner_only";

static OWNER_ONLY_TYPES: LazyLock<Result<HashSet<String>, String>> = LazyLock::new(|| {
    let document: JsonValue = serde_json::from_str(atome_store::type_gate::ATOME_TYPES_JSON)
        .map_err(|error| format!("atome_types_json_invalid:{error}"))?;
    Ok(document
        .get("types")
        .and_then(JsonValue::as_object)
        .ok_or("atome_types_json_invalid:types")?
        .iter()
        .filter(|(_, entry)| entry.get("owner_only").and_then(JsonValue::as_bool) == Some(true))
        .map(|(name, _)| name.clone())
        .collect())
});

fn owner_only(name: Option<&JsonValue>) -> Result<bool, String> {
    let types = OWNER_ONLY_TYPES.as_ref().map_err(Clone::clone)?;
    Ok(name
        .and_then(JsonValue::as_str)
        .is_some_and(|name| types.contains(name.trim())))
}

// The account an owner-only id names, if it names one in its first segment.
fn named_account(atome_id: &str) -> Result<Option<String>, String> {
    let types = OWNER_ONLY_TYPES.as_ref().map_err(Clone::clone)?;
    Ok(types.iter().find_map(|name| {
        let rest = atome_id.strip_prefix(name.as_str())?.strip_prefix(':')?;
        let segment = rest
            .split(':')
            .next()
            .filter(|segment| !segment.is_empty())?;
        percent_encoding::percent_decode_str(segment)
            .decode_utf8()
            .ok()
            .map(|account| account.into_owned())
    }))
}

// Every place an event may name its atome's type (the envelope and its props).
fn named_types(event: &JsonValue) -> Vec<Option<&JsonValue>> {
    let props = event
        .get("payload")
        .and_then(|payload| payload.get("props"))
        .filter(|props| truthy(Some(props)));
    vec![
        first(event, &["atome_type", "atomeType", "type"]),
        props.and_then(|props| first(props, &["type", "atome_type", "atomeType"])),
    ]
}

/// Created through a share, the object is its vault's: a `set` names that owner, never the writer.
pub(super) fn with_vault_owner(event: &JsonValue, owner: &str) -> JsonValue {
    if event.get("kind").and_then(JsonValue::as_str) != Some("set") {
        return event.clone();
    }
    let payload = event
        .get("payload")
        .filter(|payload| truthy(Some(payload)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let props = payload
        .get("props")
        .filter(|props| truthy(Some(props)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let props = js::with(&props, [("owner_id", json!(owner))]);
    js::with(event, [("payload", js::with(&payload, [("props", props)]))])
}

impl VaultRouter {
    /// Refuses `actor`'s event when `owner`'s atome is, or would become, of an owner-only type.
    pub(super) async fn refuse_owner_only(
        &self,
        actor: &str,
        owner: &str,
        atome_id: &str,
        event: &JsonValue,
        registered: bool,
    ) -> Result<(), String> {
        if let Some(account) = named_account(atome_id)?
            && account != actor
            && self
                .central
                .get(
                    "SELECT 1 AS hit FROM atomes WHERE atome_id = ? AND atome_type = 'user'",
                    vec![json!(account)],
                )
                .await?
                .is_some()
        {
            return Err(OWNER_ONLY_REFUSED.into());
        }
        if owner == actor {
            return Ok(());
        }
        for name in named_types(event) {
            if owner_only(name)? {
                return Err(OWNER_ONLY_REFUSED.into());
            }
        }
        // The type the owner's vault will give the atome, wherever the event names it (its props'
        // `kind`, `properties`, a patch, a delta: R-246 retest2).
        let projected = event
            .as_object()
            .and_then(atome_store::projected_type)
            .map(JsonValue::from);
        if owner_only(projected.as_ref())? {
            return Err(OWNER_ONLY_REFUSED.into());
        }
        if registered {
            let state = self
                .ask(owner, "state:get", json!({ "atome_id": atome_id }))
                .await?;
            // A vault state names its type `type` (canonical::universal).
            if owner_only(first(&state, &["atome_type", "type"]))? {
                return Err(OWNER_ONLY_REFUSED.into());
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_registry_marks_the_private_records_owner_only() {
        for name in [
            "script_trust",
            "mcp_program_grant",
            "objective_visibility",
            "objective_network",
        ] {
            assert!(owner_only(Some(&json!(name))).unwrap(), "{name}");
        }
        for name in ["text", "image", "project", "contact"] {
            assert!(!owner_only(Some(&json!(name))).unwrap(), "{name}");
        }
    }

    #[test]
    fn an_owner_only_id_names_its_account() {
        assert_eq!(
            named_account("script_trust:u%201:doc:script_x")
                .unwrap()
                .as_deref(),
            Some("u 1")
        );
        assert_eq!(
            named_account("objective_network:u2").unwrap().as_deref(),
            Some("u2")
        );
        assert_eq!(named_account("text:u1:doc").unwrap(), None);
        assert_eq!(named_account("script_trustee:u1").unwrap(), None);
    }

    #[test]
    fn an_event_names_its_type_in_the_envelope_or_the_props() {
        let in_props =
            json!({ "kind": "set", "payload": { "props": { "type": " script_trust " } } });
        let in_envelope =
            json!({ "kind": "create", "atome_type": "mcp_program_grant", "payload": {} });
        let plain = json!({ "kind": "set", "payload": { "props": { "type": "text" } } });
        let any = |event: &JsonValue| {
            named_types(event)
                .into_iter()
                .any(|name| owner_only(name).unwrap())
        };
        assert!(any(&in_props) && any(&in_envelope) && !any(&plain));
    }

    // R-246 retest2: the type the vault derives, wherever the event names it.
    #[test]
    fn the_projected_type_is_read_wherever_the_event_names_it() {
        let projected = |event: JsonValue| {
            let name = event
                .as_object()
                .and_then(atome_store::projected_type)
                .map(JsonValue::from);
            owner_only(name.as_ref()).unwrap()
        };
        for event in [
            json!({ "kind": "create", "payload": { "props": { "kind": "mcp_program_grant" } } }),
            json!({ "kind": "set", "payload": { "properties": { "type": "mcp_program_grant" } } }),
            json!({ "kind": "set", "properties": { "type": "mcp_program_grant" } }),
            json!({ "kind": "patch", "payload": { "patch": { "type": "mcp_program_grant" } } }),
        ] {
            assert!(projected(event.clone()), "{event}");
        }
        assert!(!projected(
            json!({ "kind": "set", "payload": { "props": { "type": "text" } } })
        ));
    }
}
