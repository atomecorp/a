use atome_bevy_renderer_core::{
    render_math::atome_camera_projection, AtomeBevyRendererConfig, AtomeEntityTable,
    AtomeRenderNode, AtomeRenderOp, AtomeRenderScene, AtomeRendererDiagnostics, AtomeStylePatch,
    AtomeSurfaceBackgroundPatch, AtomeTransformPatch,
};
use bevy::prelude::*;
use bevy::window::{CompositeAlphaMode, RequestRedraw, WindowResized, WindowResolution};
use bevy::winit::UpdateMode;
use std::time::Duration;

use super::*;

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

#[test]
fn web_window_targets_canvas_and_opaque_surface() {
    let config = WebBevyRendererConfig::new(
        "#atome-bevy".to_string(),
        640.0,
        480.0,
        AtomeRenderScene {
            nodes: vec![shape_node("shape_1")],
            effects: Vec::new(),
            selection_style: None,
        },
    );
    let window = web_window_for_config(&config);

    assert_eq!(window.canvas, Some("#atome-bevy".to_string()));
    assert!(!window.transparent);
    assert_eq!(window.composite_alpha_mode, CompositeAlphaMode::Opaque);
    assert!(!window.fit_canvas_to_parent);
    assert_eq!(window.resolution.scale_factor_override(), Some(1.0));
    assert_eq!(window.present_mode, PresentMode::AutoNoVsync);
}

#[test]
fn web_surface_resolution_keeps_browser_scale_factor_logical_units() {
    let mut resolution = WindowResolution::new(1280, 960);
    resolution.set_scale_factor(2.0);
    resolution.set(640.0, 480.0);

    assert_eq!(resolution.scale_factor_override(), None);
    assert_eq!(resolution.physical_width(), 1280);
    assert_eq!(resolution.physical_height(), 960);
    assert_eq!(resolution.width(), 640.0);
    assert_eq!(resolution.height(), 480.0);
}

#[test]
fn web_surface_resize_observer_physical_size_stays_logical_through_scale_factor() {
    let mut window = Window {
        resolution: WindowResolution::new(1280, 960),
        ..default()
    };
    window.resolution.set_scale_factor(2.0);
    window.resolution.set_physical_resolution(640, 480);

    assert_eq!(window.resolution.scale_factor_override(), None);
    assert_eq!(window.resolution.physical_width(), 640);
    assert_eq!(window.resolution.physical_height(), 480);
    assert_eq!(window.resolution.width(), 320.0);
    assert_eq!(window.resolution.height(), 240.0);
    window.resolution.set(640.0, 480.0);
    assert_eq!(window.resolution.physical_width(), 1280);
    assert_eq!(window.resolution.physical_height(), 960);
    assert_eq!(window.resolution.width(), 640.0);
    assert_eq!(window.resolution.height(), 480.0);
}

#[test]
fn browser_window_resize_event_reprojects_shared_surface_in_logical_units() {
    let mut app = App::new();
    app.add_message::<WindowResized>();
    app.add_message::<RequestRedraw>();
    app.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    app.insert_resource(AtomeEntityTable::default());
    app.insert_resource(AtomeRendererDiagnostics::default());
    app.insert_resource(Assets::<Image>::default());
    app.world_mut()
        .spawn((Camera2d, atome_camera_projection(640.0, 480.0)));
    let window = app
        .world_mut()
        .spawn(Window {
            resolution: WindowResolution::new(1280, 960),
            ..default()
        })
        .id();
    app.world_mut()
        .entity_mut(window)
        .get_mut::<Window>()
        .unwrap()
        .resolution
        .set_scale_factor(2.0);

    app.world_mut().write_message(WindowResized {
        window,
        width: 320.0,
        height: 240.0,
    });
    apply_browser_window_resize_to_surface(app.world_mut());

    let config = app.world().resource::<AtomeBevyRendererConfig>();
    assert_eq!(config.width, 320.0);
    assert_eq!(config.height, 240.0);
    let window = app.world().get::<Window>(window).unwrap();
    assert_eq!(window.resolution.physical_width(), 640);
    assert_eq!(window.resolution.physical_height(), 480);
    assert_eq!(window.resolution.width(), 320.0);
    assert_eq!(window.resolution.height(), 240.0);
}

