// The Loopy Pro reader (atome-lpproj-import), reached from the page: a bundle's
// `Project.sqlite` bytes and its audio files' identities (hashed by the page with
// crypto.subtle, so the audio never enters this module's memory) read into the
// Molecule import of the one document writer (atome-interchange), as JSON. A refusal is an Error
// carrying the reader's message.
use std::collections::BTreeMap;

use atome_lpproj_import::layout::lay_out;
use atome_lpproj_import::model::LoopyResource;
use atome_lpproj_import::reader::{read_project, store_objects};
use wasm_bindgen::prelude::*;

fn refusal(message: String) -> JsValue {
    js_sys::Error::new(&message).into()
}

/// `lpprojRead(storeBytes, resourcesJson, name)`: `resourcesJson` is an array of
/// `{ resource_id, file_name, sha256, byte_length }`; the answer is the Molecule
/// import (`{ document, report, media, midi }`, atome-interchange) as JSON.
#[wasm_bindgen(js_name = lpprojRead)]
pub fn lpproj_read(store: &[u8], resources: &str, name: &str) -> Result<String, JsValue> {
    let listed: Vec<serde_json::Value> = serde_json::from_str(resources)
        .map_err(|error| refusal(format!("lpproj_resources_json_invalid: {error}")))?;
    let mut by_id = BTreeMap::new();
    for entry in listed {
        let text = |key: &str| {
            entry
                .get(key)
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
                .ok_or_else(|| refusal(format!("lpproj_resource_missing_{key}")))
        };
        let resource = LoopyResource {
            resource_id: text("resource_id")?,
            file_name: text("file_name")?,
            sha256: text("sha256")?,
            byte_length: entry
                .get("byte_length")
                .and_then(serde_json::Value::as_u64)
                .ok_or_else(|| refusal("lpproj_resource_missing_byte_length".into()))?,
        };
        by_id.insert(resource.resource_id.clone(), resource);
    }
    let rows = store_objects(store).map_err(|error| refusal(error.to_string()))?;
    let project = read_project(rows, &by_id).map_err(|error| refusal(error.to_string()))?;
    lay_out(&project, name)
        .map(|import| import.to_json())
        .map_err(|error| refusal(error.to_string()))
}
