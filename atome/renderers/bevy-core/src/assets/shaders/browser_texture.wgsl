// A browser image copied by the GPU into a texture (browser_texture_web.rs): a text's Canvas2D raster arrives
// premultiplied (the canvas's own bytes, copied without a read-back) and leaves with straight alpha, the form the
// sprite pipeline blends. A fully transparent texel takes the alpha-weighted colour of its eight neighbours, so a
// filtered glyph edge never darkens towards black (the sum of straight colour times alpha is the sum of
// premultiplied colours, so the canvas's own bytes give the same bleed a CPU pass gave). A spatial mask
// multiplies the alpha as shape_texture.rs#apply_spatial_mask_to_texture does: the nearest mask texel, an integer
// product of the two alpha bytes. Every value stays in the sRGB encoding Canvas2D painted: both textures are read
// through their raw Rgba8Unorm format and the target is written through its Rgba8Unorm view.
#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

struct BrowserTexture {
    // x: 1 when the mask texture holds a spatial mask, 0 for the white texel of an unmasked image.
    mask: vec4<f32>,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var mask: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: BrowserTexture;

fn straight(at: vec2<i32>, size: vec2<i32>) -> vec4<f32> {
    let texel = textureLoad(source, at, 0);
    if (texel.a > 0.0) {
        return vec4<f32>(min(texel.rgb / texel.a, vec3<f32>(1.0)), texel.a);
    }
    var sum = vec3<f32>(0.0);
    var weight = 0.0;
    for (var dy = -1; dy <= 1; dy += 1) {
        for (var dx = -1; dx <= 1; dx += 1) {
            let near = at + vec2<i32>(dx, dy);
            if ((dx == 0 && dy == 0) || any(near < vec2<i32>(0)) || any(near >= size)) {
                continue;
            }
            let neighbour = textureLoad(source, near, 0);
            sum += neighbour.rgb;
            weight += neighbour.a;
        }
    }
    if (weight > 0.0) {
        return vec4<f32>(sum / weight, 0.0);
    }
    return vec4<f32>(0.0);
}

@fragment
fn convert(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let size = vec2<i32>(textureDimensions(source));
    let at = vec2<i32>(floor(in.position.xy));
    var color = straight(at, size);
    if (params.mask.x > 0.5) {
        let mask_size = vec2<f32>(textureDimensions(mask));
        let scaled = floor((vec2<f32>(at) + vec2<f32>(0.5)) * mask_size / vec2<f32>(size));
        let mask_at = vec2<i32>(clamp(scaled, vec2<f32>(0.0), mask_size - vec2<f32>(1.0)));
        let coverage = u32(round(textureLoad(mask, mask_at, 0).a * 255.0));
        let alpha = u32(round(color.a * 255.0));
        color.a = f32(alpha * coverage / 255u) / 255.0;
    }
    return color;
}