#[test]
fn browser_physical_window_resize_event_reprojects_shared_surface_in_logical_units() {
    let mut app = App::new();
    app.add_message::<WindowResized>();
    app.add_message::<RequestRedraw>();
    app.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    app.insert_resource(AtomeEntityTable::default());
    app.insert_resource(AtomeRendererDiagnostics::default());
    app.insert_resource(Assets::<Image>::default());
    app.world_mut()
        .spawn((Camera2d, atome_camera_projection(640.0, 480.0)));
    let window = app
        .world_mut()
        .spawn(Window {
            resolution: WindowResolution::new(1280, 960),
            ..default()
        })
        .id();
    {
        let mut entity = app.world_mut().entity_mut(window);
        let mut window_mut = entity.get_mut::<Window>().unwrap();
        window_mut.resolution.set_scale_factor(2.0);
        window_mut.resolution.set(1280.0, 960.0);
    }

    app.world_mut().write_message(WindowResized {
        window,
        width: 2560.0,
        height: 1920.0,
    });
    apply_browser_window_resize_to_surface(app.world_mut());

    let config = app.world().resource::<AtomeBevyRendererConfig>();
    assert_eq!(config.width, 1280.0);
    assert_eq!(config.height, 960.0);
}

#[test]
fn browser_backing_store_resize_event_keeps_configured_logical_surface() {
    let mut app = App::new();
    app.add_message::<WindowResized>();
    app.add_message::<RequestRedraw>();
    app.insert_resource(AtomeBevyRendererConfig::empty(1280.0, 820.0));
    app.insert_resource(AtomeEntityTable::default());
    app.insert_resource(AtomeRendererDiagnostics::default());
    app.insert_resource(Assets::<Image>::default());
    app.world_mut()
        .spawn((Camera2d, atome_camera_projection(1280.0, 820.0)));
    let window = app
        .world_mut()
        .spawn(Window {
            resolution: WindowResolution::new(2560, 1640).with_scale_factor_override(1.0),
            ..default()
        })
        .id();

    app.world_mut().write_message(WindowResized {
        window,
        width: 2560.0,
        height: 1640.0,
    });
    apply_browser_window_resize_to_surface(app.world_mut());

    let config = app.world().resource::<AtomeBevyRendererConfig>();
    assert_eq!(config.width, 1280.0);
    assert_eq!(config.height, 820.0);
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
            effects: Vec::new(),
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
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
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
        opacity: None,
        playback_progress: Some(Some(0.1)),
        filters: None,
        transition: None,
        shadow: None,
    }));
    queue_web_op(AtomeRenderOp::Style(AtomeStylePatch {
        id: "waveform_1".to_string(),
        color: None,
        selected: None,
        opacity: None,
        playback_progress: Some(Some(0.7)),
        filters: None,
        transition: None,
        shadow: None,
    }));
    queue_web_op(AtomeRenderOp::Style(AtomeStylePatch {
        id: "waveform_2".to_string(),
        color: None,
        selected: None,
        opacity: None,
        playback_progress: Some(Some(0.3)),
        filters: None,
        transition: None,
        shadow: None,
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
fn queued_opacity_styles_are_not_coalesced_as_audio_progress_only() {
    let _ = drain_web_ops();

    queue_web_op(AtomeRenderOp::Style(AtomeStylePatch {
        id: "video_1".to_string(),
        color: None,
        selected: None,
        opacity: Some(0.4),
        playback_progress: None,
        filters: None,
        transition: None,
        shadow: None,
    }));
    queue_web_op(AtomeRenderOp::Style(AtomeStylePatch {
        id: "video_1".to_string(),
        color: None,
        selected: None,
        opacity: Some(0.8),
        playback_progress: None,
        filters: None,
        transition: None,
        shadow: None,
    }));

    let ops = drain_web_ops();
    assert_eq!(ops.len(), 2);
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
    let _ = reset_web_renderer_diagnostics();
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
    let diagnostics = read_web_renderer_diagnostics();
    assert_eq!(diagnostics.video_frame_notifications, 1);
    assert_eq!(diagnostics.video_frame_redraws, 1);
    assert_eq!(diagnostics.wake_calls, 1);
}

#[test]
fn video_backend_capabilities_report_external_texture_path_without_dead_track_api() {
    let capabilities = read_web_video_backend_capabilities();

    assert_eq!(capabilities.schema, "atome.bevy.web.video_backend.v7");
    assert_eq!(
        capabilities.target_live_video_backend,
        "gpu_external_texture_texture_external"
    );
    assert_eq!(
        capabilities.live_video_backend,
        "gpu_external_texture_texture_external"
    );
    assert!(capabilities.current_backend_final);
    assert_eq!(capabilities.backend_blocker, "none");
    assert!(!capabilities.html_video_element_copy);
    assert!(capabilities.browser_gpu_device_import_external_texture_available);
    assert!(capabilities.wgpu_web_external_texture_create);
    assert!(capabilities.wgpu_external_texture_source_descriptor);
    assert!(capabilities.wgpu_external_texture_bind_group_layout);
    assert!(capabilities.wgpu_external_texture_bind_group_resource);
    assert!(capabilities.gpu_external_texture_import);
    assert!(capabilities.texture_external_sampling);
    assert!(!capabilities.rgba_live_payload);
    assert!(!capabilities.visible_dom_video_overlay);
}

#[test]
fn video_copy_diagnostics_are_shared_with_web_exports() {
    atome_bevy_renderer_core::reset_video_copy_diagnostics();
    atome_bevy_renderer_core::record_video_copy_skip(
        atome_bevy_renderer_core::AtomeVideoCopySkipReason::SourceNotReady,
        "video_waiting",
        Some(3),
    );
    atome_bevy_renderer_core::record_video_copy_success("video_ready", 4);

    let diagnostics = atome_bevy_renderer_core::read_video_copy_diagnostics();
    assert_eq!(diagnostics.copy_count, 1);
    assert_eq!(diagnostics.skip_source_not_ready, 1);
    assert_eq!(diagnostics.last_copied_id.as_deref(), Some("video_ready"));
    assert_eq!(diagnostics.last_skip_id.as_deref(), Some("video_waiting"));
    assert_eq!(
        diagnostics.last_skip_reason,
        Some(atome_bevy_renderer_core::AtomeVideoCopySkipReason::SourceNotReady.as_str())
    );

    let previous = atome_bevy_renderer_core::reset_video_copy_diagnostics();
    assert_eq!(previous.copy_count, 1);
    assert_eq!(
        atome_bevy_renderer_core::read_video_copy_diagnostics().copy_count,
        0
    );
}

fn assert_reactive_mode(mode: UpdateMode, expected_wait: Duration) {
    let UpdateMode::Reactive {
        wait,
        react_to_user_events,
        react_to_window_events,
        ..
    } = mode
    else {
        panic!("web renderer must not use continuous winit updates");
    };
    assert_eq!(wait, expected_wait);
    assert!(react_to_user_events);
    assert!(react_to_window_events);
}

#[test]
fn web_renderer_uses_reactive_winit_updates_with_explicit_redraw_wakes() {
    let config = WebBevyRendererConfig::new(
        "#atome-bevy".to_string(),
        640.0,
        480.0,
        AtomeRenderScene {
            nodes: vec![shape_node("shape_1")],
            effects: Vec::new(),
            selection_style: None,
        },
    );
    let mut app = App::new();
    app.add_plugins(WebBevyRendererPlugin { config });

    let settings = app.world().resource::<bevy::winit::WinitSettings>();
    assert_reactive_mode(settings.focused_mode, Duration::from_secs(5));
    assert_reactive_mode(settings.unfocused_mode, Duration::from_secs(60));
}
