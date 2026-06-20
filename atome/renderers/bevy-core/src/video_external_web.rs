use bevy::{
    core_pipeline::core_2d::{Transparent2d, CORE_2D_DEPTH_FORMAT},
    ecs::system::lifetimeless::{Read, SRes},
    math::FloatOrd,
    mesh::VertexBufferLayout,
    prelude::*,
    render::{
        mesh::RenderMesh,
        render_asset::RenderAssets,
        render_phase::{
            AddRenderCommand, DrawFunctions, PhaseItem, PhaseItemExtraIndex, RenderCommand,
            RenderCommandResult, SetItemPipeline, TrackedRenderPass, ViewSortedRenderPhases,
        },
        render_resource::{
            BindGroup, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingResource,
            BindingType, BlendState, Buffer, BufferBindingType, BufferInitDescriptor, BufferUsages,
            ColorTargetState, ColorWrites, CompareFunction, DepthBiasState, DepthStencilState,
            Face, FragmentState, MultisampleState, PipelineCache, PrimitiveState,
            RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, ShaderStages,
            SpecializedRenderPipeline, SpecializedRenderPipelines, StencilFaceState, StencilState,
            TextureFormat, VertexFormat, VertexState, VertexStepMode,
        },
        renderer::RenderDevice,
        sync_world::{MainEntity, MainEntityHashMap},
        view::{ExtractedView, RenderVisibleEntities, ViewTarget},
        Render, RenderApp, RenderStartup, RenderSystems,
    },
    sprite_render::{
        init_mesh_2d_pipeline, DrawMesh2d, Mesh2dPipeline, Mesh2dPipelineKey,
        RenderMesh2dInstances, SetMesh2dBindGroup, SetMesh2dViewBindGroup,
    },
};
use wasm_bindgen::{JsCast, JsValue};

use crate::{
    render_math::depth_for_layer,
    types::{AtomeColorFilters, AtomeTransition},
    video_external_texture::AtomeVideoExternalTexture,
};

const VIDEO_EXTERNAL_SHADER: &str = include_str!("../assets/shaders/video_external.wgsl");
const IDENTITY_SAMPLE_TRANSFORM: [f32; 6] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
const IDENTITY_LOAD_TRANSFORM: [f32; 6] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
const IDENTITY_YUV_CONVERSION: [f32; 16] = [
    1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
];
const IDENTITY_GAMUT_CONVERSION: [f32; 9] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

#[derive(Resource)]
struct VideoExternalTextureShader(Handle<Shader>);

#[derive(Resource)]
struct VideoExternalTexturePipeline {
    mesh2d_pipeline: Mesh2dPipeline,
    shader: Handle<Shader>,
    video_layout: BindGroupLayoutDescriptor,
    sampler: Sampler,
}

struct PreparedVideoExternalTextureBindGroup {
    _external_texture: wgpu::ExternalTexture,
    _opacity_buffer: Buffer,
    bind_group: BindGroup,
}

#[derive(Resource, Default)]
struct PreparedVideoExternalTextureBindGroups(
    MainEntityHashMap<PreparedVideoExternalTextureBindGroup>,
);

type DrawVideoExternalTexture2d = (
    SetItemPipeline,
    SetMesh2dViewBindGroup<0>,
    SetMesh2dBindGroup<1>,
    SetVideoExternalTextureBindGroup<2>,
    DrawVideoExternalTextureMesh2d,
);

// VideoParams uniform — matches the struct in video_external.wgsl:
// base = (opacity, brightness, contrast, saturate); filters = (grayscale, sepia,
// invert, hue); transition = (kind, progress, role, softness).
fn video_params_bytes(
    opacity: f32,
    filters: &AtomeColorFilters,
    transition: &AtomeTransition,
) -> [u8; 48] {
    let values: [f32; 12] = [
        opacity.clamp(0.0, 1.0),
        filters.brightness,
        filters.contrast,
        filters.saturate,
        filters.grayscale,
        filters.sepia,
        filters.invert,
        filters.hue,
        transition.kind,
        transition.progress,
        transition.role,
        transition.softness,
    ];
    let mut bytes = [0u8; 48];
    for (index, value) in values.iter().enumerate() {
        bytes[index * 4..index * 4 + 4].copy_from_slice(&value.to_ne_bytes());
    }
    bytes
}

