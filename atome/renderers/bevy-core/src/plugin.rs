use bevy::{image::Image, mesh::Mesh, prelude::*};

use crate::{
    render_ops::apply_render_op,
    selection_overlay::rebuild_selection_overlay,
    spawn::spawn_node_with_texture_handle,
    texture::image_handle_from_texture,
    types::*,
    video_external_texture::{
        insert_video_external_texture_component_for_node, AtomeVideoExternalTexturePlugin,
    },
    waveform_playback_overlay::rebuild_waveform_playback_overlay,
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
            .init_resource::<AtomeEntityTable>()
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
) {
    commands.spawn(Camera2d);
    for node in &config.initial_scene.nodes {
        let node_id = node.id.clone();
        let texture_handle = if node.kind == "video" {
            None
        } else if node.texture.is_some() {
            Some(
                image_handle_from_texture(&mut images, &node.texture, &node.id)
                    .unwrap_or_else(|error| panic!("{error}")),
            )
        } else {
            None
        };
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
}
