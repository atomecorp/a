use bevy::{image::Image, mesh::Mesh, prelude::*, ui::IsDefaultUiCamera};

use crate::{
    backdrop_blur::{apply_scene_effects, refresh_scene_effects},
    procedural_sdf::ProceduralSdfPlugin,
    render_math::atome_camera_projection,
    render_ops::apply_render_op,
    selection_overlay::rebuild_selection_overlay,
    shape_shadow_overlay::rebuild_shape_shadow_overlay,
    spawn::{spawn_node_with_texture_handle, texture_handle_for_node},
    types::*,
    ui::AtomeBevyUiPlugin,
    video_external_texture::{
        insert_video_external_texture_component_for_node, AtomeVideoExternalTexturePlugin,
    },
    waveform_playback_overlay::rebuild_waveform_playback_overlay,
    workspace_backdrop::{
        spawn_workspace_backdrop, AtomePresentationCamera, PRESENTATION_LAYER, WORKSPACE_LAYER,
    },
    workspace_blur::{AssistantOpticsSettings, WorkspaceBlurMaterial, WorkspaceBlurPlugin},
};

pub struct AtomeBevyRendererPlugin {
    pub config: AtomeBevyRendererConfig,
}

impl AtomeBevyRendererPlugin {
    pub fn new(config: AtomeBevyRendererConfig) -> Self {
        Self { config }
    }
}

impl Plugin for AtomeBevyRendererPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(self.config.clone())
            .add_plugins(AtomeVideoExternalTexturePlugin)
            .add_plugins(ProceduralSdfPlugin)
            .add_plugins(WorkspaceBlurPlugin)
            .add_plugins(AtomeBevyUiPlugin)
            .init_resource::<AtomeEntityTable>()
            .init_resource::<AtomeBackdropBlurState>()
            .init_resource::<AtomeRendererDiagnostics>()
            .init_resource::<Assets<Image>>()
            .init_resource::<Assets<Mesh>>()
            .add_systems(Startup, spawn_atome_bevy_scene);
    }
}

fn spawn_atome_bevy_scene(
    mut commands: Commands,
    config: Res<AtomeBevyRendererConfig>,
    mut images: ResMut<Assets<Image>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut blur_materials: ResMut<Assets<WorkspaceBlurMaterial>>,
    optics: Res<AssistantOpticsSettings>,
) {
    let backdrop = spawn_workspace_backdrop(
        &mut commands,
        &mut images,
        &mut meshes,
        &mut blur_materials,
        &config,
        *optics,
    );
    commands.insert_resource(backdrop);
    commands.spawn((
        Camera2d,
        IsDefaultUiCamera,
        atome_camera_projection(config.width, config.height),
        bevy::camera::visibility::RenderLayers::layer(WORKSPACE_LAYER).with(PRESENTATION_LAYER),
        AtomePresentationCamera,
    ));
    for node in &config.initial_scene.nodes {
        let node_id = node.id.clone();
        let texture_handle =
            texture_handle_for_node(&mut images, node).unwrap_or_else(|error| panic!("{error}"));
        let node_for_world = node.clone();
        let surface_width = config.width;
        let surface_height = config.height;
        commands.queue(move |world: &mut World| {
            let result = spawn_node_with_texture_handle(
                world,
                node_for_world.clone(),
                texture_handle.clone(),
                surface_width,
                surface_height,
            );
            match result {
                Ok(entity) => {
                    insert_video_external_texture_component_for_node(
                        world,
                        entity,
                        &node_for_world,
                    );
                    world
                        .resource_mut::<AtomeEntityTable>()
                        .by_id
                        .insert(node_id, entity);
                    if let Err(error) = rebuild_selection_overlay(world, entity) {
                        world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
                    }
                    if let Err(error) = rebuild_shape_shadow_overlay(world, entity) {
                        world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
                    }
                    if let Err(error) = rebuild_waveform_playback_overlay(world, entity) {
                        world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
                    }
                }
                Err(error) => {
                    world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
                }
            }
        });
    }
    commands.queue(|world: &mut World| {
        let effects = world
            .resource::<AtomeBevyRendererConfig>()
            .initial_scene
            .effects
            .clone();
        if let Err(error) = apply_scene_effects(world, AtomeSceneEffectsPatch { effects }) {
            world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
        }
    });
}

pub fn apply_render_ops(world: &mut World, ops: Vec<AtomeRenderOp>) {
    for op in ops {
        match apply_render_op(world, op) {
            Ok(()) => {
                let mut diagnostics = world.resource_mut::<AtomeRendererDiagnostics>();
                diagnostics.applied_ops += 1;
                diagnostics.last_error = None;
            }
            Err(error) => {
                world.resource_mut::<AtomeRendererDiagnostics>().last_error =
                    Some(format!("{error:?}"));
            }
        }
    }
    if let Err(error) = refresh_scene_effects(world) {
        world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
    }
}
