// A shape's drop shadow, blurred on the GPU from the shape's own mask (shape_shadow_gpu.rs): the same
// separable gaussian as the CPU one (shadow_texture.rs), in two fragment passes. Every tap reads a texel
// at integer coordinates (textureLoad) and a texel outside its texture counts as empty, exactly as the CPU
// convolution skips its out-of-range taps. No storage texture: the A12Z allows only four per stage.
#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

struct ShadowBlur {
    // Along x, then along y — x: the mask's margin inside the shadow (texels), y: sigma, z: taps on each side,
    // w: 1 / the kernel's sum. A mask at a screen's density blurs by a different count of texels on each axis.
    horizontal: vec4<f32>,
    vertical: vec4<f32>,
    // xy: the owner's mask texel under shadow texel 0 (whole texels).
    owner: vec4<f32>,
    // The shadow's colour, linear, and its alpha.
    color: vec4<f32>,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var owner_mask: texture_2d<f32>;
@group(0) @binding(2) var<uniform> blur: ShadowBlur;

fn weight(kernel: vec4<f32>, distance: f32) -> f32 {
    let scaled = distance / kernel.y;
    return exp(-0.5 * scaled * scaled) * kernel.w;
}

fn inside(texture: texture_2d<f32>, at: vec2<i32>) -> bool {
    let size = vec2<i32>(textureDimensions(texture));
    return all(at >= vec2<i32>(0)) && all(at < size);
}

// Pass 1, along x: the silhouette's mask (its alpha), laid its margins inside the shadow.
@fragment
fn blur_horizontal(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let pixel = vec2<i32>(floor(in.position.xy));
    let margin = vec2<i32>(i32(blur.horizontal.x), i32(blur.vertical.x));
    let radius = i32(blur.horizontal.z);
    var sum = 0.0;
    for (var tap = -radius; tap <= radius; tap += 1) {
        let at = vec2<i32>(pixel.x - margin.x + tap, pixel.y - margin.y);
        if (inside(source, at)) {
            sum += textureLoad(source, at, 0).a * weight(blur.horizontal, f32(tap));
        }
    }
    return vec4<f32>(sum, 0.0, 0.0, 1.0);
}

// The owner's coverage under a shadow texel (empty outside its mask). The shift is whole: a shadow moved by a
// fractional offset reads a mask sampled at that phase (shape_mask_gpu.rs, its phase).
fn owner_coverage(pixel: vec2<i32>) -> f32 {
    let texel = pixel + vec2<i32>(blur.owner.xy);
    if (inside(owner_mask, texel)) {
        return textureLoad(owner_mask, texel, 0).a;
    }
    return 0.0;
}

// Pass 2, along y, then the owner's own pixels cleared (a drop shadow never shows under its owner).
@fragment
fn blur_vertical(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let pixel = vec2<i32>(floor(in.position.xy));
    let radius = i32(blur.vertical.z);
    var sum = 0.0;
    for (var tap = -radius; tap <= radius; tap += 1) {
        let at = vec2<i32>(pixel.x, pixel.y + tap);
        if (inside(source, at)) {
            sum += textureLoad(source, at, 0).r * weight(blur.vertical, f32(tap));
        }
    }
    let alpha = blur.color.a * sum * (1.0 - owner_coverage(pixel));
    return vec4<f32>(blur.color.rgb, alpha);
}
