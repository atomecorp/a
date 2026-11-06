//! An atome's spatial mask drawn on the GPU (R-118 cleanup, item 5).
//!
//! The CPU baked a mask's coverage texel by texel at every size (`shape_texture.rs#mask_texture_for_target`: each
//! layer placed by its transforms, then its signed distance or its alpha bitmap) and multiplied a source's alpha by
//! it (`apply_spatial_mask_to_texture`): about 85–90 ms a frame on the Mac while twelve masked shapes were resized.
//! The texture contract is unchanged — the same size, the same bytes, sRGB — only one fragment pass
//! (`spatial_mask.wgsl`) writes them now, with the shape masks (`ShapeMaskDraw`), before any camera draws and before
//! a shadow is blurred from them. Three sources: the coverage alone (a video's or a shadow's mask), a silhouette's
//! mask cut by it (a shape, a media window) and a texture cut by it, its colours kept (a painted shape, an image).
//! The CPU functions stay the reference (`tests/rendering/spatial_mask_gpu_twin.rs`) and serve the consumers that
//! still read bytes: a browser image's coverage, a shadow blurred on the CPU, the scene a renderer starts with.
use bevy::{
    asset::RenderAssetUsages,
    image::ImageSampler,
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat, TextureUsages},
};

use crate::{
    shape_mask_gpu::silhouette_vectors,
    shape_sdf::AtomeShapeSilhouette,
    shape_shadow_gpu::SHADOW_FORMAT,
    types::{AtomeMaskStyle, AtomeRenderNode, AtomeTexture},
};

/// The bytes the pass reads and writes: the sRGB textures seen through a plain view, so colours cross untouched.
const RAW_FORMAT: TextureFormat = TextureFormat::Rgba8Unorm;
/// Texels of one layer's row in the layers' texture (`spatial_mask.wgsl#own_coverage`).
const LAYER_TEXELS: u32 = 8;
/// The alpha bitmaps lie one after another on lines of this many texels (`spatial_mask.wgsl#ALPHA_WIDTH`).
const ALPHA_WIDTH: u32 = 2048;
/// A texel's index stays exact in a 32-bit float below this.
const ALPHA_LIMIT: usize = 1 << 24;

/// What the mask cuts.
#[derive(Clone, Debug)]
pub(crate) enum SpatialMaskSource {
    /// Nothing: the mask's coverage alone, white (`mask_texture_for_target`).
    Coverage,
    /// A silhouette's mask (`shape_mask_texture`), white.
    Silhouette(AtomeShapeSilhouette),
    /// A texture, its colours kept, read through its plain view.
    Texture(Handle<Image>),
}

/// One mask to draw: its texture and size, the size of the coverage it is cut by, its source, the mask (kept for
/// the CPU twin) and the mask packed for the pass.
#[derive(Clone, Debug)]
pub(crate) struct SpatialMaskJob {
    pub target: Handle<Image>,
    pub size: [u32; 2],
    pub mask_size: [u32; 2],
    pub source: SpatialMaskSource,
    /// The mask as given, which only the CPU twin reads (the pass reads it packed).
    #[cfg_attr(not(test), allow(dead_code))]
    pub mask: AtomeMaskStyle,
    layers: Vec<f32>,
    alpha: Vec<u8>,
}

/// The masks described this frame, taken by the render world at extraction.
#[derive(Resource, Default)]
pub(crate) struct SpatialMaskQueue(pub Vec<SpatialMaskJob>);

