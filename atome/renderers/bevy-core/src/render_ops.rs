use bevy::{image::Image, prelude::*, text::TextBounds};

use crate::{
    render_math::{atome_rect_transform, color_from_rgba, depth_for_layer},
    selection_overlay::{rebuild_selection_overlay, remove_selection_overlay},
    spawn::spawn_node_in_world,
    texture::image_handle_from_texture,
    types::*,
    video_texture::{video_image_handle_from_size, AtomeVideoTexture},
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
    let mut transform = world
        .get_mut::<Transform>(entity)
        .ok_or_else(|| format!("bevy_transform_component_missing:{}", patch.id))?;
    transform.translation = atome_rect_transform(
        patch.logical_position[0],
        patch.logical_position[1],
        width,
        height,
        surface_width,
        surface_height,
        depth_for_layer(layer),
    )
    .translation;
    if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
        sprite.custom_size = Some(Vec2::new(width, height));
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
        let mut transform = world
            .get_mut::<Transform>(entity)
            .ok_or_else(|| format!("bevy_surface_transform_missing:{id}"))?;
        transform.translation = atome_rect_transform(
            position.x,
            position.y,
            size.width,
            size.height,
            width,
            height,
            depth_for_layer(layer),
        )
        .translation;
        rebuild_selection_overlay(world, entity)?;
        rebuild_waveform_playback_overlay(world, entity)?;
    }
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
    let mut transform = world
        .get_mut::<Transform>(entity)
        .ok_or_else(|| format!("bevy_layer_transform_missing:{}", patch.id))?;
    transform.translation.z = depth_for_layer(patch.layer);
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
        let _source = source.ok_or_else(|| format!("bevy_media_source_required:{}", patch.id))?;
        let handle = if let Some(texture_size) = patch.texture_size {
            let handle = {
                let mut images = world
                    .get_resource_mut::<Assets<Image>>()
                    .ok_or_else(|| "bevy_image_assets_required".to_string())?;
                video_image_handle_from_size(&mut images, texture_size)
                    .ok_or_else(|| format!("bevy_video_texture_create_failed:{}", patch.id))?
            };
            let mut sprite = world
                .get_mut::<Sprite>(entity)
                .ok_or_else(|| format!("bevy_resource_sprite_missing:{}", patch.id))?;
            sprite.image = handle.clone();
            sprite.color = Color::WHITE;
            handle
        } else {
            world
                .get::<Sprite>(entity)
                .ok_or_else(|| format!("bevy_resource_sprite_missing:{}", patch.id))?
                .image
                .clone()
        };
        world.entity_mut(entity).insert(AtomeVideoTexture {
            id: patch.id,
            handle,
        });
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
    }
}
