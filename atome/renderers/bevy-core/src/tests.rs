use bevy::{image::ImageSampler, prelude::*};

use crate::selection_overlay::build_shadow_texture_rgba;
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
    }
}

fn text_node_with_texture(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        id: id.to_string(),
        kind: "text".to_string(),
        parent_id: None,
        logical_position: [18.0, 26.0],
        logical_size: [80.0, 30.0],
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
        layer: 5,
        opacity: 1.0,
        corner_radius: 0.0,
        color: Some([1.0, 1.0, 1.0, 1.0]),
        text: Some("Sharp".to_string()),
        source: None,
        texture_size: None,
        uv_rect: None,
        texture: Some(AtomeTexture {
            width: 160,
            height: 60,
            rgba: vec![255; 160 * 60 * 4],
        }),
        peaks: None,
        playback_progress: None,
        selected: None,
        filters: None,
        transition: None,
    }
}

fn assert_vec2_near(actual: Option<Vec2>, expected: Vec2) {
    let actual = actual.expect("sprite custom size should be set");
    assert!(
        (actual.x - expected.x).abs() < 0.01,
        "x: {actual:?} != {expected:?}"
    );
    assert!(
        (actual.y - expected.y).abs() < 0.01,
        "y: {actual:?} != {expected:?}"
    );
}

fn assert_fixed_projection_size(projection: &Projection, width: f32, height: f32) {
    let Projection::Orthographic(orthographic) = projection else {
        panic!("expected orthographic camera projection");
    };
    let bevy::camera::ScalingMode::Fixed {
        width: actual_width,
        height: actual_height,
    } = orthographic.scaling_mode
    else {
        panic!("expected fixed orthographic scaling mode");
    };
    assert!((actual_width - width).abs() < 0.01);
    assert!((actual_height - height).abs() < 0.01);
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
    let mut projection_query = app.world_mut().query::<&Projection>();
    let projection = projection_query.single(app.world()).unwrap();
    assert_fixed_projection_size(projection, 640.0, 480.0);
    assert_eq!(app.world().resource::<AtomeEntityTable>().by_id.len(), 1);
}

#[test]
fn transform_and_surface_patches_reproject_nodes() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    world.spawn((
        Camera2d,
        crate::render_math::atome_camera_projection(640.0, 480.0),
    ));
    let entity = apply_spawn(&mut world, shape_node("shape_surface")).unwrap();

    assert_eq!(
        world.get::<Transform>(entity).unwrap().translation,
        Vec3::new(-248.0, 191.0, depth_for_layer(3))
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
        Vec3::new(-88.0, 71.0, depth_for_layer(3))
    );
    let mut projection_query = world.query::<&Projection>();
    let projection = projection_query.single(&world).unwrap();
    assert_fixed_projection_size(projection, 320.0, 240.0);
}

#[test]
fn rounded_shape_nodes_use_alpha_mask_texture_without_resizing() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            corner_radius: 8.0,
            ..shape_node("rounded_shape")
        },
    )
    .unwrap();

    let sprite = world.get::<Sprite>(entity).unwrap();
    assert_vec2_near(sprite.custom_size, Vec2::new(120.0, 50.0));
    let image = world
        .resource::<Assets<Image>>()
        .get(&sprite.image)
        .expect("rounded shape should reference a generated mask");
    assert_eq!(image.texture_descriptor.size.width, 120);
    assert_eq!(image.texture_descriptor.size.height, 50);
    let data = image.data.as_ref().expect("rounded mask should keep rgba data");
    let alpha_at = |x: usize, y: usize| -> u8 {
        data[(y * 120 + x) * 4 + 3]
    };
    assert_eq!(alpha_at(0, 0), 0);
    assert_eq!(alpha_at(60, 25), 255);
}

#[test]
fn surface_background_stays_behind_atomes_and_outside_entity_table() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let atome_entity = apply_spawn(&mut world, shape_node("shape_above_background")).unwrap();
    let background_entity = background::apply_surface_background(
        &mut world,
        AtomeSurfaceBackgroundPatch {
            signature: "solid".to_string(),
            color: [0.1, 0.1, 0.1, 1.0],
            texture: None,
        },
    )
    .unwrap();

    assert!(world
        .get::<AtomeSurfaceBackground>(background_entity)
        .is_some());
    assert_eq!(world.resource::<AtomeEntityTable>().by_id.len(), 1);
    assert_eq!(
        world
            .resource::<AtomeEntityTable>()
            .by_id
            .get("shape_above_background"),
        Some(&atome_entity)
    );
    assert!(world
        .resource::<AtomeEntityTable>()
        .by_id
        .values()
        .all(|entity| *entity != background_entity));
    assert!(
        world
            .get::<Transform>(background_entity)
            .unwrap()
            .translation
            .z
            < world.get::<Transform>(atome_entity).unwrap().translation.z
    );
}

#[test]
fn surface_background_cover_size_tracks_surface_resize() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let background_entity = background::apply_surface_background(
        &mut world,
        AtomeSurfaceBackgroundPatch {
            signature: "wide".to_string(),
            color: [0.0, 0.0, 0.0, 1.0],
            texture: Some(AtomeTexture {
                width: 200,
                height: 100,
                rgba: vec![255; 200 * 100 * 4],
            }),
        },
    )
    .unwrap();

    assert_vec2_near(
        world.get::<Sprite>(background_entity).unwrap().custom_size,
        Vec2::new(960.0, 480.0),
    );
    apply_surface(
        &mut world,
        AtomeSurfacePatch {
            width: 300.0,
            height: 300.0,
        },
    )
    .unwrap();
    assert_vec2_near(
        world.get::<Sprite>(background_entity).unwrap().custom_size,
        Vec2::new(600.0, 300.0),
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
    assert!(shadow_depth < depth_for_layer(4));

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "selected_shape".to_string(),
            color: None,
            selected: Some(false),
            opacity: None,
            playback_progress: None,
            filters: None,
            transition: None,
        },
    )
    .unwrap();

    assert!(world.get::<AtomeSelectionOverlay>(entity).is_none());
    assert_eq!(world.resource::<Assets<Image>>().len(), 0);
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
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 2,
            opacity: 1.0,
            corner_radius: 0.0,
            color: Some([0.2, 0.4, 0.6, 1.0]),
            text: None,
            source: None,
            texture_size: None,
            uv_rect: None,
            texture: None,
            peaks: Some(vec![0.1, 0.5, -0.2]),
            playback_progress: Some(0.25),
            selected: None,
            filters: None,
            transition: None,
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
        Vec3::new(-250.0, 180.0, depth_for_layer(2) + 0.7)
    );

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "waveform_progress".to_string(),
            color: None,
            selected: None,
            opacity: None,
            playback_progress: Some(Some(0.75)),
            filters: None,
            transition: None,
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
        Vec3::new(-150.0, 180.0, depth_for_layer(2) + 0.7)
    );

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "waveform_progress".to_string(),
            color: None,
            selected: None,
            opacity: None,
            playback_progress: Some(None),
            filters: None,
            transition: None,
        },
    )
    .unwrap();

    assert!(world.get::<AtomeWaveformPlaybackOverlay>(entity).is_none());
}
