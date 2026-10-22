// The progress ring (progress_ring.rs): an annulus touching its node's shorter side,
// lit clockwise from 12 o'clock up to `shape.w`, the rest in the track colour.
// Antialiased analytically on both rims and on the straight end of the lit arc.
#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct ProgressRing {
    color: vec4<f32>,
    track: vec4<f32>,
    // width px, height px, ring width px, progress 0..1
    shape: vec4<f32>,
    opacity: vec4<f32>,
}
@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> ring: ProgressRing;

const TAU: f32 = 6.2831853;

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let size = ring.shape.xy;
    // Logical pixels from the centre, y down.
    let point = (in.uv - vec2(0.5)) * size;
    let half_width = ring.shape.z * 0.5;
    let middle = min(size.x, size.y) * 0.5 - half_width;
    let distance = length(point);
    let edge = abs(distance - middle) - half_width;
    let pixel = max(fwidth(edge), 1e-4);
    let coverage = clamp(0.5 - edge / pixel, 0.0, 1.0);
    if coverage <= 0.0 {
        discard;
    }
    // Turn of this pixel, clockwise from 12 o'clock, in 0..1.
    let turn = fract(atan2(point.x, -point.y) / TAU + 1.0);
    let progress = ring.shape.w;
    // Distance along the arc (px) to the lit end.
    let along = (progress - turn) * TAU * max(distance, 1.0);
    // A full ring has no end; an empty one has no lit seam at 12 o'clock.
    let lit = select(select(clamp(0.5 + along / pixel, 0.0, 1.0), 1.0, progress >= 0.9999), 0.0, progress <= 0.0001);
    let color = mix(ring.track, ring.color, lit);
    return vec4(color.rgb, color.a * coverage * ring.opacity.x);
}
