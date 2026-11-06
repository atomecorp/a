// `conditions.once` on the server (query.js `once` behind conditionsQueryAuthority.js): the
// condition set (inline, or a `condition_set` atome by its id), the candidates of the scope, the
// properties discovered on them, each candidate's match, then the order, the page and the
// projection the reply carries.
use super::computed;
use super::discovery;
use super::engine::{self, Context, State};
use super::registry::Registry;
use super::values::{Js, get, less, object_is, or_chain, own, parse_int, plain_text};
use super::{States, load};
use crate::mail::index::collate;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::cmp::Ordering;

/// `normalizeConditionScope`, of what the server reads of it.
pub(super) struct Scope {
    pub(super) candidate_source: String,
    pub(super) project_id: Option<JsonValue>,
    pub(super) types: Vec<String>,
    pub(super) include_shared: bool,
}

pub(super) fn normalize_scope(input: Option<&JsonValue>) -> Result<Scope, String> {
    let empty = JsonValue::Object(JsonMap::new());
    let input = input
        .filter(|input| js::truthy(Some(input)))
        .unwrap_or(&empty);
    if !input.is_object() {
        return Err("condition_scope_invalid".into());
    }
    let at = |key: &str| get(Some(input), key);
    let source = js::first(input, &["candidateSource", "candidate_source"]);
    let candidate_source = match source {
        Some(source) => plain_text(Some(source)).to_lowercase(),
        None => "atome".into(),
    };
    if candidate_source.is_empty() {
        return Err("condition_scope_candidate_source_required".into());
    }
    let project_id = Some(plain_text(or_chain(&[at("projectId"), at("project_id")])))
        .filter(|id| !id.is_empty())
        .map(JsonValue::String);
    let mut types: Vec<String> = Vec::new();
    for entry in at("types")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
    {
        let entry = plain_text(Some(entry));
        if !entry.is_empty() && !types.contains(&entry) {
            types.push(entry);
        }
    }
    Ok(Scope {
        candidate_source,
        project_id,
        types: types.iter().map(|entry| entry.to_lowercase()).collect(),
        include_shared: [at("includeShared"), at("include_shared")]
            .contains(&Some(&JsonValue::Bool(true))),
    })
}

// `normalizeId(candidate.id || candidate.atome_id || candidate.atomeId)`.
fn candidate_id(item: &JsonValue) -> String {
    let at = |key: &str| get(Some(item), key);
    plain_text(or_chain(&[at("id"), at("atome_id"), at("atomeId")]))
}

// `service.sets.get(id)`: the `condition_set` atome as `{ root }`, `None` for another.
async fn condition_set(states: &impl States, id: &str) -> Result<Option<JsonValue>, String> {
    let state = states.get(id).await?;
    if !js::truthy(Some(&state)) {
        return Ok(None);
    }
    let props = or_chain(&[get(Some(&state), "properties"), get(Some(&state), "props")]);
    let props = props.filter(|props| js::truthy(Some(props)));
    let kind = or_chain(&[
        get(Some(&state), "type"),
        get(Some(&state), "atome_type"),
        get(props, "type"),
    ]);
    if kind != Some(&JsonValue::String("condition_set".into())) {
        return Ok(None);
    }
    if let Some(version) = get(props, "schema_version")
        && js::number(Some(version)) != 1.0
    {
        return Err("condition_schema_version_unsupported".into());
    }
    if js::trim(id).is_empty() {
        return Err("condition_set_id_required".into());
    }
    if js::trim(&super::values::key_text(get(props, "name"))).is_empty() {
        return Err("condition_set_name_required".into());
    }
    Ok(Some(json!({ "root": get(props, "root") })))
}

// `item[a][b]…` of a sort's field, `field.split('.').reduce((value, key) => value?.[key], item)`.
fn sort_value<'a>(item: &'a JsonValue, field: &str) -> Js<'a> {
    let mut current = Some(std::borrow::Cow::Borrowed(item));
    for key in field.split('.') {
        current = match current {
            Some(std::borrow::Cow::Borrowed(value)) => own(value, key),
            Some(std::borrow::Cow::Owned(value)) => {
                own(&value, key).map(|v| std::borrow::Cow::Owned(v.into_owned()))
            }
            None => None,
        };
    }
    Js::from_slot(current)
}

