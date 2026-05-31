use bevy::{
    prelude::*,
    window::{PresentMode, Window, WindowPlugin},
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug, Deserialize)]
struct WebAtomeRenderNode {
    id: String,
    parent_id: Option<String>,
    logical_position: [f32; 2],
    logical_size: [f32; 2],
    layer: i32,
    color: Option<[f32; 4]>,
}

#[derive(Clone, Debug, Component)]
pub struct AtomeEntityId(pub String);

#[derive(Clone, Debug, Component)]
pub struct AtomeParentEntityId(pub Option<String>);

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeLogicalSize {
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Copy, Debug, Component)]
pub struct AtomeLayer(pub i32);

#[derive(Clone, Debug, Resource)]
struct WebBevyRendererConfig {
    canvas_selector: String,
    width: f32,
    height: f32,
    initial_nodes: Vec<WebAtomeRenderNode>,
}

impl WebBevyRendererConfig {
    fn new(
        canvas_selector: String,
        width: f32,
        height: f32,
        initial_nodes: Vec<WebAtomeRenderNode>,
    ) -> Self {
        Self {
            canvas_selector,
            width: width.max(1.0),
            height: height.max(1.0),
            initial_nodes,
        }
    }
}

struct WebBevyRendererPlugin {
    config: WebBevyRendererConfig,
}

impl Plugin for WebBevyRendererPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(self.config.clone())
            .insert_resource(ClearColor(Color::srgb(0.04, 0.04, 0.045)))
            .add_systems(Startup, spawn_web_atome_scene);
    }
}

fn spawn_web_atome_scene(mut commands: Commands, config: Res<WebBevyRendererConfig>) {
    commands.spawn(Camera2d);
    for node in &config.initial_nodes {
        let width = node.logical_size[0].max(1.0);
        let height = node.logical_size[1].max(1.0);
        let color = node.color.unwrap_or([0.24, 0.55, 0.92, 1.0]);
        commands.spawn((
            AtomeEntityId(node.id.clone()),
            AtomeParentEntityId(node.parent_id.clone()),
            AtomeLogicalSize { width, height },
            AtomeLayer(node.layer),
            Transform::from_translation(Vec3::new(
                node.logical_position[0],
                node.logical_position[1],
                node.layer as f32,
            )),
            Sprite::from_color(
                Color::srgba(color[0], color[1], color[2], color[3]),
                Vec2::new(width, height),
            ),
        ));
    }
}

fn build_web_bevy_app(config: WebBevyRendererConfig) -> App {
    let window = Window {
        canvas: Some(config.canvas_selector.clone()),
        fit_canvas_to_parent: true,
        prevent_default_event_handling: false,
        resolution: (
            config.width.round() as u32,
            config.height.round() as u32,
        )
            .into(),
        present_mode: PresentMode::AutoVsync,
        title: "Atome Bevy Renderer".to_string(),
        visible: true,
        ..default()
    };
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(window),
        ..default()
    }))
    .add_plugins(WebBevyRendererPlugin { config });
    app
}

#[wasm_bindgen]
pub fn run_atome_bevy_renderer(
    canvas_selector: String,
    width: f32,
    height: f32,
    initial_nodes: JsValue,
) -> Result<(), JsValue> {
    if canvas_selector.trim().is_empty() {
        return Err(JsValue::from_str("bevy_canvas_selector_required"));
    }
    let nodes: Vec<WebAtomeRenderNode> = serde_wasm_bindgen::from_value(initial_nodes)
        .map_err(|error| JsValue::from_str(&format!("bevy_projection_decode_failed:{error}")))?;
    let mut app = build_web_bevy_app(WebBevyRendererConfig::new(
        canvas_selector,
        width,
        height,
        nodes,
    ));
    app.run();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::app::{App, Startup};

    #[test]
    fn plugin_projects_nodes_without_dom_state() {
        let config = WebBevyRendererConfig::new(
            "#atome-bevy".to_string(),
            640.0,
            480.0,
            vec![WebAtomeRenderNode {
                id: "shape_1".to_string(),
                parent_id: None,
                logical_position: [12.0, 24.0],
                logical_size: [80.0, 40.0],
                layer: 3,
                color: Some([1.0, 0.0, 0.0, 1.0]),
            }],
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
        assert_eq!(transform.translation, Vec3::new(12.0, 24.0, 3.0));
    }
}
