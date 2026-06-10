use bevy::{
    image::ImageSampler,
    prelude::*,
    render::render_resource::{TextureFormat, TextureUsages},
};

use crate::selection_overlay::build_shadow_texture_rgba;
use crate::*;

fn shape_node(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        id: id.to_string(),
        kind: "shape".to_string(),
        parent_id: None,
        logical_position: [12.0, 24.0],
        logical_size: [120.0, 50.0],
        layer: 3,
        color: Some([0.1, 0.2, 0.3, 1.0]),
        text: None,
        source: None,
        texture_size: None,
        texture: None,
        peaks: None,
        playback_progress: None,
        selected: None,
    }
}

fn video_node(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        id: id.to_string(),
        kind: "video".to_string(),
        parent_id: None,
        logical_position: [20.0, 30.0],
        logical_size: [160.0, 90.0],
        layer: 4,
        color: Some([0.24, 0.55, 0.92, 1.0]),
        text: None,
        source: Some("/fixtures/video.mp4".to_string()),
        texture_size: None,
        texture: None,
        peaks: None,
        playback_progress: None,
        selected: None,
    }
}

fn text_node_with_texture(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        id: id.to_string(),
        kind: "text".to_string(),
        parent_id: None,
        logical_position: [18.0, 26.0],
        logical_size: [80.0, 30.0],
        layer: 5,
        color: Some([1.0, 1.0, 1.0, 1.0]),
        text: Some("Sharp".to_string()),
        source: None,
        texture_size: None,
        texture: Some(AtomeTexture {
            width: 160,
            height: 60,
            rgba: vec![255; 160 * 60 * 4],
        }),
        peaks: None,
        playback_progress: None,
        selected: None,
    }
}

#[test]
fn plugin_spawns_projected_nodes_and_camera() {
    let scene = AtomeRenderScene {
        nodes: vec![shape_node("shape_1")],
        selection_style: None,
    };
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::new(
        640.0, 480.0, scene,
    )));
    app.update();

    let mut camera_query = app.world_mut().query::<&Camera2d>();
    assert_eq!(camera_query.iter(app.world()).count(), 1);
    assert_eq!(app.world().resource::<AtomeEntityTable>().by_id.len(), 1);
}

#[test]
fn transform_and_surface_patches_reproject_nodes() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    let entity = apply_spawn(&mut world, shape_node("shape_surface")).unwrap();

    assert_eq!(
        world.get::<Transform>(entity).unwrap().translation,
        Vec3::new(-248.0, 191.0, -3.0)
    );
    apply_surface(
        &mut world,
        AtomeSurfacePatch {
            width: 320.0,
            height: 240.0,
        },
    )
    .unwrap();
    assert_eq!(
        world.get::<Transform>(entity).unwrap().translation,
        Vec3::new(-88.0, 71.0, -3.0)
    );
}

#[test]
fn selected_nodes_create_overlay_from_configured_visual_style() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    let scene = AtomeRenderScene {
        nodes: Vec::new(),
        selection_style: Some(SelectionVisualStyle {
            shadow_size: 9.0,
            border_thickness: 2.0,
            dash_length: 5.0,
            dash_gap: 3.0,
            border_color: [1.0, 1.0, 1.0, 1.0],
            shadow_color: [0.0, 0.0, 0.0, 0.5],
        }),
    };
    world.insert_resource(AtomeBevyRendererConfig::new(640.0, 480.0, scene));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            selected: Some(true),
            ..shape_node("selected_shape")
        },
    )
    .unwrap();

    let overlay = world.get::<AtomeSelectionOverlay>(entity).unwrap();
    assert!(overlay.entities.len() > 4);
    assert_eq!(overlay.image_handles.len(), 1);
    assert_eq!(world.get::<AtomeSelected>(entity).unwrap().0, true);
    let (texture_width, _texture_height, texture_rgba) = build_shadow_texture_rgba(
        world.resource::<AtomeBevyRendererConfig>().selection_style,
        120.0,
        50.0,
    )
    .unwrap();
    let alpha_at = |x: u32, y: u32| -> u8 {
        texture_rgba[(y as usize * texture_width as usize + x as usize) * 4 + 3]
    };
    assert_eq!(alpha_at(12, 12), 0);
    assert!(alpha_at(8, 12) > alpha_at(1, 12));
    assert_eq!(alpha_at(0, 0), 0);
    let selected_depth = world.get::<Transform>(entity).unwrap().translation.z;
    let shadow_depth = world
        .get::<Transform>(overlay.entities[0])
        .unwrap()
        .translation
        .z;
    let outline_depth = world
        .get::<Transform>(overlay.entities[1])
        .unwrap()
        .translation
        .z;
    assert_eq!(shadow_depth, selected_depth - 0.5);
    assert_eq!(outline_depth, selected_depth + 0.5);
    assert!(shadow_depth < selected_depth);
    assert!(outline_depth > selected_depth);
    assert!(shadow_depth > depth_for_layer(4));

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "selected_shape".to_string(),
            color: None,
            selected: Some(false),
            playback_progress: None,
        },
    )
    .unwrap();

    assert!(world.get::<AtomeSelectionOverlay>(entity).is_none());
    assert_eq!(world.resource::<Assets<Image>>().len(), 0);
}

