// The single « atome » offer (atome/src/shared/billing_contract.js), compiled in from its
// generated copy (eVe/registry/generated/billing_catalog.json, scripts/registry/
// registry_billing_catalog.mjs): the plans, the packs, the proofs' sources and stores, the
// simulated payment methods and one paid period.
use serde_json::Value as JsonValue;
use std::sync::LazyLock;

static CATALOG: LazyLock<JsonValue> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../../../eVe/registry/generated/billing_catalog.json"
    ))
    .expect("billing catalog")
});

pub fn catalog() -> &'static JsonValue {
    &CATALOG
}

pub fn period_ms() -> i64 {
    CATALOG["period_ms"].as_i64().expect("billing period")
}

/// `findBillingProduct`: a plan or a pack.
pub fn product(id: &str) -> Option<&'static JsonValue> {
    ["plans", "packs"]
        .iter()
        .filter_map(|list| CATALOG[*list].as_array())
        .flatten()
        .find(|product| product["productId"] == id)
}

pub fn listed(list: &str, value: &JsonValue) -> bool {
    CATALOG[list]
        .as_array()
        .is_some_and(|values| values.contains(value))
}
