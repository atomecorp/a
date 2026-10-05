use bevy::{image::Image, prelude::*};
use std::collections::{HashMap, VecDeque};

use crate::types::{
    default_transform_origin, default_transform_scale, normalize_transform_origin, normalize_transform_rotation,
    normalize_transform_scale, AtomeMaskStyle, AtomeRenderScene, AtomeSceneEffect, AtomeShadowStyle, SelectionVisualStyle,
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

/// Angle (degres, sens horaire ecran) du repere dans lequel `AtomeClipRect` est
/// exprime : un point ecran p est visible si R(-angle).p tombe dans le rectangle.
/// 0 = decoupe droite ; une page tournee decoupe ses membres dans SON repere.
#[derive(Clone, Copy, Debug, Default, PartialEq, Component)]
pub struct AtomeClipRotation(pub f32);

/// Original rounded overflow boundaries, independent of their rectangular intersection.
#[derive(Component, Clone, Debug, Default, PartialEq)]
pub struct AtomeClipRoundedRects(pub Vec<[f32; 8]>);

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
        Self { scale: default_transform_scale(), rotation: 0.0, origin: default_transform_origin() }
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
pub struct AtomeCornerRadius(pub [f32; 4]);

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
pub struct AtomeResolvedMask(pub Option<AtomeMaskStyle>);

/// La forme qui SERT de masque ne se peint jamais : c'est sa silhouette qui
/// travaille. Le role est un COMPOSANT, et non une position dans le spawn,
/// parce que d'autres chemins recalculent la visibilite d'un noeud deja pose —
/// la decoupe d'abord, puis les patchs de visibilite. La source se rallumait
/// alors par-dessus le contenu qu'elle venait de decouper, et le masque
/// semblait sans effet.
#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeMaskSource;

/// La VARIANTE de la forme portee par l'entite : l'ombre en a besoin pour
/// epouser la silhouette (une etoile projette une ombre d'etoile), et le
/// composant est pose sur TOUT atome — un media ou un texte vaut le carre par
/// defaut, donc rien de plus n'est lu pour eux.
#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeShapeProfile(pub crate::shape_sdf::AtomeShapeGeometry);

/// Les composants poses sur TOUT atome. Une structure derivee plutot qu'un
/// tuple : Bevy n'implante `Bundle` que jusqu'a quinze elements, et le profil
/// de forme est le seizieme. L'ordre des champs est celui du tuple historique.
#[derive(Bundle)]
pub struct AtomeNodeBaseBundle {
    pub entity_id: AtomeEntityId,
    pub parent_entity_id: AtomeParentEntityId,
    pub logical_position: AtomeLogicalPosition,
    pub logical_size: AtomeLogicalSize,
    pub local_transform: AtomeLocalTransform,
    pub layer: AtomeLayer,
    pub render_kind: AtomeRenderKind,
    pub text_metadata: AtomeTextMetadata,
    pub media_source: AtomeMediaSource,
    pub waveform_peaks: AtomeWaveformPeaks,
    pub waveform_progress: AtomeWaveformPlaybackProgress,
    pub selected: AtomeSelected,
    pub shape_shadow: AtomeShapeShadow,
    pub resolved_mask: AtomeResolvedMask,
    pub shape_profile: AtomeShapeProfile,
    pub visibility: Visibility,
    pub transform: Transform,
}

#[derive(Clone, Debug, Component)]
pub struct AtomeShapeShadowOverlay {
    pub entities: Vec<Entity>,
    pub image_handles: Vec<Handle<Image>>,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
pub struct AtomeShapeShadowCacheKey {
    /// `0` drop, `1` block — part of the key so the two silhouettes never share
    /// a texture.
    pub kind: u8,
    pub invert: bool,
    pub width: u32,
    pub height: u32,
    pub corner_radii: [u32; 4],
    // La variante : une ombre d'etoile ne doit jamais etre servie pour un carre.
    pub variant: u32,
    pub star_branches: u32,
    pub star_inner_radius: u32,
    pub polygon_sides: u32,
    pub blur: u32,
    pub spread: i32,
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
    // One entry per corner in [top_left, top_right, bottom_right, bottom_left]
    // order, quantised to 1/100 px. A partially rounded shape (accordion header,
    // table row, outer segment) must not reuse the uniform-radius mask.
    pub radii: [u32; 4],
    // La VARIANTE et ses reglages : une etoile de meme boite qu'un carre ne doit
    // evidemment pas reutiliser son masque. Zero partout = le rectangle plein,
    // donc l'entree d'un masque d'avant l'outil Shape reste celle d'un carre.
    pub variant: u32,
    pub star_branches: u32,
    pub star_inner_radius: u32,
    pub polygon_sides: u32,
    pub paint: Vec<u32>,
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
    /// Size of the texture this (full-surface) sprite samples with a cover crop.
    pub texture_size: Option<[u32; 2]>,
    pub image_handle: Option<Handle<Image>>,

}

#[derive(Clone, Debug, Component)]
pub struct AtomeSurfaceBackgroundVideo {
    pub video_size: [u32; 2],
}


#[derive(Clone, Debug, Component)]
pub struct AtomeBackdropBlurVisual;

#[derive(Clone, Debug, Resource, Default)]
pub struct AtomeBackdropBlurState {
    pub effects: Vec<AtomeSceneEffect>,
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
    pub apng_active: usize,
    pub apng_frame_updates: u64,
    pub apng_max_lateness_ms: f64,
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
    let candidate = if value.is_finite() && value > 0.0 { value } else { fallback };
    candidate.max(1.0).round() as u32
}
