//! Media windows: an Atome playing media that WebGPU cannot sample (the
//! official YouTube player, a television stream without CORS) is drawn as a
//! transparent cut-out of its own quad. The page element sits UNDER the canvas
//! and shows through it; everything drawn after it in depth order (Atomes
//! above, menus, panels) paints over the window as usual.
//!
//! The window is an ordinary Atome entity: it uses the video quad mesh, so the
//! pose, the gesture fast path, page clipping (rectangle and polygon) and the
//! depth order are those of every other Atome. Only its pipeline differs from
//! the external video one: no picture, a destination-out blend erasing the
//! canvas down to (0,0,0,0). The cut-out takes the Atome's own shape (its
//! corner radii, its variant, its resolved Atome mask) through the same alpha
//! mask contract as a video (`video_external.wgsl` bindings 3-4): outside the
//! shape the canvas keeps what lies under the corners (wallpaper, Atomes below).

use bevy::{
    core_pipeline::core_2d::{Transparent2d, CORE_2D_DEPTH_FORMAT},
    ecs::system::lifetimeless::SRes,
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
        render_phase::{PhaseItem, RenderCommand, RenderCommandResult, TrackedRenderPass},
        render_resource::{
            binding_types::{sampler, texture_2d},
            BindGroup, BindGroupEntries, BindGroupLayoutDescriptor, BindGroupLayoutEntries,
            BlendComponent, BlendFactor, BlendOperation, BlendState, ColorTargetState, ColorWrites,
            CompareFunction, DepthBiasState, DepthStencilState, Face, FilterMode, FragmentState,
            MultisampleState, PipelineCache, PrimitiveState, RenderPipelineDescriptor, Sampler,
            SamplerBindingType, SamplerDescriptor, ShaderStages, SpecializedRenderPipeline,
            SpecializedRenderPipelines, StencilFaceState, StencilState, TextureSampleType,
            VertexFormat, VertexState, VertexStepMode,
        },
        renderer::RenderDevice,
        sync_world::{MainEntity, MainEntityHashMap},
        texture::GpuImage,
        view::{ExtractedView, RenderVisibleEntities},
        Render, RenderApp, RenderStartup, RenderSystems,
    },
    sprite_render::{
        init_mesh_2d_pipeline, DrawMesh2d, Mesh2dPipeline, Mesh2dPipelineKey,
        RenderMesh2dInstances, SetMesh2dBindGroup, SetMesh2dViewBindGroup,
    },
};
use std::any::TypeId;

use crate::{
    render_style_ops::{entity_shape_silhouette, silhouette_mask_handle},
    types::AtomeResolvedMask,
};

const MEDIA_WINDOW_SHADER: &str = include_str!("../assets/shaders/media_window.wgsl");

/// Marks an Atome entity drawn as a media window.
#[derive(Clone, Debug, Component, ExtractComponent)]
pub struct AtomeMediaWindow {
    pub id: String,
    /// The Atome's coverage baked like a video mask: its silhouette at its
    /// live size, cut by its resolved Atome mask. `None` = its whole box, and
    /// the pipeline binds the opaque 1x1 mask (one shader path).
    pub mask_texture: Option<Handle<Image>>,
}

/// Re-bakes the cut-out's shape from the entity's live silhouette and mask:
/// at spawn, on a resize, on a rounding/variant patch and on a mask patch.
pub fn refresh_media_window_mask(world: &mut World, entity: Entity, id: &str) -> Result<(), String> {
    let silhouette = entity_shape_silhouette(world, entity);
    let mask = world.get::<AtomeResolvedMask>(entity).and_then(|value| value.0.clone());
    let handle = silhouette_mask_handle(world, &silhouette, mask, id)?;
    world
        .get_mut::<AtomeMediaWindow>(entity)
        .ok_or_else(|| format!("bevy_media_window_missing:{id}"))?
        .mask_texture = handle;
    Ok(())
}

pub struct AtomeMediaWindowPlugin;

impl Plugin for AtomeMediaWindowPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(ExtractComponentPlugin::<AtomeMediaWindow>::default());
        let Some(mut shaders) = app.world_mut().get_resource_mut::<Assets<Shader>>() else {
            return;
        };
        let shader = shaders.add(Shader::from_wgsl(MEDIA_WINDOW_SHADER, file!()));
        let Some(mut images) = app.world_mut().get_resource_mut::<Assets<Image>>() else {
            return;
        };
        let opaque_mask = images.add(crate::video_external_texture::opaque_mask_image());
        if let Some(render_app) = app.get_sub_app_mut(RenderApp) {
            render_app
                .insert_resource(MediaWindowShader(shader))
                .insert_resource(MediaWindowOpaqueMask(opaque_mask))
                .init_resource::<PreparedMediaWindowMasks>()
                .add_render_command::<Transparent2d, DrawMediaWindow2d>()
                .init_resource::<SpecializedRenderPipelines<MediaWindowPipeline>>()
                .add_systems(
                    RenderStartup,
                    init_media_window_pipeline.after(init_mesh_2d_pipeline),
                )
                .add_systems(
                    Render,
                    (
                        queue_media_windows.in_set(RenderSystems::QueueMeshes),
                        prepare_media_window_masks.in_set(RenderSystems::PrepareBindGroups),
                    ),
                );
        }
    }
}

