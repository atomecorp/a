#import bevy_sprite::mesh2d_view_bindings::view

// An image carrying media effects (media_fx/image_draw.rs): the sprite's quad,
// drawn through the chain of media_fx_stack.wgsl joined after this file.

struct ImageFxInstance {
    // The sprite's quad: a unit square scaled, anchored and placed (sprite pipeline convention).
    world_from_local: mat4x4<f32>,
    // Texture uv = corner * zw + xy, corner (0,0) at the bottom-left.
    uv_offset_scale: vec4<f32>,
    // The sprite's colour (white, its alpha the Atome's opacity).
    color: vec4<f32>,
};

@group(1) @binding(0) var image_texture: texture_2d<f32>;
@group(1) @binding(1) var image_sampler: sampler;
@group(1) @binding(2) var<uniform> media_fx: MediaFx;
@group(1) @binding(3) var media_fx_lut: texture_3d<f32>;
@group(1) @binding(4) var media_fx_lut_sampler: sampler;
@group(1) @binding(5) var<uniform> instance: ImageFxInstance;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0)
    );
    let corner = corners[index];
    var out: VertexOutput;
    out.clip_position = view.clip_from_world * instance.world_from_local * vec4<f32>(corner, 0.0, 1.0);
    out.uv = corner * instance.uv_offset_scale.zw + instance.uv_offset_scale.xy;
    return out;
}

// The image texture is sRGB: sampled linear, it is encoded again for the
// effects, which work on display-referred values like the video's.
fn media_sample(uv: vec2<f32>) -> vec4<f32> {
    let texel = textureSampleLevel(image_texture, image_sampler, uv, 0.0);
    return vec4<f32>(fx_linear_to_srgb(texel.rgb), texel.a);
}

fn media_fx_lut_sample(coord: vec3<f32>) -> vec3<f32> {
    return textureSampleLevel(media_fx_lut, media_fx_lut_sampler, coord, 0.0).rgb;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let shaded = media_fx_apply(in.uv);
    return vec4<f32>(fx_srgb_to_linear(shaded.rgb) * instance.color.rgb, shaded.a * instance.color.a);
}
