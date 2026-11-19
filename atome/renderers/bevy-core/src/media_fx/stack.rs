use std::collections::BTreeMap;

use serde::Deserialize;

use super::grade;

/// Effects a chain may hold at once (the uniform array of `media_fx_stack.wgsl`).
pub const MEDIA_FX_SLOTS: usize = 12;
/// Floats of one slot: its head (kind, spatial flag) then 44 parameters.
pub const SLOT_FLOATS: usize = 48;
pub const SLOT_PARAMS: usize = SLOT_FLOATS - 4;
const HEADER_FLOATS: usize = 20;
pub const MEDIA_FX_FLOATS: usize = HEADER_FLOATS + MEDIA_FX_SLOTS * SLOT_FLOATS;

/// One `video_fx` module of a strip, as the projection describes it: its effect
/// key, its numeric parameters (a choice is its index) and the asset it reads.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct AtomeMediaEffect {
    pub effect: String,
    #[serde(default)]
    pub params: BTreeMap<String, f32>,
    #[serde(default)]
    pub asset: Option<String>,
}

/// The kinds the shader dispatches on (`media_fx_stack.wgsl`, same numbers).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaFxKind {
    Color = 1,
    Wheels = 2,
    Curves = 3,
    Hsl = 4,
    Lut = 5,
    Bw = 6,
    Blur = 7,
    Sharpen = 8,
    Denoise = 9,
    Vignette = 10,
    Grain = 11,
    Glow = 12,
    Aberration = 13,
    Pixelate = 14,
    ChromaKey = 15,
    LumaKey = 16,
    Mask = 17,
}

