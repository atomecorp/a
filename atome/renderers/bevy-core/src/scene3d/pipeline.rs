//! The one render pipeline of the scene3d pass (`scene3d.wgsl`) and the GPU copies of a scene: interleaved
//! vertices (position, normal, UV), 32-bit indices, base-colour textures. Within the A12Z's limits: uniform
//! buffers and sampled textures only (no storage texture, no compute), one sample per pixel.

use std::num::NonZeroU64;

use bevy::render::{
    render_resource::{
        AddressMode, BindGroup, BindGroupEntry, BindGroupLayout, BindGroupLayoutEntry,
        BindingResource, BindingType, BlendState, Buffer, BufferBinding, BufferBindingType,
        BufferInitDescriptor, BufferUsages, ColorTargetState, ColorWrites, CompareFunction,
        DepthStencilState, Extent3d, FilterMode, FrontFace, MultisampleState,
        PipelineCompilationOptions, PipelineLayoutDescriptor, PrimitiveState, PrimitiveTopology,
        RawFragmentState, RawRenderPipelineDescriptor, RawVertexBufferLayout, RawVertexState,
        RenderPipeline, Sampler, SamplerBindingType, SamplerDescriptor, ShaderModuleDescriptor,
        ShaderSource, ShaderStages, TextureDataOrder, TextureDescriptor, TextureDimension,
        TextureFormat, TextureSampleType, TextureUsages, TextureViewDescriptor,
        TextureViewDimension, VertexAttribute, VertexFormat, VertexStepMode,
    },
    renderer::{RenderDevice, RenderQueue},
};

use super::frame::{DRAW_FLOATS, FRAME_FLOATS};
use atome_usd::scene::{UsdMesh, UsdTexture};

pub const FRAME_BYTES: u64 = (FRAME_FLOATS * 4) as u64;
pub const DRAW_BYTES: u64 = (DRAW_FLOATS * 4) as u64;
pub const DEPTH_FORMAT: TextureFormat = TextureFormat::Depth32Float;
const VERTEX_FLOATS: usize = 8;

pub struct Scene3dPipeline {
    pub pipeline: RenderPipeline,
    pub frame_layout: BindGroupLayout,
    texture_layout: BindGroupLayout,
    sampler: Sampler,
    /// Bound when a material has no texture: the factor alone.
    pub white: BindGroup,
    /// The distance between two draws' uniforms: the device's uniform offset alignment.
    pub stride: u64,
}

pub struct GpuMesh {
    pub vertices: Buffer,
    pub indices: Buffer,
    pub count: u32,
}

fn uniform_entry(binding: u32, dynamic: bool, size: u64) -> BindGroupLayoutEntry {
    BindGroupLayoutEntry {
        binding,
        visibility: ShaderStages::VERTEX_FRAGMENT,
        ty: BindingType::Buffer {
            ty: BufferBindingType::Uniform,
            has_dynamic_offset: dynamic,
            min_binding_size: NonZeroU64::new(size),
        },
        count: None,
    }
}

pub fn uniform_binding(binding: u32, buffer: &Buffer, size: u64) -> BindGroupEntry<'_> {
    BindGroupEntry {
        binding,
        resource: BindingResource::Buffer(BufferBinding {
            buffer,
            offset: 0,
            size: NonZeroU64::new(size),
        }),
    }
}

