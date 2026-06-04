use atome_bevy_renderer_core::{
    apply_render_ops, AtomeBevyRendererConfig, AtomeBevyRendererPlugin, AtomeRenderOp,
    AtomeRenderScene,
};
use bevy::{
    log::{Level, LogPlugin},
    prelude::*,
    window::{CompositeAlphaMode, PresentMode, Window, WindowPlugin},
};
use std::cell::RefCell;

mod exports;

thread_local! {
    static WEB_PENDING_OPS: RefCell<Vec<AtomeRenderOp>> = RefCell::new(Vec::new());
}

fn queue_web_op(op: AtomeRenderOp) {
    WEB_PENDING_OPS.with(|cell| cell.borrow_mut().push(op));
}

fn drain_web_ops() -> Vec<AtomeRenderOp> {
    WEB_PENDING_OPS.with(|cell| cell.borrow_mut().drain(..).collect())
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
        app.insert_resource(ClearColor(Color::NONE))
            .add_plugins(AtomeBevyRendererPlugin::new(self.config.core.clone()))
            .add_systems(Update, apply_pending_web_ops);
    }
}

fn apply_pending_web_ops(world: &mut World) {
    apply_render_ops(world, drain_web_ops());
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
        present_mode: PresentMode::AutoVsync,
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