// `applySort`'s comparator.
fn compare(a: &Js, b: &Js, descending: bool) -> Ordering {
    if object_is(a, b) {
        return Ordering::Equal;
    }
    if a.nullish() {
        return Ordering::Greater;
    }
    if b.nullish() {
        return Ordering::Less;
    }
    let order = match a.json().and_then(JsonValue::as_str) {
        Some(text) => collate(text, &b.text()),
        None if less(a, b) => Ordering::Less,
        None => Ordering::Greater,
    };
    if descending { order.reverse() } else { order }
}

// A stable merge sort that, unlike the standard library's, accepts the comparator `applySort`
// may make inconsistent (two values of different types), as `Array.prototype.sort` does.
fn merge_sort(keys: &mut Vec<usize>, mut ordered: impl FnMut(usize, usize) -> Ordering) {
    let mut width = 1;
    while width < keys.len() {
        let mut merged = Vec::with_capacity(keys.len());
        for start in (0..keys.len()).step_by(2 * width) {
            let middle = (start + width).min(keys.len());
            let end = (start + 2 * width).min(keys.len());
            let (mut left, mut right) = (start, middle);
            while left < middle && right < end {
                if ordered(keys[right], keys[left]) == Ordering::Less {
                    merged.push(keys[right]);
                    right += 1;
                } else {
                    merged.push(keys[left]);
                    left += 1;
                }
            }
            merged.extend_from_slice(&keys[left..middle]);
            merged.extend_from_slice(&keys[right..end]);
        }
        *keys = merged;
        width *= 2;
    }
}

fn apply_sort<'a>(
    items: Vec<&'a JsonValue>,
    sort: Option<&JsonValue>,
) -> Result<Vec<&'a JsonValue>, String> {
    if sort == Some(&JsonValue::Null) {
        return Err("Cannot read properties of null (reading 'field')".into());
    }
    let field = js::trim(&super::values::key_text(or_chain(&[
        get(sort, "field"),
        get(sort, "key"),
    ])))
    .to_string();
    if field.is_empty() {
        return Ok(items);
    }
    let descending = get(sort, "direction") == Some(&JsonValue::String("desc".into()));
    let values: Vec<Js> = items.iter().map(|item| sort_value(item, &field)).collect();
    let mut order: Vec<usize> = (0..items.len()).collect();
    merge_sort(&mut order, |a, b| {
        compare(&values[a], &values[b], descending)
    });
    Ok(order.into_iter().map(|index| items[index]).collect())
}

// query.js `projectItem`, then the authority's `projectedItem` of what it made.
fn projected(item: &JsonValue, fields: &[String]) -> JsonValue {
    let projected = if fields.is_empty() {
        item.clone()
    } else {
        let empty = JsonValue::Object(JsonMap::new());
        let properties = or_chain(&[
            get(Some(item), "properties"),
            get(Some(item), "props"),
            Some(item),
        ])
        .filter(|properties| js::truthy(Some(properties)))
        .unwrap_or(&empty);
        let kind = or_chain(&[
            get(Some(item), "type"),
            get(Some(item), "atome_type"),
            get(Some(properties), "type"),
        ]);
        let kept: JsonMap<String, JsonValue> = fields
            .iter()
            .filter_map(|field| Some((field.clone(), own(properties, field)?.into_owned())))
            .collect();
        json!({
            "id": candidate_id(item),
            "type": kind.filter(|kind| js::truthy(Some(kind))).cloned().unwrap_or(JsonValue::Null),
            "properties": kept,
        })
    };
    let id = js::trim(&super::values::key_text(js::first(
        &projected,
        &["id", "atome_id", "atomeId"],
    )))
    .to_string();
    let kind = js::first(&projected, &["type", "atome_type"])
        .or_else(|| {
            get(get(Some(&projected), "properties"), "type").filter(|kind| js::truthy(Some(kind)))
        })
        .cloned()
        .unwrap_or(JsonValue::Null);
    let mut reply = json!({ "id": id, "atome_id": id, "type": kind });
    if !fields.is_empty() {
        let properties: JsonMap<String, JsonValue> = fields
            .iter()
            .filter_map(|field| {
                let value = super::catalog::resolve_candidate_path(&projected, field)??;
                Some((field.clone(), value.into_owned()))
            })
            .collect();
        reply["properties"] = JsonValue::Object(properties);
    }
    reply
}

