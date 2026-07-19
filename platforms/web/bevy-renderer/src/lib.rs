use atome_bevy_renderer_core::{
    apply_render_ops, apply_surface, apply_ui_ops, register_ui_font, AtomeBevyRendererConfig,
    AtomeBevyRendererPlugin, AtomeRenderOp, AtomeRenderScene, AtomeRendererDiagnostics,
    AtomeStylePatch, AtomeSurfacePatch, AtomeUiDiagnostics, AtomeUiEvent, AtomeUiOp,
};
use bevy::platform::time::Instant;
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
    static WEB_PENDING_UI_OPS: RefCell<Vec<AtomeUiOp>> = RefCell::new(Vec::new());
    static WEB_PENDING_UI_FONTS: RefCell<Vec<(u16, Vec<u8>)>> = const { RefCell::new(Vec::new()) };
    static WEB_LAST_UI_DIAGNOSTICS: RefCell<AtomeUiDiagnostics> = RefCell::new(AtomeUiDiagnostics::default());
    static WEB_DRAINED_UI_EVENTS: RefCell<Vec<AtomeUiEvent>> = const { RefCell::new(Vec::new()) };
    static WEB_PENDING_VIDEO_FRAMES: RefCell<u32> = const { RefCell::new(0) };
    static WEB_EVENT_LOOP_PROXY: RefCell<Option<EventLoopProxy<WinitUserEvent>>> = const { RefCell::new(None) };
    static WEB_WAKE_PENDING: RefCell<bool> = const { RefCell::new(false) };
    static WEB_REDRAW_PENDING: RefCell<bool> = const { RefCell::new(false) };
    static WEB_DIAGNOSTICS: RefCell<WebRendererDiagnostics> = RefCell::new(WebRendererDiagnostics::default());
    static WEB_RUNNING_APPS: RefCell<Vec<App>> = const { RefCell::new(Vec::new()) };
    static WEB_LAST_TICK_AT: RefCell<Option<Instant>> = const { RefCell::new(None) };
    static WEB_LAST_WAKE_AT: RefCell<Option<Instant>> = const { RefCell::new(None) };
    static WEB_FRAME_PROBE: RefCell<WebFrameProbe> = RefCell::new(WebFrameProbe::default());
}

const WEB_SLOW_FRAME_THRESHOLD_MS: f32 = 8.0;
const WEB_SLOW_FRAME_HISTORY: usize = 12;

#[derive(Clone, Debug, Default, Serialize)]
struct WebFrameTiming {
    main_ms: f32,
    ui_ops: u32,
    apply_ui_ops_ms: f32,
}

#[derive(Debug, Default)]
struct WebFrameProbe {
    started_at: Option<Instant>,
    current: WebFrameTiming,
}

fn web_frame_probe_begin(_world: &mut World) {
    WEB_LAST_TICK_AT.with(|cell| {
        *cell.borrow_mut() = Some(Instant::now());
    });
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().update_ticks += 1;
    });
    WEB_FRAME_PROBE.with(|cell| {
        let mut probe = cell.borrow_mut();
        probe.started_at = Some(Instant::now());
        probe.current = WebFrameTiming::default();
    });
}

