use atome_bevy_renderer_core::{
    apply_render_ops, apply_surface, AtomeBevyRendererConfig, AtomeBevyRendererPlugin,
    AtomeRenderOp, AtomeRenderScene, AtomeRendererDiagnostics, AtomeSurfacePatch,
};
use bevy::{
    log::{Level, LogPlugin},
    prelude::*,
    window::{
        CompositeAlphaMode, PresentMode, RequestRedraw, Window, WindowPlugin, WindowResized,
        WindowResolution,
    },
    winit::{EventLoopProxy, EventLoopProxyWrapper, UpdateMode, WinitSettings, WinitUserEvent},
};
use serde::Serialize;
use std::cell::RefCell;
use std::time::Duration;

mod exports;

thread_local! {
    static WEB_PENDING_OPS: RefCell<Vec<AtomeRenderOp>> = RefCell::new(Vec::new());
    static WEB_PENDING_VIDEO_FRAMES: RefCell<u32> = const { RefCell::new(0) };
    static WEB_EVENT_LOOP_PROXY: RefCell<Option<EventLoopProxy<WinitUserEvent>>> = const { RefCell::new(None) };
    static WEB_WAKE_PENDING: RefCell<bool> = const { RefCell::new(false) };
    static WEB_REDRAW_PENDING: RefCell<bool> = const { RefCell::new(false) };
    static WEB_DIAGNOSTICS: RefCell<WebRendererDiagnostics> = RefCell::new(WebRendererDiagnostics::default());
}

#[derive(Clone, Debug, Default, Serialize)]
struct WebRendererDiagnostics {
    queued_ops: u32,
    transform_ops: u32,
    drained_ops: u32,
    drain_batches: u32,
    max_queue_depth: u32,
    redraw_requests: u32,
    redraw_applied: u32,
    wake_calls: u32,
    video_frame_notifications: u32,
    video_frame_redraws: u32,
}

#[derive(Clone, Debug, Serialize)]
struct WebVideoBackendCapabilities {
    schema: &'static str,
    target_live_video_backend: &'static str,
    live_video_backend: &'static str,
    current_backend_final: bool,
    backend_blocker: &'static str,
    html_video_element_copy: bool,
    browser_gpu_device_import_external_texture_available: bool,
    wgpu_web_external_texture_create: bool,
    wgpu_external_texture_source_descriptor: bool,
    wgpu_external_texture_bind_group_layout: bool,
    wgpu_external_texture_bind_group_resource: bool,
    gpu_external_texture_import: bool,
    texture_external_sampling: bool,
    rgba_live_payload: bool,
    visible_dom_video_overlay: bool,
}

fn read_web_video_backend_capabilities() -> WebVideoBackendCapabilities {
    WebVideoBackendCapabilities {
        schema: "atome.bevy.web.video_backend.v7",
        target_live_video_backend: "gpu_external_texture_texture_external",
        live_video_backend: "gpu_external_texture_texture_external",
        current_backend_final: true,
        backend_blocker: "none",
        html_video_element_copy: false,
        browser_gpu_device_import_external_texture_available: true,
        wgpu_web_external_texture_create: true,
        wgpu_external_texture_source_descriptor: true,
        wgpu_external_texture_bind_group_layout: true,
        wgpu_external_texture_bind_group_resource: true,
        gpu_external_texture_import: true,
        texture_external_sampling: true,
        rgba_live_payload: false,
        visible_dom_video_overlay: false,
    }
}

fn queue_web_op(op: AtomeRenderOp) {
    let is_transform = matches!(op, AtomeRenderOp::Transform(_));
    WEB_PENDING_OPS.with(|cell| {
        let mut ops = cell.borrow_mut();
        if let Some(id) = progress_only_style_id(&op) {
            ops.retain(|pending| progress_only_style_id(pending).as_deref() != Some(id.as_str()));
        }
        ops.push(op);
    });
    let queue_depth = WEB_PENDING_OPS.with(|cell| cell.borrow().len() as u32);
    WEB_DIAGNOSTICS.with(|cell| {
        let mut diagnostics = cell.borrow_mut();
        diagnostics.queued_ops += 1;
        if is_transform {
            diagnostics.transform_ops += 1;
        }
        diagnostics.max_queue_depth = diagnostics.max_queue_depth.max(queue_depth);
    });
    wake_web_renderer();
}

fn progress_only_style_id(op: &AtomeRenderOp) -> Option<String> {
    let AtomeRenderOp::Style(patch) = op else {
        return None;
    };
    if patch.color.is_some()
        || patch.selected.is_some()
        || patch.opacity.is_some()
        || patch.playback_progress.is_none()
    {
        return None;
    }
    let id = patch.id.trim();
    if id.is_empty() {
        return None;
    }
    Some(id.to_string())
}

