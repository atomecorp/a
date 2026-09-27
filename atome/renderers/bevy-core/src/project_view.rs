//! Project view (zoom + pan) as a virtual parent of the project's atoms.
//!
//! Every atom keeps the `Transform` computed from its logical (project) pixels;
//! only its `GlobalTransform` is re-derived here as `view ∘ Transform`. The UI,
//! the Dashboard, menus and the background are never marked, so they stay in
//! screen space, and the capture cameras (backdrop, Mystic) keep seeing exactly
//! what the presentation camera sees. Overlays owned by an atom (selection,
//! shadow, waveform, clip proxy) follow their owner.

use bevy::prelude::*;
use serde::Deserialize;

use crate::{
    clip_polygon::AtomeClipPolygonProxy,
    types::{
        AtomeBevyRendererConfig, AtomeEntityTable, AtomeSelectionOverlay, AtomeShapeShadowOverlay,
        AtomeWaveformPlaybackOverlay,
    },
};

pub const PROJECT_VIEW_MIN_ZOOM: f32 = 0.02;
pub const PROJECT_VIEW_MAX_ZOOM: f32 = 64.0;

/// Screen = project × zoom + pan (logical pixels, origin top-left).
#[derive(Clone, Copy, Debug, PartialEq, Resource)]
pub struct AtomeProjectView {
    pub zoom: f32,
    pub pan: Vec2,
}

impl Default for AtomeProjectView {
    fn default() -> Self {
        Self { zoom: 1.0, pan: Vec2::ZERO }
    }
}

impl AtomeProjectView {
    pub fn is_identity(&self) -> bool {
        (self.zoom - 1.0).abs() < f32::EPSILON && self.pan == Vec2::ZERO
    }
}

