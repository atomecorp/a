// Every list of eVe seen as one list to send (atome/src/shared/list_share_contract.js, the parts
// the server reads, ported): a list root, its kind, its name, the person it is kept for and its
// entries, each existing model read as it is; the version a recipient is offered and what changed
// since the one they validated; the copy a recipient keeps and its id.
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::{HashMap, HashSet};

pub const LIST_RECEIPT_ATOME_TYPE: &str = "list_receipt";
const ITEM_LIST_ATOME_TYPE: &str = "item_list";
const ITEM_LIST_KINDS: [&str; 3] = ["medications", "supplements", "atome_list"];

// `a || b`.
fn or(value: Option<&JsonValue>, default: JsonValue) -> JsonValue {
    value
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(default)
}

// `typeof value === 'string' ? value.trim() : ''`.
fn text(value: Option<&JsonValue>) -> String {
    match value {
        Some(JsonValue::String(text)) => js::trim(text).to_string(),
        _ => String::new(),
    }
}

// `text(a) || fallback`.
fn label(value: Option<&JsonValue>, fallback: JsonValue) -> JsonValue {
    let label = text(value);
    if label.is_empty() {
        fallback
    } else {
        json!(label)
    }
}

pub fn properties(state: &JsonValue) -> &JsonValue {
    state
        .get("properties")
        .filter(|value| js::truthy(Some(value)))
        .or_else(|| {
            state
                .get("particles")
                .filter(|value| js::truthy(Some(value)))
        })
        .unwrap_or(&JsonValue::Null)
}

pub fn type_of(state: &JsonValue) -> String {
    js::first(state, &["type", "atome_type"])
        .or_else(|| properties(state).get("type"))
        .filter(|value| js::truthy(Some(value)))
        .map(js::string)
        .unwrap_or_default()
}

pub fn state_id(state: &JsonValue) -> String {
    js::first(state, &["atome_id", "atomeId", "id"])
        .map(js::string)
        .unwrap_or_default()
}

pub fn state_parent(state: &JsonValue) -> String {
    let props = properties(state);
    state
        .get("meta")
        .and_then(|meta| meta.get("parent_id"))
        .filter(|value| js::truthy(Some(value)))
        .or_else(|| {
            state
                .get("parent_id")
                .filter(|value| js::truthy(Some(value)))
        })
        .or_else(|| js::first(props, &["parent_id", "list_root"]))
        .map(js::string)
        .unwrap_or_default()
}

fn live(state: &JsonValue) -> bool {
    !js::truthy(state.get("deleted"))
        && !js::truthy(state.get("deleted_at"))
        && !js::truthy(state.get("meta").and_then(|meta| meta.get("deleted_at")))
        && state.get("kind") != Some(&json!("delete"))
}

/// `listKindOf`: the list kind of a root, `None` for an atome that is no list.
pub fn kind_of(root: &JsonValue) -> Option<&'static str> {
    let props = properties(root);
    match type_of(root).as_str() {
        ITEM_LIST_ATOME_TYPE => {
            let kind = props.get("list_kind").and_then(JsonValue::as_str)?;
            ITEM_LIST_KINDS
                .iter()
                .find(|known| **known == kind)
                .copied()
        }
        "media_list" => Some("playlist"),
        "shopping_list" => Some("shopping"),
        "protocol_template" => Some("protocol"),
        "project"
            if js::truthy(props.get("project_program"))
                && matches!(
                    props.get("project_program"),
                    Some(JsonValue::Object(_) | JsonValue::Array(_))
                ) =>
        {
            Some("programme")
        }
        _ => None,
    }
}

fn entry(key: JsonValue, label: JsonValue, data: JsonValue) -> JsonValue {
    json!({ "key": key, "label": label, "data": data })
}

fn child_entry(state: &JsonValue) -> JsonValue {
    let props = properties(state);
    let id = json!(state_id(state));
    match type_of(state).as_str() {
        "health_product" => {
            let product = or(props.get("health_product"), json!({}));
            let hours = match product.get("hours") {
                Some(JsonValue::Array(hours)) => JsonValue::Array(hours.clone()),
                _ => json!([]),
            };
            entry(
                id.clone(),
                label(product.get("name"), id),
                json!({ "item_kind": or(product.get("item_kind"), json!("")), "form": or(product.get("form"), json!("")),
                    "per_intake": or(product.get("per_intake"), JsonValue::Null), "hours": hours,
                    "status": or(product.get("status"), json!("")) }),
            )
        }
        "shopping_item" => entry(
            id.clone(),
            label(props.get("label"), id),
            json!({ "category": or(props.get("category"), json!("")), "quantity": or(props.get("quantity"), JsonValue::Null) }),
        ),
        kind => {
            let named = [props.get("name"), props.get("label"), props.get("title")]
                .into_iter()
                .map(text)
                .find(|name| !name.is_empty());
            entry(
                id.clone(),
                named.map_or(id, |name| json!(name)),
                json!({ "type": kind }),
            )
        }
    }
}

