use atome_bevy_renderer_core::{
    apply_render_ops, AtomeBevyRendererConfig, AtomeBevyRendererPlugin, AtomeRenderOp,
    AtomeRenderScene,
};
use bevy::{
    log::{Level, LogPlugin},
    prelude::*,
    window::{CompositeAlphaMode, PresentMode, RequestRedraw, Window, WindowPlugin},
    winit::{EventLoopProxy, EventLoopProxyWrapper, WinitUserEvent},
};
use serde::Serialize;
use std::cell::RefCell;

mod exports;

thread_local! {
    static WEB_PENDING_OPS: RefCell<Vec<AtomeRenderOp>> = RefCell::new(Vec::new());
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
}

fn queue_web_op(op: AtomeRenderOp) {
    let is_transform = matches!(op, AtomeRenderOp::Transform(_));
    WEB_PENDING_OPS.with(|cell| cell.borrow_mut().push(op));
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

fn drain_web_ops() -> Vec<AtomeRenderOp> {
    let ops: Vec<AtomeRenderOp> = WEB_PENDING_OPS.with(|cell| cell.borrow_mut().drain(..).collect());
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
}

impl WebBevyRendererConfig {
    fn new(
        canvas_selector: String,
        width: f32,
        height: f32,
        initial_scene: AtomeRenderScene,
    ) -> Self {
        Self {
            canvas_selector,
            core: AtomeBevyRendererConfig::new(width, height, initial_scene),
        }
    }
}

struct WebBevyRendererPlugin {
    config: WebBevyRendererConfig,
}

impl Plugin for WebBevyRendererPlugin {
    fn build(&self, app: &mut App) {
        app.add_message::<RequestRedraw>()
            .insert_resource(ClearColor(Color::NONE))
            .add_plugins(AtomeBevyRendererPlugin::new(self.config.core.clone()))
            .add_systems(Startup, (remember_event_loop_proxy, request_initial_web_redraw).chain())
            .add_systems(Update, (apply_pending_web_ops, apply_pending_web_redraw).chain());
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
    Window {
        canvas: Some(config.canvas_selector.clone()),
        fit_canvas_to_parent: false,
        prevent_default_event_handling: false,
        resolution: (
            config.core.width.round() as u32,
            config.core.height.round() as u32,
        )
            .into(),
        composite_alpha_mode: CompositeAlphaMode::PreMultiplied,
        present_mode: PresentMode::AutoNoVsync,
        title: "Atome Bevy Renderer".to_string(),
        transparent: true,
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