/// One row per layer, the mask first and then its layers depth first, each multiplying the coverage; every alpha
/// bitmap appended to `alpha`. `shape_texture.rs#resolved_mask_coverage` reads the same fields.
fn pack(mask: &AtomeMaskStyle, layers: &mut Vec<f32>, alpha: &mut Vec<u8>) -> Result<(), String> {
    let silhouette = mask.silhouette;
    let bitmap = [
        silhouette.width.ceil().max(1.0),
        silhouette.height.ceil().max(1.0),
    ];
    if !mask.alpha.is_empty() && mask.alpha.len() != (bitmap[0] * bitmap[1]) as usize {
        return Err(format!(
            "bevy_spatial_mask_alpha_length_invalid:{}",
            mask.source_id
        ));
    }
    let offset = alpha.len();
    alpha.extend_from_slice(&mask.alpha);
    if alpha.len() > ALPHA_LIMIT {
        return Err(format!(
            "bevy_spatial_mask_alpha_too_large:{}",
            mask.source_id
        ));
    }
    let [shape, radii, geometry] = silhouette_vectors(&silhouette);
    let placed = mask.placement.is_some();
    let place = mask.placement;
    let pair = |value: Option<[f32; 2]>| value.unwrap_or([0.0; 2]);
    let [target_x, target_y] = pair(place.map(|p| p.target_position));
    let [target_scale_x, target_scale_y] = pair(place.map(|p| p.target_scale));
    let [target_origin_x, target_origin_y] = pair(place.map(|p| p.target_origin));
    let [source_x, source_y] = pair(place.map(|p| p.source_position));
    let [source_scale_x, source_scale_y] = pair(place.map(|p| p.source_scale));
    let [source_origin_x, source_origin_y] = pair(place.map(|p| p.source_origin));
    let [target_width, target_height] = pair(place.map(|p| p.target_size));
    layers.extend([
        f32::from(u8::from(placed)),
        f32::from(u8::from(!mask.alpha.is_empty())),
        shape.z,
        shape.w,
        shape.x,
        shape.y,
        geometry.x,
        geometry.y,
        geometry.z,
        offset as f32,
        bitmap[0],
        bitmap[1],
        radii.x,
        radii.y,
        radii.z,
        radii.w,
        target_x,
        target_y,
        target_scale_x,
        target_scale_y,
        place.map_or(0.0, |p| p.target_rotation),
        target_origin_x,
        target_origin_y,
        place.map_or(0.0, |p| p.source_rotation),
        source_x,
        source_y,
        source_scale_x,
        source_scale_y,
        source_origin_x,
        source_origin_y,
        target_width,
        target_height,
    ]);
    mask.layers
        .iter()
        .try_for_each(|layer| pack(layer, layers, alpha))
}

