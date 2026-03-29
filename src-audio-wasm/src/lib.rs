// WASM audio engine for Squirrel
// Compiled to WebAssembly via wasm-pack. Provides the same audio API
// as the native Tauri engine, routing through CPAL + Kira in the browser.

use wasm_bindgen::prelude::*;
use kira::sound::static_sound::StaticSoundData;
use kira::{AudioManager, AudioManagerSettings, Tween, Decibels, PlaybackRate};
use kira::backend::cpal::CpalBackend;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use std::io::Cursor;

struct ClipEntry {
    data: StaticSoundData,
    handle: Option<kira::sound::static_sound::StaticSoundHandle>,
}

struct WasmAudioEngine {
    manager: AudioManager<CpalBackend>,
    clips: HashMap<String, ClipEntry>,
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
        handle: None,
    });
    Ok(())
}

#[wasm_bindgen]
pub fn audio_play(id: &str) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let clip = engine.clips.get_mut(id)
        .ok_or_else(|| JsValue::from_str(&format!("Clip '{id}' not found")))?;

    let handle = engine.manager.play(clip.data.clone())
        .map_err(|e| JsValue::from_str(&format!("Play error: {e}")))?;
    clip.handle = Some(handle);
    Ok(())
}

#[wasm_bindgen]
pub fn audio_stop(id: &str) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let clip = engine.clips.get_mut(id)
        .ok_or_else(|| JsValue::from_str(&format!("Clip '{id}' not found")))?;

    if let Some(ref mut handle) = clip.handle {
        handle.stop(Tween {
            duration: Duration::from_millis(10),
            ..Default::default()
        });
    }
    clip.handle = None;
    Ok(())
}

#[wasm_bindgen]
pub fn audio_set_volume(id: &str, db: f64) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let clip = engine.clips.get_mut(id)
        .ok_or_else(|| JsValue::from_str(&format!("Clip '{id}' not found")))?;

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

#[wasm_bindgen]
pub fn audio_set_playback_rate(id: &str, rate: f64) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let clip = engine.clips.get_mut(id)
        .ok_or_else(|| JsValue::from_str(&format!("Clip '{id}' not found")))?;

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

#[wasm_bindgen]
pub fn audio_destroy_clip(id: &str) -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard.as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    if let Some(mut clip) = engine.clips.remove(id) {
        if let Some(ref mut handle) = clip.handle {
            handle.stop(Tween::default());
        }
    }
    Ok(())
}

#[wasm_bindgen]
pub fn audio_shutdown() -> Result<(), JsValue> {
    let mut guard = ENGINE.lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    *guard = None;
    Ok(())
}
