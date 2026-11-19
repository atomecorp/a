// Neighbourhood effects of the media chain, one pass: each reads the media
// around its pixel through the pixel effects placed before it (`fx_fetch`)
// and adds what it changes to the pixel as the chain left it, so effects of
// either kind keep stacking in the strip's order. Taps are averaged with
// premultiplied alpha (a key's transparent edge blurs without a dark fringe).

const FX_TAPS: u32 = 32u;
const FX_GOLDEN_ANGLE: f32 = 2.39996323;
const FX_BLUR_DIRECTIONAL: u32 = 1u;
const FX_BLUR_RADIAL: u32 = 2u;
const FX_BLUR_ZOOM: u32 = 3u;
const FX_BLUR_LENS: u32 = 4u;

fn fx_premultiplied(c: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(c.rgb * c.a, c.a);
}

fn fx_straight(c: vec4<f32>) -> vec4<f32> {
    if (c.a <= 0.00001) {
        return vec4<f32>(0.0);
    }
    return vec4<f32>(c.rgb / c.a, c.a);
}

fn fx_ring(i: u32, count: u32) -> vec2<f32> {
    let angle = f32(i) * 6.2831853 / f32(count);
    return vec2<f32>(cos(angle), sin(angle));
}

fn fx_neighbourhood(c: vec4<f32>, s: u32, uv: vec2<f32>, local: vec2<f32>) -> vec4<f32> {
    switch fx_kind(s) {
        case 7u: { return fx_blur(c, s, uv, local); }
        case 8u: { return fx_sharpen(c, s, uv); }
        case 9u: { return fx_denoise(c, s, uv); }
        case 12u: { return fx_glow(c, s, uv); }
        case 13u: { return fx_aberration(c, s, uv, local); }
        case 14u: { return fx_pixelate(s, local); }
        case 15u: { return fx_key_edges(c, s, uv); }
        default: { return c; }
    }
}

// p0 (mode, radius px, angle, mix), p1 (centre x, centre y, zone on, zone size).
// Gaussian and lens on a golden-angle disc, directional along the angle,
// radial turning around the centre (radius read as degrees), zoom towards it.
// With the zone on, a sharp ellipse of `zone size` stays around the centre.
fn fx_blur(c: vec4<f32>, s: u32, uv: vec2<f32>, local: vec2<f32>) -> vec4<f32> {
    let p0 = fx_p(s, 0u);
    let p1 = fx_p(s, 1u);
    let mode = u32(p0.x + 0.5);
    let radius = p0.y;
    let center = p1.xy;
    var amount = p0.w;
    if (p1.z > 0.5) {
        let inner = p1.w * 0.5;
        amount = amount * smoothstep(inner, inner + 0.21, length(local - center));
    }
    if (amount <= 0.0) {
        return c;
    }
    let base = fx_fetch(uv, s);
    let direction = vec2<f32>(cos(p0.z), sin(p0.z));
    let span = max(media_fx.size.x, media_fx.size.y);
    var sum = vec4<f32>(0.0);
    var total = 0.0;
    for (var i = 0u; i < FX_TAPS; i = i + 1u) {
        let fi = f32(i);
        let line = fi / f32(FX_TAPS - 1u);
        var tap_uv = uv;
        var weight = 1.0;
        if (mode == FX_BLUR_DIRECTIONAL) {
            let t = (line - 0.5) * 2.0;
            tap_uv = uv + fx_px_to_uv(direction * t * radius);
            weight = exp(-2.0 * t * t);
        } else if (mode == FX_BLUR_RADIAL) {
            let angle = radians((line - 0.5) * radius);
            let px = (local - center) * media_fx.size.xy;
            let turned = vec2<f32>(px.x * cos(angle) - px.y * sin(angle), px.x * sin(angle) + px.y * cos(angle));
            tap_uv = fx_uv(center + turned / media_fx.size.xy);
        } else if (mode == FX_BLUR_ZOOM) {
            let scale = 1.0 - line * radius * 4.0 / span;
            tap_uv = fx_uv(center + (local - center) * scale);
            weight = 1.0 - line * 0.5;
        } else {
            let r = sqrt((fi + 0.5) / f32(FX_TAPS));
            let theta = fi * FX_GOLDEN_ANGLE;
            tap_uv = uv + fx_px_to_uv(vec2<f32>(cos(theta), sin(theta)) * r * radius);
            weight = select(exp(-2.0 * r * r), 1.0, mode == FX_BLUR_LENS);
        }
        let tap = fx_fetch(tap_uv, s);
        if (mode == FX_BLUR_LENS) {
            // The bright points of a lens blur open into discs.
            weight = weight * (1.0 + 8.0 * max(dot(tap.rgb, FX_LUMA) - 0.72, 0.0));
        }
        sum = sum + fx_premultiplied(tap) * weight;
        total = total + weight;
    }
    let blurred = fx_straight(sum / total);
    return c + (blurred - base) * amount;
}

