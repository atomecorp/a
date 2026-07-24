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
        clip_rect: None,
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

fn text_node_with_texture(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        id: id.to_string(),
        kind: "text".to_string(),
        parent_id: None,
        logical_position: [18.0, 26.0],
        logical_size: [80.0, 30.0],
        clip_rect: None,
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
        layer: 5,
        opacity: 1.0,
        corner_radius: 0.0,
        shadow: None,
        backdrop: None,
        presentation: false,
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
        procedural: None,
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

fn assert_alpha_near(color: Color, expected: f32) {
    assert!(
        (color.alpha() - expected).abs() < 0.001,
        "alpha: {} != {expected}",
        color.alpha()
    );
}

#[test]
fn plugin_spawns_projected_nodes_and_camera() {
    let scene = AtomeRenderScene {
        nodes: vec![AtomeRenderNode {
            shadow: Some(AtomeShadowStyle {
                color: [0.0, 0.0, 0.0, 0.3],
                blur: 10.0,
                offset_x: -4.0,
                offset_y: 0.0,
                spread: 0.0,
            }),
            ..shape_node("shape_1")
        }],
        effects: Vec::new(),
        selection_style: None,
    };
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::new(
        640.0, 480.0, scene,
    )));
    app.update();

    let mut camera_query = app.world_mut().query::<&Camera2d>();
    assert_eq!(camera_query.iter(app.world()).count(), 4);
    let mut projection_query = app.world_mut().query::<&Projection>();
    for projection in projection_query.iter(app.world()) {
        assert_fixed_projection_size(projection, 640.0, 480.0);
    }
    assert_eq!(app.world().resource::<AtomeEntityTable>().by_id.len(), 1);
    let entity = app.world().resource::<AtomeEntityTable>().by_id["shape_1"];
    assert!(
        app.world().get::<AtomeShapeShadowOverlay>(entity).is_some(),
        "initial scene shape shadow should be spawned by the Bevy plugin"
    );
}

#[test]
fn backdrop_fixture_keeps_text_and_image_in_capture_and_large_glass_circle_in_presentation() {
    let image = AtomeRenderNode {
        id: "backdrop_fixture_image".to_string(),
        kind: "image".to_string(),
        parent_id: None,
        logical_position: [70.0, 90.0],
        logical_size: [360.0, 240.0],
        clip_rect: None,
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
        layer: 2,
        opacity: 1.0,
        corner_radius: 0.0,
        shadow: None,
        backdrop: None,
        presentation: false,
        color: Some([1.0, 1.0, 1.0, 1.0]),
        text: None,
        source: Some("fixture://image".to_string()),
        texture_size: None,
        uv_rect: None,
        texture: Some(AtomeTexture {
            width: 4,
            height: 4,
            rgba: vec![255; 4 * 4 * 4],
        }),
        peaks: None,
        playback_progress: None,
        selected: None,
        filters: None,
        transition: None,
        procedural: None,
    };
    let text = AtomeRenderNode {
        logical_position: [130.0, 160.0],
        logical_size: [220.0, 60.0],
        clip_rect: None,
        layer: 3,
        text: Some("Backdrop fixture text".to_string()),
        texture: Some(AtomeTexture {
            width: 220,
            height: 60,
            rgba: vec![255; 220 * 60 * 4],
        }),
        ..text_node_with_texture("backdrop_fixture_text")
    };
    let circle = AtomeRenderNode {
        logical_position: [150.0, 120.0],
        logical_size: [340.0, 340.0],
        clip_rect: None,
        corner_radius: 170.0,
        backdrop: Some(AtomeBackdropStyle {
            blur_px: 12.0,
            tint: [0.36, 0.4, 0.47, 0.58],
        }),
        presentation: true,
        ..shape_node("backdrop_fixture_circle")
    };
    let scene = AtomeRenderScene {
        nodes: vec![image, text, circle],
        effects: Vec::new(),
        selection_style: None,
    };
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::new(
        640.0, 480.0, scene,
    )));
    app.update();

    let table = app.world().resource::<AtomeEntityTable>();
    let circle_entity = table.by_id["backdrop_fixture_circle"];
    let material_handle = app
        .world()
        .get::<bevy::sprite_render::MeshMaterial2d<crate::backdrop_surface::BackdropSurfaceMaterial>>(circle_entity)
        .unwrap()
        .0
        .clone();
    let material = app
        .world()
        .resource::<Assets<crate::backdrop_surface::BackdropSurfaceMaterial>>()
        .get(&material_handle)
        .unwrap();
    assert_eq!(
        material.uniform.workspace_size.xy(),
        Vec2::new(640.0, 480.0)
    );
    assert_eq!(material.uniform.size_radius.z, 170.0);
    assert_eq!(material.uniform.size_radius.w, 12.0);
    let circle_layers = app
        .world()
        .get::<bevy::camera::visibility::RenderLayers>(circle_entity)
        .unwrap();
    assert!(
        circle_layers.intersects(&bevy::camera::visibility::RenderLayers::layer(
            crate::workspace_backdrop::FLOWER_PRESENTATION_LAYER,
        ))
    );
    for id in ["backdrop_fixture_image", "backdrop_fixture_text"] {
        let entity = table.by_id[id];
        assert!(app
            .world()
            .get::<bevy::camera::visibility::RenderLayers>(entity)
            .is_none());
    }
}

