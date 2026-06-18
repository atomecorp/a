#import bevy_sprite::mesh2d_functions

struct VideoParams {
    // x = opacity, y = brightness, z = contrast, w = saturate
    base: vec4<f32>,
    // x = grayscale, y = sepia, z = invert, w = hue (radians)
    filters: vec4<f32>,
};

@group(2) @binding(0) var video_frame: texture_external;
@group(2) @binding(1) var video_sampler: sampler;

@group(2) @binding(2) var<uniform> video_params: VideoParams;

struct Vertex {
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let model = mesh2d_functions::get_world_from_local(vertex.instance_index);
    out.clip_position = mesh2d_functions::mesh2d_position_local_to_clip(
        model,
        vec4<f32>(vertex.position, 1.0)
    );
    out.uv = vertex.uv;
    return out;
}

// External textures sample in display-encoded sRGB. Bevy's 2d target is sRGB
// (or HDR-linear), so the GPU re-applies the sRGB OETF on store. Without this
// decode the encode is applied twice, lifting blacks and washing out contrast.
fn srgb_to_linear(srgb: vec3<f32>) -> vec3<f32> {
    let cutoff = srgb <= vec3<f32>(0.04045);
    let low = srgb / 12.92;
    let high = pow((srgb + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
    return select(high, low, cutoff);
}

const FILTER_LUMA: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);

// CSS-style per-clip color filters applied in display (sRGB) space, before the
// sRGB->linear decode. base = (opacity, brightness, contrast, saturate);
// filters = (grayscale, sepia, invert, hue-radians). Identity = (_,1,1,1)/(0,0,0,0).
fn apply_color_filters(color_in: vec3<f32>, base: vec4<f32>, filters: vec4<f32>) -> vec3<f32> {
    var c = color_in * base.y;                           // brightness
    c = (c - vec3<f32>(0.5)) * base.z + vec3<f32>(0.5);  // contrast
    let h = filters.w;                                   // hue-rotate (W3C matrix)
    if (h != 0.0) {
        let cs = cos(h);
        let sn = sin(h);
        let r = dot(c, vec3<f32>(0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928));
        let g = dot(c, vec3<f32>(0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283));
        let b = dot(c, vec3<f32>(0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072));
        c = vec3<f32>(r, g, b);
    }
    let luma_s = dot(c, FILTER_LUMA);                    // saturate
    c = mix(vec3<f32>(luma_s), c, base.w);
    let sepia = vec3<f32>(                               // sepia
        dot(c, vec3<f32>(0.393, 0.769, 0.189)),
        dot(c, vec3<f32>(0.349, 0.686, 0.168)),
        dot(c, vec3<f32>(0.272, 0.534, 0.131))
    );
    c = mix(c, sepia, filters.y);
    let luma_g = dot(c, FILTER_LUMA);                    // grayscale
    c = mix(c, vec3<f32>(luma_g), filters.x);
    c = mix(c, vec3<f32>(1.0) - c, filters.z);           // invert
    return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let frame = textureSampleBaseClampToEdge(video_frame, video_sampler, in.uv);
    let filtered = apply_color_filters(frame.rgb, video_params.base, video_params.filters);
    let opacity = clamp(video_params.base.x, 0.0, 1.0);
    return vec4<f32>(srgb_to_linear(filtered), opacity);
}
