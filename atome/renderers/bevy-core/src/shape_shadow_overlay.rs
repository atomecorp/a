use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    prelude::*,
    render::batching::NoAutomaticBatching,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::{
    clip_fade::{faded_polygon_mesh, FadeFrame},
    clip_polygon::{remove_sprite_polygon_proxy, upsert_sprite_polygon_proxy},
    components::{
        AtomeClipFades, AtomeClipRect, AtomeCornerRadius, AtomeResolvedMask, AtomeShapeProfile, AtomeShapeShadow,
        AtomeRenderKind, AtomeShapeShadowOverlay, AtomeVisualOpacity,
    },
    render_math::{atome_rect_transform, depth_for_layer},
    shadow_texture::{alpha_shadow_margin, build_shadow_texture_rgba_for_alpha, shadow_padding},
    shape_shadow_cache::cached_shape_shadow_handle,
    shape_sdf::AtomeShapeSilhouette,
    types::{
        normalize_opacity, AtomeBevyRendererConfig, AtomeLayer, AtomeLogicalPosition,
        AtomeLogicalSize, AtomeShadowStyle,
    },
};

fn shadow_depth_for_layer(layer: i32) -> f32 {
    depth_for_layer(layer) - 0.25
}

fn clip_shadow_overlay(
    world: &mut World,
    owner: Entity,
    shadow_rect: [f32; 4],
    layer: i32,
) -> Result<(), String> {
    let overlay_entities = world
        .get::<AtomeShapeShadowOverlay>(owner)
        .map(|overlay| overlay.entities.clone())
        .unwrap_or_default();
    // Only a shadow laid on a straight clip fades with its owner (below): any other drops its relay.
    let unfaded = |world: &mut World| overlay_entities.iter().for_each(|overlay| remove_sprite_polygon_proxy(world, *overlay));
    let Some(clip) = world.get::<AtomeClipRect>(owner).and_then(|value| value.0) else {
        unfaded(world);
        return Ok(());
    };
    // Une decoupe tournee (page pivotee) n'est pas un rectangle ecran : l'ombre
    // suit alors la pose de l'atome sans etre recadree. De meme pour une forme
    // tournee dans une decoupe droite : la recadrer la reposerait a plat.
    if world.get::<crate::components::AtomeClipRotation>(owner).is_some_and(|value| value.0 != 0.0)
        || world.get::<crate::components::AtomeLocalTransform>(owner).is_some_and(|local| local.rotation != 0.0)
    {
        unfaded(world);
        return Ok(());
    }
    let fades = world.get::<AtomeClipFades>(owner).map(|value| value.0.clone()).unwrap_or_default();
    let left = shadow_rect[0].max(clip[0]);
    let top = shadow_rect[1].max(clip[1]);
    let right = (shadow_rect[0] + shadow_rect[2]).min(clip[0] + clip[2]);
    let bottom = (shadow_rect[1] + shadow_rect[3]).min(clip[1] + clip[3]);
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    for overlay_entity in overlay_entities.iter().copied() {
        if right <= left || bottom <= top {
            world.entity_mut(overlay_entity).insert(Visibility::Hidden);
            continue;
        }
        let visible = [left, top, right - left, bottom - top];
        let start = Vec2::new(
            (visible[0] - shadow_rect[0]) / shadow_rect[2],
            (visible[1] - shadow_rect[1]) / shadow_rect[3],
        );
        let end = Vec2::new(
            (visible[0] + visible[2] - shadow_rect[0]) / shadow_rect[2],
            (visible[1] + visible[3] - shadow_rect[1]) / shadow_rect[3],
        );
        // The source rect is in the texture's own pixels, which a shadow built
        // from a high-density texture holds more of than its logical box.
        let Some(texture_size) = world
            .get::<Sprite>(overlay_entity)
            .and_then(|sprite| world.get_resource::<Assets<Image>>()?.get(&sprite.image))
            .map(|image| Vec2::new(image.texture_descriptor.size.width as f32, image.texture_descriptor.size.height as f32))
        else {
            continue;
        };
        if let Some(mut sprite) = world.get_mut::<Sprite>(overlay_entity) {
            sprite.custom_size = Some(Vec2::new(visible[2], visible[3]));
            sprite.rect = Some(Rect::from_corners(texture_size * start, texture_size * end));
        }
        let transform = atome_rect_transform(
            visible[0],
            visible[1],
            visible[2],
            visible[3],
            surface_width,
            surface_height,
            shadow_depth_for_layer(layer),
        );
        world
            .entity_mut(overlay_entity)
            .insert((Visibility::Visible, transform, GlobalTransform::from(transform)));
        // A scroll area's edge fade (clip_fade.rs) fades the shadow with its owner, through the same relay.
        let source = Rect::from_corners(texture_size * start, texture_size * end);
        let local = [Vec2::ZERO, Vec2::new(visible[2], 0.0), Vec2::new(visible[2], visible[3]), Vec2::new(0.0, visible[3])];
        let faded = (!fades.is_empty()).then(|| faded_polygon_mesh(&local, [0.0, 0.0, visible[2], visible[3]], &fades,
            FadeFrame::upright([visible[0], visible[1]]), |point| {
                let at = (source.min + source.size() * point / Vec2::new(visible[2], visible[3])) / texture_size;
                [at.x, at.y]
            })).flatten();
        match faded {
            Some((mesh, key)) => upsert_sprite_polygon_proxy(world, overlay_entity, mesh, key, transform)?,
            None => remove_sprite_polygon_proxy(world, overlay_entity),
        }
    }
    Ok(())
}

