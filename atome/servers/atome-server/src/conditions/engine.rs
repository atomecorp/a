// The condition engine of one request (atome/src/squirrel/conditions/engine.js and the
// operators of registry.js): a tree validated once against the registry, then evaluated on each
// candidate's context to true, false or unknown. Only `matched` (true) leaves the engine on the
// server path, so the reason codes the JavaScript engine also returns are not kept.
use super::catalog::resolve_candidate_path;
use super::computed;
use super::registry::{self, Operator, Property, Registry, Resolve};
use super::values::{Js, get, normalize_key, read_path, same_number, same_value};
use crate::vault_router::js;
use regex::Regex;
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::borrow::Cow;
use std::sync::LazyLock;

// `/^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?\s*[a-z%]*\s*$/i`, its number captured: what
// `Number.parseFloat` reads of it.
static NUMBER_WITH_UNIT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*([-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?)\s*[a-zA-Z%]*\s*$")
        .expect("number with unit")
});

/// A candidate's context: `{ candidate, item, subjectId, [candidateSource]: item, ...request.context }`.
pub(super) struct Context<'a> {
    pub(super) source: &'a str,
    pub(super) item: &'a JsonValue,
    pub(super) subject: &'a JsonValue,
    pub(super) extra: Option<&'a JsonMap<String, JsonValue>>,
    pub(super) now: f64,
}

impl<'a> Context<'a> {
    pub(super) fn get(&self, key: &str) -> Option<&'a JsonValue> {
        if let Some(value) = self.extra.and_then(|extra| extra.get(key)) {
            return Some(value);
        }
        match key {
            _ if key == self.source => Some(self.item),
            "candidate" | "item" => Some(self.item),
            "subjectId" => Some(self.subject),
            _ => None,
        }
    }
}

/// A source's reading: `{ available, value }`.
pub(super) struct Resolved<'a> {
    pub(super) available: bool,
    pub(super) value: Js<'a>,
}

impl<'a> Resolved<'a> {
    pub(super) fn of(slot: Option<Option<Cow<'a, JsonValue>>>) -> Self {
        match slot {
            Some(slot) => Resolved {
                available: true,
                value: Js::from_slot(slot),
            },
            None => Self::unavailable(),
        }
    }

    pub(super) fn unavailable() -> Self {
        Resolved {
            available: false,
            value: Js::Undefined,
        }
    }
}

/// A JavaScript error thrown while a value is read, which the engine answers unknown.
pub(super) struct Thrown;

/// `property.resolve(context, node)`, else the engine's `readPath(context[source], field)`.
pub(super) fn resolve<'a>(
    registry: &'a Registry,
    property: &Property,
    context: &Context<'a>,
    stack: &mut Vec<String>,
) -> Result<Resolved<'a>, Thrown> {
    Ok(match &property.resolve {
        Resolve::Generic { source, field } => match context.get(source) {
            // `candidateEnvelope(null)` throws.
            Some(JsonValue::Null) => return Err(Thrown),
            Some(root) => Resolved::of(resolve_candidate_path(root, field)),
            None => Resolved::of(
                resolve_candidate_path(&JsonValue::Object(JsonMap::new()), field)
                    .map(|slot| slot.map(|value| Cow::Owned(value.into_owned()))),
            ),
        },
        Resolve::Time { field } if field == "now" => {
            let now = context.get("now").filter(|now| js::truthy(Some(now)));
            Resolved {
                available: true,
                value: now.map_or(Js::Date(context.now), |now| Js::borrowed(Some(now))),
            }
        }
        Resolve::Time { field } => Resolved::of(read_path(
            context.get("time").map(Cow::Borrowed),
            js::trim(field),
        )),
        Resolve::Raw { source, field } => {
            Resolved::of(read_path(context.get(source).map(Cow::Borrowed), field))
        }
        Resolve::Computed(index) => {
            let definition = &registry.definitions[*index];
            if stack.contains(&definition.id) {
                return Ok(Resolved::unavailable());
            }
            stack.push(definition.id.clone());
            let resolved = computed::evaluate(registry, &definition.expression, context, 0, stack);
            stack.pop();
            resolved?
        }
    })
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum State {
    True,
    False,
    Unknown,
}

pub(super) enum Combinator {
    And,
    Or,
    Not,
}