#[test]
fn backdrop_style_patch_updates_the_resident_material_without_reallocation() {
    let glass = AtomeRenderNode {
        backdrop: Some(AtomeBackdropStyle {
            blur_px: 9.0,
            tint: [0.03, 0.06, 0.09, 0.52],
        }),
        presentation: true,
        ..shape_node("backdrop_patch_fixture")
    };
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::new(
        640.0,
        480.0,
        AtomeRenderScene {
            nodes: vec![glass],
            effects: Vec::new(),
            selection_style: None,
        },
    )));
    app.update();

    let entity = app.world().resource::<AtomeEntityTable>().by_id["backdrop_patch_fixture"];
    let material_handle = app
        .world()
        .get::<MeshMaterial2d<crate::backdrop_surface::BackdropSurfaceMaterial>>(entity)
        .unwrap()
        .0
        .clone();
    let mesh_handle = app.world().get::<Mesh2d>(entity).unwrap().0.clone();
    let material_count = app
        .world()
        .resource::<Assets<crate::backdrop_surface::BackdropSurfaceMaterial>>()
        .len();
    let mesh_count = app.world().resource::<Assets<Mesh>>().len();
    let image_count = app.world().resource::<Assets<Image>>().len();

    apply_style(
        app.world_mut(),
        AtomeStylePatch {
            id: "backdrop_patch_fixture".to_string(),
            color: None,
            shadow: None,
            backdrop: Some(Some(AtomeBackdropStyle {
                blur_px: 18.0,
                tint: [0.24, 0.29, 0.37, 1.0],
            })),
            selected: None,
            opacity: None,
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: None,
        },
    )
    .unwrap();

    let resident_handle = app
        .world()
        .get::<MeshMaterial2d<crate::backdrop_surface::BackdropSurfaceMaterial>>(entity)
        .unwrap()
        .0
        .clone();
    let material = app
        .world()
        .resource::<Assets<crate::backdrop_surface::BackdropSurfaceMaterial>>()
        .get(&resident_handle)
        .unwrap();
    assert_eq!(resident_handle, material_handle);
    assert_eq!(app.world().get::<Mesh2d>(entity).unwrap().0, mesh_handle);
    assert_eq!(material.uniform.size_radius.w, 18.0);
    assert_eq!(material.uniform.tint, Vec4::new(0.24, 0.29, 0.37, 1.0));
    assert_eq!(
        app.world()
            .resource::<Assets<crate::backdrop_surface::BackdropSurfaceMaterial>>()
            .len(),
        material_count
    );
    assert_eq!(app.world().resource::<Assets<Mesh>>().len(), mesh_count);
    assert_eq!(app.world().resource::<Assets<Image>>().len(), image_count);
}

