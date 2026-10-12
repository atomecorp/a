// One level of the workspace blur pyramid: mip N is rendered from mip N-1.
// Each destination texel averages its 2x2 source block at integer coordinates,
// as Bevy's single-pass downsampler does. A bilinear tap at the texel centre is
// not equivalent: with odd level sizes it drifts onto source texel centres and
// degrades into point sampling, which shows as stepped bands in the blur.
@group(0) @binding(0) var source_level: texture_2d<f32>;

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let last = vec2<i32>(textureDimensions(source_level)) - vec2<i32>(1);
    let origin = vec2<i32>(position.xy) * 2;
    let a = textureLoad(source_level, min(origin, last), 0);
    let b = textureLoad(source_level, min(origin + vec2<i32>(1, 0), last), 0);
    let c = textureLoad(source_level, min(origin + vec2<i32>(0, 1), last), 0);
    let d = textureLoad(source_level, min(origin + vec2<i32>(1, 1), last), 0);
    return (a + b + c + d) * 0.25;
}
