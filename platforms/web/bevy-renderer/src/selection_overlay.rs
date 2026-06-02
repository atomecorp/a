use bevy::prelude::*;

use crate::{
    color_from_rgba, depth_for_layer,
    types::{
        AtomeLayer, AtomeLogicalPosition, AtomeLogicalSize, AtomeSelected, AtomeSelectionOverlay,
        WebBevyRendererConfig,
    },
};

const SELECTION_SHADOW_SIZE: f32 = 12.0;
const SELECTION_BORDER_THICKNESS: f32 = 1.5;
const SELECTION_DASH_LENGTH: f32 = 6.0;
const SELECTION_DASH_GAP: f32 = 4.0;
const SELECTION_BORDER_COLOR: [f32; 4] = [0.92, 0.94, 0.97, 1.0];
const SELECTION_SHADOW_COLOR: [f32; 4] = [0.0, 0.0, 0.0, 0.32];

fn overlay_depth_for_layer(layer: i32) -> f32 {
    depth_for_layer(layer) - 0.5
}

fn atome_rect_transform(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    surface_width: f32,
    surface_height: f32,
    z: f32,
) -> Transform {
    Transform::from_translation(Vec3::new(
        x + width / 2.0 - surface_width / 2.0,
        surface_height / 2.0 - y - height / 2.0,
        z,
    ))
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
        let config = world.resource::<WebBevyRendererConfig>();
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
    start_x: f32,
    start_y: f32,
    length: f32,
    horizontal: bool,
    z: f32,
) {
    let mut offset = 0.0;
    while offset < length.max(0.0) {
        let dash = (length - offset).min(SELECTION_DASH_LENGTH).max(0.0);
        if dash > 0.0 {
            let width = if horizontal {
                dash
            } else {
                SELECTION_BORDER_THICKNESS
            };
            let height = if horizontal {
                SELECTION_BORDER_THICKNESS
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
                SELECTION_BORDER_COLOR,
                z,
            ));
        }
        offset += SELECTION_DASH_LENGTH + SELECTION_DASH_GAP;
    }
}

pub(crate) fn remove_selection_overlay(world: &mut World, entity: Entity) {
    if let Some(overlay) = world.get::<AtomeSelectionOverlay>(entity).cloned() {
        for overlay_entity in overlay.entities {
            if world.get_entity(overlay_entity).is_ok() {
                world.despawn(overlay_entity);
            }
        }
        world.entity_mut(entity).remove::<AtomeSelectionOverlay>();
    }
}

pub(crate) fn rebuild_selection_overlay(world: &mut World, entity: Entity) -> Result<(), String> {
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
    let x = position.x;
    let y = position.y;
    let width = size.width.max(1.0);
    let height = size.height.max(1.0);
    let z = overlay_depth_for_layer(layer);
    let mut entities = vec![
        spawn_overlay_rect(
            world,
            x - SELECTION_SHADOW_SIZE,
            y - SELECTION_SHADOW_SIZE,
            width + SELECTION_SHADOW_SIZE * 2.0,
            SELECTION_SHADOW_SIZE,
            SELECTION_SHADOW_COLOR,
            z,
        ),
        spawn_overlay_rect(
            world,
            x - SELECTION_SHADOW_SIZE,
            y + height,
            width + SELECTION_SHADOW_SIZE * 2.0,
            SELECTION_SHADOW_SIZE,
            SELECTION_SHADOW_COLOR,
            z,
        ),
        spawn_overlay_rect(
            world,
            x - SELECTION_SHADOW_SIZE,
            y,
            SELECTION_SHADOW_SIZE,
            height,
            SELECTION_SHADOW_COLOR,
            z,
        ),
        spawn_overlay_rect(
            world,
            x + width,
            y,
            SELECTION_SHADOW_SIZE,
            height,
            SELECTION_SHADOW_COLOR,
            z,
        ),
    ];
    spawn_dashed_axis(world, &mut entities, x, y, width, true, z);
    spawn_dashed_axis(
        world,
        &mut entities,
        x,
        y + height - SELECTION_BORDER_THICKNESS,
        width,
        true,
        z,
    );
    spawn_dashed_axis(world, &mut entities, x, y, height, false, z);
    spawn_dashed_axis(
        world,
        &mut entities,
        x + width - SELECTION_BORDER_THICKNESS,
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