fn web_frame_probe_end(world: &mut World) {
    // The UI pass renders into the camera's physical viewport; the JS UI
    // runtime needs the effective size to pre-scale logical trees exactly.
    let ui_viewport = {
        let mut query = world.query::<&Camera>();
        query
            .iter(world)
            .find_map(|camera| camera.physical_viewport_size())
    };
    if let Some(size) = ui_viewport {
        WEB_DIAGNOSTICS.with(|cell| {
            let mut diagnostics = cell.borrow_mut();
            diagnostics.ui_viewport_width = size.x;
            diagnostics.ui_viewport_height = size.y;
        });
    }
    WEB_FRAME_PROBE.with(|cell| {
        let mut probe = cell.borrow_mut();
        let Some(started_at) = probe.started_at.take() else {
            return;
        };
        probe.current.main_ms = started_at.elapsed().as_secs_f32() * 1000.0;
        let timing = probe.current.clone();
        WEB_DIAGNOSTICS.with(|diagnostics_cell| {
            let mut diagnostics = diagnostics_cell.borrow_mut();
            if timing.main_ms > WEB_SLOW_FRAME_THRESHOLD_MS {
                diagnostics.recent_slow_frames.push(timing.clone());
                let excess = diagnostics
                    .recent_slow_frames
                    .len()
                    .saturating_sub(WEB_SLOW_FRAME_HISTORY);
                if excess > 0 {
                    diagnostics.recent_slow_frames.drain(..excess);
                }
            }
            diagnostics.last_frame = timing;
        });
    });
}

#[derive(Clone, Debug, Default, Serialize)]
struct WebRendererDiagnostics {
    queued_ops: u32,
    transform_ops: u32,
    drained_ops: u32,
    drain_batches: u32,
    merged_style_ops: u32,
    max_queue_depth: u32,
    redraw_requests: u32,
    redraw_applied: u32,
    wake_calls: u32,
    wake_send_failures: u32,
    video_frame_notifications: u32,
    video_frame_redraws: u32,
    queued_ui_ops: u32,
    drained_ui_ops: u32,
    ui_batches: u32,
    running_apps: u32,
    update_ticks: u32,
    ui_viewport_width: u32,
    ui_viewport_height: u32,
    last_frame: WebFrameTiming,
    recent_slow_frames: Vec<WebFrameTiming>,
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
    queue_web_ops(vec![op]);
}

fn queue_web_ops(ops: Vec<AtomeRenderOp>) {
    if ops.is_empty() {
        return;
    }
    let op_count = ops.len() as u32;
    let transform_count = ops
        .iter()
        .filter(|op| matches!(op, AtomeRenderOp::Transform(_)))
        .count() as u32;
    let mut merged_ops = 0u32;
    WEB_PENDING_OPS.with(|cell| {
        let mut pending_ops = cell.borrow_mut();
        for op in ops {
            if let AtomeRenderOp::Style(patch) = op {
                if try_merge_pending_style_patch(&mut pending_ops, &patch) {
                    merged_ops += 1;
                    continue;
                }
                pending_ops.push(AtomeRenderOp::Style(patch));
                continue;
            }
            pending_ops.push(op);
        }
    });
    let queue_depth = WEB_PENDING_OPS.with(|cell| cell.borrow().len() as u32);
    WEB_DIAGNOSTICS.with(|cell| {
        let mut diagnostics = cell.borrow_mut();
        diagnostics.queued_ops += op_count;
        diagnostics.transform_ops += transform_count;
        // A merged style patch is absorbed by its pending host patch and will
        // never be drained itself: account for it immediately so the JS-side
        // presentation waiter (drained_ops >= queued_ops watermark) still
        // completes once the host patch applies.
        diagnostics.drained_ops += merged_ops;
        diagnostics.merged_style_ops += merged_ops;
        diagnostics.max_queue_depth = diagnostics.max_queue_depth.max(queue_depth);
    });
    wake_web_renderer();
}

fn queue_web_ui_ops(ops: Vec<AtomeUiOp>) {
    if ops.is_empty() {
        return;
    }
    let op_count = ops.len() as u32;
    WEB_PENDING_UI_OPS.with(|cell| {
        cell.borrow_mut().extend(ops);
    });
    WEB_DIAGNOSTICS.with(|cell| {
        let mut diagnostics = cell.borrow_mut();
        diagnostics.queued_ui_ops += op_count;
    });
    request_web_redraw();
}

