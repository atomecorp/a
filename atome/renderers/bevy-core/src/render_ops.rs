use bevy::{image::Image, prelude::*, text::TextBounds};

use crate::{
    backdrop_surface::{patch_backdrop_surface, refresh_workspace_backdrop_enabled, resize_backdrop_surface},
    backdrop_blur::apply_scene_effects,
    background::{apply_surface_background, resize_surface_background},
    procedural_sdf::{patch_procedural_sdf, resize_procedural_sdf},
    render_math::{
        atome_camera_projection, atome_rect_transform_with_local, color_from_rgba, depth_for_layer,
    },
    resource_ops::texture_sprite_color,
    selection_overlay::{
        rebuild_selection_overlay, remove_selection_overlay, translate_selection_overlay,
    },
    shape_shadow_overlay::{
        rebuild_shape_shadow_overlay, remove_shape_shadow_overlay,
        sync_shape_shadow_overlay_opacity, sync_shape_shadow_overlay_transform,
    },
    spawn::spawn_node_in_world,
    texture::image_handle_from_texture,
    types::*,
    video_external_texture::insert_video_quad_mesh,
    waveform_playback_overlay::{
        rebuild_waveform_playback_overlay, remove_waveform_playback_overlay,
    },
};
use crate::workspace_backdrop::resize_workspace_backdrop;

pub use crate::resource_ops::apply_resource;

fn entity_for(world: &World, id: &str) -> Result<Entity, String> {
    world
        .resource::<AtomeEntityTable>()
        .by_id
        .get(id)
        .copied()
        .ok_or_else(|| format!("bevy_atome_entity_missing:{id}"))
}

fn sync_global_transform(world: &mut World, entity: Entity, transform: Transform) {
    world
        .entity_mut(entity)
        .insert(GlobalTransform::from(transform));
}

fn transform_for_rect(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    surface_width: f32,
    surface_height: f32,
    layer: i32,
    local: AtomeLocalTransform,
) -> Transform {
    atome_rect_transform_with_local(
        x,
        y,
        width,
        height,
        surface_width,
        surface_height,
        depth_for_layer(layer),
        local.scale,
        local.rotation,
        local.origin,
    )
}

pub fn apply_spawn(world: &mut World, node: AtomeRenderNode) -> Result<Entity, String> {
    if node.id.trim().is_empty() {
        return Err("bevy_spawn_id_required".to_string());
    }
    if world
        .resource::<AtomeEntityTable>()
        .by_id
        .contains_key(&node.id)
    {
        return Err(format!("bevy_spawn_duplicate_id:{}", node.id));
    }
    spawn_node_in_world(world, node)
}

pub fn apply_despawn(world: &mut World, id: &str) -> Result<(), String> {
    let entity = world
        .resource_mut::<AtomeEntityTable>()
        .by_id
        .remove(id)
        .ok_or_else(|| format!("bevy_despawn_entity_missing:{id}"))?;
    remove_selection_overlay(world, entity);
    remove_shape_shadow_overlay(world, entity);
    remove_waveform_playback_overlay(world, entity);
    world.despawn(entity);
    refresh_workspace_backdrop_enabled(world)?;
    Ok(())
}

