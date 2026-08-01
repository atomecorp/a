use bevy::{
    asset::RenderAssetUsages,
    image::{Image, ImageSampler},
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::components::{AtomeRoundedRectMaskCache, AtomeRoundedRectMaskCacheKey};
use crate::types::AtomeTexture;

fn image_from_texture(texture: &AtomeTexture, id: &str) -> Result<Image, String> {
    if texture.width == 0 || texture.height == 0 {
        return Err(format!("bevy_texture_dimension_required:{id}"));
    }
    let expected_len = texture.width as usize * texture.height as usize * 4;
    if texture.rgba.len() != expected_len {
        return Err(format!("bevy_texture_rgba_length_invalid:{id}"));
    }
    let mut image = Image::new(
        Extent3d {
            width: texture.width,
            height: texture.height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        texture.rgba.clone(),
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    image.sampler = ImageSampler::linear();
    Ok(image)
}

pub fn image_handle_from_texture(
    images: &mut Assets<Image>,
    texture: &Option<AtomeTexture>,
    id: &str,
) -> Result<Handle<Image>, String> {
    let texture = texture
        .as_ref()
        .ok_or_else(|| format!("bevy_texture_required:{id}"))?;
    Ok(images.add(image_from_texture(texture, id)?))
}

/// Corner radii in `[top_left, top_right, bottom_right, bottom_left]` order,
/// matching the `radius_corners` style field emitted by the shared UI tree.
pub type AtomeCornerRadii = [f32; 4];

pub(crate) fn uniform_corner_radii(radius: f32) -> AtomeCornerRadii {
    let radius = radius.max(0.0);
    [radius; 4]
}

pub(crate) fn corner_radii_are_zero(radii: AtomeCornerRadii) -> bool {
    radii.iter().all(|value| *value <= 0.0)
}

/// Radius of the quadrant the point falls in. A rounded rect with different
/// corners is the union of four quadrants, each with its own radius, so the
/// distance field selects the radius before measuring.
fn radius_for_quadrant(x: f32, y: f32, width: f32, height: f32, radii: AtomeCornerRadii) -> f32 {
    let [top_left, top_right, bottom_right, bottom_left] = radii;
    let left = x < width / 2.0;
    let top = y < height / 2.0;
    let radius = match (left, top) {
        (true, true) => top_left,
        (false, true) => top_right,
        (false, false) => bottom_right,
        (true, false) => bottom_left,
    };
    // Each corner is independently clamped to the half-extent so an oversized
    // radius cannot bleed across the shape.
    radius.max(0.0).min(width / 2.0).min(height / 2.0)
}

pub(crate) fn rounded_rect_signed_distance(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    radii: AtomeCornerRadii,
) -> f32 {
    let width = width.max(1.0);
    let height = height.max(1.0);
    let radius = radius_for_quadrant(x, y, width, height, radii);
    let half_width = width / 2.0;
    let half_height = height / 2.0;
    let dx = (x - half_width).abs() - (half_width - radius);
    let dy = (y - half_height).abs() - (half_height - radius);
    let outside_x = dx.max(0.0);
    let outside_y = dy.max(0.0);
    let outside = (outside_x.powi(2) + outside_y.powi(2)).sqrt();
    outside + dx.max(dy).min(0.0) - radius
}

fn rounded_rect_alpha(x: u32, y: u32, width: u32, height: u32, radii: AtomeCornerRadii) -> u8 {
    if corner_radii_are_zero(radii) {
        return 255;
    }
    let px = x as f32 + 0.5;
    let py = y as f32 + 0.5;
    let edge = -rounded_rect_signed_distance(px, py, width as f32, height as f32, radii);
    if edge >= 0.5 {
        255
    } else if edge <= -0.5 {
        0
    } else {
        ((edge + 0.5) * 255.0).round().clamp(0.0, 255.0) as u8
    }
}

// World-level wrapper caching the generated mask by (width, height, radius):
// the pixel loop below is O(width*height) on the CPU and full-surface shapes
// (dashboard background/table) would otherwise pay ~9ms on EVERY spawn.
pub fn cached_image_handle_from_rounded_rect_mask(
    world: &mut World,
    width: f32,
    height: f32,
    radii: AtomeCornerRadii,
    id: &str,
) -> Result<Handle<Image>, String> {
    if world.get_resource::<AtomeRoundedRectMaskCache>().is_none() {
        world.insert_resource(AtomeRoundedRectMaskCache::default());
    }
    let key = AtomeRoundedRectMaskCacheKey {
        width: width.ceil().max(1.0) as u32,
        height: height.ceil().max(1.0) as u32,
        radii: [
            (radii[0].max(0.0) * 100.0).round() as u32,
            (radii[1].max(0.0) * 100.0).round() as u32,
            (radii[2].max(0.0) * 100.0).round() as u32,
            (radii[3].max(0.0) * 100.0).round() as u32,
        ],
    };
    let cached = world
        .resource::<AtomeRoundedRectMaskCache>()
        .handles
        .get(&key)
        .cloned();
    if let Some(handle) = cached {
        let exists = world
            .get_resource::<Assets<Image>>()
            .map(|images| images.contains(&handle))
            .unwrap_or(false);
        if exists {
            return Ok(handle);
        }
        let mut cache = world.resource_mut::<AtomeRoundedRectMaskCache>();
        cache.handles.remove(&key);
        cache.order.retain(|existing| existing != &key);
        cache.total_bytes = cache
            .total_bytes
            .saturating_sub(cache.byte_sizes.remove(&key).unwrap_or(0));
    }
    let handle = {
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_image_assets_required".to_string())?;
        image_handle_from_rounded_rect_mask(&mut images, width, height, radii, id)?
    };
    let mut cache = world.resource_mut::<AtomeRoundedRectMaskCache>();
    let byte_size = key.width as usize * key.height as usize * 4;
    if byte_size > cache.max_bytes {
        return Ok(handle);
    }
    if !cache.handles.contains_key(&key) {
        cache.order.push_back(key.clone());
    }
    cache.handles.insert(key.clone(), handle.clone());
    cache.byte_sizes.insert(key.clone(), byte_size);
    cache.total_bytes += byte_size;
    while cache.order.len() > cache.max_entries || cache.total_bytes > cache.max_bytes {
        if let Some(evicted) = cache.order.pop_front() {
            cache.handles.remove(&evicted);
            cache.total_bytes = cache
                .total_bytes
                .saturating_sub(cache.byte_sizes.remove(&evicted).unwrap_or(0));
        }
    }
    Ok(handle)
}

pub fn image_handle_from_rounded_rect_mask(
    images: &mut Assets<Image>,
    width: f32,
    height: f32,
    radii: AtomeCornerRadii,
    id: &str,
) -> Result<Handle<Image>, String> {
    let width = width.ceil().max(1.0) as u32;
    let height = height.ceil().max(1.0) as u32;
    let mut rgba = vec![255; width as usize * height as usize * 4];
    for y in 0..height {
        for x in 0..width {
            let alpha = rounded_rect_alpha(x, y, width, height, radii);
            rgba[(y as usize * width as usize + x as usize) * 4 + 3] = alpha;
        }
    }
    Ok(images.add(image_from_texture(
        &AtomeTexture {
            width,
            height,
            rgba,
        },
        id,
    )?))
}
