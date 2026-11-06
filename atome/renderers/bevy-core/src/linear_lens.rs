//! The lens of a linear tool band (the project's ribbon, the contextual rail): the tool under a finger
//! sliding along the band grows, its neighbours pushed aside, on a spring (rule 20, the hold's lens).
//!
//! The band is described once (`LinearLensSpec`: each tool's rest square and the rest boxes of its
//! records); the finger only moves the target. The renderer then steps the spring on its own frames and
//! lays each record's transform itself (`linear_lens_band.rs`): no per-frame record, diff or op
//! crosses from JavaScript. The geometry is the band's own (`bevy_ui_linear_menu_lens_geometry.js` history:
//! the pivot pushes its neighbours, the grown tool stays whole in a scrolling band's viewport, a bounded
//! band shrinks the growth by 0.05 steps until it fits) and its tokens come from `RIBBON_TOKENS`, sent
//! with the spec. Everything is computed in f64, as the band's layout always was.
use serde::Deserialize;

/// A settling spring stops a tool within this many pixels; a tile moved less than it is not laid again.
pub const LINEAR_LENS_EPSILON_PX: f64 = 0.1;

#[derive(Clone, Debug, Deserialize)]
pub struct LinearLensRecordSpec {
    /// The renderer id of one projected record of the tool (its slab, its glyph, its label…).
    pub id: String,
    /// Its rest box `[x, y, width, height]`, in surface pixels.
    pub rest: [f64; 4],
    /// The tool's inert label: it keeps its glyph size (scale 1) and its own width, grown or not.
    #[serde(default)]
    pub label: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LinearLensTileSpec {
    /// The tool's rest square `[x, y, size]`.
    pub rest: [f64; 3],
    /// The clip of the tool's parent `[x, y, width, height]`: a grown tool is clipped to its cell inside it.
    #[serde(default)]
    pub parent_clip: Option<[f64; 4]>,
    pub records: Vec<LinearLensRecordSpec>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LinearLensSpec {
    pub tiles: Vec<LinearLensTileSpec>,
    /// The band runs down the screen (the rail) rather than across it (the ribbon).
    #[serde(default)]
    pub vertical: bool,
    /// The side of the screen the band grows toward across it (-1: up or left).
    pub inward: f64,
    pub gap: f64,
    /// `[min, max]` along the band: a bounded band never grows past them.
    #[serde(default)]
    pub bounds: Option<[f64; 2]>,
    /// `[min, max]` along a band that scrolls: its visible span, where the grown tool stays whole.
    #[serde(default)]
    pub viewport: Option<[f64; 2]>,
    pub factor: f64,
    pub settle_ms: f64,
    pub grow_damping: f64,
    pub shrink_damping: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinearLensCell {
    pub x: f64,
    pub y: f64,
    pub size: f64,
}

impl LinearLensCell {
    pub fn along(&self, vertical: bool) -> f64 {
        if vertical { self.y } else { self.x }
    }
}

pub fn linear_lens_omega(settle_ms: f64, damping: f64) -> f64 {
    let settle = settle_ms.max(16.0) / 1000.0;
    let zeta = damping.max(0.05);
    if zeta >= 1.0 {
        9.0 / settle
    } else {
        4.0 / (zeta * settle)
    }
}

/// One step of the lens spring: `(value, velocity, at_rest)`.
pub fn step_linear_lens_spring(
    value: f64,
    velocity: f64,
    target: f64,
    dt_ms: f64,
    omega: f64,
    damping: f64,
) -> (f64, f64, bool) {
    let t = dt_ms.clamp(0.0, 32.0) / 1000.0;
    let error = value - target;
    let zeta = damping.max(0.05);
    let (next_error, next_velocity) = if zeta >= 1.0 {
        let decay = (-omega * t).exp();
        (
            (error + (velocity + omega * error) * t) * decay,
            (velocity - omega * (velocity + omega * error) * t) * decay,
        )
    } else {
        let wd = omega * (1.0 - zeta * zeta).sqrt();
        let b = (velocity + zeta * omega * error) / wd;
        let decay = (-zeta * omega * t).exp();
        let (sin, cos) = (wd * t).sin_cos();
        (
            decay * (error * cos + b * sin),
            decay * ((b * wd - zeta * omega * error) * cos - (error * wd + zeta * omega * b) * sin),
        )
    };
    if next_error.abs() < 0.05 && next_velocity.abs() < 2.0 {
        return (target, 0.0, true);
    }
    (target + next_error, next_velocity, false)
}

/// The band laid at `sizes`: the largest tool is the pivot, the ones after it pushed forward and the ones
/// before it backward only as far as the seam needs; across the band a tool grows toward the inside only.
pub fn solve_linear_lens_layout(
    spec: &LinearLensSpec,
    sizes: &[f64],
    viewport: Option<[f64; 2]>,
) -> Vec<LinearLensCell> {
    struct Span {
        start: f64,
        end: f64,
        z: f64,
        cross: f64,
        rest: f64,
    }
    let vertical = spec.vertical;
    let mut spans: Vec<Span> = spec
        .tiles
        .iter()
        .enumerate()
        .map(|(index, tile)| {
            let [x, y, size] = tile.rest;
            let rest = size.max(1.0);
            let z = sizes.get(index).copied().unwrap_or(rest).max(1.0);
            let (along, across) = if vertical { (y, x) } else { (x, y) };
            let centre = along + rest / 2.0;
            let cross = if spec.inward < 0.0 {
                across + rest - z
            } else {
                across
            };
            Span {
                start: centre - z / 2.0,
                end: centre + z / 2.0,
                z,
                cross,
                rest,
            }
        })
        .collect();
    if spans.is_empty() {
        return Vec::new();
    }
    let mut pivot = 0;
    for (index, span) in spans.iter().enumerate() {
        if span.z > spans[pivot].z {
            pivot = index;
        }
    }
    let shift_all = |spans: &mut [Span], shift: f64| {
        for span in spans.iter_mut() {
            span.start += shift;
            span.end += shift;
        }
    };
    for index in pivot + 1..spans.len() {
        let minimum = spans[index - 1].end + spec.gap;
        if spans[index].start < minimum {
            let shift = minimum - spans[index].start;
            shift_all(&mut spans[index..=index], shift);
        }
    }
    for index in (0..pivot).rev() {
        let maximum = spans[index + 1].start - spec.gap;
        if spans[index].end > maximum {
            let shift = maximum - spans[index].end;
            shift_all(&mut spans[index..=index], shift);
        }
    }
    if let Some([min, max]) = viewport.filter(|_| spans[pivot].z > spans[pivot].rest) {
        let grown = &spans[pivot];
        let shift = if grown.end > max {
            max - grown.end
        } else if grown.start < min {
            min - grown.start
        } else {
            0.0
        };
        shift_all(&mut spans, shift);
    }
    if let Some([min, max]) = spec.bounds {
        let overflow_end = spans[spans.len() - 1].end - max;
        let overflow_start = min - spans[0].start;
        let shift = if overflow_end > 0.0 {
            -overflow_end
        } else if overflow_start > 0.0 {
            overflow_start
        } else {
            0.0
        };
        shift_all(&mut spans, shift);
    }
    spans
        .iter()
        .map(|span| {
            let (x, y) = if vertical {
                (span.cross, span.start)
            } else {
                (span.start, span.cross)
            };
            LinearLensCell { x, y, size: span.z }
        })
        .collect()
}

fn linear_lens_fits(spec: &LinearLensSpec, cells: &[LinearLensCell]) -> bool {
    let (Some([min, max]), Some(first), Some(last)) = (spec.bounds, cells.first(), cells.last())
    else {
        return true;
    };
    first.along(spec.vertical) >= min - 0.01 && last.along(spec.vertical) + last.size <= max + 0.01
}

pub fn linear_lens_rest_sizes(spec: &LinearLensSpec) -> Vec<f64> {
    spec.tiles
        .iter()
        .map(|tile| tile.rest[2].max(1.0))
        .collect()
}

/// The hovered tool at `factor`, reduced by 0.05 until the band fits its bounds.
pub fn linear_lens_target_sizes(spec: &LinearLensSpec, hovered: Option<usize>) -> Vec<f64> {
    let rest = linear_lens_rest_sizes(spec);
    let Some(index) = hovered.filter(|index| *index < rest.len() && spec.factor > 1.0) else {
        return rest;
    };
    let mut factor = spec.factor;
    while factor > 1.0001 {
        let mut sizes = rest.clone();
        sizes[index] = rest[index] * factor;
        if linear_lens_fits(spec, &solve_linear_lens_layout(spec, &sizes, None)) {
            return sizes;
        }
        factor = ((factor - 0.05) * 100.0).round() / 100.0;
    }
    rest
}

/// The tool under a coordinate along the band: its span plus half the seam.
pub fn hit_linear_lens_cell(
    value: f64,
    cells: &[LinearLensCell],
    vertical: bool,
    gap: f64,
) -> Option<usize> {
    cells.iter().position(|cell| {
        let start = cell.along(vertical) - gap / 2.0;
        value >= start && value < cell.along(vertical) + cell.size + gap / 2.0
    })
}

/// The cell clip of a grown tool inside its parent's clip; a cell wholly outside it keeps a vanishing
/// rectangle at the edge (an empty rectangle is not a valid clip).
pub fn linear_lens_cell_clip(cell: &LinearLensCell, outer: Option<[f64; 4]>) -> [f64; 4] {
    let Some([ox, oy, ow, oh]) = outer else {
        return [cell.x, cell.y, cell.size, cell.size];
    };
    let x0 = cell.x.max(ox);
    let y0 = cell.y.max(oy);
    let x1 = (cell.x + cell.size).min(ox + ow);
    let y1 = (cell.y + cell.size).min(oy + oh);
    if x1 <= x0 || y1 <= y0 {
        return [x0, y0, 0.001, 0.001];
    }
    [x0, y0, x1 - x0, y1 - y0]
}
