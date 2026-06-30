use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::{
    components::{AtomeCornerRadius, AtomeShapeShadow, AtomeShapeShadowOverlay},
    render_math::{atome_rect_transform, depth_for_layer},
    selection_overlay::{channel_to_u8, shadow_alpha_for_distance},
    texture::rounded_rect_signed_distance,
    types::{
        AtomeBevyRendererConfig, AtomeLayer, AtomeLogicalPosition, AtomeLogicalSize,
        AtomeShadowStyle, SelectionVisualStyle,
    },
};

fn shadow_depth_for_layer(layer: i32) -> f32 {
    depth_for_layer(layer) - 0.25
}

fn selection_style_from_shadow(shadow: AtomeShadowStyle) -> SelectionVisualStyle {
    SelectionVisualStyle {
        shadow_size: shadow.blur,
        border_thickness: 0.0,
        dash_length: 0.0,
        dash_gap: 0.0,
        border_color: [0.0, 0.0, 0.0, 0.0],
        shadow_color: shadow.color,
    }
}

fn shape_shadow_alpha(distance: f32, blur: f32, base_alpha: f32) -> u8 {
    if distance <= 0.0 {
        return channel_to_u8(base_alpha);
    }
    shadow_alpha_for_distance(distance, blur, base_alpha)
}

pub(crate) fn build_shape_shadow_texture_rgba(
    style: SelectionVisualStyle,
    width: f32,
    height: f32,
    corner_radius: f32,
) -> Option<(u32, u32, Vec<u8>)> {
    let blur = style.shadow_size.max(0.0);
    if blur <= 0.0 || style.shadow_color[3] <= 0.0 {
        return None;
    }
    let width = width.max(1.0);
    let height = height.max(1.0);
    let image_width = (width + blur * 2.0).ceil() as u32;
    let image_height = (height + blur * 2.0).ceil() as u32;
    let red = channel_to_u8(style.shadow_color[0]);
    let green = channel_to_u8(style.shadow_color[1]);
    let blue = channel_to_u8(style.shadow_color[2]);
    let mut rgba = vec![0; image_width as usize * image_height as usize * 4];
    for py in 0..image_height {
        let y = py as f32 + 0.5 - blur;
        for px in 0..image_width {
            let x = px as f32 + 0.5 - blur;
            let distance = rounded_rect_signed_distance(x, y, width, height, corner_radius);
            let alpha = shape_shadow_alpha(distance, blur, style.shadow_color[3]);
            if alpha == 0 {
                continue;
            }
            let index = (py as usize * image_width as usize + px as usize) * 4;
            rgba[index] = red;
            rgba[index + 1] = green;
            rgba[index + 2] = blue;
            rgba[index + 3] = alpha;
        }
    }
    Some((image_width, image_height, rgba))
}

pub fn remove_shape_shadow_overlay(world: &mut World, entity: Entity) {
    if let Some(overlay) = world.get::<AtomeShapeShadowOverlay>(entity).cloned() {
        for overlay_entity in overlay.entities {
            if world.get_entity(overlay_entity).is_ok() {
                world.despawn(overlay_entity);
            }
        }
        if let Some(mut images) = world.get_resource_mut::<Assets<Image>>() {
            for handle in overlay.image_handles {
                images.remove(&handle);
            }
        }
        world.entity_mut(entity).remove::<AtomeShapeShadowOverlay>();
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
    let style = selection_style_from_shadow(shadow);
    let shadow_width = size.width.max(1.0) + shadow.spread * 2.0;
    let shadow_height = size.height.max(1.0) + shadow.spread * 2.0;
    let corner_radius = world
        .get::<AtomeCornerRadius>(entity)
        .map(|value| value.0)
        .unwrap_or(0.0)
        + shadow.spread;
    let Some((image_width, image_height, rgba)) =
        build_shape_shadow_texture_rgba(style, shadow_width, shadow_height, corner_radius)
    else {
        return Ok(());
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
    let mut sprite = Sprite::from_image(handle.clone());
    sprite.custom_size = Some(Vec2::new(image_width as f32, image_height as f32));
    sprite.color = Color::WHITE;
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let shadow_x = position.x + shadow.offset_x - shadow.spread - shadow.blur;
    let shadow_y = position.y + shadow.offset_y - shadow.spread - shadow.blur;
    let shadow_entity = world
        .spawn((
            sprite,
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
    world.entity_mut(entity).insert(AtomeShapeShadowOverlay {
        entities: vec![shadow_entity],
        image_handles: vec![handle],
    });
    Ok(())
}
