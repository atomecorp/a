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

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
/// Canonical GPU drop shadow for a shape silhouette.
///
/// The renderer derives the alpha mask from the owner's rounded geometry,
/// composites the resulting Gaussian exterior shadow below that owner, and
/// never samples or blurs the backdrop behind it.
pub struct AtomeShadowStyle {
    pub color: [f32; 4],
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub offset_x: f32,
    #[serde(default)]
    pub offset_y: f32,
    #[serde(default)]
    pub spread: f32,
}

impl AtomeShadowStyle {
    pub fn normalized(self) -> Option<Self> {
        let color = [
            finite_or(self.color[0], 0.0).clamp(0.0, 1.0),
            finite_or(self.color[1], 0.0).clamp(0.0, 1.0),
            finite_or(self.color[2], 0.0).clamp(0.0, 1.0),
            finite_or(self.color[3], 0.0).clamp(0.0, 1.0),
        ];
        let blur = finite_or(self.blur, 0.0).max(0.0);
        if color[3] <= 0.0 || blur <= 0.0 {
            return None;
        }
        Some(Self {
            color,
            blur,
            offset_x: finite_or(self.offset_x, 0.0),
            offset_y: finite_or(self.offset_y, 0.0),
            spread: finite_or(self.spread, 0.0).max(0.0),
        })
    }
}

/// Identity for the multiplicative CSS filters (brightness/contrast/saturate).
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

/// CSS-style per-clip color filters (identity = no visual change). Deserialized
/// from the node/style payload and copied into the Bevy video material uniform —
/// see `assets/shaders/video_external.wgsl`. Missing fields default to identity,
/// so a partial `{ "brightness": 1.2 }` leaves the rest untouched.
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

    /// Coerce to renderable ranges: non-finite values fall back to identity,
    /// the [0,1]-mix filters are clamped, the multiplicative gains stay >= 0.
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

/// Per-clip timeline transition applied in the video material — see
/// `apply_transition` in `assets/shaders/video_external.wgsl`. All-f32 so it
/// copies straight into the uniform. kind: 0 none, 1 fade, 2 wipe, 3 slide;
/// role: 0 incoming, 1 outgoing. `none()` = no transition (identity).
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

    /// Coerce to renderable ranges: kind snapped to {0,1,2,3}, progress in
    /// [0,1], role to {0,1}, softness in [0,1]; non-finite falls back to none.
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
    pub shadow: Option<AtomeShadowStyle>,
    #[serde(default)]
    pub backdrop: Option<AtomeBackdropStyle>,
    #[serde(default)]
    pub presentation: bool,
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
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeTexture {
    pub width: u32,
    pub height: u32,
    #[serde(with = "serde_bytes")]
    pub rgba: Vec<u8>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct AtomeBackdropStyle {
    pub blur_px: f32,
    pub tint: [f32; 4],
}

impl AtomeBackdropStyle {
    pub fn normalized(self) -> Option<Self> {
        if !self.blur_px.is_finite() || self.blur_px <= 0.0 || self.tint.iter().any(|value| !value.is_finite()) {
            return None;
        }
        Some(Self {
            blur_px: self.blur_px.clamp(0.0, 32.0),
            tint: self.tint.map(|value| value.clamp(0.0, 1.0)),
        })
    }
}
