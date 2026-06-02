use bevy::prelude::*;

use crate::{
    render_math::{atome_rect_transform, color_from_rgba, depth_for_layer},
    types::{
        AtomeBevyRendererConfig, AtomeLayer, AtomeLogicalPosition, AtomeLogicalSize, AtomeSelected,
        AtomeSelectionOverlay, SelectionVisualStyle,
    },
};

fn overlay_depth_for_layer(layer: i32) -> f32 {
    depth_for_layer(layer) - 0.5
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

pub fn remove_selection_overlay(world: &mut World, entity: Entity) {
    if let Some(overlay) = world.get::<AtomeSelectionOverlay>(entity).cloned() {
        for overlay_entity in overlay.entities {
            if world.get_entity(overlay_entity).is_ok() {
                world.despawn(overlay_entity);
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
    let z = overlay_depth_for_layer(layer);
    let mut entities = vec![
        spawn_overlay_rect(
            world,
            x - style.shadow_size,
            y - style.shadow_size,
            width + style.shadow_size * 2.0,
            style.shadow_size,
            style.shadow_color,
            z,
        ),
        spawn_overlay_rect(
            world,
            x - style.shadow_size,
            y + height,
            width + style.shadow_size * 2.0,
            style.shadow_size,
            style.shadow_color,
            z,
        ),
        spawn_overlay_rect(
            world,
            x - style.shadow_size,
            y,
            style.shadow_size,
            height,
            style.shadow_color,
            z,
        ),
        spawn_overlay_rect(
            world,
            x + width,
            y,
            style.shadow_size,
            height,
            style.shadow_color,
            z,
        ),
    ];
    spawn_dashed_axis(world, &mut entities, style, x, y, width, true, z);
    spawn_dashed_axis(
        world,
        &mut entities,
        style,
        x,
        y + height - style.border_thickness,
        width,
        true,
        z,
    );
    spawn_dashed_axis(world, &mut entities, style, x, y, height, false, z);
    spawn_dashed_axis(
        world,
        &mut entities,
        style,
        x + width - style.border_thickness,
        y,
        height,
        false,
        z,
    );
    world
        .entity_mut(entity)
        .insert(AtomeSelectionOverlay { entities });
    Ok(())
}