/// The authority's `once(request)`.
pub(super) async fn once(
    states: &impl States,
    principal: &str,
    request: &JsonValue,
) -> Result<JsonValue, String> {
    let condition = match js::first(request, &["conditionSet", "condition", "root"]) {
        Some(condition) => condition.clone(),
        None => match js::first(request, &["conditionSetId", "condition_set_id"]) {
            Some(id) => condition_set(states, &js::text(Some(id))).await?,
            None => None,
        }
        .ok_or_else(|| "condition_query_condition_required".to_string())?,
    };
    let scope = normalize_scope(get(Some(request), "scope"))?;
    let candidates = match get(Some(request), "items") {
        Some(JsonValue::Array(items)) => items.clone(),
        _ if js::truthy(get(Some(request), "loadCandidates")) => {
            return Err("condition_query_candidates_unavailable".into());
        }
        _ => {
            let (project, types) = (scope.project_id.as_ref(), json!(scope.types));
            load(
                states,
                principal,
                project,
                scope.include_shared,
                Some(&types),
                request,
            )
            .await?
        }
    };
    let mut registry = Registry::default();
    computed::hydrate(
        &mut registry,
        &super::computed_rows(states, principal).await?,
    )?;
    let preferred = get(Some(request), "preferredProperties").filter(|p| js::truthy(Some(p)));
    let source = JsonValue::String(scope.candidate_source.clone());
    for entry in discovery::discover(&registry, &candidates, &source, "", preferred)? {
        entry.register(&mut registry);
    }
    let root = get(Some(&condition), "root")
        .filter(|root| js::truthy(Some(root)))
        .unwrap_or(&condition);
    let tree = if candidates.is_empty() {
        None
    } else {
        let tree = engine::compile(&registry, root)?;
        engine::check_dependencies(&registry, root)?;
        tree
    };
    let extra = get(Some(request), "context").and_then(JsonValue::as_object);
    let now = chrono::Utc::now().timestamp_millis() as f64;
    let mut matched = Vec::new();
    for item in &candidates {
        let subject = JsonValue::String(candidate_id(item));
        let context = Context {
            source: &scope.candidate_source,
            item,
            subject: &subject,
            extra,
            now,
        };
        if tree
            .as_ref()
            .is_some_and(|tree| engine::evaluate(&registry, tree, &context) == State::True)
        {
            matched.push(item);
        }
    }
    let matched = apply_sort(matched, get(Some(request), "sort"))?;
    let offset = parse_int(get(Some(request), "cursor"))
        .filter(|n| *n > 0)
        .unwrap_or(0) as usize;
    let limit = parse_int(get(Some(request), "limit"))
        .filter(|n| *n != 0)
        .map_or(matched.len().max(1), |n| n.max(1) as usize);
    let page: Vec<&JsonValue> = matched.iter().skip(offset).take(limit).copied().collect();
    let fields: Vec<String> = get(Some(request), "projection")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(|field| js::text(Some(field)))
        .filter(|field| !field.is_empty())
        .collect();
    let end = offset + page.len();
    Ok(json!({
        "items": page.iter().map(|item| projected(item, &fields)).collect::<Vec<_>>(),
        "ids": page.iter().map(|item| candidate_id(item)).collect::<Vec<_>>(),
        "total": matched.len(),
        "cursor": (end < matched.len()).then(|| end.to_string()),
        "revision": 1,
    }))
}
