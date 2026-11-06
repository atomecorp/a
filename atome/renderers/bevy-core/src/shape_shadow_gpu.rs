//! A silhouette's drop shadow blurred on the GPU (Rust-first step 5, item 2).
//!
//! The CPU gaussian cost about 0.75 ms per shape and per frame on the Mac while a shadowed
//! shape was resized (12 shapes: 9 ms; 12 stars: 35 ms), about five times that on the A12Z.
//! Here the main world only describes the shadow: its texture (an empty render target, cached
//! per shape, size and style by `shape_shadow_cache.rs` exactly as the CPU texture was) and
//! the masks it is made of — the grown silhouette's and the owner's, both the shape's own
//! masks from `shape_texture.rs`'s cache, so a shape that already paints a mask pays nothing
//! more. The render world blurs them in two fragment passes before any camera draws
//! (`shape_shadow_blur.wgsl`): no storage texture, so the A12Z's four-per-stage limit stays
//! free. The sprite, its crop by a clip, its fades and its render layers read the same
//! texture as before.
use bevy::{
    asset::{RenderAssetUsages, load_internal_asset, uuid_handle},
    core_pipeline::{FullscreenShader, schedule::camera_driver},
    prelude::*,
    render::{
        ExtractSchedule, MainWorld, RenderApp, RenderStartup,
        render_asset::RenderAssets,
        render_resource::{
            BindGroupEntries, BindGroupLayoutDescriptor, BindGroupLayoutEntries,
            CachedPipelineState, CachedRenderPipelineId, ColorTargetState, ColorWrites, Extent3d,
            FragmentState, LoadOp, Operations, PipelineCache, RenderPassColorAttachment,
            RenderPassDescriptor, RenderPipelineDescriptor, ShaderStages, ShaderType, StoreOp,
            TextureDescriptor, TextureDimension, TextureFormat, TextureSampleType, TextureUsages,
            TextureView, TextureViewDescriptor, UniformBuffer,
            binding_types::{texture_2d, uniform_buffer},
        },
        renderer::{RenderContext, RenderDevice, RenderGraph, RenderGraphSystems, RenderQueue},
        texture::GpuImage,
    },
    shader::{Shader, ShaderCacheError},
};

const SHADOW_BLUR_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("791d43f0-2290-420c-8201-82b55d8e313a");
/// The first pass's result: one channel, kept in half floats so the second pass sums unrounded values.
const INTERMEDIATE_FORMAT: TextureFormat = TextureFormat::R16Float;
/// The shadow's texture, the format the CPU shadow had (its colour bytes read as sRGB).
pub(crate) const SHADOW_FORMAT: TextureFormat = TextureFormat::Rgba8UnormSrgb;

#[derive(Clone, Copy, Debug, Default, ShaderType)]
pub(crate) struct ShadowBlurUniform {
    /// Along x then along y: the mask's margin inside the shadow (texels), sigma, taps on each side, 1 / the kernel's sum.
    pub horizontal: Vec4,
    pub vertical: Vec4,
    pub owner: Vec4,
    pub color: Vec4,
}

/// One shadow to blur: its texture and the masks it is made of. The handles are strong, so a
/// shadow dropped from its cache before the GPU wrote it still lives until it is written.
#[derive(Clone, Debug)]
pub(crate) struct ShadowBlurJob {
    pub target: Handle<Image>,
    pub silhouette: Handle<Image>,
    pub owner: Handle<Image>,
    pub uniform: ShadowBlurUniform,
}

/// The shadows described this frame, taken by the render world at extraction.
#[derive(Resource, Default)]
pub(crate) struct ShadowBlurQueue(pub Vec<ShadowBlurJob>);

#[derive(Resource, Default)]
struct PendingShadowBlurs(Vec<ShadowBlurJob>);

#[derive(Resource)]
struct ShadowBlurPipelines {
    layout: BindGroupLayoutDescriptor,
    horizontal: CachedRenderPipelineId,
    vertical: CachedRenderPipelineId,
}

