use crate::{
    backdrop_surface::{
        patch_backdrop_surface, refresh_workspace_backdrop_enabled, sync_backdrop_surface_opacity,
    },
    clip::apply_entity_clip,
    procedural_sdf::patch_procedural_sdf,
    render_math::color_from_rgba,
    selection_overlay::rebuild_selection_overlay,
    shape_sdf::{
        cached_image_handle_from_shape_mask, AtomeShapeGeometry, AtomeShapeSilhouette,
        AtomeShapeVariant,
    },
    shape_shadow_overlay::{rebuild_shape_shadow_overlay, sync_shape_shadow_overlay_opacity},
    texture::uniform_corner_radii,
    types::*,
    video_external_texture::{apply_video_mask_style, AtomeVideoExternalTexture},
    waveform_playback_overlay::rebuild_waveform_playback_overlay,
};
use bevy::prelude::*;
fn entity_for(world: &World, id: &str) -> Result<Entity, String> {
    world
        .resource::<AtomeEntityTable>()
        .by_id
        .get(id)
        .copied()
        .ok_or_else(|| format!("bevy_atome_entity_missing:{id}"))
}
pub(crate) fn refresh_shape_surface(
    world: &mut World,
    entity: Entity,
    id: &str,
) -> Result<(), String> {
    let kind = world
        .get::<AtomeRenderKind>(entity)
        .map(|value| value.0.clone())
        .unwrap_or_default();
    if kind != "shape" || world.get::<Sprite>(entity).is_none() {
        return Ok(());
    }
    // Une forme qui porte une source media tient sa texture d'un resolveur :
    // sa decoupe n'est pas celle du masque, on ne la remplace pas ici.
    let has_source = world
        .get::<AtomeMediaSource>(entity)
        .and_then(|value| value.0.clone())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    if has_source {
        return Ok(());
    }
    let size = world
        .get::<AtomeLogicalSize>(entity)
        .map(|value| *value)
        .unwrap_or(AtomeLogicalSize {
            width: 1.0,
            height: 1.0,
        });
    let silhouette = AtomeShapeSilhouette {
        geometry: world
            .get::<AtomeShapeProfile>(entity)
            .map(|value| value.0)
            .unwrap_or_default(),
        width: size.width.max(1.0),
        height: size.height.max(1.0),
        corner_radii: world
            .get::<AtomeCornerRadius>(entity)
            .map(|value| value.0)
            .unwrap_or([0.0; 4]),
    };
    let paint = world
        .get::<crate::surface_paint::AtomeSurfacePaint>(entity)
        .and_then(|v| v.0.clone());
    let fill = world
        .get::<AtomeVisualColor>(entity)
        .map(|v| v.0)
        .unwrap_or([1.0; 4]);
    let handle = if let Some(paint) = paint.as_ref() {
        if let Some(mask) = world
            .get::<AtomeResolvedMask>(entity)
            .and_then(|v| v.0.clone())
        {
            let texture = crate::shape_sdf::apply_spatial_mask_to_texture(
                &paint.texture(&silhouette, fill),
                &mask,
            );
            Some(crate::texture::image_handle_from_texture(
                &mut world.resource_mut::<Assets<Image>>(),
                &Some(texture),
                id,
            )?)
        } else {
            Some(
                crate::shape_texture::cached_image_handle_from_shape_surface(
                    world,
                    &silhouette,
                    Some(paint),
                    fill,
                    id,
                )?,
            )
        }
    } else if let Some(mask) = world
        .get::<AtomeResolvedMask>(entity)
        .and_then(|v| v.0.clone())
    {
        let texture = crate::shape_sdf::apply_spatial_mask_to_texture(
            &crate::shape_sdf::shape_mask_texture(&silhouette),
            &mask,
        );
        Some(crate::texture::image_handle_from_texture(
            &mut world.resource_mut::<Assets<Image>>(),
            &Some(texture),
            id,
        )?)
    } else if silhouette.requires_mask() {
        Some(cached_image_handle_from_shape_mask(world, &silhouette, id)?)
    } else {
        None
    };
    let color = world
        .get::<AtomeVisualColor>(entity)
        .map(|value| value.0)
        .unwrap_or([1.0, 1.0, 1.0, 1.0]);
    let opacity = world
        .get::<AtomeVisualOpacity>(entity)
        .map(|value| value.0)
        .unwrap_or_else(default_opacity);
    let mut visible = if paint.is_some() { [1.0; 4] } else { color };
    visible[3] = visible[3].clamp(0.0, 1.0) * opacity;
    if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
        sprite.image = handle.unwrap_or_default();
        sprite.custom_size = Some(Vec2::new(size.width.max(1.0), size.height.max(1.0)));
        sprite.color = color_from_rgba(visible);
    }
    Ok(())
}