/// A validated tree: its leaves hold their property and operator.
pub(super) enum Node<'r> {
    Group(Combinator, Vec<Node<'r>>),
    Leaf(Box<Leaf<'r>>),
}

/// A leaf: its property, operator, value and how they compare.
pub(super) struct Leaf<'r> {
    property: Cow<'r, Property>,
    operator: &'static Operator,
    value: Option<&'r JsonValue>,
    kind: String,
    case_insensitive: bool,
}

const TYPED: [&str; 6] = ["number", "date", "datetime", "time", "boolean", "string"];

/// `engine.validate`: the tree ready to evaluate, `None` when it does not validate (every
/// candidate is then unknown); `Err` is what the registry throws on a leaf.
pub(super) fn compile<'r>(
    registry: &'r Registry,
    node: &'r JsonValue,
) -> Result<Option<Node<'r>>, String> {
    let mut valid = true;
    let tree = compile_node(registry, node, &mut valid)?;
    Ok(tree.filter(|_| valid))
}

fn compile_node<'r>(
    registry: &'r Registry,
    node: &'r JsonValue,
    valid: &mut bool,
) -> Result<Option<Node<'r>>, String> {
    let Some(object) = node.as_object() else {
        *valid = false;
        return Ok(None);
    };
    if let Some(JsonValue::String(combinator)) = object.get("combinator") {
        let combinator = match js::trim(combinator).to_lowercase().as_str() {
            "and" => Some(Combinator::And),
            "or" => Some(Combinator::Or),
            "not" => Some(Combinator::Not),
            _ => None,
        };
        let children = object.get("children");
        let count = match children {
            Some(JsonValue::Array(items)) => items.len(),
            _ => 0,
        };
        let not_arity = match children {
            Some(JsonValue::Array(items)) => items.len() != 1,
            Some(JsonValue::String(text)) => text.encode_utf16().count() != 1,
            Some(JsonValue::Object(map)) => {
                map.get("length").and_then(JsonValue::as_f64) != Some(1.0)
            }
            _ => true,
        };
        if combinator.is_none() || count == 0 {
            *valid = false;
        }
        if matches!(combinator, Some(Combinator::Not)) && not_arity {
            *valid = false;
        }
        let mut compiled = Vec::new();
        match children {
            None | Some(JsonValue::Null) => {}
            Some(JsonValue::Array(items)) => {
                for child in items {
                    compiled.extend(compile_node(registry, child, valid)?);
                }
            }
            Some(_) => return Err("node.children?.forEach is not a function".into()),
        }
        return Ok(combinator.map(|combinator| Node::Group(combinator, compiled)));
    }
    let (Some(JsonValue::String(_)), Some(JsonValue::String(_))) =
        (object.get("source"), object.get("field"))
    else {
        *valid = false;
        return Ok(None);
    };
    let property = registry.property(object.get("source"), object.get("field"), node)?;
    let operator = registry::operator(&normalize_key(object.get("operator")));
    let (Some(property), Some(operator)) = (property, operator) else {
        *valid = false;
        return Ok(None);
    };
    if !property.operators.contains(&operator.id) {
        *valid = false;
        return Ok(None);
    }
    // `node.valueType || property.type`: a value type of another JavaScript type matches none.
    let kind = match object.get("valueType") {
        Some(JsonValue::String(kind)) if !kind.is_empty() => kind.clone(),
        Some(kind) if js::truthy(Some(kind)) => "\u{0}".into(),
        _ => property.kind.clone(),
    };
    Ok(Some(Node::Leaf(Box::new(Leaf {
        property,
        operator,
        value: object.get("value"),
        kind,
        case_insensitive: object.get("caseInsensitive") == Some(&JsonValue::Bool(true)),
    }))))
}

/// `dependenciesOf`: the registry read on every node naming a source and a field, which throws
/// as the validation does on an empty field.
pub(super) fn check_dependencies(registry: &Registry, node: &JsonValue) -> Result<(), String> {
    if let Some(JsonValue::Array(children)) = get(Some(node), "children") {
        return children
            .iter()
            .try_for_each(|child| check_dependencies(registry, child));
    }
    let (source, field) = (get(Some(node), "source"), get(Some(node), "field"));
    if js::truthy(source) && js::truthy(field) {
        registry.property(source, field, node)?;
    }
    Ok(())
}

