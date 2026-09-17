use bevy::prelude::*;

use crate::{
    backdrop_surface::BackdropSurfaceMaterial,
    components::{AtomeBackdropBlurState, AtomeBackdropBlurVisual},
    plugin::AtomeBevyRendererPlugin,
    types::{AtomeBevyRendererConfig, AtomeSceneEffect, AtomeSceneEffectsPatch},
    workspace_blur::backdrop_blur_lod,
};

#[test]
fn scene_effect_uses_one_shared_gpu_backdrop_surface() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::empty(640.0, 480.0)));
    app.update();

    crate::backdrop_blur::apply_scene_effects(
        app.world_mut(),
        AtomeSceneEffectsPatch {
            effects: vec![AtomeSceneEffect {
                id: "dashboard_blur".to_string(),
                kind: "backdrop_blur".to_string(),
                bounds: [20.0, 30.0, 320.0, 180.0],
                source_layer_max: 10,
                target_layer: 10,
                radius: 30.0,
                downsample: 0.5,
                tint: [0.0, 0.0, 0.0, 0.16],
            }],
        },
    )
    .unwrap();

    let entity = app.world().resource::<AtomeBackdropBlurState>().entities[0];
    assert!(app.world().get::<AtomeBackdropBlurVisual>(entity).is_some());
    let material_handle = app.world().get::<MeshMaterial2d<BackdropSurfaceMaterial>>(entity).unwrap();
    let material = app.world().resource::<Assets<BackdropSurfaceMaterial>>().get(&material_handle.0).unwrap();
    assert_eq!(material.uniform.blur.x, 30.0);
    assert_eq!(material.uniform.blur.z, backdrop_blur_lod(30.0, 1.0));

    crate::backdrop_blur::apply_scene_effects(app.world_mut(), AtomeSceneEffectsPatch { effects: Vec::new() }).unwrap();
    assert!(app.world().resource::<AtomeBackdropBlurState>().entities.is_empty());
    assert!(!app.world().entities().contains(entity));
}
