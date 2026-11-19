//! The document as a script sees it: `doc.cells()`, `doc.cell(name)`, `doc.text()`, `doc.set(name, value)`,
//! `doc.log(...items)`, native functions over a copy of its snapshot. What the script proposes to write and log is
//! kept here, in Rust, out of the script's reach; the main thread checks it again (script_sandbox.js#readResult).
use std::cell::RefCell;

use boa_engine::object::ObjectInitializer;
use boa_engine::property::Attribute;
use boa_engine::{Context, JsNativeError, JsResult, JsString, JsValue, NativeFunction, js_string};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// One cell of the snapshot (script_sandbox.js#scriptSnapshot): `value` a number for a numeric cell, else its text.
#[derive(Deserialize)]
pub struct Cell {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub role: String,
    pub value: Value,
    #[serde(default)]
    pub text: String,
}

#[derive(Deserialize)]
pub struct Snapshot {
    pub text: String,
    pub cells: Vec<Cell>,
}

/// The caps of one run (script_sandbox.js `SCRIPT_LIMITS`), lengths counted in UTF-16 units as in JavaScript.
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub writes: usize,
    pub value_chars: usize,
    pub log_lines: usize,
    pub log_chars: usize,
    pub result_chars: usize,
}

/// A proposed write: the cell's id or label, `number` or `text`, the value as text.
#[derive(Serialize)]
pub struct Write {
    pub target: String,
    pub kind: &'static str,
    pub value: String,
}

struct DocState {
    snapshot: Snapshot,
    limits: Limits,
    writes: Vec<Write>,
    log: Vec<String>,
}

thread_local! { static DOC: RefCell<Option<DocState>> = const { RefCell::new(None) }; }

/// `text` cut to `units` UTF-16 units, never inside a character.
pub fn cut_utf16(text: &str, units: usize) -> String {
    let mut used = 0;
    text.chars()
        .take_while(|character| {
            used += character.len_utf16();
            used <= units
        })
        .collect()
}

// The state is borrowed only between two calls into the engine: a script's `toString` run by a conversion may call
// `doc` again.
fn with_doc<R>(read: impl FnOnce(&mut DocState) -> R) -> JsResult<R> {
    DOC.with(|doc| doc.borrow_mut().as_mut().map(read))
        .ok_or_else(|| {
            JsNativeError::error()
                .with_message("SCRIPT_NO_DOCUMENT")
                .into()
        })
}

fn cell_json(cell: &Cell) -> Value {
    json!({ "id": cell.id, "label": cell.label, "role": cell.role, "value": cell.value, "text": cell.text })
}

fn text_of(value: Option<&JsValue>, context: &mut Context) -> JsResult<String> {
    Ok(value
        .cloned()
        .unwrap_or_default()
        .to_string(context)?
        .to_std_string_escaped())
}

fn cells(_: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let list = with_doc(|doc| Value::Array(doc.snapshot.cells.iter().map(cell_json).collect()))?;
    JsValue::from_json(&list, context)
}

fn cell(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let name = text_of(args.first(), context)?;
    let found = with_doc(|doc| {
        doc.snapshot
            .cells
            .iter()
            .find(|cell| cell.id == name || cell.label == name)
            .map(cell_json)
    })?;
    found.map_or(Ok(JsValue::null()), |cell| {
        JsValue::from_json(&cell, context)
    })
}

fn text(_: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
    with_doc(|doc| JsString::from(doc.snapshot.text.as_str()).into())
}

fn too_many_writes() -> JsResult<()> {
    Err(JsNativeError::range()
        .with_message("SCRIPT_TOO_MANY_WRITES")
        .into())
}

fn set(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let (limits, count) = with_doc(|doc| (doc.limits, doc.writes.len()))?;
    if count >= limits.writes {
        too_many_writes()?;
    }
    let value = args.get(1).cloned().unwrap_or_default();
    let kind = if value.is_number() { "number" } else { "text" };
    let target = cut_utf16(&text_of(args.first(), context)?, limits.value_chars);
    // One unit more than allowed, so an over-long value is refused by the main thread, never silently cut.
    let value = cut_utf16(&text_of(Some(&value), context)?, limits.value_chars + 1);
    let full = with_doc(|doc| {
        let full = doc.writes.len() >= doc.limits.writes;
        if !full {
            doc.writes.push(Write {
                target,
                kind,
                value,
            });
        }
        full
    })?;
    if full {
        too_many_writes()?;
    }
    Ok(JsValue::undefined())
}

fn log(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let limits = with_doc(|doc| doc.limits)?;
    if with_doc(|doc| doc.log.len())? >= limits.log_lines {
        return Ok(JsValue::undefined());
    }
    let mut items = Vec::with_capacity(args.len());
    for item in args {
        items.push(text_of(Some(item), context)?);
    }
    let line = cut_utf16(&items.join(" "), limits.log_chars);
    with_doc(|doc| {
        if doc.log.len() < doc.limits.log_lines {
            doc.log.push(line);
        }
    })?;
    Ok(JsValue::undefined())
}

/// Lays `doc` on the context's global object, read-only, over this snapshot.
pub fn install(context: &mut Context, snapshot: Snapshot, limits: Limits) -> JsResult<()> {
    DOC.with(|doc| {
        *doc.borrow_mut() = Some(DocState {
            snapshot,
            limits,
            writes: Vec::new(),
            log: Vec::new(),
        })
    });
    let api = ObjectInitializer::new(context)
        .function(NativeFunction::from_fn_ptr(cells), js_string!("cells"), 0)
        .function(NativeFunction::from_fn_ptr(cell), js_string!("cell"), 1)
        .function(NativeFunction::from_fn_ptr(text), js_string!("text"), 0)
        .function(NativeFunction::from_fn_ptr(set), js_string!("set"), 2)
        .function(NativeFunction::from_fn_ptr(log), js_string!("log"), 0)
        .build();
    context.register_global_property(js_string!("doc"), api, Attribute::empty())
}

/// What the script proposed, the document's state cleared: `(writes, log)`.
pub fn take() -> (Vec<Write>, Vec<String>) {
    DOC.with(|doc| doc.borrow_mut().take())
        .map_or_else(|| (Vec::new(), Vec::new()), |doc| (doc.writes, doc.log))
}
