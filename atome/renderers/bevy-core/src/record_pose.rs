//! A record's described pose as the renderer holds it (position, size, local transform and clips): what a
//! presentation (a lens, a scroll) lays its own pose over, and lays back at its end.
use bevy::prelude::*;

use crate::components::{
    AtomeClipFades, AtomeClipRect, AtomeClipRotation, AtomeClipRoundedRects, AtomeLocalTransform,
    AtomeLogicalPosition, AtomeLogicalSize,
};
use crate::types::AtomeTransformPatch;

#[derive(Clone, Debug, PartialEq)]
pub struct RecordPose {
    pub position: [f32; 2],
    pub size: [f32; 2],
    pub local: AtomeLocalTransform,
    pub clip: Option<[f32; 4]>,
    pub clip_rotation: f32,
    pub rounded: Vec<[f32; 8]>,
    pub fades: Vec<[f32; 7]>,
}

impl RecordPose {
    pub fn read(world: &World, entity: Entity) -> Option<Self> {
        let position = world.get::<AtomeLogicalPosition>(entity)?;
        let size = world.get::<AtomeLogicalSize>(entity)?;
        Some(Self {
            position: [position.x, position.y],
            size: [size.width, size.height],
            local: *world.get::<AtomeLocalTransform>(entity)?,
            clip: world.get::<AtomeClipRect>(entity)?.0,
            clip_rotation: world
                .get::<AtomeClipRotation>(entity)
                .map_or(0.0, |value| value.0),
            rounded: world
                .get::<AtomeClipRoundedRects>(entity)
                .map(|value| value.0.clone())
                .unwrap_or_default(),
            fades: world
                .get::<AtomeClipFades>(entity)
                .map(|value| value.0.clone())
                .unwrap_or_default(),
        })
    }

    pub fn patch(&self, id: &str) -> AtomeTransformPatch {
        AtomeTransformPatch {
            id: id.to_string(),
            logical_position: self.position,
            logical_size: self.size,
            scale: self.local.scale,
            rotation: self.local.rotation,
            origin: self.local.origin,
            clip_rect: self.clip,
            clip_rotation: self.clip_rotation,
            clip_rounded_rects: self.rounded.clone(),
            clip_fades: self.fades.clone(),
        }
    }
}
