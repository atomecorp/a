//! One band's lens at work: its target (the hovered tool), its spring, and the presentation of its
//! geometry over the band's records.
//!
//! The presentation is a pose laid over each record's described transform, never written back as
//! description: the record keeps the base it was described with (`base`), the renderer shows the pose.
//! An op that describes a presented record again (a label's grown text, a tree rebuilt at rest) is seen
//! at the next frame: its new state becomes the base and the pose is laid again over it. `restore` lays
//! every presented record back on its base, which is how a presentation ends.
use bevy::prelude::*;

use crate::components::{AtomeEntityTable, AtomeLocalTransform};
use crate::linear_lens::*;
use crate::record_pose::RecordPose;
use crate::render_ops::apply_transform;

#[derive(Default)]
struct RecordState {
    base: Option<RecordPose>,
    applied: Option<RecordPose>,
    dirty: bool,
}

pub struct LinearLensBand {
    spec: LinearLensSpec,
    hovered: Option<usize>,
    target: Vec<f64>,
    current: Vec<f64>,
    velocity: Vec<f64>,
    grows: Vec<bool>,
    animating: bool,
    previous_at: Option<f64>,
    paint: Option<Vec<LinearLensCell>>,
    displayed: Option<Vec<LinearLensCell>>,
    sent: Vec<Option<LinearLensCell>>,
    records: Vec<Vec<RecordState>>,
    restore_requested: bool,
    frames: u32,
    patches: u32,
}

impl LinearLensBand {
    pub fn new(spec: LinearLensSpec) -> Self {
        let rest = linear_lens_rest_sizes(&spec);
        let displayed = solve_linear_lens_layout(&spec, &rest, spec.viewport);
        let records = spec
            .tiles
            .iter()
            .map(|tile| {
                tile.records
                    .iter()
                    .map(|_| RecordState::default())
                    .collect()
            })
            .collect();
        Self {
            hovered: None,
            velocity: vec![0.0; rest.len()],
            grows: vec![false; rest.len()],
            sent: vec![None; rest.len()],
            target: rest.clone(),
            current: rest,
            animating: false,
            previous_at: None,
            paint: None,
            displayed: Some(displayed),
            records,
            restore_requested: false,
            frames: 0,
            patches: 0,
            spec,
        }
    }

    fn geometry(&self, sizes: &[f64]) -> Vec<LinearLensCell> {
        solve_linear_lens_layout(&self.spec, sizes, self.spec.viewport)
    }

    pub fn hovered(&self) -> Option<usize> {
        self.hovered
    }

    pub fn target_sizes(&self) -> &[f64] {
        &self.target
    }

    /// Aims the lens at `index` (`None`: back to rest). `false` when it already aimed there.
    pub fn set_target(&mut self, index: Option<usize>, reduced_motion: bool) -> bool {
        let hovered = index.filter(|index| *index < self.spec.tiles.len());
        if hovered == self.hovered {
            return false;
        }
        self.hovered = hovered;
        self.target = linear_lens_target_sizes(&self.spec, hovered);
        self.grows = self
            .target
            .iter()
            .zip(&self.current)
            .map(|(target, current)| *target > current + 0.01)
            .collect();
        if reduced_motion {
            self.stop();
            self.current = self.target.clone();
            self.velocity.iter_mut().for_each(|value| *value = 0.0);
            self.paint = Some(self.geometry(&self.current));
        } else {
            self.animating = true;
        }
        true
    }

    fn stop(&mut self) {
        self.animating = false;
        self.previous_at = None;
    }

    /// The tool under `value` along the band, on the geometry aimed at, with the sticky rule: a new tool
    /// is taken only if the point is still on it once IT is the grown one; past either end, the end tool.
    pub fn hover_at(&self, value: f64) -> Option<usize> {
        let cells = self.geometry(&self.target);
        let (vertical, gap) = (self.spec.vertical, self.spec.gap);
        let Some(hit) = hit_linear_lens_cell(value, &cells, vertical, gap) else {
            let first = cells.first()?;
            return Some(if value < first.along(vertical) {
                0
            } else {
                cells.len() - 1
            });
        };
        if let Some(hovered) = self.hovered.filter(|hovered| *hovered != hit) {
            let grown = self.geometry(&linear_lens_target_sizes(&self.spec, Some(hit)));
            if hit_linear_lens_cell(value, &grown, vertical, gap) != Some(hit) {
                return Some(hovered);
            }
        }
        Some(hit)
    }

