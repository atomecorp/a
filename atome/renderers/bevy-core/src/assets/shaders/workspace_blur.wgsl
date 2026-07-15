#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct WorkspaceBlurUniform {
    direction_radius: vec4<f32>,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> material: WorkspaceBlurUniform;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var source_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var source_sampler: sampler;

// Derived from Bevy 0.19's `bevy_post_process::gaussian_blur` shader under
// the dual MIT/Apache-2.0 license. It is kept local because enabling
// PostProcessPlugin would also install unrelated global post-processing.
//
// `coc` is a diameter in physical pixels. The caller maps the public logical
// blur radius to a CoC whose Gaussian support reaches that radius.
fn gaussian_blur(
    color_texture: texture_2d<f32>,
    color_texture_sampler: sampler,
    frag_coord: vec4<f32>,
    coc: f32,
    frag_offset: vec2<f32>,
) -> vec4<f32> {
    let sigma = coc * 0.25;
    let support = i32(ceil(sigma * 1.5));
    let uv = frag_coord.xy / vec2<f32>(textureDimensions(color_texture));
    let offset = frag_offset / vec2<f32>(textureDimensions(color_texture));
    let exp_factor = -1.0 / (2.0 * sigma * sigma);

    var sum = textureSampleLevel(color_texture, color_texture_sampler, uv, 0.0).rgb;
    var weight_sum = 1.0;
    for (var i = 1; i <= support; i += 2) {
        let w0 = exp(exp_factor * f32(i) * f32(i));
        let w1 = exp(exp_factor * f32(i + 1) * f32(i + 1));
        let uv_offset = offset * (f32(i) + w1 / (w0 + w1));
        let weight = w0 + w1;
        sum += (
            textureSampleLevel(color_texture, color_texture_sampler, uv + uv_offset, 0.0).rgb
            + textureSampleLevel(color_texture, color_texture_sampler, uv - uv_offset, 0.0).rgb
        ) * weight;
        weight_sum += weight * 2.0;
    }
    return vec4(sum / weight_sum, 1.0);
}

@fragment
fn fragment(mesh: VertexOutput) -> @location(0) vec4<f32> {
    let radius = material.direction_radius.z;
    if (radius <= 0.0) {
        let uv = mesh.position.xy / vec2<f32>(textureDimensions(source_texture));
        return textureSampleLevel(source_texture, source_sampler, uv, 0.0);
    }
    // Bevy defines support as ceil(sigma * 1.5), while Atome's public token
    // is a blur radius. This makes a 12 px token reach 12 physical pixels.
    let coc = radius * (4.0 / 1.5);
    return gaussian_blur(
        source_texture,
        source_sampler,
        mesh.position,
        coc,
        material.direction_radius.xy,
    );
}
