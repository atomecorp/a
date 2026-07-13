use bevy::{prelude::*, sprite_render::MeshMaterial2d};

use crate::{
    plugin::AtomeBevyRendererPlugin,
    types::AtomeBevyRendererConfig,
    workspace_backdrop::{set_workspace_backdrop_enabled, AtomeWorkspaceBackdrop},
    workspace_blur::{AssistantOpticsSettings, WorkspaceBlurMaterial},
};

#[test]
fn assistant_optics_settings_are_bounded() {
    let settings = AssistantOpticsSettings {
        blur_radius_px: 100.0,
        refraction_px: -4.0,
        glass_mix: 2.0,
        rim_refraction_start: 1.0,
        halo_opacity: 0.8,
    }
    .normalized();
    assert_eq!(settings.blur_radius_px, 32.0);
    assert_eq!(settings.refraction_px, 0.0);
    assert_eq!(settings.glass_mix, 1.0);
    assert_eq!(settings.rim_refraction_start, 0.95);
    assert_eq!(settings.halo_opacity, 0.10);
    let defaults = AssistantOpticsSettings::default();
    assert_eq!(defaults.blur_radius_px, 16.0);
    assert_eq!(defaults.glass_mix, 0.48);
    assert_eq!(defaults.sdf_uniform(2.0).x, 48.0);
}

#[test]
fn workspace_blur_pipeline_has_ordered_reusable_passes() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(
        AtomeBevyRendererConfig::empty(640.0, 480.0),
    ));
    app.update();
    let state = app.world().resource::<AtomeWorkspaceBackdrop>().clone();
    assert_eq!(app.world().get::<Camera>(state.camera).unwrap().order, -3);
    assert_eq!(
        app.world()
            .get::<Camera>(state.blur.horizontal_camera)
            .unwrap()
            .order,
        -2
    );
    assert_eq!(
        app.world()
            .get::<Camera>(state.blur.vertical_camera)
            .unwrap()
            .order,
        -1
    );

    let horizontal_handle = app
        .world()
        .get::<MeshMaterial2d<WorkspaceBlurMaterial>>(state.blur.horizontal_quad)
        .unwrap()
        .0
        .clone();
    let vertical_handle = app
        .world()
        .get::<MeshMaterial2d<WorkspaceBlurMaterial>>(state.blur.vertical_quad)
        .unwrap()
        .0
        .clone();
    let materials = app.world().resource::<Assets<WorkspaceBlurMaterial>>();
    let horizontal = materials.get(&horizontal_handle).unwrap();
    let vertical = materials.get(&vertical_handle).unwrap();
    assert_eq!(horizontal.source, state.image);
    assert_eq!(vertical.source, state.blur.horizontal_image);
    assert_eq!(
        horizontal.uniform.direction_radius,
        Vec4::new(1.0, 0.0, 16.0, 0.0)
    );
    assert_eq!(
        vertical.uniform.direction_radius,
        Vec4::new(0.0, 1.0, 16.0, 0.0)
    );

    for _ in 0..5 {
        set_workspace_backdrop_enabled(app.world_mut(), true).unwrap();
        for camera in [
            state.camera,
            state.blur.horizontal_camera,
            state.blur.vertical_camera,
        ] {
            assert!(app.world().get::<Camera>(camera).unwrap().is_active);
        }
        set_workspace_backdrop_enabled(app.world_mut(), false).unwrap();
        for camera in [
            state.camera,
            state.blur.horizontal_camera,
            state.blur.vertical_camera,
        ] {
            assert!(!app.world().get::<Camera>(camera).unwrap().is_active);
        }
    }
}