fn drain_web_ops() -> Vec<AtomeRenderOp> {
    let ops: Vec<AtomeRenderOp> =
        WEB_PENDING_OPS.with(|cell| cell.borrow_mut().drain(..).collect());
    if !ops.is_empty() {
        WEB_DIAGNOSTICS.with(|cell| {
            let mut diagnostics = cell.borrow_mut();
            diagnostics.drained_ops += ops.len() as u32;
            diagnostics.drain_batches += 1;
        });
    }
    ops
}

fn request_web_redraw() {
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().redraw_requests += 1;
    });
    WEB_REDRAW_PENDING.with(|cell| {
        *cell.borrow_mut() = true;
    });
    wake_web_renderer();
}

fn notify_web_video_frame(id: String, frame_version: u32) {
    if id.trim().is_empty() || frame_version == 0 {
        return;
    }
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().video_frame_notifications += 1;
    });
    WEB_PENDING_VIDEO_FRAMES.with(|cell| {
        let mut pending = cell.borrow_mut();
        *pending = pending.saturating_add(1);
    });
    wake_web_renderer();
}

fn drain_web_video_frames() -> u32 {
    WEB_PENDING_VIDEO_FRAMES.with(|cell| cell.replace(0))
}

fn drain_web_redraw_request() -> bool {
    WEB_REDRAW_PENDING.with(|cell| cell.replace(false))
}

fn remember_event_loop_proxy(proxy: Option<Res<EventLoopProxyWrapper>>) {
    let Some(proxy) = proxy else {
        return;
    };
    let wrapper: &EventLoopProxyWrapper = &proxy;
    let event_loop_proxy: &EventLoopProxy<WinitUserEvent> = wrapper;
    WEB_EVENT_LOOP_PROXY.with(|cell| {
        *cell.borrow_mut() = Some(event_loop_proxy.clone());
    });
    WEB_WAKE_PENDING.with(|cell| {
        if cell.replace(false) {
            let _ = event_loop_proxy.send_event(WinitUserEvent::WakeUp);
        }
    });
}

fn wake_web_renderer() {
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().wake_calls += 1;
    });
    WEB_EVENT_LOOP_PROXY.with(|cell| {
        if let Some(proxy) = cell.borrow().as_ref() {
            let _ = proxy.send_event(WinitUserEvent::WakeUp);
        } else {
            WEB_WAKE_PENDING.with(|pending| {
                *pending.borrow_mut() = true;
            });
        }
    });
}

#[derive(Clone, Debug)]
struct WebBevyRendererConfig {
    canvas_selector: String,
    core: AtomeBevyRendererConfig,
    transparent: bool,
}

impl WebBevyRendererConfig {
    fn new(
        canvas_selector: String,
        width: f32,
        height: f32,
        initial_scene: AtomeRenderScene,
    ) -> Self {
        Self::with_transparency(canvas_selector, width, height, initial_scene, false)
    }

    fn with_transparency(
        canvas_selector: String,
        width: f32,
        height: f32,
        initial_scene: AtomeRenderScene,
        transparent: bool,
    ) -> Self {
        Self {
            canvas_selector,
            core: AtomeBevyRendererConfig::new(width, height, initial_scene),
            transparent,
        }
    }
}

struct WebBevyRendererPlugin {
    config: WebBevyRendererConfig,
}

fn web_winit_settings() -> WinitSettings {
    WinitSettings {
        focused_mode: UpdateMode::reactive(Duration::from_millis(16)),
        unfocused_mode: UpdateMode::reactive(Duration::from_millis(16)),
    }
}

impl Plugin for WebBevyRendererPlugin {
    fn build(&self, app: &mut App) {
        app.add_message::<RequestRedraw>()
            .add_message::<WindowResized>()
            .insert_resource(ClearColor(if self.config.transparent {
                Color::srgba(0.0, 0.0, 0.0, 0.0)
            } else {
                Color::BLACK
            }))
            .insert_resource(web_winit_settings())
            .add_plugins(AtomeBevyRendererPlugin::new(self.config.core.clone()))
            .add_systems(
                Startup,
                (remember_event_loop_proxy, request_initial_web_redraw).chain(),
            )
            .add_systems(
                Update,
                (
                    remember_event_loop_proxy,
                    apply_browser_window_resize_to_surface,
                    apply_pending_web_ops,
                    apply_pending_video_frame_notifications,
                    apply_pending_web_redraw,
                )
                    .chain(),
            );
    }
}

