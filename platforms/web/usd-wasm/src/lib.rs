//! The OpenUSD reader in the browser (`atome-usd`, feature `reader`), apart from the renderer so that its weight
//! is paid only when a 3D scene is shown or imported (`eVe/domains/scene3d/usd_wasm_module.js`).

use wasm_bindgen::prelude::*;

fn read(bytes: Vec<u8>) -> Result<atome_usd::scene::UsdScene, JsValue> {
    atome_usd::load_usd(bytes)
        .map_err(|error| JsValue::from_str(&format!("scene3d_parse_failed:{error:#}")))
}

/// A USD file (usda, usdc, usdz) as the renderer's encoded scene (`register_atome_bevy_scene3d_source`).
#[wasm_bindgen]
pub fn read_usd_scene(bytes: Vec<u8>) -> Result<Vec<u8>, JsValue> {
    read(bytes).map(|scene| atome_usd::codec::encode_scene(&scene))
}

/// What a USD file holds and what the renderer cannot show (`atome_usd::scene::UsdReport`).
#[wasm_bindgen]
pub fn read_usd_report(bytes: Vec<u8>) -> Result<JsValue, JsValue> {
    let report = read(bytes)?.report;
    serde_wasm_bindgen::to_value(&report)
        .map_err(|error| JsValue::from_str(&format!("scene3d_report_encode_failed:{error}")))
}