    /// A tool's cell on the geometry aimed at.
    pub fn centre_of(&self, index: usize) -> Option<LinearLensCell> {
        self.geometry(&self.target).get(index).copied()
    }

    pub fn current_cells(&self) -> Vec<LinearLensCell> {
        self.geometry(&self.current)
    }

    pub fn is_at_rest(&self) -> bool {
        self.current
            .iter()
            .zip(&self.spec.tiles)
            .all(|(size, tile)| (size - tile.rest[2]).abs() < 0.0001)
    }

    pub fn animating(&self) -> bool {
        self.animating
    }

    pub fn counters(&self) -> (u32, u32) {
        (self.frames, self.patches)
    }

    /// Back to rest at once, every record laid back on its description.
    pub fn snap_to_rest(&mut self) {
        self.stop();
        self.hovered = None;
        self.target = linear_lens_rest_sizes(&self.spec);
        self.current = self.target.clone();
        self.velocity.iter_mut().for_each(|value| *value = 0.0);
        self.paint = None;
        self.displayed = Some(self.geometry(&self.current));
        self.restore_requested = true;
    }

    /// The band scrolled under the lens: every rest square and box moved by `delta` along it.
    pub fn rebase(&mut self, delta: f64) {
        let axis = usize::from(self.spec.vertical);
        for tile in &mut self.spec.tiles {
            tile.rest[axis] += delta;
            tile.records
                .iter_mut()
                .for_each(|record| record.rest[axis] += delta);
        }
        self.repaint();
    }

    /// The band's records described again at rest (its tree rebuilt): their new rest boxes, per tool.
    pub fn refresh(&mut self, records: Vec<Vec<LinearLensRecordSpec>>) {
        for (index, (tile, next)) in self.spec.tiles.iter_mut().zip(records).enumerate() {
            let kept: Vec<RecordState> = next
                .iter()
                .map(|record| {
                    let previous = tile.records.iter().position(|old| old.id == record.id);
                    previous.map_or_else(RecordState::default, |at| {
                        std::mem::take(&mut self.records[index][at])
                    })
                })
                .collect();
            tile.records = next;
            self.records[index] = kept;
        }
        self.repaint();
    }

    fn repaint(&mut self) {
        self.displayed = None;
        self.paint = Some(self.geometry(&self.current));
    }

    fn step_spring(&mut self, now_ms: f64) -> Vec<LinearLensCell> {
        let dt = self.previous_at.map_or(16.0, |previous| now_ms - previous);
        self.previous_at = Some(now_ms);
        let grow = linear_lens_omega(self.spec.settle_ms, self.spec.grow_damping);
        let shrink = linear_lens_omega(self.spec.settle_ms, self.spec.shrink_damping);
        let mut moving = false;
        for index in 0..self.target.len() {
            let (omega, damping) = if self.grows[index] {
                (grow, self.spec.grow_damping)
            } else {
                (shrink, self.spec.shrink_damping)
            };
            let (value, velocity, rest) = step_linear_lens_spring(
                self.current[index],
                self.velocity[index],
                self.target[index],
                dt,
                omega,
                damping,
            );
            self.current[index] = value;
            self.velocity[index] = velocity;
            moving |= !rest;
        }
        self.frames += 1;
        if !moving {
            self.stop();
        }
        // A bounce past the target would push a band that must fit off screen: never past the targets there.
        let sizes: Vec<f64> = if self.spec.bounds.is_some() {
            self.current
                .iter()
                .zip(&self.target)
                .zip(&self.spec.tiles)
                .map(|((size, target), tile)| size.min(target.max(tile.rest[2])))
                .collect()
        } else {
            self.current.clone()
        };
        self.geometry(&sizes)
    }

