//! Silhouette textures and their bounded shared cache.
use crate::{
    components::{AtomeRoundedRectMaskCache, AtomeRoundedRectMaskCacheKey},
    shape_sdf::AtomeShapeSilhouette,
    surface_paint::SurfacePaint,
    types::{AtomeMaskPlacement, AtomeMaskStyle, AtomeTexture},
};
use bevy::{
    asset::RenderAssetUsages,
    image::{Image, ImageSampler},
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

fn image_from_mask(width: u32, height: u32, rgba: Vec<u8>) -> Image {
    let mut image = Image::new(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        rgba,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    image.sampler = ImageSampler::linear();
    image
}

/// Le masque alpha d'une silhouette, au format d'une texture de sprite : les
/// trois canaux de couleur sont blancs et seul l'alpha porte la forme, comme le
/// masque rectangulaire arrondi qu'il remplace.
pub fn shape_mask_texture(silhouette: &AtomeShapeSilhouette) -> AtomeTexture {
    let width = silhouette.width.ceil().max(1.0) as u32;
    let height = silhouette.height.ceil().max(1.0) as u32;
    let mut rgba = vec![255; width as usize * height as usize * 4];
    for y in 0..height {
        for x in 0..width {
            let coverage = silhouette.coverage(x as f32 + 0.5, y as f32 + 0.5);
            rgba[(y as usize * width as usize + x as usize) * 4 + 3] =
                (coverage * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    AtomeTexture {
        animation: None,
        width,
        height,
        rgba,
    }
}

pub fn image_handle_from_shape_mask(
    images: &mut Assets<Image>,
    silhouette: &AtomeShapeSilhouette,
    id: &str,
) -> Result<Handle<Image>, String> {
    let texture = shape_mask_texture(silhouette);
    if texture.width == 0 || texture.height == 0 {
        return Err(format!("bevy_shape_mask_dimension_required:{id}"));
    }
    Ok(images.add(image_from_mask(texture.width, texture.height, texture.rgba)))
}

fn mask_cache_key(silhouette: &AtomeShapeSilhouette) -> AtomeRoundedRectMaskCacheKey {
    AtomeRoundedRectMaskCacheKey {
        width: silhouette.width.ceil().max(1.0) as u32,
        height: silhouette.height.ceil().max(1.0) as u32,
        radii: [
            (silhouette.corner_radii[0].max(0.0) * 100.0).round() as u32,
            (silhouette.corner_radii[1].max(0.0) * 100.0).round() as u32,
            (silhouette.corner_radii[2].max(0.0) * 100.0).round() as u32,
            (silhouette.corner_radii[3].max(0.0) * 100.0).round() as u32,
        ],
        variant: silhouette.geometry.variant.cache_code(),
        star_branches: silhouette.geometry.star_branches,
        star_inner_radius: (silhouette.geometry.star_inner_radius * 100.0).round() as u32,
        polygon_sides: silhouette.geometry.polygon_sides,
        paint: Vec::new(),
    }
}

/// Le masque d'une silhouette, memoise : le balayage est en O(largeur x hauteur)
/// sur le CPU et une forme pleine surface coute plusieurs millisecondes a
/// chaque apparition.
pub fn cached_image_handle_from_shape_mask(
    world: &mut World,
    silhouette: &AtomeShapeSilhouette,
    id: &str,
) -> Result<Handle<Image>, String> {
    cached_image_handle_from_shape_surface(world, silhouette, None, [1.0; 4], id)
}

pub fn cached_image_handle_from_shape_surface(
    world: &mut World,
    silhouette: &AtomeShapeSilhouette,
    paint: Option<&SurfacePaint>,
    fill: [f32; 4],
    id: &str,
) -> Result<Handle<Image>, String> {
    if world.get_resource::<AtomeRoundedRectMaskCache>().is_none() {
        world.insert_resource(AtomeRoundedRectMaskCache::default());
    }
    let mut key = mask_cache_key(silhouette);
    if let Some(paint) = paint {
        if !paint.valid() {
            return Err(format!("bevy_surface_paint_invalid:{id}"));
        }
        key.paint = paint.cache_key(fill);
    }
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
        match paint {
            Some(paint) => {
                let texture = paint.texture(silhouette, fill);
                images.add(image_from_mask(texture.width, texture.height, texture.rgba))
            }
            None => image_handle_from_shape_mask(&mut images, silhouette, id)?,
        }
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

/// Applique une silhouette de masque a une texture deja rasterisee : l'alpha du
/// masque MULTIPLIE celui de la source, sans jamais toucher a ses couleurs. Une
/// taille de masque differente de celle de la source etire la silhouette, ce qui
/// est le comportement attendu quand le masque a ete redimensionne a la main.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn apply_mask_to_texture(
    texture: &AtomeTexture,
    silhouette: &AtomeShapeSilhouette,
) -> AtomeTexture {
    let width = texture.width.max(1);
    let height = texture.height.max(1);
    let mut rgba = texture.rgba.clone();
    let mask_width = silhouette.width.max(1.0);
    let mask_height = silhouette.height.max(1.0);
    for y in 0..height {
        let mask_y = (y as f32 + 0.5) * mask_height / height as f32;
        for x in 0..width {
            let mask_x = (x as f32 + 0.5) * mask_width / width as f32;
            let coverage = silhouette.coverage(mask_x, mask_y).clamp(0.0, 1.0);
            let offset = (y as usize * width as usize + x as usize) * 4 + 3;
            if offset >= rgba.len() {
                break;
            }
            let alpha = (rgba[offset] as f32 * coverage).round();
            rgba[offset] = alpha.clamp(0.0, 255.0) as u8;
        }
    }
    AtomeTexture {
        animation: texture.animation.clone(),
        width: texture.width,
        height: texture.height,
        rgba,
    }
}

fn local_to_world(
    point: Vec2,
    size: Vec2,
    position: Vec2,
    scale: Vec2,
    rotation_degrees: f32,
    origin: Vec2,
) -> Vec2 {
    let pivot = size * origin;
    let local = (point - pivot) * scale;
    let angle = rotation_degrees.to_radians();
    let rotated = Vec2::new(
        local.x * angle.cos() - local.y * angle.sin(),
        local.x * angle.sin() + local.y * angle.cos(),
    );
    position + pivot + rotated
}

fn world_to_local(
    point: Vec2,
    size: Vec2,
    position: Vec2,
    scale: Vec2,
    rotation_degrees: f32,
    origin: Vec2,
) -> Vec2 {
    let pivot = size * origin;
    let relative = point - position - pivot;
    let angle = -rotation_degrees.to_radians();
    let rotated = Vec2::new(
        relative.x * angle.cos() - relative.y * angle.sin(),
        relative.x * angle.sin() + relative.y * angle.cos(),
    );
    Vec2::new(
        if scale.x.abs() > f32::EPSILON {
            rotated.x / scale.x
        } else {
            f32::MAX
        },
        if scale.y.abs() > f32::EPSILON {
            rotated.y / scale.y
        } else {
            f32::MAX
        },
    ) + pivot
}

fn spatial_mask_coverage(
    mask: &AtomeMaskStyle,
    placement: AtomeMaskPlacement,
    target_point: Vec2,
) -> f32 {
    let target_size = Vec2::new(
        placement.target_size[0].max(1.0),
        placement.target_size[1].max(1.0),
    );
    let world = local_to_world(
        target_point,
        target_size,
        Vec2::from_array(placement.target_position),
        Vec2::from_array(placement.target_scale),
        placement.target_rotation,
        Vec2::from_array(placement.target_origin),
    );
    let source_size = Vec2::new(
        mask.silhouette.width.max(1.0),
        mask.silhouette.height.max(1.0),
    );
    let source_point = world_to_local(
        world,
        source_size,
        Vec2::from_array(placement.source_position),
        Vec2::from_array(placement.source_scale),
        placement.source_rotation,
        Vec2::from_array(placement.source_origin),
    );
    if !mask.alpha.is_empty() {
        let width = mask.silhouette.width.ceil().max(1.0) as usize;
        let height = mask.silhouette.height.ceil().max(1.0) as usize;
        let x = source_point.x.floor() as isize;
        let y = source_point.y.floor() as isize;
        if x < 0 || y < 0 || x as usize >= width || y as usize >= height {
            return 0.0;
        }
        return mask.alpha[y as usize * width + x as usize] as f32 / 255.0;
    }
    mask.silhouette
        .coverage(source_point.x, source_point.y)
        .clamp(0.0, 1.0)
}

fn resolved_mask_coverage(
    mask: &AtomeMaskStyle,
    target_point: Vec2,
    target_width: u32,
    target_height: u32,
) -> f32 {
    let own = match mask.placement {
        Some(placement) => spatial_mask_coverage(mask, placement, target_point),
        None => {
            let source_x =
                target_point.x * mask.silhouette.width.max(1.0) / target_width.max(1) as f32;
            let source_y =
                target_point.y * mask.silhouette.height.max(1.0) / target_height.max(1) as f32;
            if !mask.alpha.is_empty() {
                let width = mask.silhouette.width.ceil().max(1.0) as usize;
                let height = mask.silhouette.height.ceil().max(1.0) as usize;
                let x = source_x.floor().clamp(0.0, width.saturating_sub(1) as f32) as usize;
                let y = source_y.floor().clamp(0.0, height.saturating_sub(1) as f32) as usize;
                mask.alpha[y * width + x] as f32 / 255.0
            } else {
                mask.silhouette.coverage(source_x, source_y)
            }
        }
    };
    mask.layers
        .iter()
        .fold(own, |coverage, layer| {
            coverage * resolved_mask_coverage(layer, target_point, target_width, target_height)
        })
        .clamp(0.0, 1.0)
}

/// Rasterise the source in this target's coordinate system. Unlike the legacy
/// helper above, this never stretches a mask independently over each group
/// child: non-overlapping pixels are transparent and rotations remain spatial.
pub(crate) fn mask_texture_for_target(
    mask: &AtomeMaskStyle,
    target_size: [f32; 2],
) -> AtomeTexture {
    let width = target_size[0].ceil().max(1.0) as u32;
    let height = target_size[1].ceil().max(1.0) as u32;
    let mut rgba = vec![255; width as usize * height as usize * 4];
    for y in 0..height {
        for x in 0..width {
            let target_point = Vec2::new(x as f32 + 0.5, y as f32 + 0.5);
            let coverage = resolved_mask_coverage(mask, target_point, width, height);
            rgba[(y as usize * width as usize + x as usize) * 4 + 3] =
                (coverage * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    AtomeTexture {
        animation: None,
        width,
        height,
        rgba,
    }
}

pub(crate) fn apply_spatial_mask_to_texture(
    texture: &AtomeTexture,
    mask: &AtomeMaskStyle,
) -> AtomeTexture {
    let width = texture.width.max(1);
    let height = texture.height.max(1);
    let target_size = mask
        .placement
        .map(|placement| placement.target_size)
        .unwrap_or([width as f32, height as f32]);
    let mask_texture = mask_texture_for_target(mask, target_size);
    let mut rgba = texture.rgba.clone();
    for y in 0..height {
        let mask_y = ((y as f32 + 0.5) * mask_texture.height as f32 / height as f32)
            .floor()
            .clamp(0.0, mask_texture.height.saturating_sub(1) as f32) as usize;
        for x in 0..width {
            let mask_x = ((x as f32 + 0.5) * mask_texture.width as f32 / width as f32)
                .floor()
                .clamp(0.0, mask_texture.width.saturating_sub(1) as f32)
                as usize;
            let alpha_offset = (y as usize * width as usize + x as usize) * 4 + 3;
            let mask_offset = (mask_y * mask_texture.width as usize + mask_x) * 4 + 3;
            if alpha_offset >= rgba.len() || mask_offset >= mask_texture.rgba.len() {
                continue;
            }
            rgba[alpha_offset] =
                ((rgba[alpha_offset] as u16 * mask_texture.rgba[mask_offset] as u16) / 255) as u8;
        }
    }
    AtomeTexture {
        animation: texture.animation.clone(),
        width: texture.width,
        height: texture.height,
        rgba,
    }
}
