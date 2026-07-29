use bevy::{
    camera::{visibility::RenderLayers, ClearColorConfig},
    prelude::*,
    sprite_render::MeshMaterial2d,
};

use crate::{
    backdrop_surface::BackdropSurfaceUniform,
    plugin::AtomeBevyRendererPlugin,
    types::AtomeBevyRendererConfig,
    workspace_backdrop::{
        set_workspace_backdrop_enabled, AtomePresentationCamera, AtomeWorkspaceBackdrop,
        FLOWER_PRESENTATION_LAYER, WORKSPACE_CAPTURE_LAYER,
    },
    workspace_blur::{
        backdrop_capture_pixel_size, AssistantOpticsSettings, WorkspaceBlurMaterial,
        WORKSPACE_BACKDROP_DOWNSCALE,
    },
};

#[test]
fn assistant_optics_settings_are_bounded() {
    let settings = AssistantOpticsSettings {
        blur_radius_px: 1_000.0,
        refraction_px: -4.0,
        glass_mix: 2.0,
        rim_refraction_start: 1.0,
        halo_opacity: 0.8,
    }
    .normalized();
    assert_eq!(settings.blur_radius_px, 128.0);
    assert_eq!(settings.refraction_px, 0.0);
    assert_eq!(settings.glass_mix, 1.0);
    assert_eq!(settings.rim_refraction_start, 0.95);
    assert_eq!(settings.halo_opacity, 0.10);
    let defaults = AssistantOpticsSettings::default();
    assert_eq!(defaults.blur_radius_px, 48.0);
    assert_eq!(defaults.glass_mix, 1.0);
    assert_eq!(defaults.sdf_uniform(2.0).x, 48.0);
}

#[test]
fn every_camera_disables_msaa() {
    // Bevy defaults cameras to `Msaa::Sample4`, which quadruples the raster
    // bandwidth of every pass. Shapes are antialiased analytically in the
    // shaders, so MSAA is pure cost here — and fill rate is the dominant
    // power draw on the iOS GPU at a device pixel ratio of 3.
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(
        AtomeBevyRendererConfig::empty(640.0, 480.0),
    ));
    app.update();
    let state = app.world().resource::<AtomeWorkspaceBackdrop>().clone();
    let presentation_camera = app
        .world_mut()
        .query_filtered::<Entity, With<AtomePresentationCamera>>()
        .single(app.world())
        .unwrap();
    for camera in [
        presentation_camera,
        state.camera,
        state.blur.horizontal_camera,
        state.blur.vertical_camera,
    ] {
        assert_eq!(
            app.world().get::<Msaa>(camera).copied(),
            Some(Msaa::Off),
            "camera {camera:?} must opt out of MSAA"
        );
    }
}

#[test]
fn backdrop_capture_and_blur_targets_are_downscaled_together() {
    // The Gaussian passes rely on source and target sharing a size
    // (`frag_coord / textureDimensions(source)`), so the capture and both
    // ping-pong targets must be downscaled by the same factor — never one
    // without the others.
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(
        AtomeBevyRendererConfig::with_surface_metrics(
            640.0,
            480.0,
            1280.0,
            960.0,
            2.0,
            Default::default(),
        ),
    ));
    app.update();
    let state = app.world().resource::<AtomeWorkspaceBackdrop>().clone();
    assert_eq!(state.pixel_size, UVec2::new(1280, 960));
    let expected = backdrop_capture_pixel_size(state.pixel_size);
    assert_eq!(
        expected,
        UVec2::new(
            1280 / WORKSPACE_BACKDROP_DOWNSCALE,
            960 / WORKSPACE_BACKDROP_DOWNSCALE
        )
    );
    let images = app.world().resource::<Assets<Image>>();
    for handle in [
        &state.image,
        &state.blur.horizontal_image,
        &state.blur.vertical_image,
    ] {
        let size = images.get(handle).unwrap().texture_descriptor.size;
        assert_eq!(
            (size.width, size.height),
            (expected.x, expected.y),
            "capture and blur targets must all share the downscaled size"
        );
    }
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
    assert!(
        matches!(
            app.world().get::<Camera>(state.camera).unwrap().clear_color,
            ClearColorConfig::Custom(_)
        ),
        "the capture texture is cleared every frame before the workspace is rendered"
    );
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
    // The 48 px default token is a *logical* radius; the passes work in target
    // texels, which are `WORKSPACE_BACKDROP_DOWNSCALE` times coarser than
    // physical pixels (device pixel ratio is 1 in this fixture).
    let expected_radius = 48.0 / WORKSPACE_BACKDROP_DOWNSCALE as f32;
    assert_eq!(
        horizontal.uniform.direction_radius,
        Vec4::new(1.0, 0.0, expected_radius, 0.0)
    );
    assert_eq!(
        vertical.uniform.direction_radius,
        Vec4::new(0.0, 1.0, expected_radius, 0.0)
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

#[test]
fn workspace_capture_never_sees_presentation_content() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(
        AtomeBevyRendererConfig::empty(640.0, 480.0),
    ));
    app.update();
    let capture_camera = app.world().resource::<AtomeWorkspaceBackdrop>().camera;
    let capture_layers = app.world().get::<RenderLayers>(capture_camera).unwrap();
    assert!(capture_layers.intersects(&RenderLayers::layer(WORKSPACE_CAPTURE_LAYER)));
    assert!(!capture_layers.intersects(&RenderLayers::layer(FLOWER_PRESENTATION_LAYER)));

    let presentation_camera = app
        .world_mut()
        .query_filtered::<Entity, With<AtomePresentationCamera>>()
        .iter(app.world())
        .next()
        .unwrap();
    let presentation_layers = app.world().get::<RenderLayers>(presentation_camera).unwrap();
    assert!(presentation_layers.intersects(&RenderLayers::layer(WORKSPACE_CAPTURE_LAYER)));
    assert!(presentation_layers.intersects(&RenderLayers::layer(FLOWER_PRESENTATION_LAYER)));
}

#[test]
fn flower_backdrop_uses_screen_coordinates_for_gaussian_passes_and_logical_coordinates_for_composition() {
    let blur_shader = include_str!("assets/shaders/workspace_blur.wgsl");
    assert!(blur_shader.contains("fn gaussian_blur("));
    assert!(blur_shader.contains("mesh.position,"));
    assert!(blur_shader.contains("radius * (4.0 / 1.5)"));
    assert!(!blur_shader.contains("3.2307692308"));

    let shader = include_str!("assets/shaders/backdrop_surface.wgsl");
    assert!(shader.contains("mesh.world_position.x / workspace_size.x + 0.5"));
    assert!(shader.contains("0.5 - mesh.world_position.y / workspace_size.y"));
    assert!(!shader.contains("mesh.position.xy / max(dimensions"));

    let uniform = BackdropSurfaceUniform {
        size_radius: Vec4::ZERO,
        tint: Vec4::ZERO,
        workspace_size: Vec4::new(1280.0, 720.0, 0.0, 0.0),
    };
    assert_eq!(uniform.workspace_size.xy(), Vec2::new(1280.0, 720.0));
}
