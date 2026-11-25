//! The colour math of the media effects, on the CPU: what the uniforms carry
//! (`compile` / `uniform`) and a reference of what `media_fx_grade.wgsl` does
//! with them (`apply`), the same steps in the same order. Colours are
//! display-referred (sRGB-encoded) values in 0..1, the space of the CSS filters
//! the video path already applies.

pub const LUMA: [f32; 3] = [0.2126, 0.7152, 0.0722];

pub fn luma(c: [f32; 3]) -> f32 {
    c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]
}

fn mix3(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [0, 1, 2].map(|i| a[i] + (b[i] - a[i]) * t)
}

fn clamp01(c: [f32; 3]) -> [f32; 3] {
    c.map(|value| value.clamp(0.0, 1.0))
}

pub fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

pub fn srgb_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

pub fn linear_to_srgb(value: f32) -> f32 {
    let value = value.max(0.0);
    if value <= 0.003_130_8 {
        value * 12.92
    } else {
        1.055 * value.powf(1.0 / 2.4) - 0.055
    }
}

/// The CSS (W3C) hue-rotate matrix, the one the video path already applies.
fn hue_rotate(c: [f32; 3], radians: f32) -> [f32; 3] {
    let (sn, cs) = radians.sin_cos();
    let r = [
        0.213 + cs * 0.787 - sn * 0.213,
        0.715 - cs * 0.715 - sn * 0.715,
        0.072 - cs * 0.072 + sn * 0.928,
    ];
    let g = [
        0.213 - cs * 0.213 + sn * 0.143,
        0.715 + cs * 0.285 + sn * 0.140,
        0.072 - cs * 0.072 - sn * 0.283,
    ];
    let b = [
        0.213 - cs * 0.213 - sn * 0.787,
        0.715 - cs * 0.715 + sn * 0.715,
        0.072 + cs * 0.928 + sn * 0.072,
    ];
    let dot = |m: [f32; 3]| m[0] * c[0] + m[1] * c[1] + m[2] * c[2];
    [dot(r), dot(g), dot(b)]
}

/// The primary correction (`color`): the CSS filters plus exposure, a contrast
/// pivot, vibrance, white balance and the shadows/highlights of the tone range.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ColorPrimary {
    pub exposure: f32,
    pub pivot: f32,
    pub contrast: f32,
    pub brightness: f32,
    pub saturate: f32,
    pub vibrance: f32,
    pub temperature: f32,
    pub tint: f32,
    pub highlights: f32,
    pub shadows: f32,
    /// Degrees.
    pub hue: f32,
    pub grayscale: f32,
    pub sepia: f32,
    pub invert: f32,
}

impl ColorPrimary {
    pub fn is_identity(&self) -> bool {
        self.exposure == 0.0
            && self.contrast == 1.0
            && self.brightness == 1.0
            && self.saturate == 1.0
            && self.vibrance == 0.0
            && self.temperature == 0.0
            && self.tint == 0.0
            && self.highlights == 0.0
            && self.shadows == 0.0
            && self.hue == 0.0
            && self.grayscale == 0.0
            && self.sepia == 0.0
            && self.invert == 0.0
    }

    /// White balance as channel gains: warm lifts red and lowers blue, a
    /// positive tint lowers green (towards magenta).
    fn white_balance(&self) -> [f32; 3] {
        let t = self.temperature / 100.0;
        let n = self.tint / 100.0;
        [1.0 + 0.2 * t, 1.0 - 0.2 * n, 1.0 - 0.2 * t]
    }

    /// p0 (exposure gain, pivot, contrast, brightness), p1 (white balance gains,
    /// saturate), p2 (vibrance, highlights, shadows, hue radians), p3 (grayscale,
    /// sepia, invert, exposure on).
    pub fn uniform(&self) -> [f32; 16] {
        let wb = self.white_balance();
        [
            self.exposure.exp2(),
            self.pivot,
            self.contrast.max(0.0),
            self.brightness.max(0.0),
            wb[0],
            wb[1],
            wb[2],
            self.saturate.max(0.0),
            self.vibrance,
            self.highlights,
            self.shadows,
            self.hue.to_radians(),
            self.grayscale.clamp(0.0, 1.0),
            self.sepia.clamp(0.0, 1.0),
            self.invert.clamp(0.0, 1.0),
            if self.exposure != 0.0 { 1.0 } else { 0.0 },
        ]
    }

