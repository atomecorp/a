use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::{
    render_math::{atome_rect_transform, color_from_rgba, depth_for_layer},
    types::{
        AtomeBevyRendererConfig, AtomeLayer, AtomeLogicalPosition, AtomeLogicalSize, AtomeSelected,
        AtomeSelectionOverlay, SelectionVisualStyle,
    },
};

fn shadow_depth_for_layer(layer: i32) -> f32 {
    depth_for_layer(layer) - 0.5
}

fn outline_depth_for_layer(layer: i32) -> f32 {
    depth_for_layer(layer) + 0.5
}

fn spawn_overlay_rect(
    world: &mut World,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    color: [f32; 4],
    z: f32,
) -> Entity {
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let width = width.max(1.0);
    let height = height.max(1.0);
    world
        .spawn((
            Sprite::from_color(color_from_rgba(color), Vec2::new(width, height)),
            atome_rect_transform(x, y, width, height, surface_width, surface_height, z),
        ))
        .id()
}

fn spawn_dashed_axis(
    world: &mut World,
    entities: &mut Vec<Entity>,
    style: SelectionVisualStyle,
    start_x: f32,
    start_y: f32,
    length: f32,
    horizontal: bool,
    z: f32,
) {
    let mut offset = 0.0;
    while offset < length.max(0.0) {
        let dash = (length - offset).min(style.dash_length).max(0.0);
        if dash > 0.0 {
            let width = if horizontal {
                dash
            } else {
                style.border_thickness
            };
            let height = if horizontal {
                style.border_thickness
            } else {
                dash
            };
            let x = start_x + if horizontal { offset } else { 0.0 };
            let y = start_y + if horizontal { 0.0 } else { offset };
            entities.push(spawn_overlay_rect(
                world,
                x,
                y,
                width,
                height,
                style.border_color,
                z,
            ));
        }
        offset += style.dash_length + style.dash_gap;
    }
}

fn channel_to_u8(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn shadow_alpha_for_distance(distance: f32, radius: f32, base_alpha: f32) -> u8 {
    if radius <= 0.0 || distance > radius {
        return 0;
    }
    let t = (1.0 - distance / radius).clamp(0.0, 1.0);
    let eased = t * t * (3.0 - 2.0 * t);
    channel_to_u8(base_alpha * eased)
}

pub(crate) fn build_shadow_texture_rgba(
    style: SelectionVisualStyle,
    width: f32,
    height: f32,
) -> Option<(u32, u32, Vec<u8>)> {
    let radius = style.shadow_size.max(0.0);
    if radius <= 0.0 || style.shadow_color[3] <= 0.0 {
        return None;
    }
    let image_width = (width.max(1.0) + radius * 2.0).ceil() as u32;
    let image_height = (height.max(1.0) + radius * 2.0).ceil() as u32;
    let left = radius;
    let top = radius;
    let right = radius + width.max(1.0);
    let bottom = radius + height.max(1.0);
    let red = channel_to_u8(style.shadow_color[0]);
    let green = channel_to_u8(style.shadow_color[1]);
    let blue = channel_to_u8(style.shadow_color[2]);
    let mut rgba = vec![0; image_width as usize * image_height as usize * 4];
    for py in 0..image_height {
        let y = py as f32 + 0.5;
        let dy = if y < top {
            top - y
        } else if y > bottom {
            y - bottom
        } else {
            0.0
        };
        for px in 0..image_width {
            let x = px as f32 + 0.5;
            let dx = if x < left {
                left - x
            } else if x > right {
                x - right
            } else {
                0.0
            };
            if dx == 0.0 && dy == 0.0 {
                continue;
            }
            let alpha = shadow_alpha_for_distance(
                (dx * dx + dy * dy).sqrt(),
                radius,
                style.shadow_color[3],
            );
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

fn spawn_blurred_shadow(
    world: &mut World,
    entities: &mut Vec<Entity>,
    image_handles: &mut Vec<Handle<Image>>,
    style: SelectionVisualStyle,
    bounds: (f32, f32, f32, f32),
    z: f32,
) -> Result<(), String> {
    let (x, y, width, height) = bounds;
    let Some((image_width, image_height, rgba)) = build_shadow_texture_rgba(style, width, height)
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
            .ok_or_else(|| "bevy_selection_shadow_image_assets_required".to_string())?;
        images.add(image)
    };
    let mut sprite = Sprite::from_image(handle.clone());
    sprite.custom_size = Some(Vec2::new(image_width as f32, image_height as f32));
    sprite.color = Color::WHITE;
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    entities.push(
        world
            .spawn((
                sprite,
                atome_rect_transform(
                    x - style.shadow_size,
                    y - style.shadow_size,
                    image_width as f32,
                    image_height as f32,
                    surface_width,
                    surface_height,
                    z,
                ),
            ))
            .id(),
    );
    image_handles.push(handle);
    Ok(())
}

pub fn remove_selection_overlay(world: &mut World, entity: Entity) {
    if let Some(overlay) = world.get::<AtomeSelectionOverlay>(entity).cloned() {
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
        world.entity_mut(entity).remove::<AtomeSelectionOverlay>();
    }
}

pub fn rebuild_selection_overlay(world: &mut World, entity: Entity) -> Result<(), String> {
    remove_selection_overlay(world, entity);
    if world
        .get::<AtomeSelected>(entity)
        .map(|value| value.0)
        .unwrap_or(false)
        != true
    {
        return Ok(());
    }
    let position = *world
        .get::<AtomeLogicalPosition>(entity)
        .ok_or_else(|| "bevy_selection_position_missing".to_string())?;
    let size = *world
        .get::<AtomeLogicalSize>(entity)
        .ok_or_else(|| "bevy_selection_size_missing".to_string())?;
    let layer = world
        .get::<AtomeLayer>(entity)
        .map(|value| value.0)
        .unwrap_or(0);
    let style = world.resource::<AtomeBevyRendererConfig>().selection_style;
    let x = position.x;
    let y = position.y;
    let width = size.width.max(1.0);
    let height = size.height.max(1.0);
    let shadow_z = shadow_depth_for_layer(layer);
    let outline_z = outline_depth_for_layer(layer);
    let mut entities = Vec::new();
    let mut image_handles = Vec::new();
    spawn_blurred_shadow(
        world,
        &mut entities,
        &mut image_handles,
        style,
        (x, y, width, height),
        shadow_z,
    )?;
    spawn_dashed_axis(world, &mut entities, style, x, y, width, true, outline_z);
    spawn_dashed_axis(
        world,
        &mut entities,
        style,
        x,
        y + height - style.border_thickness,
        width,
        true,
        outline_z,
    );
    spawn_dashed_axis(world, &mut entities, style, x, y, height, false, outline_z);
    spawn_dashed_axis(
        world,
        &mut entities,
        style,
        x + width - style.border_thickness,
        y,
        height,
        false,
        outline_z,
    );
    world.entity_mut(entity).insert(AtomeSelectionOverlay {
        entities,
        image_handles,
    });
    Ok(())
}
