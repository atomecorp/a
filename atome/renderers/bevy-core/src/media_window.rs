//! Media windows: an Atome playing media that WebGPU cannot sample (the
//! official YouTube player, a television stream without CORS) is drawn as a
//! transparent cut-out of its own quad. The page element sits UNDER the canvas
//! and shows through it; everything drawn after it in depth order (Atomes
//! above, menus, panels) paints over the window as usual.
//!
//! The window is an ordinary Atome entity: it uses the video quad mesh, so the
//! pose, the gesture fast path, page clipping (rectangle and polygon) and the
//! depth order are those of every other Atome. Only its pipeline differs from
//! the external video one: no texture, and a REPLACE blend writing (0,0,0,0).

use bevy::{
    core_pipeline::core_2d::{Transparent2d, CORE_2D_DEPTH_FORMAT},
    math::FloatOrd,
    mesh::{Mesh2d, VertexBufferLayout},
    prelude::*,
    render::{
        extract_component::{ExtractComponent, ExtractComponentPlugin},
        mesh::RenderMesh,
        render_asset::RenderAssets,
        render_phase::{
            AddRenderCommand, DrawFunctions, PhaseItemExtraIndex, SetItemPipeline,
            ViewSortedRenderPhases,
        },
        render_resource::{
            BlendState, ColorTargetState, ColorWrites, CompareFunction, DepthBiasState,
            DepthStencilState, Face, FragmentState, MultisampleState, PipelineCache,
            PrimitiveState, RenderPipelineDescriptor, SpecializedRenderPipeline,
            SpecializedRenderPipelines, StencilFaceState, StencilState, VertexFormat, VertexState,
            VertexStepMode,
        },
        view::{ExtractedView, RenderVisibleEntities},
        Render, RenderApp, RenderStartup, RenderSystems,
    },
    sprite_render::{
        init_mesh_2d_pipeline, DrawMesh2d, Mesh2dPipeline, Mesh2dPipelineKey,
        RenderMesh2dInstances, SetMesh2dBindGroup, SetMesh2dViewBindGroup,
    },
};
use std::any::TypeId;

const MEDIA_WINDOW_SHADER: &str = include_str!("../assets/shaders/media_window.wgsl");

/// Marks an Atome entity drawn as a media window.
#[derive(Clone, Debug, Component, ExtractComponent)]
pub struct AtomeMediaWindow {
    pub id: String,
}

pub struct AtomeMediaWindowPlugin;

impl Plugin for AtomeMediaWindowPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(ExtractComponentPlugin::<AtomeMediaWindow>::default());
        let Some(mut shaders) = app.world_mut().get_resource_mut::<Assets<Shader>>() else {
            return;
        };
        let shader = shaders.add(Shader::from_wgsl(MEDIA_WINDOW_SHADER, file!()));
        if let Some(render_app) = app.get_sub_app_mut(RenderApp) {
            render_app
                .insert_resource(MediaWindowShader(shader))
                .add_render_command::<Transparent2d, DrawMediaWindow2d>()
                .init_resource::<SpecializedRenderPipelines<MediaWindowPipeline>>()
                .add_systems(
                    RenderStartup,
                    init_media_window_pipeline.after(init_mesh_2d_pipeline),
                )
                .add_systems(Render, queue_media_windows.in_set(RenderSystems::QueueMeshes));
        }
    }
}

#[derive(Resource)]
struct MediaWindowShader(Handle<Shader>);

#[derive(Resource)]
struct MediaWindowPipeline {
    mesh2d_pipeline: Mesh2dPipeline,
    shader: Handle<Shader>,
}

type DrawMediaWindow2d = (
    SetItemPipeline,
    SetMesh2dViewBindGroup<0>,
    SetMesh2dBindGroup<1>,
    DrawMesh2d,
);

fn init_media_window_pipeline(
    mut commands: Commands,
    mesh2d_pipeline: Res<Mesh2dPipeline>,
    shader: Res<MediaWindowShader>,
) {
    commands.insert_resource(MediaWindowPipeline {
        mesh2d_pipeline: mesh2d_pipeline.clone(),
        shader: shader.0.clone(),
    });
}

