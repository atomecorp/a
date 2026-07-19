use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    prelude::*,
    render::batching::NoAutomaticBatching,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::{
    components::{
        AtomeCornerRadius, AtomeShapeShadow, AtomeShapeShadowCacheKey, AtomeShapeShadowOverlay,
        AtomeShapeShadowTextureCache, AtomeVisualOpacity,
    },
    render_math::{atome_rect_transform, depth_for_layer},
    shadow_texture::{build_gaussian_shadow_texture_rgba, channel_to_u8, shadow_padding},
    types::{
        normalize_opacity, AtomeBevyRendererConfig, AtomeLayer, AtomeLogicalPosition,
        AtomeLogicalSize, AtomeShadowStyle,
    },
};

fn shadow_depth_for_layer(layer: i32) -> f32 {
    depth_for_layer(layer) - 0.25
}

fn cache_dimension(value: f32) -> u32 {
    value.max(1.0).round() as u32
}

fn cache_scalar(value: f32) -> u32 {
    (value.max(0.0) * 100.0).round() as u32
}

fn cache_signed_scalar(value: f32) -> i32 {
    (value * 100.0).round() as i32
}

fn shape_shadow_cache_key(
    shadow: AtomeShadowStyle,
    shadow_width: f32,
    shadow_height: f32,
    corner_radius: f32,
) -> AtomeShapeShadowCacheKey {
    AtomeShapeShadowCacheKey {
        width: cache_dimension(shadow_width),
        height: cache_dimension(shadow_height),
        corner_radius: cache_scalar(corner_radius),
        blur: cache_scalar(shadow.blur),
        spread: cache_scalar(shadow.spread),
        offset_x: cache_signed_scalar(shadow.offset_x),
        offset_y: cache_signed_scalar(shadow.offset_y),
        color: [
            channel_to_u8(shadow.color[0]),
            channel_to_u8(shadow.color[1]),
            channel_to_u8(shadow.color[2]),
            channel_to_u8(shadow.color[3]),
        ],
    }
}