/// One axis of the gaussian: `blur` in texels of that axis (CPU: `gaussian_kernel`), the mask laid
/// `margin` texels inside the shadow.
fn axis_kernel(margin: u32, blur: f32) -> Vec4 {
    let sigma = blur.max(0.0) * crate::shadow_texture::GAUSSIAN_SIGMA_RATIO;
    // No blur: the mask itself, its half-pixel ramp being the contour's antialiasing (as on the CPU).
    let (sigma, radius) = if sigma > 0.0 {
        (sigma, crate::shadow_texture::shadow_padding(blur))
    } else {
        (1.0, 0)
    };
    let total: f32 = (-(radius as i32)..=radius as i32)
        .map(|tap| (-0.5 * (tap as f32 / sigma).powi(2)).exp())
        .sum();
    Vec4::new(margin as f32, sigma, radius as f32, 1.0 / total)
}

/// The uniform of a shadow whose mask lies `margins` texels inside it, blurred by `blurs` texels
/// on each axis, and whose owner's mask texel `owner_shift` (whole texels) lies under its texel 0.
pub(crate) fn shadow_blur_uniform(
    margins: [u32; 2],
    blurs: [f32; 2],
    owner_shift: [f32; 2],
    color: [f32; 4],
) -> ShadowBlurUniform {
    let linear = Color::srgba(color[0], color[1], color[2], color[3]).to_linear();
    ShadowBlurUniform {
        horizontal: axis_kernel(margins[0], blurs[0]),
        vertical: axis_kernel(margins[1], blurs[1]),
        owner: Vec4::new(owner_shift[0], owner_shift[1], 0.0, 0.0),
        color: Vec4::new(linear.red, linear.green, linear.blue, color[3]),
    }
}

/// The empty texture the GPU writes the shadow into.
pub(crate) fn shadow_target_image(width: u32, height: u32) -> Image {
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
    image
}

pub(crate) fn queue_shadow_blur(world: &mut World, job: ShadowBlurJob) {
    world
        .get_resource_or_insert_with(ShadowBlurQueue::default)
        .0
        .push(job);
}

pub struct ShapeShadowGpuPlugin;

impl Plugin for ShapeShadowGpuPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ShadowBlurQueue>();
        load_internal_asset!(
            app,
            SHADOW_BLUR_SHADER_HANDLE,
            "assets/shaders/shape_shadow_blur.wgsl",
            Shader::from_wgsl
        );
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
            return;
        };
        render_app
            .init_resource::<PendingShadowBlurs>()
            .add_systems(RenderStartup, init_pipelines)
            .add_systems(ExtractSchedule, extract_shadow_blurs)
            .add_systems(
                RenderGraph,
                blur_shadows
                    .in_set(RenderGraphSystems::Render)
                    .after(crate::shape_mask_gpu::ShapeMaskDraw)
                    .before(camera_driver),
            );
    }
}

fn init_pipelines(
    mut commands: Commands,
    fullscreen: Res<FullscreenShader>,
    cache: Res<PipelineCache>,
) {
    let layout = BindGroupLayoutDescriptor::new(
        "shape_shadow_blur_layout",
        &BindGroupLayoutEntries::sequential(
            ShaderStages::FRAGMENT,
            (
                texture_2d(TextureSampleType::Float { filterable: false }),
                texture_2d(TextureSampleType::Float { filterable: false }),
                uniform_buffer::<ShadowBlurUniform>(false),
            ),
        ),
    );
    let pipeline = |label: &'static str, entry: &'static str, format: TextureFormat| {
        cache.queue_render_pipeline(RenderPipelineDescriptor {
            label: Some(label.into()),
            layout: vec![layout.clone()],
            vertex: fullscreen.to_vertex_state(),
            fragment: Some(FragmentState {
                shader: SHADOW_BLUR_SHADER_HANDLE,
                entry_point: Some(entry.into()),
                targets: vec![Some(ColorTargetState {
                    format,
                    blend: None,
                    write_mask: ColorWrites::ALL,
                })],
                ..default()
            }),
            ..default()
        })
    };
    let horizontal = pipeline(
        "shape_shadow_blur_horizontal",
        "blur_horizontal",
        INTERMEDIATE_FORMAT,
    );
    let vertical = pipeline("shape_shadow_blur_vertical", "blur_vertical", SHADOW_FORMAT);
    commands.insert_resource(ShadowBlurPipelines {
        layout,
        horizontal,
        vertical,
    });
}

fn extract_shadow_blurs(
    mut main_world: ResMut<MainWorld>,
    mut pending: ResMut<PendingShadowBlurs>,
) {
    if let Some(mut queue) = main_world.get_resource_mut::<ShadowBlurQueue>() {
        pending.0.append(&mut queue.0);
    }
}

