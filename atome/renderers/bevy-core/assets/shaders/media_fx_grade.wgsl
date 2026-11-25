// Pixel effects of the media chain: grading, keys, mask, vignette, grain. Each
// mirrors its CPU reference in media_fx/grade.rs (same steps, same order).

fn fx_srgb_to_linear(c: vec3<f32>) -> vec3<f32> {
    let low = c / 12.92;
    let high = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
    return select(high, low, c <= vec3<f32>(0.04045));
}

fn fx_linear_to_srgb(c_in: vec3<f32>) -> vec3<f32> {
    let c = max(c_in, vec3<f32>(0.0));
    let low = c * 12.92;
    let high = 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
    return select(high, low, c <= vec3<f32>(0.0031308));
}

fn fx_hue_rotate(c: vec3<f32>, h: f32) -> vec3<f32> {
    let cs = cos(h);
    let sn = sin(h);
    return vec3<f32>(
        dot(c, vec3<f32>(0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928)),
        dot(c, vec3<f32>(0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283)),
        dot(c, vec3<f32>(0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072))
    );
}

// p0 (exposure gain, pivot, contrast, brightness), p1 (white balance, saturate),
// p2 (vibrance, highlights, shadows, hue), p3 (grayscale, sepia, invert, exposure on).
fn fx_color(rgb: vec3<f32>, s: u32) -> vec3<f32> {
    let p0 = fx_p(s, 0u);
    let p1 = fx_p(s, 1u);
    let p2 = fx_p(s, 2u);
    let p3 = fx_p(s, 3u);
    var c = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    if (p3.w > 0.5) {
        c = fx_linear_to_srgb(fx_srgb_to_linear(c) * p0.x);
    }
    c = c * p0.w * p1.xyz;
    c = (c - vec3<f32>(p0.y)) * p0.z + vec3<f32>(p0.y);
    let y = dot(c, FX_LUMA);
    c = c + vec3<f32>(p2.z * 0.5 * (1.0 - smoothstep(0.0, 0.55, y)) + p2.y * 0.5 * smoothstep(0.45, 1.0, y));
    if (p2.w != 0.0) {
        c = fx_hue_rotate(c, p2.w);
    }
    c = mix(vec3<f32>(dot(c, FX_LUMA)), c, p1.w);
    let spread = clamp(max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)), 0.0, 1.0);
    c = mix(vec3<f32>(dot(c, FX_LUMA)), c, 1.0 + p2.x * (1.0 - spread));
    let sepia = vec3<f32>(
        dot(c, vec3<f32>(0.393, 0.769, 0.189)),
        dot(c, vec3<f32>(0.349, 0.686, 0.168)),
        dot(c, vec3<f32>(0.272, 0.534, 0.131))
    );
    c = mix(c, sepia, p3.y);
    c = mix(c, vec3<f32>(dot(c, FX_LUMA)), p3.x);
    c = mix(c, vec3<f32>(1.0) - c, p3.z);
    return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

// p0 (offset, lift sat), p1 (lift, gamma sat), p2 (gain, gain sat), p3 (gamma exponent).
fn fx_wheels(rgb: vec3<f32>, s: u32) -> vec3<f32> {
    let p0 = fx_p(s, 0u);
    let p1 = fx_p(s, 1u);
    let p2 = fx_p(s, 2u);
    let p3 = fx_p(s, 3u);
    var c = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) + p0.xyz;
    c = c + p1.xyz * (vec3<f32>(1.0) - c);
    c = c * p2.xyz;
    c = pow(max(c, vec3<f32>(0.0)), p3.xyz);
    let y = dot(c, FX_LUMA);
    let low = 1.0 - smoothstep(0.0, 0.5, y);
    let high = smoothstep(0.5, 1.0, y);
    let mid = max(1.0 - low - high, 0.0);
    c = mix(vec3<f32>(y), c, low * p0.w + mid * p1.w + high * p2.w);
    return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Curve `curve` (0 luma, 1 red, 2 green, 3 blue): 5 points then 5 tangents.
fn fx_curve(s: u32, curve: u32, x_in: f32) -> f32 {
    let base = curve * 10u;
    let x = clamp(x_in, 0.0, 1.0);
    let k = min(u32(floor(x * 4.0)), 3u);
    let t = x * 4.0 - f32(k);
    let t2 = t * t;
    let t3 = t2 * t;
    let y = (2.0 * t3 - 3.0 * t2 + 1.0) * fx_f(s, base + k)
        + (t3 - 2.0 * t2 + t) * 0.25 * fx_f(s, base + 5u + k)
        + (-2.0 * t3 + 3.0 * t2) * fx_f(s, base + k + 1u)
        + (t3 - t2) * 0.25 * fx_f(s, base + 6u + k);
    return clamp(y, 0.0, 1.0);
}

