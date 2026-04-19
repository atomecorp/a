// WASM audio engine for Squirrel
// Compiled to WebAssembly via wasm-pack. Provides the same audio API
// as the native Tauri engine, routing through CPAL + Kira in the browser.

use wasm_bindgen::prelude::*;
use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle};
use kira::{AudioManager, AudioManagerSettings, Tween, Decibels, PlaybackRate};
use kira::backend::cpal::CpalBackend;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use std::io::Cursor;

struct ClipEntry {
    data: StaticSoundData,
}

struct VoiceEntry {
    handle: StaticSoundHandle,
}

struct WasmAudioEngine {
    manager: AudioManager<CpalBackend>,
    clips: HashMap<String, ClipEntry>,
    voices: HashMap<String, VoiceEntry>,
}

static ENGINE: once_cell::sync::Lazy<Mutex<Option<WasmAudioEngine>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

#[wasm_bindgen]
pub fn audio_init() -> Result<(), JsValue> {
    let manager = AudioManager::<CpalBackend>::new(AudioManagerSettings::default())
        .map_err(|e| JsValue::from_str(&format!("Failed to create AudioManager: {e}")))?;
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    *guard = Some(WasmAudioEngine {
        manager,
        clips: HashMap::new(),
        voices: HashMap::new(),
    });
    web_sys::console::log_1(&"[squirrel-audio-wasm] Audio engine initialized".into());
    Ok(())
}

/// Load an audio clip from raw bytes (WAV, MP3, OGG).
/// In WASM, we cannot read files from disk so JS must pass the bytes.
#[wasm_bindgen]
pub fn audio_load_clip_from_bytes(id: &str, data: &[u8]) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let cursor = Cursor::new(data.to_vec());
    let sound_data = StaticSoundData::from_cursor(cursor)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode audio: {e}")))?;

    engine.clips.insert(id.to_string(), ClipEntry {
        data: sound_data,
    });
    Ok(())
}

#[wasm_bindgen]
pub fn audio_play(id: &str) -> Result<(), JsValue> {
    audio_play_instance(id, id, 0.0, None, 1.0, 1.0, None, None)
}

fn gain_to_decibels(gain: f64) -> Decibels {
    let clamped = gain.clamp(0.000_001, 16.0);
    Decibels((20.0 * clamped.log10()) as f32)
}

#[wasm_bindgen]
pub fn audio_play_instance(
    asset_id: &str,
    voice_id: &str,
    start_seconds: f64,
    duration_seconds: Option<f64>,
    gain: f64,
    rate: f64,
    loop_start_seconds: Option<f64>,
    loop_end_seconds: Option<f64>,
) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let sound_data_template = engine.clips.get(asset_id)
        .map(|clip| clip.data.clone())
        .ok_or_else(|| JsValue::from_str(&format!("Clip '{asset_id}' not found")))?;

    if let Some(mut existing_voice) = engine.voices.remove(voice_id) {
        existing_voice.handle.stop(Tween::default());
    }

    let mut sound_data = sound_data_template;
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

    let handle = engine.manager.play(sound_data)
        .map_err(|e| JsValue::from_str(&format!("Play error: {e}")))?;
    engine.voices.insert(voice_id.to_string(), VoiceEntry { handle });
    Ok(())
}

#[wasm_bindgen]
pub fn audio_stop(id: &str) -> Result<(), JsValue> {
    audio_stop_instance(id)
}

#[wasm_bindgen]
pub fn audio_stop_instance(voice_id: &str) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let mut voice = engine.voices.remove(voice_id)
        .ok_or_else(|| JsValue::from_str(&format!("Voice '{voice_id}' not found")))?;
    voice.handle.stop(Tween {
        duration: Duration::from_millis(10),
        ..Default::default()
    });
    Ok(())
}

#[wasm_bindgen]
pub fn audio_set_volume(id: &str, db: f64) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let voice = engine.voices.get_mut(id)
        .ok_or_else(|| JsValue::from_str(&format!("Voice '{id}' not found")))?;

    voice.handle.set_volume(
        Decibels(db as f32),
        Tween {
            duration: Duration::from_millis(50),
            ..Default::default()
        },
    );
    Ok(())
}

#[wasm_bindgen]
pub fn audio_set_playback_rate(id: &str, rate: f64) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let voice = engine.voices.get_mut(id)
        .ok_or_else(|| JsValue::from_str(&format!("Voice '{id}' not found")))?;

    voice.handle.set_playback_rate(
        PlaybackRate(rate),
        Tween {
            duration: Duration::from_millis(50),
            ..Default::default()
        },
    );
    Ok(())
}

#[wasm_bindgen]
pub fn audio_destroy_clip(id: &str) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    if let Some(mut voice) = engine.voices.remove(id) {
        voice.handle.stop(Tween::default());
    }
    engine.clips.remove(id);
    Ok(())
}

#[wasm_bindgen]
pub fn audio_shutdown() -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    *guard = None;
    Ok(())
}
