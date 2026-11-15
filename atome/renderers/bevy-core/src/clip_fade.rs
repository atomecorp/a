//! Edge fades of a clipping scroll area (`AtomeClipFades`): what an edge of the area hides fades to transparent over
//! the ground behind it, an eased ramp (the eVe home over its wallpaper, user 30 Oct. 2026). An alpha MASK, never a
//! band painted over the content: the part of an atom a fade reaches is drawn as a mesh cut in strips across the
//! fade, each vertex carrying the mask in its colour's alpha — a sprite (shape, text, icon, shadow) through its
//! polygon relay, whose colour material multiplies by it, a glass surface through its own mesh, whose shader does.
//! A fade is `[x, y, width, height, top, bottom, curve, left, right]` in the clip's frame (`ClipFade`): `top` px under
//! the area's top edge, `bottom` px above its bottom edge, `left` px inside its left edge and `right` px inside its right
//! edge (a row that scrolls sideways: the project's ribbon), the mask `1 - (1 - t)^curve` (t: 0 on the edge, 1 a ramp
//! inside it). The mesh is cut in strips across every ramp it meets, in both directions.

use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, Mesh},
    prelude::*,
    render::render_resource::PrimitiveTopology,
    sprite_render::MeshMaterial2d,
};

use crate::{
    backdrop_surface::BackdropSurfaceMaterial,
    clip::rotate_screen,
    clip_polygon::{
        clip_convex_polygon, upsert_sprite_polygon_proxy, write_polygon_into_entity_mesh,
    },
    components::{AtomeClipFades, AtomeLocalTransform, ClipFade},
};

/// Linear pieces of each eased ramp: twelve strips over a tool's 60 px keep the curve within a level or two of 255.
const RAMP_STRIPS: usize = 12;
/// A strip's half-width across the fade: past any surface.
const ACROSS: f32 = 1.0e6;

fn ramp(t: f32, curve: f32) -> f32 {
    1.0 - (1.0 - t.clamp(0.0, 1.0)).powf(curve.max(0.01))
}

/// One axis of a fade: its start, its length and the ramps inside its two edges.
#[derive(Clone, Copy)]
struct Axis {
    start: f32,
    length: f32,
    near: f32,
    far: f32,
}

/// The vertical (`top`, `bottom`) and horizontal (`left`, `right`) axes of a fade.
fn axes(fade: &ClipFade) -> [Axis; 2] {
    let [x, y, width, height, top, bottom, _, left, right] = *fade;
    [
        Axis {
            start: y,
            length: height,
            near: top,
            far: bottom,
        },
        Axis {
            start: x,
            length: width,
            near: left,
            far: right,
        },
    ]
}

/// The mask of one axis at `at`: 1 away from its ramps.
fn axis_alpha(axis: Axis, at: f32, curve: f32) -> f32 {
    let near = if axis.near > 0.0 {
        ramp((at - axis.start) / axis.near, curve)
    } else {
        1.0
    };
    let far = if axis.far > 0.0 {
        ramp((axis.start + axis.length - at) / axis.far, curve)
    } else {
        1.0
    };
    near * far
}

/// The mask at `point` (the fade frame): every fade's ramps multiplied, 1 away from them.
pub(crate) fn fade_alpha(fades: &[ClipFade], point: Vec2) -> f32 {
    fades.iter().fold(1.0, |alpha, fade| {
        let [vertical, horizontal] = axes(fade);
        alpha * axis_alpha(vertical, point.y, fade[6]) * axis_alpha(horizontal, point.x, fade[6])
    })
}

/// Whether a ramp of axis `index` (0 vertical, 1 horizontal) reaches the span `[from, to]` (the fade frame).
fn reaches(fades: &[ClipFade], index: usize, from: f32, to: f32) -> bool {
    fades.iter().any(|fade| {
        let axis = axes(fade)[index];
        (axis.near > 0.0 && from < axis.start + axis.near)
            || (axis.far > 0.0 && to > axis.start + axis.length - axis.far)
    })
}

