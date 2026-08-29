//! APNG decoding belongs to the shared image resource, never to a DOM player.
use crate::{
    animated_png_pixels::frame_pixels,
    types::{AtomeRendererDiagnostics, AtomeTexture},
};
use bevy::{
    image::Image,
    prelude::*,
    winit::{UpdateMode, WinitSettings},
};
use image::{codecs::png::PngDecoder, metadata::LoopCount, AnimationDecoder, ImageDecoder, Limits};
use serde::Deserialize;
use std::{collections::HashMap, io::Cursor, time::Duration};

const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_DECODED_ANIMATION_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
pub struct PngAnimationSource {
    #[serde(with = "serde_bytes")]
    pub bytes: Vec<u8>,
    pub source_rect: [f32; 4],
    pub destination_rect: [f32; 4],
    pub corner_radius: f32,
    #[serde(default)]
    pub tint: Option<[f32; 4]>,
    #[serde(default)]
    pub opacity: Option<f32>,
}

pub struct PngPlayback {
    frames: Vec<CachedPngFrame>,
    frame_index: usize,
    loop_duration: f64,
    loops_left: Option<u32>,
    pub deadline: f64,
    delay: f64,
    paused: bool,
    finished: bool,
}

struct CachedPngFrame {
    pixels: Vec<u8>,
    delay: f64,
}

fn decode_frames(
    bytes: &[u8],
    size: [u32; 2],
    source: &PngAnimationSource,
) -> Result<(Vec<CachedPngFrame>, Option<u32>), String> {
    let mut png =
        PngDecoder::new(Cursor::new(bytes)).map_err(|e| format!("bevy_apng_decode:{e}"))?;
    let mut limits = Limits::default();
    limits.max_alloc = Some(MAX_BYTES as u64);
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    png.set_limits(limits)
        .map_err(|e| format!("bevy_apng_limits:{e}"))?;
    if !png.is_apng().map_err(|e| format!("bevy_apng_header:{e}"))? {
        return Err("bevy_apng_animation_required".into());
    }
    let apng = png.apng().map_err(|e| format!("bevy_apng_decode:{e}"))?;
    let loops = match apng.loop_count() {
        LoopCount::Infinite => None,
        LoopCount::Finite(n) => Some(n.get()),
    };
    let mut decoded_bytes = 0usize;
    let mut frames = Vec::new();
    for frame in apng.into_frames() {
        let frame = frame.map_err(|e| format!("bevy_apng_frame:{e}"))?;
        let (num, den) = frame.delay().numer_denom_ms();
        let delay = (f64::from(num) / f64::from(den) / 1000.0).max(0.001);
        let pixels = frame_pixels(frame.into_buffer(), size, source)?;
        decoded_bytes = decoded_bytes
            .checked_add(pixels.len())
            .ok_or("bevy_apng_decoded_resource_limit")?;
        if decoded_bytes > MAX_DECODED_ANIMATION_BYTES {
            return Err("bevy_apng_decoded_resource_limit".into());
        }
        frames.push(CachedPngFrame { pixels, delay });
    }
    if frames.is_empty() {
        return Err("bevy_apng_frame_required".into());
    }
    Ok((frames, loops))
}

impl PngPlayback {
    pub fn new(texture: &AtomeTexture, now: f64) -> Result<(Self, Vec<u8>), String> {
        let source = texture
            .animation
            .clone()
            .ok_or("bevy_apng_source_required")?;
        let pixel_bytes = u64::from(texture.width) * u64::from(texture.height) * 4;
        if texture.width == 0
            || texture.height == 0
            || pixel_bytes > MAX_BYTES as u64
            || source.bytes.len() > MAX_BYTES
            || source.bytes.is_empty()
        {
            return Err("bevy_apng_resource_limit".into());
        }
        if source
            .source_rect
            .iter()
            .chain(&source.destination_rect)
            .any(|v| !v.is_finite())
            || !source.corner_radius.is_finite()
            || source.corner_radius < 0.0
            || source
                .tint
                .iter()
                .flatten()
                .chain(source.opacity.iter())
                .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        {
            return Err("bevy_apng_geometry_invalid".into());
        }
        let (frames, loops_left) =
            decode_frames(&source.bytes, [texture.width, texture.height], &source)?;
        let delay = frames[0].delay;
        let pixels = frames[0].pixels.clone();
        let loop_duration = frames.iter().map(|frame| frame.delay).sum();
        let playback = Self {
            frames,
            frame_index: 0,
            loop_duration,
            loops_left,
            deadline: now + delay,
            delay,
            paused: false,
            finished: false,
        };
        Ok((playback, pixels))
    }

    fn next_pixels(&mut self) -> Result<Option<Vec<u8>>, String> {
        let next_index = self.frame_index + 1;
        if next_index >= self.frames.len() {
            if self.loops_left == Some(1) {
                self.finished = true;
                return Ok(None);
            }
            self.loops_left = self.loops_left.map(|n| n.saturating_sub(1));
            self.frame_index = 0;
        } else {
            self.frame_index = next_index;
        }
        let frame = &self.frames[self.frame_index];
        self.delay = frame.delay;
        self.deadline += self.delay;
        Ok(Some(frame.pixels.clone()))
    }

