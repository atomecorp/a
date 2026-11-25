//! The scene3d pass on Bevy's own wgpu device: the main world's jobs
//! (`frame.rs`) are taken in the extract, and drawn before the frame's cameras straight into the quad's
//! `Rgba8UnormSrgb` image, with a depth buffer of the image's size. Meshes and textures are uploaded once per
//! source; only the uniforms change from one frame of a scene to the next.

use std::collections::HashMap;

use bevy::{
    core_pipeline::schedule::camera_driver,
    image::Image,
    prelude::*,
    render::{
        ExtractSchedule, MainWorld, RenderApp,
        render_asset::RenderAssets,
        render_resource::{
            BindGroup, CommandEncoderDescriptor, Extent3d,
            IndexFormat, LoadOp, Operations, RenderPassColorAttachment,
            RenderPassDepthStencilAttachment, RenderPassDescriptor, StoreOp, TextureDescriptor,
            TextureDimension, TextureFormat, TextureUsages, TextureView, TextureViewDescriptor,
        },
        renderer::{RenderDevice, RenderGraph, RenderGraphSystems, RenderQueue},
        texture::GpuImage,
    },
};

use super::{
    Scene3dJobs,
    frame::Scene3dJob,
    pipeline::{
        DEPTH_FORMAT, DRAW_BYTES, FRAME_BYTES, GpuMesh, Scene3dPipeline, uniform_binding,
        upload_mesh,
    },
};
use crate::{frame_uniforms::FrameUniforms, types::AtomeRendererDiagnostics};

pub fn add_render_systems(app: &mut App) {
    let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
        return;
    };
    render_app
        .init_resource::<Scene3dGpu>()
        .add_systems(ExtractSchedule, extract_scene3d_jobs)
        .add_systems(
            RenderGraph,
            draw_scene3d_jobs
                .in_set(RenderGraphSystems::Render)
                .before(camera_driver),
        );
}

struct GpuScene {
    meshes: Vec<GpuMesh>,
    textures: Vec<BindGroup>,
}

struct DepthTarget {
    view: TextureView,
    size: [u32; 2],
}

#[derive(Resource, Default)]
struct Scene3dGpu {
    pipeline: Option<Scene3dPipeline>,
    scenes: HashMap<String, GpuScene>,
    depths: HashMap<AssetId<Image>, DepthTarget>,
    uniforms: FrameUniforms<AssetId<Image>>,
    pending: Vec<Scene3dJob>,
    error: Option<String>,
}

/// Takes the latest job of each image and tells the main world how many still wait for their GPU image.
fn extract_scene3d_jobs(mut main_world: ResMut<MainWorld>, mut gpu: ResMut<Scene3dGpu>) {
    let jobs = std::mem::take(&mut main_world.resource_mut::<Scene3dJobs>().jobs);
    for job in jobs {
        gpu.pending.retain(|pending| pending.image != job.image);
        gpu.pending.push(job);
    }
    {
        let images = main_world.resource::<Assets<Image>>();
        gpu.pending.retain(|job| images.contains(job.image));
        gpu.depths.retain(|image, _| images.contains(*image));
    }
    let waiting = gpu.pending.len();
    main_world.resource_mut::<Scene3dJobs>().gpu_waiting = waiting;
    if let Some(error) = gpu.error.take() {
        main_world
            .resource_mut::<AtomeRendererDiagnostics>()
            .last_error = Some(error);
    }
}