    pub fn apply(&self, color: [f32; 3]) -> [f32; 3] {
        let u = self.uniform();
        let mut c = clamp01(color);
        if u[15] > 0.5 {
            c = c.map(|value| linear_to_srgb(srgb_to_linear(value) * u[0]));
        }
        c = c.map(|value| value * u[3]);
        c = [c[0] * u[4], c[1] * u[5], c[2] * u[6]];
        c = c.map(|value| (value - u[1]) * u[2] + u[1]);
        let y = luma(c);
        let lift =
            u[10] * 0.5 * (1.0 - smoothstep(0.0, 0.55, y)) + u[9] * 0.5 * smoothstep(0.45, 1.0, y);
        c = c.map(|value| value + lift);
        if u[11] != 0.0 {
            c = hue_rotate(c, u[11]);
        }
        c = mix3([luma(c); 3], c, u[7]);
        let spread = (c[0].max(c[1]).max(c[2]) - c[0].min(c[1]).min(c[2])).clamp(0.0, 1.0);
        c = mix3([luma(c); 3], c, 1.0 + u[8] * (1.0 - spread));
        let sepia = [
            c[0] * 0.393 + c[1] * 0.769 + c[2] * 0.189,
            c[0] * 0.349 + c[1] * 0.686 + c[2] * 0.168,
            c[0] * 0.272 + c[1] * 0.534 + c[2] * 0.131,
        ];
        c = mix3(c, sepia, u[13]);
        c = mix3(c, [luma(c); 3], u[12]);
        c = mix3(c, c.map(|value| 1.0 - value), u[14]);
        clamp01(c)
    }
}

/// One colour wheel: the puck (`x`, `y` in −1..1, its angle the hue, 0° = red
/// on +x, 120° green, 240° blue, y up) and the level under the wheel.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Wheel {
    pub x: f32,
    pub y: f32,
    pub level: f32,
}

impl Wheel {
    fn is_identity(&self) -> bool {
        self.x == 0.0 && self.y == 0.0 && self.level == 0.0
    }

    /// The puck as a colour shift with no luminance of its own.
    pub fn tint(&self) -> [f32; 3] {
        let magnitude = self.x.hypot(self.y).min(1.0);
        if magnitude == 0.0 {
            return [0.0; 3];
        }
        let hue = self.y.atan2(self.x).to_degrees().rem_euclid(360.0);
        let channel = |n: f32| {
            let k = (n + hue / 60.0) % 6.0;
            1.0 - k.min(4.0 - k).clamp(0.0, 1.0)
        };
        let rgb = [channel(5.0), channel(3.0), channel(1.0)];
        let y = luma(rgb);
        rgb.map(|value| (value - y) * magnitude)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Wheels {
    pub lift: Wheel,
    pub gamma: Wheel,
    pub gain: Wheel,
    pub offset: Wheel,
    pub lift_sat: f32,
    pub gamma_sat: f32,
    pub gain_sat: f32,
    pub offset_temperature: f32,
}

/// The wheels as per-channel operations (ASC CDL-like): `offset` added,
/// `lift` raising the blacks, `gain` scaling, `exponent` the gamma power, and
/// the saturation of each tone range.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WheelsCompiled {
    pub offset: [f32; 3],
    pub lift: [f32; 3],
    pub gain: [f32; 3],
    pub exponent: [f32; 3],
    pub sat: [f32; 3],
}

impl Wheels {
    pub fn is_identity(&self) -> bool {
        self.lift.is_identity()
            && self.gamma.is_identity()
            && self.gain.is_identity()
            && self.offset.is_identity()
            && self.lift_sat == 1.0
            && self.gamma_sat == 1.0
            && self.gain_sat == 1.0
            && self.offset_temperature == 0.0
    }

    pub fn compile(&self) -> WheelsCompiled {
        let lift = self.lift.tint();
        let gamma = self.gamma.tint();
        let gain = self.gain.tint();
        let offset = self.offset.tint();
        let warm = self.offset_temperature / 100.0 * 0.1;
        let warm = [warm, 0.0, -warm];
        WheelsCompiled {
            offset: [0, 1, 2].map(|i| self.offset.level * 0.25 + offset[i] * 0.25 + warm[i]),
            lift: [0, 1, 2].map(|i| self.lift.level * 0.5 + lift[i] * 0.5),
            gain: [0, 1, 2].map(|i| (1.0 + self.gain.level + gain[i]).max(0.0)),
            exponent: [0, 1, 2].map(|i| (-(self.gamma.level + gamma[i])).exp2()),
            sat: [self.lift_sat, self.gamma_sat, self.gain_sat],
        }
    }
}

impl WheelsCompiled {
    /// p0 (offset, lift sat), p1 (lift, gamma sat), p2 (gain, gain sat), p3 (exponent).
    pub fn uniform(&self) -> [f32; 16] {
        [
            self.offset[0],
            self.offset[1],
            self.offset[2],
            self.sat[0],
            self.lift[0],
            self.lift[1],
            self.lift[2],
            self.sat[1],
            self.gain[0],
            self.gain[1],
            self.gain[2],
            self.sat[2],
            self.exponent[0],
            self.exponent[1],
            self.exponent[2],
            0.0,
        ]
    }

