// Media effects (R-184): the chain of a video strip, drawn on the media it
// carries. Joined after a pipeline's own file (media_fx/mod.rs), which declares
// `media_fx` (this uniform), `media_fx_lut`, `media_sample(uv)` (the media's
// display-referred sRGB colour and alpha at a texture uv) and
// `media_fx_lut_sample(coord)`. Compiled by media_fx/stack.rs: an effect at its
// identity never reaches a slot, a chain of none costs one uniform read.

struct MediaFxSlot {
    // x = kind (stack.rs MediaFxKind), y = 1 when it reads its neighbourhood
    head: vec4<f32>,
    p: array<vec4<f32>, 11>,
};

struct MediaFx {
    // x = slot count, y = clock (s), z = 1 when a LUT is bound, w = its edge
    info: vec4<f32>,
    // xy = displayed size of the media in logical px
    size: vec4<f32>,
    // texture uv of the media's top-left corner (xy) and its extent (zw)
    uv_rect: vec4<f32>,
    lut_min: vec4<f32>,
    lut_max: vec4<f32>,
    slots: array<MediaFxSlot, 12>,
};

const FX_COLOR: u32 = 1u;
const FX_WHEELS: u32 = 2u;
const FX_CURVES: u32 = 3u;
const FX_HSL: u32 = 4u;
const FX_LUT: u32 = 5u;
const FX_BW: u32 = 6u;
const FX_BLUR: u32 = 7u;
const FX_SHARPEN: u32 = 8u;
const FX_DENOISE: u32 = 9u;
const FX_VIGNETTE: u32 = 10u;
const FX_GRAIN: u32 = 11u;
const FX_GLOW: u32 = 12u;
const FX_ABERRATION: u32 = 13u;
const FX_PIXELATE: u32 = 14u;
const FX_CHROMA_KEY: u32 = 15u;
const FX_LUMA_KEY: u32 = 16u;
const FX_MASK: u32 = 17u;
const FX_MAX_SLOTS: u32 = 12u;

const FX_LUMA: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);

fn fx_kind(s: u32) -> u32 {
    return u32(media_fx.slots[s].head.x + 0.5);
}

fn fx_reads_neighbours(s: u32) -> bool {
    return media_fx.slots[s].head.y > 0.5;
}

fn fx_p(s: u32, i: u32) -> vec4<f32> {
    return media_fx.slots[s].p[i];
}

fn fx_f(s: u32, i: u32) -> f32 {
    return media_fx.slots[s].p[i / 4u][i % 4u];
}

// Media-local coordinates: (0,0) the top-left corner of what is shown, (1,1) its bottom-right.
fn fx_local(uv: vec2<f32>) -> vec2<f32> {
    return (uv - media_fx.uv_rect.xy) / media_fx.uv_rect.zw;
}

fn fx_uv(local: vec2<f32>) -> vec2<f32> {
    return media_fx.uv_rect.xy + local * media_fx.uv_rect.zw;
}

// A distance in displayed px as a texture-uv offset.
fn fx_px_to_uv(px: vec2<f32>) -> vec2<f32> {
    return px / media_fx.size.xy * media_fx.uv_rect.zw;
}

// The media at `uv` through the pixel effects of slots [0, upto): what a
// neighbourhood effect at slot `upto` reads around its pixel.
fn fx_fetch(uv: vec2<f32>, upto: u32) -> vec4<f32> {
    var c = media_sample(uv);
    let local = fx_local(uv);
    for (var s = 0u; s < upto; s = s + 1u) {
        if (!fx_reads_neighbours(s) || fx_kind(s) == FX_CHROMA_KEY) {
            c = fx_point(c, s, local);
        }
    }
    return c;
}

fn fx_point(c: vec4<f32>, s: u32, local: vec2<f32>) -> vec4<f32> {
    switch fx_kind(s) {
        case 1u: { return vec4<f32>(fx_color(c.rgb, s), c.a); }
        case 2u: { return vec4<f32>(fx_wheels(c.rgb, s), c.a); }
        case 3u: { return vec4<f32>(fx_curves(c.rgb, s), c.a); }
        case 4u: { return vec4<f32>(fx_hsl(c.rgb, s), c.a); }
        case 5u: { return vec4<f32>(fx_lut(c.rgb, s), c.a); }
        case 6u: { return vec4<f32>(fx_bw(c.rgb, s), c.a); }
        case 10u: { return fx_vignette(c, s, local); }
        case 11u: { return fx_grain(c, s, local); }
        case 15u: {
            let rgb = clamp(c.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
            return fx_key_out(fx_key_spill(rgb, s), c.a * fx_key_alpha(rgb, s), s);
        }
        case 16u: { return fx_luma_key(c, s); }
        case 17u: { return fx_mask(c, s, local); }
        default: { return c; }
    }
}

// The media's colour and alpha at `uv` through the whole chain, in its order.
fn media_fx_apply(uv: vec2<f32>) -> vec4<f32> {
    var c = media_sample(uv);
    let count = min(u32(media_fx.info.x + 0.5), FX_MAX_SLOTS);
    let local = fx_local(uv);
    for (var s = 0u; s < count; s = s + 1u) {
        if (fx_reads_neighbours(s)) {
            c = fx_neighbourhood(c, s, uv, local);
        } else {
            c = fx_point(c, s, local);
        }
    }
    return clamp(c, vec4<f32>(0.0), vec4<f32>(1.0));
}
