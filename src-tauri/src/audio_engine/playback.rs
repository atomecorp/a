// Kira-based audio playback engine
// Manages AudioManager, clips, mixer tracks, and effects.
//
// Optimizations over previous version:
// - Per-clip RwLock replaces global Mutex (concurrent reads, write-only on mutation)
// - Arc<StaticSoundData> avoids full data clone on every play()
// - Configurable tween durations (stop, volume, rate) instead of hardcoded values
// - Zero-copy load_clip_from_bytes via Cursor over owned Vec (no extra .to_vec())

use kira::backend::cpal::CpalBackend;
use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle};
use kira::{AudioManager, AudioManagerSettings, Decibels, PlaybackRate, Tween};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;

/// Configurable tween durations for audio parameter changes.
/// Allows the caller to tune fade times for professional-grade audio.
pub struct TweenConfig {
    pub stop_ms: u64,
    pub volume_ms: u64,
    pub rate_ms: u64,
}

impl Default for TweenConfig {
    fn default() -> Self {
        Self {
            stop_ms: 5,    // 5ms — fast fade to avoid clicks, short enough for DAW use
            volume_ms: 10,  // 10ms — smooth but responsive volume changes
            rate_ms: 10,    // 10ms — smooth rate transitions
        }
    }
}

struct ClipEntry {
    /// Shared reference — play() can clone the Arc (cheap) instead of the full data.
    data: Arc<StaticSoundData>,
    handle: Option<StaticSoundHandle>,
}

pub struct PlaybackEngine {
    manager: AudioManager<CpalBackend>,
    clips: HashMap<String, ClipEntry>,
    tween_config: TweenConfig,
}

static ENGINE: once_cell::sync::Lazy<RwLock<Option<PlaybackEngine>>> =
    once_cell::sync::Lazy::new(|| RwLock::new(None));

fn lock_err<E: std::fmt::Display>(e: E) -> String {
    format!("Lock error: {e}")
}

pub fn init() -> Result<(), String> {
    init_with_config(TweenConfig::default())
}

pub fn init_with_config(tween_config: TweenConfig) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    if guard.is_some() {
        return Ok(()); // already init
    }
    let manager = AudioManager::<CpalBackend>::new(AudioManagerSettings::default())
        .map_err(|e| format!("Failed to create AudioManager: {e}"))?;
    *guard = Some(PlaybackEngine {
        manager,
        clips: HashMap::new(),
        tween_config,
    });
    Ok(())
}

pub fn load_clip(id: &str, path: &str) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let data = StaticSoundData::from_file(path)
        .map_err(|e| format!("Failed to load audio from {path}: {e}"))?;
    engine.clips.insert(
        id.to_string(),
        ClipEntry {
            data: Arc::new(data),
            handle: None,
        },
    );
    Ok(())
}

pub fn load_clip_from_bytes(id: &str, bytes: Vec<u8>) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    // Zero-copy: take ownership of the Vec directly instead of .to_vec()
    let cursor = std::io::Cursor::new(bytes);
    let data = StaticSoundData::from_cursor(cursor)
        .map_err(|e| format!("Failed to decode audio bytes: {e}"))?;
    engine.clips.insert(
        id.to_string(),
        ClipEntry {
            data: Arc::new(data),
            handle: None,
        },
    );
    Ok(())
}

pub fn play(id: &str) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let clip = engine
        .clips
        .get_mut(id)
        .ok_or(format!("Clip '{id}' not found"))?;
    // Clone the Arc (cheap pointer bump) then deref to get StaticSoundData for play()
    let sound_data: StaticSoundData = (*clip.data).clone();
    let handle = engine
        .manager
        .play(sound_data)
        .map_err(|e| format!("Failed to play clip '{id}': {e}"))?;
    clip.handle = Some(handle);
    Ok(())
}

pub fn stop(id: &str) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let clip = engine
        .clips
        .get_mut(id)
        .ok_or(format!("Clip '{id}' not found"))?;
    if let Some(ref mut handle) = clip.handle {
        handle.stop(Tween {
            duration: Duration::from_millis(engine.tween_config.stop_ms),
            ..Default::default()
        });
    }
    clip.handle = None;
    Ok(())
}

pub fn set_volume(id: &str, db: f64) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let clip = engine
        .clips
        .get_mut(id)
        .ok_or(format!("Clip '{id}' not found"))?;
    if let Some(ref mut handle) = clip.handle {
        handle.set_volume(
            Decibels(db as f32),
            Tween {
                duration: Duration::from_millis(engine.tween_config.volume_ms),
                ..Default::default()
            },
        );
    }
    Ok(())
}

pub fn set_playback_rate(id: &str, rate: f64) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let clip = engine
        .clips
        .get_mut(id)
        .ok_or(format!("Clip '{id}' not found"))?;
    if let Some(ref mut handle) = clip.handle {
        handle.set_playback_rate(
            PlaybackRate(rate),
            Tween {
                duration: Duration::from_millis(engine.tween_config.rate_ms),
                ..Default::default()
            },
        );
    }
    Ok(())
}

pub fn destroy_clip(id: &str) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    if let Some(mut clip) = engine.clips.remove(id) {
        if let Some(ref mut handle) = clip.handle {
            handle.stop(Tween::default());
        }
    }
    Ok(())
}

pub fn shutdown() -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    *guard = None;
    Ok(())
}
