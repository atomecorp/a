use bevy::{image::Image, prelude::*};

use crate::shape_shadow_overlay::build_shape_shadow_texture_rgba;
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

fn test_world() -> World {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    world
}

fn shadow_style() -> SelectionVisualStyle {
    SelectionVisualStyle {
        shadow_size: 8.0,
        border_thickness: 0.0,
        dash_length: 0.0,
        dash_gap: 0.0,
        border_color: [0.0, 0.0, 0.0, 0.0],
        shadow_color: [0.0, 0.0, 0.0, 0.42],
    }
}

fn alpha_at(data: &[u8], width: u32, x: u32, y: u32) -> u8 {
    data[(y as usize * width as usize + x as usize) * 4 + 3]
}

fn assert_vec2_near(actual: Option<Vec2>, expected: Vec2) {
    let actual = actual.expect("sprite custom size should be set");
    assert!((actual.x - expected.x).abs() < 0.01);
    assert!((actual.y - expected.y).abs() < 0.01);
}

#[test]
fn shape_shadow_uses_bevy_overlay_without_changing_logical_size() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            shadow: Some(AtomeShadowStyle {
                color: [0.0, 0.0, 0.0, 0.42],
                blur: 8.0,
                offset_x: 3.0,
                offset_y: 4.0,
                spread: 2.0,
            }),
            ..shape_node("shadowed_shape")
        },
    )
    .unwrap();

    let sprite = world.get::<Sprite>(entity).unwrap();
    assert_vec2_near(sprite.custom_size, Vec2::new(120.0, 50.0));
    let overlay = world
        .get::<AtomeShapeShadowOverlay>(entity)
        .expect("shape shadow should create a Bevy overlay");
    assert_eq!(overlay.entities.len(), 1);
    assert_eq!(overlay.image_handles.len(), 1);
    assert_eq!(world.resource::<Assets<Image>>().len(), 1);
    let shadow_entity = overlay.entities[0];
    let shadow_sprite = world.get::<Sprite>(shadow_entity).unwrap();
    let shadow_size = shadow_sprite.custom_size.expect("shadow sprite size");
    assert!(shadow_size.x > 120.0);
    assert!(shadow_size.y > 50.0);
    assert!(world
        .get::<bevy::render::batching::NoAutomaticBatching>(shadow_entity)
        .is_some());
    let shape_z = world.get::<Transform>(entity).unwrap().translation.z;
    let shadow_z = world.get::<Transform>(shadow_entity).unwrap().translation.z;
    assert_eq!(shadow_z, depth_for_layer(3) - 0.25);
    assert!(shadow_z < shape_z);

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "shadowed_shape".to_string(),
            color: None,
            shadow: Some(None),
            selected: None,
            opacity: None,
            playback_progress: None,
            filters: None,
            transition: None,
        },
    )
    .unwrap();

    assert!(world.get::<AtomeShapeShadowOverlay>(entity).is_none());
    assert_eq!(world.resource::<Assets<Image>>().len(), 1);
    assert_eq!(world.resource::<AtomeShapeShadowTextureCache>().handles.len(), 1);
}

#[test]
fn shape_shadow_translation_reuses_existing_texture() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            shadow: Some(AtomeShadowStyle {
                color: [0.0, 0.0, 0.0, 0.42],
                blur: 8.0,
                offset_x: 3.0,
                offset_y: 4.0,
                spread: 2.0,
            }),
            ..shape_node("translated_shadow")
        },
    )
    .unwrap();
    let first_overlay = world.get::<AtomeShapeShadowOverlay>(entity).unwrap().clone();
    let first_shadow_entity = first_overlay.entities[0];
    let first_handle = first_overlay.image_handles[0].clone();
    let first_assets_len = world.resource::<Assets<Image>>().len();

    apply_transform(
        &mut world,
        AtomeTransformPatch {
            id: "translated_shadow".to_string(),
            logical_position: [72.0, 84.0],
            logical_size: [120.0, 50.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
        },
    )
    .unwrap();

    let overlay = world.get::<AtomeShapeShadowOverlay>(entity).unwrap();
    assert_eq!(overlay.entities[0], first_shadow_entity);
    assert_eq!(overlay.image_handles[0], first_handle);
    assert_eq!(world.resource::<Assets<Image>>().len(), first_assets_len);
    assert_eq!(world.resource::<AtomeShapeShadowTextureCache>().handles.len(), 1);
    assert_ne!(
        world.get::<Transform>(first_shadow_entity).unwrap().translation,
        Vec3::ZERO
    );
}