fn cached_shape_shadow_handle(
    world: &mut World,
    shadow: AtomeShadowStyle,
    shadow_width: f32,
    shadow_height: f32,
    corner_radius: f32,
) -> Result<Option<(Handle<Image>, u32, u32)>, String> {
    let key = shape_shadow_cache_key(shadow, shadow_width, shadow_height, corner_radius);
    if let Some(handle) = world
        .get_resource::<AtomeShapeShadowTextureCache>()
        .and_then(|cache| cache.handles.get(&key))
        .cloned()
    {
        if let Some(image) = world
            .get_resource::<Assets<Image>>()
            .and_then(|images| images.get(&handle))
        {
            return Ok(Some((
                handle,
                image.texture_descriptor.size.width,
                image.texture_descriptor.size.height,
            )));
        }
        let mut cache = world.resource_mut::<AtomeShapeShadowTextureCache>();
        cache.handles.remove(&key);
        cache.order.retain(|existing| existing != &key);
        cache.total_bytes = cache
            .total_bytes
            .saturating_sub(cache.byte_sizes.remove(&key).unwrap_or(0));
    }
    let Some((image_width, image_height, rgba)) = build_gaussian_shadow_texture_rgba(
        shadow.color,
        shadow_width,
        shadow_height,
        corner_radius,
        shadow.blur,
    ) else {
        return Ok(None);
    };
    let image = Image::new(
        Extent3d {
            width: image_width,
            height: image_height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        rgba,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    let handle = {
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_shape_shadow_image_assets_required".to_string())?;
        images.add(image)
    };
    if world
        .get_resource::<AtomeShapeShadowTextureCache>()
        .is_none()
    {
        world.insert_resource(AtomeShapeShadowTextureCache::default());
    }
    let mut cache = world.resource_mut::<AtomeShapeShadowTextureCache>();
    let byte_size = image_width as usize * image_height as usize * 4;
    if byte_size > cache.max_bytes {
        return Ok(Some((handle, image_width, image_height)));
    }
    cache.order.retain(|existing| existing != &key);
    if let Some(previous_size) = cache.byte_sizes.remove(&key) {
        cache.total_bytes = cache.total_bytes.saturating_sub(previous_size);
    }
    cache.order.push_back(key.clone());
    cache.handles.insert(key.clone(), handle.clone());
    cache.byte_sizes.insert(key.clone(), byte_size);
    cache.total_bytes += byte_size;
    while cache.order.len() > cache.max_entries || cache.total_bytes > cache.max_bytes {
        if let Some(oldest) = cache.order.pop_front() {
            cache.handles.remove(&oldest);
            cache.total_bytes = cache
                .total_bytes
                .saturating_sub(cache.byte_sizes.remove(&oldest).unwrap_or(0));
        }
    }
    Ok(Some((handle, image_width, image_height)))
}

#[cfg(test)]
pub(crate) fn build_shape_shadow_texture_rgba(
    style: crate::types::SelectionVisualStyle,
    width: f32,
    height: f32,
    corner_radius: f32,
) -> Option<(u32, u32, Vec<u8>)> {
    build_gaussian_shadow_texture_rgba(
        style.shadow_color,
        width,
        height,
        corner_radius,
        style.shadow_size,
    )
}

pub fn remove_shape_shadow_overlay(world: &mut World, entity: Entity) {
    if let Some(overlay) = world.get::<AtomeShapeShadowOverlay>(entity).cloned() {
        for overlay_entity in overlay.entities {
            if world.get_entity(overlay_entity).is_ok() {
                world.despawn(overlay_entity);
            }
        }
        world.entity_mut(entity).remove::<AtomeShapeShadowOverlay>();
    }
}

pub fn sync_shape_shadow_overlay_transform(
    world: &mut World,
    entity: Entity,
) -> Result<(), String> {
    let Some(overlay) = world.get::<AtomeShapeShadowOverlay>(entity).cloned() else {
        if world
            .get::<AtomeShapeShadow>(entity)
            .and_then(|value| value.0)
            .and_then(|value| value.normalized())
            .is_none()
        {
            return Ok(());
        }
        return rebuild_shape_shadow_overlay(world, entity);
    };
    let Some(shadow) = world
        .get::<AtomeShapeShadow>(entity)
        .and_then(|value| value.0)
        .and_then(|value| value.normalized())
    else {
        remove_shape_shadow_overlay(world, entity);
        return Ok(());
    };
    let position = *world
        .get::<AtomeLogicalPosition>(entity)
        .ok_or_else(|| "bevy_shape_shadow_position_missing".to_string())?;
    let size = *world
        .get::<AtomeLogicalSize>(entity)
        .ok_or_else(|| "bevy_shape_shadow_size_missing".to_string())?;
    let layer = world
        .get::<AtomeLayer>(entity)
        .map(|value| value.0)
        .unwrap_or(0);
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let shadow_width = size.width.max(1.0) + shadow.spread * 2.0;
    let shadow_height = size.height.max(1.0) + shadow.spread * 2.0;
    let padding = shadow_padding(shadow.blur) as f32;
    let image_width = (shadow_width + padding * 2.0).ceil();
    let image_height = (shadow_height + padding * 2.0).ceil();
    let shadow_x = position.x + shadow.offset_x - shadow.spread - padding;
    let shadow_y = position.y + shadow.offset_y - shadow.spread - padding;
    for overlay_entity in overlay.entities {
        if world.get_entity(overlay_entity).is_ok() {
            world
                .entity_mut(overlay_entity)
                .insert(atome_rect_transform(
                    shadow_x,
                    shadow_y,
                    image_width,
                    image_height,
                    surface_width,
                    surface_height,
                    shadow_depth_for_layer(layer),
                ));
        }
    }
    Ok(())
}

pub fn sync_shape_shadow_overlay_opacity(world: &mut World, entity: Entity, opacity: f32) {
    let normalized_opacity = normalize_opacity(opacity);
    let overlay_entities = world
        .get::<AtomeShapeShadowOverlay>(entity)
        .map(|overlay| overlay.entities.clone())
        .unwrap_or_default();
    for overlay_entity in overlay_entities {
        if let Some(mut sprite) = world.get_mut::<Sprite>(overlay_entity) {
            sprite.color = Color::srgba(1.0, 1.0, 1.0, normalized_opacity);
        }
    }
}

pub fn rebuild_shape_shadow_overlay(world: &mut World, entity: Entity) -> Result<(), String> {
    remove_shape_shadow_overlay(world, entity);
    if world
        .get::<Visibility>(entity)
        .map(|visibility| matches!(visibility, Visibility::Hidden))
        .unwrap_or(false)
    {
        return Ok(());
    }
    let Some(shadow) = world
        .get::<AtomeShapeShadow>(entity)
        .and_then(|value| value.0)
        .and_then(|value| value.normalized())
    else {
        return Ok(());
    };
    let position = *world
        .get::<AtomeLogicalPosition>(entity)
        .ok_or_else(|| "bevy_shape_shadow_position_missing".to_string())?;
    let size = *world
        .get::<AtomeLogicalSize>(entity)
        .ok_or_else(|| "bevy_shape_shadow_size_missing".to_string())?;
    let layer = world
        .get::<AtomeLayer>(entity)
        .map(|value| value.0)
        .unwrap_or(0);
    let opacity = world
        .get::<AtomeVisualOpacity>(entity)
        .map(|value| value.0)
        .unwrap_or_else(|| normalize_opacity(1.0));
    let shadow_width = size.width.max(1.0) + shadow.spread * 2.0;
    let shadow_height = size.height.max(1.0) + shadow.spread * 2.0;
    let corner_radius = world
        .get::<AtomeCornerRadius>(entity)
        .map(|value| value.0)
        .unwrap_or(0.0)
        + shadow.spread;
    let Some((handle, image_width, image_height)) =
        cached_shape_shadow_handle(world, shadow, shadow_width, shadow_height, corner_radius)?
    else {
        return Ok(());
    };
    let mut sprite = Sprite::from_image(handle.clone());
    sprite.custom_size = Some(Vec2::new(image_width as f32, image_height as f32));
    sprite.color = Color::srgba(1.0, 1.0, 1.0, opacity);
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let padding = shadow_padding(shadow.blur) as f32;
    let shadow_x = position.x + shadow.offset_x - shadow.spread - padding;
    let shadow_y = position.y + shadow.offset_y - shadow.spread - padding;
    let shadow_entity = world
        .spawn((
            sprite,
            NoAutomaticBatching,
            atome_rect_transform(
                shadow_x,
                shadow_y,
                image_width as f32,
                image_height as f32,
                surface_width,
                surface_height,
                shadow_depth_for_layer(layer),
            ),
        ))
        .id();
    if world
        .get::<bevy::camera::visibility::RenderLayers>(entity)
        .is_some_and(|layers| layers.intersects(&bevy::camera::visibility::RenderLayers::layer(crate::workspace_backdrop::FLOWER_PRESENTATION_LAYER)))
    {
        world.entity_mut(shadow_entity).insert(bevy::camera::visibility::RenderLayers::layer(
            crate::workspace_backdrop::FLOWER_PRESENTATION_LAYER,
        ));
    }
    world.entity_mut(entity).insert(AtomeShapeShadowOverlay {
        entities: vec![shadow_entity],
        image_handles: vec![handle],
    });
    Ok(())
}
