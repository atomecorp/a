#import bevy_sprite::mesh2d_vertex_output::VertexOutput
#import bevy_sprite::mesh2d_view_bindings::view
#import bevy_render::view::frag_coord_to_uv

struct BackdropSurfaceUniform {
    size_radius: vec4<f32>,
    tint: vec4<f32>,
    blur: vec4<f32>,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> material: BackdropSurfaceUniform;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var backdrop_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var backdrop_sampler: sampler;

fn sample_aligned_mip(uv: vec2<f32>, lod: f32) -> vec3<f32> {
    let source_lod = min(max(lod, 0.0), 1.0);
    let texel = 1.0 / vec2<f32>(textureDimensions(backdrop_texture, 0));
    let center_uv = uv + texel * ((exp2(source_lod) - 1.0) * 0.5);
    let offset = texel * max(exp2(max(lod, 0.0)) - 1.0, 0.0) * 0.45;
    let axis = textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv + vec2(offset.x, 0.0), source_lod).rgb
        + textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv - vec2(offset.x, 0.0), source_lod).rgb
        + textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv + vec2(0.0, offset.y), source_lod).rgb
        + textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv - vec2(0.0, offset.y), source_lod).rgb;
    let diagonal = textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv + offset, source_lod).rgb
        + textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv - offset, source_lod).rgb
        + textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv + vec2(offset.x, -offset.y), source_lod).rgb
        + textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv + vec2(-offset.x, offset.y), source_lod).rgb;
    return textureSampleLevel(backdrop_texture, backdrop_sampler, center_uv, source_lod).rgb * 0.2
        + (axis + diagonal) * 0.1;
}

fn rounded_rect_distance(point: vec2<f32>, size: vec2<f32>, radius: f32) -> f32 {
    let clipped_radius = min(radius, min(size.x, size.y) * 0.5);
    let delta = abs(point - size * 0.5) - (size * 0.5 - vec2(clipped_radius));
    return length(max(delta, vec2(0.0))) + min(max(delta.x, delta.y), 0.0) - clipped_radius;
}

@fragment
fn fragment(mesh: VertexOutput) -> @location(0) vec4<f32> {
    let size = max(material.size_radius.xy, vec2(1.0));
    let point = mesh.uv * size;
    let distance = rounded_rect_distance(point, size, material.size_radius.z);
    let edge = 1.0 - smoothstep(-0.6, 0.6, distance);
    let screen_uv = clamp(
        frag_coord_to_uv(mesh.position.xy, view.viewport),
        vec2(0.0),
        vec2(1.0)
    );
    let glass = sample_aligned_mip(screen_uv, material.blur.z);
    let color = mix(glass, material.tint.rgb, material.tint.a);
    if edge < 0.002 { discard; }
    return vec4(color, edge);
}