    pub fn apply(&self, color: [f32; 3]) -> [f32; 3] {
        let mut c = [0, 1, 2].map(|i| {
            let mut value = color[i].clamp(0.0, 1.0) + self.offset[i];
            value += self.lift[i] * (1.0 - value);
            value *= self.gain[i];
            value.max(0.0).powf(self.exponent[i])
        });
        let y = luma(c);
        let low = 1.0 - smoothstep(0.0, 0.5, y);
        let high = smoothstep(0.5, 1.0, y);
        let mid = (1.0 - low - high).max(0.0);
        c = mix3(
            [y; 3],
            c,
            low * self.sat[0] + mid * self.sat[1] + high * self.sat[2],
        );
        clamp01(c)
    }
}

/// Fritsch–Carlson tangents of a curve sampled at x = 0, .25, .5, .75, 1: the
/// cubic through the points never overshoots between them.
pub fn monotone_tangents(points: &[f32; 5]) -> [f32; 5] {
    let h = 0.25;
    let delta: [f32; 4] = [0, 1, 2, 3].map(|k| (points[k + 1] - points[k]) / h);
    let mut m = [0.0; 5];
    m[0] = delta[0];
    m[4] = delta[3];
    for k in 1..4 {
        m[k] = if delta[k - 1] * delta[k] > 0.0 {
            (delta[k - 1] + delta[k]) * 0.5
        } else {
            0.0
        };
    }
    for k in 0..4 {
        if delta[k] == 0.0 {
            m[k] = 0.0;
            m[k + 1] = 0.0;
            continue;
        }
        let a = m[k] / delta[k];
        let b = m[k + 1] / delta[k];
        let length = a * a + b * b;
        if length > 9.0 {
            let tau = 3.0 / length.sqrt();
            m[k] = tau * a * delta[k];
            m[k + 1] = tau * b * delta[k];
        }
    }
    m
}

/// The curve at `x` (cubic Hermite on the segment holding it).
pub fn curve_eval(points: &[f32; 5], tangents: &[f32; 5], x: f32) -> f32 {
    let h = 0.25;
    let x = x.clamp(0.0, 1.0);
    let k = ((x / h).floor() as usize).min(3);
    let t = (x - k as f32 * h) / h;
    let t2 = t * t;
    let t3 = t2 * t;
    let y = (2.0 * t3 - 3.0 * t2 + 1.0) * points[k]
        + (t3 - 2.0 * t2 + t) * h * tangents[k]
        + (-2.0 * t3 + 3.0 * t2) * points[k + 1]
        + (t3 - t2) * h * tangents[k + 1];
    y.clamp(0.0, 1.0)
}

/// BT.709 chroma (Cb, Cr) of a colour.
pub fn chroma_of(c: [f32; 3]) -> (f32, f32) {
    let y = luma(c);
    ((c[2] - y) / 1.8556, (c[0] - y) / 1.5748)
}

/// The kept alpha of a pixel against a key (0 keyed out, 1 kept): its chroma
/// distance to the key's, relative to the key's own chroma, past the tolerance.
pub fn chroma_key_alpha(c: [f32; 3], key: (f32, f32), tolerance: f32, softness: f32) -> f32 {
    let (cb, cr) = chroma_of(c);
    let distance = (cb - key.0).hypot(cr - key.1) / key.0.hypot(key.1).max(0.05);
    smoothstep(tolerance, tolerance + softness.max(1e-4), distance)
}

/// Removes the share of the key's chroma a kept pixel carries (green spill on a
/// face), its luminance unchanged.
pub fn chroma_key_spill(c: [f32; 3], key: (f32, f32), spill: f32) -> [f32; 3] {
    let length = key.0.hypot(key.1).max(1e-4);
    let unit = (key.0 / length, key.1 / length);
    let y = luma(c);
    let (cb, cr) = chroma_of(c);
    let share = (cb * unit.0 + cr * unit.1).max(0.0) * spill;
    let (cb, cr) = (cb - unit.0 * share, cr - unit.1 * share);
    let r = y + 1.5748 * cr;
    let b = y + 1.8556 * cb;
    let g = (y - LUMA[0] * r - LUMA[2] * b) / LUMA[1];
    clamp01([r, g, b])
}

/// How much of a pixel a mask keeps (`fx_mask` of media_fx_grade.wgsl): `shape`
/// 0 ellipse, 1 rectangle, 2 a five-pointed star with one point up (its edge from
/// the tips to the hollows at 0.45), `q` the pixel relative to the mask's centre
/// divided by its half size.
pub fn mask_keep(shape: f32, q: (f32, f32), feather: f32, invert: bool) -> f32 {
    let mut r = q.0.hypot(q.1);
    if shape > 1.5 {
        let turn = ((q.1.atan2(q.0) + std::f32::consts::FRAC_PI_2) * 5.0 / std::f32::consts::TAU)
            .rem_euclid(1.0);
        r /= 0.45 + 0.55 * (turn * 2.0 - 1.0).abs();
    } else if shape > 0.5 {
        r = q.0.abs().max(q.1.abs());
    }
    let keep = 1.0 - smoothstep(1.0 - feather.max(1e-4), 1.0, r);
    if invert { 1.0 - keep } else { keep }
}