#[test]
fn workspace_backdrop_reuses_its_image_handle_across_surface_resize() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(
        AtomeBevyRendererConfig::empty(640.0, 480.0),
    ));
    app.update();
    let original = app
        .world()
        .resource::<workspace_backdrop::AtomeWorkspaceBackdrop>()
        .clone();
    apply_surface(
        app.world_mut(),
        AtomeSurfacePatch {
            width: 320.0,
            height: 240.0,
            pixel_width: Some(800.0),
            pixel_height: Some(600.0),
            device_pixel_ratio: Some(2.0),
        },
    )
    .unwrap();
    let resized = app
        .world()
        .resource::<workspace_backdrop::AtomeWorkspaceBackdrop>();
    assert_eq!(resized.image, original.image);
    assert_eq!(
        resized.blur.horizontal_image,
        original.blur.horizontal_image
    );
    assert_eq!(resized.blur.vertical_image, original.blur.vertical_image);
    assert_eq!(resized.pixel_size, UVec2::new(800, 600));
    assert_eq!(
        app.world()
            .get::<Sprite>(resized.visual)
            .unwrap()
            .custom_size,
        Some(Vec2::new(320.0, 240.0))
    );
}

#[test]
fn shape_spawn_applies_initial_opacity_to_sprite() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            opacity: 0.25,
            ..shape_node("transparent_shape")
        },
    )
    .unwrap();

    assert_alpha_near(world.get::<Sprite>(entity).unwrap().color, 0.25);
    assert_eq!(world.get::<AtomeVisualOpacity>(entity).unwrap().0, 0.25);
}

#[test]
fn shape_clip_crops_on_spawn_and_restores_on_transform_update() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            clip_rect: Some([42.0, 34.0, 50.0, 30.0]),
            ..shape_node("clipped_shape")
        },
    )
    .unwrap();
    assert_vec2_near(
        world.get::<Sprite>(entity).unwrap().custom_size,
        Vec2::new(50.0, 30.0),
    );

    apply_transform(
        &mut world,
        AtomeTransformPatch {
            id: "clipped_shape".to_string(),
            logical_position: [12.0, 24.0],
            logical_size: [120.0, 50.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            clip_rect: None,
        },
    )
    .unwrap();
    assert_vec2_near(
        world.get::<Sprite>(entity).unwrap().custom_size,
        Vec2::new(120.0, 50.0),
    );
}

#[test]
fn style_opacity_patch_updates_shape_sprite_without_cumulative_alpha() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(&mut world, shape_node("fading_shape")).unwrap();
    for opacity in [0.38, 0.7] {
        apply_style(
            &mut world,
            AtomeStylePatch {
                id: "fading_shape".to_string(),
                color: None,
                shadow: None,
                backdrop: None,
                selected: None,
                opacity: Some(opacity),
                playback_progress: None,
                filters: None,
                transition: None,
                procedural: None,
            },
        )
        .unwrap();
        assert_alpha_near(world.get::<Sprite>(entity).unwrap().color, opacity);
        assert_eq!(world.get::<AtomeVisualOpacity>(entity).unwrap().0, opacity);
    }
}

#[test]
fn text_texture_spawn_and_opacity_patch_update_sprite_alpha() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            opacity: 0.4,
            ..text_node_with_texture("fading_text_texture")
        },
    )
    .unwrap();
    assert_alpha_near(world.get::<Sprite>(entity).unwrap().color, 0.4);

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "fading_text_texture".to_string(),
            color: None,
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: Some(0.65),
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: None,
        },
    )
    .unwrap();
    assert_alpha_near(world.get::<Sprite>(entity).unwrap().color, 0.65);
}

#[test]
fn text_color_spawn_and_opacity_patch_update_text_alpha() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            kind: "text".to_string(),
            texture: None,
            opacity: 0.3,
            ..text_node_with_texture("fading_text_color")
        },
    )
    .unwrap();
    assert_alpha_near(world.get::<TextColor>(entity).unwrap().0, 0.3);

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "fading_text_color".to_string(),
            color: None,
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: Some(0.8),
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: None,
        },
    )
    .unwrap();
    assert_alpha_near(world.get::<TextColor>(entity).unwrap().0, 0.8);
}