    /// One renderer frame: sees the ops that described a presented record again, steps the spring, and
    /// lays the poses that changed. Returns whether the lens still needs a next frame.
    pub fn present(&mut self, world: &mut World, now_ms: f64) -> Result<bool, String> {
        self.notice_described_records(world);
        if self.restore_requested {
            self.restore_requested = false;
            return self.restore(world).map(|_| false);
        }
        if self.animating {
            self.paint = Some(self.step_spring(now_ms));
        }
        if let Some(cells) = self.paint.take() {
            for (index, cell) in cells.iter().enumerate() {
                let shown = self.displayed.as_ref().and_then(|shown| shown.get(index));
                let still = shown.is_some_and(|shown| {
                    (shown.x - cell.x).abs() < LINEAR_LENS_EPSILON_PX
                        && (shown.y - cell.y).abs() < LINEAR_LENS_EPSILON_PX
                        && (shown.size - cell.size).abs() < LINEAR_LENS_EPSILON_PX
                });
                if !still {
                    self.sent[index] = Some(*cell);
                    self.records[index]
                        .iter_mut()
                        .for_each(|record| record.dirty = true);
                }
            }
            self.displayed = Some(cells);
        }
        self.lay_dirty_records(world)?;
        Ok(self.animating)
    }

    fn notice_described_records(&mut self, world: &World) {
        let table = world.resource::<AtomeEntityTable>();
        for (tile, states) in self.spec.tiles.iter().zip(&mut self.records) {
            for (record, state) in tile.records.iter().zip(states.iter_mut()) {
                let Some(applied) = &state.applied else {
                    continue;
                };
                let shown = table
                    .by_id
                    .get(&record.id)
                    .and_then(|entity| RecordPose::read(world, *entity));
                match shown {
                    None => *state = RecordState::default(),
                    Some(shown) if &shown != applied => {
                        state.base = Some(shown);
                        state.dirty = true;
                    }
                    Some(_) => {}
                }
            }
        }
    }

    fn lay_dirty_records(&mut self, world: &mut World) -> Result<(), String> {
        for (index, tile) in self.spec.tiles.iter().enumerate() {
            let Some(cell) = self.sent[index] else {
                continue;
            };
            let [rx, ry, rest_size] = tile.rest;
            let k = cell.size / rest_size;
            let (cx, cy) = (cell.x + cell.size / 2.0, cell.y + cell.size / 2.0);
            let clip = linear_lens_cell_clip(&cell, tile.parent_clip).map(|value| value as f32);
            for (record, state) in tile.records.iter().zip(self.records[index].iter_mut()) {
                if !std::mem::take(&mut state.dirty) {
                    continue;
                }
                let Some(entity) = world
                    .resource::<AtomeEntityTable>()
                    .by_id
                    .get(&record.id)
                    .copied()
                else {
                    *state = RecordState::default();
                    continue;
                };
                if state.base.is_none() {
                    state.base = RecordPose::read(world, entity);
                }
                let Some(base) = &state.base else { continue };
                let [bx, by, bw, bh] = record.rest;
                let (dx, dy) = (
                    bx + bw / 2.0 - (rx + rest_size / 2.0),
                    by + bh / 2.0 - (ry + rest_size / 2.0),
                );
                // A label keeps its glyphs' size and lies at its own (grown) width, centred where its rest box was.
                let (width, scale) = if record.label {
                    (f64::from(base.size[0]), 1.0)
                } else {
                    (bw, k)
                };
                let mut pose = base.clone();
                pose.position = [
                    (cx + dx * k - width / 2.0) as f32,
                    (cy + dy * k - bh / 2.0) as f32,
                ];
                pose.local = AtomeLocalTransform::new(
                    [scale as f32, scale as f32],
                    base.local.rotation,
                    [0.5, 0.5],
                );
                pose.clip = Some(clip);
                pose.clip_rotation = 0.0;
                pose.rounded = Vec::new();
                pose.fades = Vec::new();
                apply_transform(world, pose.patch(&record.id))?;
                self.patches += 1;
                state.applied = RecordPose::read(world, entity);
            }
        }
        Ok(())
    }

    /// Lays every presented record back on its description.
    pub fn restore(&mut self, world: &mut World) -> Result<(), String> {
        self.notice_described_records(world);
        self.sent.iter_mut().for_each(|cell| *cell = None);
        for (tile, states) in self.spec.tiles.iter().zip(&mut self.records) {
            for (record, state) in tile.records.iter().zip(states.iter_mut()) {
                let presented = std::mem::take(state);
                let (Some(_), Some(base)) = (presented.applied, presented.base) else {
                    continue;
                };
                apply_transform(world, base.patch(&record.id))?;
                self.patches += 1;
            }
        }
        Ok(())
    }
}
