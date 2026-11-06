// The condition registry of one request (atome/src/squirrel/conditions/registry.js, with the
// canonical sources of property_catalog.js `registerCanonicalConditionSources`): the operators
// and the types they apply to, the properties registered (discovered on the candidates, the
// computed ones), and the sources that describe a property no one registered.
use super::catalog::infer_type;
use super::computed::Definition;
use super::values::{get, key_text, normalize_key};
use crate::vault_router::js;
use indexmap::IndexMap;
use serde_json::Value as JsonValue;
use std::borrow::Cow;

/// An operator of the registry and the property types it applies to (`defaultOperators`).
pub(crate) struct Operator {
    pub(crate) id: &'static str,
    pub(crate) types: &'static [&'static str],
}

const ORDERED: &[&str] = &["number", "date", "datetime", "time"];
const MOMENTS: &[&str] = &["date", "datetime", "time"];

pub(crate) const OPERATORS: [Operator; 23] = [
    Operator {
        id: "eq",
        types: &["any"],
    },
    Operator {
        id: "neq",
        types: &["any"],
    },
    Operator {
        id: "gt",
        types: ORDERED,
    },
    Operator {
        id: "gte",
        types: ORDERED,
    },
    Operator {
        id: "lt",
        types: ORDERED,
    },
    Operator {
        id: "lte",
        types: ORDERED,
    },
    Operator {
        id: "between",
        types: ORDERED,
    },
    Operator {
        id: "in",
        types: &["any"],
    },
    Operator {
        id: "not_in",
        types: &["any"],
    },
    Operator {
        id: "contains",
        types: &["string", "array"],
    },
    Operator {
        id: "not_contains",
        types: &["string", "array"],
    },
    Operator {
        id: "contains_any",
        types: &["array"],
    },
    Operator {
        id: "contains_all",
        types: &["array"],
    },
    Operator {
        id: "starts_with",
        types: &["string"],
    },
    Operator {
        id: "ends_with",
        types: &["string"],
    },
    Operator {
        id: "before",
        types: MOMENTS,
    },
    Operator {
        id: "after",
        types: MOMENTS,
    },
    Operator {
        id: "inside",
        types: &["location", "array"],
    },
    Operator {
        id: "outside",
        types: &["location", "array"],
    },
    Operator {
        id: "distance_lt",
        types: &["location", "number"],
    },
    Operator {
        id: "distance_gt",
        types: &["location", "number"],
    },
    Operator {
        id: "exists",
        types: &["any"],
    },
    Operator {
        id: "not_exists",
        types: &["any"],
    },
];

/// `registry.operator(id)` of an id already normalised.
pub(crate) fn operator(id: &str) -> Option<&'static Operator> {
    OPERATORS.iter().find(|operator| operator.id == id)
}

// The operators `normalizeProperty` allows a property of `kind`.
fn applicable(kind: &str) -> Vec<&'static str> {
    OPERATORS
        .iter()
        .filter(|operator| operator.types.contains(&"any") || operator.types.contains(&kind))
        .map(|operator| operator.id)
        .collect()
}

/// `registry.operators(type).map((entry) => entry.id)`: every operator for no type.
pub(super) fn operators_for(kind: &str) -> Vec<&'static str> {
    if kind.is_empty() {
        OPERATORS.iter().map(|operator| operator.id).collect()
    } else {
        applicable(kind)
    }
}

// The canonical sources reading a context's candidate-shaped root, and `time`.
const GENERIC_SOURCES: [&str; 10] = [
    "atome",
    "record",
    "contact",
    "profile",
    "actor",
    "operation",
    "property",
    "runtime",
    "session",
    "calendar",
];

/// Where a property's value comes from.
#[derive(Clone, Debug)]
pub(super) enum Resolve {
    /// A canonical source's root in the context, read through its envelope.
    Generic { source: String, field: String },
    /// `time.now`, else a path of `context.time`.
    Time { field: String },
    /// A source no provider owns: the engine's own `readPath` of `context[source]`.
    Raw { source: String, field: String },
    /// A computed property: the registry's definition at this index.
    Computed(usize),
}

