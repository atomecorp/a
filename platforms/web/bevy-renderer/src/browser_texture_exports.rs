//! A browser texture filled again by a new bitmap (a Lottie's frames, drawn by the Lottie module,
//! `eVe/domains/media/lottie_wasm_module.js`; bevy-core `browser_texture_refresh.rs`).
#![cfg(target_arch = "wasm32")]
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Gives `bitmap` (an `ImageBitmap` of the image's own size) to the image the atome `id` shows: called from the frame
/// hook, it is shown in that frame.
#[wasm_bindgen]
pub fn refresh_atome_bevy_browser_texture(id: String, bitmap: JsValue) -> Result<(), JsValue> {
    atome_bevy_renderer_core::browser_texture::queue_browser_texture_refresh(id, bitmap)
        .map_err(|error| JsValue::from_str(&error))
}

/// The atomes despawned since the last call while a frame hook was set: the glue frees what it kept for them.
#[wasm_bindgen]
pub fn take_atome_bevy_gone_browser_textures() -> Vec<String> {
    atome_bevy_renderer_core::browser_texture::take_gone_browser_textures()
}

/// `hook` (a function, or `null`) is called at the start of each renderer frame: a Lottie player draws its frame there,
/// so the bitmap it refreshes is shown in that same frame.
#[wasm_bindgen]
pub fn set_atome_bevy_frame_hook(hook: JsValue) -> Result<(), JsValue> {
    atome_bevy_renderer_core::browser_texture::set_browser_texture_frame_hook(hook)
        .map_err(|error| JsValue::from_str(&error))
}

#[derive(Serialize)]
struct BrowserTextureDiagnostics {
    /// Bitmaps copied into an atome's image by a refresh, since the start.
    refreshed: u64,
}

#[wasm_bindgen]
pub fn read_atome_bevy_browser_texture_diagnostics() -> Result<JsValue, JsValue> {
    let diagnostics = BrowserTextureDiagnostics {
        refreshed: atome_bevy_renderer_core::browser_texture::browser_texture_refreshes(),
    };
    serde_wasm_bindgen::to_value(&diagnostics).map_err(|error| {
        JsValue::from_str(&format!(
            "bevy_browser_texture_diagnostics_encode_failed:{error}"
        ))
    })
}
