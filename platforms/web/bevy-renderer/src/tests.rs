use atome_bevy_renderer_core::{
    AtomeEntityTable, AtomeRenderNode, AtomeRenderOp, AtomeRenderScene, AtomeStylePatch,
    AtomeSurfaceBackgroundPatch, AtomeTransformPatch,
};
use bevy::prelude::*;
use bevy::window::{CompositeAlphaMode, RequestRedraw};

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
        texture_size: None,
        texture: None,
        peaks: None,
        playback_progress: None,
        selected: None,
    }
}

#[test]
fn web_window_targets_canvas_and_opaque_surface() {
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
    assert!(!window.transparent);
    assert_eq!(window.composite_alpha_mode, CompositeAlphaMode::Opaque);
    assert!(!window.fit_canvas_to_parent);
    assert_eq!(window.present_mode, PresentMode::AutoNoVsync);
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
    assert_eq!(
        app.world()
            .resource::<Messages<RequestRedraw>>()
            .iter_current_update_messages()
            .count(),
        1
    );
}

#[test]
fn queued_surface_background_export_uses_shared_core_op() {
    let _ = drain_web_ops();
    queue_web_op(AtomeRenderOp::SurfaceBackground(
        AtomeSurfaceBackgroundPatch {
            signature: "generated:surface".to_string(),
            color: [0.12, 0.12, 0.12, 1.0],
            texture: None,
        },
    ));

    let ops = drain_web_ops();
    assert_eq!(ops.len(), 1);
    let AtomeRenderOp::SurfaceBackground(patch) = &ops[0] else {
        panic!("expected surface background op");
    };
    assert_eq!(patch.signature, "generated:surface");
    assert_eq!(patch.color, [0.12, 0.12, 0.12, 1.0]);
}

#[test]
fn queued_audio_progress_styles_are_coalesced_per_atome() {
    let _ = drain_web_ops();

    queue_web_op(AtomeRenderOp::Style(AtomeStylePatch {
        id: "waveform_1".to_string(),
        color: None,
        selected: None,
        playback_progress: Some(Some(0.1)),
    }));
    queue_web_op(AtomeRenderOp::Style(AtomeStylePatch {
        id: "waveform_1".to_string(),
        color: None,
        selected: None,
        playback_progress: Some(Some(0.7)),
    }));
    queue_web_op(AtomeRenderOp::Style(AtomeStylePatch {
        id: "waveform_2".to_string(),
        color: None,
        selected: None,
        playback_progress: Some(Some(0.3)),
    }));

    let ops = drain_web_ops();
    assert_eq!(ops.len(), 2);
    let AtomeRenderOp::Style(first) = &ops[0] else {
        panic!("expected first coalesced op to be style");
    };
    let AtomeRenderOp::Style(second) = &ops[1] else {
        panic!("expected second coalesced op to be style");
    };
    assert_eq!(first.id, "waveform_1");
    assert_eq!(first.playback_progress, Some(Some(0.7)));
    assert_eq!(second.id, "waveform_2");
    assert_eq!(second.playback_progress, Some(Some(0.3)));
}

#[test]
fn initial_web_redraw_is_requested_before_user_input() {
    let mut app = App::new();
    app.add_message::<RequestRedraw>();

    request_initial_web_redraw(app.world_mut());

    assert_eq!(
        app.world()
            .resource::<Messages<RequestRedraw>>()
            .iter_current_update_messages()
            .count(),
        1
    );
}

#[test]
fn exported_web_redraw_request_is_applied_before_user_input() {
    let mut app = App::new();
    app.add_message::<RequestRedraw>();
    let _ = reset_web_renderer_diagnostics();

    request_web_redraw();
    apply_pending_web_redraw(app.world_mut());

    assert_eq!(
        app.world()
            .resource::<Messages<RequestRedraw>>()
            .iter_current_update_messages()
            .count(),
        1
    );
    let diagnostics = read_web_renderer_diagnostics();
    assert_eq!(diagnostics.redraw_requests, 1);
    assert_eq!(diagnostics.redraw_applied, 1);
}

#[test]
fn exported_video_frame_notification_requests_redraw() {
    let _ = drain_web_video_frames();
    let mut app = App::new();
    app.add_message::<RequestRedraw>();

    notify_web_video_frame("video_live".to_string(), 7);
    apply_pending_video_frame_notifications(app.world_mut());

    assert_eq!(
        app.world()
            .resource::<Messages<RequestRedraw>>()
            .iter_current_update_messages()
            .count(),
        1
    );
}

#[test]
fn web_renderer_uses_continuous_winit_updates_for_video_textures() {
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

    let settings = app.world().resource::<bevy::winit::WinitSettings>();
    assert_eq!(settings.focused_mode, bevy::winit::UpdateMode::Continuous);
    assert_eq!(settings.unfocused_mode, bevy::winit::UpdateMode::Continuous);
}
