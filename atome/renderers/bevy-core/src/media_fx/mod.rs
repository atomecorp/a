//! Media effects (R-184): the chain of a video strip of the project console
//! (`video_fx` modules, eVe `kernel/mix_modules.js#MIX_VIDEO_EFFECTS`) drawn on
//! every visual media the strip carries, a video (`video_external.wgsl`) or an
//! image (`image_draw.rs`). The description crosses as `{ effect, params, asset }`
//! records in chain order; this module compiles them once per change into the
//! one uniform block both shaders read (`media_fx_stack.wgsl`). An effect left
//! at its identity is dropped here, so it costs the GPU nothing.

pub mod clock;
pub mod grade;
pub mod image_draw;
pub mod lut;
mod stack;

pub use stack::{
    AtomeMediaEffect, MEDIA_FX_SLOTS, MediaFxKind, MediaFxLutBinding, MediaFxStack,
    media_fx_uniform_bytes,
};

use bevy::prelude::*;

/// The compiled chain of a media, kept on its entity. An image carrying one is
/// drawn by `image_draw.rs` instead of the sprite pipeline; a video reads it
/// from its external-texture component.
#[derive(Clone, Debug, Component, PartialEq)]
pub struct AtomeMediaFx(pub MediaFxStack);

/// Shader chunks shared by the two media pipelines. WGSL module-scope
/// declarations do not depend on their order, so a pipeline's own file (its
/// bindings and its `media_sample`) is joined with these.
pub(crate) const MEDIA_FX_STACK_WGSL: &str =
    include_str!("../../assets/shaders/media_fx_stack.wgsl");
pub(crate) const MEDIA_FX_GRADE_WGSL: &str =
    include_str!("../../assets/shaders/media_fx_grade.wgsl");
pub(crate) const MEDIA_FX_SPATIAL_WGSL: &str =
    include_str!("../../assets/shaders/media_fx_spatial.wgsl");

pub(crate) fn media_fx_shader_source(own: &str) -> String {
    [
        own,
        MEDIA_FX_STACK_WGSL,
        MEDIA_FX_GRADE_WGSL,
        MEDIA_FX_SPATIAL_WGSL,
    ]
    .join("\n")
}

/// The chain a node describes, compiled; `None` when every effect is at its identity.
pub fn media_fx_for_effects(effects: &[AtomeMediaEffect]) -> Result<Option<MediaFxStack>, String> {
    let stack = MediaFxStack::compile(effects)?;
    Ok((!stack.is_empty()).then_some(stack))
}

/// Lays a media's chain on its entity (spawn or style patch): an image is drawn
/// by `image_draw.rs` while it carries one, a video's extraction reads it
/// (`video_external_texture::AtomeVideoFxFrame`). An empty chain removes it.
pub fn apply_media_effects(
    world: &mut World,
    entity: Entity,
    effects: &[AtomeMediaEffect],
) -> Result<(), String> {
    match media_fx_for_effects(effects)? {
        Some(stack) => {
            world.entity_mut(entity).insert(AtomeMediaFx(stack));
        }
        None => {
            world.entity_mut(entity).remove::<AtomeMediaFx>();
        }
    }
    Ok(())
}

pub struct AtomeMediaFxPlugin;

impl Plugin for AtomeMediaFxPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<lut::AtomeLutLibrary>();
        clock::build_media_fx_clock(app);
        image_draw::build_image_fx_renderer(app);
    }
}

#[cfg(test)]
mod tests;