    pub fn advance(&mut self, now: f64) -> Result<Option<Vec<u8>>, String> {
        if self.finished {
            return Ok(None);
        }
        // Infinite APNGs can skip complete elapsed loops without decoding or
        // visiting every missed frame. This prevents a suspended WebView or a
        // heavy initial scene from entering a permanent catch-up storm.
        if self.loops_left.is_none() && self.loop_duration > 0.0 && now > self.deadline {
            let elapsed_loops = ((now - self.deadline) / self.loop_duration).floor();
            if elapsed_loops >= 1.0 {
                self.deadline += elapsed_loops * self.loop_duration;
            }
        }
        let mut latest = None;
        // Frames are composed and resized once at resource installation. The
        // display clock only copies the newest cached frame into the resident
        // image, so multiple APNGs do not decode PNG data on the UI thread.
        for _ in 0..8 {
            if now < self.deadline || self.finished {
                break;
            }
            if let Some(pixels) = self.next_pixels()? {
                latest = Some(pixels);
            }
        }
        Ok(latest)
    }
}

// image::Frames is intentionally not Send. Its sole lifetime owner is the
// renderer's main-thread resource; entries never retain entities or GPU handles.
#[derive(Default)]
pub struct PngAnimations {
    entries: HashMap<Entity, PngPlayback>,
    saved_modes: Option<(UpdateMode, UpdateMode)>,
}

pub fn remove_animation(world: &mut World, entity: Entity) {
    if let Some(mut animations) = world.get_non_send_mut::<PngAnimations>() {
        animations.entries.remove(&entity);
    }
}

pub fn install_animation(
    world: &mut World,
    entity: Entity,
    texture: &AtomeTexture,
) -> Result<(), String> {
    remove_animation(world, entity);
    if texture.animation.is_none() {
        return Ok(());
    }
    let now = world
        .get_resource::<Time<Real>>()
        .map(|t| t.elapsed_secs_f64())
        .unwrap_or(0.0);
    let (playback, pixels) = PngPlayback::new(texture, now)?;
    let handle = world
        .get::<Sprite>(entity)
        .map(|sprite| sprite.image.clone())
        .or_else(|| {
            world
                .get::<bevy::ui::widget::ImageNode>(entity)
                .map(|node| node.image.clone())
        })
        .ok_or("bevy_apng_image_owner_required")?;
    {
        let mut images = world.resource_mut::<Assets<Image>>();
        let mut image = images.get_mut(&handle).ok_or("bevy_apng_image_required")?;
        image.data = Some(pixels);
    }
    if !world.contains_non_send::<PngAnimations>() {
        world.insert_non_send(PngAnimations::default());
    }
    world
        .non_send_mut::<PngAnimations>()
        .entries
        .insert(entity, playback);
    Ok(())
}

fn with_frame_deadline(mut mode: UpdateMode, interval: Duration) -> UpdateMode {
    if let UpdateMode::Reactive { ref mut wait, .. } = mode {
        *wait = (*wait).min(interval);
    }
    mode
}

pub fn advance_animations(
    mut animations: NonSendMut<PngAnimations>,
    time: Res<Time<Real>>,
    sprites: Query<(
        Option<&Sprite>,
        Option<&bevy::ui::widget::ImageNode>,
        Option<&Visibility>,
    )>,
    mut images: ResMut<Assets<Image>>,
    mut diagnostics: ResMut<AtomeRendererDiagnostics>,
    mut settings: Option<ResMut<WinitSettings>>,
) {
    let now = time.elapsed_secs_f64();
    let mut next: Option<f64> = None;
    let mut active = 0usize;
    animations.entries.retain(|entity, playback| {
        let Ok((sprite, node, visibility)) = sprites.get(*entity) else {
            return false;
        };
        let Some(handle) = sprite.map(|s| &s.image).or_else(|| node.map(|n| &n.image)) else {
            return false;
        };
        if visibility == Some(&Visibility::Hidden) {
            playback.paused = true;
            return true;
        }
        if playback.paused {
            playback.deadline = now + playback.delay;
            playback.paused = false;
        }
        let lateness_ms = ((now - playback.deadline).max(0.0) * 1000.0).max(0.0);
        match playback.advance(now) {
            Ok(Some(pixels)) => {
                let Some(mut image) = images.get_mut(handle) else {
                    return false;
                };
                image.data = Some(pixels);
                diagnostics.apng_frame_updates = diagnostics.apng_frame_updates.saturating_add(1);
                diagnostics.apng_max_lateness_ms =
                    diagnostics.apng_max_lateness_ms.max(lateness_ms);
            }
            Ok(None) => {}
            Err(error) => {
                diagnostics.last_error = Some(error);
                return false;
            }
        }
        if !playback.finished {
            active += 1;
            next = Some(next.map_or(playback.deadline, |n| n.min(playback.deadline)));
        }
        !playback.finished
    });
    diagnostics.apng_active = active;
    if let Some(settings) = settings.as_mut() {
        if let Some(deadline) = next {
            if animations.saved_modes.is_none() {
                animations.saved_modes = Some((settings.focused_mode, settings.unfocused_mode));
            }
            let interval = Duration::from_secs_f64((deadline - now).clamp(0.001, 1.0));
            let (focused, unfocused) = animations.saved_modes.unwrap();
            settings.focused_mode = with_frame_deadline(focused, interval);
            settings.unfocused_mode = with_frame_deadline(unfocused, interval);
        } else if let Some((focused, unfocused)) = animations.saved_modes.take() {
            settings.focused_mode = focused;
            settings.unfocused_mode = unfocused;
        }
    }
}

#[cfg(test)]
#[path = "../../../../tests/rendering/animated_png_tests.rs"]
mod tests;
