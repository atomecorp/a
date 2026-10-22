//! Optional surface paint, composed into the renderer's existing silhouette texture.
use crate::{shape_sdf::AtomeShapeSilhouette, types::AtomeTexture};
use bevy::prelude::*;
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct GradientStop {
    pub offset: f32,
    pub color: [f32; 4],
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct LinearGradient {
    pub angle: f32,
    pub stops: Vec<GradientStop>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct InsetShadow {
    pub color: [f32; 4],
    pub blur: f32,
    pub spread: f32,
    pub offset: [f32; 2],
    /// Optional colour along an axis, replacing `color` (a stroke that fades).
    #[serde(default)]
    pub gradient: Option<LinearGradient>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct SurfaceBorder {
    pub width: f32,
    pub color: [f32; 4],
    /// Optional CSS edge colours in top, right, bottom, left order.
    #[serde(default)]
    pub colors: Option<[[f32; 4]; 4]>,
    /// Optional colour along an axis, replacing `color` and `colors`.
    #[serde(default)]
    pub gradient: Option<LinearGradient>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SurfacePaint {
    #[serde(default)]
    pub gradient: Option<LinearGradient>,
    #[serde(default)]
    pub inset_shadows: Vec<InsetShadow>,
    #[serde(default)]
    pub border: Option<SurfaceBorder>,
    /// Texels per logical pixel (the device pixel ratio for a hairline that must
    /// stay one physical pixel wide); 1 when absent.
    #[serde(default)]
    pub texture_scale: Option<f32>,
}

/// The largest texture scale a paint may ask for (a 3x screen).
const MAX_TEXTURE_SCALE: f32 = 3.0;

#[derive(Clone, Debug, Default, Component)]
pub struct AtomeSurfacePaint(pub Option<SurfacePaint>);

fn over(base: [f32; 4], source: [f32; 4], coverage: f32) -> [f32; 4] {
    let alpha = (source[3] * coverage).clamp(0.0, 1.0);
    let result_alpha = alpha + base[3] * (1.0 - alpha);
    if result_alpha <= 0.0 {
        return [0.0; 4];
    }
    let mut result = [0.0; 4];
    for channel in 0..3 {
        result[channel] =
            (source[channel] * alpha + base[channel] * base[3] * (1.0 - alpha)) / result_alpha;
    }
    result[3] = result_alpha;
    result
}

fn valid_color(value: &[f32; 4]) -> bool {
    value
        .iter()
        .all(|v| v.is_finite() && (0.0..=1.0).contains(v))
}

impl LinearGradient {
    fn valid(&self) -> bool {
        self.angle.is_finite()
            && self.stops.len() >= 2
            && self.stops.len() <= 16
            && self.stops.windows(2).all(|s| s[0].offset <= s[1].offset)
            && self
                .stops
                .iter()
                .all(|s| (0.0..=1.0).contains(&s.offset) && valid_color(&s.color))
    }

    fn push_key(&self, result: &mut Vec<u32>) {
        result.extend([self.angle.to_bits(), self.stops.len() as u32]);
        for stop in &self.stops {
            result.push(stop.offset.to_bits());
            result.extend(stop.color.map(f32::to_bits));
        }
    }

    /// The axis and its extent are constant over the texture: computed once, not per pixel.
    fn axis(&self, width: f32, height: f32) -> ([f32; 2], f32) {
        let angle = self.angle.to_radians();
        let axis = [angle.sin(), -angle.cos()];
        (axis, axis[0].abs() * width + axis[1].abs() * height)
    }

    /// The colour at a logical point of a `width` x `height` surface (CSS angles).
    fn color_at(&self, x: f32, y: f32, width: f32, height: f32, (axis, extent): ([f32; 2], f32)) -> [f32; 4] {
        let t = (((x - width / 2.0) * axis[0] + (y - height / 2.0) * axis[1]) / extent.max(1.0)
            + 0.5)
            .clamp(0.0, 1.0);
        let first = &self.stops[0];
        if t <= first.offset {
            return first.color;
        }
        for pair in self.stops.windows(2) {
            if t <= pair[1].offset {
                let mix =
                    (t - pair[0].offset) / (pair[1].offset - pair[0].offset).max(f32::EPSILON);
                return std::array::from_fn(|i| {
                    pair[0].color[i] + (pair[1].color[i] - pair[0].color[i]) * mix
                });
            }
        }
        self.stops.last().unwrap().color
    }
}

impl SurfacePaint {
    pub fn valid(&self) -> bool {
        let color = valid_color;
        self.gradient.as_ref().is_none_or(LinearGradient::valid)
            && self
                .texture_scale
                .is_none_or(|s| s.is_finite() && (1.0..=MAX_TEXTURE_SCALE).contains(&s))
            && self.inset_shadows.len() <= 4
            && self.inset_shadows.iter().all(|s| {
                color(&s.color)
                    && s.blur.is_finite()
                    && s.blur >= 0.0
                    && s.spread.is_finite()
                    && s.offset.iter().all(|v| v.is_finite())
                    && s.gradient.as_ref().is_none_or(LinearGradient::valid)
            })
            && self.border.as_ref().is_none_or(|b| {
                color(&b.color)
                    && b.colors
                        .as_ref()
                        .is_none_or(|edges| edges.iter().all(color))
                    && b.width.is_finite()
                    && b.width >= 0.0
                    && b.gradient.as_ref().is_none_or(LinearGradient::valid)
            })
    }

    fn scale(&self) -> f32 {
        self.texture_scale.unwrap_or(1.0)
    }

    pub fn cache_key(&self, fill: [f32; 4]) -> Vec<u32> {
        let mut result: Vec<u32> = fill.iter().map(|v| v.to_bits()).collect();
        if let Some(g) = &self.gradient {
            g.push_key(&mut result);
        } else {
            result.extend([0, 0]);
        }
        result.push(self.scale().to_bits());
        result.push(self.inset_shadows.len() as u32);
        for s in &self.inset_shadows {
            result.extend(s.color.map(f32::to_bits));
            result.extend([
                s.blur.to_bits(),
                s.spread.to_bits(),
                s.offset[0].to_bits(),
                s.offset[1].to_bits(),
            ]);
            match &s.gradient {
                Some(g) => g.push_key(&mut result),
                None => result.push(0),
            }
        }
        if let Some(b) = &self.border {
            result.push(b.width.to_bits());
            result.extend(b.color.map(f32::to_bits));
            result.push(u32::from(b.colors.is_some()));
            if let Some(edges) = b.colors {
                for edge in edges {
                    result.extend(edge.map(f32::to_bits));
                }
            }
            match &b.gradient {
                Some(g) => g.push_key(&mut result),
                None => result.push(0),
            }
        }
        result
    }

    pub fn texture(&self, silhouette: &AtomeShapeSilhouette, fill: [f32; 4]) -> AtomeTexture {
        // Lengths stay logical; only the raster grows. Edges blend over one texel.
        let scale = self.scale();
        let (logical_width, logical_height) = (silhouette.width, silhouette.height);
        let width = (logical_width * scale).ceil().max(1.0) as u32;
        let height = (logical_height * scale).ceil().max(1.0) as u32;
        let mut rgba = vec![0; width as usize * height as usize * 4];
        let axis_of = |g: &LinearGradient| g.axis(logical_width, logical_height);
        let fill_axis = self.gradient.as_ref().map(axis_of);
        let shadow_axes: Vec<_> = self
            .inset_shadows
            .iter()
            .map(|s| s.gradient.as_ref().map(axis_of))
            .collect();
        let border_axis = self
            .border
            .as_ref()
            .and_then(|b| b.gradient.as_ref().map(axis_of));
        for y in 0..height {
            for x in 0..width {
                let point = [(x as f32 + 0.5) / scale, (y as f32 + 0.5) / scale];
                let coverage =
                    (0.5 - silhouette.signed_distance(point[0], point[1]) * scale).clamp(0.0, 1.0);
                if coverage <= 0.0 {
                    continue;
                }
                let along = |g: &LinearGradient, axis| {
                    g.color_at(point[0], point[1], logical_width, logical_height, axis)
                };
                let mut pixel = match (&self.gradient, fill_axis) {
                    (Some(g), Some(axis)) => along(g, axis),
                    _ => fill,
                };
                // CSS lists the topmost inset first. Reverse before alpha composition.
                for (shadow, axis) in self.inset_shadows.iter().zip(&shadow_axes).rev() {
                    let distance = silhouette
                        .signed_distance(point[0] - shadow.offset[0], point[1] - shadow.offset[1])
                        + shadow.spread;
                    let alpha = if shadow.blur <= 0.0 {
                        (distance * scale + 0.5).clamp(0.0, 1.0)
                    } else {
                        gaussian_cdf(distance / (shadow.blur * 0.5).max(0.001))
                    };
                    let color = match (&shadow.gradient, axis) {
                        (Some(g), Some(axis)) => along(g, *axis),
                        _ => shadow.color,
                    };
                    pixel = over(pixel, color, alpha);
                }
                if let Some(border) = &self.border {
                    let distance = silhouette.signed_distance(point[0], point[1]);
                    let edge_color = match (&border.gradient, border_axis) {
                        (Some(g), Some(axis)) => along(g, axis),
                        _ => border
                            .colors
                            .map(|edges| {
                                let distances = [
                                    point[1],
                                    logical_width - point[0],
                                    logical_height - point[1],
                                    point[0],
                                ];
                                let edge = (0..4)
                                    .min_by(|a, b| distances[*a].total_cmp(&distances[*b]))
                                    .unwrap();
                                edges[edge]
                            })
                            .unwrap_or(border.color),
                    };
                    pixel = over(
                        pixel,
                        edge_color,
                        ((distance + border.width) * scale + 0.5).clamp(0.0, 1.0),
                    );
                }
                pixel[3] *= coverage;
                let offset = (y as usize * width as usize + x as usize) * 4;
                for i in 0..4 {
                    rgba[offset + i] = (pixel[i].clamp(0.0, 1.0) * 255.0).round() as u8;
                }
            }
        }
        AtomeTexture {
            width,
            height,
            rgba,
            animation: None,
        }
    }
}

// Normal CDF; maximum approximation error is below 8e-8.
fn gaussian_cdf(value: f32) -> f32 {
    let x = value.abs();
    let t = 1.0 / (1.0 + 0.2316419 * x);
    let tail = (-0.5 * x * x).exp()
        * 0.39894228
        * t
        * (0.31938153 + t * (-0.35656378 + t * (1.781478 + t * (-1.821256 + t * 1.3302745))));
    if value >= 0.0 {
        1.0 - tail
    } else {
        tail
    }
}
