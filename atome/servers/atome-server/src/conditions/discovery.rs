// The properties a condition can name (property_catalog.js `discoverConditionProperties` on the
// server's path): every readable path of every candidate's envelope down to three levels, its
// custom fields, then the registered properties (the computed ones), merged by `source.field`
// (two types are `mixed`), filtered by a search and ordered by the preferred ones, then by label.
// The registered atome types' schemas are not read: the server's `canReadProperty` refuses a
// field of no candidate, so none of them is ever kept.
use super::catalog::{envelope, infer_type, normalize_field_id, resolve_candidate_path};
use super::registry::{Registration, Registry, Resolve, operators_for};
use super::values::{Slot, entries, get, or_chain, plain_text};
use crate::mail::index::collate;
use crate::vault_router::js;
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::borrow::Cow;
use std::collections::HashMap;

const MAX_DISCOVERY_DEPTH: usize = 3;
const MIXED_OPERATORS: [&str; 6] = ["eq", "neq", "in", "not_in", "exists", "not_exists"];

/// A discovered property, as the catalog describes it.
pub(super) struct Descriptor {
    source: JsonValue,
    field: String,
    kind: String,
    label: String,
    group: String,
    unit: Option<String>,
    operators: Vec<&'static str>,
    dependencies: Vec<String>,
    /// A registered property's own reading (it also carries `editor: null`).
    registered: Option<Resolve>,
}

impl Descriptor {
    fn value(&self) -> String {
        format!("{}.{}", js::text(Some(&self.source)), self.field)
    }

    pub(super) fn to_json(&self) -> JsonValue {
        let mut entry = json!({
            "value": self.value(),
            "source": self.source,
            "field": self.field,
            "type": self.kind,
            "label": self.label,
            "group": self.group,
            "unit": self.unit,
            "operators": self.operators,
            "dependencies": self.dependencies,
        });
        if self.registered.is_some() {
            entry["editor"] = JsonValue::Null;
        }
        entry
    }

    /// `registry.registerProperty(entry)`.
    pub(super) fn register(&self, registry: &mut Registry) {
        registry.register(Registration {
            source: js::text(Some(&self.source)),
            field: self.field.clone(),
            kind: self.kind.clone(),
            operators: self.operators.clone(),
            label: self.label.clone(),
            group: Some(self.group.clone()),
            unit: self.unit.clone(),
            dependencies: self.dependencies.clone(),
            resolve: self.registered.clone(),
        });
    }
}

fn descriptor(
    source: &JsonValue,
    field: String,
    kind: &str,
    label: String,
    group: &str,
) -> Descriptor {
    let value = format!("{}.{field}", js::text(Some(source)));
    Descriptor {
        source: source.clone(),
        field,
        kind: kind.into(),
        label,
        group: group.into(),
        unit: None,
        operators: operators_for(kind),
        dependencies: vec![value],
        registered: None,
    }
}

// `mergeDescriptor`: a field seen again keeps its first description, its type merged.
fn add(discovered: &mut IndexMap<String, Descriptor>, entry: Descriptor) {
    if entry.field.is_empty() || !js::truthy(Some(&entry.source)) {
        return;
    }
    let key = entry.value();
    let Some(current) = discovered.get_mut(&key) else {
        discovered.insert(key, entry);
        return;
    };
    let kind = if current.kind == "any" {
        entry.kind
    } else if entry.kind == "any" || current.kind == entry.kind {
        current.kind.clone()
    } else {
        "mixed".into()
    };
    current.operators = if kind == "mixed" {
        current
            .operators
            .iter()
            .filter(|id| MIXED_OPERATORS.contains(id))
            .copied()
            .collect()
    } else {
        operators_for(&kind)
    };
    current.kind = kind;
}

struct Walk<'c> {
    candidate: &'c JsonValue,
    source: &'c JsonValue,
    out: Vec<Descriptor>,
}

