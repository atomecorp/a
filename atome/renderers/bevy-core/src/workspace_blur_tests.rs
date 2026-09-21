use bevy::{
    camera::{visibility::RenderLayers, ClearColorConfig},
    prelude::*,
    render::render_resource::{TextureFormat, TextureUsages},
};

use crate::{
    plugin::AtomeBevyRendererPlugin,
    types::AtomeBevyRendererConfig,
    workspace_backdrop::{
        set_workspace_backdrop_enabled, AtomePresentationCamera, AtomeWorkspaceBackdrop, MENU_PRESENTATION_LAYER,
        WORKSPACE_CAPTURE_LAYER,
    },
    workspace_blur::{
        backdrop_blur_lod, backdrop_capture_pixel_size, backdrop_mip_level_count, AssistantOpticsSettings,
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
    assert_eq!(AssistantOpticsSettings::default().sdf_uniform(2.0).x, 48.0);
}

#[test]
fn capture_and_blur_pyramid_are_downscaled_gpu_targets() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::with_surface_metrics(
        640.0,
        480.0,
        1280.0,
        960.0,
        2.0,
        Default::default(),
    )));
    app.update();
    let state = app.world().resource::<AtomeWorkspaceBackdrop>();
    let expected = backdrop_capture_pixel_size(state.pixel_size);
    assert_eq!(expected, UVec2::new(320, 240));
    let image = app.world().resource::<Assets<Image>>().get(&state.image).unwrap();
    assert_eq!((image.texture_descriptor.size.width, image.texture_descriptor.size.height), (expected.x, expected.y));
    assert_eq!(image.texture_descriptor.mip_level_count, backdrop_mip_level_count(expected));
    assert!(image.texture_descriptor.usage.contains(TextureUsages::STORAGE_BINDING));
    assert!(image.data.is_none());
    // A texture that carries `STORAGE_BINDING` may not expose an sRGB view: the
    // bind group of the mip pass — and of every material that samples the pyramid
    // — is rejected outright. The whole chain therefore stays linear.
    assert_eq!(image.texture_descriptor.format, TextureFormat::Rgba8Unorm);
    assert!(image.texture_descriptor.view_formats.is_empty());
    assert!(image.texture_view_descriptor.is_none());
    let capture = app.world().resource::<Assets<Image>>().get(&state.capture_image).unwrap();
    assert_eq!(capture.texture_descriptor.mip_level_count, 1);
    assert!(capture.texture_descriptor.usage.contains(TextureUsages::COPY_SRC));
    assert_eq!(capture.texture_descriptor.format, TextureFormat::Rgba8Unorm);
    assert!(capture.texture_view_descriptor.is_none());
}

#[test]
fn blur_radius_is_per_surface_and_dpr_aware() {
    let ui = backdrop_blur_lod(18.0, 1.5);
    let assistant = backdrop_blur_lod(48.0, 1.5);
    assert!(assistant > ui);
    assert!(backdrop_blur_lod(18.0, 2.0) > ui);
    assert_eq!(backdrop_blur_lod(0.0, 1.0), 0.0);
}

#[test]
fn backdrop_uses_only_capture_and_presentation_cameras() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::empty(640.0, 480.0)));
    app.update();
    let state = app.world().resource::<AtomeWorkspaceBackdrop>().clone();
    let presentation =
        app.world_mut().query_filtered::<Entity, With<AtomePresentationCamera>>().single(app.world()).unwrap();
    let camera_count = {
        let world = app.world_mut();
        let mut query = world.query::<&Camera>();
        query.iter(world).count()
    };
    assert_eq!(camera_count, 2);
    assert_eq!(app.world().get::<Msaa>(state.camera), Some(&Msaa::Off));
    assert_eq!(app.world().get::<Msaa>(presentation), Some(&Msaa::Off));
    assert_eq!(app.world().get::<Camera>(state.camera).unwrap().order, -3);
    assert!(matches!(app.world().get::<Camera>(state.camera).unwrap().clear_color, ClearColorConfig::Custom(_)));
    set_workspace_backdrop_enabled(app.world_mut(), true).unwrap();
    assert!(app.world().get::<Camera>(state.camera).unwrap().is_active);
    set_workspace_backdrop_enabled(app.world_mut(), false).unwrap();
    assert!(!app.world().get::<Camera>(state.camera).unwrap().is_active);
}

#[test]
fn capture_isolated_and_shaders_use_the_canonical_viewport() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::empty(640.0, 480.0)));
    app.update();
    let capture = app.world().resource::<AtomeWorkspaceBackdrop>().camera;
    let capture_layers = app.world().get::<RenderLayers>(capture).unwrap();
    assert!(capture_layers.intersects(&RenderLayers::layer(WORKSPACE_CAPTURE_LAYER)));
    assert!(!capture_layers.intersects(&RenderLayers::layer(MENU_PRESENTATION_LAYER)));

    for shader in
        [include_str!("assets/shaders/backdrop_surface.wgsl"), include_str!("assets/shaders/procedural_sdf.wgsl")]
    {
        assert!(shader.contains("frag_coord_to_uv(mesh.position.xy, view.viewport)"));
        assert!(shader.contains("textureSampleLevel"));
        assert!(!shader.contains("textureDimensions(original_texture)"));
    }
    assert_eq!(WORKSPACE_BACKDROP_DOWNSCALE, 4);
}
