// One level of the workspace blur pyramid: mip N is rendered from mip N-1.
// Each destination texel weighs its 4x4 source neighbourhood by the tent
// [1, 3, 3, 1] / 8 on each axis: the linear B-spline at the level's spacing,
// which reproduces a linear ramp, so the blur keeps every content's centre where
// the sharp image has it. The former 2x2 box gave each block's whole mass to the
// block's centre: up to half a texel of shift per level, so a bar under the
// glass drifted from its sharp edge by up to 1.1 px at DPR 1 depending on where
// it lay (R-189, 18 Nov. 2026; open since the 11 Oct. A12Z pyramid).
// The tent is read by four bilinear taps three quarters of a texel around the
// destination centre, each tap one exact [1, 3] pair: textureLoad with manual
// weights, the pass binding no sampler. Edges repeat the last texel.
@group(0) @binding(0) var source_level: texture_2d<f32>;

fn source_texel(texel: vec2<i32>, last: vec2<i32>) -> vec4<f32> {
    return textureLoad(source_level, clamp(texel, vec2<i32>(0), last), 0);
}

// A bilinear read at `point`, in source texels (a texel's centre at i + 0.5).
fn source_bilinear(point: vec2<f32>, last: vec2<i32>) -> vec4<f32> {
    let shifted = point - vec2<f32>(0.5);
    let base = floor(shifted);
    let weight = shifted - base;
    let texel = vec2<i32>(base);
    let top = mix(source_texel(texel, last), source_texel(texel + vec2<i32>(1, 0), last), weight.x);
    let bottom = mix(source_texel(texel + vec2<i32>(0, 1), last), source_texel(texel + vec2<i32>(1, 1), last), weight.x);
    return mix(top, bottom, weight.y);
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let last = vec2<i32>(textureDimensions(source_level)) - vec2<i32>(1);
    let centre = position.xy * 2.0;
    return (source_bilinear(centre + vec2<f32>(-0.75, -0.75), last)
        + source_bilinear(centre + vec2<f32>(0.75, -0.75), last)
        + source_bilinear(centre + vec2<f32>(-0.75, 0.75), last)
        + source_bilinear(centre + vec2<f32>(0.75, 0.75), last)) * 0.25;
}
