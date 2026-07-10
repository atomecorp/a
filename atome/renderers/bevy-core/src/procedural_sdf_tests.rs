use bevy::{image::Image, mesh::Mesh, prelude::*, sprite_render::MeshMaterial2d};

use crate::{
    apply_spawn, apply_style,
    procedural_sdf::ProceduralSdfMaterial,
    types::{
        AtomeBevyRendererConfig, AtomeEntityTable, AtomeProceduralSdf, AtomeRenderNode,
        AtomeRenderScene, AtomeStylePatch,
    },
};

fn contract() -> AtomeProceduralSdf {
    AtomeProceduralSdf {
        morph: [1.12, 0.9, 0.16, 0.02],
        phase: 4.0,
        pulse: 0.03,
        time: 1.25,
        intensity: 0.6,
    }
}

fn world() -> World {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::new(
        1280.0,
        720.0,
        AtomeRenderScene::default(),
    ));
    world.insert_resource(Assets::<Image>::default());
    world.insert_resource(Assets::<Mesh>::default());
    world.insert_resource(Assets::<ProceduralSdfMaterial>::default());
    world
}

#[test]
fn procedural_sdf_spawns_and_patches_one_bounded_material_quad() {
    let mut world = world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            id: "assistant_sdf".to_string(),
            kind: "procedural_sdf".to_string(),
            parent_id: None,
            logical_position: [430.0, 150.0],
            logical_size: [420.0, 420.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 1180,
            opacity: 1.0,
            corner_radius: 0.0,
            shadow: None,
            color: None,
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
            procedural: Some(contract()),
        },
    )
    .unwrap();
    let handle = world
        .get::<MeshMaterial2d<ProceduralSdfMaterial>>(entity)
        .unwrap()
        .0
        .clone();
    assert!(world.get::<Mesh2d>(entity).is_some());
    assert_eq!(
        world
            .resource::<Assets<ProceduralSdfMaterial>>()
            .get(&handle)
            .unwrap()
            .uniform
            .morph
            .to_array(),
        contract().morph
    );

    let patched = AtomeProceduralSdf {
        phase: 2.0,
        intensity: 0.25,
        ..contract()
    };
    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "assistant_sdf".to_string(),
            color: None,
            shadow: None,
            selected: None,
            opacity: None,
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: Some(patched),
        },
    )
    .unwrap();
    let uniform = world
        .resource::<Assets<ProceduralSdfMaterial>>()
        .get(&handle)
        .unwrap()
        .uniform;
    assert_eq!(uniform.dynamics.x, 2.0);
    assert_eq!(uniform.dynamics.w, 0.25);
}
