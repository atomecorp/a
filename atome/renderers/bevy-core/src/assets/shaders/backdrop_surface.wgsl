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

const BACKDROP_BLUR_LEVEL_SHIFT: f32 = 0.4;

// Backdrop blur, read from the capture's mip pyramid. Each level is a 2x box
// average of the one below; sampling one of them with a plain bilinear fetch
// shows its texel grid, and spreading sparse taps over a finer level (the old
// approach) left ghosts and blocks. Here every level is read through a cubic
// B-spline — four bilinear fetches — and two adjacent levels are blended, so the
// radius varies continuously and the result is a smooth, near Gaussian blur.
// The pyramid is rebuilt every frame: whatever moves behind the glass stays live.
fn backdrop_bspline_level(uv: vec2<f32>, level: f32) -> vec3<f32> {
    let base = vec2<f32>(textureDimensions(backdrop_texture, 0));
    let actual = max(vec2<f32>(textureDimensions(backdrop_texture, i32(level))), vec2(1.0));
    // Texel coordinates in the IDEAL level grid: an odd base size rounds the
    // stored level down, and a texel keeps covering the same base footprint.
    let st = uv * (base / exp2(level)) - 0.5;
    let cell = floor(st);
    let f = st - cell;
    let f2 = f * f;
    let f3 = f2 * f;
    let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
    let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
    let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
    let w3 = f3 / 6.0;
    let g0 = w0 + w1;
    let g1 = w2 + w3;
    let p0 = (cell - 0.5 + w1 / g0) / actual;
    let p1 = (cell + 1.5 + w3 / g1) / actual;
    return g0.y * (g0.x * textureSampleLevel(backdrop_texture, backdrop_sampler, vec2(p0.x, p0.y), level).rgb
            + g1.x * textureSampleLevel(backdrop_texture, backdrop_sampler, vec2(p1.x, p0.y), level).rgb)
        + g1.y * (g0.x * textureSampleLevel(backdrop_texture, backdrop_sampler, vec2(p0.x, p1.y), level).rgb
            + g1.x * textureSampleLevel(backdrop_texture, backdrop_sampler, vec2(p1.x, p1.y), level).rgb);
}

fn sample_aligned_mip(uv: vec2<f32>, lod: f32) -> vec3<f32> {
    // A B-spline read of level k spreads about 0.65 x 2^k base texels, where
    // `lod` targets 0.5 x 2^lod: hence the small shift down.
    let top = f32(textureNumLevels(backdrop_texture) - 1u);
    let level = clamp(lod - BACKDROP_BLUR_LEVEL_SHIFT, 0.0, top);
    let low = floor(level);
    let high = min(low + 1.0, top);
    let blend = level - low;
    let near = backdrop_bspline_level(uv, low);
    if blend < 0.001 || high == low {
        return near;
    }
    return mix(near, backdrop_bspline_level(uv, high), blend);
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
    // `size_radius.w` is the record opacity. Outside the rounded corners, or
    // while the surface is hidden, nothing is sampled at all.
    let alpha = edge * clamp(material.size_radius.w, 0.0, 1.0);
    if alpha < 0.002 { discard; }
    let screen_uv = clamp(
        frag_coord_to_uv(mesh.position.xy, view.viewport),
        vec2(0.0),
        vec2(1.0)
    );
    let glass = sample_aligned_mip(screen_uv, material.blur.z);
    // `blur.w` fades the tint towards the bottom edge: same hue, clearer glass.
    let tint_alpha = material.tint.a * (1.0 - clamp(material.blur.w, 0.0, 1.0) * mesh.uv.y);
    let color = mix(glass, material.tint.rgb, tint_alpha);
    return vec4(color, alpha);
}
