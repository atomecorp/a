use bevy::prelude::*;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeRenderNode {
    pub(super) id: String,
    pub(super) kind: String,
    pub(super) parent_id: Option<String>,
    pub(super) logical_position: [f32; 2],
    pub(super) logical_size: [f32; 2],
    pub(super) layer: i32,
    pub(super) color: Option<[f32; 4]>,
    pub(super) text: Option<String>,
    pub(super) source: Option<String>,
    pub(super) texture: Option<WebAtomeTexture>,
    pub(super) peaks: Option<Vec<f32>>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeTexture {
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) rgba: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeTransformPatch {
    pub(super) id: String,
    pub(super) logical_position: [f32; 2],
    pub(super) logical_size: [f32; 2],
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeSurfacePatch {
    pub(super) width: f32,
    pub(super) height: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeStylePatch {
    pub(super) id: String,
    pub(super) color: Option<[f32; 4]>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeParentPatch {
    pub(super) id: String,
    pub(super) parent_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeLayerPatch {
    pub(super) id: String,
    pub(super) layer: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeVisibilityPatch {
    pub(super) id: String,
    pub(super) visible: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeTextPatch {
    pub(super) id: String,
    pub(super) text: Option<String>,
    pub(super) texture: Option<WebAtomeTexture>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct WebAtomeResourcePatch {
    pub(super) id: String,
    pub(super) source: Option<String>,
    pub(super) texture: Option<WebAtomeTexture>,
    pub(super) peaks: Option<Vec<f32>>,
}

#[derive(Clone, Debug)]
pub(super) enum WebAtomeRenderOp {
    Spawn(WebAtomeRenderNode),
    Despawn(String),
    Transform(WebAtomeTransformPatch),
    Style(WebAtomeStylePatch),
    Reparent(WebAtomeParentPatch),
    Layer(WebAtomeLayerPatch),
    Visibility(WebAtomeVisibilityPatch),
    Text(WebAtomeTextPatch),
    Resource(WebAtomeResourcePatch),
    Surface(WebAtomeSurfacePatch),
}

#[derive(Clone, Debug, Component)]
#[allow(dead_code)]
pub struct AtomeEntityId(pub String);

#[derive(Clone, Debug, Component)]
#[allow(dead_code)]
pub struct AtomeParentEntityId(pub Option<String>);

#[derive(Clone, Copy, Debug, Component)]
#[allow(dead_code)]
pub struct AtomeLogicalSize {
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeLogicalPosition {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeLayer(pub i32);

#[derive(Clone, Debug, Component)]
#[allow(dead_code)]
pub struct AtomeTextMetadata(pub Option<String>);

#[derive(Clone, Debug, Component, PartialEq, Eq)]
pub struct AtomeRenderKind(pub String);

#[derive(Clone, Debug, Component)]
pub struct AtomeMediaSource(pub Option<String>);

#[derive(Clone, Debug, Component)]
pub struct AtomeWaveformPeaks(pub Vec<f32>);

#[derive(Clone, Debug, Resource, Default)]
pub struct WebAtomeEntityTable {
    pub(super) by_id: HashMap<String, Entity>,
}

#[derive(Clone, Debug, Resource, Default)]
pub struct WebBevyRendererDiagnostics {
    pub applied_ops: usize,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Resource)]
pub(super) struct WebBevyRendererConfig {
    pub(super) canvas_selector: String,
    pub(super) width: f32,
    pub(super) height: f32,
    pub(super) initial_nodes: Vec<WebAtomeRenderNode>,
}

impl WebBevyRendererConfig {
    pub(super) fn new(
        canvas_selector: String,
        width: f32,
        height: f32,
        initial_nodes: Vec<WebAtomeRenderNode>,
    ) -> Self {
        Self {
            canvas_selector,
            width: width.max(1.0),
            height: height.max(1.0),
            initial_nodes,
        }
    }
}
