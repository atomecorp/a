// A shape's mask drawn on the GPU (shape_mask_gpu.rs): the coverage of its silhouette at each texel centre, white
// with the coverage as alpha, exactly the texture `shape_texture.rs#shape_mask_texture` paints on the CPU. The
// signed distances are the ones of `shape_sdf.rs`, written for the GPU once in `shape_sdf.wgsl`;
// `tests/rendering/shape_mask_gpu_twin.rs` keeps both in step.
#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput
#import atome::shape_sdf::{Silhouette, coverage}

struct ShapeMask {
    // The silhouette (shape_sdf.wgsl#Silhouette): its box, variant and vertex rounding; its corner radii; its star
    // and polygon settings.
    shape: vec4<f32>,
    radii: vec4<f32>,
    geometry: vec4<f32>,
    // x, y: how far (0..1 texel) each texel centre is moved along its axis (a shadow's owner, shifted by a fraction).
    phase: vec4<f32>,
}

@group(0) @binding(0) var<uniform> mask: ShapeMask;

@fragment
fn coverage_pass(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let pixel = floor(in.position.xy);
    let silhouette = Silhouette(mask.shape, mask.radii, mask.geometry);
    return vec4<f32>(1.0, 1.0, 1.0, coverage(silhouette, pixel + vec2<f32>(0.5) + mask.phase.xy));
}
