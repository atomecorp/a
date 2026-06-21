use bevy::{image::Image, prelude::*, text::TextBounds};

use crate::{
    background::{apply_surface_background, resize_surface_background},
    render_math::{atome_rect_transform_with_local, color_from_rgba, depth_for_layer},
    selection_overlay::{rebuild_selection_overlay, remove_selection_overlay},
    spawn::spawn_node_in_world,
    texture::image_handle_from_texture,
    types::*,
    video_external_texture::{
        insert_video_external_texture_component_for_node, insert_video_quad_mesh,
    },
    waveform_playback_overlay::{
        rebuild_waveform_playback_overlay, remove_waveform_playback_overlay,
    },
};

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
    remove_waveform_playback_overlay(world, entity);
    world.despawn(entity);
    Ok(())
}

pub fn apply_transform(world: &mut World, patch: AtomeTransformPatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    let width = patch.logical_size[0].max(1.0);
    let height = patch.logical_size[1].max(1.0);
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
    if let Some(mut bounds) = world.get_mut::<TextBounds>(entity) {
        *bounds = TextBounds::from(Vec2::new(width, height));
    }
    rebuild_selection_overlay(world, entity)?;
    rebuild_waveform_playback_overlay(world, entity)?;
    Ok(())
}

pub fn apply_surface(world: &mut World, patch: AtomeSurfacePatch) -> Result<(), String> {
    let width = patch.width.max(1.0);
    let height = patch.height.max(1.0);
    {
        let mut config = world.resource_mut::<AtomeBevyRendererConfig>();
        config.width = width;
        config.height = height;
    }
    if let Some(mut window) = world.query::<&mut Window>().iter_mut(world).next() {
        window.resolution.set(width, height);
    }
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
        rebuild_selection_overlay(world, entity)?;
        rebuild_waveform_playback_overlay(world, entity)?;
    }
    resize_surface_background(world);
    Ok(())
}

pub fn apply_style(world: &mut World, patch: AtomeStylePatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    if let Some(color) = patch.color {
        if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
            sprite.color = color_from_rgba(color);
        }
        if let Some(mut text_color) = world.get_mut::<TextColor>(entity) {
            text_color.0 = color_from_rgba(color);
        }
    }
    if let Some(selected) = patch.selected {
        if let Some(mut current) = world.get_mut::<AtomeSelected>(entity) {
            current.0 = selected;
        }
        rebuild_selection_overlay(world, entity)?;
    }
    if let Some(opacity) = patch.opacity {
        if let Some(mut video) =
            world.get_mut::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
        {
            video.opacity = normalize_opacity(opacity);
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
    rebuild_selection_overlay(world, entity)?;
    rebuild_waveform_playback_overlay(world, entity)?;
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
        rebuild_waveform_playback_overlay(world, entity)?;
    } else {
        remove_selection_overlay(world, entity);
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
        if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
            sprite.image = handle;
            sprite.color = Color::WHITE;
        }
    }
    Ok(())
}

pub fn apply_resource(world: &mut World, patch: AtomeResourcePatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    let source = patch
        .source
        .clone()
        .filter(|value| !value.trim().is_empty());
    if let Some(mut media_source) = world.get_mut::<AtomeMediaSource>(entity) {
        media_source.0 = source.clone();
    }
    if let Some(peaks) = patch.peaks {
        if let Some(mut waveform) = world.get_mut::<AtomeWaveformPeaks>(entity) {
            waveform.0 = peaks;
        }
    }
    let kind = world
        .get::<AtomeRenderKind>(entity)
        .map(|value| value.0.clone())
        .unwrap_or_default();
    if kind == "video" {
        let _source = source
            .as_ref()
            .ok_or_else(|| format!("bevy_media_source_required:{}", patch.id))?;
        let layer = world
            .get::<AtomeLayer>(entity)
            .map(|value| value.0)
            .unwrap_or(0);
        let opacity = world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .map(|value| value.opacity)
            .unwrap_or_else(default_opacity);
        let current_uv_rect = world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .map(|value| value.uv_rect)
            .unwrap_or_else(default_uv_rect);
        let current_filters = world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .map(|value| value.filters);
        let current_transition = world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .map(|value| value.transition);
        let local_transform = world
            .get::<AtomeLocalTransform>(entity)
            .copied()
            .unwrap_or_default();
        let uv_rect = match patch.uv_rect {
            Some(value) => normalize_uv_rect(value),
            None => current_uv_rect,
        };
        let size = world
            .get::<AtomeLogicalSize>(entity)
            .map(|value| [value.width, value.height])
            .unwrap_or([1.0, 1.0]);
        let node = AtomeRenderNode {
            id: patch.id,
            kind,
            parent_id: None,
            logical_position: [0.0, 0.0],
            logical_size: [1.0, 1.0],
            scale: local_transform.scale,
            rotation: local_transform.rotation,
            origin: local_transform.origin,
            layer,
            opacity,
            corner_radius: 0.0,
            color: None,
            text: None,
            source,
            texture_size: patch.texture_size,
            uv_rect: Some(uv_rect),
            texture: None,
            peaks: None,
            playback_progress: None,
            selected: None,
            filters: current_filters,
            transition: current_transition,
        };
        insert_video_external_texture_component_for_node(world, entity, &node);
        insert_video_quad_mesh(world, entity, size, uv_rect)?;
        return Ok(());
    }
    if kind == "image" || kind == "audio_waveform" {
        if kind == "image" {
            let _source =
                source.ok_or_else(|| format!("bevy_media_source_required:{}", patch.id))?;
        }
        let handle = {
            let mut images = world
                .get_resource_mut::<Assets<Image>>()
                .ok_or_else(|| "bevy_image_assets_required".to_string())?;
            image_handle_from_texture(&mut images, &patch.texture, &patch.id)?
        };
        let mut sprite = world
            .get_mut::<Sprite>(entity)
            .ok_or_else(|| format!("bevy_resource_sprite_missing:{}", patch.id))?;
        sprite.image = handle;
        sprite.color = Color::WHITE;
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
    }
}
