//! A shape's mask drawn on the GPU (Rust-first step 5, item 2 of its follow-up).
//!
//! The CPU walked every texel of a star's or a polygon's box through its signed distance: about
//! 0.2 ms per star and per frame on the Mac while it was resized (a new size is a new mask), about
//! five times that on the A12Z. The texture contract is unchanged — the box rounded up, white, the
//! coverage `clamp(0.5 - distance)` at each texel centre as alpha, sRGB bytes — only its pixels are
//! now written by one fragment pass (`shape_silhouette.wgsl`, the distances of `shape_sdf.rs`) before
//! any camera draws and before the shadows are blurred from it (`shape_shadow_gpu.rs`). A spatial mask is drawn by
//! its own pass in the same set (`spatial_mask_gpu.rs`); a painted surface is still painted on the CPU.
use bevy::{
    asset::{RenderAssetUsages, load_internal_asset, uuid_handle},
    core_pipeline::{FullscreenShader, schedule::camera_driver},
    image::ImageSampler,
    prelude::*,
    render::{
        ExtractSchedule, MainWorld, RenderApp, RenderStartup,
        render_asset::RenderAssets,
        render_resource::{
            BindGroupEntries, BindGroupLayoutDescriptor, BindGroupLayoutEntries,
            CachedRenderPipelineId, ColorTargetState, ColorWrites, Extent3d, FragmentState,
            PipelineCache, RenderPipelineDescriptor, ShaderStages, ShaderType, TextureDimension,
            TextureUsages, UniformBuffer, binding_types::uniform_buffer,
        },
        renderer::{RenderContext, RenderDevice, RenderGraph, RenderGraphSystems, RenderQueue},
        texture::GpuImage,
    },
    shader::Shader,
};

use crate::{
    shape_sdf::{AtomeShapeSilhouette, AtomeShapeVariant},
    shape_shadow_gpu::{SHADOW_FORMAT, pass, pipelines_ready},
};

const SHAPE_MASK_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("4c7f2a8e-0b1d-4e6a-9f3c-5d2e8a1b7c60");
const SHAPE_SDF_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("c9fe5eea-1f46-4114-8067-08d597e54949");

#[derive(Clone, Copy, Debug, Default, ShaderType)]
struct ShapeMaskUniform {
    shape: Vec4,
    radii: Vec4,
    geometry: Vec4,
    phase: Vec4,
}

/// One mask to draw: its texture, the silhouette it covers and the phase (0..1 texel on each axis)
/// its texel centres are moved by.
#[derive(Clone, Debug)]
pub(crate) struct ShapeMaskJob {
    pub target: Handle<Image>,
    pub silhouette: AtomeShapeSilhouette,
    pub phase: [f32; 2],
}

/// The masks described this frame, taken by the render world at extraction.
#[derive(Resource, Default)]
pub(crate) struct ShapeMaskQueue(pub Vec<ShapeMaskJob>);

/// The masks the render world has not drawn yet: a shadow made of them waits for them.
#[derive(Resource, Default, Deref)]
pub(crate) struct PendingShapeMasks(Vec<ShapeMaskJob>);

/// The pass drawing the masks, run before the shadows blurred from them.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ShapeMaskDraw;

#[derive(Resource)]
struct ShapeMaskPipeline {
    layout: BindGroupLayoutDescriptor,
    id: CachedRenderPipelineId,
}

/// A silhouette as the shaders read it (`shape_sdf.wgsl#Silhouette`): its box, variant and vertex rounding, its
/// corner radii, its star and polygon settings.
pub(crate) fn silhouette_vectors(silhouette: &AtomeShapeSilhouette) -> [Vec4; 3] {
    let geometry = silhouette.geometry;
    let variant = match geometry.variant {
        AtomeShapeVariant::Square => 0.0,
        AtomeShapeVariant::Circle => 1.0,
        AtomeShapeVariant::Star => 2.0,
        AtomeShapeVariant::Polygon => 3.0,
    };
    [
        Vec4::new(
            silhouette.width,
            silhouette.height,
            variant,
            silhouette.vertex_rounding(),
        ),
        Vec4::from_array(silhouette.corner_radii),
        Vec4::new(
            geometry.star_branches as f32,
            geometry.star_inner_radius,
            geometry.polygon_sides as f32,
            0.0,
        ),
    ]
}

fn uniform(job: &ShapeMaskJob) -> ShapeMaskUniform {
    let [shape, radii, geometry] = silhouette_vectors(&job.silhouette);
    ShapeMaskUniform {
        shape,
        radii,
        geometry,
        phase: Vec4::new(job.phase[0], job.phase[1], 0.0, 0.0),
    }
}

