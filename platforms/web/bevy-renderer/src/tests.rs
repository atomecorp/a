use super::*;
use bevy::app::{App, Startup};

fn shape_node(id: &str) -> WebAtomeRenderNode {
    WebAtomeRenderNode {
        id: id.to_string(),
        kind: "shape".to_string(),
        parent_id: None,
        logical_position: [12.0, 24.0],
        logical_size: [80.0, 40.0],
        layer: 3,
        color: Some([1.0, 0.0, 0.0, 1.0]),
        text: None,
        source: None,
        texture: None,
        peaks: None,
    }
}

fn one_pixel_texture() -> WebAtomeTexture {
    WebAtomeTexture {
        width: 1,
        height: 1,
        rgba: vec![255, 255, 255, 255],
    }
}

#[test]
fn plugin_projects_nodes_without_dom_state() {
    let config = WebBevyRendererConfig::new(
        "#atome-bevy".to_string(),
        640.0,
        480.0,
        vec![shape_node("shape_1")],
    );
    let mut app = App::new();
    app.add_plugins(WebBevyRendererPlugin { config });
    app.world_mut().run_schedule(Startup);

    let mut query = app.world_mut().query::<(
        &AtomeEntityId,
        &AtomeParentEntityId,
        &AtomeLogicalSize,
        &AtomeLayer,
        &Transform,
    )>();
    let nodes: Vec<_> = query.iter(app.world()).collect();
    assert_eq!(nodes.len(), 1);
    let (id, parent_id, size, layer, transform) = nodes[0];
    assert_eq!(id.0, "shape_1");
    assert_eq!(parent_id.0, None);
    assert_eq!(size.width, 80.0);
    assert_eq!(size.height, 40.0);
    assert_eq!(layer.0, 3);
    assert_eq!(transform.translation, Vec3::new(-268.0, 196.0, -3.0));
    assert_eq!(
        app.world()
            .resource::<WebAtomeEntityTable>()
            .by_id
            .contains_key("shape_1"),
        true
    );
}

#[test]
fn diffs_apply_to_internal_ecs_projection_table() {
    let mut world = World::new();
    world.insert_resource(WebAtomeEntityTable::default());
    world.insert_resource(WebBevyRendererConfig::new("#test".to_string(), 640.0, 480.0, Vec::new()));
    world.insert_resource(Assets::<Image>::default());
    apply_spawn(&mut world, shape_node("shape_1")).unwrap();
    apply_transform(&mut world, WebAtomeTransformPatch {
        id: "shape_1".to_string(),
        logical_position: [30.0, 44.0],
        logical_size: [120.0, 50.0],
    }).unwrap();
    apply_style(&mut world, WebAtomeStylePatch {
        id: "shape_1".to_string(),
        color: Some([0.0, 1.0, 0.0, 1.0]),
    }).unwrap();
    apply_reparent(&mut world, WebAtomeParentPatch {
        id: "shape_1".to_string(),
        parent_id: Some("root".to_string()),
    }).unwrap();
    apply_layer(&mut world, WebAtomeLayerPatch {
        id: "shape_1".to_string(),
        layer: 8,
    }).unwrap();
    apply_visibility(&mut world, WebAtomeVisibilityPatch {
        id: "shape_1".to_string(),
        visible: false,
    }).unwrap();
    apply_text(&mut world, WebAtomeTextPatch {
        id: "shape_1".to_string(),
        text: Some("Hello".to_string()),
        texture: None,
    }).unwrap();

    let entity = world
        .resource::<WebAtomeEntityTable>()
        .by_id
        .get("shape_1")
        .copied()
        .unwrap();
    assert_eq!(world.get::<AtomeLogicalSize>(entity).unwrap().width, 120.0);
    assert_eq!(
        world.get::<Transform>(entity).unwrap().translation,
            Vec3::new(-230.0, 171.0, -8.0)
    );
    assert_eq!(world.get::<AtomeParentEntityId>(entity).unwrap().0, Some("root".to_string()));
    assert_eq!(world.get::<AtomeLayer>(entity).unwrap().0, 8);
    assert_eq!(*world.get::<Visibility>(entity).unwrap(), Visibility::Hidden);
    assert_eq!(world.get::<AtomeTextMetadata>(entity).unwrap().0, Some("Hello".to_string()));

    apply_despawn(&mut world, "shape_1").unwrap();
    assert_eq!(
        world.resource::<WebAtomeEntityTable>().by_id.contains_key("shape_1"),
        false
    );
}