fn request_initial_web_redraw(world: &mut World) {
    world.write_message(RequestRedraw);
    wake_web_renderer();
}

fn apply_pending_web_ops(world: &mut World) {
    let ops = drain_web_ops();
    if ops.is_empty() {
        return;
    }
    apply_render_ops(world, ops);
    world.write_message(RequestRedraw);
    wake_web_renderer();
}

fn window_resize_event_logical_size(world: &World, event: &WindowResized) -> (f32, f32) {
    let Some(window) = world.get::<Window>(event.window) else {
        return (event.width, event.height);
    };
    let resolution = &window.resolution;
    let physical_width = resolution.physical_width() as f32;
    let physical_height = resolution.physical_height() as f32;
    if (event.width - physical_width).abs() <= 1.0 && (event.height - physical_height).abs() <= 1.0
    {
        let logical = (resolution.width(), resolution.height());
        if (logical.0 - event.width).abs() > 1.0 || (logical.1 - event.height).abs() > 1.0 {
            return logical;
        }
    }
    if let Some(current) = world.get_resource::<AtomeBevyRendererConfig>() {
        let width_ratio = event.width / current.width.max(1.0);
        let height_ratio = event.height / current.height.max(1.0);
        if width_ratio > 1.25 && (width_ratio - height_ratio).abs() <= 0.05 {
            return (current.width, current.height);
        }
    }
    (event.width, event.height)
}

fn apply_browser_window_resize_to_surface(world: &mut World) {
    let next_size = world
        .resource::<Messages<WindowResized>>()
        .iter_current_update_messages()
        .filter(|event| event.width.is_finite() && event.height.is_finite())
        .filter(|event| event.width > 0.0 && event.height > 0.0)
        .last()
        .map(|event| window_resize_event_logical_size(world, event));
    let Some((width, height)) = next_size else {
        return;
    };
    let current = world.resource::<AtomeBevyRendererConfig>();
    if (current.width - width).abs() < f32::EPSILON
        && (current.height - height).abs() < f32::EPSILON
    {
        return;
    }
    if let Err(error) = apply_surface(world, AtomeSurfacePatch { width, height }) {
        world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
        return;
    }
    world.write_message(RequestRedraw);
    wake_web_renderer();
}

fn apply_pending_web_redraw(world: &mut World) {
    if !drain_web_redraw_request() {
        return;
    }
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().redraw_applied += 1;
    });
    world.write_message(RequestRedraw);
    wake_web_renderer();
}

fn apply_pending_video_frame_notifications(world: &mut World) {
    let drained = drain_web_video_frames();
    if drained == 0 {
        return;
    }
    WEB_DIAGNOSTICS.with(|cell| {
        let mut diagnostics = cell.borrow_mut();
        diagnostics.video_frame_redraws = diagnostics.video_frame_redraws.saturating_add(drained);
    });
    world.write_message(RequestRedraw);
}

fn read_web_renderer_diagnostics() -> WebRendererDiagnostics {
    WEB_DIAGNOSTICS.with(|cell| cell.borrow().clone())
}

fn reset_web_renderer_diagnostics() -> WebRendererDiagnostics {
    WEB_DIAGNOSTICS.with(|cell| {
        let previous = cell.borrow().clone();
        *cell.borrow_mut() = WebRendererDiagnostics::default();
        previous
    })
}

fn web_window_for_config(config: &WebBevyRendererConfig) -> Window {
    let resolution = WindowResolution::new(
        config.core.width.round() as u32,
        config.core.height.round() as u32,
    )
    .with_scale_factor_override(1.0);
    Window {
        canvas: Some(config.canvas_selector.clone()),
        fit_canvas_to_parent: false,
        prevent_default_event_handling: false,
        resolution,
        composite_alpha_mode: if config.transparent {
            CompositeAlphaMode::PreMultiplied
        } else {
            CompositeAlphaMode::Opaque
        },
        present_mode: PresentMode::AutoNoVsync,
        title: "Atome Bevy Renderer".to_string(),
        transparent: config.transparent,
        visible: true,
        ..default()
    }
}

fn build_web_bevy_app(config: WebBevyRendererConfig) -> App {
    let window = web_window_for_config(&config);
    let mut app = App::new();
    app.add_plugins(
        DefaultPlugins
            .set(LogPlugin {
                level: Level::WARN,
                filter: "warn,wgpu=error,naga=warn".to_string(),
                ..default()
            })
            .set(WindowPlugin {
                primary_window: Some(window),
                ..default()
            }),
    )
    .add_plugins(WebBevyRendererPlugin { config });
    app
}

#[cfg(test)]
mod tests;
