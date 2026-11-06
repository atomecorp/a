//! The scroll areas of one UI tree at work: each list's motion (`scroll_motion`) and the presentation
//! of its content over the records the tree was described with.
//!
//! The browser describes the tree at rest (every list at the offset it laid it at) and names, for each
//! record of a list, the chain of clips it sits in: what lies outside every list, then, list by list
//! inward, what clips it inside that list's content. While a list moves, the renderer lays each record's
//! pose itself, its content moved by the distance between the offset it was described at and the
//! offset it shows, its clips moved with the content they belong to, the list's own edge fades by its
//! live offset. A pose is laid over the record's described base (`RecordPose`), never written back as
//! description; a record described again is seen at the next frame and its new state becomes its base.
//! Once the browser describes the tree again at the offset where a list came to rest, the poses equal
//! their bases and nothing is laid any more.
use std::collections::HashMap;

use bevy::prelude::*;
use serde::Deserialize;

use crate::components::{AtomeEntityTable, AtomeVisualOpacity};
use crate::record_pose::RecordPose;
use crate::render_ops::{apply_style, apply_transform};
use crate::scroll_motion::{ScrollMotion, ScrollMotionSpec};
use crate::types::AtomeStylePatch;

/// A list shows less than half a pixel past an edge: that edge hides nothing.
const EDGE_EPSILON_PX: f64 = 0.5;

/// One clip of a record's chain: a rectangle, rounded boundaries and edge fades, all intersected.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct ScrollClip {
    #[serde(default)]
    pub rect: Option<[f32; 4]>,
    #[serde(default)]
    pub rounded: Vec<[f32; 8]>,
    #[serde(default)]
    pub fades: Vec<[f32; 7]>,
}

impl ScrollClip {
    fn moved(&self, dy: f32) -> Self {
        Self {
            rect: self.rect.map(|[x, y, w, h]| [x, y + dy, w, h]),
            rounded: self.rounded.iter().map(|r| moved_rect(*r, dy)).collect(),
            fades: self.fades.iter().map(|f| moved_rect(*f, dy)).collect(),
        }
    }

    fn intersect(&mut self, other: &Self) {
        self.rect = match (self.rect, other.rect) {
            (None, rect) | (rect, None) => rect,
            (Some(a), Some(b)) => {
                let (x, y) = (a[0].max(b[0]), a[1].max(b[1]));
                let right = (a[0] + a[2]).min(b[0] + b[2]);
                let bottom = (a[1] + a[3]).min(b[1] + b[3]);
                // Disjoint: an empty rectangle, which hides whatever it clips.
                Some([x, y, (right - x).max(0.0), (bottom - y).max(0.0)])
            }
        };
        self.rounded.extend(other.rounded.iter().copied());
        self.fades.extend(other.fades.iter().copied());
    }
}

fn moved_rect<const N: usize>(mut value: [f32; N], dy: f32) -> [f32; N] {
    value[1] += dy;
    value
}

/// A link of a record's chain: entering the content of `area` (none: outside every list), then `clip`.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct ScrollChainLink {
    #[serde(default)]
    pub area: Option<String>,
    #[serde(default)]
    pub clip: Option<ScrollClip>,
}