// p0 (amount, radius px, threshold): the unsharp mask; detail below the threshold stays.
fn fx_sharpen(c: vec4<f32>, s: u32, uv: vec2<f32>) -> vec4<f32> {
    let p0 = fx_p(s, 0u);
    let center = fx_fetch(uv, s);
    var sum = vec3<f32>(0.0);
    for (var i = 0u; i < 8u; i = i + 1u) {
        sum = sum + fx_fetch(uv + fx_px_to_uv(fx_ring(i, 8u) * p0.y), s).rgb;
    }
    var detail = center.rgb - sum / 8.0;
    detail = detail * smoothstep(p0.z, p0.z * 2.0 + 0.001, length(detail));
    return vec4<f32>(c.rgb + detail * p0.x, c.a);
}

// p0.x = strength: a bilateral filter on two rings, edges kept.
fn fx_denoise(c: vec4<f32>, s: u32, uv: vec2<f32>) -> vec4<f32> {
    let strength = fx_p(s, 0u).x;
    let center = fx_fetch(uv, s);
    let sigma = mix(0.02, 0.21, strength);
    var sum = center.rgb;
    var total = 1.0;
    for (var ring = 1u; ring <= 2u; ring = ring + 1u) {
        let distance = f32(ring) * 1.5 * (1.0 + strength);
        let spatial = exp(-f32(ring * ring) * 0.25);
        for (var i = 0u; i < 8u; i = i + 1u) {
            let tap = fx_fetch(uv + fx_px_to_uv(fx_ring(i, 8u) * distance), s).rgb;
            let d = tap - center.rgb;
            let weight = exp(-dot(d, d) / (2.0 * sigma * sigma)) * spatial;
            sum = sum + tap * weight;
            total = total + weight;
        }
    }
    return vec4<f32>(c.rgb + (sum / total - center.rgb), c.a);
}

// p0 (threshold, intensity, radius px): what is brighter than the threshold, blurred and added.
fn fx_glow(c: vec4<f32>, s: u32, uv: vec2<f32>) -> vec4<f32> {
    let p0 = fx_p(s, 0u);
    var sum = vec3<f32>(0.0);
    var total = 0.0;
    for (var i = 0u; i < FX_TAPS; i = i + 1u) {
        let fi = f32(i);
        let r = sqrt((fi + 0.5) / f32(FX_TAPS));
        let theta = fi * FX_GOLDEN_ANGLE;
        let tap = fx_fetch(uv + fx_px_to_uv(vec2<f32>(cos(theta), sin(theta)) * r * p0.z), s);
        let bright = max(tap.rgb - vec3<f32>(p0.x), vec3<f32>(0.0)) / (1.0 - p0.x) * tap.a;
        let weight = exp(-2.0 * r * r);
        sum = sum + bright * weight;
        total = total + weight;
    }
    return vec4<f32>(c.rgb + sum / total * p0.y, c.a);
}

// p0.x = amount px at the corners: red and blue drift apart from the centre outwards.
fn fx_aberration(c: vec4<f32>, s: u32, uv: vec2<f32>, local: vec2<f32>) -> vec4<f32> {
    let offset = fx_px_to_uv((local - vec2<f32>(0.5)) * 2.0 * fx_p(s, 0u).x);
    let base = fx_fetch(uv, s);
    let red = fx_fetch(uv + offset, s).r;
    let blue = fx_fetch(uv - offset, s).b;
    return vec4<f32>(c.r + red - base.r, c.g, c.b + blue - base.b, c.a);
}

// p0.x = block size px: the block's centre colour fills the block.
fn fx_pixelate(s: u32, local: vec2<f32>) -> vec4<f32> {
    let block = fx_p(s, 0u).x / media_fx.size.xy;
    let snapped = (floor(local / block) + vec2<f32>(0.5)) * block;
    return fx_fetch(fx_uv(snapped), s);
}

// A key whose edges move (p1.y px): the kept matte grows (> 0) or shrinks (< 0)
// by the largest or smallest kept alpha on a ring of that radius.
fn fx_key_edges(c: vec4<f32>, s: u32, uv: vec2<f32>) -> vec4<f32> {
    let edges = fx_p(s, 1u).y;
    let rgb = clamp(c.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    var alpha = fx_key_alpha(rgb, s) * c.a;
    for (var i = 0u; i < 8u; i = i + 1u) {
        let tap = fx_fetch(uv + fx_px_to_uv(fx_ring(i, 8u) * abs(edges)), s);
        let kept = fx_key_alpha(clamp(tap.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), s) * tap.a;
        alpha = select(min(alpha, kept), max(alpha, kept), edges > 0.0);
    }
    return fx_key_out(fx_key_spill(rgb, s), alpha, s);
}
