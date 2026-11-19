//! The Lottie player in the browser (`atome-lottie`, velato and vello on its own WebGPU device), apart from the
//! renderer so that its weight is paid only when a Lottie atome is shown or imported
//! (`eVe/domains/media/lottie_wasm_module.js`). The renderer receives each frame as an `ImageBitmap`
//! (`refresh_atome_bevy_browser_texture`). It exists only in a browser: a native build of the workspace finds it empty.
#![cfg(target_arch = "wasm32")]
mod diagnostics;
mod gpu;
mod player;

use serde::Serialize;
use wasm_bindgen::prelude::*;

pub use player::LottiePlayer;

fn to_js(value: &impl Serialize, error_code: &str) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|error| JsValue::from_str(&format!("{error_code}:{error}")))
}

/// A Lottie file (bodymovin JSON or dotLottie) read as its atome will be: its report, or the `lottie_*` refusal the
/// player would give.
#[wasm_bindgen]
pub fn inspect_lottie(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let report = atome_lottie::report(bytes).map_err(|error| JsValue::from_str(&error))?;
    to_js(&report, "lottie_report_encode_failed")
}

/// The module's WebGPU device and vello's pipelines, made once before the first player.
#[wasm_bindgen]
pub async fn init_lottie_gpu() -> Result<(), JsValue> {
    gpu::init().await.map_err(|error| {
        diagnostics::record(|diagnostics| diagnostics.last_error = Some(error.clone()));
        JsValue::from_str(&error)
    })
}

/// How many players play (the glue's driver counts them), kept with the costs.
#[wasm_bindgen]
pub fn set_lottie_active_players(active: usize) {
    diagnostics::record(|diagnostics| diagnostics.active = active);
}

#[wasm_bindgen]
pub fn read_lottie_diagnostics() -> Result<JsValue, JsValue> {
    to_js(&diagnostics::read(), "lottie_diagnostics_encode_failed")
}

#[wasm_bindgen]
pub fn reset_lottie_diagnostics() -> Result<JsValue, JsValue> {
    to_js(&diagnostics::reset(), "lottie_diagnostics_encode_failed")
}
