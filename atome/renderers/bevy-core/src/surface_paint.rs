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
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct SurfaceBorder {
    pub width: f32,
    pub color: [f32; 4],
    /// Optional CSS edge colours in top, right, bottom, left order.
    #[serde(default)]
    pub colors: Option<[[f32; 4]; 4]>,
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
}

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

impl SurfacePaint {
    pub fn valid(&self) -> bool {
        let color = |value: &[f32; 4]| {
            value
                .iter()
                .all(|v| v.is_finite() && (0.0..=1.0).contains(v))
        };
        self.gradient.as_ref().is_none_or(|g| {
            g.angle.is_finite()
                && g.stops.len() >= 2
                && g.stops.len() <= 16
                && g.stops.windows(2).all(|s| s[0].offset <= s[1].offset)
                && g.stops
                    .iter()
                    .all(|s| (0.0..=1.0).contains(&s.offset) && color(&s.color))
        }) && self.inset_shadows.len() <= 4
            && self.inset_shadows.iter().all(|s| {
                color(&s.color)
                    && s.blur.is_finite()
                    && s.blur >= 0.0
                    && s.spread.is_finite()
                    && s.offset.iter().all(|v| v.is_finite())
            })
            && self.border.as_ref().is_none_or(|b| {
                color(&b.color)
                    && b.colors
                        .as_ref()
                        .is_none_or(|edges| edges.iter().all(color))
                    && b.width.is_finite()
                    && b.width >= 0.0
            })
    }

    pub fn cache_key(&self, fill: [f32; 4]) -> Vec<u32> {
        let mut result: Vec<u32> = fill.iter().map(|v| v.to_bits()).collect();
        if let Some(g) = &self.gradient {
            result.extend([g.angle.to_bits(), g.stops.len() as u32]);
            for stop in &g.stops {
                result.push(stop.offset.to_bits());
                result.extend(stop.color.map(f32::to_bits));
            }
        } else {
            result.extend([0, 0]);
        }
        result.push(self.inset_shadows.len() as u32);
        for s in &self.inset_shadows {
            result.extend(s.color.map(f32::to_bits));
            result.extend([
                s.blur.to_bits(),
                s.spread.to_bits(),
                s.offset[0].to_bits(),
                s.offset[1].to_bits(),
            ]);
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
        }
        result
    }

    fn fill_at(&self, x: f32, y: f32, width: f32, height: f32, fill: [f32; 4]) -> [f32; 4] {
        let Some(g) = &self.gradient else {
            return fill;
        };
        let angle = g.angle.to_radians();
        let axis = [angle.sin(), -angle.cos()];
        let extent = axis[0].abs() * width + axis[1].abs() * height;
        let t = (((x - width / 2.0) * axis[0] + (y - height / 2.0) * axis[1]) / extent.max(1.0)
            + 0.5)
            .clamp(0.0, 1.0);
        let first = &g.stops[0];
        if t <= first.offset {
            return first.color;
        }
        for pair in g.stops.windows(2) {
            if t <= pair[1].offset {
                let mix =
                    (t - pair[0].offset) / (pair[1].offset - pair[0].offset).max(f32::EPSILON);
                return std::array::from_fn(|i| {
                    pair[0].color[i] + (pair[1].color[i] - pair[0].color[i]) * mix
                });
            }
        }
        g.stops.last().unwrap().color
    }

    pub fn texture(&self, silhouette: &AtomeShapeSilhouette, fill: [f32; 4]) -> AtomeTexture {
        let width = silhouette.width.ceil().max(1.0) as u32;
        let height = silhouette.height.ceil().max(1.0) as u32;
        let mut rgba = vec![0; width as usize * height as usize * 4];
        for y in 0..height {
            for x in 0..width {
                let point = [x as f32 + 0.5, y as f32 + 0.5];
                let coverage = silhouette.coverage(point[0], point[1]);
                if coverage <= 0.0 {
                    continue;
                }
                let mut pixel = self.fill_at(
                    point[0],
                    point[1],
                    silhouette.width,
                    silhouette.height,
                    fill,
                );
                // CSS lists the topmost inset first. Reverse before alpha composition.
                for shadow in self.inset_shadows.iter().rev() {
                    let distance = silhouette
                        .signed_distance(point[0] - shadow.offset[0], point[1] - shadow.offset[1])
                        + shadow.spread;
                    let alpha = if shadow.blur <= 0.0 {
                        (distance + 0.5).clamp(0.0, 1.0)
                    } else {
                        gaussian_cdf(distance / (shadow.blur * 0.5).max(0.001))
                    };
                    pixel = over(pixel, shadow.color, alpha);
                }
                if let Some(border) = &self.border {
                    let distance = silhouette.signed_distance(point[0], point[1]);
                    let edge_color = border
                        .colors
                        .map(|edges| {
                            let distances = [
                                point[1],
                                silhouette.width - point[0],
                                silhouette.height - point[1],
                                point[0],
                            ];
                            let edge = (0..4)
                                .min_by(|a, b| distances[*a].total_cmp(&distances[*b]))
                                .unwrap();
                            edges[edge]
                        })
                        .unwrap_or(border.color);
                    pixel = over(
                        pixel,
                        edge_color,
                        (distance + border.width + 0.5).clamp(0.0, 1.0),
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
