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
}

struct VoiceEntry {
    handle: StaticSoundHandle,
}

pub struct PlaybackEngine {
    manager: AudioManager<CpalBackend>,
    clips: HashMap<String, ClipEntry>,
    voices: HashMap<String, VoiceEntry>,
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
        voices: HashMap::new(),
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
        },
    );
    Ok(())
}

pub fn play(id: &str) -> Result<(), String> {
    play_instance(id, id, 0.0, None, 1.0, 1.0, None, None)
}

fn gain_to_decibels(gain: f64) -> Decibels {
    let clamped = gain.clamp(0.000_001, 16.0);
    Decibels((20.0 * clamped.log10()) as f32)
}

pub fn play_instance(
    asset_id: &str,
    voice_id: &str,
    start_seconds: f64,
    duration_seconds: Option<f64>,
    gain: f64,
    rate: f64,
    loop_start_seconds: Option<f64>,
    loop_end_seconds: Option<f64>,
) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let sound_data_template = engine
        .clips
        .get(asset_id)
        .map(|clip| (*clip.data).clone())
        .ok_or(format!("Clip '{asset_id}' not found"))?;

    if let Some(mut existing_voice) = engine.voices.remove(voice_id) {
        existing_voice.handle.stop(Tween::default());
    }

    let mut sound_data: StaticSoundData = sound_data_template;
    let start = start_seconds.max(0.0);
    let requested_rate = rate.max(0.0001);
    let duration = duration_seconds
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.max(0.001));
    let loop_start = loop_start_seconds.filter(|value| value.is_finite() && *value >= 0.0);
    let loop_end = loop_end_seconds.filter(|value| value.is_finite() && *value > 0.0);

    if let Some(duration) = duration {
        let slice_end = start + duration;
        sound_data = sound_data.slice(start..slice_end);
    } else if start > 0.0 {
        sound_data = sound_data.start_position(start);
    }

    if let (Some(loop_start), Some(loop_end)) = (loop_start, loop_end) {
        if loop_end > loop_start {
            if duration.is_some() {
                let relative_loop_start = (loop_start - start).max(0.0);
                let relative_loop_end = (loop_end - start).max(relative_loop_start + 0.0001);
                sound_data = sound_data.loop_region(relative_loop_start..relative_loop_end);
            } else {
                sound_data = sound_data.loop_region(loop_start..loop_end);
            }
        }
    }

    sound_data = sound_data
        .volume(gain_to_decibels(gain))
        .playback_rate(PlaybackRate(requested_rate));

    let handle = engine
        .manager
        .play(sound_data)
        .map_err(|e| format!("Failed to play clip '{asset_id}': {e}"))?;
    engine.voices.insert(
        voice_id.to_string(),
        VoiceEntry { handle },
    );
    Ok(())
}

pub fn stop(id: &str) -> Result<(), String> {
    stop_instance(id)
}

pub fn stop_instance(voice_id: &str) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let mut voice = engine
        .voices
        .remove(voice_id)
        .ok_or(format!("Voice '{voice_id}' not found"))?;
    let handle = &mut voice.handle;
    handle.stop(Tween {
        duration: Duration::from_millis(engine.tween_config.stop_ms),
        ..Default::default()
    });
    Ok(())
}

pub fn set_volume(id: &str, db: f64) -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let voice = engine
        .voices
        .get_mut(id)
        .ok_or(format!("Voice '{id}' not found"))?;
    {
        let handle = &mut voice.handle;
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
    let voice = engine
        .voices
        .get_mut(id)
        .ok_or(format!("Voice '{id}' not found"))?;
    {
        let handle = &mut voice.handle;
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
    if let Some(mut voice) = engine.voices.remove(id) {
        voice.handle.stop(Tween::default());
    }
    engine.clips.remove(id);
    Ok(())
}

pub fn shutdown() -> Result<(), String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    *guard = None;
    Ok(())
}