fn fx_curves(rgb: vec3<f32>, s: u32) -> vec3<f32> {
    let c = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let master = vec3<f32>(fx_curve(s, 0u, c.r), fx_curve(s, 0u, c.g), fx_curve(s, 0u, c.b));
    return vec3<f32>(fx_curve(s, 1u, master.r), fx_curve(s, 2u, master.g), fx_curve(s, 3u, master.b));
}

// Hue (degrees), saturation, lightness.
fn fx_rgb_to_hsl(c: vec3<f32>) -> vec3<f32> {
    let high = max(c.r, max(c.g, c.b));
    let low = min(c.r, min(c.g, c.b));
    let l = (high + low) * 0.5;
    let d = high - low;
    if (d <= 1e-5) {
        return vec3<f32>(0.0, 0.0, l);
    }
    let sat = d / (1.0 - abs(2.0 * l - 1.0));
    var h = 0.0;
    if (high == c.r) {
        h = (c.g - c.b) / d;
    } else if (high == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }
    return vec3<f32>(fract(h / 6.0 + 1.0) * 360.0, clamp(sat, 0.0, 1.0), l);
}

fn fx_hsl_to_rgb(hsl: vec3<f32>) -> vec3<f32> {
    let k = (vec3<f32>(0.0, 8.0, 4.0) + vec3<f32>(hsl.x / 30.0)) % vec3<f32>(12.0);
    let a = hsl.y * min(hsl.z, 1.0 - hsl.z);
    return vec3<f32>(hsl.z) - a * clamp(min(k - vec3<f32>(3.0), vec3<f32>(9.0) - k), vec3<f32>(-1.0), vec3<f32>(1.0));
}

// Secondary on one hue range: p0 (target hue, half range, softness, hue shift), p1 (saturation, luminance).
fn fx_hsl(rgb: vec3<f32>, s: u32) -> vec3<f32> {
    let p0 = fx_p(s, 0u);
    let p1 = fx_p(s, 1u);
    let c = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let hsl = fx_rgb_to_hsl(c);
    var distance = abs(hsl.x - p0.x);
    distance = min(distance, 360.0 - distance);
    // A grey has no hue: it stays out of every range.
    let weight = (1.0 - smoothstep(p0.y, p0.y + max(p0.z, 0.001), distance)) * smoothstep(0.02, 0.1, hsl.y);
    if (weight <= 0.0) {
        return c;
    }
    let hue = fract((hsl.x + p0.w * weight) / 360.0 + 1.0) * 360.0;
    let sat = clamp(hsl.y * mix(1.0, p1.x, weight), 0.0, 1.0);
    let light = clamp(hsl.z + p1.y * weight * 0.5, 0.0, 1.0);
    return fx_hsl_to_rgb(vec3<f32>(hue, sat, light));
}

// p0.x = intensity; the cube is sampled at texel centres (trilinear).
fn fx_lut(rgb: vec3<f32>, s: u32) -> vec3<f32> {
    if (media_fx.info.z < 0.5) {
        return rgb;
    }
    let n = media_fx.info.w;
    let t = clamp((rgb - media_fx.lut_min.xyz) / (media_fx.lut_max.xyz - media_fx.lut_min.xyz), vec3<f32>(0.0), vec3<f32>(1.0));
    let graded = media_fx_lut_sample(t * (n - 1.0) / n + vec3<f32>(0.5 / n));
    return mix(rgb, graded, fx_p(s, 0u).x);
}

// p0 (red, green, blue weights, contrast).
fn fx_bw(rgb: vec3<f32>, s: u32) -> vec3<f32> {
    let p0 = fx_p(s, 0u);
    let y = (dot(rgb, p0.xyz) - 0.5) * p0.w + 0.5;
    return vec3<f32>(clamp(y, 0.0, 1.0));
}

// p0 (amount, size, softness, roundness): darkens from `size` (of the half
// diagonal) outwards; roundness 1 is a circle, 0 follows the frame.
fn fx_vignette(c: vec4<f32>, s: u32, local: vec2<f32>) -> vec4<f32> {
    let p0 = fx_p(s, 0u);
    let stretch = vec2<f32>(mix(1.0, media_fx.size.x / media_fx.size.y, p0.w), 1.0);
    let r = length((local - vec2<f32>(0.5)) * 2.0 * stretch) / length(stretch);
    let shade = smoothstep(p0.y, p0.y + max(p0.z, 0.001), r);
    return vec4<f32>(clamp(c.rgb * (1.0 - p0.x * shade), vec3<f32>(0.0), vec3<f32>(1.0)), c.a);
}

