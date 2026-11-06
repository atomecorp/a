// The computed properties (atome/src/squirrel/conditions/computed_properties.js and
// computed_expression.js): a person's `condition_computed_property` atomes registered as
// `computed.<id>`, each an expression of literals, other properties and safe calls, evaluated
// on the context of the candidate it is read on.
use super::engine::{Context, Resolved, Thrown, resolve};
use super::registry::{Registration, Registry, Resolve};
use super::values::{Js, get, or_chain, plain_text};
use crate::vault_router::js;
use serde_json::Value as JsonValue;
use std::borrow::Cow;

const MAX_EXPRESSION_DEPTH: usize = 20;

/// A computed property as `normalizeComputedProperty` keeps what the engine reads of it.
pub(super) struct Definition {
    pub(super) id: String,
    pub(super) expression: JsonValue,
}

// `normalizeComputedProperty` of `fromState(state)`, `None` for a state of another type.
fn from_state(state: &JsonValue) -> Result<Option<(Definition, Registration)>, String> {
    let props = or_chain(&[get(Some(state), "properties"), get(Some(state), "props")]);
    let props = Some(
        props
            .filter(|props| js::truthy(Some(props)))
            .unwrap_or(&JsonValue::Null),
    );
    let kind = or_chain(&[
        get(Some(state), "type"),
        get(Some(state), "atome_type"),
        get(props, "type"),
    ]);
    if kind != Some(&JsonValue::String("condition_computed_property".into())) {
        return Ok(None);
    }
    let id = plain_text(js::first(state, &["id", "atome_id"]));
    let name = plain_text(get(props, "name"));
    let result_type = match get(props, "result_type") {
        Some(kind) if js::truthy(Some(kind)) => plain_text(Some(kind)).to_lowercase(),
        _ => "any".into(),
    };
    if id.is_empty() {
        return Err("condition_computed_property_id_required".into());
    }
    if name.is_empty() {
        return Err("condition_computed_property_name_required".into());
    }
    let expression = get(props, "expression").filter(|expression| expression.is_object());
    let Some(expression) = expression else {
        return Err("condition_computed_property_expression_required".into());
    };
    super::query::normalize_scope(get(props, "scope"))?;
    let unit = Some(plain_text(get(props, "unit"))).filter(|unit| !unit.is_empty());
    let mut dependencies = Vec::new();
    collect_dependencies(expression, &mut dependencies, 0);
    let kind = Some(result_type)
        .filter(|kind| !kind.is_empty())
        .unwrap_or("any".into());
    let registration = Registration {
        source: "computed".into(),
        field: id.clone(),
        operators: Vec::new(),
        kind,
        label: name,
        group: Some("computed".into()),
        unit,
        dependencies,
        resolve: None,
    };
    Ok(Some((
        Definition {
            id,
            expression: expression.clone(),
        },
        registration,
    )))
}

/// `computedProperties.hydrate()` of the person's states: each computed property registered in
/// turn; `Err` is the first that does not normalise, those before it staying registered.
pub(super) fn hydrate(registry: &mut Registry, rows: &[JsonValue]) -> Result<(), String> {
    for row in rows {
        if let Some((definition, mut registration)) = from_state(row)? {
            registration.resolve = Some(Resolve::Computed(registry.definitions.len()));
            registry.definitions.push(definition);
            registry.register(registration);
        }
    }
    Ok(())
}

// `collectComputedDependencies`.
fn collect_dependencies(expression: &JsonValue, out: &mut Vec<String>, depth: usize) {
    if !expression.is_object() || depth > MAX_EXPRESSION_DEPTH {
        return;
    }
    if get(Some(expression), "kind") == Some(&JsonValue::String("property".into())) {
        let source = plain_or_empty(get(Some(expression), "source"));
        let field = plain_or_empty(get(Some(expression), "field"));
        let dependency = format!("{source}.{field}");
        if !source.is_empty() && !field.is_empty() && !out.contains(&dependency) {
            out.push(dependency);
        }
    }
    if let Some(JsonValue::Array(args)) = get(Some(expression), "args") {
        args.iter()
            .for_each(|arg| collect_dependencies(arg, out, depth + 1));
    }
}