pub fn apply_transform(world: &mut World, patch: AtomeTransformPatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    let width = patch.logical_size[0].max(1.0);
    let height = patch.logical_size[1].max(1.0);
    let previous_size = *world
        .get::<AtomeLogicalSize>(entity)
        .ok_or_else(|| format!("bevy_transform_size_missing:{}", patch.id))?;
    let previous_position = *world
        .get::<AtomeLogicalPosition>(entity)
        .ok_or_else(|| format!("bevy_transform_position_missing:{}", patch.id))?;
    let previous_local_transform = world
        .get::<AtomeLocalTransform>(entity)
        .copied()
        .ok_or_else(|| format!("bevy_transform_local_missing:{}", patch.id))?;
    let layer = world
        .get::<AtomeLayer>(entity)
        .map(|value| value.0)
        .unwrap_or(0);
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    *world
        .get_mut::<AtomeLogicalSize>(entity)
        .ok_or_else(|| format!("bevy_transform_size_missing:{}", patch.id))? =
        AtomeLogicalSize { width, height };
    *world
        .get_mut::<AtomeLogicalPosition>(entity)
        .ok_or_else(|| format!("bevy_transform_position_missing:{}", patch.id))? =
        AtomeLogicalPosition {
            x: patch.logical_position[0],
            y: patch.logical_position[1],
        };
    let local_transform = AtomeLocalTransform::new(patch.scale, patch.rotation, patch.origin);
    *world
        .get_mut::<AtomeLocalTransform>(entity)
        .ok_or_else(|| format!("bevy_transform_local_missing:{}", patch.id))? = local_transform;
    let next_transform = transform_for_rect(
        patch.logical_position[0],
        patch.logical_position[1],
        width,
        height,
        surface_width,
        surface_height,
        layer,
        local_transform,
    );
    if world.get::<Transform>(entity).is_none() {
        return Err(format!("bevy_transform_component_missing:{}", patch.id));
    }
    world.entity_mut(entity).insert(next_transform);
    sync_global_transform(world, entity, next_transform);
    let dimensions_changed =
        (previous_size.width - width).abs() > 0.01 || (previous_size.height - height).abs() > 0.01;
    let local_transform_changed = previous_local_transform != local_transform;
    if dimensions_changed {
        if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
            sprite.custom_size = Some(Vec2::new(width, height));
        }
        if world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .is_some()
        {
            let uv_rect = world
                .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
                .map(|video| video.uv_rect)
                .unwrap_or_else(default_uv_rect);
            insert_video_quad_mesh(world, entity, [width, height], uv_rect)?;
        }
        resize_procedural_sdf(world, entity, [width, height])?;
        resize_backdrop_surface(world, entity, [width, height])?;
        if let Some(mut bounds) = world.get_mut::<TextBounds>(entity) {
            *bounds = TextBounds::from(Vec2::new(width, height));
        }
    }
    if dimensions_changed || local_transform_changed {
        rebuild_selection_overlay(world, entity)?;
        rebuild_shape_shadow_overlay(world, entity)?;
        rebuild_waveform_playback_overlay(world, entity)?;
    } else {
        translate_selection_overlay(
            world,
            entity,
            patch.logical_position[0] - previous_position.x,
            patch.logical_position[1] - previous_position.y,
        );
        sync_shape_shadow_overlay_transform(world, entity)?;
        if world.get::<AtomeWaveformPlaybackOverlay>(entity).is_some() {
            rebuild_waveform_playback_overlay(world, entity)?;
        }
    }
    Ok(())
}

pub fn apply_surface(world: &mut World, patch: AtomeSurfacePatch) -> Result<(), String> {
    let width = normalize_surface_logical(patch.width);
    let height = normalize_surface_logical(patch.height);
    let current_dpr = world
        .get_resource::<AtomeBevyRendererConfig>()
        .map(|config| config.device_pixel_ratio)
        .unwrap_or(1.0);
    let device_pixel_ratio = normalize_surface_dpr(patch.device_pixel_ratio.unwrap_or(current_dpr));
    let pixel_width = normalize_surface_pixel(
        patch.pixel_width.unwrap_or(width * device_pixel_ratio),
        width * device_pixel_ratio,
    );
    let pixel_height = normalize_surface_pixel(
        patch.pixel_height.unwrap_or(height * device_pixel_ratio),
        height * device_pixel_ratio,
    );
    {
        let mut config = world.resource_mut::<AtomeBevyRendererConfig>();
        config.width = width;
        config.height = height;
        config.pixel_width = pixel_width;
        config.pixel_height = pixel_height;
        config.device_pixel_ratio = device_pixel_ratio;
    }
    if let Some(mut window) = world.query::<&mut Window>().iter_mut(world).next() {
        window.resolution.set_scale_factor(device_pixel_ratio);
        window
            .resolution
            .set_physical_resolution(pixel_width, pixel_height);
    }
    for mut projection in world
        .query_filtered::<&mut Projection, With<Camera2d>>()
        .iter_mut(world)
    {
        *projection = atome_camera_projection(width, height);
    }
    resize_workspace_backdrop(
        world,
        Vec2::new(width, height),
        UVec2::new(pixel_width, pixel_height),
    )?;
    let ids: Vec<String> = world
        .resource::<AtomeEntityTable>()
        .by_id
        .keys()
        .cloned()
        .collect();
    for id in ids {
        let entity = entity_for(world, &id)?;
        let position = *world
            .get::<AtomeLogicalPosition>(entity)
            .ok_or_else(|| format!("bevy_surface_position_missing:{id}"))?;
        let size = *world
            .get::<AtomeLogicalSize>(entity)
            .ok_or_else(|| format!("bevy_surface_size_missing:{id}"))?;
        let layer = world
            .get::<AtomeLayer>(entity)
            .map(|value| value.0)
            .unwrap_or(0);
        let local_transform = world
            .get::<AtomeLocalTransform>(entity)
            .copied()
            .unwrap_or_default();
        let next_transform = transform_for_rect(
            position.x,
            position.y,
            size.width,
            size.height,
            width,
            height,
            layer,
            local_transform,
        );
        if world.get::<Transform>(entity).is_none() {
            return Err(format!("bevy_surface_transform_missing:{id}"));
        }
        world.entity_mut(entity).insert(next_transform);
        sync_global_transform(world, entity, next_transform);
        if world.get::<AtomeSelectionOverlay>(entity).is_some() {
            rebuild_selection_overlay(world, entity)?;
        }
        sync_shape_shadow_overlay_transform(world, entity)?;
        if world.get::<AtomeWaveformPlaybackOverlay>(entity).is_some() {
            rebuild_waveform_playback_overlay(world, entity)?;
        }
    }
    resize_surface_background(world);
    Ok(())
}

