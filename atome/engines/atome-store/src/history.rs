use super::*;

pub fn deleted_keys(event: &EventRecord) -> Vec<String> {
    event
        .payload
        .as_ref()
        .and_then(|p| p.get("delete_keys"))
        .and_then(JsonValue::as_array)
        .map(|keys| {
            keys.iter()
                .filter_map(JsonValue::as_str)
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}
