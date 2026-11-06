// A permission's Conditions document as the server stores it
// (atome/src/squirrel/conditions/permission_adapter.js `normalizePermissionConditions`, with the
// validation its condition engine and registry run, ported): a legacy shape migrated to the
// `{ schemaVersion: 1, root }` tree, every leaf on a safe source, field and operator.
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::HashMap;

const SAFE_SOURCES: [&str; 9] = [
    "user",
    "atome",
    "actor",
    "operation",
    "property",
    "runtime",
    "time",
    "calendar",
    "location",
];
const SAFE_OPERATORS: [&str; 14] = [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "in",
    "not_in",
    "contains",
    "starts_with",
    "ends_with",
    "exists",
    "not_exists",
];

fn text(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => crate::vault_router::js::string(value),
    }
}

fn normalize_operator(value: Option<&JsonValue>) -> String {
    let operator = text(value).trim().to_lowercase();
    match operator.as_str() {
        "ne" | "is_not" => "neq".into(),
        "is" => "eq".into(),
        "after" => "gte".into(),
        "before" => "lte".into(),
        _ => operator,
    }
}

fn leaf(
    source: &str,
    field: &str,
    operator: Option<&JsonValue>,
    value: Option<&JsonValue>,
) -> JsonValue {
    let mut node = JsonMap::new();
    node.insert("source".into(), json!(source));
    node.insert("field".into(), json!(field));
    node.insert("operator".into(), json!(normalize_operator(operator)));
    // `value: undefined` leaves the key out of the stored JSON.
    if let Some(value) = value {
        node.insert("value".into(), value.clone());
    }
    JsonValue::Object(node)
}

fn group(combinator: &str, children: Vec<JsonValue>) -> JsonValue {
    json!({ "combinator": combinator, "children": children })
}

fn migrated_all(nodes: &[JsonValue], combinator: &str) -> Option<JsonValue> {
    let children: Option<Vec<JsonValue>> = nodes.iter().map(migrate).collect();
    Some(group(combinator, children?))
}

fn legacy_entries(source: &str, object: &JsonMap<String, JsonValue>) -> JsonValue {
    let mut children: Vec<JsonValue> = object
        .iter()
        .map(|(field, rule)| match rule.as_object() {
            Some(rule) if crate::vault_router::js::truthy(rule.get("op")) => {
                leaf(source, field, rule.get("op"), rule.get("value"))
            }
            _ => leaf(source, field, Some(&json!("eq")), Some(rule)),
        })
        .collect();
    if children.len() == 1 {
        children.remove(0)
    } else {
        group("and", children)
    }
}

// `migrateLegacyPermissionConditionNode`.
fn migrate(node: &JsonValue) -> Option<JsonValue> {
    let truthy = |key: &str| crate::vault_router::js::truthy(node.get(key));
    if let Some(items) = node.as_array() {
        return migrated_all(items, "and");
    }
    let object = node.as_object()?;
    if object.get("schemaVersion") == Some(&json!(1)) && truthy("root") {
        return object.get("root").cloned();
    }
    if let (Some(JsonValue::String(source)), Some(JsonValue::String(field))) =
        (object.get("source"), object.get("field"))
    {
        let operator = Some(object.get("operator"))
            .filter(|_| truthy("operator"))
            .flatten()
            .or_else(|| object.get("op"));
        return Some(leaf(source, field, operator, object.get("value")));
    }
    if let (Some(JsonValue::String(combinator)), Some(JsonValue::Array(children))) =
        (object.get("combinator"), object.get("children"))
    {
        return migrated_all(children, &combinator.to_lowercase());
    }
    if let Some(JsonValue::Array(all)) = object.get("all") {
        return migrated_all(all, "and");
    }
    if let Some(JsonValue::Array(any)) = object.get("any") {
        return migrated_all(any, "or");
    }
    if truthy("after") || truthy("before") {
        let mut children = Vec::new();
        if truthy("after") {
            children.push(leaf(
                "time",
                "now",
                Some(&json!("gte")),
                object.get("after"),
            ));
        }
        if truthy("before") {
            children.push(leaf(
                "time",
                "now",
                Some(&json!("lte")),
                object.get("before"),
            ));
        }
        return Some(if children.len() == 1 {
            children.remove(0)
        } else {
            group("and", children)
        });
    }
    if truthy("field") && truthy("op") {
        let path = text(object.get("field"));
        let (source, field) = path.split_once('.')?;
        if source.is_empty() {
            return None;
        }
        return Some(leaf(source, field, object.get("op"), object.get("value")));
    }
    for source in ["user", "atome"] {
        if let Some(entries) = object.get(source).and_then(JsonValue::as_object) {
            return Some(legacy_entries(source, entries));
        }
    }
    None
}

