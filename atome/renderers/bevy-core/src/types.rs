use serde::Deserialize;

pub use crate::components::*;
pub use crate::types_procedural::AtomeProceduralSdf;
pub use crate::types_ops::*;

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

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AtomeShadowKind {
    #[default]
    Drop,
    Block,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
pub struct AtomeShadowStyle {
    #[serde(default, rename = "type")]
    pub kind: AtomeShadowKind,
    pub color: [f32; 4],
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub offset_x: f32,
    #[serde(default)]
    pub offset_y: f32,
    #[serde(default)]
    pub spread: f32,
    #[serde(default)]
    pub invert: bool,
}

fn default_mask_mode() -> String {
    "alpha".to_string()
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct AtomeMaskPlacement {
    #[serde(default)]
    pub source_position: [f32; 2],
    #[serde(default)]
    pub target_position: [f32; 2],
    #[serde(default = "default_transform_scale")]
    pub source_scale: [f32; 2],
    #[serde(default = "default_transform_scale")]
    pub target_scale: [f32; 2],
    #[serde(default)]
    pub source_rotation: f32,
    #[serde(default)]
    pub target_rotation: f32,
    #[serde(default = "default_transform_origin")]
    pub source_origin: [f32; 2],
    #[serde(default = "default_transform_origin")]
    pub target_origin: [f32; 2],
    #[serde(default)]
    pub target_size: [f32; 2],
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct AtomeMaskStyle {
    #[serde(default)]
    pub source_id: String,
    #[serde(default = "default_mask_mode")]
    pub mode: String,
    #[serde(default)]
    pub silhouette: crate::shape_sdf::AtomeShapeSilhouette,
    #[serde(default)]
    pub alpha: Vec<u8>,
    #[serde(default)]
    pub placement: Option<AtomeMaskPlacement>,
    #[serde(default)]
    pub layers: Vec<AtomeMaskStyle>,
}

impl AtomeMaskStyle {
    pub fn normalized(mut self) -> Option<Self> {
        if self.source_id.trim().is_empty() || self.mode.trim().to_ascii_lowercase() != "alpha" {
            return None;
        }
        if !self.silhouette.is_usable() {
            return None;
        }
        let expected = self.silhouette.width.ceil().max(1.0) as usize
            * self.silhouette.height.ceil().max(1.0) as usize;
        if !self.alpha.is_empty() && self.alpha.len() != expected {
            self.alpha.clear();
        }
        self.layers = self.layers.into_iter().filter_map(AtomeMaskStyle::normalized).collect();
        Some(self)
    }
}

impl AtomeShadowStyle {
    pub fn normalized(self) -> Option<Self> {
        let color = [
            finite_or(self.color[0], 0.0).clamp(0.0, 1.0),
            finite_or(self.color[1], 0.0).clamp(0.0, 1.0),
            finite_or(self.color[2], 0.0).clamp(0.0, 1.0),
            finite_or(self.color[3], 0.0).clamp(0.0, 1.0),
        ];
        let kind = self.kind;
        let blur = finite_or(self.blur, 0.0).max(0.0);
        if color[3] <= 0.0 {
            return None;
        }
        Some(Self {
            kind,
            color,
            blur,
            offset_x: finite_or(self.offset_x, 0.0),
            offset_y: finite_or(self.offset_y, 0.0),
            spread: finite_or(self.spread, 0.0),
            invert: kind == AtomeShadowKind::Block && self.invert,
        })
    }
}

pub fn default_filter_unit() -> f32 {
    1.0
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct AtomeColorFilters {
    #[serde(default = "default_filter_unit")]
    pub brightness: f32,
    #[serde(default = "default_filter_unit")]
    pub contrast: f32,
    #[serde(default = "default_filter_unit")]
    pub saturate: f32,
    #[serde(default)]
    pub grayscale: f32,
    #[serde(default)]
    pub sepia: f32,
    #[serde(default)]
    pub invert: f32,
    #[serde(default)]
    pub hue: f32,
}

impl AtomeColorFilters {
    pub fn identity() -> Self {
        Self {
            brightness: 1.0,
            contrast: 1.0,
            saturate: 1.0,
            grayscale: 0.0,
            sepia: 0.0,
            invert: 0.0,
            hue: 0.0,
        }
    }

    pub fn normalized(self) -> Self {
        Self {
            brightness: finite_or(self.brightness, 1.0).max(0.0),
            contrast: finite_or(self.contrast, 1.0).max(0.0),
            saturate: finite_or(self.saturate, 1.0).max(0.0),
            grayscale: finite_or(self.grayscale, 0.0).clamp(0.0, 1.0),
            sepia: finite_or(self.sepia, 0.0).clamp(0.0, 1.0),
            invert: finite_or(self.invert, 0.0).clamp(0.0, 1.0),
            hue: finite_or(self.hue, 0.0),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct AtomeTransition {
    #[serde(default)]
    pub kind: f32,
    #[serde(default)]
    pub progress: f32,
    #[serde(default)]
    pub role: f32,
    #[serde(default)]
    pub softness: f32,
}

impl AtomeTransition {
    pub fn none() -> Self {
        Self {
            kind: 0.0,
            progress: 0.0,
            role: 0.0,
            softness: 0.0,
        }
    }

    pub fn normalized(self) -> Self {
        let kind = finite_or(self.kind, 0.0).round().clamp(0.0, 3.0);
        Self {
            kind,
            progress: finite_or(self.progress, 0.0).clamp(0.0, 1.0),
            role: if self.role >= 0.5 { 1.0 } else { 0.0 },
            softness: finite_or(self.softness, 0.0).clamp(0.0, 1.0),
        }
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
    pub effects: Vec<AtomeSceneEffect>,
    #[serde(default)]
    pub selection_style: Option<SelectionVisualStyle>,
}

impl AtomeRenderScene {
    pub fn selection_style(&self) -> SelectionVisualStyle {
        self.selection_style.unwrap_or_default()
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeSceneEffect {
    pub id: String,
    pub kind: String,
    pub bounds: [f32; 4],
    pub source_layer_max: i32,
    pub target_layer: i32,
    pub radius: f32,
    #[serde(default)]
    pub downsample: f32,
    pub tint: [f32; 4],
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeSceneEffectsPatch {
    #[serde(default)]
    pub effects: Vec<AtomeSceneEffect>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeRenderNode {
    pub id: String,
    pub kind: String,
    pub parent_id: Option<String>,
    pub logical_position: [f32; 2],
    pub logical_size: [f32; 2],
    #[serde(default)]
    pub clip_rect: Option<[f32; 4]>,
    #[serde(default)]
    pub clip_rotation: f32,
    #[serde(default = "default_transform_scale")]
    pub scale: [f32; 2],
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_transform_origin")]
    pub origin: [f32; 2],
    pub layer: i32,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default)]
    pub corner_radius: f32,
    #[serde(default)]
    pub corner_radii: Option<[f32; 4]>,
    #[serde(default)]
    pub shape_variant: Option<String>,
    #[serde(default)]
    pub star_branches: Option<f32>,
    #[serde(default)]
    pub star_inner_radius: Option<f32>,
    #[serde(default)]
    pub polygon_sides: Option<f32>,
    #[serde(default)]
    pub shadow: Option<AtomeShadowStyle>,
    #[serde(default)]
    pub backdrop: Option<AtomeBackdropStyle>,
    #[serde(default)]
    pub surface_paint: Option<crate::surface_paint::SurfacePaint>,
    #[serde(default)]
    pub mask: Option<AtomeMaskStyle>,
    #[serde(default)]
    pub mask_source: bool,
    #[serde(default)]
    pub presentation: bool,
    #[serde(default)]
    pub menu_plane: u8,
    pub color: Option<[f32; 4]>,
    pub text: Option<String>,
    pub source: Option<String>,
    pub texture_size: Option<[u32; 2]>,
    pub uv_rect: Option<[f32; 4]>,
    pub texture: Option<AtomeTexture>,
    pub peaks: Option<Vec<f32>>,
    pub playback_progress: Option<f32>,
    pub selected: Option<bool>,
    #[serde(default)]
    pub filters: Option<AtomeColorFilters>,
    #[serde(default)]
    pub transition: Option<AtomeTransition>,
    #[serde(default)]
    pub procedural: Option<AtomeProceduralSdf>,
    #[serde(default)]
    pub project_space: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeTexture {
    pub width: u32,
    pub height: u32,
    #[serde(with = "serde_bytes")]
    pub rgba: Vec<u8>,
    #[serde(default)]
    pub animation: Option<crate::animated_png::PngAnimationSource>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct AtomeBackdropStyle {
    pub blur_px: f32,
    pub tint: [f32; 4],
    #[serde(default)]
    pub tint_fade: f32,
}

impl AtomeBackdropStyle {
    pub fn normalized(self) -> Option<Self> {
        if !self.blur_px.is_finite() || self.blur_px <= 0.0 || self.tint.iter().any(|value| !value.is_finite()) {
            return None;
        }
        Some(Self {
            blur_px: self.blur_px.clamp(0.0, 32.0),
            tint: self.tint.map(|value| value.clamp(0.0, 1.0)),
            tint_fade: if self.tint_fade.is_finite() { self.tint_fade.clamp(0.0, 1.0) } else { 0.0 },
        })
    }
}