#[test]
fn video_nodes_spawn_bevy_gpu_texture_target_without_cpu_frame_data() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(&mut world, video_node("gpu_video")).unwrap();

    let sprite = world.get::<Sprite>(entity).unwrap();
    let image = world
        .resource::<Assets<Image>>()
        .get(&sprite.image)
        .expect("video sprite should reference a Bevy image");
    assert_eq!(image.texture_descriptor.size.width, 160);
    assert_eq!(image.texture_descriptor.size.height, 90);
    assert_eq!(image.texture_descriptor.format, TextureFormat::Rgba8Unorm);
    assert!(image
        .texture_descriptor
        .usage
        .contains(TextureUsages::COPY_DST));
    assert!(image
        .texture_descriptor
        .usage
        .contains(TextureUsages::RENDER_ATTACHMENT));
    assert_eq!(image.data, None);
    assert!(world
        .get::<video_texture::AtomeVideoTexture>(entity)
        .is_some());
}

#[test]
fn imported_text_textures_use_linear_sampling_without_changing_logical_size() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(&mut world, text_node_with_texture("sampled_text")).unwrap();

    let sprite = world.get::<Sprite>(entity).unwrap();
    assert_eq!(sprite.custom_size, Some(Vec2::new(80.0, 30.0)));
    let image = world
        .resource::<Assets<Image>>()
        .get(&sprite.image)
        .expect("text sprite should reference a Bevy image");
    assert_eq!(image.texture_descriptor.size.width, 160);
    assert_eq!(image.texture_descriptor.size.height, 60);
    assert!(matches!(image.sampler, ImageSampler::Descriptor(_)));
    assert_eq!(image.sampler, ImageSampler::linear());
}

#[test]
fn video_nodes_use_media_texture_size_when_source_aspect_differs_from_atom() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            logical_size: [180.0, 180.0],
            texture_size: Some([1920, 1080]),
            ..video_node("wide_gpu_video")
        },
    )
    .unwrap();

    let sprite = world.get::<Sprite>(entity).unwrap();
    assert_eq!(sprite.custom_size, Some(Vec2::new(180.0, 180.0)));
    let image = world
        .resource::<Assets<Image>>()
        .get(&sprite.image)
        .expect("video sprite should reference a Bevy image");
    assert_eq!(image.texture_descriptor.size.width, 1920);
    assert_eq!(image.texture_descriptor.size.height, 1080);
    assert_eq!(image.data, None);
}

#[test]
fn video_resource_patch_replaces_gpu_texture_with_media_size() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(&mut world, video_node("resized_video")).unwrap();
    apply_resource(
        &mut world,
        AtomeResourcePatch {
            id: "resized_video".to_string(),
            source: Some("/fixtures/video.mp4".to_string()),
            texture_size: Some([478, 850]),
            texture: None,
            peaks: None,
        },
    )
    .unwrap();

    let sprite = world.get::<Sprite>(entity).unwrap();
    assert_eq!(sprite.custom_size, Some(Vec2::new(160.0, 90.0)));
    let image = world
        .resource::<Assets<Image>>()
        .get(&sprite.image)
        .expect("video sprite should reference a Bevy image");
    assert_eq!(image.texture_descriptor.size.width, 478);
    assert_eq!(image.texture_descriptor.size.height, 850);
    assert_eq!(image.data, None);
}

#[test]
fn audio_waveform_progress_spawns_and_moves_bevy_playhead_overlay() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            id: "waveform_progress".to_string(),
            kind: "audio_waveform".to_string(),
            parent_id: None,
            logical_position: [20.0, 30.0],
            logical_size: [200.0, 60.0],
            layer: 2,
            color: Some([0.2, 0.4, 0.6, 1.0]),
            text: None,
            source: None,
            texture_size: None,
            texture: None,
            peaks: Some(vec![0.1, 0.5, -0.2]),
            playback_progress: Some(0.25),
            selected: None,
        },
    )
    .unwrap();

    let overlay = world
        .get::<AtomeWaveformPlaybackOverlay>(entity)
        .expect("waveform progress should create a Bevy overlay");
    assert_eq!(overlay.entities.len(), 1);
    let line_entity = overlay.entities[0];
    assert_eq!(
        world.get::<Transform>(line_entity).unwrap().translation,
        Vec3::new(-250.0, 180.0, -1.3)
    );

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "waveform_progress".to_string(),
            color: None,
            selected: None,
            playback_progress: Some(Some(0.75)),
        },
    )
    .unwrap();

    let moved_overlay = world.get::<AtomeWaveformPlaybackOverlay>(entity).unwrap();
    let moved_line_entity = moved_overlay.entities[0];
    assert_eq!(
        world
            .get::<Transform>(moved_line_entity)
            .unwrap()
            .translation,
        Vec3::new(-150.0, 180.0, -1.3)
    );

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "waveform_progress".to_string(),
            color: None,
            selected: None,
            playback_progress: Some(None),
        },
    )
    .unwrap();

    assert!(world.get::<AtomeWaveformPlaybackOverlay>(entity).is_none());
}