/// The tree's state on one context.
pub(super) fn evaluate<'a>(
    registry: &'a Registry,
    node: &Node<'a>,
    context: &Context<'a>,
) -> State {
    match node {
        Node::Group(combinator, children) => {
            let states: Vec<State> = children
                .iter()
                .map(|child| evaluate(registry, child, context))
                .collect();
            let any = |state| states.contains(&state);
            match combinator {
                Combinator::Not => match states.as_slice() {
                    [State::True] => State::False,
                    [State::False] => State::True,
                    _ => State::Unknown,
                },
                Combinator::And if any(State::False) => State::False,
                Combinator::Or if any(State::True) => State::True,
                _ if any(State::Unknown) => State::Unknown,
                Combinator::And => State::True,
                Combinator::Or => State::False,
            }
        }
        Node::Leaf(leaf) => {
            let Leaf {
                property,
                operator,
                value,
                kind,
                case_insensitive,
            } = leaf.as_ref();
            let Ok(resolved) = resolve(registry, property, context, &mut Vec::new()) else {
                return State::Unknown;
            };
            if !resolved.available {
                return match operator.id {
                    "exists" => State::False,
                    "not_exists" => State::True,
                    _ => State::Unknown,
                };
            }
            let actual = lower(resolved.value, *case_insensitive);
            let expected = lower(Js::borrowed(*value), *case_insensitive);
            match apply(operator.id, &actual, &expected, kind) {
                Some(true) => State::True,
                Some(false) => State::False,
                None => State::Unknown,
            }
        }
    }
}

fn lower_json(value: &JsonValue) -> JsonValue {
    match value {
        JsonValue::String(text) => JsonValue::String(text.to_lowercase()),
        JsonValue::Array(items) => JsonValue::Array(items.iter().map(lower_json).collect()),
        other => other.clone(),
    }
}

// `normalizeCase(value, enabled)`.
fn lower(value: Js<'_>, enabled: bool) -> Js<'_> {
    match &value {
        Js::Json(json) if enabled && (json.is_string() || json.is_array()) => {
            Js::Json(Cow::Owned(lower_json(json)))
        }
        _ => value,
    }
}

enum Comparable {
    Number(f64),
    Bool(bool),
    Text(String),
}

// `comparable(value, type)`.
fn comparable(value: &Js, kind: &str) -> Option<Comparable> {
    match kind {
        "number" => {
            let text = value.json().and_then(JsonValue::as_str);
            let number = match text.and_then(|text| NUMBER_WITH_UNIT.captures(text)) {
                Some(found) => found[1].parse().unwrap_or(f64::NAN),
                None => value.to_number(),
            };
            number.is_finite().then_some(Comparable::Number(number))
        }
        "date" | "datetime" | "time" => value.time().map(Comparable::Number),
        "boolean" => {
            if let Some(JsonValue::Bool(flag)) = value.json() {
                return Some(Comparable::Bool(*flag));
            }
            let text = if value.truthy() {
                value.text()
            } else {
                String::new()
            };
            match js::trim(&text).to_lowercase().as_str() {
                "true" | "1" | "yes" | "oui" => Some(Comparable::Bool(true)),
                "false" | "0" | "no" | "non" => Some(Comparable::Bool(false)),
                _ => None,
            }
        }
        _ => (!value.nullish()).then(|| Comparable::Text(value.text())),
    }
}

fn same_typed(actual: &Js, expected: &Js, kind: &str) -> bool {
    if !TYPED.contains(&kind) {
        return same_value(actual, expected);
    }
    match (comparable(actual, kind), comparable(expected, kind)) {
        (Some(Comparable::Number(a)), Some(Comparable::Number(b))) => same_number(a, b),
        (Some(Comparable::Bool(a)), Some(Comparable::Bool(b))) => a == b,
        (Some(Comparable::Text(a)), Some(Comparable::Text(b))) => a == b,
        _ => false,
    }
}

// `ordered(actual, expected, type, compare)`: JavaScript's `<` of the two comparables.
fn ordered(actual: &Js, expected: &Js, kind: &str) -> Option<std::cmp::Ordering> {
    let as_number = |flag: bool| f64::from(u8::from(flag));
    match (comparable(actual, kind)?, comparable(expected, kind)?) {
        (Comparable::Number(a), Comparable::Number(b)) => a.partial_cmp(&b),
        (Comparable::Bool(a), Comparable::Bool(b)) => as_number(a).partial_cmp(&as_number(b)),
        (Comparable::Text(a), Comparable::Text(b)) => Some(a.encode_utf16().cmp(b.encode_utf16())),
        _ => None,
    }
}

fn elements<'v>(value: &'v Js) -> Option<&'v Vec<JsonValue>> {
    value.json().and_then(JsonValue::as_array)
}

