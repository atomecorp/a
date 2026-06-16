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

// External textures sample in display-encoded sRGB. Bevy's 2d target is sRGB
// (or HDR-linear), so the GPU re-applies the sRGB OETF on store. Without this
// decode the encode is applied twice, lifting blacks and washing out contrast.
fn srgb_to_linear(srgb: vec3<f32>) -> vec3<f32> {
    let cutoff = srgb <= vec3<f32>(0.04045);
    let low = srgb / 12.92;
    let high = pow((srgb + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
    return select(high, low, cutoff);
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let frame = textureSampleBaseClampToEdge(video_frame, video_sampler, in.uv);
    let opacity = clamp(video_params.x, 0.0, 1.0);
    return vec4<f32>(srgb_to_linear(frame.rgb), opacity);
}