/// The strips' edges of axis `index` inside `(from, to)`: every ramp cut in `RAMP_STRIPS`.
fn cuts(fades: &[ClipFade], index: usize, from: f32, to: f32) -> Vec<f32> {
    let mut lines: Vec<f32> = fades
        .iter()
        .flat_map(|fade| {
            let axis = axes(fade)[index];
            (0..=RAMP_STRIPS).flat_map(move |step| {
                let share = step as f32 / RAMP_STRIPS as f32;
                [
                    (axis.near > 0.0).then_some(axis.start + axis.near * share),
                    (axis.far > 0.0).then_some(axis.start + axis.length - axis.far * share),
                ]
            })
        })
        .flatten()
        .filter(|line| *line > from && *line < to)
        .collect();
    lines.sort_by(f32::total_cmp);
    lines.dedup_by(|a, b| (*a - *b).abs() < 1.0e-3);
    lines
}

/// The edges of the strips along axis `index` over the span of `points`: none when no ramp of that axis reaches it.
fn strip_edges(fades: &[ClipFade], index: usize, points: &[Vec2]) -> Option<Vec<f32>> {
    let along = |point: &Vec2| if index == 0 { point.y } else { point.x };
    let from = points.iter().map(along).fold(f32::INFINITY, f32::min);
    let to = points.iter().map(along).fold(f32::NEG_INFINITY, f32::max);
    if !reaches(fades, index, from, to) {
        return None;
    }
    let mut edges = vec![from];
    edges.extend(cuts(fades, index, from, to));
    edges.push(to);
    Some(edges)
}

/// The frame an atom is drawn in and the fades' own: an atom-frame point (its unturned box, top-left 0,0, y down)
/// to the clip's frame and back, as `clip_corners_in_atom_frame` maps the clip's corners.
#[derive(Clone, Copy)]
pub(crate) struct FadeFrame {
    pivot: Vec2,
    origin: Vec2,
    scale: Vec2,
    rotation: f32,
    clip_rotation: f32,
}

impl FadeFrame {
    pub(crate) fn new(
        position: [f32; 2],
        size: [f32; 2],
        local: AtomeLocalTransform,
        clip_rotation: f32,
    ) -> Self {
        let origin = Vec2::new(local.origin[0] * size[0], local.origin[1] * size[1]);
        let scale = Vec2::new(
            if local.scale[0].abs() > f32::EPSILON {
                local.scale[0]
            } else {
                1.0
            },
            if local.scale[1].abs() > f32::EPSILON {
                local.scale[1]
            } else {
                1.0
            },
        );
        Self {
            pivot: Vec2::new(position[0], position[1]) + origin,
            origin,
            scale,
            rotation: local.rotation,
            clip_rotation,
        }
    }

    /// An upright box at `position` (a shadow laid flat on the screen).
    pub(crate) fn upright(position: [f32; 2]) -> Self {
        Self {
            pivot: Vec2::new(position[0], position[1]),
            origin: Vec2::ZERO,
            scale: Vec2::ONE,
            rotation: 0.0,
            clip_rotation: 0.0,
        }
    }

    fn to_fade(self, point: Vec2) -> Vec2 {
        let screen = self.pivot + rotate_screen((point - self.origin) * self.scale, self.rotation);
        rotate_screen(screen, -self.clip_rotation)
    }

    fn fade_to_frame(self, point: Vec2) -> Vec2 {
        let screen = rotate_screen(point, self.clip_rotation);
        self.origin + rotate_screen(screen - self.pivot, -self.rotation) / self.scale
    }
}

