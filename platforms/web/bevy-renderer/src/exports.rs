use super::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn run_atome_bevy_renderer(
    canvas_selector: String,
    width: f32,
    height: f32,
    initial_nodes: JsValue,
) -> Result<(), JsValue> {
    if canvas_selector.trim().is_empty() {
        return Err(JsValue::from_str("bevy_canvas_selector_required"));
    }
    let nodes: Vec<WebAtomeRenderNode> = serde_wasm_bindgen::from_value(initial_nodes)
        .map_err(|error| JsValue::from_str(&format!("bevy_projection_decode_failed:{error}")))?;
    let mut app = build_web_bevy_app(WebBevyRendererConfig::new(
        canvas_selector,
        width,
        height,
        nodes,
    ));
    app.run();
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_spawn(node: JsValue) -> Result<(), JsValue> {
    let parsed: WebAtomeRenderNode = serde_wasm_bindgen::from_value(node)
        .map_err(|error| JsValue::from_str(&format!("bevy_spawn_decode_failed:{error}")))?;
    queue_web_op(WebAtomeRenderOp::Spawn(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_despawn(id: String) -> Result<(), JsValue> {
    if id.trim().is_empty() {
        return Err(JsValue::from_str("bevy_despawn_id_required"));
    }
    queue_web_op(WebAtomeRenderOp::Despawn(id));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_transform(patch: JsValue) -> Result<(), JsValue> {
    let parsed: WebAtomeTransformPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_transform_decode_failed:{error}")))?;
    queue_web_op(WebAtomeRenderOp::Transform(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_style(patch: JsValue) -> Result<(), JsValue> {
    let parsed: WebAtomeStylePatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_style_decode_failed:{error}")))?;
    queue_web_op(WebAtomeRenderOp::Style(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_reparent(patch: JsValue) -> Result<(), JsValue> {
    let parsed: WebAtomeParentPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_reparent_decode_failed:{error}")))?;
    queue_web_op(WebAtomeRenderOp::Reparent(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_layer(patch: JsValue) -> Result<(), JsValue> {
    let parsed: WebAtomeLayerPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_layer_decode_failed:{error}")))?;
    queue_web_op(WebAtomeRenderOp::Layer(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_visibility(patch: JsValue) -> Result<(), JsValue> {
    let parsed: WebAtomeVisibilityPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_visibility_decode_failed:{error}")))?;
    queue_web_op(WebAtomeRenderOp::Visibility(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_text_metadata(patch: JsValue) -> Result<(), JsValue> {
    let parsed: WebAtomeTextPatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_text_decode_failed:{error}")))?;
    queue_web_op(WebAtomeRenderOp::Text(parsed));
    Ok(())
}

#[wasm_bindgen]
pub fn apply_atome_bevy_resource(patch: JsValue) -> Result<(), JsValue> {
    let parsed: WebAtomeResourcePatch = serde_wasm_bindgen::from_value(patch)
        .map_err(|error| JsValue::from_str(&format!("bevy_resource_decode_failed:{error}")))?;
    queue_web_op(WebAtomeRenderOp::Resource(parsed));
    Ok(())
}