fn op_targets_id(op: &AtomeRenderOp, id: &str) -> bool {
    match op {
        AtomeRenderOp::Spawn(node) => node.id == id,
        AtomeRenderOp::Despawn(target) => target == id,
        AtomeRenderOp::Transform(patch) => patch.id == id,
        AtomeRenderOp::Style(patch) => patch.id == id,
        AtomeRenderOp::Reparent(patch) => patch.id == id,
        AtomeRenderOp::Layer(patch) => patch.id == id,
        AtomeRenderOp::Visibility(patch) => patch.id == id,
        AtomeRenderOp::Text(patch) => patch.id == id,
        AtomeRenderOp::Resource(patch) => patch.id == id,
        AtomeRenderOp::Surface(_)
        | AtomeRenderOp::SurfaceBackground(_)
        | AtomeRenderOp::SceneEffects(_) => false,
    }
}

fn merge_style_patch_fields(existing: &mut AtomeStylePatch, next: &AtomeStylePatch) {
    if next.color.is_some() {
        existing.color = next.color;
    }
    if next.shadow.is_some() {
        existing.shadow = next.shadow.clone();
    }
    if next.selected.is_some() {
        existing.selected = next.selected;
    }
    if next.opacity.is_some() {
        existing.opacity = next.opacity;
    }
    if next.playback_progress.is_some() {
        existing.playback_progress = next.playback_progress;
    }
    if next.filters.is_some() {
        existing.filters = next.filters.clone();
    }
    if next.transition.is_some() {
        existing.transition = next.transition;
    }
    if next.procedural.is_some() {
        existing.procedural = next.procedural;
    }
}

