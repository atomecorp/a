use bevy::{image::Image, prelude::*};
use std::collections::{HashMap, VecDeque};

use crate::types::{
    default_transform_origin, default_transform_scale, normalize_transform_origin,
    normalize_transform_rotation, normalize_transform_scale, AtomeRenderScene, AtomeSceneEffect,
    AtomeShadowStyle, SelectionVisualStyle,
};

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
pub struct AtomeClipRect(pub Option<[f32; 4]>);

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeSpriteSourceRect(pub Option<Rect>);

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

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeVisualColor(pub [f32; 4]);

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeVisualOpacity(pub f32);

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeCornerRadius(pub f32);

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

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeShapeShadow(pub Option<AtomeShadowStyle>);

#[derive(Clone, Debug, Component)]
pub struct AtomeShapeShadowOverlay {
    pub entities: Vec<Entity>,
    pub image_handles: Vec<Handle<Image>>,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
pub struct AtomeShapeShadowCacheKey {
    pub width: u32,
    pub height: u32,
    pub corner_radius: u32,
    pub blur: u32,
    pub spread: u32,
    pub offset_x: i32,
    pub offset_y: i32,
    pub color: [u8; 4],
}

#[derive(Clone, Debug, Resource)]
pub struct AtomeShapeShadowTextureCache {
    pub max_entries: usize,
    pub max_bytes: usize,
    pub total_bytes: usize,
    pub order: VecDeque<AtomeShapeShadowCacheKey>,
    pub handles: HashMap<AtomeShapeShadowCacheKey, Handle<Image>>,
    pub byte_sizes: HashMap<AtomeShapeShadowCacheKey, usize>,
}

impl Default for AtomeShapeShadowTextureCache {
    fn default() -> Self {
        Self {
            max_entries: 128,
            max_bytes: 8 * 1024 * 1024,
            total_bytes: 0,
            order: VecDeque::new(),
            handles: HashMap::new(),
            byte_sizes: HashMap::new(),
        }
    }
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
pub struct AtomeRoundedRectMaskCacheKey {
    pub width: u32,
    pub height: u32,
    pub radius: u32,
}

// CPU-generated rounded-rect alpha masks are expensive at full-surface sizes
// (a 1440x920 background mask costs ~9ms per spawn); identical shapes reuse
// one texture. Small LRU: entries can weigh several MB each.
#[derive(Clone, Debug, Resource)]
pub struct AtomeRoundedRectMaskCache {
    pub max_entries: usize,
    pub max_bytes: usize,
    pub total_bytes: usize,
    pub order: VecDeque<AtomeRoundedRectMaskCacheKey>,
    pub handles: HashMap<AtomeRoundedRectMaskCacheKey, Handle<Image>>,
    pub byte_sizes: HashMap<AtomeRoundedRectMaskCacheKey, usize>,
}

impl Default for AtomeRoundedRectMaskCache {
    fn default() -> Self {
        Self {
            max_entries: 32,
            max_bytes: 8 * 1024 * 1024,
            total_bytes: 0,
            order: VecDeque::new(),
            handles: HashMap::new(),
            byte_sizes: HashMap::new(),
        }
    }
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

#[derive(Clone, Debug, Component)]
pub struct AtomeBackdropBlurVisual;

#[derive(Clone, Debug, Resource, Default)]
pub struct AtomeBackdropBlurState {
    pub effects: Vec<AtomeSceneEffect>,
    pub entities: Vec<Entity>,
    pub original_sprite_colors: HashMap<Entity, Color>,
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
    pub pixel_width: u32,
    pub pixel_height: u32,
    pub device_pixel_ratio: f32,
    pub initial_scene: AtomeRenderScene,
    pub selection_style: SelectionVisualStyle,
}

impl AtomeBevyRendererConfig {
    pub fn new(width: f32, height: f32, initial_scene: AtomeRenderScene) -> Self {
        Self::with_surface_metrics(width, height, width, height, 1.0, initial_scene)
    }

    pub fn with_surface_metrics(
        width: f32,
        height: f32,
        pixel_width: f32,
        pixel_height: f32,
        device_pixel_ratio: f32,
        initial_scene: AtomeRenderScene,
    ) -> Self {
        let selection_style = initial_scene.selection_style();
        let width = normalize_surface_logical(width);
        let height = normalize_surface_logical(height);
        let device_pixel_ratio = normalize_surface_dpr(device_pixel_ratio);
        Self {
            width,
            height,
            pixel_width: normalize_surface_pixel(pixel_width, width * device_pixel_ratio),
            pixel_height: normalize_surface_pixel(pixel_height, height * device_pixel_ratio),
            device_pixel_ratio,
            initial_scene,
            selection_style,
        }
    }

    pub fn empty(width: f32, height: f32) -> Self {
        Self::new(width, height, AtomeRenderScene::default())
    }
}

pub fn normalize_surface_logical(value: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        1.0
    }
}

pub fn normalize_surface_dpr(value: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value.max(0.1)
    } else {
        1.0
    }
}

pub fn normalize_surface_pixel(value: f32, fallback: f32) -> u32 {
    let candidate = if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    };
    candidate.max(1.0).round() as u32
}
