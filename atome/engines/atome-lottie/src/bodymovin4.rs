//! A bodymovin 4 file written as the format version 5 writes it, the form velato reads.
use serde_json::{Value, json};

/// A bodymovin 4 file leaves out `a` on its animated properties (their keyframes alone tell them) and ends
/// a track on a bare `{"t": n}` whose value is the `e` of the keyframe before; velato reads `a` and an `s` on
/// every keyframe, so both are written as the format version 5 writes them.
pub(crate) fn mark_keyframed(value: &mut Value) {
    match value {
        Value::Object(object) => {
            let keyframed = object
                .get("k")
                .and_then(Value::as_array)
                .and_then(|keys| keys.first())
                .is_some_and(|key| key.get("t").is_some());
            if keyframed && !object.contains_key("a") {
                object.insert("a".into(), json!(1));
            }
            if keyframed && let Some(Value::Array(keys)) = object.get_mut("k") {
                fill_keyframe_starts(keys);
            }
            object.values_mut().for_each(mark_keyframed);
        }
        Value::Array(items) => items.iter_mut().for_each(mark_keyframed),
        _ => {}
    }
}

fn fill_keyframe_starts(keys: &mut [Value]) {
    for index in 1..keys.len() {
        if keys[index].get("s").is_some() {
            continue;
        }
        let previous = &keys[index - 1];
        let Some(start) = previous.get("e").or_else(|| previous.get("s")).cloned() else {
            continue;
        };
        if let Some(key) = keys[index].as_object_mut() {
            key.insert("s".into(), start);
        }
    }
}