#[test]
fn text_and_waveform_nodes_use_typed_bevy_components() {
    let mut world = World::new();
    world.insert_resource(WebAtomeEntityTable::default());
    world.insert_resource(WebBevyRendererConfig::new("#test".to_string(), 640.0, 480.0, Vec::new()));
    world.insert_resource(Assets::<Image>::default());
    let text_entity = apply_spawn(&mut world, WebAtomeRenderNode {
        id: "text_1".to_string(),
        kind: "text".to_string(),
        parent_id: None,
        logical_position: [4.0, 8.0],
        logical_size: [160.0, 48.0],
        layer: 2,
        color: Some([0.9, 0.9, 0.9, 1.0]),
        text: Some("Initial".to_string()),
        source: None,
        texture: None,
        peaks: None,
    }).unwrap();
    assert_eq!(world.get::<AtomeRenderKind>(text_entity).unwrap().0, "text");
    assert_eq!(world.get::<Text2d>(text_entity).unwrap().0, "Initial");
    apply_text(&mut world, WebAtomeTextPatch {
        id: "text_1".to_string(),
        text: Some("Updated".to_string()),
        texture: None,
    }).unwrap();
    assert_eq!(world.get::<Text2d>(text_entity).unwrap().0, "Updated");

    let waveform_entity = apply_spawn(&mut world, WebAtomeRenderNode {
        id: "waveform_1".to_string(),
        kind: "audio_waveform".to_string(),
        parent_id: None,
        logical_position: [0.0, 0.0],
        logical_size: [240.0, 70.0],
        layer: 1,
        color: Some([0.2, 0.8, 0.7, 1.0]),
        text: None,
        source: None,
        texture: Some(one_pixel_texture()),
        peaks: Some(vec![0.1, 0.8, 0.4]),
    }).unwrap();
    assert_eq!(world.get::<AtomeRenderKind>(waveform_entity).unwrap().0, "audio_waveform");
    assert_eq!(world.get::<AtomeWaveformPeaks>(waveform_entity).unwrap().0, vec![0.1, 0.8, 0.4]);
    let waveform_sprite = world.get::<Sprite>(waveform_entity).unwrap();
    assert_eq!(waveform_sprite.custom_size, Some(Vec2::new(240.0, 70.0)));
    assert_eq!(waveform_sprite.color, Color::WHITE);
}

#[test]
fn media_nodes_use_explicit_rgba_texture_assets() {
    let mut world = World::new();
    world.insert_resource(WebAtomeEntityTable::default());
    world.insert_resource(WebBevyRendererConfig::new("#test".to_string(), 640.0, 480.0, Vec::new()));
    world.insert_resource(Assets::<Image>::default());
    let entity = apply_spawn(&mut world, WebAtomeRenderNode {
        id: "image_1".to_string(),
        kind: "image".to_string(),
        parent_id: None,
        logical_position: [0.0, 0.0],
        logical_size: [80.0, 80.0],
        layer: 1,
        color: None,
        text: None,
        source: Some("images/picture.png".to_string()),
        texture: Some(one_pixel_texture()),
        peaks: None,
    }).unwrap();
    let sprite = world.get::<Sprite>(entity).unwrap();
    assert_eq!(sprite.custom_size, Some(Vec2::new(80.0, 80.0)));
    assert_eq!(sprite.color, Color::WHITE);
}

#[test]
fn queued_exports_apply_to_running_bevy_world() {
    let _ = drain_web_ops();
    let config = WebBevyRendererConfig::new(
        "#atome-bevy".to_string(),
        640.0,
        480.0,
        vec![shape_node("shape_1")],
    );
    let mut app = App::new();
    app.add_plugins(WebBevyRendererPlugin { config });
    app.update();

    queue_web_op(WebAtomeRenderOp::Transform(WebAtomeTransformPatch {
        id: "shape_1".to_string(),
        logical_position: [64.0, 72.0],
        logical_size: [140.0, 90.0],
    }));
    queue_web_op(WebAtomeRenderOp::Layer(WebAtomeLayerPatch {
        id: "shape_1".to_string(),
        layer: 9,
    }));
    let mut child = shape_node("shape_2");
    child.parent_id = Some("shape_1".to_string());
    child.logical_position = [10.0, 11.0];
    child.logical_size = [20.0, 21.0];
    child.layer = 4;
    child.color = None;
    queue_web_op(WebAtomeRenderOp::Spawn(child));
    app.update();

    let table = app.world().resource::<WebAtomeEntityTable>();
    let shape_1 = table.by_id.get("shape_1").copied().unwrap();
    let shape_2 = table.by_id.get("shape_2").copied().unwrap();
    assert_eq!(
        app.world().get::<Transform>(shape_1).unwrap().translation,
        Vec3::new(-186.0, 123.0, -9.0)
    );
    assert_eq!(app.world().get::<AtomeLogicalSize>(shape_1).unwrap().width, 140.0);
    assert_eq!(app.world().get::<AtomeParentEntityId>(shape_2).unwrap().0, Some("shape_1".to_string()));
    assert_eq!(app.world().resource::<WebBevyRendererDiagnostics>().applied_ops, 3);
    assert_eq!(app.world().resource::<WebBevyRendererDiagnostics>().last_error, None);
}