/// A property as the registry normalises it (`normalizeProperty`).
#[derive(Clone, Debug)]
pub(super) struct Property {
    pub(super) source: String,
    pub(super) field: String,
    pub(super) kind: String,
    pub(super) operators: Vec<&'static str>,
    pub(super) label: String,
    pub(super) group: Option<String>,
    pub(super) unit: Option<String>,
    pub(super) dependencies: Vec<String>,
    pub(super) resolve: Resolve,
}

/// What `registerProperty` takes.
pub(super) struct Registration {
    pub(super) source: String,
    pub(super) field: String,
    pub(super) kind: String,
    pub(super) operators: Vec<&'static str>,
    pub(super) label: String,
    pub(super) group: Option<String>,
    pub(super) unit: Option<String>,
    pub(super) dependencies: Vec<String>,
    pub(super) resolve: Option<Resolve>,
}

#[derive(Default)]
pub(super) struct Registry {
    properties: IndexMap<String, Property>,
    pub(super) definitions: Vec<Definition>,
}

fn provider(source: &str, field: &str) -> Option<Resolve> {
    if GENERIC_SOURCES.contains(&source) {
        return Some(Resolve::Generic {
            source: source.into(),
            field: field.into(),
        });
    }
    (source == "time").then(|| Resolve::Time {
        field: field.into(),
    })
}

impl Registry {
    /// `registerProperty(definition)`, a provider's reading when it brings none.
    pub(super) fn register(&mut self, entry: Registration) {
        let source = js::trim(&entry.source).to_lowercase();
        let field = js::trim(&entry.field).to_string();
        let kind = Some(js::trim(&entry.kind).to_lowercase())
            .filter(|kind| !kind.is_empty())
            .unwrap_or_else(|| "any".into());
        let operators = if entry.operators.is_empty() {
            applicable(&kind)
        } else {
            entry.operators
        };
        let resolve = entry.resolve.unwrap_or_else(|| {
            provider(&source, &field).unwrap_or_else(|| Resolve::Raw {
                source: source.clone(),
                field: field.clone(),
            })
        });
        let label = Some(entry.label)
            .filter(|label| !label.is_empty())
            .unwrap_or(field.clone());
        let property = Property {
            source,
            field,
            kind,
            operators,
            label,
            group: entry.group,
            unit: entry.unit,
            dependencies: entry.dependencies,
            resolve,
        };
        self.properties
            .insert(format!("{}.{}", property.source, property.field), property);
    }

    /// `registry.properties()`, in their order of registration.
    pub(super) fn properties(&self) -> impl Iterator<Item = &Property> {
        self.properties.values()
    }

    /// `registry.property(source, field, context, condition)`: the registered property, else
    /// the one its source describes, else none; `Err` is the `condition_property_invalid` a
    /// source's description of an empty field throws.
    pub(super) fn property(
        &self,
        source: Option<&JsonValue>,
        field: Option<&JsonValue>,
        condition: &JsonValue,
    ) -> Result<Option<Cow<'_, Property>>, String> {
        let source = normalize_key(source);
        let field_text = key_text(field);
        let field = js::trim(&field_text);
        if let Some(registered) = self.properties.get(&format!("{source}.{field}")) {
            return Ok(Some(Cow::Borrowed(registered)));
        }
        let Some(resolve) = provider(&source, &field_text) else {
            return Ok(None);
        };
        let kind = match &resolve {
            Resolve::Time { .. } if field_text == "now" => "datetime".to_string(),
            Resolve::Time { .. } => "any".to_string(),
            _ => match get(Some(condition), "valueType") {
                Some(kind) if js::truthy(Some(kind)) => normalize_key(Some(kind)),
                _ => infer_type(get(Some(condition), "value")).to_string(),
            },
        };
        if source.is_empty() || field.is_empty() {
            return Err("condition_property_invalid".into());
        }
        Ok(Some(Cow::Owned(Property {
            operators: applicable(&kind),
            dependencies: vec![format!("{source}.{field}")],
            label: field.to_string(),
            field: field.to_string(),
            source,
            kind,
            group: None,
            unit: None,
            resolve,
        })))
    }
}
