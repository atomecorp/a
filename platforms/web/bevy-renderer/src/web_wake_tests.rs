use super::*;
use atome_bevy_renderer_core::{
    AtomeRenderNode, AtomeRenderOp, AtomeRenderScene, AtomeRendererDiagnostics, AtomeTransformPatch,
};
use bevy::window::RequestRedraw;

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
        shadow: None,
        text: None,
        source: None,
        texture_size: None,
        uv_rect: None,
        texture: None,
        peaks: None,
        playback_progress: None,
        filters: None,
        transition: None,
        selected: None,
    }
}

fn render_scene() -> AtomeRenderScene {
    AtomeRenderScene {
        nodes: vec![shape_node("shape_1")],
        effects: Vec::new(),
        selection_style: None,
    }
}

fn transform_op(id: &str) -> AtomeRenderOp {
    AtomeRenderOp::Transform(AtomeTransformPatch {
        id: id.to_string(),
        logical_position: [64.0, 72.0],
        logical_size: [140.0, 90.0],
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
    })
}

#[test]
fn web_update_systems_do_not_emit_recursive_wakes_after_export_wake() {
    let _ = drain_web_ops();
    let _ = reset_web_renderer_diagnostics();
    let mut app = App::new();
    app.add_plugins(WebBevyRendererPlugin {
        config: WebBevyRendererConfig::new("#atome-bevy".to_string(), 640.0, 480.0, render_scene()),
    });
    let _ = reset_web_renderer_diagnostics();

    queue_web_ops(vec![transform_op("shape_1"), transform_op("shape_1")]);
    assert_eq!(read_web_renderer_diagnostics().wake_calls, 1);

    app.update();

    let diagnostics = read_web_renderer_diagnostics();
    assert_eq!(diagnostics.wake_calls, 1);
    assert_eq!(diagnostics.queued_ops, 2);
    assert_eq!(diagnostics.drained_ops, 2);
    assert_eq!(
        app.world()
            .resource::<Messages<RequestRedraw>>()
            .iter_current_update_messages()
            .count(),
        1
    );
}

#[test]
fn explicit_redraw_drain_does_not_emit_recursive_wake() {
    let _ = reset_web_renderer_diagnostics();
    let mut app = App::new();
    app.add_message::<RequestRedraw>();
    app.insert_resource(AtomeRendererDiagnostics::default());

    request_web_redraw();
    assert_eq!(read_web_renderer_diagnostics().wake_calls, 1);

    apply_pending_web_redraw(app.world_mut());

    let diagnostics = read_web_renderer_diagnostics();
    assert_eq!(diagnostics.wake_calls, 1);
    assert_eq!(diagnostics.redraw_requests, 1);
    assert_eq!(diagnostics.redraw_applied, 1);
    assert_eq!(
        app.world()
            .resource::<Messages<RequestRedraw>>()
            .iter_current_update_messages()
            .count(),
        1
    );
}

#[test]
fn startup_redraw_request_does_not_emit_export_wake() {
    let _ = reset_web_renderer_diagnostics();
    let mut app = App::new();
    app.add_message::<RequestRedraw>();

    request_initial_web_redraw(app.world_mut());

    assert_eq!(read_web_renderer_diagnostics().wake_calls, 0);
    assert_eq!(
        app.world()
            .resource::<Messages<RequestRedraw>>()
            .iter_current_update_messages()
            .count(),
        1
    );
}