impl MediaFxKind {
    pub fn from_key(key: &str) -> Result<Self, String> {
        Ok(match key {
            "color" => Self::Color,
            "wheels" => Self::Wheels,
            "curves" => Self::Curves,
            "hsl" => Self::Hsl,
            "lut" => Self::Lut,
            "bw" => Self::Bw,
            "blur" => Self::Blur,
            "sharpen" => Self::Sharpen,
            "denoise" => Self::Denoise,
            "vignette" => Self::Vignette,
            "grain" => Self::Grain,
            "glow" => Self::Glow,
            "aberration" => Self::Aberration,
            "pixelate" => Self::Pixelate,
            "chroma_key" => Self::ChromaKey,
            "luma_key" => Self::LumaKey,
            "mask" => Self::Mask,
            other => return Err(format!("media_fx_effect_unknown:{other}")),
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct MediaFxSlot {
    pub kind: MediaFxKind,
    /// Reads its neighbourhood (taps around the pixel), not only the pixel.
    pub spatial: bool,
    pub params: [f32; SLOT_PARAMS],
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct MediaFxStack {
    pub slots: Vec<MediaFxSlot>,
    /// The `.cube` asset the chain's LUT reads (one per chain, `lut.rs`).
    pub lut_asset: Option<String>,
}

struct Params<'a> {
    effect: &'a AtomeMediaEffect,
}

impl Params<'_> {
    fn get(&self, key: &str) -> Result<f32, String> {
        let value = self
            .effect
            .params
            .get(key)
            .copied()
            .ok_or_else(|| format!("media_fx_param_missing:{}.{key}", self.effect.effect))?;
        if !value.is_finite() {
            return Err(format!(
                "media_fx_param_invalid:{}.{key}",
                self.effect.effect
            ));
        }
        Ok(value)
    }
    fn on(&self, key: &str) -> Result<bool, String> {
        Ok(self.get(key)?.round() >= 1.0)
    }
}

fn slot(kind: MediaFxKind, spatial: bool, values: &[f32]) -> MediaFxSlot {
    let mut params = [0.0; SLOT_PARAMS];
    params[..values.len()].copy_from_slice(values);
    MediaFxSlot {
        kind,
        spatial,
        params,
    }
}

const CURVE_IDENTITY: [f32; 5] = [0.0, 0.25, 0.5, 0.75, 1.0];

fn compile_effect(effect: &AtomeMediaEffect) -> Result<Option<MediaFxSlot>, String> {
    let kind = MediaFxKind::from_key(&effect.effect)?;
    let p = Params { effect };
    let compiled = match kind {
        MediaFxKind::Color => {
            let color = grade::ColorPrimary {
                exposure: p.get("exposure")?,
                pivot: p.get("pivot")?,
                contrast: p.get("contrast")?,
                brightness: p.get("brightness")?,
                saturate: p.get("saturate")?,
                vibrance: p.get("vibrance")?,
                temperature: p.get("temperature")?,
                tint: p.get("tint")?,
                highlights: p.get("highlights")?,
                shadows: p.get("shadows")?,
                hue: p.get("hue")?,
                grayscale: p.get("grayscale")?,
                sepia: p.get("sepia")?,
                invert: p.get("invert")?,
            };
            (!color.is_identity()).then(|| slot(kind, false, &color.uniform()))
        }
        MediaFxKind::Wheels => {
            let wheel = |name: &str| -> Result<grade::Wheel, String> {
                Ok(grade::Wheel {
                    x: p.get(&format!("{name}_x"))?,
                    y: p.get(&format!("{name}_y"))?,
                    level: p.get(&format!("{name}_level"))?,
                })
            };
            let wheels = grade::Wheels {
                lift: wheel("lift")?,
                gamma: wheel("gamma")?,
                gain: wheel("gain")?,
                offset: wheel("offset")?,
                lift_sat: p.get("lift_sat")?,
                gamma_sat: p.get("gamma_sat")?,
                gain_sat: p.get("gain_sat")?,
                offset_temperature: p.get("offset_temperature")?,
            };
            (!wheels.is_identity()).then(|| slot(kind, false, &wheels.compile().uniform()))
        }
        MediaFxKind::Curves => {
            let mut values = Vec::with_capacity(40);
            let mut identity = true;
            for name in ["luma", "red", "green", "blue"] {
                let mut points = [0.0; 5];
                for (index, point) in points.iter_mut().enumerate() {
                    *point = p.get(&format!("{name}_{index}"))?.clamp(0.0, 1.0);
                }
                identity &= points
                    .iter()
                    .zip(CURVE_IDENTITY)
                    .all(|(value, expected)| (value - expected).abs() < 1e-6);
                values.extend_from_slice(&points);
                values.extend_from_slice(&grade::monotone_tangents(&points));
            }
            (!identity).then(|| slot(kind, false, &values))
        }
        MediaFxKind::Hsl => {
            let values = [
                p.get("target_hue")?,
                p.get("range")?,
                p.get("softness")?,
                p.get("hue_shift")?,
                p.get("saturation")?,
                p.get("luminance")?,
            ];
            let identity = values[3] == 0.0 && values[4] == 1.0 && values[5] == 0.0;
            (!identity).then(|| slot(kind, false, &values))
        }
        MediaFxKind::Lut => {
            let intensity = p.get("intensity")?.clamp(0.0, 1.0);
            let asset = effect
                .asset
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            // A LUT not chosen yet changes nothing, like an Ampli without its model.
            (asset.is_some() && intensity > 0.0).then(|| slot(kind, false, &[intensity]))
        }
        MediaFxKind::Bw => Some(slot(
            kind,
            false,
            &[
                p.get("red")?,
                p.get("green")?,
                p.get("blue")?,
                p.get("contrast")?,
            ],
        )),
        MediaFxKind::Blur => {
            let values = [
                p.get("mode")?.round(),
                p.get("radius")?.max(0.0),
                p.get("angle")?.to_radians(),
                p.get("mix")?.clamp(0.0, 1.0),
                p.get("center_x")?,
                p.get("center_y")?,
                if p.on("zone")? { 1.0 } else { 0.0 },
                p.get("zone_size")?,
            ];
            (values[1] > 0.0 && values[3] > 0.0).then(|| slot(kind, true, &values))
        }
        MediaFxKind::Sharpen => {
            let values = [
                p.get("amount")?,
                p.get("radius")?.max(0.5),
                p.get("threshold")?,
            ];
            (values[0] != 0.0).then(|| slot(kind, true, &values))
        }
        MediaFxKind::Denoise => {
            let strength = p.get("strength")?.clamp(0.0, 1.0);
            (strength > 0.0).then(|| slot(kind, true, &[strength]))
        }
        MediaFxKind::Vignette => {
            let values = [
                p.get("amount")?,
                p.get("size")?,
                p.get("softness")?,
                p.get("roundness")?,
            ];
            (values[0] != 0.0).then(|| slot(kind, false, &values))
        }
        MediaFxKind::Grain => {
            let values = [p.get("amount")?, p.get("size")?.max(1.0)];
            (values[0] > 0.0).then(|| slot(kind, false, &values))
        }
        MediaFxKind::Glow => {
            let values = [
                p.get("threshold")?.clamp(0.0, 0.99),
                p.get("intensity")?,
                p.get("radius")?.max(1.0),
            ];
            (values[1] > 0.0).then(|| slot(kind, true, &values))
        }
        MediaFxKind::Aberration => {
            let amount = p.get("amount")?;
            (amount != 0.0).then(|| slot(kind, true, &[amount]))
        }
        MediaFxKind::Pixelate => {
            let size = p.get("size")?;
            (size > 1.0).then(|| slot(kind, true, &[size]))
        }
        MediaFxKind::ChromaKey => {
            let key = [p.get("key_r")?, p.get("key_g")?, p.get("key_b")?];
            let (cb, cr) = grade::chroma_of(key);
            let edges = p.get("edges")?;
            Some(slot(
                kind,
                edges != 0.0,
                &[
                    cb,
                    cr,
                    p.get("tolerance")?,
                    p.get("softness")?,
                    p.get("spill")?,
                    edges,
                    if p.on("matte")? { 1.0 } else { 0.0 },
                ],
            ))
        }
        MediaFxKind::LumaKey => {
            let values = [
                p.get("low")?,
                p.get("high")?,
                p.get("softness")?,
                if p.on("invert")? { 1.0 } else { 0.0 },
            ];
            let identity = values[0] <= 0.0 && values[1] >= 1.0 && values[3] == 0.0;
            (!identity).then(|| slot(kind, false, &values))
        }
        MediaFxKind::Mask => Some(slot(
            kind,
            false,
            &[
                p.get("shape")?.round(),
                p.get("center_x")?,
                p.get("center_y")?,
                p.get("width")?,
                p.get("height")?,
                p.get("feather")?,
                if p.on("invert")? { 1.0 } else { 0.0 },
            ],
        )),
    };
    Ok(compiled)
}

impl MediaFxStack {
    /// Compiles a chain in its order. An unknown effect, a missing or
    /// non-finite parameter, a chain longer than the shader holds or two LUT
    /// files in one chain are refused, never silently dropped.
    pub fn compile(effects: &[AtomeMediaEffect]) -> Result<Self, String> {
        let mut stack = Self::default();
        for effect in effects {
            let Some(compiled) = compile_effect(effect)? else {
                continue;
            };
            if compiled.kind == MediaFxKind::Lut {
                let asset = effect.asset.as_deref().map(str::trim).map(str::to_string);
                if stack.lut_asset.is_some() && stack.lut_asset != asset {
                    return Err("media_fx_one_lut_per_chain".to_string());
                }
                stack.lut_asset = asset;
            }
            if stack.slots.len() == MEDIA_FX_SLOTS {
                return Err(format!("media_fx_chain_too_long:{MEDIA_FX_SLOTS}"));
            }
            stack.slots.push(compiled);
        }
        Ok(stack)
    }

    pub fn is_empty(&self) -> bool {
        self.slots.is_empty()
    }
}

/// The LUT a draw binds: its edge and the input domain of its file.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MediaFxLutBinding {
    pub size: u32,
    pub domain_min: [f32; 3],
    pub domain_max: [f32; 3],
}

/// The uniform block of `media_fx_stack.wgsl` for one draw: `size_px` the
/// media's displayed size, `uv_rect` the texture rectangle it shows (its top-left
/// corner and its extent), `lut` the bound LUT when the chain's file is loaded.
pub fn media_fx_uniform_bytes(
    stack: Option<&MediaFxStack>,
    size_px: [f32; 2],
    uv_rect: [f32; 4],
    time_seconds: f32,
    lut: Option<MediaFxLutBinding>,
) -> Vec<u8> {
    let mut floats = [0.0_f32; MEDIA_FX_FLOATS];
    let slots = stack.map_or(&[][..], |value| value.slots.as_slice());
    floats[0] = slots.len() as f32;
    floats[1] = time_seconds;
    floats[4] = size_px[0].max(1.0);
    floats[5] = size_px[1].max(1.0);
    floats[8..12].copy_from_slice(&uv_rect);
    if let Some(lut) = lut {
        floats[2] = 1.0;
        floats[3] = lut.size as f32;
        floats[12..15].copy_from_slice(&lut.domain_min);
        floats[16..19].copy_from_slice(&lut.domain_max);
    }
    for (index, slot) in slots.iter().enumerate() {
        let at = HEADER_FLOATS + index * SLOT_FLOATS;
        floats[at] = slot.kind as u32 as f32;
        floats[at + 1] = if slot.spatial { 1.0 } else { 0.0 };
        floats[at + 4..at + SLOT_FLOATS].copy_from_slice(&slot.params);
    }
    floats
        .iter()
        .flat_map(|value| value.to_ne_bytes())
        .collect()
}
