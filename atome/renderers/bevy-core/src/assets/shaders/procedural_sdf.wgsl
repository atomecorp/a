#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct ProceduralSdfUniform {
    morph: vec4<f32>,
    dynamics: vec4<f32>,
    transition: vec4<f32>,
    optics: vec4<f32>,
    contact: vec4<f32>,
    destructive: vec4<f32>,
    gesture: vec4<f32>,
    geometry: vec4<f32>,
    shape: vec4<f32>,
    cut_path_a: vec4<f32>,
    cut_path_b: vec4<f32>,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> material: ProceduralSdfUniform;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var original_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var original_sampler: sampler;
@group(#{MATERIAL_BIND_GROUP}) @binding(3) var blurred_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(4) var blurred_sampler: sampler;

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

fn cut_segment_metric(point: vec2<f32>, start: vec2<f32>, end: vec2<f32>, segment: f32) -> vec4<f32> {
    let delta = end - start;
    let length_squared = max(dot(delta, delta), 0.00001);
    let progress = clamp(dot(point - start, delta) / length_squared, 0.0, 1.0);
    let tangent = normalize(delta + vec2(0.0001));
    let nearest = start + delta * progress;
    let signed_distance = tangent.x * (point.y - nearest.y) - tangent.y * (point.x - nearest.x);
    return vec4(signed_distance, tangent.x, tangent.y, (segment + progress) / 3.0);
}

@fragment
fn fragment(mesh: VertexOutput) -> @location(0) vec4<f32> {
    let uv = mesh.uv;
    let surface_size = max(material.geometry.xy, vec2(1.0));
    let assistant_center = material.geometry.zw;
    let assistant_size = max(material.shape.x, 1.0);
    let pixel_position = vec2(uv.x * surface_size.x, (1.0 - uv.y) * surface_size.y);
    var point = (pixel_position - assistant_center) / (assistant_size * 0.5);
    let original_point = point;
    let time = material.dynamics.z;
    let pulse = material.dynamics.y;
    let intensity = material.dynamics.w;
    let glow_reveal = clamp(material.transition.x, 0.0, 1.0);
    let core_reveal = clamp(material.transition.y, 0.0, 1.0);
    let shell_reveal = clamp(material.transition.z, 0.0, 1.015);
    let disappearing = clamp(material.transition.w, 0.0, 1.0);
    let contact_point = material.contact.xy;
    let attraction = clamp(material.contact.z, 0.0, 0.8);
    let stretch = clamp(material.contact.w, 0.0, 1.0);
    let gesture_velocity = clamp(material.gesture.x, 0.0, 1.0);
    let destructive_direction = material.destructive.xy;
    let destructive_mode = material.destructive.z;
    let destructive_progress = clamp(material.destructive.w, 0.0, 1.0);
    let contact_delta = point - contact_point;
    let contact_falloff = exp(-dot(contact_delta, contact_delta) * 2.6);
    let contact_direction = normalize(contact_point + vec2(0.0001));
    point -= contact_direction * attraction * contact_falloff * (0.18 + stretch * 0.28);
    let directional_position = dot(point, contact_direction);
    point -= contact_direction * directional_position * stretch * 0.16;
    if destructive_mode > 0.5 && destructive_mode < 1.5 {
        let exit_distance = length(surface_size) / assistant_size * 2.0 + 2.0;
        point -= destructive_direction * destructive_progress * exit_distance * (1.0 + gesture_velocity * 0.24);
    }
    var burst_crack = 1.0;
    if destructive_mode >= 1.5 {
        let path_0 = material.cut_path_a.xy;
        let path_1 = material.cut_path_a.zw;
        let path_2 = material.cut_path_b.xy;
        let path_3 = material.cut_path_b.zw;
        let metric_0 = cut_segment_metric(original_point, path_0, path_1, 0.0);
        let metric_1 = cut_segment_metric(original_point, path_1, path_2, 1.0);
        let metric_2 = cut_segment_metric(original_point, path_2, path_3, 2.0);
        var cut_metric = metric_0;
        if abs(metric_1.x) < abs(cut_metric.x) { cut_metric = metric_1; }
        if abs(metric_2.x) < abs(cut_metric.x) { cut_metric = metric_2; }
        let propagation = 1.0 - smoothstep(destructive_progress - 0.05, destructive_progress + 0.12, cut_metric.w);
        let irregularity = sin(cut_metric.w * 23.0 + time * 0.8) * 0.012
            + sin(cut_metric.w * 41.0 - time * 0.37) * 0.006;
        let cut_distance = abs(cut_metric.x + irregularity);
        let cut_width = 0.014 + destructive_progress * (0.07 + gesture_velocity * 0.035)
            * (0.88 + sin(cut_metric.w * 29.0) * 0.12);
        burst_crack = mix(1.0, smoothstep(cut_width * 0.42, cut_width, cut_distance), propagation);
        let cut_normal = vec2(-cut_metric.z, cut_metric.y);
        let cut_side = select(-1.0, 1.0, cut_metric.x >= 0.0);
        point -= cut_normal * cut_side * destructive_progress * propagation * 0.36;
    }
    let shell_shape_reveal = min(shell_reveal, 1.0);
    let shell_scale = mix(0.92, 1.0, shell_shape_reveal) * max(shell_reveal, 0.001);
    let core_scale = mix(0.35, 1.0, core_reveal);
    let core_drop = disappearing * (1.0 - core_reveal) * 0.10;

    let shell_point = point / ((1.0 + pulse * shell_shape_reveal) * shell_scale);
    let shell_angle = atan2(shell_point.y, shell_point.x);
    let shell_wobble = sin(shell_angle * 3.0 + time * 0.38) * 0.006
        + cos(shell_angle * 2.0 - time * 0.29) * 0.004;
    let shell_distance = length(shell_point) - (0.84 + shell_wobble);
    let shell_mask = 1.0 - smoothstep(-0.018, 0.025, shell_distance);
    let shell_inner = smoothstep(-0.18, -0.025, shell_distance);
    let shell_edge = 1.0 - smoothstep(0.0, 0.065, abs(shell_distance));
    let rim = pow(clamp(1.0 - sqrt(max(0.0, 1.0 - dot(shell_point, shell_point))), 0.0, 1.0), 2.2);

    let light_vector = normalize(vec2(-0.72, 0.69));
    let directional = clamp(dot(normalize(shell_point + vec2(0.0001)), light_vector) * 0.5 + 0.5, 0.0, 1.0);
    let cyan = vec3(0.28, 0.80, 0.88);
    let rose = vec3(1.0, 0.50, 0.68);
    let pearl = vec3(1.0, 0.93, 0.91);
    let shell_mix = smoothstep(0.18, 0.86, clamp(original_point.x * 0.5 + 0.5, 0.0, 1.0) + directional * 0.16);
    var shell_color = mix(cyan, rose, shell_mix);
    shell_color = mix(shell_color, pearl, rim * 0.48 + shell_edge * 0.18);
    shell_color += mix(vec3(0.02, 0.14, 0.18), vec3(0.22, 0.04, 0.12), shell_mix) * shell_inner * 0.22;
    shell_color += vec3(0.08, 0.04, 0.10) * intensity * 0.16;
    let shell_alpha = shell_mask * (0.16 + rim * 0.48 + shell_inner * 0.12 + shell_edge * 0.20) * shell_shape_reveal;
    let screen_dimensions = vec2<f32>(textureDimensions(blurred_texture));
    let screen_uv = clamp(mesh.position.xy / max(screen_dimensions, vec2(1.0)), vec2(0.0), vec2(1.0));
    let refraction_direction = normalize(shell_point + vec2(0.0001));
    let shell_radius = clamp(length(shell_point) / 0.84, 0.0, 1.0);
    let refraction_band = smoothstep(material.optics.z, 0.78, shell_radius)
        * (1.0 - smoothstep(0.97, 1.0, shell_radius));
    let refraction_uv = refraction_direction
        * material.optics.x
        * refraction_band
        / max(screen_dimensions, vec2(1.0));
    let safe_margin = vec2(material.optics.x + material.optics.x) / max(screen_dimensions, vec2(1.0));
    let refracted_uv = clamp(screen_uv + refraction_uv, safe_margin, vec2(1.0) - safe_margin);
    let original_color = textureSample(original_texture, original_sampler, refracted_uv).rgb;
    let blurred_color = textureSample(blurred_texture, blurred_sampler, refracted_uv).rgb;
    let glass_color = mix(original_color, blurred_color, material.optics.y);
    let glass_alpha = shell_mask * shell_shape_reveal;

    let core_point = (point - vec2(0.0, -core_drop)) / ((1.0 + pulse * 0.72 * core_reveal) * core_scale);
    let core_distance = organic_core(core_point, material.morph, time);
    let core_mask = 1.0 - smoothstep(-0.012, 0.018, core_distance);
    let core_edge = 1.0 - smoothstep(0.0, 0.11, abs(core_distance));
    let core_light = clamp(0.54 + core_point.x * -0.24 + core_point.y * 0.25, 0.0, 1.0);
    var core_color = mix(vec3(0.91, 0.34, 0.47), vec3(1.0, 0.82, 0.70), core_light);
    core_color = mix(core_color, vec3(1.0, 0.95, 0.88), core_edge * 0.42);
    core_color += vec3(0.10, 0.03, 0.08) * intensity * 0.22;
    let core_alpha = core_mask * (0.80 + core_edge * 0.17) * core_reveal;

    let shadow_point = (point - vec2(0.0, -0.76)) / vec2(0.64, 0.11);
    let contact_shadow = exp(-dot(shadow_point, shadow_point) * 2.4) * 0.20 * shell_shape_reveal;
    let highlight_point = (point - vec2(-0.36, 0.43)) / vec2(0.11, 0.28);
    let highlight = exp(-dot(highlight_point, highlight_point) * 4.0) * shell_mask * shell_shape_reveal;
    let core_highlight_point = (core_point - vec2(-0.16, 0.20)) / vec2(0.18, 0.24);
    let core_highlight = exp(-dot(core_highlight_point, core_highlight_point) * 3.8) * core_mask * core_reveal;
    let glow_point = (point - vec2(0.0, 0.08)) / vec2(0.42, 0.46);
    let glow_alpha = exp(-dot(glow_point, glow_point) * 3.2) * glow_reveal * 0.16;

    let halo_distance = abs(shell_distance);
    let halo_alpha = (1.0 - smoothstep(0.02, 0.12, halo_distance)) * (1.0 - shell_mask) * shell_shape_reveal * material.optics.w;
    let destructive_alpha = select(1.0, 1.0 - smoothstep(0.62, 1.0, destructive_progress), destructive_mode > 0.5);
    let base_alpha = max(max(max(shell_alpha, core_alpha), glow_alpha), max(glass_alpha, halo_alpha)) * burst_crack * destructive_alpha;
    var color = glass_color * glass_alpha;
    color = mix(color, vec3(1.0, 0.55, 0.58), glow_alpha);
    color += mix(cyan, rose, shell_mix) * halo_alpha;
    color = mix(color, shell_color, shell_alpha);
    color = mix(color, core_color, core_alpha);
    color += vec3(0.94, 1.0, 1.0) * highlight * 0.62;
    color += vec3(1.0, 0.97, 0.88) * core_highlight * 0.28;
    color -= vec3(contact_shadow * (1.0 - base_alpha));
    color += pearl * (1.0 - burst_crack) * (1.0 - destructive_progress) * 0.8;
    let alpha = clamp(max(base_alpha, contact_shadow * 0.42 * destructive_alpha), 0.0, 1.0);
    if alpha < 0.002 { discard; }
    return vec4(color / max(alpha, 0.001), alpha);
}
