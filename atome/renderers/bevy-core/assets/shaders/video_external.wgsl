#import bevy_sprite::mesh2d_functions

@group(2) @binding(0) var video_frame: texture_external;
@group(2) @binding(1) var video_sampler: sampler;

@group(2) @binding(2) var<uniform> video_params: vec4<f32>;

struct Vertex {
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let model = mesh2d_functions::get_world_from_local(vertex.instance_index);
    out.clip_position = mesh2d_functions::mesh2d_position_local_to_clip(
        model,
        vec4<f32>(vertex.position, 1.0)
    );
    out.uv = vertex.uv;
    return out;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let frame = textureSampleBaseClampToEdge(video_frame, video_sampler, in.uv);
    let opacity = clamp(video_params.x, 0.0, 1.0);
    return vec4<f32>(frame.rgb, opacity);
}