fn children<'a>(root_id: &str, states: &'a [JsonValue]) -> Vec<&'a JsonValue> {
    states
        .iter()
        .filter(|state| live(state) && state_id(state) != root_id && state_parent(state) == root_id)
        .filter(|state| {
            type_of(state) != "health_product"
                || properties(state)
                    .get("health_product")
                    .and_then(|product| product.get("status"))
                    != Some(&json!("declared_historical"))
        })
        .collect()
}

fn items(value: Option<&JsonValue>) -> &[JsonValue] {
    value
        .and_then(JsonValue::as_array)
        .map_or(&[], Vec::as_slice)
}

// A programme's plan: its bricks, then the actions it accepted (else proposes).
fn program_entries(program: &JsonValue) -> Vec<JsonValue> {
    let accepted = program
        .get("accepted")
        .and_then(|accepted| accepted.get("actions"))
        .filter(|actions| js::truthy(Some(actions)));
    let actions = items(accepted.or_else(|| program.get("actions")));
    let bricks = items(program.get("bricks")).iter().map(|brick| {
        entry(
            json!(format!("brick:{}", js::text(Some(brick)))),
            brick.clone(),
            json!({ "brick": brick }),
        )
    });
    let actions = actions.iter().map(|action| {
        let key = action.get("key");
        let mut fields = JsonMap::new();
        fields.insert("key".into(), json!(format!("action:{}", js::text(key))));
        let title = text(action.get("title"));
        // `text(title) || action.key`: an absent key leaves the label out.
        match (title.is_empty(), key) {
            (false, _) => {
                fields.insert("label".into(), json!(title));
            }
            (true, Some(key)) => {
                fields.insert("label".into(), key.clone());
            }
            (true, None) => {}
        }
        fields.insert(
            "data".into(),
            json!({ "tool": or(action.get("tool"), json!("")), "start": or(action.get("start"), json!("")),
                "end": or(action.get("end"), json!("")) }),
        );
        JsonValue::Object(fields)
    });
    bricks.chain(actions).collect()
}

/// `listViewOf(root, states)`: `{ kind, root_id, version, name, …, entries }`, `None` for no list.
pub fn view_of(root: &JsonValue, states: &[JsonValue]) -> Option<JsonValue> {
    let kind = kind_of(root)?;
    let props = properties(root);
    let id = state_id(root);
    let version = match props.get("version") {
        Some(JsonValue::Number(number))
            if number.as_f64().is_some_and(|n| n.fract() == 0.0 && n > 0.0) =>
        {
            JsonValue::Number(number.clone())
        }
        _ => JsonValue::Null,
    };
    let mut view = JsonMap::new();
    view.insert("kind".into(), json!(kind));
    view.insert("root_id".into(), json!(id));
    view.insert("version".into(), version);
    let entries: Vec<JsonValue> = match kind {
        "playlist" => {
            view.insert("name".into(), json!(text(props.get("name"))));
            items(props.get("entries"))
                .iter()
                .map(|item| {
                    let key = json!(js::text(item.get("id")));
                    entry(
                        key.clone(),
                        label(item.get("label"), key),
                        json!({ "media": or(item.get("media"), json!("")), "detail": or(item.get("detail"), json!("")),
                            "duration": js::number_json(js::number_or(item.get("duration"), 0.0)) }),
                    )
                })
                .collect()
        }
        "protocol" => {
            view.insert("name".into(), json!(text(props.get("title"))));
            items(props.get("lines"))
                .iter()
                .filter(|line| js::truthy(line.get("include")))
                .map(|line| {
                    let key = json!(js::text(line.get("ref")));
                    entry(
                        key.clone(),
                        label(line.get("label"), key),
                        json!({ "section": or(line.get("section"), json!("")) }),
                    )
                })
                .collect()
        }
        "programme" => {
            let program = &props["project_program"];
            let name = [
                text(props.get("name")),
                text(
                    program
                        .get("definition")
                        .and_then(|definition| definition.get("name")),
                ),
            ]
            .into_iter()
            .find(|name| !name.is_empty())
            .unwrap_or_else(|| id.clone());
            view.insert("name".into(), json!(name));
            program_entries(program)
        }
        "shopping" => {
            view.insert("name".into(), json!(text(props.get("name"))));
            children(&id, states).into_iter().map(child_entry).collect()
        }
        _ => {
            view.insert("name".into(), json!(text(props.get("name"))));
            view.insert(
                "for_person".into(),
                or(props.get("for_person"), JsonValue::Null),
            );
            let sealed = props
                .get("sealed")
                .filter(|sealed| js::truthy(Some(sealed)));
            // A sealed list shows one line only, the keyed name of its lines.
            if let Some(sealed) = sealed {
                view.insert("draft".into(), json!(false));
                view.insert("sealed".into(), sealed.clone());
                vec![json!({ "key": "sealed", "label": js::text(props.get("sealed_digest")) })]
            } else {
                let draft = props.get("draft") == Some(&json!(true));
                view.insert("draft".into(), json!(draft));
                if draft {
                    items(props.get("entries")).to_vec()
                } else {
                    children(&id, states).into_iter().map(child_entry).collect()
                }
            }
        }
    };
    view.insert("entries".into(), JsonValue::Array(entries));
    Some(JsonValue::Object(view))
}

