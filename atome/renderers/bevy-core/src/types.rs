use bevy::prelude::*;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct SelectionVisualStyle {
    pub shadow_size: f32,
    pub border_thickness: f32,
    pub dash_length: f32,
    pub dash_gap: f32,
    pub border_color: [f32; 4],
    pub shadow_color: [f32; 4],
}

impl Default for SelectionVisualStyle {
    fn default() -> Self {
        Self {
            shadow_size: 12.0,
            border_thickness: 1.5,
            dash_length: 6.0,
            dash_gap: 4.0,
            border_color: [0.92, 0.94, 0.97, 1.0],
            shadow_color: [0.0, 0.0, 0.0, 0.32],
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct AtomeRenderScene {
    #[serde(default)]
    pub nodes: Vec<AtomeRenderNode>,
    #[serde(default)]
    pub selection_style: Option<SelectionVisualStyle>,
}

impl AtomeRenderScene {
    pub fn selection_style(&self) -> SelectionVisualStyle {
        self.selection_style.unwrap_or_default()
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeRenderNode {
    pub id: String,
    pub kind: String,
    pub parent_id: Option<String>,
    pub logical_position: [f32; 2],
    pub logical_size: [f32; 2],
    pub layer: i32,
    pub color: Option<[f32; 4]>,
    pub text: Option<String>,
    pub source: Option<String>,
    pub texture: Option<AtomeTexture>,
    pub peaks: Option<Vec<f32>>,
    pub selected: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeTexture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeTransformPatch {
    pub id: String,
    pub logical_position: [f32; 2],
    pub logical_size: [f32; 2],
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeSurfacePatch {
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeStylePatch {
    pub id: String,
    pub color: Option<[f32; 4]>,
    pub selected: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeParentPatch {
    pub id: String,
    pub parent_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeLayerPatch {
    pub id: String,
    pub layer: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeVisibilityPatch {
    pub id: String,
    pub visible: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeTextPatch {
    pub id: String,
    pub text: Option<String>,
    pub texture: Option<AtomeTexture>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeResourcePatch {
    pub id: String,
    pub source: Option<String>,
    pub texture: Option<AtomeTexture>,
    pub peaks: Option<Vec<f32>>,
}

#[derive(Clone, Debug)]
pub enum AtomeRenderOp {
    Spawn(AtomeRenderNode),
    Despawn(String),
    Transform(AtomeTransformPatch),
    Style(AtomeStylePatch),
    Reparent(AtomeParentPatch),
    Layer(AtomeLayerPatch),
    Visibility(AtomeVisibilityPatch),
    Text(AtomeTextPatch),
    Resource(AtomeResourcePatch),
    Surface(AtomeSurfacePatch),
}

#[derive(Clone, Debug, Component)]
pub struct AtomeEntityId(pub String);

#[derive(Clone, Debug, Component)]
pub struct AtomeParentEntityId(pub Option<String>);

#[derive(Clone, Copy, Debug, Component)]
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
    pub entities: Vec<Entity>,
}

#[derive(Clone, Debug, Resource, Default)]
pub struct AtomeEntityTable {
    pub by_id: HashMap<String, Entity>,
}

#[derive(Clone, Debug, Resource, Default)]
pub struct AtomeRendererDiagnostics {
    pub applied_ops: usize,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Resource)]
pub struct AtomeBevyRendererConfig {
    pub width: f32,
    pub height: f32,
    pub initial_scene: AtomeRenderScene,
    pub selection_style: SelectionVisualStyle,
}

impl AtomeBevyRendererConfig {
    pub fn new(width: f32, height: f32, initial_scene: AtomeRenderScene) -> Self {
        let selection_style = initial_scene.selection_style();
        Self {
            width: width.max(1.0),
            height: height.max(1.0),
            initial_scene,
            selection_style,
        }
    }

    pub fn empty(width: f32, height: f32) -> Self {
        Self::new(width, height, AtomeRenderScene::default())
    }
}