/// The faded mesh of `polygon` (the atom's visible part, atom frame), centred on `visible` like the quad it replaces,
/// `uv_of` giving a point's UV; its key holds every vertex and its mask. `None`: no fade reaches the polygon.
pub(crate) fn faded_polygon_mesh(
    polygon: &[Vec2],
    visible: [f32; 4],
    fades: &[ClipFade],
    frame: FadeFrame,
    uv_of: impl Fn(Vec2) -> [f32; 2],
) -> Option<(Mesh, Vec<[f32; 4]>)> {
    let across: Vec<Vec2> = polygon.iter().map(|point| frame.to_fade(*point)).collect();
    if across.len() < 3 {
        return None;
    }
    let rows = strip_edges(fades, 0, &across);
    let columns = strip_edges(fades, 1, &across);
    if rows.is_none() && columns.is_none() {
        return None;
    }
    let whole = vec![-ACROSS, ACROSS];
    let (rows, columns) = (
        rows.unwrap_or_else(|| whole.clone()),
        columns.unwrap_or(whole),
    );
    let cells: Vec<[Vec2; 4]> = rows
        .windows(2)
        .flat_map(|row| {
            columns.windows(2).map(move |column| {
                [
                    Vec2::new(column[0], row[0]),
                    Vec2::new(column[1], row[0]),
                    Vec2::new(column[1], row[1]),
                    Vec2::new(column[0], row[1]),
                ]
            })
        })
        .collect();
    let center = Vec2::new(visible[0] + visible[2] / 2.0, visible[1] + visible[3] / 2.0);
    let (mut positions, mut uvs, mut colors, mut indices) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for cell in &cells {
        let piece = clip_convex_polygon(&across, cell);
        if piece.len() < 3 {
            continue;
        }
        let first = positions.len() as u32;
        let local: Vec<Vec2> = piece
            .iter()
            .map(|point| frame.fade_to_frame(*point))
            .collect();
        for (point, fade_point) in local.iter().zip(piece.iter()) {
            positions.push([point.x - center.x, center.y - point.y, 0.0]);
            uvs.push(uv_of(*point));
            colors.push([1.0, 1.0, 1.0, fade_alpha(fades, *fade_point)]);
        }
        // Counter-clockwise front faces, as `polygon_mesh` winds its fan (y flipped).
        let count = local.len();
        let signed_area: f32 = (0..count)
            .map(|index| {
                let [ax, ay, _] = positions[first as usize + index];
                let [bx, by, _] = positions[first as usize + (index + 1) % count];
                ax * by - bx * ay
            })
            .sum();
        for index in 1..count.saturating_sub(1) {
            let (b, c) = (first + index as u32, first + index as u32 + 1);
            indices.extend_from_slice(&if signed_area < 0.0 {
                [first, c, b]
            } else {
                [first, b, c]
            });
        }
    }
    if indices.is_empty() {
        return None;
    }
    let mut key: Vec<[f32; 4]> = positions
        .iter()
        .zip(uvs.iter())
        .map(|(p, uv)| [p[0], p[1], uv[0], uv[1]])
        .collect();
    key.extend(
        colors
            .chunks(4)
            .map(|chunk| [0, 1, 2, 3].map(|index| chunk.get(index).map_or(-1.0, |color| color[3]))),
    );
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    mesh.insert_indices(Indices::U32(indices));
    Some((mesh, key))
}

