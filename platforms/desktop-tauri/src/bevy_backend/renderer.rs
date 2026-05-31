#[cfg(feature = "bevy_renderer_core")]
use bevy::{
    prelude::*,
    window::{Window, WindowPlugin},
};

#[cfg(feature = "bevy_renderer_core")]
use super::{
    atome_layer_for_node, atome_size_for_node, atome_transform_for_node,
    bevy_present_mode_for_profile, AtomeBevyNode, AtomePowerProfile,
};
#[cfg(feature = "bevy_renderer_native")]
use super::bevy_winit_settings_for_profile;

#[cfg(feature = "bevy_renderer_core")]
#[derive(Clone, Debug, Resource)]
pub struct AtomeBevyRendererConfig {
    pub title: String,
    pub width: f32,
    pub height: f32,
    pub power_profile: AtomePowerProfile,
    pub initial_nodes: Vec<AtomeBevyNode>,
}

#[cfg(feature = "bevy_renderer_core")]
impl Default for AtomeBevyRendererConfig {
    fn default() -> Self {
        Self {
            title: "Atome Bevy Renderer".to_string(),
            width: 1280.0,
            height: 720.0,
            power_profile: AtomePowerProfile::default(),
            initial_nodes: Vec::new(),
        }
    }
}

#[cfg(feature = "bevy_renderer_core")]
pub struct AtomeBevyRendererPlugin {
    pub config: AtomeBevyRendererConfig,
}

#[cfg(feature = "bevy_renderer_core")]
impl AtomeBevyRendererPlugin {
    pub fn new(config: AtomeBevyRendererConfig) -> Self {
        Self { config }
    }
}

#[cfg(feature = "bevy_renderer_core")]
impl Plugin for AtomeBevyRendererPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(self.config.clone())
            .insert_resource(ClearColor(Color::srgb(0.04, 0.04, 0.045)))
            .add_systems(Startup, spawn_atome_bevy_scene);
    }
}

#[cfg(feature = "bevy_renderer_core")]
fn spawn_atome_bevy_scene(mut commands: Commands, config: Res<AtomeBevyRendererConfig>) {
    commands.spawn(Camera2d);
    for node in &config.initial_nodes {
        let size = atome_size_for_node(node);
        commands.spawn((
            node.clone(),
            atome_transform_for_node(node),
            size,
            atome_layer_for_node(node),
            Sprite::from_color(
                Color::srgb(0.24, 0.55, 0.92),
                Vec2::new(size.width.max(1.0), size.height.max(1.0)),
            ),
        ));
    }
}

#[cfg(feature = "bevy_renderer_core")]
fn window_for_config(config: &AtomeBevyRendererConfig) -> Window {
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

#[cfg(feature = "bevy_renderer_core")]
pub fn build_atome_bevy_app(config: AtomeBevyRendererConfig) -> App {
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(window_for_config(&config)),
        ..default()
    }))
    .add_plugins(AtomeBevyRendererPlugin::new(config));
    app
}

#[cfg(feature = "bevy_renderer_native")]
pub fn run_atome_bevy_native(config: AtomeBevyRendererConfig) {
    let settings = bevy_winit_settings_for_profile(config.power_profile);
    let mut app = build_atome_bevy_app(config);
    app.insert_resource(settings);
    app.run();
}

#[cfg(all(test, feature = "bevy_renderer_core"))]
mod tests {
    use super::super::{AtomeBevyLayer, AtomeBevyLogicalSize};
    use super::*;
    use bevy::app::{App, Startup};

    #[test]
    fn renderer_plugin_spawns_camera_and_projected_atome_nodes() {
        let config = AtomeBevyRendererConfig {
            initial_nodes: vec![AtomeBevyNode::new(
                "shape_1",
                None,
                [10.0, 20.0],
                [80.0, 40.0],
                2,
            )],
            ..AtomeBevyRendererConfig::default()
        };
        let mut app = App::new();
        app.add_plugins(AtomeBevyRendererPlugin::new(config));
        app.world_mut().run_schedule(Startup);

        let mut camera_query = app.world_mut().query::<&Camera2d>();
        assert_eq!(camera_query.iter(app.world()).count(), 1);

        let mut node_query = app.world_mut().query::<(
            &AtomeBevyNode,
            &Transform,
            &AtomeBevyLogicalSize,
            &AtomeBevyLayer,
        )>();
        let nodes: Vec<_> = node_query.iter(app.world()).collect();
        assert_eq!(nodes.len(), 1);
        let (node, transform, size, layer) = nodes[0];
        assert_eq!(node.atome_id, "shape_1");
        assert_eq!(transform.translation, Vec3::new(10.0, 20.0, 2.0));
        assert_eq!(size.width, 80.0);
        assert_eq!(size.height, 40.0);
        assert_eq!(layer.0, 2);
    }

    #[test]
    fn renderer_config_does_not_enable_bevy_audio() {
        let config = AtomeBevyRendererConfig::default();
        assert_eq!(config.power_profile, AtomePowerProfile::Eco);
        assert!(config.initial_nodes.is_empty());
    }
}