struct Leaf {
    source: String,
    field: String,
    operator: String,
}

// `collectProperties`: every node naming a source and a field, depth first.
fn collect(node: &JsonValue, out: &mut Vec<Leaf>) {
    let Some(object) = node.as_object() else {
        return;
    };
    let truthy = |key: &str| crate::vault_router::js::truthy(object.get(key));
    if truthy("source") && truthy("field") {
        out.push(Leaf {
            source: text(object.get("source")).to_lowercase(),
            field: text(object.get("field")),
            operator: normalize_operator(object.get("operator")),
        });
    }
    if let Some(JsonValue::Array(children)) = object.get("children") {
        for child in children {
            collect(child, out);
        }
    }
}

fn safe_field(field: &str) -> bool {
    let mut chars = field.chars();
    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
        && !field
            .split('.')
            .any(|part| matches!(part, "__proto__" | "prototype" | "constructor"))
}

// The engine's `validateNode`, on a registry holding one property per leaf (the last leaf of a
// source and field naming its only operator).
fn valid(node: &JsonValue, registered: &HashMap<String, String>) -> bool {
    let Some(object) = node.as_object() else {
        return false;
    };
    if let Some(JsonValue::String(combinator)) = object.get("combinator") {
        let combinator = combinator.trim().to_lowercase();
        let children = object.get("children").and_then(JsonValue::as_array);
        let count = children.map_or(0, Vec::len);
        return matches!(combinator.as_str(), "and" | "or" | "not")
            && count > 0
            && (combinator != "not" || count == 1)
            && children
                .is_some_and(|children| children.iter().all(|child| valid(child, registered)));
    }
    let (Some(JsonValue::String(source)), Some(JsonValue::String(field))) =
        (object.get("source"), object.get("field"))
    else {
        return false;
    };
    let key = format!("{}.{}", source.trim().to_lowercase(), field.trim());
    let operator = text(object.get("operator")).trim().to_lowercase();
    crate::conditions::operator(&operator).is_some()
        && registered
            .get(&key)
            .is_some_and(|allowed| *allowed == operator)
}

/// The stored document of `input`, `None` for no conditions (null, absent or an empty text);
/// `Err` names a JSON text that does not parse or a tree that does not validate.
pub fn normalize(input: Option<&JsonValue>) -> Result<Option<JsonValue>, String> {
    let parsed = match input {
        None | Some(JsonValue::Null) => return Ok(None),
        Some(JsonValue::String(raw)) if raw.is_empty() => return Ok(None),
        Some(JsonValue::String(raw)) => serde_json::from_str::<JsonValue>(raw)
            .map_err(|_| "permission_conditions_invalid_json".to_string())?,
        Some(other) => other.clone(),
    };
    let invalid = || "permission_conditions_invalid".to_string();
    let root = migrate(&parsed).ok_or_else(invalid)?;
    let mut leaves = Vec::new();
    collect(&root, &mut leaves);
    let unsafe_leaf = leaves.iter().any(|leaf| {
        !SAFE_SOURCES.contains(&leaf.source.as_str())
            || !safe_field(&leaf.field)
            || !SAFE_OPERATORS.contains(&leaf.operator.as_str())
    });
    if leaves.is_empty() || unsafe_leaf {
        return Err(invalid());
    }
    let registered: HashMap<String, String> = leaves
        .into_iter()
        .map(|leaf| {
            (
                format!("{}.{}", leaf.source, leaf.field.trim()),
                leaf.operator,
            )
        })
        .collect();
    if !valid(&root, &registered) {
        return Err(invalid());
    }
    Ok(Some(json!({ "schemaVersion": 1, "root": root })))
}
