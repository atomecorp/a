use super::*;
use atome_bevy_renderer_core::{
    AtomeLayerPatch, AtomeParentPatch, AtomeRenderNode, AtomeRenderOp, AtomeRenderScene,
    AtomeResourcePatch, AtomeSceneEffectsPatch, AtomeStylePatch, AtomeSurfaceBackgroundPatch,
    AtomeSurfacePatch, AtomeTextPatch, AtomeTransformPatch, AtomeVisibilityPatch,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn run_atome_bevy_renderer(
    canvas_selector: String,
    width: f32,
    height: f32,
    initial_scene: JsValue,
) -> Result<(), JsValue> {
    if canvas_selector.trim().is_empty() {
        return Err(JsValue::from_str("bevy_canvas_selector_required"));
    }
    let scene: AtomeRenderScene = serde_wasm_bindgen::from_value(initial_scene)
        .map_err(|error| JsValue::from_str(&format!("bevy_projection_decode_failed:{error}")))?;
    let mut app = build_web_bevy_app(WebBevyRendererConfig::new(
        canvas_selector,
        width,
        height,
        scene,
    ));
    app.run();
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_spawn(node: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeRenderNode = serde_wasm_bindgen::from_value(node)
        .map_err(|error| JsValue::from_str(&format!("bevy_spawn_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Spawn(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_despawn(id: String) -> Result<(), JsValue> {
    if id.trim().is_empty() {
        return Err(JsValue::from_str("bevy_despawn_id_required"));
    }
    queue_web_op(AtomeRenderOp::Despawn(id));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_transform(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeTransformPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_transform_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Transform(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_style(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeStylePatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_style_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Style(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_reparent(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeParentPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_reparent_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Reparent(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_layer(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeLayerPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_layer_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Layer(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_visibility(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeVisibilityPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_visibility_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Visibility(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_text_metadata(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeTextPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_text_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Text(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_resource(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeResourcePatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_resource_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Resource(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_surface(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeSurfacePatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_surface_decode_failed:{error}")))?;
    queue_web_op(AtomeRenderOp::Surface(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_surface_background(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeSurfaceBackgroundPatch =
        serde_wasm_bindgen::from_value(patch).map_err(|error| {
            JsValue::from_str(&format!("bevy_surface_background_decode_failed:{error}"))
        })?;
    queue_web_op(AtomeRenderOp::SurfaceBackground(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_scene_effects(patch: JsValue) -> Result<(), JsValue> {
    let parsed: AtomeSceneEffectsPatch =
        serde_wasm_bindgen::from_value(patch).map_err(|error| {
            JsValue::from_str(&format!("bevy_scene_effects_decode_failed:{error}"))
        })?;
    queue_web_op(AtomeRenderOp::SceneEffects(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn request_atome_bevy_redraw() {
    request_web_redraw();
}

#[wasm_bindgen]
pub fn notify_atome_bevy_video_frame(id: String, frame_version: u32) {
    notify_web_video_frame(id, frame_version);
}

#[wasm_bindgen]
pub fn read_atome_bevy_web_diagnostics() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&read_web_renderer_diagnostics())
        .map_err(|error| JsValue::from_str(&format!("bevy_web_diagnostics_encode_failed:{error}")))
}

#[wasm_bindgen]
pub fn reset_atome_bevy_web_diagnostics() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&reset_web_renderer_diagnostics()).map_err(|error| {
        JsValue::from_str(&format!("bevy_web_diagnostics_reset_encode_failed:{error}"))
    })
}

#[wasm_bindgen]
pub fn read_atome_bevy_video_backend_capabilities() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&read_web_video_backend_capabilities()).map_err(|error| {
        JsValue::from_str(&format!(
            "bevy_video_backend_capabilities_encode_failed:{error}"
        ))
    })
}

#[wasm_bindgen]
pub fn read_atome_bevy_video_copy_diagnostics() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&atome_bevy_renderer_core::read_video_copy_diagnostics()).map_err(
        |error| {
            JsValue::from_str(&format!(
                "bevy_video_copy_diagnostics_encode_failed:{error}"
            ))
        },
    )
}

#[wasm_bindgen]
pub fn reset_atome_bevy_video_copy_diagnostics() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&atome_bevy_renderer_core::reset_video_copy_diagnostics()).map_err(
        |error| JsValue::from_str(&format!("bevy_video_copy_diagnostics_reset_failed:{error}")),
    )
}
