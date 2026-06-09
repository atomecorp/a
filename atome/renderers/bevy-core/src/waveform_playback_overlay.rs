use bevy::prelude::*;

use crate::{
    render_math::{atome_rect_transform, color_from_rgba, depth_for_layer},
    types::{
        AtomeBevyRendererConfig, AtomeLayer, AtomeLogicalPosition, AtomeLogicalSize,
        AtomeRenderKind, AtomeWaveformPlaybackOverlay, AtomeWaveformPlaybackProgress,
    },
};

const PLAYHEAD_WIDTH: f32 = 2.0;
const PLAYHEAD_CONTRAST_WIDTH: f32 = 4.0;
const PLAYHEAD_GLOW_WIDTH: f32 = 6.0;
const PLAYHEAD_COLOR: [f32; 4] = [0.96, 0.98, 1.0, 0.92];
const PLAYHEAD_CONTRAST_COLOR: [f32; 4] = [0.02, 0.025, 0.03, 0.42];
const PLAYHEAD_GLOW_COLOR: [f32; 4] = [0.96, 0.98, 1.0, 0.18];
const PLAYHEAD_DEPTH_OFFSET: f32 = 0.7;

fn playback_depth_for_layer(layer: i32) -> f32 {
    depth_for_layer(layer) + PLAYHEAD_DEPTH_OFFSET
}

fn spawn_playhead_rect(
    world: &mut World,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    color: [f32; 4],
    z: f32,
) -> Entity {
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    world
        .spawn((
            Sprite::from_color(
                color_from_rgba(color),
                Vec2::new(width.max(1.0), height.max(1.0)),
            ),
            atome_rect_transform(
                x,
                y,
                width.max(1.0),
                height.max(1.0),
                surface_width,
                surface_height,
                z,
            ),
        ))
        .id()
}

pub fn remove_waveform_playback_overlay(world: &mut World, entity: Entity) {
    if let Some(overlay) = world.get::<AtomeWaveformPlaybackOverlay>(entity).cloned() {
        for overlay_entity in overlay.entities {
            if world.get_entity(overlay_entity).is_ok() {
                world.despawn(overlay_entity);
            }
        }
        world
            .entity_mut(entity)
            .remove::<AtomeWaveformPlaybackOverlay>();
    }
}

pub fn rebuild_waveform_playback_overlay(world: &mut World, entity: Entity) -> Result<(), String> {
    remove_waveform_playback_overlay(world, entity);
    let is_waveform = world
        .get::<AtomeRenderKind>(entity)
        .map(|value| value.0 == "audio_waveform")
        .unwrap_or(false);
    if !is_waveform {
        return Ok(());
    }
    if world
        .get::<Visibility>(entity)
        .map(|value| *value == Visibility::Hidden)
        .unwrap_or(false)
    {
        return Ok(());
    }
    let progress = world
        .get::<AtomeWaveformPlaybackProgress>(entity)
        .and_then(|value| value.0)
        .filter(|value| value.is_finite());
    let Some(progress) = progress else {
        return Ok(());
    };
    let position = *world
        .get::<AtomeLogicalPosition>(entity)
        .ok_or_else(|| "bevy_waveform_playback_position_missing".to_string())?;
    let size = *world
        .get::<AtomeLogicalSize>(entity)
        .ok_or_else(|| "bevy_waveform_playback_size_missing".to_string())?;
    let layer = world
        .get::<AtomeLayer>(entity)
        .map(|value| value.0)
        .unwrap_or(0);
    let width = size.width.max(1.0);
    let height = size.height.max(1.0);
    let x = position.x + width * progress.clamp(0.0, 1.0);
    let z = playback_depth_for_layer(layer);
    let entities = vec![
        spawn_playhead_rect(
            world,
            x - PLAYHEAD_CONTRAST_WIDTH / 2.0,
            position.y,
            PLAYHEAD_CONTRAST_WIDTH,
            height,
            PLAYHEAD_CONTRAST_COLOR,
            z - 0.02,
        ),
        spawn_playhead_rect(
            world,
            x - PLAYHEAD_GLOW_WIDTH / 2.0,
            position.y,
            PLAYHEAD_GLOW_WIDTH,
            height,
            PLAYHEAD_GLOW_COLOR,
            z - 0.01,
        ),
        spawn_playhead_rect(
            world,
            x - PLAYHEAD_WIDTH / 2.0,
            position.y,
            PLAYHEAD_WIDTH,
            height,
            PLAYHEAD_COLOR,
            z,
        ),
    ];
    world
        .entity_mut(entity)
        .insert(AtomeWaveformPlaybackOverlay { entities });
    Ok(())
}