fn fx_hash(x: u32) -> u32 {
    let v = x * 747796405u + 2891336453u;
    let w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
    return (w >> 22u) ^ w;
}

// p0 (amount, grain size px): a new grain 24 times a second, strongest in the mid-tones.
fn fx_grain(c: vec4<f32>, s: u32, local: vec2<f32>) -> vec4<f32> {
    let p0 = fx_p(s, 0u);
    let cell = max(floor(local * media_fx.size.xy / p0.y), vec2<f32>(0.0));
    let frame = u32(media_fx.info.y * 24.0);
    let h = fx_hash(u32(cell.x) + fx_hash(u32(cell.y) + fx_hash(frame)));
    let n = f32(h) / 4294967295.0 - 0.5;
    let y = dot(c.rgb, FX_LUMA);
    let weight = 1.0 - abs(2.0 * y - 1.0) * 0.5;
    return vec4<f32>(clamp(c.rgb + vec3<f32>(n * p0.x * weight), vec3<f32>(0.0), vec3<f32>(1.0)), c.a);
}

fn fx_chroma(c: vec3<f32>) -> vec2<f32> {
    let y = dot(c, FX_LUMA);
    return vec2<f32>((c.b - y) / 1.8556, (c.r - y) / 1.5748);
}

// p0 (key Cb, key Cr, tolerance, softness): 0 keyed out, 1 kept.
fn fx_key_alpha(c: vec3<f32>, s: u32) -> f32 {
    let p0 = fx_p(s, 0u);
    let distance = length(fx_chroma(c) - p0.xy) / max(length(p0.xy), 0.05);
    return smoothstep(p0.z, p0.z + max(p0.w, 0.0001), distance);
}

// p1.x = spill: the share of the key's chroma removed from what is kept.
fn fx_key_spill(c: vec3<f32>, s: u32) -> vec3<f32> {
    let key = fx_p(s, 0u).xy;
    let unit = key / max(length(key), 0.0001);
    let y = dot(c, FX_LUMA);
    var chroma = fx_chroma(c);
    chroma = chroma - unit * max(dot(chroma, unit), 0.0) * fx_p(s, 1u).x;
    let r = y + 1.5748 * chroma.y;
    let b = y + 1.8556 * chroma.x;
    let g = (y - FX_LUMA.x * r - FX_LUMA.z * b) / FX_LUMA.y;
    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

// p1.z = matte: the key shown as black (keyed out) and white (kept).
fn fx_key_out(rgb: vec3<f32>, alpha: f32, s: u32) -> vec4<f32> {
    if (fx_p(s, 1u).z > 0.5) {
        return vec4<f32>(vec3<f32>(alpha), 1.0);
    }
    return vec4<f32>(rgb, alpha);
}

// p0 (low, high, softness, invert): keeps the tones between low and high.
fn fx_luma_key(c: vec4<f32>, s: u32) -> vec4<f32> {
    let p0 = fx_p(s, 0u);
    let soft = max(p0.z, 0.0001);
    let y = dot(c.rgb, FX_LUMA);
    var keep = smoothstep(p0.x - soft, p0.x, y) * (1.0 - smoothstep(p0.y, p0.y + soft, y));
    if (p0.w > 0.5) {
        keep = 1.0 - keep;
    }
    return vec4<f32>(c.rgb, c.a * keep);
}

// p0 (shape 0 ellipse / 1 rectangle, centre x, centre y, width), p1 (height, feather, invert).
fn fx_mask(c: vec4<f32>, s: u32, local: vec2<f32>) -> vec4<f32> {
    let p0 = fx_p(s, 0u);
    let p1 = fx_p(s, 1u);
    let half_size = max(vec2<f32>(p0.w, p1.x) * 0.5, vec2<f32>(0.0001));
    let q = (local - p0.yz) / half_size;
    var r = length(q);
    if (p0.x > 1.5) {
        // Star: five points, one up; its edge runs from the tips (1) to the hollows (0.45) by the angle.
        let turn = fract((atan2(q.y, q.x) + 1.5707964) * 0.7957747);
        r = r / mix(0.45, 1.0, abs(turn * 2.0 - 1.0));
    } else if (p0.x > 0.5) {
        r = max(abs(q.x), abs(q.y));
    }
    var keep = 1.0 - smoothstep(1.0 - max(p1.y, 0.0001), 1.0, r);
    if (p1.z > 0.5) {
        keep = 1.0 - keep;
    }
    return vec4<f32>(c.rgb, c.a * keep);
}