#[test]
fn shape_shadow_overlay_follows_owner_opacity() {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());

    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            shadow: Some(AtomeShadowStyle {
                color: [0.0, 0.0, 0.0, 0.3],
                blur: 10.0,
                offset_x: 0.0,
                offset_y: 0.0,
                spread: 0.0,
            }),
            opacity: 0.25,
            ..shape_node("shadow_fade_shape")
        },
    )
    .unwrap();

    let overlay_entity = world
        .get::<AtomeShapeShadowOverlay>(entity)
        .unwrap()
        .entities[0];
    assert_alpha_near(world.get::<Sprite>(overlay_entity).unwrap().color, 0.25);

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "shadow_fade_shape".to_string(),
            color: None,
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: Some(0.6),
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: None,
        },
    )
    .unwrap();

    let updated_overlay_entity = world
        .get::<AtomeShapeShadowOverlay>(entity)
        .unwrap()
        .entities[0];
    assert_alpha_near(
        world.get::<Sprite>(updated_overlay_entity).unwrap().color,
        0.6,
    );
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
            pixel_width: None,
            pixel_height: None,
            device_pixel_ratio: None,
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
    let data = image
        .data
        .as_ref()
        .expect("rounded mask should keep rgba data");
    let alpha_at = |x: usize, y: usize| -> u8 { data[(y * 120 + x) * 4 + 3] };
    assert_eq!(alpha_at(0, 0), 0);
    assert_eq!(alpha_at(60, 25), 255);
}

#[test]
fn workspace_dashboard_layers_keep_text_above_cards() {
    let dashboard_card_layer = 600 + 804;
    let dashboard_text_layer = 600 + 807;

    assert_eq!(
        depth_for_layer(dashboard_card_layer),
        dashboard_card_layer as f32
    );
    assert_eq!(
        depth_for_layer(dashboard_text_layer),
        dashboard_text_layer as f32
    );
    assert!(depth_for_layer(dashboard_text_layer) > depth_for_layer(dashboard_card_layer));
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
            pixel_width: None,
            pixel_height: None,
            device_pixel_ratio: None,
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
        effects: Vec::new(),
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
    assert!(alpha_at(12, 12) > alpha_at(8, 12));
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
            shadow: None,
            backdrop: None,
            selected: Some(false),
            opacity: None,
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: None,
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
            clip_rect: None,
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 2,
            opacity: 1.0,
            corner_radius: 0.0,
            shadow: None,
            backdrop: None,
            presentation: false,
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
            procedural: None,
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
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: None,
            playback_progress: Some(Some(0.75)),
            filters: None,
            transition: None,
            procedural: None,
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
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: None,
            playback_progress: Some(None),
            filters: None,
            transition: None,
            procedural: None,
        },
    )
    .unwrap();

    assert!(world.get::<AtomeWaveformPlaybackOverlay>(entity).is_none());
}

#[test]
fn rounded_rect_mask_handles_are_cached_per_dimensions() {
    let mut world = World::new();
    world.insert_resource(Assets::<Image>::default());

    let first = crate::texture::cached_image_handle_from_rounded_rect_mask(
        &mut world, 1440.0, 920.0, 12.0, "bg_1",
    )
    .unwrap();
    let second = crate::texture::cached_image_handle_from_rounded_rect_mask(
        &mut world, 1440.0, 920.0, 12.0, "bg_2",
    )
    .unwrap();
    let different = crate::texture::cached_image_handle_from_rounded_rect_mask(
        &mut world, 1440.0, 920.0, 8.0, "bg_3",
    )
    .unwrap();

    assert_eq!(first, second);
    assert_ne!(first, different);
    assert_eq!(world.resource::<Assets<Image>>().iter().count(), 2);
    let cache = world.resource::<crate::components::AtomeRoundedRectMaskCache>();
    assert!(cache.total_bytes <= cache.max_bytes);
    assert_eq!(cache.max_bytes, 8 * 1024 * 1024);
}
