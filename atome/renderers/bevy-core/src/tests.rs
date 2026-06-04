use bevy::prelude::*;

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
        texture: None,
        peaks: None,
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
        },
    )
    .unwrap();

    assert!(world.get::<AtomeSelectionOverlay>(entity).is_none());
    assert_eq!(world.resource::<Assets<Image>>().len(), 0);
}
