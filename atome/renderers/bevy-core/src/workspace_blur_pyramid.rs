//! Builds the backdrop blur pyramid with one render pass per mip level.
//!
//! Bevy's single-pass downsampler binds six storage textures per compute pass.
//! WebGPU only guarantees four (`maxStorageTexturesPerShaderStage`), and the
//! A12-class iPad exposes exactly that minimum: the pipeline failed validation,
//! Bevy's default `RenderErrorHandler` quit the app, and the canvas stayed grey.
//! Colour attachments and one sampled texture binding are available on every
//! WebGPU adapter, so this chain renders the same 2x2 box-filtered pyramid
//! without any storage binding.
//!
//! One chain per pyramid: the workspace backdrop's, and the pyramid of every
//! capture camera that carries a [`BlurCapture`] (the Mystic plates' background).
use bevy::{
    asset::{load_internal_asset, uuid_handle},
    core_pipeline::FullscreenShader,
    ecs::system::SystemParam,
    platform::collections::HashMap,
    prelude::*,
    render::{
        Render, RenderApp, RenderStartup, RenderSystems,
        extract_component::ExtractComponent,
        render_asset::RenderAssets,
        render_resource::{
            BindGroup, BindGroupEntries, BindGroupLayoutDescriptor, BindGroupLayoutEntries,
            CachedPipelineState, CachedRenderPipelineId, ColorTargetState, ColorWrites,
            FragmentState, LoadOp, Operations, PipelineCache, RenderPassColorAttachment,
            RenderPassDescriptor, RenderPipelineDescriptor, ShaderStages, StoreOp, TextureFormat,
            TextureSampleType, TextureView, TextureViewDescriptor, TextureViewId,
            binding_types::texture_2d,
        },
        renderer::{RenderContext, RenderDevice},
        texture::GpuImage,
    },
    shader::{Shader, ShaderCacheError},
};

use crate::workspace_backdrop::AtomeWorkspaceBackdrop;

const BACKDROP_DOWNSAMPLE_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("5d0f1c64-37b2-4f0e-9a8e-2c6b7e41d913");
/// The capture and the pyramid share this linear format (see `workspace_backdrop`).
const PYRAMID_FORMAT: TextureFormat = TextureFormat::Rgba8Unorm;

#[derive(Resource)]
struct DownsamplePipeline {
    layout: BindGroupLayoutDescriptor,
    pipeline: CachedRenderPipelineId,
}

/// A capture camera whose image is reduced into a blur pyramid each time it
/// renders: the camera draws `capture` (mip 0 cannot be a camera target of a
/// mipmapped texture), the chain copies it into `pyramid` and builds its levels.
#[derive(Component, Clone, ExtractComponent)]
pub struct BlurCapture {
    pub capture: Handle<Image>,
    pub pyramid: Handle<Image>,
}

/// One pyramid's views and bind groups, rebuilt only when its texture changes.
struct PyramidChain {
    pyramid: TextureViewId,
    levels: Vec<(TextureView, BindGroup)>,
}

/// Every live pyramid's chain, by image.
#[derive(Resource, Default)]
struct PyramidChains(HashMap<AssetId<Image>, PyramidChain>);

pub(super) fn install(app: &mut App) {
    load_internal_asset!(
        app,
        BACKDROP_DOWNSAMPLE_SHADER_HANDLE,
        "assets/shaders/backdrop_downsample.wgsl",
        Shader::from_wgsl
    );
    let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
        return;
    };
    render_app
        .init_resource::<PyramidChains>()
        .add_systems(RenderStartup, init_downsample_pipeline)
        .add_systems(
            Render,
            prepare_pyramid_chain.in_set(RenderSystems::PrepareBindGroups),
        );
}

fn init_downsample_pipeline(
    mut commands: Commands,
    fullscreen: Res<FullscreenShader>,
    cache: Res<PipelineCache>,
) {
    let layout = BindGroupLayoutDescriptor::new(
        "backdrop_downsample_layout",
        &BindGroupLayoutEntries::single(
            ShaderStages::FRAGMENT,
            texture_2d(TextureSampleType::Float { filterable: false }),
        ),
    );
    let pipeline = cache.queue_render_pipeline(RenderPipelineDescriptor {
        label: Some("backdrop_downsample".into()),
        layout: vec![layout.clone()],
        vertex: fullscreen.to_vertex_state(),
        fragment: Some(FragmentState {
            shader: BACKDROP_DOWNSAMPLE_SHADER_HANDLE,
            targets: vec![Some(ColorTargetState {
                format: PYRAMID_FORMAT,
                blend: None,
                write_mask: ColorWrites::ALL,
            })],
            ..default()
        }),
        ..default()
    });
    commands.insert_resource(DownsamplePipeline { layout, pipeline });
}

