//! A node's texture: the image its sprite draws, resolved from what the node describes — a surface paint, a
//! texture (a browser image included), a shape's silhouette — and cut by its spatial mask (on the CPU for the
//! scene a renderer starts with, on the GPU in a running world). Spawning the node is `spawn.rs`.
use bevy::{image::Image, prelude::*};

use crate::{
    browser_texture::browser_texture_image,
    shape_sdf::{
        AtomeShapeSilhouette, apply_spatial_mask_to_texture, cached_image_handle_from_shape_mask,
        shape_mask_texture,
    },
    spatial_mask_gpu::queue_masked_node,
    spawn::color_for_node,
    texture::{AtomeCornerRadii, image_handle_from_texture, uniform_corner_radii},
    types::*,
};

/// A node may carry per-corner radii instead of the uniform scalar. A partially
/// rounded shape has `corner_radius == 0.0`, so the mask must be selected on the
/// resolved radii rather than on the scalar alone.
pub(crate) fn effective_corner_radii(node: &AtomeRenderNode) -> AtomeCornerRadii {
    node.corner_radii
        .unwrap_or_else(|| uniform_corner_radii(node.corner_radius))
}

/// La silhouette complete d'un noeud : sa variante, ses reglages, sa boite et
/// son arrondi resolu. Le meme objet sert au masque ET a l'ombre, pour qu'une
/// etoile ne puisse pas projeter l'ombre d'un carre.
pub(crate) fn shape_silhouette_for_node(node: &AtomeRenderNode) -> AtomeShapeSilhouette {
    AtomeShapeSilhouette {
        geometry: node.shape_geometry(),
        width: node.logical_size[0].max(1.0),
        height: node.logical_size[1].max(1.0),
        corner_radii: effective_corner_radii(node),
    }
}

/// Le masque alpha d'un noeud, quand sa projection en a resolu un.
fn node_mask(node: &AtomeRenderNode) -> Option<AtomeMaskStyle> {
    node.mask.clone().and_then(AtomeMaskStyle::normalized)
}

/// A texture cut by the mask on the CPU, for the scene a renderer starts with (no world
/// yet); a node spawned in a world is cut on the GPU (`spatial_mask_gpu::queue_masked_node`).
fn masked_texture(texture: &AtomeTexture, mask: Option<&AtomeMaskStyle>) -> Option<AtomeTexture> {
    mask.map(|mask| apply_spatial_mask_to_texture(texture, mask))
}

pub(crate) fn texture_handle_for_node(
    images: &mut Assets<Image>,
    node: &AtomeRenderNode,
) -> Result<Option<Handle<Image>>, String> {
    if node.kind == "video" || node.kind == "media_window" {
        return Ok(None);
    }
    let mask = node_mask(node);
    if let Some(paint) = node.surface_paint.as_ref().filter(|_| node.kind == "shape") {
        if !paint.valid() {
            return Err(format!("bevy_surface_paint_invalid:{}", node.id));
        }
        let texture = paint.texture(&shape_silhouette_for_node(node), color_for_node(node));
        let texture = masked_texture(&texture, mask.as_ref()).unwrap_or(texture);
        return Ok(Some(image_handle_from_texture(
            images,
            &Some(texture),
            &node.id,
        )?));
    }
    if let Some(source) = node.texture.as_ref() {
        // A browser image is masked by its own GPU pass (`browser_texture.rs`).
        if source.external.is_some() {
            return browser_texture_image(images, source, &node.id, mask.as_ref()).map(Some);
        }
        return match masked_texture(source, mask.as_ref()) {
            Some(masked) => Ok(Some(image_handle_from_texture(
                images,
                &Some(masked),
                &node.id,
            )?)),
            None => Ok(Some(image_handle_from_texture(
                images,
                &node.texture,
                &node.id,
            )?)),
        };
    }
    let silhouette = shape_silhouette_for_node(node);
    // A mask asks for a texture to cut, even a plain rectangle's: without one
    // the mask's alpha had nothing to multiply and the shape stayed whole.
    if node.kind == "shape" && (silhouette.requires_mask() || mask.is_some()) {
        let texture = shape_mask_texture(&silhouette);
        let texture = masked_texture(&texture, mask.as_ref()).unwrap_or(texture);
        return Ok(Some(image_handle_from_texture(
            images,
            &Some(texture),
            &node.id,
        )?));
    }
    Ok(None)
}

pub(crate) fn texture_handle_for_node_in_world(
    world: &mut World,
    node: &AtomeRenderNode,
) -> Result<Option<Handle<Image>>, String> {
    let silhouette = shape_silhouette_for_node(node);
    if let Some(mask) = node_mask(node)
        && let Some(handle) = queue_masked_node(world, node, &silhouette, &mask)?
    {
        return Ok(Some(handle));
    }
    if node.kind == "shape"
        && node.texture.is_none()
        && let Some(paint) = &node.surface_paint
    {
        return Ok(Some(
            crate::shape_texture::cached_image_handle_from_shape_surface(
                world,
                &silhouette,
                Some(paint),
                color_for_node(node),
                &node.id,
            )?,
        ));
    }
    // An unmasked shape without texture uses the cache: by far the commonest.
    if node.kind == "shape" && node.texture.is_none() && silhouette.requires_mask() {
        return Ok(Some(cached_image_handle_from_shape_mask(
            world,
            &silhouette,
            &node.id,
        )?));
    }
    let mut images = world
        .get_resource_mut::<Assets<Image>>()
        .ok_or_else(|| "bevy_image_assets_required".to_string())?;
    texture_handle_for_node(&mut images, node)
}