fn array_contains(actual: &Js, expected: &Js) -> bool {
    elements(actual).is_some_and(|items| {
        items
            .iter()
            .any(|entry| same_value(&Js::borrowed(Some(entry)), expected))
    })
}

fn location_contains(actual: &Js, expected: &Js) -> Option<bool> {
    let entry_is = |items: &Vec<JsonValue>| {
        items
            .iter()
            .any(|entry| same_value(&Js::borrowed(Some(entry)), expected))
    };
    match actual.json()? {
        JsonValue::Bool(flag) => Some(*flag),
        JsonValue::Array(items) => Some(entry_is(items)),
        JsonValue::Object(map) => match map.get("zones") {
            Some(JsonValue::Array(zones)) => Some(entry_is(zones)),
            _ => map
                .get("inside")
                .map(|inside| inside == &JsonValue::Bool(true)),
        },
        _ => None,
    }
}

// An operator's `evaluate({ actual, expected, type })`; `None` is a result that is not a boolean.
fn apply(id: &str, actual: &Js, expected: &Js, kind: &str) -> Option<bool> {
    use std::cmp::Ordering::{Greater, Less};
    let in_list = |items: &Vec<JsonValue>| {
        items
            .iter()
            .any(|entry| same_value(actual, &Js::borrowed(Some(entry))))
    };
    let text = actual.json().and_then(JsonValue::as_str);
    match id {
        "eq" => Some(same_typed(actual, expected, kind)),
        "neq" => Some(!same_typed(actual, expected, kind)),
        "gt" | "after" => ordered(actual, expected, kind).map(|order| order == Greater),
        "gte" => ordered(actual, expected, kind).map(|order| order != Less),
        "lt" | "before" => ordered(actual, expected, kind).map(|order| order == Less),
        "lte" => ordered(actual, expected, kind).map(|order| order != Greater),
        "between" => {
            let bounds = elements(expected).filter(|bounds| bounds.len() == 2)?;
            let low = ordered(actual, &Js::borrowed(Some(&bounds[0])), kind)?;
            let high = ordered(actual, &Js::borrowed(Some(&bounds[1])), kind)?;
            Some(low != Less && high != Greater)
        }
        "in" => Some(elements(expected).is_some_and(in_list)),
        "not_in" => Some(elements(expected).is_some_and(|items| !in_list(items))),
        "contains" => Some(match text {
            Some(text) => text.contains(&expected.text()),
            None => array_contains(actual, expected),
        }),
        "not_contains" => Some(match text {
            Some(text) => !text.contains(&expected.text()),
            None => elements(actual).is_some() && !array_contains(actual, expected),
        }),
        "contains_any" | "contains_all" => Some(elements(expected).is_some_and(|items| {
            let mut wanted = items
                .iter()
                .map(|entry| array_contains(actual, &Js::borrowed(Some(entry))));
            if id == "contains_any" {
                wanted.any(|found| found)
            } else {
                wanted.all(|found| found)
            }
        })),
        "starts_with" => Some(actual.text().starts_with(&expected.text())),
        "ends_with" => Some(actual.text().ends_with(&expected.text())),
        "inside" => location_contains(actual, expected),
        "outside" => location_contains(actual, expected).map(|inside| !inside),
        "distance_lt" | "distance_gt" => {
            let distance = get(actual.json(), "distance").filter(|distance| !distance.is_null());
            let distance = distance.map_or_else(|| actual.clone(), |d| Js::borrowed(Some(d)));
            let order = ordered(&distance, expected, "number")?;
            Some(order == if id == "distance_lt" { Less } else { Greater })
        }
        "exists" => Some(!actual.nullish()),
        "not_exists" => Some(actual.nullish()),
        // Every operator of the table is matched above.
        _ => None,
    }
}