/// What a record is to its list: content moves with it; the thumb runs along its track; an edge's fade
/// shows while that edge hides content.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScrollRecordRole {
    #[default]
    Content,
    Thumb,
    FadeTop,
    FadeBottom,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct ScrollRecordSpec {
    pub id: String,
    /// Its opacity when shown (a record clipped out is described transparent).
    pub opacity: f32,
    #[serde(default)]
    pub role: ScrollRecordRole,
    /// The list a thumb or a fade belongs to.
    #[serde(default)]
    pub area: Option<String>,
    pub chain: Vec<ScrollChainLink>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct ScrollAreaSpec {
    pub id: String,
    pub motion: ScrollMotionSpec,
    /// The list's box `[x, y, width, height]` as described.
    #[serde(rename = "box")]
    pub area_box: [f32; 4],
    pub max: f64,
    /// The offset the tree was described at.
    pub offset: f64,
    /// The browser moved the list itself since it last read it (a reveal, a restored place).
    #[serde(default)]
    pub jump: bool,
    /// `[height, curve]` of the edge mask (`clip_fade`) its records fade into.
    #[serde(default)]
    pub edge_mask: Option<[f32; 2]>,
    /// The thumb's travel along its track.
    #[serde(default)]
    pub thumb_travel: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct ScrollTreeSpec {
    pub areas: Vec<ScrollAreaSpec>,
    pub records: Vec<ScrollRecordSpec>,
}

pub(crate) struct AreaState {
    spec: ScrollAreaSpec,
    motion: ScrollMotion,
    /// What the records were last laid for (offset, shown).
    laid: Option<(f64, f64)>,
}

#[derive(Default)]
struct RecordState {
    base: Option<RecordPose>,
    /// The described offset of every list the base depends on, read with it.
    base_offsets: Vec<(String, f64)>,
    applied: Option<(RecordPose, f32)>,
}

/// A list's place as the browser reads it.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct ScrollAreaReport {
    pub id: String,
    pub offset: f64,
    pub moving: bool,
}

pub struct ScrollTree {
    areas: HashMap<String, AreaState>,
    records: Vec<(ScrollRecordSpec, RecordState)>,
    patches: u32,
}

impl AreaState {
    pub(crate) fn new(spec: ScrollAreaSpec) -> Self {
        Self {
            motion: ScrollMotion::new(
                spec.motion,
                f64::from(spec.area_box[3]),
                spec.max,
                spec.offset,
            ),
            spec,
            laid: None,
        }
    }

    #[cfg(test)]
    pub(crate) fn motion_mut(&mut self) -> &mut ScrollMotion {
        &mut self.motion
    }
}

impl ScrollTree {
    pub fn new(spec: ScrollTreeSpec) -> Self {
        let mut tree = Self {
            areas: HashMap::new(),
            records: Vec::new(),
            patches: 0,
        };
        tree.describe(spec);
        tree
    }

    /// The tree described again: lists keep their motion, records keep their state by id.
    pub fn describe(&mut self, spec: ScrollTreeSpec) {
        let mut areas = HashMap::new();
        for area in spec.areas {
            let state = match self.areas.remove(&area.id) {
                Some(mut state) => {
                    let viewport = f64::from(area.area_box[3]);
                    state
                        .motion
                        .describe(area.motion, viewport, area.max, area.offset, area.jump);
                    state.spec = area;
                    state
                }
                None => AreaState::new(area),
            };
            areas.insert(state.spec.id.clone(), state);
        }
        self.areas = areas;
        let mut previous: HashMap<String, RecordState> = std::mem::take(&mut self.records)
            .into_iter()
            .map(|(spec, state)| (spec.id, state))
            .collect();
        self.records = spec
            .records
            .into_iter()
            .map(|record| {
                let state = previous.remove(&record.id).unwrap_or_default();
                (record, state)
            })
            .collect();
        self.areas.values_mut().for_each(|area| area.laid = None);
    }

    pub fn motion_mut(&mut self, area: &str) -> Option<&mut ScrollMotion> {
        self.areas.get_mut(area).map(|state| &mut state.motion)
    }

    pub fn patches(&self) -> u32 {
        self.patches
    }

    /// Every list's place: the offset it shows and whether it still moves.
    pub fn report(&self) -> Vec<ScrollAreaReport> {
        self.areas
            .values()
            .map(|area| ScrollAreaReport {
                id: area.spec.id.clone(),
                offset: area.motion.offset(),
                moving: area.motion.is_moving(),
            })
            .collect()
    }

    /// One renderer frame: steps the lists and lays the poses of those that moved. Returns whether a
    /// list still moves (the renderer then asks for the next frame).
    pub fn present(&mut self, world: &mut World, now_ms: f64) -> Result<bool, String> {
        let mut moving = false;
        let mut changed = false;
        for area in self.areas.values_mut() {
            moving |= area.motion.step(now_ms);
            let now = (area.motion.offset(), area.motion.shown());
            changed |= area.laid != Some(now);
        }
        if changed {
            self.lay(world)?;
            for area in self.areas.values_mut() {
                area.laid = Some((area.motion.offset(), area.motion.shown()));
            }
        }
        Ok(moving)
    }

    fn lay(&mut self, world: &mut World) -> Result<(), String> {
        for (spec, state) in &mut self.records {
            let Some(entity) = world
                .resource::<AtomeEntityTable>()
                .by_id
                .get(&spec.id)
                .copied()
            else {
                *state = RecordState::default();
                continue;
            };
            // Out of view at its last pose and at this frame's: nothing to read nor lay. A description it
            // got meanwhile is seen once it comes into view.
            if let (Some(base), Some((applied, _))) = (&state.base, &state.applied)
                && !visible(applied)
                && present_record(spec, base, &state.base_offsets, &self.areas)
                    .is_none_or(|(pose, _)| !visible(&pose))
            {
                continue;
            }
            let shown = RecordPose::read(world, entity);
            // Described again since the last pose (or never presented): its state is the new base.
            let described = match (&state.applied, &shown) {
                (None, _) => true,
                (Some((applied, _)), Some(shown)) => applied != shown,
                (Some(_), None) => true,
            };
            if described {
                state.base = shown;
                state.base_offsets = referenced_areas(spec)
                    .filter_map(|id| self.areas.get(id).map(|a| (id.clone(), a.spec.offset)))
                    .collect();
            }
            let Some(base) = &state.base else { continue };
            let Some((pose, opacity)) =
                present_record(spec, base, &state.base_offsets, &self.areas)
            else {
                continue;
            };
            let unchanged = state
                .applied
                .as_ref()
                .is_some_and(|(applied, shown_opacity)| {
                    applied == &pose && *shown_opacity == opacity
                });
            let current_opacity = world.get::<AtomeVisualOpacity>(entity).map(|o| o.0);
            if unchanged || (described && &pose == base && current_opacity == Some(opacity)) {
                state.applied = Some((pose, opacity));
                continue;
            }
            // A record out of view before and after this frame is not laid again.
            let before = state.applied.as_ref().map_or(base, |(applied, _)| applied);
            if !visible(&pose) && !visible(before) {
                if state.applied.is_none() {
                    state.applied = Some((base.clone(), current_opacity.unwrap_or(opacity)));
                }
                continue;
            }
            apply_transform(world, pose.patch(&spec.id))?;
            if current_opacity != Some(opacity) {
                apply_style(world, opacity_patch(&spec.id, opacity))?;
            }
            self.patches += 1;
            state.applied = RecordPose::read(world, entity).map(|pose| (pose, opacity));
        }
        Ok(())
    }

    /// Lays every presented record back on its description (the tree detached).
    pub fn restore(&mut self, world: &mut World) -> Result<(), String> {
        for (spec, state) in &mut self.records {
            let presented = std::mem::take(state);
            let (Some(_), Some(base)) = (presented.applied, presented.base) else {
                continue;
            };
            if world
                .resource::<AtomeEntityTable>()
                .by_id
                .contains_key(&spec.id)
            {
                apply_transform(world, base.patch(&spec.id))?;
            }
        }
        Ok(())
    }
}

fn referenced_areas(spec: &ScrollRecordSpec) -> impl Iterator<Item = &String> {
    spec.chain
        .iter()
        .filter_map(|link| link.area.as_ref())
        .chain(spec.area.as_ref())
}

fn visible(pose: &RecordPose) -> bool {
    pose.clip.is_none_or(|clip| {
        let [x, y] = pose.position;
        let [w, h] = pose.size;
        clip[2] > 0.0
            && clip[3] > 0.0
            && clip[0] < x + w
            && x < clip[0] + clip[2]
            && clip[1] < y + h
            && y < clip[1] + clip[3]
    })
}

fn opacity_patch(id: &str, opacity: f32) -> AtomeStylePatch {
    AtomeStylePatch {
        id: id.to_string(),
        color: None,
        shadow: None,
        backdrop: None,
        surface_paint: None,
        selected: None,
        opacity: Some(opacity),
        playback_progress: None,
        filters: None,
        transition: None,
        procedural: None,
        progress_ring: None,
        corner_radius: None,
        corner_radii: None,
        shape_variant: None,
        star_branches: None,
        star_inner_radius: None,
        polygon_sides: None,
        mask: None,
    }
}

/// A list's edge mask at the offset it shows: each edge fades only while it hides content.
fn edge_fades(area: &AreaState, dy: f32) -> Option<[f32; 7]> {
    let [height, curve] = area.spec.edge_mask?;
    let offset = area.motion.offset();
    let max = area.motion.max();
    let top = if max > 0.0 && offset > EDGE_EPSILON_PX {
        height
    } else {
        0.0
    };
    let bottom = if max > 0.0 && offset < max - EDGE_EPSILON_PX {
        height
    } else {
        0.0
    };
    let [x, y, w, h] = area.spec.area_box;
    (top > 0.0 || bottom > 0.0).then_some([x, y + dy, w, h, top, bottom, curve])
}

/// The pose and opacity a record shows at its lists' live offsets.
pub(crate) fn present_record(
    spec: &ScrollRecordSpec,
    base: &RecordPose,
    base_offsets: &[(String, f64)],
    areas: &HashMap<String, AreaState>,
) -> Option<(RecordPose, f32)> {
    let described = |id: &str| {
        base_offsets
            .iter()
            .find(|(area, _)| area == id)
            .map(|(_, v)| *v)
    };
    let mut clip = ScrollClip::default();
    let mut dy = 0.0_f32;
    for link in &spec.chain {
        if let Some(id) = &link.area {
            let area = areas.get(id)?;
            if let Some(fades) = edge_fades(area, dy) {
                clip.fades.push(fades);
            }
            dy += (described(id)? - area.motion.shown()) as f32;
        }
        if let Some(link_clip) = &link.clip {
            clip.intersect(&link_clip.moved(dy));
        }
    }
    let mut opacity = spec.opacity;
    let mut position = base.position;
    match spec.role {
        ScrollRecordRole::Content => position[1] += dy,
        ScrollRecordRole::Thumb => {
            let area = areas.get(spec.area.as_ref()?)?;
            let max = area.motion.max().max(f64::EPSILON);
            let progress = (area.motion.offset() - described(&area.spec.id)?) / max;
            position[1] += dy + (area.spec.thumb_travel * progress) as f32;
        }
        ScrollRecordRole::FadeTop | ScrollRecordRole::FadeBottom => {
            let area = areas.get(spec.area.as_ref()?)?;
            let (offset, max) = (area.motion.offset(), area.motion.max());
            let hides = if spec.role == ScrollRecordRole::FadeTop {
                offset > EDGE_EPSILON_PX
            } else {
                offset < max - EDGE_EPSILON_PX
            };
            position[1] += dy;
            if !(max > 0.0 && hides) {
                opacity = 0.0;
            }
        }
    }
    let mut pose = base.clone();
    pose.position = position;
    pose.clip = clip.rect;
    pose.rounded = clip.rounded;
    pose.fades = clip.fades;
    Some((pose, opacity))
}