pub fn apply_style(world: &mut World, patch: AtomeStylePatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
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
        let mut visual_color = base_color;
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
    if let Some(progress) = patch.playback_progress {
        if let Some(mut current) = world.get_mut::<AtomeWaveformPlaybackProgress>(entity) {
            current.0 = progress.map(|value| value.clamp(0.0, 1.0));
        }
        rebuild_waveform_playback_overlay(world, entity)?;
    }
    Ok(())
}

pub fn apply_reparent(world: &mut World, patch: AtomeParentPatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    *world
        .get_mut::<AtomeParentEntityId>(entity)
        .ok_or_else(|| format!("bevy_parent_component_missing:{}", patch.id))? =
        AtomeParentEntityId(patch.parent_id);
    Ok(())
}

pub fn apply_layer(world: &mut World, patch: AtomeLayerPatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    *world
        .get_mut::<AtomeLayer>(entity)
        .ok_or_else(|| format!("bevy_layer_component_missing:{}", patch.id))? =
        AtomeLayer(patch.layer);
    let mut next_transform = *world
        .get::<Transform>(entity)
        .ok_or_else(|| format!("bevy_layer_transform_missing:{}", patch.id))?;
    next_transform.translation.z = depth_for_layer(patch.layer);
    world.entity_mut(entity).insert(next_transform);
    sync_global_transform(world, entity, next_transform);
    if let Some(mut video) =
        world.get_mut::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
    {
        video.layer = patch.layer;
    }
    if world.get::<AtomeSelectionOverlay>(entity).is_some() {
        rebuild_selection_overlay(world, entity)?;
    }
    sync_shape_shadow_overlay_transform(world, entity)?;
    if world.get::<AtomeWaveformPlaybackOverlay>(entity).is_some() {
        rebuild_waveform_playback_overlay(world, entity)?;
    }
    Ok(())
}

pub fn apply_visibility(world: &mut World, patch: AtomeVisibilityPatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    *world
        .get_mut::<Visibility>(entity)
        .ok_or_else(|| format!("bevy_visibility_component_missing:{}", patch.id))? =
        if patch.visible {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    if patch.visible {
        rebuild_selection_overlay(world, entity)?;
        rebuild_shape_shadow_overlay(world, entity)?;
        rebuild_waveform_playback_overlay(world, entity)?;
    } else {
        remove_selection_overlay(world, entity);
        remove_shape_shadow_overlay(world, entity);
        remove_waveform_playback_overlay(world, entity);
    }
    Ok(())
}

pub fn apply_text(world: &mut World, patch: AtomeTextPatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    *world
        .get_mut::<AtomeTextMetadata>(entity)
        .ok_or_else(|| format!("bevy_text_component_missing:{}", patch.id))? =
        AtomeTextMetadata(patch.text.clone());
    if let Some(mut text) = world.get_mut::<Text2d>(entity) {
        text.0 = patch.text.unwrap_or_default();
    }
    if patch.texture.is_some() {
        let handle = {
            let mut images = world
                .get_resource_mut::<Assets<Image>>()
                .ok_or_else(|| "bevy_image_assets_required".to_string())?;
            image_handle_from_texture(&mut images, &patch.texture, &patch.id)?
        };
        let color = texture_sprite_color(world, entity);
        if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
            sprite.image = handle;
            sprite.color = color;
        }
    }
    Ok(())
}

pub fn apply_render_op(world: &mut World, op: AtomeRenderOp) -> Result<(), String> {
    match op {
        AtomeRenderOp::Spawn(node) => apply_spawn(world, node).map(|_| ()),
        AtomeRenderOp::Despawn(id) => apply_despawn(world, &id),
        AtomeRenderOp::Transform(patch) => apply_transform(world, patch),
        AtomeRenderOp::Style(patch) => apply_style(world, patch),
        AtomeRenderOp::Reparent(patch) => apply_reparent(world, patch),
        AtomeRenderOp::Layer(patch) => apply_layer(world, patch),
        AtomeRenderOp::Visibility(patch) => apply_visibility(world, patch),
        AtomeRenderOp::Text(patch) => apply_text(world, patch),
        AtomeRenderOp::Resource(patch) => apply_resource(world, patch),
        AtomeRenderOp::Surface(patch) => apply_surface(world, patch),
        AtomeRenderOp::SurfaceBackground(patch) => {
            apply_surface_background(world, patch).map(|_| ())
        }
        AtomeRenderOp::SceneEffects(patch) => apply_scene_effects(world, patch),
    }
}