#[test]
fn equivalent_shape_shadows_share_one_texture_asset() {
    let mut world = test_world();
    let shadow = Some(AtomeShadowStyle {
        color: [0.0, 0.0, 0.0, 0.42],
        blur: 8.0,
        offset_x: 0.0,
        offset_y: 0.0,
        spread: 0.0,
    });

    let first = apply_spawn(
        &mut world,
        AtomeRenderNode {
            shadow,
            ..shape_node("shared_shadow_a")
        },
    )
    .unwrap();
    let second = apply_spawn(
        &mut world,
        AtomeRenderNode {
            id: "shared_shadow_b".to_string(),
            logical_position: [220.0, 24.0],
            shadow,
            ..shape_node("shared_shadow_b")
        },
    )
    .unwrap();

    assert_eq!(world.resource::<Assets<Image>>().len(), 1);
    assert_eq!(world.resource::<AtomeShapeShadowTextureCache>().handles.len(), 1);
    assert_eq!(
        world.get::<AtomeShapeShadowOverlay>(first).unwrap().image_handles[0],
        world.get::<AtomeShapeShadowOverlay>(second).unwrap().image_handles[0]
    );
}

#[test]
fn rounded_shape_shadow_fills_mask_under_shape_edge() {
    let (width, height, rgba) =
        build_shape_shadow_texture_rgba(shadow_style(), 120.0, 50.0, 10.0).unwrap();

    assert_eq!(width, 136);
    assert_eq!(height, 66);
    assert_eq!(alpha_at(&rgba, width, 68, 33), 107);
    assert_eq!(alpha_at(&rgba, width, 120, 55), 107);
    assert!(alpha_at(&rgba, width, 126, 55) > 0);
    assert_eq!(alpha_at(&rgba, width, 135, 65), 0);
    assert_eq!(alpha_at(&rgba, width, 1, 10), 0);
}

#[test]
fn rounded_shape_shadow_overlay_uses_card_radius() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            corner_radius: 10.0,
            shadow: Some(AtomeShadowStyle {
                color: [0.0, 0.0, 0.0, 0.42],
                blur: 8.0,
                offset_x: 0.0,
                offset_y: 0.0,
                spread: 0.0,
            }),
            ..shape_node("rounded_shadowed_shape")
        },
    )
    .unwrap();

    assert_eq!(world.get::<AtomeCornerRadius>(entity).unwrap().0, 10.0);
    let sprite = world.get::<Sprite>(entity).unwrap();
    assert_vec2_near(sprite.custom_size, Vec2::new(120.0, 50.0));
    let overlay = world
        .get::<AtomeShapeShadowOverlay>(entity)
        .expect("rounded shape shadow should create a Bevy overlay");
    let shadow_image = world
        .resource::<Assets<Image>>()
        .get(&overlay.image_handles[0])
        .expect("rounded shadow overlay should keep rgba data");
    let width = shadow_image.texture_descriptor.size.width;
    let data = shadow_image
        .data
        .as_ref()
        .expect("rounded shadow should keep rgba data");
    assert_eq!(alpha_at(data, width, 1, 10), 0);
    assert_eq!(alpha_at(data, width, 120, 55), 107);
}

#[test]
fn initial_scene_rounded_shape_uses_mask_before_shadow_overlay() {
    let scene = AtomeRenderScene {
        nodes: vec![AtomeRenderNode {
            corner_radius: 10.0,
            shadow: Some(AtomeShadowStyle {
                color: [0.0, 0.0, 0.0, 0.42],
                blur: 8.0,
                offset_x: 0.0,
                offset_y: 0.0,
                spread: 0.0,
            }),
            ..shape_node("initial_rounded_shadowed_shape")
        }],
        effects: Vec::new(),
        selection_style: None,
    };
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::new(
        640.0, 480.0, scene,
    )));
    app.update();

    let entity = app.world().resource::<AtomeEntityTable>().by_id["initial_rounded_shadowed_shape"];
    let sprite = app.world().get::<Sprite>(entity).unwrap();
    let image = app
        .world()
        .resource::<Assets<Image>>()
        .get(&sprite.image)
        .expect("initial rounded shape should use the generated mask texture");
    let data = image
        .data
        .as_ref()
        .expect("initial rounded mask should keep rgba data");
    assert_eq!(image.texture_descriptor.size.width, 120);
    assert_eq!(image.texture_descriptor.size.height, 50);
    assert_eq!(alpha_at(data, 120, 119, 49), 0);
    assert_eq!(alpha_at(data, 120, 60, 25), 255);
    assert!(app.world().get::<AtomeShapeShadowOverlay>(entity).is_some());
}

#[test]
fn shape_shadow_keeps_rectangular_corners_without_radius() {
    let (rounded_width, _rounded_height, rounded_rgba) =
        build_shape_shadow_texture_rgba(shadow_style(), 120.0, 50.0, 10.0).unwrap();
    let (rect_width, _rect_height, rect_rgba) =
        build_shape_shadow_texture_rgba(shadow_style(), 120.0, 50.0, 0.0).unwrap();

    assert_eq!(alpha_at(&rounded_rgba, rounded_width, 1, 10), 0);
    assert!(alpha_at(&rect_rgba, rect_width, 1, 10) > 0);
}