pub fn build_web_external_texture_renderer(app: &mut App) {
    let shader = {
        let mut shaders = app.world_mut().resource_mut::<Assets<Shader>>();
        shaders.add(Shader::from_wgsl(VIDEO_EXTERNAL_SHADER, file!()))
    };

    if let Some(render_app) = app.get_sub_app_mut(RenderApp) {
        render_app
            .insert_resource(VideoExternalTextureShader(shader))
            .add_render_command::<Transparent2d, DrawVideoExternalTexture2d>()
            .init_resource::<SpecializedRenderPipelines<VideoExternalTexturePipeline>>()
            .init_resource::<PreparedVideoExternalTextureBindGroups>()
            .add_systems(
                RenderStartup,
                init_video_external_texture_pipeline.after(init_mesh_2d_pipeline),
            )
            .add_systems(
                Render,
                (
                    queue_video_external_textures.in_set(RenderSystems::QueueMeshes),
                    prepare_video_external_texture_bind_groups
                        .in_set(RenderSystems::PrepareBindGroups),
                    clear_video_external_texture_bind_groups
                        .in_set(RenderSystems::Cleanup)
                        .after(RenderSystems::Render),
                ),
            );
    }
}

fn init_video_external_texture_pipeline(
    mut commands: Commands,
    render_device: Res<RenderDevice>,
    mesh2d_pipeline: Res<Mesh2dPipeline>,
    shader: Res<VideoExternalTextureShader>,
) {
    let video_layout = BindGroupLayoutDescriptor::new(
        "atome_video_external_texture_layout",
        &[
            BindGroupLayoutEntry {
                binding: 0,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::ExternalTexture,
                count: None,
            },
            BindGroupLayoutEntry {
                binding: 1,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::Sampler(SamplerBindingType::Filtering),
                count: None,
            },
            BindGroupLayoutEntry {
                binding: 2,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::Buffer {
                    ty: BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    );
    let sampler = render_device.create_sampler(&SamplerDescriptor {
        label: Some("atome_video_external_texture_sampler"),
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..default()
    });
    commands.insert_resource(VideoExternalTexturePipeline {
        mesh2d_pipeline: mesh2d_pipeline.clone(),
        shader: shader.0.clone(),
        video_layout,
        sampler,
    });
}

impl SpecializedRenderPipeline for VideoExternalTexturePipeline {
    type Key = Mesh2dPipelineKey;

    fn specialize(&self, key: Self::Key) -> RenderPipelineDescriptor {
        let vertex_layout = VertexBufferLayout::from_vertex_formats(
            VertexStepMode::Vertex,
            vec![VertexFormat::Float32x3, VertexFormat::Float32x2],
        );
        let format = match key.contains(Mesh2dPipelineKey::HDR) {
            true => ViewTarget::TEXTURE_FORMAT_HDR,
            false => TextureFormat::bevy_default(),
        };

        RenderPipelineDescriptor {
            vertex: VertexState {
                shader: self.shader.clone(),
                buffers: vec![vertex_layout],
                ..default()
            },
            fragment: Some(FragmentState {
                shader: self.shader.clone(),
                targets: vec![Some(ColorTargetState {
                    format,
                    blend: Some(BlendState::ALPHA_BLENDING),
                    write_mask: ColorWrites::ALL,
                })],
                ..default()
            }),
            layout: vec![
                self.mesh2d_pipeline.view_layout.clone(),
                self.mesh2d_pipeline.mesh_layout.clone(),
                self.video_layout.clone(),
            ],
            primitive: PrimitiveState {
                cull_mode: Some(Face::Back),
                topology: key.primitive_topology(),
                ..default()
            },
            depth_stencil: Some(DepthStencilState {
                format: CORE_2D_DEPTH_FORMAT,
                depth_write_enabled: false,
                depth_compare: CompareFunction::GreaterEqual,
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
            label: Some("atome_video_external_texture_pipeline".into()),
            ..default()
        }
    }
}

fn prepare_video_external_texture_bind_groups(
    render_device: Res<RenderDevice>,
    pipeline: Res<VideoExternalTexturePipeline>,
    pipeline_cache: Res<PipelineCache>,
    mut prepared: ResMut<PreparedVideoExternalTextureBindGroups>,
    videos: Query<(&MainEntity, &AtomeVideoExternalTexture)>,
) {
    prepared.0.clear();

    for (main_entity, video) in &videos {
        let Some(source) = hidden_video_source_for_id(&video.id) else {
            continue;
        };
        if source.ready_state() < web_sys::HtmlMediaElement::HAVE_CURRENT_DATA {
            continue;
        }
        if source.video_width() == 0 || source.video_height() == 0 {
            continue;
        }

        let external_texture = render_device.wgpu_device().create_external_texture(
            &wgpu::ExternalTextureDescriptor {
                label: Some("atome_video_external_texture"),
                source: Some(wgpu::ExternalImageSource::HTMLVideoElement(source)),
                width: 0,
                height: 0,
                format: wgpu::ExternalTextureFormat::Rgba,
                yuv_conversion_matrix: IDENTITY_YUV_CONVERSION,
                gamut_conversion_matrix: IDENTITY_GAMUT_CONVERSION,
                src_transfer_function: wgpu::ExternalTextureTransferFunction::default(),
                dst_transfer_function: wgpu::ExternalTextureTransferFunction::default(),
                sample_transform: IDENTITY_SAMPLE_TRANSFORM,
                load_transform: IDENTITY_LOAD_TRANSFORM,
            },
            &[],
        );
        let params_uniform = video_params_bytes(video.opacity, &video.filters, &video.transition);
        let opacity_buffer = render_device.create_buffer_with_data(&BufferInitDescriptor {
            label: Some("atome_video_external_texture_params"),
            contents: &params_uniform,
            usage: BufferUsages::UNIFORM,
        });
        let bind_group = render_device.create_bind_group(
            Some("atome_video_external_texture_bind_group"),
            &pipeline_cache.get_bind_group_layout(&pipeline.video_layout),
            &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: BindingResource::ExternalTexture(&external_texture),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: BindingResource::Sampler(&pipeline.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: opacity_buffer.as_entire_binding(),
                },
            ],
        );
        prepared.0.insert(
            *main_entity,
            PreparedVideoExternalTextureBindGroup {
                _external_texture: external_texture,
                _opacity_buffer: opacity_buffer,
                bind_group,
            },
        );
        record_video_external_event("bevy.video.external.import", &video.id);
    }
}

fn queue_video_external_textures(
    transparent_draw_functions: Res<DrawFunctions<Transparent2d>>,
    pipeline: Res<VideoExternalTexturePipeline>,
    mut pipelines: ResMut<SpecializedRenderPipelines<VideoExternalTexturePipeline>>,
    pipeline_cache: Res<PipelineCache>,
    render_meshes: Res<RenderAssets<RenderMesh>>,
    render_mesh_instances: Res<RenderMesh2dInstances>,
    mut transparent_render_phases: ResMut<ViewSortedRenderPhases<Transparent2d>>,
    views: Query<(&RenderVisibleEntities, &ExtractedView, &Msaa)>,
    videos: Query<&AtomeVideoExternalTexture>,
) {
    let draw_video = transparent_draw_functions
        .read()
        .id::<DrawVideoExternalTexture2d>();

    for (visible_entities, view, msaa) in &views {
        let Some(transparent_phase) = transparent_render_phases.get_mut(&view.retained_view_entity)
        else {
            continue;
        };
        for (render_entity, visible_entity) in visible_entities.iter::<Mesh2d>() {
            let Ok(video) = videos.get(*render_entity) else {
                continue;
            };
            let Some(mesh_instance) = render_mesh_instances.get(visible_entity) else {
                continue;
            };
            let Some(mesh) = render_meshes.get(mesh_instance.mesh_asset_id) else {
                continue;
            };
            let key = Mesh2dPipelineKey::from_msaa_samples(msaa.samples())
                | Mesh2dPipelineKey::from_hdr(view.hdr)
                | Mesh2dPipelineKey::from_primitive_topology(mesh.primitive_topology());
            let pipeline_id = pipelines.specialize(&pipeline_cache, &pipeline, key);
            let mesh_z = depth_for_layer(video.layer);
            transparent_phase.add(Transparent2d {
                entity: (*render_entity, *visible_entity),
                draw_function: draw_video,
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

struct SetVideoExternalTextureBindGroup<const I: usize>;

impl<P: PhaseItem, const I: usize> RenderCommand<P> for SetVideoExternalTextureBindGroup<I> {
    type Param = SRes<PreparedVideoExternalTextureBindGroups>;
    type ViewQuery = ();
    type ItemQuery = Read<AtomeVideoExternalTexture>;

    fn render<'w>(
        item: &P,
        _view: (),
        entity: Option<bevy::ecs::query::ROQueryItem<'w, '_, Self::ItemQuery>>,
        prepared: bevy::ecs::system::SystemParamItem<'w, '_, Self::Param>,
        pass: &mut TrackedRenderPass<'w>,
    ) -> RenderCommandResult {
        let prepared_groups = prepared.into_inner();
        let Some(prepared) = prepared_groups.0.get(&item.main_entity()) else {
            return RenderCommandResult::Skip;
        };
        pass.set_bind_group(I, &prepared.bind_group, &[]);
        if let Some(video) = entity {
            record_video_external_event("bevy.video.external.draw", &video.id);
        }
        RenderCommandResult::Success
    }
}

struct DrawVideoExternalTextureMesh2d;

impl<P: PhaseItem> RenderCommand<P> for DrawVideoExternalTextureMesh2d {
    type Param = <DrawMesh2d as RenderCommand<P>>::Param;
    type ViewQuery = <DrawMesh2d as RenderCommand<P>>::ViewQuery;
    type ItemQuery = <DrawMesh2d as RenderCommand<P>>::ItemQuery;

    fn render<'w>(
        item: &P,
        view: bevy::ecs::query::ROQueryItem<'w, '_, Self::ViewQuery>,
        entity: Option<bevy::ecs::query::ROQueryItem<'w, '_, Self::ItemQuery>>,
        param: bevy::ecs::system::SystemParamItem<'w, '_, Self::Param>,
        pass: &mut TrackedRenderPass<'w>,
    ) -> RenderCommandResult {
        DrawMesh2d::render(item, view, entity, param, pass)
    }
}

fn clear_video_external_texture_bind_groups(
    mut prepared: ResMut<PreparedVideoExternalTextureBindGroups>,
) {
    prepared.0.clear();
}

fn hidden_video_source_for_id(id: &str) -> Option<web_sys::HtmlVideoElement> {
    let window = web_sys::window()?;
    let lookup = js_sys::Reflect::get(
        window.as_ref(),
        &JsValue::from_str("__EVE_BEVY_VIDEO_SOURCE_FOR_ID__"),
    )
    .ok()?
    .dyn_into::<js_sys::Function>()
    .ok()?;
    lookup
        .call1(window.as_ref(), &JsValue::from_str(id))
        .ok()?
        .dyn_into::<web_sys::HtmlVideoElement>()
        .ok()
}

fn record_video_external_event(name: &str, id: &str) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Ok(callback) = js_sys::Reflect::get(
        window.as_ref(),
        &JsValue::from_str("__EVE_BEVY_PERF_RECORD__"),
    ) else {
        return;
    };
    let Ok(function) = callback.dyn_into::<js_sys::Function>() else {
        return;
    };
    let detail = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&detail, &JsValue::from_str("id"), &JsValue::from_str(id));
    let _ = function.call2(window.as_ref(), &JsValue::from_str(name), detail.as_ref());
}
