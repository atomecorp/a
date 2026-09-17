use bevy::prelude::*;

use crate::{
    backdrop_surface::{insert_backdrop_surface, refresh_workspace_backdrop_enabled},
    components::{AtomeBackdropBlurState, AtomeBackdropBlurVisual},
    render_math::{atome_rect_transform, depth_for_layer},
    types::{AtomeBackdropStyle, AtomeBevyRendererConfig, AtomeSceneEffectsPatch},
};

fn clear_blur_visuals(world: &mut World) {
    let entities = std::mem::take(&mut world.resource_mut::<AtomeBackdropBlurState>().entities);
    for entity in entities {
        if world.entities().contains(entity) {
            world.despawn(entity);
        }
    }
}

pub fn apply_scene_effects(world: &mut World, patch: AtomeSceneEffectsPatch) -> Result<(), String> {
    if world.get_resource::<AtomeBackdropBlurState>().is_none() {
        world.insert_resource(AtomeBackdropBlurState::default());
    }
    clear_blur_visuals(world);
    world.resource_mut::<AtomeBackdropBlurState>().effects = patch.effects.clone();

    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let mut created = Vec::new();
    for effect in patch.effects {
        if effect.kind != "backdrop_blur" || !effect.radius.is_finite() || effect.radius <= 0.0 {
            continue;
        }
        let [x, y, width, height] = effect.bounds;
        if width <= 0.0 || height <= 0.0 {
            continue;
        }
        let entity = world
            .spawn((
                AtomeBackdropBlurVisual,
                atome_rect_transform(
                    x,
                    y,
                    width,
                    height,
                    surface_width,
                    surface_height,
                    depth_for_layer(effect.target_layer),
                ),
            ))
            .id();
        insert_backdrop_surface(
            world,
            entity,
            [width, height],
            0.0,
            AtomeBackdropStyle { blur_px: effect.radius, tint: effect.tint },
        )?;
        created.push(entity);
    }
    world.resource_mut::<AtomeBackdropBlurState>().entities = created;
    refresh_workspace_backdrop_enabled(world)
}
