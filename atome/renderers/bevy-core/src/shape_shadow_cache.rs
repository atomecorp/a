//! The bounded cache of silhouette shadow textures: two shapes casting the same
//! shadow (size, rounding, variant, blur, spread, offset, colour) share one. A drop shadow's
//! texture is written by the GPU (shape_shadow_gpu.rs); a block shadow's is painted here.
use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::{
    components::{AtomeShapeShadowCacheKey, AtomeShapeShadowTextureCache},
    shadow_texture::{
        build_block_shadow_texture_rgba_for_silhouette, channel_to_u8, shadow_padding,
    },
    shape_mask_gpu::queue_shape_mask,
    shape_sdf::AtomeShapeSilhouette,
    shape_shadow_gpu::{
        ShadowBlurJob, queue_shadow_blur, shadow_blur_uniform, shadow_target_image,
    },
    shape_texture::cached_image_handle_from_shape_mask,
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
        corner_radii: silhouette.corner_radii.map(|radius| {
            if radius > 0.0 {
                (radius + shadow.spread).max(0.0)
            } else {
                0.0
            }
        }),
        geometry: silhouette.geometry,
    };
    // Block keeps its hard silhouette, painted on the CPU. A drop shadow is blurred on the GPU
    // from the shapes' own masks (shape_shadow_gpu.rs), its owner's interior then cleared,
    // including when spread and offset move the shadow relative to it.
    let (image, gpu_job) = if shadow.kind == crate::types::AtomeShadowKind::Block {
        let Some((image_width, image_height, rgba)) =
            build_block_shadow_texture_rgba_for_silhouette(
                &grown,
                shadow.color,
                shadow.spread,
                shadow.invert,
            )
        else {
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
        (image, None)
    } else {
        if shadow.color[3] <= 0.0 {
            return Ok(None);
        }
        let margin = shadow_padding(shadow.blur);
        let silhouette_mask = cached_image_handle_from_shape_mask(world, &grown, "shape_shadow")?;
        // The owner's mask texel under shadow texel 0: a whole texel reads the shape's own mask;
        // a fractional one reads a mask sampled at that phase, so the cutout stays exact.
        let shift = [
            shadow.offset_x - shadow.spread - margin as f32,
            shadow.offset_y - shadow.spread - margin as f32,
        ];
        let phase = shift.map(|value| value - value.floor());
        let owner_mask = if phase == [0.0; 2] {
            cached_image_handle_from_shape_mask(world, silhouette, "shape_shadow_owner")?
        } else {
            queue_shape_mask(world, silhouette, phase)?
        };
        let uniform = shadow_blur_uniform(
            [margin; 2],
            [shadow.blur; 2],
            shift.map(f32::floor),
            shadow.color,
        );
        let image = shadow_target_image(
            grown.width.max(1.0).ceil() as u32 + margin * 2,
            grown.height.max(1.0).ceil() as u32 + margin * 2,
        );
        (image, Some((silhouette_mask, owner_mask, uniform)))
    };
    let (image_width, image_height) = (
        image.texture_descriptor.size.width,
        image.texture_descriptor.size.height,
    );
    let handle = {
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_shape_shadow_image_assets_required".to_string())?;
        images.add(image)
    };
    if let Some((silhouette, owner, uniform)) = gpu_job {
        queue_shadow_blur(
            world,
            ShadowBlurJob {
                target: handle.clone(),
                silhouette,
                owner,
                uniform,
            },
        );
    }
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

/// Painted alpha a shadow is cast from: its bytes, or a texture the GPU writes (a masked atom's
/// coverage, `spatial_mask_gpu.rs`), only for a shadow the GPU blurs.
pub(crate) enum PaintedAlpha {
    Bytes(Vec<u8>),
    Gpu(Handle<Image>),
}

/// Whether the GPU blurs this shadow: a drop shadow that does not grow its shape first.
pub(crate) fn blurred_on_gpu(shadow: AtomeShadowStyle) -> bool {
    shadow.kind == crate::types::AtomeShadowKind::Drop && shadow.spread <= 0.0
}

/// The shadow of painted alpha (a masked atom's final mask, an image's own strokes), at the
/// source's density (`scale`: its pixels per logical px). A drop shadow is blurred on the GPU
/// from that alpha, as its mask (per-axis kernel, owner cutout by whole texels as the CPU
/// builder truncates); a block or spread one, which grows the painted shape first, is built on
/// the CPU from its bytes (`build_shadow_texture_rgba_for_alpha`).
pub(crate) fn painted_alpha_shadow_handle(
    world: &mut World,
    alpha: PaintedAlpha,
    [source_width, source_height]: [u32; 2],
    scale: [f32; 2],
    shadow: AtomeShadowStyle,
) -> Result<Option<Handle<Image>>, String> {
    if source_width == 0
        || source_height == 0
        || shadow.color[3] <= 0.0
        || !(scale[0] > 0.0 && scale[1] > 0.0)
    {
        return Ok(None);
    }
    let image_of = |width: u32, height: u32, rgba: Vec<u8>| {
        Image::new(
            Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            TextureDimension::D2,
            rgba,
            TextureFormat::Rgba8UnormSrgb,
            RenderAssetUsages::default(),
        )
    };
    if !blurred_on_gpu(shadow) {
        let PaintedAlpha::Bytes(rgba) = alpha else {
            return Err("bevy_shape_shadow_cpu_blur_needs_bytes".to_string());
        };
        let Some((width, height, pixels)) =
            crate::shadow_texture::build_shadow_texture_rgba_for_alpha(
                &rgba,
                source_width,
                source_height,
                scale,
                shadow,
            )
        else {
            return Ok(None);
        };
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_shape_shadow_image_assets_required".to_string())?;
        return Ok(Some(images.add(image_of(width, height, pixels))));
    }
    let margin = crate::shadow_texture::alpha_shadow_margin(shadow);
    let margins = scale.map(|axis| (margin * axis).round() as u32);
    let uniform = shadow_blur_uniform(
        margins,
        scale.map(|axis| shadow.blur * axis),
        [
            (shadow.offset_x * scale[0]).floor() - margins[0] as f32,
            (shadow.offset_y * scale[1]).floor() - margins[1] as f32,
        ],
        shadow.color,
    );
    let mut images = world
        .get_resource_mut::<Assets<Image>>()
        .ok_or_else(|| "bevy_shape_shadow_image_assets_required".to_string())?;
    let mask = match alpha {
        PaintedAlpha::Bytes(rgba) => images.add(image_of(source_width, source_height, rgba)),
        PaintedAlpha::Gpu(handle) => handle,
    };
    let target = images.add(shadow_target_image(
        source_width + margins[0] * 2,
        source_height + margins[1] * 2,
    ));
    queue_shadow_blur(
        world,
        ShadowBlurJob {
            target: target.clone(),
            silhouette: mask.clone(),
            owner: mask,
            uniform,
        },
    );
    Ok(Some(target))
}
