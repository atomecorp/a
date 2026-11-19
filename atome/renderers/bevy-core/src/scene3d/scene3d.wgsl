// A scene3d atome's own pass (`gpu.rs`): indexed triangles with a depth buffer, the base colour factor times its
// texture (white when the material has none), opacity, Lambert diffuse and a normalized Blinn-Phong specular from
// the roughness, metallic tinting the specular, emissive added, an ambient term. Lights and colours are linear;
// the sRGB target encodes them.

struct Light {
    // xyz: the direction toward a distant light (w 0) or a point light's position (w 1).
    position: vec4<f32>,
    // rgb: the light's radiance factor (`frame.rs`); a point light's is divided by the squared distance.
    color: vec4<f32>,
};

struct Frame {
    view_proj: mat4x4<f32>,
    camera: vec4<f32>,
    ambient: vec4<f32>,
    // x: the number of lights used.
    counts: vec4<f32>,
    lights: array<Light, 8>,
};

struct Draw {
    model: mat4x4<f32>,
    normal: mat4x4<f32>,
    // rgb: base colour factor, a: opacity.
    base: vec4<f32>,
    // rgb: emissive, w: metallic.
    emissive: vec4<f32>,
    // x: roughness, y: 1 when double-sided, z: 1 when blended (opacity under 1; an opaque surface writes alpha 1).
    params: vec4<f32>,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(1) @binding(0) var base_texture: texture_2d<f32>;
@group(1) @binding(1) var base_sampler: sampler;

struct VertexOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) world: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

@vertex
fn vertex(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
) -> VertexOut {
    let world = draw.model * vec4<f32>(position, 1.0);
    var out: VertexOut;
    out.clip = frame.view_proj * world;
    out.world = world.xyz;
    out.normal = (draw.normal * vec4<f32>(normal, 0.0)).xyz;
    out.uv = uv;
    return out;
}

@fragment
fn fragment(in: VertexOut, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
    // Sampled before any discard: texture sampling stays in uniform control flow.
    let albedo = draw.base * textureSample(base_texture, base_sampler, in.uv);
    if (!front && draw.params.y < 0.5) {
        discard;
    }
    var n = normalize(in.normal);
    if (!front) {
        n = -n;
    }
    let v = normalize(frame.camera.xyz - in.world);
    let metallic = clamp(draw.emissive.w, 0.0, 1.0);
    let roughness = clamp(draw.params.x, 0.03, 1.0);
    let shininess = max(2.0 / pow(roughness, 4.0) - 2.0, 1.0);
    let diffuse = albedo.rgb * (1.0 - metallic);
    let f0 = mix(vec3<f32>(0.04), albedo.rgb, metallic);
    var color = (diffuse + f0) * frame.ambient.rgb;
    let count = u32(frame.counts.x);
    for (var i = 0u; i < count; i = i + 1u) {
        let light = frame.lights[i];
        var l = light.position.xyz;
        var radiance = light.color.rgb;
        if (light.position.w > 0.5) {
            let to_light = light.position.xyz - in.world;
            let distance2 = max(dot(to_light, to_light), 1e-6);
            l = to_light * inverseSqrt(distance2);
            radiance = radiance / distance2;
        }
        let n_dot_l = max(dot(n, l), 0.0);
        let h = normalize(l + v);
        let specular = f0 * pow(max(dot(n, h), 0.0), shininess) * (shininess + 8.0) / 8.0;
        color = color + (diffuse + specular) * radiance * n_dot_l;
    }
    color = color + draw.emissive.rgb;
    return vec4<f32>(min(color, vec3<f32>(1.0)), select(1.0, albedo.a, draw.params.z > 0.5));
}