// Coalesce per-atome style patches while they wait in the queue: applying
// {opacity: 0.4} then {opacity: 0.8} within one drained batch is visually
// identical to applying the merged patch once, and fade animations otherwise
// flood a single Bevy frame with hundreds of stale patches when drains lag
// behind rAF (measured 1240 style ops / 28ms in one close frame). Patches
// carrying a transition keep sequential semantics, and any non-style op for
// the same id (spawn/despawn/text/...) acts as a merge barrier.
fn try_merge_pending_style_patch(
    pending_ops: &mut [AtomeRenderOp],
    patch: &AtomeStylePatch,
) -> bool {
    if patch.id.trim().is_empty() || patch.transition.is_some() {
        return false;
    }
    let Some(pending) = pending_ops
        .iter_mut()
        .rev()
        .find(|pending| op_targets_id(pending, &patch.id))
    else {
        return false;
    };
    let AtomeRenderOp::Style(existing) = pending else {
        return false;
    };
    if existing.transition.is_some() {
        return false;
    }
    merge_style_patch_fields(existing, patch);
    true
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

fn drain_web_ui_ops() -> Vec<AtomeUiOp> {
    let ops: Vec<AtomeUiOp> = WEB_PENDING_UI_OPS.with(|cell| cell.borrow_mut().drain(..).collect());
    if !ops.is_empty() {
        WEB_DIAGNOSTICS.with(|cell| {
            let mut diagnostics = cell.borrow_mut();
            diagnostics.drained_ui_ops += ops.len() as u32;
            diagnostics.ui_batches += 1;
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

fn read_web_ui_diagnostics() -> AtomeUiDiagnostics {
    let app_diagnostics = WEB_RUNNING_APPS.with(|cell| {
        let apps = cell.borrow();
        apps.last()
            .and_then(|app| app.world().get_resource::<AtomeUiDiagnostics>().cloned())
            .unwrap_or_default()
    });
    if app_diagnostics.mounted_trees > 0
        || app_diagnostics.mounted_nodes > 0
        || app_diagnostics.applied_ops > 0
        || app_diagnostics.queued_events > 0
        || app_diagnostics.last_error.is_some()
    {
        return app_diagnostics;
    }
    WEB_LAST_UI_DIAGNOSTICS.with(|cell| cell.borrow().clone())
}

fn drain_web_ui_events() -> Vec<AtomeUiEvent> {
    WEB_DRAINED_UI_EVENTS.with(|cell| cell.borrow_mut().drain(..).collect())
}

fn queue_web_ui_events(events: Vec<AtomeUiEvent>) {
    if events.is_empty() {
        return;
    }
    WEB_DRAINED_UI_EVENTS.with(|cell| cell.borrow_mut().extend(events));
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

// Every WakeUp user event makes the reactive winit runner recompute its
// wait deadline; at rAF cadence (one wake per queued op batch) the 16ms
// deadline never expires and the loop stops ticking entirely (measured:
// a pure-wake flood at 60/s drops update ticks from ~58/s to 0). The loop
// already self-ticks every 16ms, so a wake is only useful when it has been
// genuinely silent; emission is throttled so wakes can never re-starve it.
const WEB_WAKE_SILENCE_THRESHOLD_MS: u128 = 50;

fn wake_web_renderer() {
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().wake_calls += 1;
    });
    let loop_silent = WEB_LAST_TICK_AT.with(|cell| {
        cell.borrow()
            .map(|at| at.elapsed().as_millis() > WEB_WAKE_SILENCE_THRESHOLD_MS)
            .unwrap_or(true)
    });
    let wake_recent = WEB_LAST_WAKE_AT.with(|cell| {
        cell.borrow()
            .map(|at| at.elapsed().as_millis() <= WEB_WAKE_SILENCE_THRESHOLD_MS)
            .unwrap_or(false)
    });
    if !loop_silent || wake_recent {
        return;
    }
    WEB_LAST_WAKE_AT.with(|cell| {
        *cell.borrow_mut() = Some(Instant::now());
    });
    WEB_EVENT_LOOP_PROXY.with(|cell| {
        if let Some(proxy) = cell.borrow().as_ref() {
            if proxy.send_event(WinitUserEvent::WakeUp).is_err() {
                WEB_DIAGNOSTICS.with(|diagnostics| {
                    diagnostics.borrow_mut().wake_send_failures += 1;
                });
            }
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
    #[cfg(test)]
    fn new(
        canvas_selector: String,
        width: f32,
        height: f32,
        initial_scene: AtomeRenderScene,
    ) -> Self {
        Self::with_transparency(
            canvas_selector,
            width,
            height,
            width,
            height,
            1.0,
            initial_scene,
            false,
        )
    }

    fn with_transparency(
        canvas_selector: String,
        width: f32,
        height: f32,
        pixel_width: f32,
        pixel_height: f32,
        device_pixel_ratio: f32,
        initial_scene: AtomeRenderScene,
        transparent: bool,
    ) -> Self {
        Self {
            canvas_selector,
            core: AtomeBevyRendererConfig::with_surface_metrics(
                width,
                height,
                pixel_width,
                pixel_height,
                device_pixel_ratio,
                initial_scene,
            ),
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
            .add_systems(First, web_frame_probe_begin)
            .add_systems(
                Update,
                (
                    remember_event_loop_proxy,
                    apply_browser_window_resize_to_surface,
                    apply_pending_web_ops,
                    apply_pending_web_ui_ops,
                    drain_ui_events_for_web,
                    apply_pending_video_frame_notifications,
                    apply_pending_web_redraw,
                )
                    .chain(),
            )
            .add_systems(Last, web_frame_probe_end);
    }
}

fn request_initial_web_redraw(world: &mut World) {
    world.write_message(RequestRedraw);
}

fn apply_pending_web_ops(world: &mut World) {
    let ops = drain_web_ops();
    if ops.is_empty() {
        return;
    }
    apply_render_ops(world, ops);
    world.write_message(RequestRedraw);
}

fn queue_web_ui_font(weight: u16, bytes: Vec<u8>) {
    WEB_PENDING_UI_FONTS.with(|cell| cell.borrow_mut().push((weight, bytes)));
    request_web_redraw();
}

fn apply_pending_web_ui_fonts(world: &mut World) {
    let fonts: Vec<(u16, Vec<u8>)> =
        WEB_PENDING_UI_FONTS.with(|cell| cell.borrow_mut().drain(..).collect());
    for (weight, bytes) in fonts {
        if let Err(error) = register_ui_font(world, weight, bytes) {
            world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
        }
    }
}

fn apply_pending_web_ui_ops(world: &mut World) {
    apply_pending_web_ui_fonts(world);
    let ops = drain_web_ui_ops();
    if ops.is_empty() {
        return;
    }
    let apply_started_at = Instant::now();
    WEB_FRAME_PROBE.with(|cell| {
        cell.borrow_mut().current.ui_ops += ops.len() as u32;
    });
    apply_ui_ops(world, ops);
    WEB_FRAME_PROBE.with(|cell| {
        cell.borrow_mut().current.apply_ui_ops_ms +=
            apply_started_at.elapsed().as_secs_f32() * 1000.0;
    });
    let diagnostics = atome_bevy_renderer_core::read_ui_diagnostics(world);
    WEB_LAST_UI_DIAGNOSTICS.with(|cell| {
        *cell.borrow_mut() = diagnostics;
    });
    let drained = atome_bevy_renderer_core::drain_ui_events(world);
    if !drained.is_empty() {
        WEB_DRAINED_UI_EVENTS.with(|cell| cell.borrow_mut().extend(drained));
    }
    world.write_message(RequestRedraw);
}

fn drain_ui_events_for_web(world: &mut World) {
    let drained = atome_bevy_renderer_core::drain_ui_events(world);
    if drained.is_empty() {
        return;
    }
    WEB_DRAINED_UI_EVENTS.with(|cell| cell.borrow_mut().extend(drained));
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
    let (pixel_width, pixel_height, device_pixel_ratio) = world
        .query::<&Window>()
        .iter(world)
        .next()
        .map(|window| {
            let device_pixel_ratio = window.resolution.scale_factor();
            (
                width * device_pixel_ratio,
                height * device_pixel_ratio,
                device_pixel_ratio,
            )
        })
        .unwrap_or_else(|| {
            let current = world.resource::<AtomeBevyRendererConfig>();
            (
                current.pixel_width as f32,
                current.pixel_height as f32,
                current.device_pixel_ratio,
            )
        });
    if let Err(error) = apply_surface(
        world,
        AtomeSurfacePatch {
            width,
            height,
            pixel_width: Some(pixel_width),
            pixel_height: Some(pixel_height),
            device_pixel_ratio: Some(device_pixel_ratio),
        },
    ) {
        world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
        return;
    }
    world.write_message(RequestRedraw);
}

fn apply_pending_web_redraw(world: &mut World) {
    if !drain_web_redraw_request() {
        return;
    }
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().redraw_applied += 1;
    });
    world.write_message(RequestRedraw);
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
    WEB_DIAGNOSTICS.with(|cell| {
        let mut diagnostics = cell.borrow().clone();
        diagnostics.running_apps =
            WEB_RUNNING_APPS.with(|apps_cell| apps_cell.borrow().len() as u32);
        diagnostics
    })
}

fn reset_web_renderer_diagnostics() -> WebRendererDiagnostics {
    WEB_DIAGNOSTICS.with(|cell| {
        let previous = cell.borrow().clone();
        *cell.borrow_mut() = WebRendererDiagnostics::default();
        previous
    })
}

fn web_window_for_config(config: &WebBevyRendererConfig) -> Window {
    let mut resolution = WindowResolution::new(config.core.pixel_width, config.core.pixel_height);
    resolution.set_scale_factor(config.core.device_pixel_ratio);
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

fn run_web_bevy_app(config: WebBevyRendererConfig) {
    let mut app = build_web_bevy_app(config);
    app.run();
    WEB_RUNNING_APPS.with(|cell| {
        cell.borrow_mut().push(app);
    });
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod web_wake_tests;