/// Draws an atom's visible `polygon` faded when a fade reaches it: a sprite through its relay, a glass surface in its
/// own mesh (UV over its whole box). `false`: nothing to fade here (no fade reaches it, or the atom is neither), the
/// ordinary clip goes on.
#[allow(clippy::too_many_arguments)]
pub(crate) fn apply_faded_clip(
    world: &mut World,
    entity: Entity,
    polygon: &[Vec2],
    frame: FadeFrame,
    original: [f32; 4],
    visible: [f32; 4],
    sprite_uv: Option<&dyn Fn(Vec2) -> [f32; 2]>,
    transform: Transform,
) -> Result<bool, String> {
    let Some(fades) = world
        .get::<AtomeClipFades>(entity)
        .map(|value| value.0.clone())
        .filter(|fades| !fades.is_empty())
    else {
        return Ok(false);
    };
    let local_visible = [
        visible[0] - original[0],
        visible[1] - original[1],
        visible[2],
        visible[3],
    ];
    if let Some(uv_of) = sprite_uv {
        let Some((mesh, key)) = faded_polygon_mesh(polygon, local_visible, &fades, frame, uv_of)
        else {
            return Ok(false);
        };
        upsert_sprite_polygon_proxy(world, entity, mesh, key, transform)?;
        return Ok(true);
    }
    if world
        .get::<MeshMaterial2d<BackdropSurfaceMaterial>>(entity)
        .is_none()
    {
        return Ok(false);
    }
    let size = Vec2::new(original[2].max(f32::EPSILON), original[3].max(f32::EPSILON));
    let Some((mesh, key)) = faded_polygon_mesh(polygon, local_visible, &fades, frame, |point| {
        (point / size).to_array()
    }) else {
        return Ok(false);
    };
    write_polygon_into_entity_mesh(world, entity, mesh, key)?;
    Ok(true)
}

#[cfg(test)]
mod clip_fade_tests {
    use super::*;
    use bevy::mesh::VertexAttributeValues;

    const HOME: ClipFade = [0.0, 100.0, 300.0, 400.0, 60.0, 60.0, 2.2, 0.0, 0.0];

    fn at(y: f32) -> Vec2 {
        Vec2::new(150.0, y)
    }

    #[test]
    fn the_mask_is_clear_on_an_edge_and_whole_a_ramp_inside() {
        assert!(fade_alpha(&[HOME], at(100.0)).abs() < 1.0e-6);
        assert!((fade_alpha(&[HOME], at(160.0)) - 1.0).abs() < 1.0e-6);
        assert!((fade_alpha(&[HOME], at(300.0)) - 1.0).abs() < 1.0e-6);
        assert!(fade_alpha(&[HOME], at(500.0)).abs() < 1.0e-6);
        let quarter = fade_alpha(&[HOME], at(115.0));
        assert!(
            (quarter - (1.0 - 0.75f32.powf(2.2))).abs() < 1.0e-5,
            "eased: {quarter}"
        );
    }

    #[test]
    fn a_closed_edge_leaves_its_side_whole() {
        let bottom_only = [0.0, 100.0, 300.0, 400.0, 0.0, 60.0, 2.2, 0.0, 0.0];
        assert!((fade_alpha(&[bottom_only], at(100.0)) - 1.0).abs() < 1.0e-6);
        assert!(!reaches(&[bottom_only], 0, 100.0, 400.0));
    }

