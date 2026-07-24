use serde::Deserialize;

use crate::types::{
    default_transform_origin, default_transform_scale, AtomeBackdropStyle, AtomeColorFilters,
    AtomeProceduralSdf, AtomeRenderNode, AtomeSceneEffectsPatch, AtomeShadowStyle, AtomeTexture,
    AtomeTransition,
};

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
    #[serde(default)]
    pub clip_rect: Option<[f32; 4]>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeSurfacePatch {
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub pixel_width: Option<f32>,
    #[serde(default)]
    pub pixel_height: Option<f32>,
    #[serde(default)]
    pub device_pixel_ratio: Option<f32>,
}

impl AtomeSurfacePatch {
    pub fn logical(width: f32, height: f32) -> Self {
        Self {
            width,
            height,
            pixel_width: None,
            pixel_height: None,
            device_pixel_ratio: None,
        }
    }
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
    #[serde(default)]
    pub shadow: Option<Option<AtomeShadowStyle>>,
    #[serde(default)]
    pub backdrop: Option<Option<AtomeBackdropStyle>>,
    pub selected: Option<bool>,
    #[serde(default)]
    pub opacity: Option<f32>,
    #[serde(default)]
    pub playback_progress: Option<Option<f32>>,
    #[serde(default)]
    pub filters: Option<AtomeColorFilters>,
    #[serde(default)]
    pub transition: Option<AtomeTransition>,
    #[serde(default)]
    pub procedural: Option<AtomeProceduralSdf>,
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
    SceneEffects(AtomeSceneEffectsPatch),
}