pub fn apply_style(world: &mut World, patch: AtomeStylePatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    let painted = world
        .get::<crate::surface_paint::AtomeSurfacePaint>(entity)
        .is_some_and(|value| value.0.is_some());
    let paint_dirty = patch.surface_paint.is_some()
        || ((patch.color.is_some() || patch.mask.is_some()) && painted);
    if let Some(paint) = patch.surface_paint.clone() {
        if paint.as_ref().is_some_and(|v| !v.valid()) {
            return Err(format!("bevy_surface_paint_invalid:{}", patch.id));
        }
        world
            .entity_mut(entity)
            .insert(crate::surface_paint::AtomeSurfacePaint(paint));
    }
    if let Some(color) = patch.color {
        if let Some(mut current) = world.get_mut::<AtomeVisualColor>(entity) {
            current.0 = color;
        }
        let opacity = world
            .get::<AtomeVisualOpacity>(entity)
            .map(|value| value.0)
            .unwrap_or_else(default_opacity);
        let mut visual_color = color;
        visual_color[3] = visual_color[3].clamp(0.0, 1.0) * normalize_opacity(opacity);
        if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
            sprite.color = color_from_rgba(visual_color);
        }
        if let Some(mut text_color) = world.get_mut::<TextColor>(entity) {
            text_color.0 = color_from_rgba(visual_color);
        }
    }
    if let Some(shadow) = patch.shadow {
        if let Some(mut current) = world.get_mut::<AtomeShapeShadow>(entity) {
            current.0 = shadow.and_then(|value| value.normalized());
        }
        rebuild_shape_shadow_overlay(world, entity)?;
    }
    if let Some(mask_patch) = patch.mask {
        let normalized = mask_patch.and_then(AtomeMaskStyle::normalized);
        if let Some(mut current) = world.get_mut::<AtomeResolvedMask>(entity) {
            current.0 = normalized.clone();
        } else {
            world
                .entity_mut(entity)
                .insert(AtomeResolvedMask(normalized.clone()));
        }
        if world.get::<AtomeVideoExternalTexture>(entity).is_some() {
            apply_video_mask_style(world, entity, normalized)?;
        }
        rebuild_shape_shadow_overlay(world, entity)?;
    }
    if let Some(Some(backdrop)) = patch.backdrop {
        patch_backdrop_surface(world, entity, backdrop)?;
    }
    if let Some(selected) = patch.selected {
        if let Some(mut current) = world.get_mut::<AtomeSelected>(entity) {
            current.0 = selected;
        }
        rebuild_selection_overlay(world, entity)?;
    }
    if let Some(opacity) = patch.opacity {
        let normalized_opacity = normalize_opacity(opacity);
        if let Some(mut current) = world.get_mut::<AtomeVisualOpacity>(entity) {
            current.0 = normalized_opacity;
        }
        let base_color = world
            .get::<AtomeVisualColor>(entity)
            .map(|value| value.0)
            .unwrap_or([1.0, 1.0, 1.0, 1.0]);
        let painted = world
            .get::<crate::surface_paint::AtomeSurfacePaint>(entity)
            .is_some_and(|p| p.0.is_some());
        let mut visual_color = if painted { [1.0; 4] } else { base_color };
        visual_color[3] = visual_color[3].clamp(0.0, 1.0) * normalized_opacity;
        if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
            sprite.color = color_from_rgba(visual_color);
        }
        if let Some(mut text_color) = world.get_mut::<TextColor>(entity) {
            text_color.0 = color_from_rgba(visual_color);
        }
        if let Some(mut video) =
            world.get_mut::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
        {
            video.opacity = normalized_opacity;
        }
        sync_shape_shadow_overlay_opacity(world, entity, normalized_opacity);
        if sync_backdrop_surface_opacity(world, entity, normalized_opacity) {
            refresh_workspace_backdrop_enabled(world)?;
        }
    }
    if let Some(filters) = patch.filters {
        if let Some(mut video) =
            world.get_mut::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
        {
            video.filters = filters.normalized();
        }
    }
    if let Some(transition) = patch.transition {
        if let Some(mut video) =
            world.get_mut::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
        {
            video.transition = transition.normalized();
        }
    }
    if let Some(procedural) = patch.procedural {
        patch_procedural_sdf(world, entity, procedural)?;
    }
    // L'arrondi et la variante de forme sont des retouches NON destructives :
    // l'objet garde son entite, sa pose et son calque, et seul son STYLE
    // change. Il faut donc re-peindre sa silhouette et refaire son ombre, sinon
    // retirer un rayon laissait les coins arrondis et changer de variante
    // gardait l'ancienne decoupe jusqu'a la reconstruction complete du noeud.
    let mut silhouette_dirty = false;
    if patch.corner_radius.is_some() || patch.corner_radii.is_some() {
        let previous = world
            .get::<AtomeCornerRadius>(entity)
            .map(|value| value.0)
            .unwrap_or([0.0; 4]);
        // Le document joint toujours le rayon scalaire a ses quatre coins ;
        // quand les coins ont ete RETIRES, c'est le scalaire qui reprend la
        // main, et zero quand l'outil a tout enleve.
        let scalar = patch
            .corner_radius
            .unwrap_or(if patch.corner_radii.is_some() {
                0.0
            } else {
                previous[0]
            });
        let radii = match patch.corner_radii {
            Some(Some(radii)) => radii.map(|value| {
                if value.is_finite() {
                    value.max(0.0)
                } else {
                    0.0
                }
            }),
            _ => uniform_corner_radii(scalar),
        };
        if let Some(mut current) = world.get_mut::<AtomeCornerRadius>(entity) {
            current.0 = radii;
        }
        silhouette_dirty = true;
    }
    if patch.shape_variant.is_some()
        || patch.star_branches.is_some()
        || patch.star_inner_radius.is_some()
        || patch.polygon_sides.is_some()
    {
        let current = world
            .get::<AtomeShapeProfile>(entity)
            .map(|value| value.0)
            .unwrap_or_default();
        let next = AtomeShapeGeometry {
            variant: patch
                .shape_variant
                .as_deref()
                .map(AtomeShapeVariant::from_name)
                .unwrap_or(current.variant),
            star_branches: patch.star_branches.unwrap_or(current.star_branches),
            star_inner_radius: patch.star_inner_radius.unwrap_or(current.star_inner_radius),
            polygon_sides: patch.polygon_sides.unwrap_or(current.polygon_sides),
        }
        .normalized();
        if let Some(mut profile) = world.get_mut::<AtomeShapeProfile>(entity) {
            profile.0 = next;
        }
        silhouette_dirty = true;
    }
    if silhouette_dirty {
        refresh_shape_surface(world, entity, &patch.id)?;
        rebuild_shape_shadow_overlay(world, entity)?;
        apply_entity_clip(world, entity)?;
    }
    if let Some(progress) = patch.playback_progress {
        if let Some(mut current) = world.get_mut::<AtomeWaveformPlaybackProgress>(entity) {
            current.0 = progress.map(|value| value.clamp(0.0, 1.0));
        }
        rebuild_waveform_playback_overlay(world, entity)?;
    }
    if paint_dirty {
        refresh_shape_surface(world, entity, &patch.id)?;
        apply_entity_clip(world, entity)?;
    }
    Ok(())
}