impl SpecializedRenderPipeline for MediaWindowPipeline {
    type Key = Mesh2dPipelineKey;
    fn specialize(&self, key: Self::Key) -> RenderPipelineDescriptor {
        // Same vertex contract as the video quad (position + uv).
        let vertex_layout = VertexBufferLayout::from_vertex_formats(
            VertexStepMode::Vertex,
            vec![VertexFormat::Float32x3, VertexFormat::Float32x2],
        );
        RenderPipelineDescriptor {
            vertex: VertexState {
                shader: self.shader.clone(),
                buffers: vec![vertex_layout],
                ..default()
            },
            fragment: Some(FragmentState {
                shader: self.shader.clone(),
                targets: vec![Some(ColorTargetState {
                    format: key.target_format(),
                    // REPLACE, not blending: the cut-out must erase what lies
                    // beneath it (wallpaper, Atomes below) down to transparency.
                    blend: Some(BlendState::REPLACE),
                    write_mask: ColorWrites::ALL,
                })],
                ..default()
            }),
            layout: vec![
                self.mesh2d_pipeline.view_layout.clone(),
                self.mesh2d_pipeline.mesh_layout.clone(),
            ],
            primitive: PrimitiveState {
                cull_mode: Some(Face::Back),
                topology: key.primitive_topology(),
                ..default()
            },
            depth_stencil: Some(DepthStencilState {
                format: CORE_2D_DEPTH_FORMAT,
                depth_write_enabled: Some(false),
                depth_compare: Some(CompareFunction::GreaterEqual),
                stencil: StencilState {
                    front: StencilFaceState::IGNORE,
                    back: StencilFaceState::IGNORE,
                    read_mask: 0,
                    write_mask: 0,
                },
                bias: DepthBiasState {
                    constant: 0,
                    slope_scale: 0.0,
                    clamp: 0.0,
                },
            }),
            multisample: MultisampleState {
                count: key.msaa_samples(),
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            label: Some("atome_media_window_pipeline".into()),
            ..default()
        }
    }
}

fn queue_media_windows(
    transparent_draw_functions: Res<DrawFunctions<Transparent2d>>,
    pipeline: Option<Res<MediaWindowPipeline>>,
    mut pipelines: ResMut<SpecializedRenderPipelines<MediaWindowPipeline>>,
    pipeline_cache: Res<PipelineCache>,
    render_meshes: Res<RenderAssets<RenderMesh>>,
    render_mesh_instances: Res<RenderMesh2dInstances>,
    mut transparent_render_phases: ResMut<ViewSortedRenderPhases<Transparent2d>>,
    views: Query<(&RenderVisibleEntities, &ExtractedView, &Msaa)>,
    windows: Query<&AtomeMediaWindow>,
) {
    let Some(pipeline) = pipeline else {
        return;
    };
    let draw_window = transparent_draw_functions.read().id::<DrawMediaWindow2d>();
    for (visible_entities, view, msaa) in &views {
        let Some(transparent_phase) = transparent_render_phases.get_mut(&view.retained_view_entity)
        else {
            continue;
        };
        let Some(mesh2d_visible_entities) = visible_entities.classes.get(&TypeId::of::<Mesh2d>())
        else {
            continue;
        };
        let mesh2d_visible_entities = mesh2d_visible_entities
            .entities_cpu_culling
            .iter()
            .copied()
            .chain(
                mesh2d_visible_entities
                    .entities_gpu_culling
                    .iter()
                    .map(|(visible_entity, render_entity)| (*render_entity, *visible_entity)),
            );
        for (render_entity, visible_entity) in mesh2d_visible_entities {
            if windows.get(render_entity).is_err() {
                continue;
            }
            let Some(mesh_instance) = render_mesh_instances.get(&visible_entity) else {
                continue;
            };
            let Some(mesh) = render_meshes.get(mesh_instance.mesh_asset_id) else {
                continue;
            };
            let key = Mesh2dPipelineKey::from_msaa_samples(msaa.samples())
                | Mesh2dPipelineKey::from_target_format(view.target_format)
                | Mesh2dPipelineKey::from_primitive_topology_and_strip_index(
                    mesh.primitive_topology(),
                    mesh.index_format(),
                );
            let pipeline_id = pipelines.specialize(&pipeline_cache, &pipeline, key);
            // Same depth ordering as sprites and videos.
            let mesh_z = mesh_instance.transforms.world_from_local.translation.z;
            transparent_phase.add_transient(Transparent2d {
                entity: (render_entity, visible_entity.into()),
                draw_function: draw_window,
                pipeline: pipeline_id,
                sort_key: FloatOrd(mesh_z),
                batch_range: 0..1,
                extra_index: PhaseItemExtraIndex::None,
                extracted_index: usize::MAX,
                indexed: mesh.indexed(),
            });
        }
    }
}
