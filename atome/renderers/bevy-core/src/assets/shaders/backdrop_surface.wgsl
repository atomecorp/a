#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct BackdropSurfaceUniform {
    size_radius: vec4<f32>,
    tint: vec4<f32>,
    workspace_size: vec4<f32>,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> material: BackdropSurfaceUniform;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var original_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var original_sampler: sampler;
@group(#{MATERIAL_BIND_GROUP}) @binding(3) var blurred_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(4) var blurred_sampler: sampler;

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
    let workspace_size = max(material.workspace_size.xy, vec2(1.0));
    let screen_uv = clamp(
        vec2(
            mesh.world_position.x / workspace_size.x + 0.5,
            0.5 - mesh.world_position.y / workspace_size.y
        ),
        vec2(0.0),
        vec2(1.0)
    );
    let original = textureSample(original_texture, original_sampler, screen_uv).rgb;
    let blurred = textureSample(blurred_texture, blurred_sampler, screen_uv).rgb;
    let glass = mix(original, blurred, 1.0);
    let color = mix(glass, material.tint.rgb, material.tint.a);
    if edge < 0.002 { discard; }
    return vec4(color, edge);
}
