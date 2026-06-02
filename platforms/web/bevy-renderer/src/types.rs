use bevy::prelude::*;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeRenderNode {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) parent_id: Option<String>,
    pub(crate) logical_position: [f32; 2],
    pub(crate) logical_size: [f32; 2],
    pub(crate) layer: i32,
    pub(crate) color: Option<[f32; 4]>,
    pub(crate) text: Option<String>,
    pub(crate) source: Option<String>,
    pub(crate) texture: Option<WebAtomeTexture>,
    pub(crate) peaks: Option<Vec<f32>>,
    pub(crate) selected: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeTexture {
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) rgba: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeTransformPatch {
    pub(crate) id: String,
    pub(crate) logical_position: [f32; 2],
    pub(crate) logical_size: [f32; 2],
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeSurfacePatch {
    pub(crate) width: f32,
    pub(crate) height: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeStylePatch {
    pub(crate) id: String,
    pub(crate) color: Option<[f32; 4]>,
    pub(crate) selected: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeParentPatch {
    pub(crate) id: String,
    pub(crate) parent_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeLayerPatch {
    pub(crate) id: String,
    pub(crate) layer: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeVisibilityPatch {
    pub(crate) id: String,
    pub(crate) visible: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeTextPatch {
    pub(crate) id: String,
    pub(crate) text: Option<String>,
    pub(crate) texture: Option<WebAtomeTexture>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct WebAtomeResourcePatch {
    pub(crate) id: String,
    pub(crate) source: Option<String>,
    pub(crate) texture: Option<WebAtomeTexture>,
    pub(crate) peaks: Option<Vec<f32>>,
}

#[derive(Clone, Debug)]
pub(crate) enum WebAtomeRenderOp {
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

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeSelected(pub bool);

#[derive(Clone, Debug, Component)]
pub struct AtomeSelectionOverlay {
    pub(crate) entities: Vec<Entity>,
}

#[derive(Clone, Debug, Resource, Default)]
pub struct WebAtomeEntityTable {
    pub(crate) by_id: HashMap<String, Entity>,
}

#[derive(Clone, Debug, Resource, Default)]
pub struct WebBevyRendererDiagnostics {
    pub applied_ops: usize,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Resource)]
pub(crate) struct WebBevyRendererConfig {
    pub(super) canvas_selector: String,
    pub(crate) width: f32,
    pub(crate) height: f32,
    pub(crate) initial_nodes: Vec<WebAtomeRenderNode>,
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
