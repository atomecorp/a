// Mip 0 of the workspace blur pyramid, taken from the view's own frame (the
// ordered snapshot under a record's glass). Each capture texel is the exact
// area average of the view pixels it covers, so an edge anywhere inside a
// texel keeps its true weight. A single sample per texel (Bevy's blit, a
// non-filtering sampler) moved every edge to the 4-pixel grid: the blur drifted
// from the sharp image by up to 1.3 px wherever the image lay (R-189,
// 18 Nov. 2026).
#ifdef SRGB_TO_LINEAR
#import bevy_render::color_operations::srgb_to_linear
#endif
#ifdef OKLAB_TO_LINEAR
#import bevy_render::color_operations::oklab_to_linear_rgb
#endif

// WORKSPACE_BACKDROP_DOWNSCALE, given by the pipeline (workspace_blur_snapshot.rs).
const BACKDROP_DOWNSCALE: u32 = #{BACKDROP_DOWNSCALE}u;

@group(0) @binding(0) var view_frame: texture_2d<f32>;

fn view_pixel(pixel: vec2<i32>) -> vec4<f32> {
    var color = textureLoad(view_frame, pixel, 0);
#ifdef SRGB_TO_LINEAR
    color = vec4(srgb_to_linear(color.rgb), color.a);
#endif
#ifdef OKLAB_TO_LINEAR
    color = vec4(oklab_to_linear_rgb(color.rgb), color.a);
#endif
    return color;
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<u32>(textureDimensions(view_frame));
    // backdrop_capture_pixel_size: the view divided by the downscale, rounded up.
    let capture = (size + vec2<u32>(BACKDROP_DOWNSCALE - 1u)) / vec2<u32>(BACKDROP_DOWNSCALE);
    let ratio = vec2<f32>(size) / vec2<f32>(capture);
    let low = floor(position.xy) * ratio;
    let high = low + ratio;
    let first = vec2<i32>(floor(low));
    let last = min(vec2<i32>(ceil(high)), vec2<i32>(size)) - vec2<i32>(1);
    var sum = vec4<f32>(0.0);
    for (var y = first.y; y <= last.y; y += 1) {
        let cover_y = min(high.y, f32(y + 1)) - max(low.y, f32(y));
        for (var x = first.x; x <= last.x; x += 1) {
            let cover_x = min(high.x, f32(x + 1)) - max(low.x, f32(x));
            sum += view_pixel(vec2<i32>(x, y)) * (cover_x * cover_y);
        }
    }
    return sum / (ratio.x * ratio.y);
}