impl Scene3dPipeline {
    pub fn new(device: &RenderDevice, queue: &RenderQueue) -> Self {
        let frame_layout = device.create_bind_group_layout(
            "scene3d_frame_layout",
            &[
                uniform_entry(0, false, FRAME_BYTES),
                uniform_entry(1, true, DRAW_BYTES),
            ],
        );
        let texture_layout = device.create_bind_group_layout(
            "scene3d_texture_layout",
            &[
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        sample_type: TextureSampleType::Float { filterable: true },
                        view_dimension: TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        );
        let shader = device
            .wgpu_device()
            .create_shader_module(ShaderModuleDescriptor {
                label: Some("scene3d_shader"),
                source: ShaderSource::Wgsl(include_str!("scene3d.wgsl").into()),
            });
        let layout = device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: Some("scene3d_pipeline_layout"),
            bind_group_layouts: &[Some(&frame_layout), Some(&texture_layout)],
            immediate_size: 0,
        });
        let attributes = [
            VertexAttribute {
                format: VertexFormat::Float32x3,
                offset: 0,
                shader_location: 0,
            },
            VertexAttribute {
                format: VertexFormat::Float32x3,
                offset: 12,
                shader_location: 1,
            },
            VertexAttribute {
                format: VertexFormat::Float32x2,
                offset: 24,
                shader_location: 2,
            },
        ];
        let pipeline = device.create_render_pipeline(&RawRenderPipelineDescriptor {
            label: Some("scene3d_pipeline"),
            layout: Some(&layout),
            vertex: RawVertexState {
                module: &shader,
                entry_point: Some("vertex"),
                compilation_options: PipelineCompilationOptions::default(),
                buffers: &[RawVertexBufferLayout {
                    array_stride: (VERTEX_FLOATS * 4) as u64,
                    step_mode: VertexStepMode::Vertex,
                    attributes: &attributes,
                }],
            },
            // No culling: a back face is discarded in the shader unless the mesh is double-sided.
            primitive: PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                front_face: FrontFace::Ccw,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(DepthStencilState {
                format: DEPTH_FORMAT,
                depth_write_enabled: Some(true),
                depth_compare: Some(CompareFunction::Greater),
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: MultisampleState::default(),
            fragment: Some(RawFragmentState {
                module: &shader,
                entry_point: Some("fragment"),
                compilation_options: PipelineCompilationOptions::default(),
                targets: &[Some(ColorTargetState {
                    format: TextureFormat::Rgba8UnormSrgb,
                    blend: Some(BlendState::ALPHA_BLENDING),
                    write_mask: ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let sampler = device.create_sampler(&SamplerDescriptor {
            label: Some("scene3d_sampler"),
            address_mode_u: AddressMode::Repeat,
            address_mode_v: AddressMode::Repeat,
            mag_filter: FilterMode::Linear,
            min_filter: FilterMode::Linear,
            ..Default::default()
        });
        let alignment = u64::from(device.limits().min_uniform_buffer_offset_alignment).max(1);
        let white = UsdTexture {
            path: String::new(),
            width: 1,
            height: 1,
            rgba: vec![255; 4],
        };
        Self {
            pipeline,
            frame_layout,
            white: texture_bind_group(device, queue, &texture_layout, &sampler, &white),
            texture_layout,
            sampler,
            stride: DRAW_BYTES.div_ceil(alignment) * alignment,
        }
    }

    pub fn texture(
        &self,
        device: &RenderDevice,
        queue: &RenderQueue,
        texture: &UsdTexture,
    ) -> BindGroup {
        texture_bind_group(device, queue, &self.texture_layout, &self.sampler, texture)
    }
}

/// A base-colour texture: sRGB, as the previous path's (`Rgba8UnormSrgb`), sampled linearly.
fn texture_bind_group(
    device: &RenderDevice,
    queue: &RenderQueue,
    layout: &BindGroupLayout,
    sampler: &Sampler,
    texture: &UsdTexture,
) -> BindGroup {
    let gpu = device.create_texture_with_data(
        queue,
        &TextureDescriptor {
            label: Some("scene3d_base_color"),
            size: Extent3d {
                width: texture.width,
                height: texture.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8UnormSrgb,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST,
            view_formats: &[],
        },
        TextureDataOrder::LayerMajor,
        &texture.rgba,
    );
    let view = gpu.create_view(&TextureViewDescriptor::default());
    device.create_bind_group(
        "scene3d_texture",
        layout,
        &[
            BindGroupEntry {
                binding: 0,
                resource: BindingResource::TextureView(&view),
            },
            BindGroupEntry {
                binding: 1,
                resource: BindingResource::Sampler(sampler),
            },
        ],
    )
}

/// A mesh's vertices interleaved; with no normals in the file, each corner takes its faces' normal (the mesh is
/// laid face-varying, so a face's corners are its own).
pub fn upload_mesh(device: &RenderDevice, mesh: &UsdMesh) -> GpuMesh {
    let normals = mesh.normals.clone().unwrap_or_else(|| face_normals(mesh));
    let mut vertices: Vec<u8> = Vec::with_capacity(mesh.positions.len() * VERTEX_FLOATS * 4);
    for (index, position) in mesh.positions.iter().enumerate() {
        let normal = normals.get(index).copied().unwrap_or([0.0, 1.0, 0.0]);
        let uv = mesh
            .uvs
            .as_ref()
            .and_then(|uvs| uvs.get(index))
            .copied()
            .unwrap_or([0.0; 2]);
        for value in position.iter().chain(&normal).chain(&uv) {
            vertices.extend_from_slice(&value.to_le_bytes());
        }
    }
    let indices: Vec<u8> = mesh
        .indices
        .iter()
        .flat_map(|index| index.to_le_bytes())
        .collect();
    GpuMesh {
        vertices: device.create_buffer_with_data(&BufferInitDescriptor {
            label: Some("scene3d_vertices"),
            contents: &vertices,
            usage: BufferUsages::VERTEX,
        }),
        indices: device.create_buffer_with_data(&BufferInitDescriptor {
            label: Some("scene3d_indices"),
            contents: &indices,
            usage: BufferUsages::INDEX,
        }),
        count: mesh.indices.len() as u32,
    }
}

fn face_normals(mesh: &UsdMesh) -> Vec<[f32; 3]> {
    let mut sums = vec![bevy::math::Vec3::ZERO; mesh.positions.len()];
    for triangle in mesh.indices.chunks_exact(3) {
        let [a, b, c] = [0, 1, 2]
            .map(|corner| bevy::math::Vec3::from_array(mesh.positions[triangle[corner] as usize]));
        let normal = (b - a).cross(c - a);
        for corner in triangle {
            sums[*corner as usize] += normal;
        }
    }
    sums.into_iter()
        .map(|sum| sum.normalize_or(bevy::math::Vec3::Y).to_array())
        .collect()
}