/// Marks an atom drawn in project space (it follows the project view).
#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeProjectSpace;

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeProjectViewPatch {
    pub zoom: f32,
    #[serde(default)]
    pub pan_x: f32,
    #[serde(default)]
    pub pan_y: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeProjectSpacePatch {
    pub ids: Vec<String>,
    #[serde(default = "default_project_space")]
    pub project: bool,
}

fn default_project_space() -> bool {
    true
}

/// `atome_rect_transform` maps logical (x, y) to world (x - W/2, H/2 - y). The
/// view affine on logical pixels therefore becomes, in world space, a uniform
/// scale by `zoom` followed by this translation.
pub fn compose_project_view(view: &AtomeProjectView, surface: Vec2, transform: &Transform) -> Transform {
    let zoom = view.zoom;
    let offset = Vec2::new(
        (zoom - 1.0) * surface.x * 0.5 + view.pan.x,
        (1.0 - zoom) * surface.y * 0.5 - view.pan.y,
    );
    Transform {
        translation: Vec3::new(
            transform.translation.x * zoom + offset.x,
            transform.translation.y * zoom + offset.y,
            transform.translation.z,
        ),
        rotation: transform.rotation,
        scale: Vec3::new(transform.scale.x * zoom, transform.scale.y * zoom, transform.scale.z),
    }
}

pub fn apply_project_view(world: &mut World, patch: AtomeProjectViewPatch) -> Result<(), String> {
    if !patch.zoom.is_finite() || !patch.pan_x.is_finite() || !patch.pan_y.is_finite() {
        return Err("bevy_project_view_not_finite".to_string());
    }
    let next = AtomeProjectView {
        zoom: patch.zoom.clamp(PROJECT_VIEW_MIN_ZOOM, PROJECT_VIEW_MAX_ZOOM),
        pan: Vec2::new(patch.pan_x, patch.pan_y),
    };
    let mut view = world.resource_mut::<AtomeProjectView>();
    if *view != next {
        *view = next;
    }
    Ok(())
}

fn owned_entities(world: &World, owner: Entity) -> Vec<Entity> {
    let mut entities = vec![owner];
    if let Some(overlay) = world.get::<AtomeSelectionOverlay>(owner) {
        entities.extend(overlay.entities.iter().copied());
    }
    if let Some(overlay) = world.get::<AtomeShapeShadowOverlay>(owner) {
        entities.extend(overlay.entities.iter().copied());
    }
    if let Some(overlay) = world.get::<AtomeWaveformPlaybackOverlay>(owner) {
        entities.extend(overlay.entities.iter().copied());
    }
    if let Some(proxy) = world.get::<AtomeClipPolygonProxy>(owner) {
        entities.push(proxy.0);
    }
    entities
}

pub fn apply_project_space(world: &mut World, patch: AtomeProjectSpacePatch) -> Result<(), String> {
    for id in patch.ids {
        let entity = world
            .resource::<AtomeEntityTable>()
            .by_id
            .get(&id)
            .copied()
            .ok_or_else(|| format!("bevy_project_space_entity_missing:{id}"))?;
        if patch.project {
            world.entity_mut(entity).insert(AtomeProjectSpace);
        } else if world.get::<AtomeProjectSpace>(entity).is_some() {
            world.entity_mut(entity).remove::<AtomeProjectSpace>();
            // Back to screen space: the global must stop carrying the view.
            for owned in owned_entities(world, entity) {
                if let Some(transform) = world.get::<Transform>(owned).copied() {
                    world.entity_mut(owned).insert(GlobalTransform::from(transform));
                }
            }
        }
    }
    Ok(())
}

/// Runs after transform propagation (and the clip proxy copy), before
/// visibility: culling and extraction then see the viewed globals.
pub fn sync_project_view_globals(world: &mut World) {
    let view = *world.resource::<AtomeProjectView>();
    let view_changed = world.is_resource_changed::<AtomeProjectView>();
    // At identity Bevy's own propagation already wrote global = local; only the
    // frame that RETURNS to identity must rewrite them.
    if view.is_identity() && !view_changed {
        return;
    }
    let surface = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        Vec2::new(config.width, config.height)
    };
    let owners: Vec<Entity> =
        world.query_filtered::<Entity, With<AtomeProjectSpace>>().iter(world).collect();
    for owner in owners {
        for entity in owned_entities(world, owner) {
            let Some(transform) = world.get::<Transform>(entity).copied() else { continue };
            let global = GlobalTransform::from(compose_project_view(&view, surface, &transform));
            if world.get::<GlobalTransform>(entity) != Some(&global) {
                world.entity_mut(entity).insert(global);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render_math::atome_rect_transform;

    fn logical_of(t: &Transform, surface: Vec2, size: Vec2) -> Vec2 {
        // Inverse of atome_rect_transform for an unrotated rect: top-left logical corner.
        Vec2::new(t.translation.x + surface.x * 0.5 - size.x * t.scale.x * 0.5,
            surface.y * 0.5 - t.translation.y - size.y * t.scale.y * 0.5)
    }

    #[test]
    fn identity_view_keeps_transform() {
        let surface = Vec2::new(1280.0, 800.0);
        let t = atome_rect_transform(100.0, 50.0, 200.0, 80.0, surface.x, surface.y, 3.0);
        let out = compose_project_view(&AtomeProjectView::default(), surface, &t);
        assert!((out.translation - t.translation).length() < 1e-4);
        assert!((out.scale - t.scale).length() < 1e-6);
    }

    #[test]
    fn view_maps_logical_corner_to_zoomed_screen() {
        let surface = Vec2::new(1280.0, 800.0);
        let size = Vec2::new(200.0, 80.0);
        let t = atome_rect_transform(100.0, 50.0, size.x, size.y, surface.x, surface.y, 3.0);
        let view = AtomeProjectView { zoom: 2.0, pan: Vec2::new(-30.0, 40.0) };
        let out = compose_project_view(&view, surface, &t);
        // screen = project * zoom + pan
        let corner = logical_of(&out, surface, size);
        assert!((corner - Vec2::new(100.0 * 2.0 - 30.0, 50.0 * 2.0 + 40.0)).length() < 1e-3, "{corner:?}");
        assert!((out.translation.z - t.translation.z).abs() < 1e-6, "depth must not be scaled");
        assert!((out.scale.x - t.scale.x * 2.0).abs() < 1e-6);
    }

    #[test]
    fn zoom_is_clamped_and_non_finite_rejected() {
        let mut world = World::new();
        world.init_resource::<AtomeProjectView>();
        apply_project_view(&mut world, AtomeProjectViewPatch { zoom: 1000.0, pan_x: 0.0, pan_y: 0.0 }).unwrap();
        assert_eq!(world.resource::<AtomeProjectView>().zoom, PROJECT_VIEW_MAX_ZOOM);
        assert!(apply_project_view(&mut world, AtomeProjectViewPatch { zoom: f32::NAN, pan_x: 0.0, pan_y: 0.0 }).is_err());
    }

    #[test]
    fn only_project_space_entities_follow_the_view() {
        let mut world = World::new();
        world.init_resource::<AtomeProjectView>();
        world.insert_resource(AtomeBevyRendererConfig::empty(1280.0, 800.0));
        world.init_resource::<AtomeEntityTable>();
        let t = atome_rect_transform(10.0, 10.0, 20.0, 20.0, 1280.0, 800.0, 0.0);
        let atom = world.spawn((t, GlobalTransform::from(t))).id();
        let ui = world.spawn((t, GlobalTransform::from(t))).id();
        world.resource_mut::<AtomeEntityTable>().by_id.insert("atom".into(), atom);
        apply_project_space(&mut world, AtomeProjectSpacePatch { ids: vec!["atom".into()], project: true }).unwrap();
        apply_project_view(&mut world, AtomeProjectViewPatch { zoom: 3.0, pan_x: 5.0, pan_y: 7.0 }).unwrap();
        sync_project_view_globals(&mut world);
        assert_ne!(*world.get::<GlobalTransform>(atom).unwrap(), GlobalTransform::from(t));
        assert_eq!(*world.get::<GlobalTransform>(ui).unwrap(), GlobalTransform::from(t));
        // leaving project space restores the plain global
        apply_project_space(&mut world, AtomeProjectSpacePatch { ids: vec!["atom".into()], project: false }).unwrap();
        assert_eq!(*world.get::<GlobalTransform>(atom).unwrap(), GlobalTransform::from(t));
    }
}
