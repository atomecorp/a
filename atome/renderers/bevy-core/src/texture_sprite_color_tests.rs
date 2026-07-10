use bevy::{image::Image, prelude::*};

use crate::*;

fn textured_image_node(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        id: id.to_string(),
        kind: "image".to_string(),
        parent_id: None,
        logical_position: [0.0, 0.0],
        logical_size: [32.0, 32.0],
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
        layer: 1,
        opacity: 1.0,
        corner_radius: 0.0,
        shadow: None,
        color: None,
        text: None,
        source: Some("data:image/png;base64,fixture".to_string()),
        texture_size: None,
        uv_rect: None,
        texture: Some(AtomeTexture {
            width: 2,
            height: 2,
            rgba: vec![255; 2 * 2 * 4],
        }),
        peaks: None,
        playback_progress: None,
        selected: None,
        filters: None,
        transition: None,
        procedural: None,
    }
}

fn setup_world() -> World {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(320.0, 240.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    world
}

fn assert_srgba_near(color: Color, expected: [f32; 4]) {
    let actual = color.to_srgba();
    let values = [actual.red, actual.green, actual.blue, actual.alpha];
    for (index, (actual, expected)) in values.into_iter().zip(expected).enumerate() {
        assert!(
            (actual - expected).abs() < 0.001,
            "component {index}: {actual} != {expected}"
        );
    }
}

#[test]
fn textured_image_opacity_patch_keeps_white_sprite_modulation() {
    let mut world = setup_world();
    let entity = apply_spawn(&mut world, textured_image_node("textured_image")).unwrap();

    assert_eq!(
        world.get::<AtomeVisualColor>(entity).unwrap().0,
        [1.0, 1.0, 1.0, 1.0]
    );

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "textured_image".to_string(),
            color: None,
            shadow: None,
            selected: None,
            opacity: Some(0.42),
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: None,
        },
    )
    .unwrap();

    assert_srgba_near(
        world.get::<Sprite>(entity).unwrap().color,
        [1.0, 1.0, 1.0, 0.42],
    );
}