// `String(value || '').trim()`.
fn plain_or_empty(value: Option<&JsonValue>) -> String {
    js::trim(&super::values::key_text(value)).to_string()
}

fn kind_is(expression: &JsonValue, kind: &str) -> bool {
    get(Some(expression), "kind").and_then(JsonValue::as_str) == Some(kind)
}

/// `evaluateComputedExpression(expression, context, registry, depth)`.
pub(super) fn evaluate<'a>(
    registry: &'a Registry,
    expression: &'a JsonValue,
    context: &Context<'a>,
    depth: usize,
    stack: &mut Vec<String>,
) -> Result<Resolved<'a>, Thrown> {
    if depth > MAX_EXPRESSION_DEPTH {
        return Ok(Resolved::unavailable());
    }
    if kind_is(expression, "literal") {
        return Ok(Resolved {
            available: true,
            value: Js::borrowed(get(Some(expression), "value")),
        });
    }
    if kind_is(expression, "property") {
        let at = |key: &str| get(Some(expression), key);
        let property = registry
            .property(at("source"), at("field"), expression)
            .map_err(|_| Thrown)?;
        return match property {
            Some(property) => resolve(registry, &property, context, stack),
            None => Ok(Resolved::unavailable()),
        };
    }
    if !kind_is(expression, "call") {
        return Ok(Resolved::unavailable());
    }
    let args = match get(Some(expression), "args") {
        Some(JsonValue::Array(args)) => args.as_slice(),
        // `(expression.args || []).map` throws on any other truthy value.
        args if js::truthy(args) => return Err(Thrown),
        _ => &[],
    };
    let mut evaluated = Vec::with_capacity(args.len());
    for arg in args {
        evaluated.push(evaluate(registry, arg, context, depth + 1, stack)?);
    }
    let operator = get(Some(expression), "operator");
    if operator == Some(&JsonValue::String("coalesce".into())) {
        let first = evaluated
            .into_iter()
            .find(|entry| entry.available && !entry.value.nullish());
        return Ok(first.unwrap_or_else(Resolved::unavailable));
    }
    if let Some(missing) = evaluated.iter().position(|entry| !entry.available) {
        return Ok(evaluated.swap_remove(missing));
    }
    let values: Vec<Js<'a>> = evaluated.into_iter().map(|entry| entry.value).collect();
    let unit = get(Some(expression), "unit");
    Ok(match apply_call(&js::text(operator), &values, unit) {
        Some(value) => Resolved {
            available: true,
            value,
        },
        None => Resolved::unavailable(),
    })
}

// `finite(value)`.
fn finite(value: Option<&Js>) -> Option<f64> {
    let number = value.map_or(f64::NAN, Js::to_number);
    number.is_finite().then_some(number)
}

// `Math.round`: half up, toward positive infinity.
fn round(number: f64) -> f64 {
    let floor = number.floor();
    let rounded = if number - floor >= 0.5 {
        floor + 1.0
    } else {
        floor
    };
    if rounded == 0.0 && number.is_sign_negative() {
        -0.0
    } else {
        rounded
    }
}

// `Math.min` and `Math.max`, where -0 is below +0.
fn extreme(values: &[Js], below: bool) -> Option<f64> {
    let mut best = if below {
        f64::INFINITY
    } else {
        f64::NEG_INFINITY
    };
    for value in values {
        let number = finite(Some(value))?;
        let replaces = if below {
            number < best || (number == best && number.is_sign_negative())
        } else {
            number > best || (number == best && best.is_sign_negative())
        };
        if replaces {
            best = number;
        }
    }
    Some(best)
}