/// The texture of `silhouette`'s mask, its texel `i` covering `i + 0.5 + phase`; an axis moved by a
/// phase holds one texel more. The GPU writes it before anything samples it.
pub(crate) fn queue_shape_mask(
    world: &mut World,
    silhouette: &AtomeShapeSilhouette,
    phase: [f32; 2],
) -> Result<Handle<Image>, String> {
    let width = silhouette.width.ceil().max(1.0) as u32 + u32::from(phase[0] > 0.0);
    let height = silhouette.height.ceil().max(1.0) as u32 + u32::from(phase[1] > 0.0);
    let mut image = Image::new_uninit(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        SHADOW_FORMAT,
        RenderAssetUsages::RENDER_WORLD,
    );
    image.texture_descriptor.usage =
        TextureUsages::TEXTURE_BINDING | TextureUsages::RENDER_ATTACHMENT;
    image.sampler = ImageSampler::linear();
    let target = world
        .get_resource_mut::<Assets<Image>>()
        .ok_or_else(|| "bevy_image_assets_required".to_string())?
        .add(image);
    world
        .get_resource_or_insert_with(ShapeMaskQueue::default)
        .0
        .push(ShapeMaskJob {
            target: target.clone(),
            silhouette: *silhouette,
            phase,
        });
    Ok(target)
}

pub struct ShapeMaskGpuPlugin;

impl Plugin for ShapeMaskGpuPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ShapeMaskQueue>();
        // The signed distances every silhouette pass imports (`atome::shape_sdf`).
        load_internal_asset!(
            app,
            SHAPE_SDF_SHADER_HANDLE,
            "assets/shaders/shape_sdf.wgsl",
            Shader::from_wgsl
        );
        load_internal_asset!(
            app,
            SHAPE_MASK_SHADER_HANDLE,
            "assets/shaders/shape_silhouette.wgsl",
            Shader::from_wgsl
        );
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
            return;
        };
        render_app
            .init_resource::<PendingShapeMasks>()
            .add_systems(RenderStartup, init_pipeline)
            .add_systems(ExtractSchedule, extract_shape_masks)
            .add_systems(
                RenderGraph,
                draw_shape_masks
                    .in_set(RenderGraphSystems::Render)
                    .in_set(ShapeMaskDraw)
                    .before(camera_driver),
            );
    }
}

fn init_pipeline(
    mut commands: Commands,
    fullscreen: Res<FullscreenShader>,
    cache: Res<PipelineCache>,
) {
    let layout = BindGroupLayoutDescriptor::new(
        "shape_mask_layout",
        &BindGroupLayoutEntries::single(
            ShaderStages::FRAGMENT,
            uniform_buffer::<ShapeMaskUniform>(false),
        ),
    );
    let id = cache.queue_render_pipeline(RenderPipelineDescriptor {
        label: Some("shape_mask".into()),
        layout: vec![layout.clone()],
        vertex: fullscreen.to_vertex_state(),
        fragment: Some(FragmentState {
            shader: SHAPE_MASK_SHADER_HANDLE,
            entry_point: Some("coverage_pass".into()),
            targets: vec![Some(ColorTargetState {
                format: SHADOW_FORMAT,
                blend: None,
                write_mask: ColorWrites::ALL,
            })],
            ..default()
        }),
        ..default()
    });
    commands.insert_resource(ShapeMaskPipeline { layout, id });
}

fn extract_shape_masks(mut main_world: ResMut<MainWorld>, mut pending: ResMut<PendingShapeMasks>) {
    if let Some(mut queue) = main_world.get_resource_mut::<ShapeMaskQueue>() {
        pending.0.append(&mut queue.0);
    }
}

fn draw_shape_masks(
    mut pending: ResMut<PendingShapeMasks>,
    pipeline: Option<Res<ShapeMaskPipeline>>,
    cache: Res<PipelineCache>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    device: Res<RenderDevice>,
    queue: Res<RenderQueue>,
    mut ctx: RenderContext,
) -> Result<(), BevyError> {
    let Some(pipeline) = pipeline else {
        return Ok(());
    };
    if pending.0.is_empty() || !pipelines_ready(&cache, &[pipeline.id], "shape_mask")? {
        return Ok(());
    }
    let Some(render_pipeline) = cache.get_render_pipeline(pipeline.id) else {
        return Ok(());
    };
    let layout = cache.get_bind_group_layout(&pipeline.layout);
    // A mask whose texture the GPU does not hold yet waits for a later frame.
    pending.0.retain(|job| {
        let Some(target) = gpu_images.get(&job.target) else {
            return true;
        };
        let mut buffer = UniformBuffer::from(uniform(job));
        buffer.write_buffer(&device, &queue);
        let Some(binding) = buffer.binding() else {
            return true;
        };
        let bind_group =
            device.create_bind_group("shape_mask", &layout, &BindGroupEntries::single(binding));
        pass(
            &mut ctx,
            "shape_mask",
            &target.texture_view,
            render_pipeline,
            &bind_group,
        );
        false
    });
    Ok(())
}

#[cfg(test)]
#[path = "../../../../tests/rendering/shape_mask_gpu_twin.rs"]
pub(crate) mod twin;