impl Walk<'_> {
    // `canReadProperty(candidate, field) !== false`: the server reads only what resolves.
    fn readable(&self, field: &str) -> bool {
        js::truthy(Some(self.candidate)) && resolve_candidate_path(self.candidate, field).is_some()
    }

    // `flattenObject`.
    fn flatten<'v>(&mut self, object: Vec<(Cow<'v, str>, Slot<'v>)>, prefix: &str, depth: usize) {
        for (key, value) in object {
            let field = if prefix.is_empty() {
                key.to_string()
            } else {
                format!("{prefix}.{key}")
            };
            if !self.readable(&field) {
                continue;
            }
            let value = value.as_deref();
            let kind = infer_type(value);
            if kind == "object" && depth < MAX_DISCOVERY_DEPTH {
                let nested = value.and_then(JsonValue::as_object).map(|map| {
                    entries(map)
                        .into_iter()
                        .map(|(key, item)| (Cow::Borrowed(key.as_str()), Some(Cow::Borrowed(item))))
                        .collect::<Vec<_>>()
                });
                self.flatten(nested.unwrap_or_default(), &field, depth + 1);
                continue;
            }
            let group = if prefix.is_empty() { "all" } else { "relation" };
            self.out.push(descriptor(
                self.source,
                field,
                kind,
                key.into_owned(),
                group,
            ));
        }
    }

    fn custom_fields(&mut self) {
        let fields = envelope(self.candidate)
            .into_iter()
            .find(|(key, _)| key == "custom_fields")
            .and_then(|(_, value)| value);
        let Some(JsonValue::Array(fields)) = fields.as_deref() else {
            return;
        };
        for entry in fields {
            let named = or_chain(&[get(Some(entry), "id"), get(Some(entry), "label")]);
            let id = normalize_field_id(named);
            let field = format!("custom.{id}");
            if id.is_empty() || !self.readable(&field) {
                continue;
            }
            let label = Some(plain_text(get(Some(entry), "label")))
                .filter(|label| !label.is_empty())
                .unwrap_or_else(|| id.clone());
            let kind = infer_type(get(Some(entry), "value"));
            self.out
                .push(descriptor(self.source, field, kind, label, "custom"));
        }
    }
}

/// `discoverConditionProperties({ registry, candidates, source, search, preferred })`; `preferred`
/// as the request names it (absent: none).
pub(super) fn discover(
    registry: &Registry,
    candidates: &[JsonValue],
    source: &JsonValue,
    search: &str,
    preferred: Option<&JsonValue>,
) -> Result<Vec<Descriptor>, String> {
    let mut discovered = IndexMap::new();
    for candidate in candidates {
        if candidate.is_null() {
            return Err("Cannot read properties of null (reading 'properties')".into());
        }
        let mut walk = Walk {
            candidate,
            source,
            out: Vec::new(),
        };
        walk.flatten(envelope(candidate), "", 0);
        walk.custom_fields();
        for entry in walk.out {
            add(&mut discovered, entry);
        }
    }
    for property in registry.properties() {
        let group = property.group.clone().unwrap_or_else(|| {
            let own = source.as_str() == Some(property.source.as_str());
            if own { "context" } else { "live" }.into()
        });
        add(
            &mut discovered,
            Descriptor {
                source: JsonValue::String(property.source.clone()),
                field: property.field.clone(),
                kind: property.kind.clone(),
                label: property.label.clone(),
                group,
                unit: property.unit.clone(),
                operators: property.operators.clone(),
                dependencies: property.dependencies.clone(),
                registered: Some(property.resolve.clone()),
            },
        );
    }
    let preferred = match preferred {
        None => &[][..],
        Some(JsonValue::Array(preferred)) => preferred.as_slice(),
        Some(JsonValue::Null) => {
            return Err("Cannot read properties of null (reading 'map')".into());
        }
        Some(_) => return Err("preferred.map is not a function".into()),
    };
    let rank: HashMap<String, usize> = preferred
        .iter()
        .enumerate()
        .map(|(index, entry)| (js::text(Some(entry)), index))
        .collect();
    let search = js::trim(search).to_lowercase();
    let mut ranked: Vec<(usize, Descriptor)> = discovered
        .into_iter()
        .filter(|(value, entry)| {
            search.is_empty()
                || format!("{} {value}", entry.label)
                    .to_lowercase()
                    .contains(&search)
        })
        .map(|(value, entry)| (rank.get(&value).copied().unwrap_or(usize::MAX), entry))
        .collect();
    ranked.sort_by(|(left_rank, left), (right_rank, right)| {
        left_rank
            .cmp(right_rank)
            .then_with(|| collate(&left.label, &right.label))
    });
    Ok(ranked.into_iter().map(|(_, entry)| entry).collect())
}
