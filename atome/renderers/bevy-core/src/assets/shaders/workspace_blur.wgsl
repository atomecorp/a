#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct WorkspaceBlurUniform {
    direction_radius: vec4<f32>,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> material: WorkspaceBlurUniform;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var source_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var source_sampler: sampler;

@fragment
fn fragment(mesh: VertexOutput) -> @location(0) vec4<f32> {
    let dimensions = vec2<f32>(textureDimensions(source_texture));
    let texel = material.direction_radius.xy
        * (material.direction_radius.z / 3.2307692308)
        / max(dimensions, vec2(1.0));
    let uv = clamp(mesh.uv, vec2(0.0), vec2(1.0));
    var color = textureSample(source_texture, source_sampler, uv).rgb * 0.2270270270;
    color += textureSample(source_texture, source_sampler, clamp(uv + texel * 1.3846153846, vec2(0.0), vec2(1.0))).rgb * 0.3162162162;
    color += textureSample(source_texture, source_sampler, clamp(uv - texel * 1.3846153846, vec2(0.0), vec2(1.0))).rgb * 0.3162162162;
    color += textureSample(source_texture, source_sampler, clamp(uv + texel * 3.2307692308, vec2(0.0), vec2(1.0))).rgb * 0.0702702703;
    color += textureSample(source_texture, source_sampler, clamp(uv - texel * 3.2307692308, vec2(0.0), vec2(1.0))).rgb * 0.0702702703;
    return vec4(color, 1.0);
}
