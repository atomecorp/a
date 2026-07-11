#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct ProceduralSdfUniform {
    morph: vec4<f32>,
    dynamics: vec4<f32>,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> material: ProceduralSdfUniform;

fn sd_ellipse(point: vec2<f32>, radius: vec2<f32>) -> f32 {
    let scaled = point / radius;
    return (length(scaled) - 1.0) * min(radius.x, radius.y);
}

fn organic_core(point: vec2<f32>, morph: vec4<f32>, time: f32) -> f32 {
    let drift = vec2(sin(time * 0.71) * 0.014, cos(time * 0.53) * 0.010);
    let shifted = point - vec2(drift.x, 0.09 + morph.w * 0.16 + drift.y);
    let angle = atan2(shifted.y, shifted.x);
    let ripple = sin(angle * 3.0 + time * 0.72) * 0.022
        + cos(angle * 2.0 - time * 0.47) * 0.016;
    let radius = vec2(0.31 * morph.x, 0.34 * morph.y);
    return sd_ellipse(shifted, radius) - ripple - morph.z * 0.025;
}

fn phase_tint(phase: f32) -> vec3<f32> {
    if phase > 4.5 { return vec3(0.42, 0.04, 0.08); }
    if phase > 3.5 { return vec3(0.10, 0.03, 0.14); }
    if phase > 2.5 { return vec3(0.05, 0.08, 0.16); }
    if phase > 1.5 { return vec3(0.02, 0.13, 0.13); }
    return vec3(0.05, 0.04, 0.08);
}

@fragment
fn fragment(mesh: VertexOutput) -> @location(0) vec4<f32> {
    let uv = mesh.uv;
    var point = (uv - vec2(0.5)) * 2.0;
    point.y = -point.y;
    let time = material.dynamics.z;
    let phase = material.dynamics.x;
    let pulse = material.dynamics.y;
    let intensity = material.dynamics.w;

    let shell_point = point / (1.0 + pulse);
    let shell_angle = atan2(shell_point.y, shell_point.x);
    let shell_wobble = sin(shell_angle * 3.0 + time * 0.38) * 0.006
        + cos(shell_angle * 2.0 - time * 0.29) * 0.004;
    let shell_distance = length(shell_point) - (0.84 + shell_wobble);
    let shell_mask = 1.0 - smoothstep(-0.018, 0.025, shell_distance);
    let shell_inner = smoothstep(-0.18, -0.025, shell_distance);
    let rim = pow(clamp(1.0 - sqrt(max(0.0, 1.0 - dot(shell_point, shell_point))), 0.0, 1.0), 2.2);

    let light_vector = normalize(vec2(-0.72, 0.69));
    let directional = clamp(dot(normalize(shell_point + vec2(0.0001)), light_vector) * 0.5 + 0.5, 0.0, 1.0);
    let cyan = vec3(0.46, 0.82, 0.85);
    let rose = vec3(1.0, 0.64, 0.72);
    var shell_color = mix(cyan, rose, smoothstep(0.12, 0.94, uv.x + directional * 0.2));
    shell_color += vec3(0.26, 0.20, 0.28) * rim;
    shell_color += phase_tint(phase) * (0.28 + intensity * 0.32);
    let shell_alpha = shell_mask * (0.14 + rim * 0.45 + shell_inner * 0.09);

    let core_distance = organic_core(point / (1.0 + pulse * 0.72), material.morph, time);
    let core_mask = 1.0 - smoothstep(-0.012, 0.018, core_distance);
    let core_edge = 1.0 - smoothstep(0.0, 0.11, abs(core_distance));
    let core_light = clamp(0.58 + point.x * -0.16 + point.y * 0.19, 0.0, 1.0);
    var core_color = mix(vec3(0.96, 0.48, 0.50), vec3(1.0, 0.82, 0.72), core_light);
    core_color += vec3(0.24, 0.12, 0.18) * core_edge;
    core_color += phase_tint(phase) * intensity * 0.35;
    let core_alpha = core_mask * (0.80 + core_edge * 0.17);

    let shadow_point = (point - vec2(0.0, -0.76)) / vec2(0.64, 0.11);
    let contact_shadow = exp(-dot(shadow_point, shadow_point) * 2.4) * 0.20;
    let highlight_point = (point - vec2(-0.36, 0.43)) / vec2(0.11, 0.28);
    let highlight = exp(-dot(highlight_point, highlight_point) * 4.0) * shell_mask;

    let base_alpha = max(shell_alpha, core_alpha);
    var color = shell_color * shell_alpha;
    color = mix(color, core_color, core_alpha);
    color += vec3(1.0, 0.98, 0.96) * highlight * 0.34;
    color -= vec3(contact_shadow * (1.0 - base_alpha));
    let alpha = clamp(max(base_alpha, contact_shadow * 0.42), 0.0, 1.0);
    if alpha < 0.002 { discard; }
    return vec4(color / max(alpha, 0.001), alpha);
}