fn single_level_view(image: &GpuImage, level: u32) -> TextureView {
    image.texture.create_view(&TextureViewDescriptor {
        label: Some("backdrop_pyramid_level"),
        base_mip_level: level,
        mip_level_count: Some(1),
        ..default()
    })
}

fn prepare_pyramid_chain(
    backdrop: Res<AtomeWorkspaceBackdrop>,
    captures: Query<&BlurCapture>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    device: Res<RenderDevice>,
    cache: Res<PipelineCache>,
    pipeline: Option<Res<DownsamplePipeline>>,
    mut chains: ResMut<PyramidChains>,
) {
    let Some(pipeline) = pipeline else {
        return;
    };
    let live: Vec<AssetId<Image>> = std::iter::once(backdrop.image.id())
        .chain(captures.iter().map(|capture| capture.pyramid.id()))
        .collect();
    chains.0.retain(|id, _| live.contains(id));
    let layout = cache.get_bind_group_layout(&pipeline.layout);
    for id in live {
        let Some(pyramid) = gpu_images.get(id) else {
            continue;
        };
        if chains
            .0
            .get(&id)
            .is_some_and(|chain| chain.pyramid == pyramid.texture_view.id())
        {
            continue;
        }
        let levels = (1..pyramid.texture_descriptor.mip_level_count)
            .map(|level| {
                let source = single_level_view(pyramid, level - 1);
                let bind_group = device.create_bind_group(
                    "backdrop_downsample_level",
                    &layout,
                    &BindGroupEntries::single(&source),
                );
                (single_level_view(pyramid, level), bind_group)
            })
            .collect();
        chains.0.insert(
            id,
            PyramidChain {
                pyramid: pyramid.texture_view.id(),
                levels,
            },
        );
    }
}

/// Render-world access to the chain for the systems that write mip 0.
#[derive(SystemParam)]
pub(crate) struct BlurPyramid<'w> {
    pipeline: Option<Res<'w, DownsamplePipeline>>,
    cache: Res<'w, PipelineCache>,
    chains: Res<'w, PyramidChains>,
}

impl BlurPyramid<'_> {
    /// Whether the chain can run this frame. Pending compilation is not an
    /// error; a genuine shader failure is reported instead of skipping the blur.
    pub(crate) fn ready(&self, pyramid: AssetId<Image>) -> Result<bool, BevyError> {
        let Some(pipeline) = &self.pipeline else {
            return Ok(false);
        };
        match self.cache.get_render_pipeline_state(pipeline.pipeline) {
            CachedPipelineState::Ok(_) => Ok(self.chains.0.contains_key(&pyramid)),
            CachedPipelineState::Queued
            | CachedPipelineState::Creating(_)
            | CachedPipelineState::Err(
                ShaderCacheError::ShaderNotLoaded(_)
                | ShaderCacheError::ShaderImportNotYetAvailable,
            ) => Ok(false),
            CachedPipelineState::Err(error) => {
                Err(format!("backdrop_downsample_pipeline_failed: {error}").into())
            }
        }
    }

    /// Renders mip levels 1..N of `pyramid` from its mip 0, which the caller has just written.
    pub(crate) fn downsample(
        &self,
        ctx: &mut RenderContext,
        pyramid: AssetId<Image>,
    ) -> Result<(), BevyError> {
        let pipeline = self
            .pipeline
            .as_ref()
            .ok_or("backdrop_downsample_pipeline_unavailable")?;
        let render_pipeline = self
            .cache
            .get_render_pipeline(pipeline.pipeline)
            .ok_or("backdrop_downsample_pipeline_unavailable")?;
        let chain = self
            .chains
            .0
            .get(&pyramid)
            .ok_or("backdrop_downsample_chain_unavailable")?;
        for (target, bind_group) in &chain.levels {
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
                    label: Some("backdrop_downsample_level"),
                    color_attachments: &attachments,
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
            pass.set_pipeline(render_pipeline);
            pass.set_bind_group(0, bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
        Ok(())
    }

    /// Copies `capture` (just written by its camera) into mip 0 of `pyramid`,
    /// then renders the pyramid's levels.
    pub(crate) fn reduce_capture(
        &self,
        ctx: &mut RenderContext,
        gpu_images: &RenderAssets<GpuImage>,
        capture: AssetId<Image>,
        pyramid: AssetId<Image>,
    ) -> Result<(), BevyError> {
        let (Some(source), Some(target)) = (gpu_images.get(capture), gpu_images.get(pyramid))
        else {
            return Ok(());
        };
        ctx.command_encoder().copy_texture_to_texture(
            source.texture.as_image_copy(),
            target.texture.as_image_copy(),
            source.texture_descriptor.size,
        );
        self.downsample(ctx, pyramid)
    }
}