/// Whether every pass can run. Compilation under way waits; a genuine shader failure is reported.
pub(crate) fn pipelines_ready(
    cache: &PipelineCache,
    ids: &[CachedRenderPipelineId],
    name: &str,
) -> Result<bool, BevyError> {
    for id in ids {
        match cache.get_render_pipeline_state(*id) {
            CachedPipelineState::Ok(_) => {}
            CachedPipelineState::Queued
            | CachedPipelineState::Creating(_)
            | CachedPipelineState::Err(
                ShaderCacheError::ShaderNotLoaded(_)
                | ShaderCacheError::ShaderImportNotYetAvailable,
            ) => return Ok(false),
            CachedPipelineState::Err(error) => {
                return Err(format!("{name}_pipeline_failed: {error}").into());
            }
        }
    }
    Ok(true)
}

/// One fullscreen draw into `target`, cleared first.
pub(crate) fn pass(
    ctx: &mut RenderContext,
    label: &'static str,
    target: &TextureView,
    pipeline: &bevy::render::render_resource::RenderPipeline,
    bind_group: &bevy::render::render_resource::BindGroup,
) {
    let attachments = [Some(RenderPassColorAttachment {
        view: target,
        resolve_target: None,
        depth_slice: None,
        ops: Operations {
            load: LoadOp::Clear(default()),
            store: StoreOp::Store,
        },
    })];
    let mut pass = ctx
        .command_encoder()
        .begin_render_pass(&RenderPassDescriptor {
            label: Some(label),
            color_attachments: &attachments,
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, bind_group, &[]);
    pass.draw(0..3, 0..1);
}

fn blur_shadows(
    mut pending: ResMut<PendingShadowBlurs>,
    masks: Res<crate::shape_mask_gpu::PendingShapeMasks>,
    pipelines: Option<Res<ShadowBlurPipelines>>,
    cache: Res<PipelineCache>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    device: Res<RenderDevice>,
    queue: Res<RenderQueue>,
    mut ctx: RenderContext,
) -> Result<(), BevyError> {
    let Some(pipelines) = pipelines else {
        return Ok(());
    };
    // A shadow is blurred from masks the GPU draws: it waits until they are drawn.
    if pending.0.is_empty()
        || !masks.is_empty()
        || !pipelines_ready(
            &cache,
            &[pipelines.horizontal, pipelines.vertical],
            "shape_shadow_blur",
        )?
    {
        return Ok(());
    }
    let (Some(horizontal), Some(vertical)) = (
        cache.get_render_pipeline(pipelines.horizontal),
        cache.get_render_pipeline(pipelines.vertical),
    ) else {
        return Ok(());
    };
    let layout = cache.get_bind_group_layout(&pipelines.layout);
    // A job whose textures the GPU does not hold yet waits for a later frame.
    pending.0.retain(|job| {
        let (Some(target), Some(silhouette), Some(owner)) = (
            gpu_images.get(&job.target),
            gpu_images.get(&job.silhouette),
            gpu_images.get(&job.owner),
        ) else {
            return true;
        };
        let mut uniform = UniformBuffer::from(job.uniform);
        uniform.write_buffer(&device, &queue);
        let Some(binding) = uniform.binding() else {
            return true;
        };
        let intermediate = device.create_texture(&TextureDescriptor {
            label: Some("shape_shadow_blur_intermediate"),
            size: target.texture_descriptor.size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: INTERMEDIATE_FORMAT,
            usage: TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let intermediate_view = intermediate.create_view(&TextureViewDescriptor::default());
        let first = device.create_bind_group(
            "shape_shadow_blur_horizontal",
            &layout,
            &BindGroupEntries::sequential((
                &silhouette.texture_view,
                &owner.texture_view,
                binding.clone(),
            )),
        );
        let second = device.create_bind_group(
            "shape_shadow_blur_vertical",
            &layout,
            &BindGroupEntries::sequential((&intermediate_view, &owner.texture_view, binding)),
        );
        pass(
            &mut ctx,
            "shape_shadow_blur_horizontal",
            &intermediate_view,
            horizontal,
            &first,
        );
        pass(
            &mut ctx,
            "shape_shadow_blur_vertical",
            &target.texture_view,
            vertical,
            &second,
        );
        false
    });
    Ok(())
}

#[cfg(test)]
#[path = "../../../../tests/rendering/shape_shadow_gpu_twin.rs"]
pub(crate) mod twin;
