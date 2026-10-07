#import bevy_sprite::mesh2d_vertex_output::VertexOutput
struct LoginLightUniform { parameters: array<vec4<f32>, 24> }
@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> light: LoginLightUniform;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var logo_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var logo_sampler: sampler;

fn linear(color: vec3<f32>) -> vec3<f32> {
    return select(pow((color + vec3(0.055)) / 1.055, vec3(2.4)), color / 12.92, color <= vec3(0.04045));
}
fn logo(point: vec2<f32>) -> vec4<f32> {
    let uv = point / light.parameters[0].z + vec2(0.5);
    if any(uv < vec2(0.0)) || any(uv > vec2(1.0)) { return vec4(0.0); }
    let pixel = textureSampleLevel(logo_texture, logo_sampler, uv, 0.0);
    return vec4(pixel.rgb * pixel.a, pixel.a);
}
// Convolve the decoded original SVG; never redraw its silhouette. At large
// sigma integrate over the source instead, avoiding repeated ghost silhouettes.
fn blurred_logo(point: vec2<f32>, sigma: f32) -> vec4<f32> {
    if sigma < 0.15 { return logo(point); }
    let side = light.parameters[0].z;
    if any(abs(point) > vec2(side * 0.5 + sigma * 3.0)) { return vec4(0.0); }
    var sum = vec4(0.0);
    if sigma > 16.0 {
        let step = side / 20.0;
        for (var y = 0; y < 20; y++) {
            for (var x = 0; x < 20; x++) {
                let source = (vec2(f32(x), f32(y)) + vec2(0.5)) * step - vec2(side * 0.5);
                let delta = point - source;
                let weight = exp(-dot(delta, delta) / (2.0 * sigma * sigma));
                sum += logo(source) * weight;
            }
        }
        return sum * (step * step / (6.2831853 * sigma * sigma));
    }
    var weights = 0.0;
    for (var y = -6; y <= 6; y++) {
        for (var x = -6; x <= 6; x++) {
            let delta = vec2(f32(x), f32(y)) * sigma * 0.5;
            let weight = exp(-dot(delta, delta) / (2.0 * sigma * sigma));
            weights += weight; sum += logo(point - delta) * weight;
        }
    }
    return sum / weights;
}
fn gradient(point: vec2<f32>) -> vec4<f32> {
    let radius = vec2(light.parameters[15].y * 0.5, light.parameters[15].z * 0.62);
    let distance = length(point / radius);
    let offsets = array<f32, 5>(light.parameters[14].x, light.parameters[14].y,
        light.parameters[14].z, light.parameters[14].w, light.parameters[15].x);
    if distance >= offsets[4] { return vec4(0.0); }
    var color = light.parameters[9];
    for (var i = 1u; i < 5u; i++) {
        if distance <= offsets[i] {
            color = mix(light.parameters[8u + i], light.parameters[9u + i],
                clamp((distance - offsets[i - 1u]) / (offsets[i] - offsets[i - 1u]), 0.0, 1.0));
            break;
        }
    }
    return vec4(linear(color.rgb) * color.a, color.a);
}
fn sweep(point: vec2<f32>) -> vec4<f32> {
    let state = light.parameters[2];
    if state.w <= 0.001 { return vec4(0.0); }
    let local = (point - vec2(state.x + light.parameters[15].y * 0.5, light.parameters[0].y * 0.5)) / state.yz;
    if abs(local.x) > light.parameters[15].y || abs(local.y) > 12.0 { return vec4(0.0); }
    let sigma = light.parameters[3].x;
    var sum = vec4(0.0); var weights = 0.0;
    for (var y = -6; y <= 6; y++) {
        for (var x = -6; x <= 6; x++) {
            let delta = vec2(f32(x), f32(y)) * sigma * 0.5;
            let weight = exp(-dot(delta, delta) / (2.0 * sigma * sigma));
            sum += gradient(local - delta) * weight; weights += weight;
        }
    }
    let result = sum / weights * state.w;
    return vec4(clamp(result.rgb * light.parameters[3].y, vec3(0.0), vec3(result.a)), result.a);
}
fn normal_cdf(value: f32) -> f32 {
    let v = abs(value) / 1.41421356;
    let t = 1.0 / (1.0 + 0.3275911 * v);
    let erf = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-v * v);
    return 0.5 * (1.0 + select(-erf, erf, value >= 0.0));
}
fn line_alpha(y: f32, sigma: f32) -> f32 {
    let half = light.parameters[6].x * 0.5;
    return normal_cdf((half - y) / sigma) - normal_cdf((-half - y) / sigma);
}
fn screen(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
    return vec4(vec3(1.0) - (vec3(1.0) - a.rgb) * (vec3(1.0) - b.rgb), 1.0 - (1.0 - a.a) * (1.0 - b.a));
}
fn over(front: vec4<f32>, back: vec4<f32>) -> vec4<f32> {
    return front + back * (1.0 - front.a);
}
fn line(y: f32) -> vec4<f32> {
    let shape = clamp(light.parameters[6].x * 0.5 + 0.5 - abs(y), 0.0, 1.0) * light.parameters[6].y;
    let white = line_alpha(y, light.parameters[6].z * 0.5) * light.parameters[7].a;
    let purple = line_alpha(y, light.parameters[6].w * 0.5) * light.parameters[8].a;
    return screen(screen(vec4(vec3(shape), shape), vec4(linear(light.parameters[7].rgb) * white, white)),
        vec4(linear(light.parameters[8].rgb) * purple, purple));
}
fn logo_glow(point: vec2<f32>) -> vec4<f32> {
    let state = light.parameters[3];
    let box = light.parameters[1].z;
    if state.w <= 0.001 || any(abs(point) > vec2(box * 0.5)) { return vec4(0.0); }
    let mask_width = box * 2.6;
    let mask_x = (point.x + box * 0.5 - (box - mask_width) * state.z / 100.0) / mask_width;
    let reveal = clamp((mask_x - 0.29) / 0.18, 0.0, 1.0) * clamp((0.71 - mask_x) / 0.18, 0.0, 1.0);
    if reveal <= 0.001 { return vec4(0.0); }
    let source = logo(point).a;
    let white = blurred_logo(point, light.parameters[4].y * 0.5).a * light.parameters[4].w;
    let purple_sigma = light.parameters[4].z * 0.5;
    let purple = blurred_logo(point, purple_sigma).a * light.parameters[5].a;
    let base = over(vec4(vec3(source), source), vec4(vec3(white), white));
    let result = over(base, vec4(linear(light.parameters[5].rgb) * purple, purple));
    let alpha = result.a * state.w * reveal;
    // The original brightness filter precedes the drop shadows: its white
    // source stays white, while the subsequently coloured shadow stays purple.
    return vec4(result.rgb * state.w * reveal, alpha);
}
@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let point = input.uv * light.parameters[0].xy;
    let local = point - light.parameters[0].xy * 0.5;
    if light.parameters[0].w < 0.5 {
        let pixel = blurred_logo(local, light.parameters[1].y);
        if pixel.a < 0.0001 { discard; }
        return vec4(pixel.rgb / pixel.a, pixel.a * light.parameters[1].x);
    }
    let entry = light.parameters[16].x;
    let result = screen(screen(line(local.y) * entry, sweep(point) * entry), logo_glow(local));
    if result.a < 0.0001 { discard; }
    return result;
}