#[derive(Resource)]
struct MediaWindowShader(Handle<Shader>);

/// The white mask bound by a window that covers its whole box.
#[derive(Resource)]
struct MediaWindowOpaqueMask(Handle<Image>);

#[derive(Resource)]
struct MediaWindowPipeline {
    mesh2d_pipeline: Mesh2dPipeline,
    shader: Handle<Shader>,
    mask_layout: BindGroupLayoutDescriptor,
    mask_sampler: Sampler,
}

/// This frame's mask bind group of each window ready to draw.
#[derive(Resource, Default)]
struct PreparedMediaWindowMasks(MainEntityHashMap<BindGroup>);

type DrawMediaWindow2d = (
    SetItemPipeline,
    SetMesh2dViewBindGroup<0>,
    SetMesh2dBindGroup<1>,
    SetMediaWindowMaskBindGroup<2>,
    DrawMesh2d,
);

fn init_media_window_pipeline(
    mut commands: Commands,
    render_device: Res<RenderDevice>,
    mesh2d_pipeline: Res<Mesh2dPipeline>,
    shader: Res<MediaWindowShader>,
) {
    let mask_layout = BindGroupLayoutDescriptor::new(
        "atome_media_window_mask_layout",
        &BindGroupLayoutEntries::sequential(
            ShaderStages::FRAGMENT,
            (
                texture_2d(TextureSampleType::Float { filterable: true }),
                sampler(SamplerBindingType::Filtering),
            ),
        ),
    );
    // Linear: the mask is baked at the logical size and drawn at the device
    // pixel ratio, so the rounded edge stays smooth.
    let mask_sampler = render_device.create_sampler(&SamplerDescriptor {
        label: Some("atome_media_window_mask_sampler"),
        mag_filter: FilterMode::Linear,
        min_filter: FilterMode::Linear,
        ..default()
    });
    commands.insert_resource(MediaWindowPipeline {
        mesh2d_pipeline: mesh2d_pipeline.clone(),
        shader: shader.0.clone(),
        mask_layout,
        mask_sampler,
    });
}

/// Destination-out: the fragment's alpha is the shape's coverage, and the
/// canvas keeps `1 - coverage` of what lies there. Full coverage writes
/// (0,0,0,0) like a replace; the anti-aliased edge erases partly.
const DESTINATION_OUT: BlendComponent = BlendComponent {
    src_factor: BlendFactor::Zero,
    dst_factor: BlendFactor::OneMinusSrcAlpha,
    operation: BlendOperation::Add,
};

fn prepare_media_window_masks(
    render_device: Res<RenderDevice>,
    pipeline: Option<Res<MediaWindowPipeline>>,
    pipeline_cache: Res<PipelineCache>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    opaque_mask: Res<MediaWindowOpaqueMask>,
    mut prepared: ResMut<PreparedMediaWindowMasks>,
    windows: Query<(&MainEntity, &AtomeMediaWindow)>,
) {
    prepared.0.clear();
    let Some(pipeline) = pipeline else {
        return;
    };
    let layout = pipeline_cache.get_bind_group_layout(&pipeline.mask_layout);
    for (main_entity, window) in &windows {
        // A mask still uploading is not replaced by the opaque one: the window
        // waits a frame rather than showing a shape it does not have.
        let handle = window.mask_texture.as_ref().unwrap_or(&opaque_mask.0);
        let Some(mask) = gpu_images.get(handle) else {
            continue;
        };
        let bind_group = render_device.create_bind_group(
            "atome_media_window_mask_bind_group",
            &layout,
            &BindGroupEntries::sequential((&mask.texture_view, &pipeline.mask_sampler)),
        );
        prepared.0.insert(*main_entity, bind_group);
    }
}

struct SetMediaWindowMaskBindGroup<const I: usize>;

impl<P: PhaseItem, const I: usize> RenderCommand<P> for SetMediaWindowMaskBindGroup<I> {
    type Param = SRes<PreparedMediaWindowMasks>;
    type ViewQuery = ();
    type ItemQuery = ();
    fn render<'w>(
        item: &P,
        _view: (),
        _entity: Option<()>,
        prepared: bevy::ecs::system::SystemParamItem<'w, '_, Self::Param>,
        pass: &mut TrackedRenderPass<'w>,
    ) -> RenderCommandResult {
        let Some(bind_group) = prepared.into_inner().0.get(&item.main_entity()) else {
            return RenderCommandResult::Skip;
        };
        pass.set_bind_group(I, bind_group, &[]);
        RenderCommandResult::Success
    }
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
                    // The cut-out erases what lies beneath it (wallpaper,
                    // Atomes below) down to transparency, inside its shape only.
                    blend: Some(BlendState { color: DESTINATION_OUT, alpha: DESTINATION_OUT }),
                    write_mask: ColorWrites::ALL,
                })],
                ..default()
            }),
            layout: vec![
                self.mesh2d_pipeline.view_layout.clone(),
                self.mesh2d_pipeline.mesh_layout.clone(),
                self.mask_layout.clone(),
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
