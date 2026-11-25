//! 3D LUTs of the `lut` media effect: a `.cube` file (Adobe/Resolve format)
//! parsed here, uploaded once as a 3D texture and sampled trilinearly by the
//! shader. The JS glue sends a file's text once per asset (`AtomeLutPatch`);
//! a chain names its LUT by that asset id.

use std::collections::HashMap;

use bevy::{
    asset::RenderAssetUsages,
    image::{Image, ImageSampler},
    prelude::*,
    render::{
        extract_resource::ExtractResource,
        render_asset::RenderAssets,
        render_resource::{Extent3d, TextureDimension, TextureFormat},
        texture::GpuImage,
    },
};
use serde::Deserialize;

use super::{MediaFxLutBinding, MediaFxStack};

/// The largest edge accepted (a 65-point cube is the usual maximum).
pub const LUT_MAX_SIZE: usize = 129;

#[derive(Clone, Debug, PartialEq)]
pub struct CubeLut {
    pub size: usize,
    pub domain_min: [f32; 3],
    pub domain_max: [f32; 3],
    /// `size³` colours, red varying fastest, then green, then blue.
    pub table: Vec<[f32; 3]>,
}

fn three_floats(parts: &[&str], line: usize) -> Result<[f32; 3], String> {
    if parts.len() != 3 {
        return Err(format!("lut_cube_line_invalid:{line}"));
    }
    let mut out = [0.0; 3];
    for (slot, part) in out.iter_mut().zip(parts) {
        *slot = part
            .parse::<f32>()
            .ok()
            .filter(|value| value.is_finite())
            .ok_or_else(|| format!("lut_cube_number_invalid:{line}"))?;
    }
    Ok(out)
}

/// Parses a `.cube` 3D LUT. A 1D LUT, a missing or out-of-range size, a
/// malformed line or a table of the wrong length is refused.
pub fn parse_cube(text: &str) -> Result<CubeLut, String> {
    let mut size = 0usize;
    let mut domain_min = [0.0; 3];
    let mut domain_max = [1.0; 3];
    let mut table = Vec::new();
    for (index, raw) in text.lines().enumerate() {
        let line = index + 1;
        let content = raw.split('#').next().unwrap_or_default().trim();
        if content.is_empty() {
            continue;
        }
        let parts: Vec<&str> = content.split_whitespace().collect();
        match parts[0] {
            "TITLE" => {}
            "LUT_1D_SIZE" => return Err("lut_cube_1d_unsupported".to_string()),
            "LUT_3D_SIZE" => {
                size = parts
                    .get(1)
                    .and_then(|value| value.parse::<usize>().ok())
                    .filter(|value| (2..=LUT_MAX_SIZE).contains(value))
                    .ok_or_else(|| format!("lut_cube_size_invalid:{line}"))?;
                table.reserve(size * size * size);
            }
            "DOMAIN_MIN" => domain_min = three_floats(&parts[1..], line)?,
            "DOMAIN_MAX" => domain_max = three_floats(&parts[1..], line)?,
            "LUT_3D_INPUT_RANGE" | "LUT_1D_INPUT_RANGE" => {
                let range = [parts.get(1), parts.get(2)]
                    .map(|value| value.and_then(|text| text.parse::<f32>().ok()));
                let [Some(low), Some(high)] = range else {
                    return Err(format!("lut_cube_range_invalid:{line}"));
                };
                domain_min = [low; 3];
                domain_max = [high; 3];
            }
            word if word.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) => {
                return Err(format!("lut_cube_keyword_unknown:{word}"));
            }
            _ => table.push(three_floats(&parts, line)?),
        }
    }
    if size == 0 {
        return Err("lut_cube_size_missing".to_string());
    }
    if table.len() != size * size * size {
        return Err(format!(
            "lut_cube_table_length_invalid:{}:{}",
            table.len(),
            size * size * size
        ));
    }
    if (0..3).any(|axis| domain_max[axis] <= domain_min[axis]) {
        return Err("lut_cube_domain_invalid".to_string());
    }
    Ok(CubeLut {
        size,
        domain_min,
        domain_max,
        table,
    })
}

impl CubeLut {
    /// Trilinear lookup on the CPU, the reference of the shader's sampling.
    pub fn sample(&self, color: [f32; 3]) -> [f32; 3] {
        let n = self.size;
        let edge = (n - 1) as f32;
        let coord: [f32; 3] = [0, 1, 2].map(|axis| {
            let t = (color[axis] - self.domain_min[axis])
                / (self.domain_max[axis] - self.domain_min[axis]);
            t.clamp(0.0, 1.0) * edge
        });
        let base = coord.map(|value| (value.floor() as usize).min(n - 2));
        let frac: [f32; 3] = [0, 1, 2].map(|axis| coord[axis] - base[axis] as f32);
        let at = |r: usize, g: usize, b: usize| self.table[r + g * n + b * n * n];
        let mut out = [0.0; 3];
        for corner in 0..8 {
            let offset = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
            let weight: f32 = (0..3)
                .map(|axis| {
                    if offset[axis] == 1 {
                        frac[axis]
                    } else {
                        1.0 - frac[axis]
                    }
                })
                .product();
            let value = at(
                base[0] + offset[0],
                base[1] + offset[1],
                base[2] + offset[2],
            );
            for axis in 0..3 {
                out[axis] += value[axis] * weight;
            }
        }
        out
    }