    #[test]
    fn a_tile_across_the_top_ramp_is_cut_in_strips_carrying_the_mask() {
        // A 120 px tile from y 80 to 200 (its top cut by the clip at 100), upright.
        let tile = [
            Vec2::new(0.0, 20.0),
            Vec2::new(120.0, 20.0),
            Vec2::new(120.0, 120.0),
            Vec2::new(0.0, 120.0),
        ];
        let (mesh, _) = faded_polygon_mesh(
            &tile,
            [0.0, 20.0, 120.0, 100.0],
            &[HOME],
            FadeFrame::upright([10.0, 80.0]),
            |_| [0.0, 0.0],
        )
        .expect("the top ramp reaches the tile");
        let Some(VertexAttributeValues::Float32x4(colors)) = mesh.attribute(Mesh::ATTRIBUTE_COLOR)
        else {
            panic!("colours")
        };
        let Some(VertexAttributeValues::Float32x3(positions)) =
            mesh.attribute(Mesh::ATTRIBUTE_POSITION)
        else {
            panic!("positions")
        };
        for (position, color) in positions.iter().zip(colors.iter()) {
            // Back to the screen: the quad is centred on its visible box, y up.
            let screen_y = 80.0 + 70.0 - position[1];
            assert!(
                (color[3] - fade_alpha(&[HOME], Vec2::new(0.0, screen_y))).abs() < 1.0e-4,
                "mask at {screen_y}: {}",
                color[3]
            );
        }
        assert!(
            colors.iter().any(|color| color[3] < 0.01),
            "clear on the edge"
        );
        assert!(
            colors.iter().any(|color| color[3] > 0.99),
            "whole past the ramp"
        );
        let Some(Indices::U32(indices)) = mesh.indices() else {
            panic!("indices")
        };
        for triangle in indices.chunks(3) {
            let [a, b, c] = [
                positions[triangle[0] as usize],
                positions[triangle[1] as usize],
                positions[triangle[2] as usize],
            ];
            assert!(
                (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0.0,
                "front faces"
            );
        }
    }

    #[test]
    fn a_row_fades_sideways_inside_its_left_and_right_edges_only() {
        // The ribbon's band, 200 px wide from x 75, half a tool (30 px) at each edge that hides tools.
        let band: ClipFade = [75.0, 0.0, 200.0, 64.0, 0.0, 0.0, 2.2, 30.0, 30.0];
        assert!(fade_alpha(&[band], Vec2::new(75.0, 32.0)).abs() < 1.0e-6);
        assert!((fade_alpha(&[band], Vec2::new(105.0, 32.0)) - 1.0).abs() < 1.0e-6);
        assert!(fade_alpha(&[band], Vec2::new(275.0, 10.0)).abs() < 1.0e-6);
        assert!(
            (fade_alpha(&[band], Vec2::new(175.0, 0.0)) - 1.0).abs() < 1.0e-6,
            "no vertical ramp"
        );
        // A tile cut at the band's left edge (x 75..103 visible) is drawn in columns carrying the mask.
        let tile = [
            Vec2::new(36.0, 0.0),
            Vec2::new(64.0, 0.0),
            Vec2::new(64.0, 64.0),
            Vec2::new(36.0, 64.0),
        ];
        let (mesh, _) = faded_polygon_mesh(
            &tile,
            [36.0, 0.0, 28.0, 64.0],
            &[band],
            FadeFrame::upright([39.0, 0.0]),
            |_| [0.0, 0.0],
        )
        .expect("the left ramp reaches the tile");
        let Some(VertexAttributeValues::Float32x4(colors)) = mesh.attribute(Mesh::ATTRIBUTE_COLOR)
        else {
            panic!("colours")
        };
        let Some(VertexAttributeValues::Float32x3(positions)) =
            mesh.attribute(Mesh::ATTRIBUTE_POSITION)
        else {
            panic!("positions")
        };
        for (position, color) in positions.iter().zip(colors.iter()) {
            let screen_x = 39.0 + 36.0 + 14.0 + position[0];
            assert!(
                (color[3] - fade_alpha(&[band], Vec2::new(screen_x, 0.0))).abs() < 1.0e-4,
                "mask at {screen_x}: {}",
                color[3]
            );
        }
        assert!(
            colors.iter().any(|color| color[3] < 0.01),
            "clear on the edge"
        );
        // A tile in the middle of the band keeps its ordinary quad.
        let middle = [
            Vec2::ZERO,
            Vec2::new(64.0, 0.0),
            Vec2::new(64.0, 64.0),
            Vec2::new(0.0, 64.0),
        ];
        assert!(
            faded_polygon_mesh(
                &middle,
                [0.0, 0.0, 64.0, 64.0],
                &[band],
                FadeFrame::upright([140.0, 0.0]),
                |_| [0.0, 0.0]
            )
            .is_none()
        );
    }

    #[test]
    fn a_tile_away_from_the_ramps_keeps_its_ordinary_quad() {
        let tile = [
            Vec2::ZERO,
            Vec2::new(120.0, 0.0),
            Vec2::new(120.0, 120.0),
            Vec2::new(0.0, 120.0),
        ];
        assert!(
            faded_polygon_mesh(
                &tile,
                [0.0, 0.0, 120.0, 120.0],
                &[HOME],
                FadeFrame::upright([10.0, 200.0]),
                |_| [0.0, 0.0]
            )
            .is_none()
        );
    }
}
