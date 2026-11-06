//! The render-world half of `spatial_mask_gpu.rs`: the fragment pass that draws the queued masks, before any
//! camera draws and before a shadow is blurred from them (`ShapeMaskDraw`).
use bevy::{
    asset::{load_internal_asset, uuid_handle},
    core_pipeline::{FullscreenShader, schedule::camera_driver},
    prelude::*,
    render::{
        ExtractSchedule, MainWorld, RenderApp, RenderStartup,
        render_asset::RenderAssets,
        render_resource::{
            BindGroupEntries, BindGroupLayoutDescriptor, BindGroupLayoutEntries,
            CachedRenderPipelineId, ColorTargetState, ColorWrites, Extent3d, FragmentState,
            PipelineCache, RenderPipelineDescriptor, ShaderStages, ShaderType, TextureDataOrder,
            TextureDescriptor, TextureDimension, TextureFormat, TextureSampleType, TextureUsages,
            TextureView, TextureViewDescriptor, UniformBuffer,
            binding_types::{texture_2d, uniform_buffer},
        },
        renderer::{RenderContext, RenderDevice, RenderGraph, RenderGraphSystems, RenderQueue},
        texture::GpuImage,
    },
    shader::Shader,
};

use super::{
    ALPHA_WIDTH, LAYER_TEXELS, RAW_FORMAT, SpatialMaskJob, SpatialMaskQueue, SpatialMaskSource,
};
use crate::{
    shape_mask_gpu::{ShapeMaskDraw, silhouette_vectors},
    shape_shadow_gpu::{pass, pipelines_ready},
};

const SPATIAL_MASK_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("6b10d8b1-2516-4803-aa62-c5604a136231");

#[derive(Clone, Copy, Debug, Default, ShaderType)]
struct SpatialMaskUniform {
    sizes: Vec4,
    source: Vec4,
    shape: Vec4,
    radii: Vec4,
    geometry: Vec4,
}

#[derive(Resource, Default)]
struct PendingSpatialMasks(Vec<SpatialMaskJob>);

#[derive(Resource)]
struct SpatialMaskPipeline {
    layout: BindGroupLayoutDescriptor,
    id: CachedRenderPipelineId,
    /// Bound in place of a texture source when the mask cuts none.
    blank: TextureView,
}

pub struct SpatialMaskGpuPlugin;

impl Plugin for SpatialMaskGpuPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<SpatialMaskQueue>();
        load_internal_asset!(
            app,
            SPATIAL_MASK_SHADER_HANDLE,
            "assets/shaders/spatial_mask.wgsl",
            Shader::from_wgsl
        );
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
            return;
        };
        render_app
            .init_resource::<PendingSpatialMasks>()
            .add_systems(RenderStartup, init_pipeline)
            .add_systems(ExtractSchedule, extract_spatial_masks)
            .add_systems(
                RenderGraph,
                draw_spatial_masks
                    .in_set(RenderGraphSystems::Render)
                    .in_set(ShapeMaskDraw)
                    .before(camera_driver),
            );
    }
}