    pub fn image(&self) -> Image {
        let n = self.size as u32;
        let mut data = Vec::with_capacity(self.table.len() * 8);
        for color in &self.table {
            for value in [color[0], color[1], color[2], 1.0] {
                data.extend_from_slice(&f32_to_f16_bits(value).to_le_bytes());
            }
        }
        let mut image = Image::new(
            Extent3d {
                width: n,
                height: n,
                depth_or_array_layers: n,
            },
            TextureDimension::D3,
            data,
            TextureFormat::Rgba16Float,
            RenderAssetUsages::RENDER_WORLD,
        );
        image.sampler = ImageSampler::linear();
        image
    }
}

/// IEEE 754 binary16 of a float (round to nearest even), the LUT texels.
pub fn f32_to_f16_bits(value: f32) -> u16 {
    let bits = value.to_bits();
    let sign = ((bits >> 16) & 0x8000) as u16;
    let exponent = ((bits >> 23) & 0xff) as i32;
    let mantissa = bits & 0x007f_ffff;
    if exponent == 0xff {
        return sign | 0x7c00 | if mantissa != 0 { 0x200 } else { 0 };
    }
    let half_exponent = exponent - 127 + 15;
    if half_exponent >= 0x1f {
        return sign | 0x7c00;
    }
    if half_exponent <= 0 {
        if half_exponent < -10 {
            return sign;
        }
        let full = mantissa | 0x0080_0000;
        let shift = (14 - half_exponent) as u32;
        let rounded = (full + (1 << (shift - 1)) - 1 + ((full >> shift) & 1)) >> shift;
        return sign | rounded as u16;
    }
    let rounded = mantissa + 0x0fff + ((mantissa >> 13) & 1);
    if rounded & 0x0080_0000 != 0 {
        let exponent = half_exponent + 1;
        if exponent >= 0x1f {
            return sign | 0x7c00;
        }
        return sign | ((exponent as u16) << 10);
    }
    sign | ((half_exponent as u16) << 10) | (rounded >> 13) as u16
}

#[derive(Clone, Debug)]
pub struct AtomeLut {
    pub image: Handle<Image>,
    pub size: u32,
    pub domain_min: [f32; 3],
    pub domain_max: [f32; 3],
}

/// The LUTs the renderer holds, by asset id (copied into the render world each frame).
#[derive(Resource, Clone, Debug, Default, ExtractResource)]
pub struct AtomeLutLibrary(pub HashMap<String, AtomeLut>);

/// A `.cube` file's text for one asset id.
#[derive(Clone, Debug, Deserialize)]
pub struct AtomeLutPatch {
    pub asset_id: String,
    pub cube: String,
}

pub fn apply_lut(world: &mut World, patch: AtomeLutPatch) -> Result<(), String> {
    let id = patch.asset_id.trim().to_string();
    if id.is_empty() {
        return Err("lut_asset_id_required".to_string());
    }
    let cube = parse_cube(&patch.cube).map_err(|error| format!("{error}:{id}"))?;
    let image = world
        .get_resource_mut::<Assets<Image>>()
        .ok_or_else(|| "bevy_image_assets_required".to_string())?
        .add(cube.image());
    world.resource_mut::<AtomeLutLibrary>().0.insert(
        id,
        AtomeLut {
            image,
            size: cube.size as u32,
            domain_min: cube.domain_min,
            domain_max: cube.domain_max,
        },
    );
    Ok(())
}

/// The LUT texture a chain binds: its file once uploaded, else the identity
/// placeholder with no binding (the slot waits for its file).
pub(crate) fn resolve_lut<'a>(
    stack: &MediaFxStack,
    luts: &AtomeLutLibrary,
    gpu_images: &'a RenderAssets<GpuImage>,
    placeholder: &'a GpuImage,
) -> (
    &'a bevy::render::render_resource::TextureView,
    Option<MediaFxLutBinding>,
) {
    let loaded = stack
        .lut_asset
        .as_ref()
        .and_then(|asset| luts.0.get(asset))
        .and_then(|lut| gpu_images.get(&lut.image).map(|image| (lut, image)));
    match loaded {
        Some((lut, image)) => (
            &image.texture_view,
            Some(MediaFxLutBinding {
                size: lut.size,
                domain_min: lut.domain_min,
                domain_max: lut.domain_max,
            }),
        ),
        None => (&placeholder.texture_view, None),
    }
}
