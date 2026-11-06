// What a bought digital good gives its buyer (server/shop_delivery.js, ported): a project or a
// template is a copy of the seller's project, every object of it, committed into the buyer's own
// vault (the copy keeps `shop_order_id` and its origin). Paid content and a subscription give a
// reading access held by the order itself, never a copy.
use super::Shop;
use crate::vault_router::js;
use crate::vault_router::shares::{state_atome_id, state_parent_id};
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;

const RESERVED: [&str; 4] = [
    "_pending_owner_id",
    "_pending_parent_id",
    "listing",
    "listing_status",
];

fn id_of(state: &JsonValue) -> String {
    state_atome_id(state).map(js::string).unwrap_or_default()
}

// Every property naming a copied object names its copy (parent, project, links between objects).
fn remap(value: &JsonValue, mapping: &HashMap<String, String>) -> JsonValue {
    match value {
        JsonValue::String(text) => mapping
            .get(text)
            .map_or_else(|| value.clone(), |copy| json!(copy)),
        JsonValue::Array(items) => {
            JsonValue::Array(items.iter().map(|item| remap(item, mapping)).collect())
        }
        _ => value.clone(),
    }
}

impl Shop {
    pub(super) async fn copy_project(
        &self,
        seller: &str,
        buyer: &str,
        project_id: &str,
        order_id: &str,
    ) -> Result<JsonValue, String> {
        let states = self
            .router
            .states_within_shared_root(seller, project_id)
            .await?;
        if !states.iter().any(|state| id_of(state) == project_id) {
            return Err("shop_project_not_found".into());
        }
        let by_id: HashMap<String, &JsonValue> =
            states.iter().map(|state| (id_of(state), state)).collect();
        let mapping: HashMap<String, String> = states
            .iter()
            .map(|state| (id_of(state), uuid::Uuid::new_v4().to_string()))
            .collect();
        // Depth of each state under the root, so a parent is always copied before its children.
        let depth = |state: &JsonValue| {
            let (mut depth, mut cursor) = (0, id_of(state));
            while !cursor.is_empty() && cursor != project_id && depth < 1000 {
                cursor = by_id
                    .get(&cursor)
                    .and_then(|state| state_parent_id(state))
                    .filter(|parent| js::truthy(Some(parent)))
                    .map(js::string)
                    .unwrap_or_default();
                depth += 1;
            }
            depth
        };
        let mut ordered: Vec<&JsonValue> = states.iter().collect();
        ordered.sort_by_key(|state| depth(state));
        for state in ordered {
            let original = id_of(state);
            let mut properties = serde_json::Map::new();
            for (key, value) in state["properties"].as_object().into_iter().flatten() {
                if !RESERVED.contains(&key.as_str()) {
                    properties.insert(key.clone(), remap(value, &mapping));
                }
            }
            if original == project_id {
                properties.shift_remove("parent_id");
            }
            let kind = js::first(state, &["type", "atome_type"])
                .or_else(|| properties.get("type"))
                .cloned()
                .unwrap_or(JsonValue::Null);
            for (key, value) in [
                ("type", kind),
                ("shared_from", json!(seller)),
                ("original_atome_id", json!(original)),
                ("share_type", json!("copy")),
                ("shop_order_id", json!(order_id)),
            ] {
                properties.insert(key.into(), value);
            }
            let event = json!({ "kind": "set", "atome_id": mapping[&original], "payload": { "props": properties },
                "actor": { "type": "user", "id": buyer } });
            self.router
                .commit(buyer, &event, &json!({ "source": "shop" }))
                .await?;
        }
        Ok(json!({ "projectId": mapping[project_id], "objects": states.len() }))
    }
}