fn depth_target(device: &RenderDevice, size: [u32; 2]) -> DepthTarget {
    let texture = device.create_texture(&TextureDescriptor {
        label: Some("scene3d_depth"),
        size: Extent3d {
            width: size[0],
            height: size[1],
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: TextureDimension::D2,
        format: DEPTH_FORMAT,
        usage: TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    DepthTarget {
        view: texture.create_view(&TextureViewDescriptor::default()),
        size,
    }
}

fn upload_scene(
    device: &RenderDevice,
    queue: &RenderQueue,
    pipeline: &Scene3dPipeline,
    job: &Scene3dJob,
) -> GpuScene {
    GpuScene {
        meshes: job
            .scene
            .meshes
            .iter()
            .map(|mesh| upload_mesh(device, mesh))
            .collect(),
        textures: job
            .scene
            .textures
            .iter()
            .map(|texture| pipeline.texture(device, queue, texture))
            .collect(),
    }
}

/// Where the first draw's uniforms start: after the frame's, at the device's offset alignment.
fn first_draw_offset(stride: u64) -> u64 {
    FRAME_BYTES.div_ceil(stride) * stride
}

/// The frame's uniforms then each draw's, one stride apart.
fn uniform_bytes(job: &Scene3dJob, stride: u64) -> Vec<u8> {
    let first = first_draw_offset(stride) as usize;
    let stride = stride as usize;
    let mut bytes = vec![0u8; first + stride * job.draws.len().max(1)];
    let mut write = |at: usize, values: &[f32]| {
        for (index, value) in values.iter().enumerate() {
            bytes[at + index * 4..at + index * 4 + 4].copy_from_slice(&value.to_le_bytes());
        }
    };
    write(0, &job.frame);
    for (index, draw) in job.draws.iter().enumerate() {
        write(first + stride * index, &draw.uniform);
    }
    bytes
}

fn draw_scene3d_jobs(
    mut gpu: ResMut<Scene3dGpu>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    device: Res<RenderDevice>,
    queue: Res<RenderQueue>,
) {
    if gpu.pending.is_empty() {
        return;
    }
    let gpu = &mut *gpu;
    let pipeline = gpu
        .pipeline
        .get_or_insert_with(|| Scene3dPipeline::new(&device, &queue));
    let mut encoder = device.create_command_encoder(&CommandEncoderDescriptor {
        label: Some("scene3d_pass"),
    });
    let mut waiting = Vec::new();
    for job in std::mem::take(&mut gpu.pending) {
        let Some(image) = gpu_images.get(job.image) else {
            waiting.push(job);
            continue;
        };
        let descriptor = &image.texture_descriptor;
        let size = [descriptor.size.width, descriptor.size.height];
        if size != job.size || descriptor.format != TextureFormat::Rgba8UnormSrgb {
            // The image was resized after the job was made: the main world sends the new size's job.
            continue;
        }
        let depth = gpu
            .depths
            .entry(job.image)
            .and_modify(|depth| {
                if depth.size != size {
                    *depth = depth_target(&device, size);
                }
            })
            .or_insert_with(|| depth_target(&device, size));
        let scene = gpu
            .scenes
            .entry(job.source.clone())
            .or_insert_with(|| upload_scene(&device, &queue, pipeline, &job));
        let uniforms = &gpu.uniforms.write(
            &device,
            &queue,
            job.image,
            "scene3d_uniforms",
            &[&uniform_bytes(&job, pipeline.stride)],
        )[0];
        let frame_group = device.create_bind_group(
            "scene3d_frame",
            &pipeline.frame_layout,
            &[
                uniform_binding(0, uniforms, FRAME_BYTES),
                uniform_binding(1, uniforms, DRAW_BYTES),
            ],
        );
        let mut pass = encoder.begin_render_pass(&RenderPassDescriptor {
            label: Some("scene3d_pass"),
            color_attachments: &[Some(RenderPassColorAttachment {
                view: &image.texture_view,
                depth_slice: None,
                resolve_target: None,
                ops: Operations {
                    load: LoadOp::Clear(LinearRgba::NONE.into()),
                    store: StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(RenderPassDepthStencilAttachment {
                view: &depth.view,
                depth_ops: Some(Operations {
                    load: LoadOp::Clear(0.0),
                    store: StoreOp::Discard,
                }),
                stencil_ops: None,
            }),
            ..Default::default()
        });
        pass.set_pipeline(&pipeline.pipeline);
        for (index, draw) in job.draws.iter().enumerate() {
            let Some(mesh) = scene.meshes.get(draw.mesh) else {
                gpu.error = Some(format!("bevy_scene3d_mesh_missing:{}", draw.mesh));
                continue;
            };
            let texture = draw
                .texture
                .and_then(|texture| scene.textures.get(texture))
                .unwrap_or(&pipeline.white);
            let offset = first_draw_offset(pipeline.stride) + pipeline.stride * index as u64;
            pass.set_bind_group(0, &*frame_group, &[offset as u32]);
            pass.set_bind_group(1, &**texture, &[]);
            pass.set_vertex_buffer(0, (*mesh.vertices).slice(..));
            pass.set_index_buffer((*mesh.indices).slice(..), IndexFormat::Uint32);
            pass.draw_indexed(0..mesh.count, 0, 0..1);
        }
    }
    queue.submit([encoder.finish()]);
    gpu.pending = waiting;
}
