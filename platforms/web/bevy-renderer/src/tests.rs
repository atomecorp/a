use atome_bevy_renderer_core::{
    AtomeEntityTable, AtomeRenderNode, AtomeRenderOp, AtomeRenderScene, AtomeTransformPatch,
};
use bevy::prelude::*;

use super::*;

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
fn web_window_targets_canvas_and_transparent_surface() {
    let config = WebBevyRendererConfig::new(
        "#atome-bevy".to_string(),
        640.0,
        480.0,
        AtomeRenderScene {
            nodes: vec![shape_node("shape_1")],
            selection_style: None,
        },
    );
    let window = web_window_for_config(&config);

    assert_eq!(window.canvas, Some("#atome-bevy".to_string()));
    assert!(window.transparent);
    assert!(!window.fit_canvas_to_parent);
}

#[test]
fn queued_exports_apply_through_shared_core() {
    let _ = drain_web_ops();
    let config = WebBevyRendererConfig::new(
        "#atome-bevy".to_string(),
        640.0,
        480.0,
        AtomeRenderScene {
            nodes: vec![shape_node("shape_1")],
            selection_style: None,
        },
    );
    let mut app = App::new();
    app.add_plugins(WebBevyRendererPlugin { config });
    app.update();

    queue_web_op(AtomeRenderOp::Transform(AtomeTransformPatch {
        id: "shape_1".to_string(),
        logical_position: [64.0, 72.0],
        logical_size: [140.0, 90.0],
    }));
    app.update();

    assert_eq!(app.world().resource::<AtomeEntityTable>().by_id.len(), 1);
}