fn data_texture(
    device: &RenderDevice,
    queue: &RenderQueue,
    label: &'static str,
    format: TextureFormat,
    size: [u32; 2],
    bytes: &[u8],
) -> TextureView {
    device
        .create_texture_with_data(
            queue,
            &TextureDescriptor {
                label: Some(label),
                size: Extent3d {
                    width: size[0],
                    height: size[1],
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format,
                usage: TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST,
                view_formats: &[],
            },
            TextureDataOrder::LayerMajor,
            bytes,
        )
        .create_view(&TextureViewDescriptor::default())
}

fn init_pipeline(
    mut commands: Commands,
    fullscreen: Res<FullscreenShader>,
    cache: Res<PipelineCache>,
    device: Res<RenderDevice>,
    queue: Res<RenderQueue>,
) {
    let unfiltered = || texture_2d(TextureSampleType::Float { filterable: false });
    let layout = BindGroupLayoutDescriptor::new(
        "spatial_mask_layout",
        &BindGroupLayoutEntries::sequential(
            ShaderStages::FRAGMENT,
            (
                uniform_buffer::<SpatialMaskUniform>(false),
                unfiltered(),
                unfiltered(),
                unfiltered(),
            ),
        ),
    );
    let id = cache.queue_render_pipeline(RenderPipelineDescriptor {
        label: Some("spatial_mask".into()),
        layout: vec![layout.clone()],
        vertex: fullscreen.to_vertex_state(),
        fragment: Some(FragmentState {
            shader: SPATIAL_MASK_SHADER_HANDLE,
            entry_point: Some("masked".into()),
            targets: vec![Some(ColorTargetState {
                format: RAW_FORMAT,
                blend: None,
                write_mask: ColorWrites::ALL,
            })],
            ..default()
        }),
        ..default()
    });
    let blank = data_texture(
        &device,
        &queue,
        "spatial_mask_blank",
        RAW_FORMAT,
        [1, 1],
        &[0; 4],
    );
    commands.insert_resource(SpatialMaskPipeline { layout, id, blank });
}

fn extract_spatial_masks(
    mut main_world: ResMut<MainWorld>,
    mut pending: ResMut<PendingSpatialMasks>,
) {
    if let Some(mut queue) = main_world.get_resource_mut::<SpatialMaskQueue>() {
        pending.0.append(&mut queue.0);
    }
}

fn raw_view(image: &GpuImage) -> TextureView {
    image.texture.create_view(&TextureViewDescriptor {
        format: Some(RAW_FORMAT),
        ..default()
    })
}

fn draw_spatial_masks(
    mut pending: ResMut<PendingSpatialMasks>,
    pipeline: Option<Res<SpatialMaskPipeline>>,
    cache: Res<PipelineCache>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    device: Res<RenderDevice>,
    queue: Res<RenderQueue>,
    mut ctx: RenderContext,
) -> Result<(), BevyError> {
    let Some(pipeline) = pipeline else {
        return Ok(());
    };
    if pending.0.is_empty() || !pipelines_ready(&cache, &[pipeline.id], "spatial_mask")? {
        return Ok(());
    }
    let Some(render_pipeline) = cache.get_render_pipeline(pipeline.id) else {
        return Ok(());
    };
    let layout = cache.get_bind_group_layout(&pipeline.layout);
    // A mask whose texture (or source) the GPU does not hold yet waits for a later frame.
    pending.0.retain(|job| {
        let Some(target) = gpu_images.get(&job.target) else {
            return true;
        };
        let (kind, source, silhouette) = match &job.source {
            SpatialMaskSource::Coverage => (0.0, pipeline.blank.clone(), None),
            SpatialMaskSource::Silhouette(silhouette) => {
                (1.0, pipeline.blank.clone(), Some(silhouette))
            }
            SpatialMaskSource::Texture(handle) => match gpu_images.get(handle) {
                Some(image) => (2.0, raw_view(image), None),
                None => return true,
            },
        };
        let count = (job.layers.len() as u32 / (LAYER_TEXELS * 4)).max(1);
        let layers = data_texture(
            &device,
            &queue,
            "spatial_mask_layers",
            TextureFormat::Rgba32Float,
            [LAYER_TEXELS, count],
            &job.layers
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect::<Vec<u8>>(),
        );
        let rows = (job.alpha.len() as u32).div_ceil(ALPHA_WIDTH).max(1);
        let mut alpha = job.alpha.clone();
        alpha.resize((ALPHA_WIDTH * rows) as usize, 0);
        let alpha = data_texture(
            &device,
            &queue,
            "spatial_mask_alpha",
            TextureFormat::R8Unorm,
            [ALPHA_WIDTH, rows],
            &alpha,
        );
        let [shape, radii, geometry] = silhouette.map_or([Vec4::ZERO; 3], silhouette_vectors);
        let mut buffer = UniformBuffer::from(SpatialMaskUniform {
            sizes: Vec4::new(
                job.size[0] as f32,
                job.size[1] as f32,
                job.mask_size[0] as f32,
                job.mask_size[1] as f32,
            ),
            source: Vec4::new(kind, count as f32, 0.0, 0.0),
            shape,
            radii,
            geometry,
        });
        buffer.write_buffer(&device, &queue);
        let Some(binding) = buffer.binding() else {
            return true;
        };
        let bind_group = device.create_bind_group(
            "spatial_mask",
            &layout,
            &BindGroupEntries::sequential((binding, &layers, &alpha, &source)),
        );
        pass(
            &mut ctx,
            "spatial_mask",
            &raw_view(target),
            render_pipeline,
            &bind_group,
        );
        false
    });
    Ok(())
}
