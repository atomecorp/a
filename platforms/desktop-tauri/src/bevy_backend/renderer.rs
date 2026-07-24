#[cfg(feature = "bevy_renderer_core")]
use atome_bevy_renderer_core::{
    AtomeBevyRendererConfig as AtomeCoreBevyRendererConfig, AtomeBevyRendererPlugin,
    AtomeRenderScene,
};
#[cfg(feature = "bevy_renderer_core")]
use bevy::prelude::*;
#[cfg(feature = "bevy_renderer_native")]
use bevy::window::{Window, WindowPlugin};

#[cfg(feature = "bevy_renderer_native")]
use super::{bevy_present_mode_for_profile, bevy_winit_settings_for_profile, AtomePowerProfile};

#[cfg(feature = "bevy_renderer_core")]
#[derive(Clone, Debug, Resource)]
pub struct AtomeNativeBevyRendererConfig {
    #[cfg(feature = "bevy_renderer_native")]
    pub title: String,
    pub width: f32,
    pub height: f32,
    #[cfg(feature = "bevy_renderer_native")]
    pub power_profile: AtomePowerProfile,
    pub initial_scene: AtomeRenderScene,
}

#[cfg(feature = "bevy_renderer_core")]
impl Default for AtomeNativeBevyRendererConfig {
    fn default() -> Self {
        Self {
            #[cfg(feature = "bevy_renderer_native")]
            title: "Atome Bevy Renderer".to_string(),
            width: 1280.0,
            height: 720.0,
            #[cfg(feature = "bevy_renderer_native")]
            power_profile: AtomePowerProfile::default(),
            initial_scene: AtomeRenderScene::default(),
        }
    }
}

#[cfg(feature = "bevy_renderer_core")]
impl AtomeNativeBevyRendererConfig {
    pub fn core_config(&self) -> AtomeCoreBevyRendererConfig {
        AtomeCoreBevyRendererConfig::new(self.width, self.height, self.initial_scene.clone())
    }
}

#[cfg(feature = "bevy_renderer_native")]
fn window_for_config(config: &AtomeNativeBevyRendererConfig) -> Window {
    Window {
        title: config.title.clone(),
        resolution: (
            config.width.max(1.0).round() as u32,
            config.height.max(1.0).round() as u32,
        )
            .into(),
        present_mode: bevy_present_mode_for_profile(config.power_profile),
        fit_canvas_to_parent: true,
        prevent_default_event_handling: false,
        visible: true,
        ..default()
    }
}

#[cfg(feature = "bevy_renderer_native")]
pub fn build_atome_bevy_app(config: AtomeNativeBevyRendererConfig) -> App {
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(window_for_config(&config)),
        ..default()
    }))
    .add_plugins(AtomeBevyRendererPlugin::new(config.core_config()));
    app
}

#[cfg(feature = "bevy_renderer_core")]
pub fn build_atome_bevy_embedded_app(config: AtomeNativeBevyRendererConfig) -> App {
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(config.core_config()));
    app
}

#[cfg(feature = "bevy_renderer_native")]
pub fn run_atome_bevy_native(config: AtomeNativeBevyRendererConfig) {
    let settings = bevy_winit_settings_for_profile(config.power_profile);
    let mut app = build_atome_bevy_app(config);
    app.insert_resource(settings);
    app.run();
}

#[cfg(all(test, feature = "bevy_renderer_core"))]
mod tests {
    use super::*;
    use atome_bevy_renderer_core::{
        AtomeEntityId, AtomeLogicalSize, AtomeRenderNode, AtomeRenderScene,
    };
    use bevy::app::{App, Startup};
    use bevy::window::Window;

    fn shape_node(id: &str) -> AtomeRenderNode {
        AtomeRenderNode {
            id: id.to_string(),
            kind: "shape".to_string(),
            parent_id: None,
            logical_position: [10.0, 20.0],
            logical_size: [80.0, 40.0],
            clip_rect: None,
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 2,
            opacity: 1.0,
            corner_radius: 0.0,
            shadow: None,
            color: Some([0.24, 0.55, 0.92, 1.0]),
            text: None,
            source: None,
            texture_size: None,
            uv_rect: None,
            texture: None,
            peaks: None,
            playback_progress: None,
            selected: None,
            filters: None,
            transition: None,
        }
    }

    #[test]
    fn native_renderer_uses_shared_atome_bevy_plugin() {
        let config = AtomeNativeBevyRendererConfig {
            initial_scene: AtomeRenderScene {
                nodes: vec![shape_node("shape_1")],
                effects: Vec::new(),
                selection_style: None,
            },
            ..AtomeNativeBevyRendererConfig::default()
        };
        let mut app = App::new();
        app.add_plugins(AtomeBevyRendererPlugin::new(config.core_config()));
        app.world_mut().run_schedule(Startup);

        let mut camera_query = app.world_mut().query::<&Camera2d>();
        assert_eq!(camera_query.iter(app.world()).count(), 1);

        let mut node_query = app
            .world_mut()
            .query::<(&AtomeEntityId, &Transform, &AtomeLogicalSize)>();
        let nodes: Vec<_> = node_query.iter(app.world()).collect();
        assert_eq!(nodes.len(), 1);
        let (node, transform, size) = nodes[0];
        assert_eq!(node.0, "shape_1");
        assert_eq!(transform.translation, Vec3::new(-590.0, 320.0, 2.0));
        assert_eq!(size.width, 80.0);
        assert_eq!(size.height, 40.0);
    }

    #[test]
    fn embedded_renderer_runs_scene_without_window_plugin() {
        let config = AtomeNativeBevyRendererConfig {
            initial_scene: AtomeRenderScene {
                nodes: vec![shape_node("embedded_shape")],
                effects: Vec::new(),
                selection_style: None,
            },
            ..AtomeNativeBevyRendererConfig::default()
        };
        let mut app = build_atome_bevy_embedded_app(config);
        app.world_mut().run_schedule(Startup);

        let mut window_query = app.world_mut().query::<&Window>();
        assert_eq!(window_query.iter(app.world()).count(), 0);

        let mut node_query = app.world_mut().query::<&AtomeEntityId>();
        let nodes: Vec<_> = node_query.iter(app.world()).collect();
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].0, "embedded_shape");
    }

    #[test]
    fn renderer_config_keeps_native_power_policy_outside_shared_core() {
        let config = AtomeNativeBevyRendererConfig::default();
        assert!(config.initial_scene.nodes.is_empty());
    }
}