fn point(value: Option<&Js>) -> Option<(f64, f64)> {
    let object = value.and_then(Js::json);
    let at = |keys: &[&str]| {
        let found = keys.iter().map(|key| get(object, key)).collect::<Vec<_>>();
        Js::borrowed(super::values::coalesce(&found)).to_number()
    };
    let (latitude, longitude) = (at(&["latitude", "lat"]), at(&["longitude", "lng", "lon"]));
    (latitude.is_finite() && longitude.is_finite()).then_some((latitude, longitude))
}

fn distance_km(left: Option<&Js>, right: Option<&Js>) -> Option<f64> {
    let (left, right) = (point(left)?, point(right)?);
    let radians = |degrees: f64| degrees * (std::f64::consts::PI / 180.0);
    let latitude_delta = radians(right.0 - left.0);
    let longitude_delta = radians(right.1 - left.1);
    let a = (latitude_delta / 2.0).sin().powi(2)
        + radians(left.0).cos() * radians(right.0).cos() * (longitude_delta / 2.0).sin().powi(2);
    Some(6371.0 * 2.0 * a.sqrt().atan2((1.0 - a).sqrt()))
}

fn date_difference(left: Option<&Js>, right: Option<&Js>, unit: Option<&JsonValue>) -> Option<f64> {
    let time = |value: Option<&Js>| value.and_then(Js::time).unwrap_or(f64::NAN);
    let delta = time(left) - time(right);
    if !delta.is_finite() {
        return None;
    }
    let unit = if js::truthy(unit) {
        js::text(unit)
    } else {
        "milliseconds".into()
    };
    let divisor = match unit.as_str() {
        "milliseconds" => 1.0,
        "seconds" => 1000.0,
        "minutes" => 60000.0,
        "hours" => 3_600_000.0,
        "days" => 86_400_000.0,
        "years" => 31_557_600_000.0,
        _ => return None,
    };
    Some(delta / divisor)
}

// `values[0]?.length ?? String(values[0] ?? '').length`.
fn length<'a>(value: Option<&Js<'a>>) -> Js<'a> {
    let own = match value.and_then(Js::json) {
        Some(JsonValue::String(text)) => Some(Js::Num(text.encode_utf16().count() as f64)),
        Some(JsonValue::Array(items)) => Some(Js::Num(items.len() as f64)),
        Some(JsonValue::Object(map)) => map
            .get("length")
            .filter(|length| !length.is_null())
            .map(|length| Js::Json(Cow::Owned(length.clone()))),
        _ => None,
    };
    own.unwrap_or_else(|| {
        let text = value
            .filter(|value| !value.nullish())
            .map_or(String::new(), Js::text);
        Js::Num(text.encode_utf16().count() as f64)
    })
}

// `applyCall(operator, values, node)`; `None` is what it throws.
fn apply_call<'a>(operator: &str, values: &[Js<'a>], unit: Option<&JsonValue>) -> Option<Js<'a>> {
    let first = values.first();
    let second = values.get(1);
    let number = |n: f64| Some(Js::Num(n));
    match operator {
        "add" => values
            .iter()
            .try_fold(0.0, |sum, value| Some(sum + finite(Some(value))?))
            .and_then(number),
        "subtract" => number(finite(first)? - finite(second)?),
        "multiply" => values
            .iter()
            .try_fold(1.0, |product, value| Some(product * finite(Some(value))?))
            .and_then(number),
        "divide" => {
            let divisor = finite(second)?;
            if divisor == 0.0 {
                return None;
            }
            number(finite(first)? / divisor)
        }
        "min" => number(extreme(values, true)?),
        "max" => number(extreme(values, false)?),
        "abs" => number(finite(first)?.abs()),
        "round" => number(round(finite(first)?)),
        "length" => Some(length(first)),
        "lower" => Some(Js::Json(Cow::Owned(
            first
                .map_or("undefined".into(), Js::text)
                .to_lowercase()
                .into(),
        ))),
        "upper" => Some(Js::Json(Cow::Owned(
            first
                .map_or("undefined".into(), Js::text)
                .to_uppercase()
                .into(),
        ))),
        "date_diff" => number(date_difference(first, second, unit)?),
        "distance" => number(distance_km(first, second)?),
        _ => None,
    }
}
