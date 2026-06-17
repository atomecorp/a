use bevy::{image::Image, prelude::*};
use serde::Deserialize;
use std::collections::HashMap;

pub fn default_opacity() -> f32 {
    1.0
}

pub fn normalize_opacity(opacity: f32) -> f32 {
    if opacity.is_finite() {
        opacity.clamp(0.0, 1.0)
    } else {
        default_opacity()
    }
}

pub fn default_transform_scale() -> [f32; 2] {
    [1.0, 1.0]
}

pub fn default_transform_origin() -> [f32; 2] {
    [0.0, 0.0]
}

pub fn normalize_transform_scale(scale: [f32; 2]) -> [f32; 2] {
    [
        if scale[0].is_finite() { scale[0] } else { 1.0 },
        if scale[1].is_finite() { scale[1] } else { 1.0 },
    ]
}

pub fn normalize_transform_rotation(rotation: f32) -> f32 {
    if rotation.is_finite() {
        rotation
    } else {
        0.0
    }
}

pub fn normalize_transform_origin(origin: [f32; 2]) -> [f32; 2] {
    [
        if origin[0].is_finite() {
            origin[0]
        } else {
            0.0
        },
        if origin[1].is_finite() {
            origin[1]
        } else {
            0.0
        },
    ]
}

pub fn validate_transform_fields(
    scale: [f32; 2],
    rotation: f32,
    origin: [f32; 2],
    error_prefix: &str,
    id: &str,
) -> Result<(), String> {
    if !scale[0].is_finite() || !scale[1].is_finite() {
        return Err(format!("{error_prefix}_scale_invalid:{id}"));
    }
    if !rotation.is_finite() {
        return Err(format!("{error_prefix}_rotation_invalid:{id}"));
    }
    if !origin[0].is_finite() || !origin[1].is_finite() {
        return Err(format!("{error_prefix}_origin_invalid:{id}"));
    }
    Ok(())
}

pub fn default_uv_rect() -> [f32; 4] {
    [0.0, 0.0, 1.0, 1.0]
}

pub fn normalize_uv_rect(uv_rect: Option<[f32; 4]>) -> [f32; 4] {
    let Some([x, y, width, height]) = uv_rect else {
        return default_uv_rect();
    };
    if !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || x < 0.0
        || y < 0.0
        || width <= 0.0
        || height <= 0.0
        || x >= 1.0
        || y >= 1.0
    {
        return default_uv_rect();
    }
    let clamped_x = x.clamp(0.0, 1.0);
    let clamped_y = y.clamp(0.0, 1.0);
    let clamped_width = width.min(1.0 - clamped_x);
    let clamped_height = height.min(1.0 - clamped_y);
    if clamped_width <= 0.0 || clamped_height <= 0.0 {
        default_uv_rect()
    } else {
        [clamped_x, clamped_y, clamped_width, clamped_height]
    }
}

pub fn validate_uv_rect(
    uv_rect: Option<[f32; 4]>,
    error_prefix: &str,
    id: &str,
) -> Result<(), String> {
    let Some([x, y, width, height]) = uv_rect else {
        return Ok(());
    };
    if !x.is_finite() || !y.is_finite() || !width.is_finite() || !height.is_finite() {
        return Err(format!("{error_prefix}_uv_rect_invalid:{id}"));
    }
    if x < 0.0 || y < 0.0 {
        return Err(format!("{error_prefix}_uv_rect_origin_invalid:{id}"));
    }
    if width <= 0.0 || height <= 0.0 {
        return Err(format!("{error_prefix}_uv_rect_size_invalid:{id}"));
    }
    let epsilon = 0.000001;
    if x + width > 1.0 + epsilon || y + height > 1.0 + epsilon {
        return Err(format!("{error_prefix}_uv_rect_bounds_invalid:{id}"));
    }
    Ok(())
}

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
    #[serde(default = "default_transform_scale")]
    pub scale: [f32; 2],
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_transform_origin")]
    pub origin: [f32; 2],
    pub layer: i32,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    pub color: Option<[f32; 4]>,
    pub text: Option<String>,
    pub source: Option<String>,
    pub texture_size: Option<[u32; 2]>,
    pub uv_rect: Option<[f32; 4]>,
    pub texture: Option<AtomeTexture>,
    pub peaks: Option<Vec<f32>>,
    pub playback_progress: Option<f32>,
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
    #[serde(default = "default_transform_scale")]
    pub scale: [f32; 2],
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_transform_origin")]
    pub origin: [f32; 2],
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeSurfacePatch {
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeSurfaceBackgroundPatch {
    pub signature: String,
    pub color: [f32; 4],
    pub texture: Option<AtomeTexture>,
}

impl AtomeSurfaceBackgroundPatch {
    pub fn texture_size(&self) -> Option<[u32; 2]> {
        self.texture
            .as_ref()
            .map(|texture| [texture.width, texture.height])
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeStylePatch {
    pub id: String,
    pub color: Option<[f32; 4]>,
    pub selected: Option<bool>,
    #[serde(default)]
    pub opacity: Option<f32>,
    #[serde(default)]
    pub playback_progress: Option<Option<f32>>,
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
    pub texture_size: Option<[u32; 2]>,
    #[serde(default)]
    pub uv_rect: Option<Option<[f32; 4]>>,
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
    SurfaceBackground(AtomeSurfaceBackgroundPatch),
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

#[derive(Clone, Copy, Debug, Component, PartialEq)]
pub struct AtomeLocalTransform {
    pub scale: [f32; 2],
    pub rotation: f32,
    pub origin: [f32; 2],
}

impl Default for AtomeLocalTransform {
    fn default() -> Self {
        Self {
            scale: default_transform_scale(),
            rotation: 0.0,
            origin: default_transform_origin(),
        }
    }
}

impl AtomeLocalTransform {
    pub fn new(scale: [f32; 2], rotation: f32, origin: [f32; 2]) -> Self {
        Self {
            scale: normalize_transform_scale(scale),
            rotation: normalize_transform_rotation(rotation),
            origin: normalize_transform_origin(origin),
        }
    }
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
pub struct AtomeWaveformPlaybackProgress(pub Option<f32>);

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeSelected(pub bool);

#[derive(Clone, Debug, Component)]
pub struct AtomeSelectionOverlay {
    pub entities: Vec<Entity>,
    pub image_handles: Vec<Handle<Image>>,
}

#[derive(Clone, Debug, Component)]
pub struct AtomeWaveformPlaybackOverlay {
    pub entities: Vec<Entity>,
}

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeSurfaceBackground;

#[derive(Clone, Debug, Component)]
pub struct AtomeSurfaceBackgroundVisual {
    pub signature: String,
    pub texture_size: Option<[u32; 2]>,
    pub image_handle: Option<Handle<Image>>,
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