#[cfg(test)]
pub(crate) fn build_shape_shadow_texture_rgba(
    style: crate::types::SelectionVisualStyle,
    width: f32,
    height: f32,
    corner_radii: crate::texture::AtomeCornerRadii,
) -> Option<(u32, u32, Vec<u8>)> {
    crate::shadow_texture::build_gaussian_outer_shadow_texture_rgba(
        style.shadow_color,
        width,
        height,
        corner_radii,
        style.shadow_size,
    )
}

pub fn remove_shape_shadow_overlay(world: &mut World, entity: Entity) {
    if let Some(overlay) = world.get::<AtomeShapeShadowOverlay>(entity).cloned() {
        for overlay_entity in overlay.entities {
            if world.get_entity(overlay_entity).is_ok() {
                remove_sprite_polygon_proxy(world, overlay_entity);
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
    let layer = world
        .get::<AtomeLayer>(entity)
        .map(|value| value.0)
        .unwrap_or(0);
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let [rect_x, rect_y, image_width, image_height] = overlay.logical_rect;
    let shadow_x = position.x + shadow.offset_x + rect_x;
    let shadow_y = position.y + shadow.offset_y + rect_y;
    for &overlay_entity in &overlay.entities {
        if world.get_entity(overlay_entity).is_ok() {
            let transform = atome_rect_transform(
                shadow_x,
                shadow_y,
                image_width,
                image_height,
                surface_width,
                surface_height,
                shadow_depth_for_layer(layer),
            );
            world
                .entity_mut(overlay_entity)
                .insert((transform, GlobalTransform::from(transform)));
        }
    }
    crate::selection_overlay::follow_atom_pose(world, entity, &overlay.entities);
    clip_shadow_overlay(
        world,
        entity,
        [shadow_x, shadow_y, image_width, image_height],
        layer,
    )
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

/// The painted alpha a shadow follows, with its pixel size: the final mask of a
/// masked atom, or, for a shadow that `follows_alpha`, the image's own texture
/// (its sprite's source rect when it shows a crop). None: the shadow follows
/// the shape's silhouette.
fn painted_alpha_source(
    world: &World,
    entity: Entity,
    size: [f32; 2],
    shadow: AtomeShadowStyle,
) -> Option<(Vec<u8>, u32, u32)> {
    if let Some(mask) = world.get::<AtomeResolvedMask>(entity).and_then(|value| value.0.clone()) {
        let texture = crate::shape_sdf::mask_texture_for_target(&mask, size);
        return Some((texture.rgba, texture.width, texture.height));
    }
    if !shadow.follows_alpha || world.get::<AtomeRenderKind>(entity).is_none_or(|kind| kind.0 != "image") {
        return None;
    }
    let sprite = world.get::<Sprite>(entity)?;
    let image = world.get_resource::<Assets<Image>>()?.get(&sprite.image)?;
    let data = image.data.as_ref()?;
    let (texture_width, texture_height) = (image.texture_descriptor.size.width, image.texture_descriptor.size.height);
    let rect = sprite.rect.unwrap_or(Rect::new(0.0, 0.0, texture_width as f32, texture_height as f32));
    let (left, top) = (rect.min.x.max(0.0) as u32, rect.min.y.max(0.0) as u32);
    let width = (rect.width().round() as u32).min(texture_width.saturating_sub(left));
    let height = (rect.height().round() as u32).min(texture_height.saturating_sub(top));
    if width == 0 || height == 0 || data.len() < (texture_width * texture_height * 4) as usize {
        return None;
    }
    let row = texture_width as usize * 4;
    let rgba = (top..top + height)
        .flat_map(|y| data[y as usize * row + left as usize * 4..y as usize * row + (left + width) as usize * 4].iter().copied())
        .collect();
    Some((rgba, width, height))
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
    let corner_radii = world
        .get::<AtomeCornerRadius>(entity)
        .map(|value| value.0)
        .unwrap_or([0.0; 4]);
    // La silhouette de l'ombre est celle de LA variante : une etoile projette
    // ses pointes, un polygone ses sommets, et l'arrondi de sommets du panneau
    // Arrondi se retrouve dans l'ombre du meme coup.
    let silhouette = AtomeShapeSilhouette {
        geometry: world
            .get::<AtomeShapeProfile>(entity)
            .map(|value| value.0)
            .unwrap_or_default(),
        width: size.width.max(1.0),
        height: size.height.max(1.0),
        corner_radii,
    };
    let painted_shadow = painted_alpha_source(world, entity, [size.width, size.height], shadow)
        .and_then(|(rgba, source_width, source_height)| build_shadow_texture_rgba_for_alpha(
            &rgba,
            source_width,
            source_height,
            [source_width as f32 / size.width.max(1.0), source_height as f32 / size.height.max(1.0)],
            shadow,
        ));
    // A shadow built from painted alpha keeps its source's resolution: it is
    // laid over the owner's box grown by its margin, whatever its pixel count.
    let alpha_margin = alpha_shadow_margin(shadow);
    let shadow_asset = if let Some((image_width, image_height, rgba)) = painted_shadow {
        let image = Image::new(
            Extent3d { width: image_width, height: image_height, depth_or_array_layers: 1 },
            TextureDimension::D2,
            rgba,
            TextureFormat::Rgba8UnormSrgb,
            RenderAssetUsages::default(),
        );
        let handle = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_shape_shadow_image_assets_required".to_string())?
            .add(image);
        Some((handle, Vec2::new(size.width + alpha_margin * 2.0, size.height + alpha_margin * 2.0), alpha_margin))
    } else {
        cached_shape_shadow_handle(world, shadow, &silhouette)?.map(|(handle, image_width, image_height)| (
            handle,
            Vec2::new(image_width as f32, image_height as f32),
            shadow.spread + shadow_padding(shadow.blur) as f32,
        ))
    };
    let Some((handle, shadow_size, margin)) = shadow_asset
    else {
        return Ok(());
    };
    let mut sprite = Sprite::from_image(handle.clone());
    sprite.custom_size = Some(shadow_size);
    sprite.color = Color::srgba(1.0, 1.0, 1.0, opacity);
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let shadow_x = position.x + shadow.offset_x - margin;
    let shadow_y = position.y + shadow.offset_y - margin;
    let shadow_entity = world
        .spawn((
            sprite,
            NoAutomaticBatching,
            atome_rect_transform(
                shadow_x,
                shadow_y,
                shadow_size.x,
                shadow_size.y,
                surface_width,
                surface_height,
                shadow_depth_for_layer(layer),
            ),
        ))
        .id();
    if world
        .get::<bevy::camera::visibility::RenderLayers>(entity)
        .is_some_and(|layers| layers.intersects(&bevy::camera::visibility::RenderLayers::layer(crate::workspace_backdrop::MENU_PRESENTATION_LAYER)))
    {
        world.entity_mut(shadow_entity).insert(bevy::camera::visibility::RenderLayers::layer(
            crate::workspace_backdrop::MENU_PRESENTATION_LAYER,
        ));
    }
    world.entity_mut(entity).insert(AtomeShapeShadowOverlay {
        entities: vec![shadow_entity],
        image_handles: vec![handle],
        logical_rect: [-margin, -margin, shadow_size.x, shadow_size.y],
    });
    crate::selection_overlay::follow_atom_pose(world, entity, &[shadow_entity]);
    clip_shadow_overlay(
        world,
        entity,
        [shadow_x, shadow_y, shadow_size.x, shadow_size.y],
        layer,
    )
}