// `JSON.stringify([entry.label, entry.data || {}])`.
fn signature(entry: &JsonValue) -> String {
    json!([
        entry.get("label").cloned().unwrap_or(JsonValue::Null),
        or(entry.get("data"), json!({}))
    ])
    .to_string()
}

fn key_of(entry: &JsonValue) -> String {
    entry
        .get("key")
        .map_or_else(|| "undefined".into(), JsonValue::to_string)
}

pub fn same_entries(a: &[JsonValue], b: &[JsonValue]) -> bool {
    a.len() == b.len()
        && a.iter().zip(b).all(|(left, right)| {
            left.get("key") == right.get("key") && signature(left) == signature(right)
        })
}

/// `listVersionOf(view, receipt)`: the root's own version, else the one validated, plus one when
/// the list changed since; 1 before any validation.
pub fn version_of(view: &JsonValue, receipt: Option<&JsonValue>) -> JsonValue {
    if js::truthy(view.get("version")) {
        return view["version"].clone();
    }
    let Some(receipt) = receipt else {
        return json!(1);
    };
    let accepted = receipt.get("accepted_version");
    if same_entries(items(receipt.get("entries")), items(view.get("entries"))) {
        return accepted.cloned().unwrap_or(JsonValue::Null);
    }
    let next = js::number(accepted) + 1.0;
    if next.is_nan() {
        JsonValue::Null
    } else {
        js::number_json(next)
    }
}

/// `listDiff(accepted, current)`: each entry marked `added`, or `changed` with what it was, and the
/// ones `removed`.
pub fn diff(accepted: &[JsonValue], current: &[JsonValue]) -> (Vec<JsonValue>, Vec<JsonValue>) {
    let before: HashMap<String, &JsonValue> = accepted
        .iter()
        .map(|entry| (key_of(entry), entry))
        .collect();
    let now: HashSet<String> = current.iter().map(key_of).collect();
    let entries = current
        .iter()
        .map(|entry| match before.get(&key_of(entry)) {
            None => js::with(entry, [("added", json!(true))]),
            Some(previous) if signature(previous) == signature(entry) => entry.clone(),
            Some(previous) => js::with(
                entry,
                [("changed", json!(true)), ("before", (*previous).clone())],
            ),
        })
        .collect();
    let removed = accepted
        .iter()
        .filter(|entry| !now.contains(&key_of(entry)))
        .cloned()
        .collect();
    (entries, removed)
}

/// `listCopyIdOf(state, recipient, fresh)`: a copy's id by its domain's id rule.
pub fn copy_id_of(state: &JsonValue, recipient: &str, fresh: &str) -> String {
    match type_of(state).as_str() {
        "health_product" => format!(
            "health_product:{}:{fresh}",
            crate::http::uri::encode_uri_component(recipient)
        ),
        "shopping_list" => format!("shopping_list_{recipient}"),
        "protocol_template" => format!("protocol_template:{recipient}:{fresh}"),
        kind => format!("{kind}_{fresh}"),
    }
}

/// `listCopyPropsOf(state, { fresh, recipient, root })`: the source's properties minus what only
/// means something in the sender's account; `root` the copied list's `(copy_id, for_person)`.
pub fn copy_props_of(
    state: &JsonValue,
    fresh: &str,
    recipient: &str,
    root: Option<&(String, JsonValue)>,
) -> JsonMap<String, JsonValue> {
    let mut props = properties(state).as_object().cloned().unwrap_or_default();
    for key in [
        "owner_id",
        "type",
        "parent_id",
        "list_root",
        "list_link",
        "detached_from",
        "detached_share_id",
        "revision",
    ] {
        props.shift_remove(key);
    }
    match type_of(state).as_str() {
        "health_product" => {
            let mut product = props
                .get("health_product")
                .and_then(JsonValue::as_object)
                .cloned()
                .unwrap_or_default();
            product.insert("reminder".into(), json!(false));
            product.insert("calendar".into(), json!([]));
            let list = root
                .filter(|(_, person)| js::truthy(Some(person)))
                .map_or(JsonValue::Null, |(copy, _)| json!(copy));
            product.insert("list_id".into(), list);
            product.insert("person_id".into(), json!(""));
            props.insert("product_id".into(), json!(fresh));
            props.insert("health_product".into(), JsonValue::Object(product));
        }
        "project" if js::truthy(props.get("project_program")) => {
            let mut program = props["project_program"]
                .as_object()
                .cloned()
                .unwrap_or_default();
            program.insert("status".into(), json!("draft"));
            program.insert("accepted".into(), JsonValue::Null);
            props.insert("project_program".into(), JsonValue::Object(program));
        }
        ITEM_LIST_ATOME_TYPE
            if props
                .get("for_person")
                .and_then(|person| person.get("account_id"))
                == Some(&json!(recipient)) =>
        {
            props.shift_remove("for_person");
        }
        _ => {}
    }
    props
}
