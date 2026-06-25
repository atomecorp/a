use bevy::{color::Alpha, prelude::*};
use std::collections::HashMap;

use crate::{
    components::{
        AtomeBackdropBlurState, AtomeBackdropBlurVisual, AtomeEntityTable, AtomeLayer,
        AtomeLogicalPosition, AtomeLogicalSize,
    },
    render_math::depth_for_layer,
    types::{AtomeSceneEffect, AtomeSceneEffectsPatch},
};

const SAMPLE_OFFSETS: &[(f32, f32, f32)] = &[
    (-1.0, 0.0, 0.055),
    (1.0, 0.0, 0.055),
    (0.0, -1.0, 0.055),
    (0.0, 1.0, 0.055),
    (-0.72, -0.72, 0.05),
    (0.72, -0.72, 0.05),
    (-0.72, 0.72, 0.05),
    (0.72, 0.72, 0.05),
    (-0.5, 0.0, 0.06),
    (0.5, 0.0, 0.06),
    (0.0, -0.5, 0.06),
    (0.0, 0.5, 0.06),
    (-0.36, -0.36, 0.055),
    (0.36, -0.36, 0.055),
    (-0.36, 0.36, 0.055),
    (0.36, 0.36, 0.055),
];

fn intersects(effect: &AtomeSceneEffect, position: &AtomeLogicalPosition, size: &AtomeLogicalSize) -> bool {
    let [x, y, width, height] = effect.bounds;
    position.x < x + width
        && position.x + size.width > x
        && position.y < y + height
        && position.y + size.height > y
}

fn color_with_alpha(color: Color, alpha_factor: f32) -> Color {
    color.with_alpha((color.alpha() * alpha_factor).clamp(0.0, 1.0))
}

fn restore_originals(world: &mut World, originals: HashMap<Entity, Color>) {
    for (entity, color) in originals {
        if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
            sprite.color = color;
        }
    }
}

fn clear_blur_visuals(world: &mut World) {
    let (entities, originals) = {
        let mut state = world.resource_mut::<AtomeBackdropBlurState>();
        (
            std::mem::take(&mut state.entities),
            std::mem::take(&mut state.original_sprite_colors),
        )
    };
    for entity in entities {
        if world.entities().contains(entity) {
            world.despawn(entity);
        }
    }
    restore_originals(world, originals);
}

fn collect_sources(world: &mut World, effect: &AtomeSceneEffect) -> Vec<(Entity, Transform, Sprite)> {
    let table_ids: Vec<Entity> = world.resource::<AtomeEntityTable>().by_id.values().copied().collect();
    table_ids
        .into_iter()
        .filter_map(|entity| {
            let layer = world.get::<AtomeLayer>(entity)?;
            if layer.0 >= effect.source_layer_max {
                return None;
            }
            let position = world.get::<AtomeLogicalPosition>(entity)?;
            let size = world.get::<AtomeLogicalSize>(entity)?;
            if !intersects(effect, position, size) {
                return None;
            }
            let transform = *world.get::<Transform>(entity)?;
            let sprite = world.get::<Sprite>(entity)?.clone();
            Some((entity, transform, sprite))
        })
        .collect()
}

fn spawn_blur_samples(world: &mut World, effect: &AtomeSceneEffect) {
    let radius = effect.radius.max(1.0);
    let base_z = depth_for_layer(effect.target_layer) - 0.5;
    let sources = collect_sources(world, effect);
    let mut created = Vec::new();
    let mut originals = HashMap::new();
    for (source_entity, transform, sprite) in sources {
        originals.entry(source_entity).or_insert(sprite.color);
        if let Some(mut original) = world.get_mut::<Sprite>(source_entity) {
            original.color = color_with_alpha(sprite.color, 0.16);
        }
        for (dx, dy, alpha) in SAMPLE_OFFSETS {
            let mut sample_sprite = sprite.clone();
            sample_sprite.color = color_with_alpha(sprite.color, *alpha);
            let mut sample_transform = transform;
            sample_transform.translation.x += dx * radius;
            sample_transform.translation.y -= dy * radius;
            sample_transform.translation.z = base_z;
            created.push(
                world
                    .spawn((AtomeBackdropBlurVisual, sample_sprite, sample_transform))
                    .id(),
            );
        }
    }
    let mut state = world.resource_mut::<AtomeBackdropBlurState>();
    state.entities.extend(created);
    state.original_sprite_colors.extend(originals);
}

pub fn apply_scene_effects(world: &mut World, patch: AtomeSceneEffectsPatch) -> Result<(), String> {
    if world.get_resource::<AtomeBackdropBlurState>().is_none() {
        world.insert_resource(AtomeBackdropBlurState::default());
    }
    clear_blur_visuals(world);
    {
        let mut state = world.resource_mut::<AtomeBackdropBlurState>();
        state.effects = patch.effects.clone();
    }
    for effect in patch.effects {
        if effect.kind == "backdrop_blur" && effect.radius.is_finite() && effect.radius > 0.0 {
            spawn_blur_samples(world, &effect);
        }
    }
    Ok(())
}

pub fn refresh_scene_effects(world: &mut World) -> Result<(), String> {
    let effects = world
        .get_resource::<AtomeBackdropBlurState>()
        .map(|state| state.effects.clone())
        .unwrap_or_default();
    if effects.is_empty() {
        return Ok(());
    }
    apply_scene_effects(world, AtomeSceneEffectsPatch { effects })
}