/// A texture the pass writes, `size` texels, sRGB, seen as plain bytes by the pass.
fn target_image(size: [u32; 2]) -> Image {
    let mut image = Image::new_uninit(
        Extent3d {
            width: size[0],
            height: size[1],
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        SHADOW_FORMAT,
        RenderAssetUsages::RENDER_WORLD,
    );
    image.texture_descriptor.usage =
        TextureUsages::TEXTURE_BINDING | TextureUsages::RENDER_ATTACHMENT;
    image.texture_descriptor.view_formats = &[RAW_FORMAT];
    image.sampler = ImageSampler::linear();
    image
}

fn queue(
    world: &mut World,
    size: [u32; 2],
    mask_size: [u32; 2],
    source: SpatialMaskSource,
    mask: &AtomeMaskStyle,
) -> Result<Handle<Image>, String> {
    let (mut layers, mut alpha) = (Vec::new(), Vec::new());
    pack(mask, &mut layers, &mut alpha)?;
    let target = world
        .get_resource_mut::<Assets<Image>>()
        .ok_or_else(|| "bevy_image_assets_required".to_string())?
        .add(target_image(size));
    world
        .get_resource_or_insert_with(SpatialMaskQueue::default)
        .0
        .push(SpatialMaskJob {
            target: target.clone(),
            size,
            mask_size,
            source,
            mask: mask.clone(),
            layers,
            alpha,
        });
    Ok(target)
}

/// The texels of a mask's target: its placement's target size, else the box it is cut into.
fn mask_size(mask: &AtomeMaskStyle, size: [u32; 2]) -> [u32; 2] {
    mask.placement.map_or(size, |placement| {
        placement
            .target_size
            .map(|axis| axis.ceil().max(1.0) as u32)
    })
}

/// The mask's coverage in a target of `target_size` px (`mask_texture_for_target`).
pub(crate) fn queue_mask_coverage(
    world: &mut World,
    mask: &AtomeMaskStyle,
    target_size: [f32; 2],
) -> Result<Handle<Image>, String> {
    let size = target_size.map(|axis| axis.ceil().max(1.0) as u32);
    queue(world, size, size, SpatialMaskSource::Coverage, mask)
}

/// `silhouette`'s mask cut by `mask` (`apply_spatial_mask_to_texture(shape_mask_texture(..))`).
pub(crate) fn queue_masked_silhouette(
    world: &mut World,
    silhouette: &AtomeShapeSilhouette,
    mask: &AtomeMaskStyle,
) -> Result<Handle<Image>, String> {
    let size = [silhouette.width, silhouette.height].map(|axis| axis.ceil().max(1.0) as u32);
    queue(
        world,
        size,
        mask_size(mask, size),
        SpatialMaskSource::Silhouette(*silhouette),
        mask,
    )
}

/// `texture` cut by `mask`, its colours kept (`apply_spatial_mask_to_texture`). An animated texture's frames are
/// written later, over the bytes it starts with, so it is not cut, as on the CPU.
pub(crate) fn queue_masked_texture(
    world: &mut World,
    texture: &AtomeTexture,
    mask: &AtomeMaskStyle,
    id: &str,
) -> Result<Handle<Image>, String> {
    let mut images = world
        .get_resource_mut::<Assets<Image>>()
        .ok_or_else(|| "bevy_image_assets_required".to_string())?;
    if texture.animation.is_some() {
        return crate::texture::image_handle_from_texture(&mut images, &Some(texture.clone()), id);
    }
    let size = [texture.width.max(1), texture.height.max(1)];
    if texture.rgba.len() != (size[0] * size[1] * 4) as usize {
        return Err(format!("bevy_texture_rgba_length_invalid:{id}"));
    }
    let mut source = Image::new(
        Extent3d {
            width: size[0],
            height: size[1],
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        texture.rgba.clone(),
        SHADOW_FORMAT,
        RenderAssetUsages::RENDER_WORLD,
    );
    source.texture_descriptor.view_formats = &[RAW_FORMAT];
    let source = images.add(source);
    queue(
        world,
        size,
        mask_size(mask, size),
        SpatialMaskSource::Texture(source),
        mask,
    )
}

/// A node spawned with a mask, cut as `spawn.rs#texture_handle_for_node` cuts it on the CPU: a painted shape's paint,
/// an image's (or a text's) own texture, an unpainted shape's silhouette. `None` for what the mask does not cut
/// here: a video and a media window (their own mask textures), a browser image (its own pass takes the coverage
/// bytes) and any other node without texture.
pub(crate) fn queue_masked_node(
    world: &mut World,
    node: &AtomeRenderNode,
    silhouette: &AtomeShapeSilhouette,
    mask: &AtomeMaskStyle,
) -> Result<Option<Handle<Image>>, String> {
    if node.kind == "video" || node.kind == "media_window" {
        return Ok(None);
    }
    if let Some(paint) = node.surface_paint.as_ref().filter(|_| node.kind == "shape") {
        if !paint.valid() {
            return Err(format!("bevy_surface_paint_invalid:{}", node.id));
        }
        let texture = paint.texture(silhouette, crate::spawn::color_for_node(node));
        return queue_masked_texture(world, &texture, mask, &node.id).map(Some);
    }
    match node.texture.as_ref() {
        Some(source) if source.external.is_none() => {
            queue_masked_texture(world, source, mask, &node.id).map(Some)
        }
        None if node.kind == "shape" => queue_masked_silhouette(world, silhouette, mask).map(Some),
        _ => Ok(None),
    }
}

#[path = "spatial_mask_pass.rs"]
mod pass;
pub use pass::SpatialMaskGpuPlugin;

#[cfg(test)]
#[path = "../../../../tests/rendering/spatial_mask_gpu_twin.rs"]
pub(crate) mod twin;
