//! The bounded cache of silhouette shadow textures: two shapes casting the same
//! shadow (size, rounding, variant, blur, spread, offset, colour) share one.
use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::{
    components::{AtomeShapeShadowCacheKey, AtomeShapeShadowTextureCache},
    shadow_texture::{
        build_block_shadow_texture_rgba_for_silhouette, build_gaussian_shadow_texture_rgba_for_silhouette,
        channel_to_u8,
    },
    shape_sdf::AtomeShapeSilhouette,
    types::AtomeShadowStyle,
};

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
    silhouette: &AtomeShapeSilhouette,
) -> AtomeShapeShadowCacheKey {
    AtomeShapeShadowCacheKey {
        kind: u8::from(shadow.kind == crate::types::AtomeShadowKind::Block),
        invert: shadow.invert,
        width: cache_dimension(silhouette.width),
        height: cache_dimension(silhouette.height),
        corner_radii: silhouette.corner_radii.map(cache_scalar),
        variant: silhouette.geometry.variant.cache_code(),
        star_branches: silhouette.geometry.star_branches,
        star_inner_radius: (silhouette.geometry.star_inner_radius * 100.0).round() as u32,
        polygon_sides: silhouette.geometry.polygon_sides,
        blur: cache_scalar(shadow.blur),
        spread: cache_signed_scalar(shadow.spread),
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

pub(crate) fn cached_shape_shadow_handle(
    world: &mut World,
    shadow: AtomeShadowStyle,
    silhouette: &AtomeShapeSilhouette,
) -> Result<Option<(Handle<Image>, u32, u32)>, String> {
    let key = shape_shadow_cache_key(shadow, silhouette);
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
    let grown = AtomeShapeSilhouette {
        width: (silhouette.width + shadow.spread * 2.0).max(1.0),
        height: (silhouette.height + shadow.spread * 2.0).max(1.0),
        corner_radii: silhouette.corner_radii.map(|radius|
            if radius > 0.0 { (radius + shadow.spread).max(0.0) } else { 0.0 }),
        geometry: silhouette.geometry,
    };
    // Block keeps its hard silhouette. Drop blurs then excludes the owner's
    // interior, including when spread and offset move the shadow relative to it.
    let texture = if shadow.kind == crate::types::AtomeShadowKind::Block {
        build_block_shadow_texture_rgba_for_silhouette(
            &grown,
            shadow.color,
            shadow.spread,
            shadow.invert,
        )
    } else {
        build_gaussian_shadow_texture_rgba_for_silhouette(
            &grown,
            shadow.color,
            shadow.blur,
            Some((silhouette, [shadow.offset_x - shadow.spread, shadow.offset_y - shadow.spread])),
        )
    };
    let Some((image_width, image_height, rgba)) = texture else {
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
