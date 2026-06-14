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

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct AtomeVideoTrack {
    pub id: String,
    pub source: String,
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
    #[serde(default)]
    pub uv_rect: Option<[f32; 4]>,
}

impl AtomeVideoTrack {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("bevy_video_track_id_required".to_string());
        }
        if self.source.trim().is_empty() {
            return Err(format!("bevy_video_track_source_required:{}", self.id));
        }
        if !self.logical_position[0].is_finite() || !self.logical_position[1].is_finite() {
            return Err(format!("bevy_video_track_position_invalid:{}", self.id));
        }
        if !self.logical_size[0].is_finite() || !self.logical_size[1].is_finite() {
            return Err(format!("bevy_video_track_size_invalid:{}", self.id));
        }
        if self.logical_size[0] <= 0.0 || self.logical_size[1] <= 0.0 {
            return Err(format!("bevy_video_track_size_required:{}", self.id));
        }
        if !self.opacity.is_finite() {
            return Err(format!("bevy_video_track_opacity_invalid:{}", self.id));
        }
        validate_transform_fields(
            self.scale,
            self.rotation,
            self.origin,
            "bevy_video_track",
            &self.id,
        )?;
        validate_uv_rect(self.uv_rect, "bevy_video_track", &self.id)?;
        Ok(())
    }

    pub fn render_node(&self) -> AtomeRenderNode {
        AtomeRenderNode {
            id: self.id.clone(),
            kind: "video".to_string(),
            parent_id: None,
            logical_position: self.logical_position,
            logical_size: self.logical_size,
            scale: self.scale,
            rotation: self.rotation,
            origin: self.origin,
            layer: self.layer,
            opacity: normalize_opacity(self.opacity),
            color: None,
            text: None,
            source: Some(self.source.clone()),
            texture_size: None,
            uv_rect: self.uv_rect,
            texture: None,
            peaks: None,
            playback_progress: None,
            selected: None,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct AtomeVideoTransform {
    pub logical_position: [f32; 2],
    pub logical_size: [f32; 2],
    #[serde(default = "default_transform_scale")]
    pub scale: [f32; 2],
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_transform_origin")]
    pub origin: [f32; 2],
}

impl AtomeVideoTransform {
    pub fn into_patch(self, id: String) -> AtomeVideoTransformPatch {
        AtomeVideoTransformPatch {
            id,
            logical_position: self.logical_position,
            logical_size: self.logical_size,
            scale: self.scale,
            rotation: self.rotation,
            origin: self.origin,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct AtomeVideoTransformPatch {
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

impl AtomeVideoTransformPatch {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("bevy_video_transform_id_required".to_string());
        }
        if !self.logical_position[0].is_finite() || !self.logical_position[1].is_finite() {
            return Err(format!("bevy_video_transform_position_invalid:{}", self.id));
        }
        if !self.logical_size[0].is_finite() || !self.logical_size[1].is_finite() {
            return Err(format!("bevy_video_transform_size_invalid:{}", self.id));
        }
        if self.logical_size[0] <= 0.0 || self.logical_size[1] <= 0.0 {
            return Err(format!("bevy_video_transform_size_required:{}", self.id));
        }
        validate_transform_fields(
            self.scale,
            self.rotation,
            self.origin,
            "bevy_video_transform",
            &self.id,
        )?;
        Ok(())
    }

    pub fn transform_patch(&self) -> AtomeTransformPatch {
        AtomeTransformPatch {
            id: self.id.clone(),
            logical_position: self.logical_position,
            logical_size: self.logical_size,
            scale: self.scale,
            rotation: self.rotation,
            origin: self.origin,
        }
    }
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
    VideoTrackApply(AtomeVideoTrack),
    VideoTrackRemove(String),
    VideoTrackTransform(AtomeVideoTransformPatch),
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

#[cfg(test)]
mod video_track_tests {
    use super::*;

    fn valid_track() -> AtomeVideoTrack {
        AtomeVideoTrack {
            id: "video_track_1".to_string(),
            source: "/fixtures/video.mp4".to_string(),
            logical_position: [12.0, 24.0],
            logical_size: [160.0, 90.0],
            scale: [1.25, 0.75],
            rotation: 15.0,
            origin: [0.5, 0.5],
            layer: 4,
            opacity: 0.5,
            uv_rect: Some([0.25, 0.0, 0.5, 1.0]),
        }
    }

    #[test]
    fn atome_video_track_payload_validates_canonical_fields() {
        let track = valid_track();

        assert_eq!(track.validate(), Ok(()));
        assert_eq!(track.id, "video_track_1");
        assert_eq!(track.source, "/fixtures/video.mp4");
        assert_eq!(track.logical_position, [12.0, 24.0]);
        assert_eq!(track.logical_size, [160.0, 90.0]);
        assert_eq!(track.scale, [1.25, 0.75]);
        assert_eq!(track.rotation, 15.0);
        assert_eq!(track.origin, [0.5, 0.5]);
        assert_eq!(track.layer, 4);
        assert_eq!(track.opacity, 0.5);
        assert_eq!(track.uv_rect, Some([0.25, 0.0, 0.5, 1.0]));
        assert_eq!(track.render_node().kind, "video");
        assert_eq!(track.render_node().opacity, 0.5);
        assert_eq!(track.render_node().scale, [1.25, 0.75]);
        assert_eq!(track.render_node().rotation, 15.0);
        assert_eq!(track.render_node().origin, [0.5, 0.5]);
        assert_eq!(track.render_node().uv_rect, Some([0.25, 0.0, 0.5, 1.0]));
        assert_eq!(
            track.render_node().source.as_deref(),
            Some("/fixtures/video.mp4")
        );
    }

    #[test]
    fn atome_video_track_payload_rejects_non_canonical_fields() {
        let mut empty_id = valid_track();
        empty_id.id = " ".to_string();
        assert_eq!(
            empty_id.validate(),
            Err("bevy_video_track_id_required".to_string())
        );

        let mut empty_source = valid_track();
        empty_source.source = String::new();
        assert_eq!(
            empty_source.validate(),
            Err("bevy_video_track_source_required:video_track_1".to_string())
        );

        let mut invalid_position = valid_track();
        invalid_position.logical_position = [f32::NAN, 24.0];
        assert_eq!(
            invalid_position.validate(),
            Err("bevy_video_track_position_invalid:video_track_1".to_string())
        );

        let mut invalid_size = valid_track();
        invalid_size.logical_size = [0.0, 90.0];
        assert_eq!(
            invalid_size.validate(),
            Err("bevy_video_track_size_required:video_track_1".to_string())
        );

        let mut invalid_opacity = valid_track();
        invalid_opacity.opacity = f32::NAN;
        assert_eq!(
            invalid_opacity.validate(),
            Err("bevy_video_track_opacity_invalid:video_track_1".to_string())
        );

        let mut invalid_rotation = valid_track();
        invalid_rotation.rotation = f32::NAN;
        assert_eq!(
            invalid_rotation.validate(),
            Err("bevy_video_track_rotation_invalid:video_track_1".to_string())
        );

        let mut invalid_uv_rect = valid_track();
        invalid_uv_rect.uv_rect = Some([0.75, 0.0, 0.5, 1.0]);
        assert_eq!(
            invalid_uv_rect.validate(),
            Err("bevy_video_track_uv_rect_bounds_invalid:video_track_1".to_string())
        );
    }

    #[test]
    fn atome_video_transform_payload_validates_canonical_fields() {
        let patch = AtomeVideoTransform {
            logical_position: [3.0, 4.0],
            logical_size: [120.0, 80.0],
            scale: [1.5, 0.5],
            rotation: 22.0,
            origin: [0.5, 0.5],
        }
        .into_patch("video_track_1".to_string());

        assert_eq!(patch.validate(), Ok(()));
        assert_eq!(patch.transform_patch().id, "video_track_1");
        assert_eq!(patch.transform_patch().scale, [1.5, 0.5]);
        assert_eq!(patch.transform_patch().rotation, 22.0);
        assert_eq!(patch.transform_patch().origin, [0.5, 0.5]);

        let invalid = AtomeVideoTransform {
            logical_position: [3.0, f32::INFINITY],
            logical_size: [120.0, 80.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
        }
        .into_patch("video_track_1".to_string());
        assert_eq!(
            invalid.validate(),
            Err("bevy_video_transform_position_invalid:video_track_1".to_string())
        );
    }
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
