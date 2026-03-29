// Kira-based audio playback engine
// Manages AudioManager, clips, mixer tracks, and effects.

use kira::backend::cpal::CpalBackend;
use kira::effect::filter::FilterBuilder;
use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle};
use kira::track::{TrackBuilder, TrackHandle};
use kira::{AudioManager, AudioManagerSettings, Decibels, PlaybackRate, Tween};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

struct ClipEntry {
    data: StaticSoundData,
    handle: Option<StaticSoundHandle>,
}

pub struct PlaybackEngine {
    manager: AudioManager<CpalBackend>,
    clips: HashMap<String, ClipEntry>,
    tracks: HashMap<String, TrackHandle>,
}

static ENGINE: once_cell::sync::Lazy<Mutex<Option<PlaybackEngine>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

pub fn init() -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    if guard.is_some() {
        return Ok(()); // already init
    }
    let manager = AudioManager::<CpalBackend>::new(AudioManagerSettings::default())
        .map_err(|e| format!("Failed to create AudioManager: {e}"))?;
    *guard = Some(PlaybackEngine {
        manager,
        clips: HashMap::new(),
        tracks: HashMap::new(),
    });
    Ok(())
}

pub fn load_clip(id: &str, path: &str) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let data = StaticSoundData::from_file(path)
        .map_err(|e| format!("Failed to load audio from {path}: {e}"))?;
    engine
        .clips
        .insert(id.to_string(), ClipEntry { data, handle: None });
    Ok(())
}

pub fn load_clip_from_bytes(id: &str, bytes: &[u8]) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let cursor = std::io::Cursor::new(bytes.to_vec());
    let data = StaticSoundData::from_cursor(cursor)
        .map_err(|e| format!("Failed to decode audio bytes: {e}"))?;
    engine
        .clips
        .insert(id.to_string(), ClipEntry { data, handle: None });
    Ok(())
}

pub fn play(id: &str) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let clip = engine
        .clips
        .get_mut(id)
        .ok_or(format!("Clip '{id}' not found"))?;
    let handle = engine
        .manager
        .play(clip.data.clone())
        .map_err(|e| format!("Failed to play clip '{id}': {e}"))?;
    clip.handle = Some(handle);
    Ok(())
}

pub fn stop(id: &str) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let clip = engine
        .clips
        .get_mut(id)
        .ok_or(format!("Clip '{id}' not found"))?;
    if let Some(ref mut handle) = clip.handle {
        handle.stop(Tween {
            duration: Duration::from_millis(10),
            ..Default::default()
        });
    }
    clip.handle = None;
    Ok(())
}

pub fn set_volume(id: &str, db: f64) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let clip = engine
        .clips
        .get_mut(id)
        .ok_or(format!("Clip '{id}' not found"))?;
    if let Some(ref mut handle) = clip.handle {
        handle.set_volume(
            Decibels(db as f32),
            Tween {
                duration: Duration::from_millis(50),
                ..Default::default()
            },
        );
    }
    Ok(())
}

pub fn set_playback_rate(id: &str, rate: f64) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let clip = engine
        .clips
        .get_mut(id)
        .ok_or(format!("Clip '{id}' not found"))?;
    if let Some(ref mut handle) = clip.handle {
        handle.set_playback_rate(
            PlaybackRate(rate),
            Tween {
                duration: Duration::from_millis(50),
                ..Default::default()
            },
        );
    }
    Ok(())
}

pub fn destroy_clip(id: &str) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    if let Some(mut clip) = engine.clips.remove(id) {
        if let Some(ref mut handle) = clip.handle {
            handle.stop(Tween::default());
        }
    }
    Ok(())
}

pub fn add_sub_track(track_id: &str) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let track = engine
        .manager
        .add_sub_track(TrackBuilder::new())
        .map_err(|e| format!("Failed to create track '{track_id}': {e}"))?;
    engine.tracks.insert(track_id.to_string(), track);
    Ok(())
}

pub fn add_filter_to_track(track_id: &str, cutoff: f64) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    // Re-create the track with the filter
    let track = engine
        .manager
        .add_sub_track({
            let mut builder = TrackBuilder::new();
            builder.add_effect(FilterBuilder::new().cutoff(cutoff));
            builder
        })
        .map_err(|e| format!("Failed to add filter to track '{track_id}': {e}"))?;
    engine.tracks.insert(track_id.to_string(), track);
    Ok(())
}

pub fn shutdown() -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| format!("Lock error: {e}"))?;
    *guard = None;
    Ok(())
}
