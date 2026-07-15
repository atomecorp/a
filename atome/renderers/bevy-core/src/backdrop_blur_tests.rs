use bevy::{color::Alpha, image::Image, prelude::*};

use crate::*;

fn shape_node(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        id: id.to_string(),
        kind: "shape".to_string(),
        parent_id: None,
        logical_position: [12.0, 24.0],
        logical_size: [120.0, 50.0],
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
        layer: 3,
        opacity: 1.0,
        corner_radius: 0.0,
        shadow: None,
        backdrop: None,
        presentation: false,
        color: Some([0.1, 0.2, 0.3, 1.0]),
        text: None,
        source: None,
        texture_size: None,
        uv_rect: None,
        texture: None,
        peaks: None,
        playback_progress: None,
        selected: None,
        filters: None,
        transition: None,
        procedural: None,
    }
}

#[test]
fn backdrop_blur_effect_spawns_samples_and_restores_original_sprite() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(AtomeBackdropBlurState::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(&mut world, shape_node("blurred_shape")).unwrap();
    let original_color = world.get::<Sprite>(entity).unwrap().color;
    crate::backdrop_blur::apply_scene_effects(
        &mut world,
        AtomeSceneEffectsPatch {
            effects: vec![AtomeSceneEffect {
                id: "dashboard_blur".to_string(),
                kind: "backdrop_blur".to_string(),
                bounds: [0.0, 0.0, 640.0, 480.0],
                source_layer_max: 10,
                target_layer: 10,
                radius: 30.0,
                downsample: 0.5,
                tint: [0.0, 0.0, 0.0, 0.16],
            }],
        },
    )
    .unwrap();

    assert_eq!(
        world.resource::<AtomeBackdropBlurState>().entities.len(),
        16
    );
    let mut query = world.query_filtered::<&Transform, With<AtomeBackdropBlurVisual>>();
    let max_horizontal_offset = query
        .iter(&world)
        .map(|transform| (transform.translation.x - 10.0).abs())
        .fold(0.0, f32::max);
    assert!(max_horizontal_offset >= 30.0);
    assert!(
        world.get::<Sprite>(entity).unwrap().color.alpha() < original_color.alpha(),
        "source sprite should be reduced while blur samples cover it"
    );

    crate::backdrop_blur::apply_scene_effects(
        &mut world,
        AtomeSceneEffectsPatch {
            effects: Vec::new(),
        },
    )
    .unwrap();

    assert_eq!(world.resource::<AtomeBackdropBlurState>().entities.len(), 0);
    assert_eq!(world.get::<Sprite>(entity).unwrap().color, original_color);
}
