// WASM audio engine for Squirrel
// Compiled to WebAssembly via wasm-pack. Provides the same audio API
// as the native Tauri engine, rendering Kira into an AudioContext this module
// owns (`scheduled_backend`), shared with recording for sample-accurate takes.
// The page's other main-thread Rust rides in the same module, loaded once
// (audio_kernels.js): the offline audio kernels (kernels), the voice turns
// (voice) and the calendar engine (calendar).

mod calendar;
mod kernels;
mod mix;
mod scheduled_backend;
mod voice;

use atome_mix_graph::voice::{ScheduledVoice, VoiceRequest, VoiceSound};
use kira::sound::PlaybackState;
use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle};
use kira::{AudioManager, AudioManagerSettings, Decibels, Panning, PlaybackRate, Tween};
use scheduled_backend::ScheduledContextBackend;
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Mutex;
use std::time::Duration;
use wasm_bindgen::prelude::*;

struct ClipEntry {
    data: StaticSoundData,
}

struct VoiceEntry {
    handle: StaticSoundHandle,
}

struct WasmAudioEngine {
    manager: Option<AudioManager<ScheduledContextBackend>>,
    mix: atome_mix_graph::host::MixHost,
    clips: HashMap<String, ClipEntry>,
    voices: HashMap<String, VoiceEntry>,
}

static ENGINE: once_cell::sync::Lazy<Mutex<Option<WasmAudioEngine>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

fn create_audio_manager(
    mix: &atome_mix_graph::host::MixHost,
) -> Result<AudioManager<ScheduledContextBackend>, JsValue> {
    scheduled_backend::install_start_hook(start_due_voice);
    scheduled_backend::install_sounding_hook(voices_sounding);
    scheduled_backend::install_aux_source(mix.aux_outputs());
    AudioManager::<ScheduledContextBackend>::new(AudioManagerSettings {
        main_track_builder: mix.main_track_builder(),
        ..Default::default()
    })
    .map_err(|e| JsValue::from_str(&format!("Failed to create AudioManager: {e}")))
}

fn ensure_engine(guard: &mut Option<WasmAudioEngine>) -> &mut WasmAudioEngine {
    guard.get_or_insert_with(|| WasmAudioEngine {
        manager: None,
        mix: atome_mix_graph::host::MixHost::new(),
        clips: HashMap::new(),
        voices: HashMap::new(),
    })
}

fn ensure_audio_manager(
    engine: &mut WasmAudioEngine,
) -> Result<&mut AudioManager<ScheduledContextBackend>, JsValue> {
    if engine.manager.is_none() {
        engine.manager = Some(create_audio_manager(&engine.mix)?);
    }
    engine
        .manager
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio manager not initialized"))
}

fn is_explicit_symphonia_container(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[4..8] == b"ftyp"
}

#[wasm_bindgen]
pub fn audio_init() -> Result<(), JsValue> {
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = ensure_engine(&mut guard);
    ensure_audio_manager(engine)?;
    web_sys::console::log_1(&"[squirrel-audio-wasm] Audio engine initialized".into());
    Ok(())
}

/// Load an audio clip from raw bytes (WAV, MP3, OGG).
/// In WASM, we cannot read files from disk so JS must pass the bytes.
#[wasm_bindgen]
pub fn audio_load_clip_from_bytes(id: &str, data: &[u8]) -> Result<f64, JsValue> {
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = ensure_engine(&mut guard);

    let sound_data = if is_explicit_symphonia_container(data) {
        atome_mix_graph::clip_decode::decode_clip(data.to_vec(), None)
            .map_err(|error| JsValue::from_str(&error))?
    } else {
        let cursor = Cursor::new(data.to_vec());
        StaticSoundData::from_cursor(cursor)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode audio: {e}")))?
    };

    let duration_seconds = sound_data.duration().as_secs_f64();
    engine
        .clips
        .insert(id.to_string(), ClipEntry { data: sound_data });
    Ok(duration_seconds)
}

#[wasm_bindgen]
pub fn audio_play(id: &str) -> Result<f64, JsValue> {
    audio_play_instance(id, id, 0.0, None, 1.0, 0.0, 1.0, None, None, None)
}

/// The AudioContext playback renders into; recording opens its worklet on it.
#[wasm_bindgen]
pub fn audio_shared_context() -> Result<web_sys::AudioContext, JsValue> {
    scheduled_backend::shared_context()
        .ok_or_else(|| JsValue::from_str("audio_context_not_started"))
}

/// `{ frames_rendered, base_context_frame, sample_rate, discontinuities, block_frames }`.
#[wasm_bindgen]
pub fn audio_render_clock() -> js_sys::Object {
    scheduled_backend::render_clock()
}

/// A demand on the engine: asleep, it renders again; answers its context's
/// resume then, nothing when it was awake.
#[wasm_bindgen]
pub fn audio_wake() -> Result<Option<js_sys::Promise>, JsValue> {
    scheduled_backend::wake()
}

/// `owner` plays on the engine's context itself (`on`) or lets it go: held,
/// the engine never sleeps.
#[wasm_bindgen]
pub fn audio_hold(owner: &str, on: bool) -> Result<Option<js_sys::Promise>, JsValue> {
    scheduled_backend::hold(owner, on)
}

// Whether a started voice still plays (paused or stopped ones need no render).
// The engine taken (a command under way) counts as playing.
fn voices_sounding() -> bool {
    let Ok(guard) = ENGINE.try_lock() else {
        return true;
    };
    guard.as_ref().is_some_and(|engine| {
        engine.voices.values().any(|voice| {
            !matches!(
                voice.handle.state(),
                PlaybackState::Stopped | PlaybackState::Paused
            )
        })
    })
}

fn voice_sound(
    engine: &WasmAudioEngine,
    asset_id: &str,
    request: &VoiceRequest,
) -> Result<VoiceSound, JsValue> {
    let data = engine
        .clips
        .get(asset_id)
        .map(|clip| clip.data.clone())
        .ok_or_else(|| JsValue::from_str(&format!("Clip '{asset_id}' not found")))?;
    atome_mix_graph::voice::build_voice_sound(data, request)
        .map_err(|error| JsValue::from_str(&format!("Clip '{asset_id}': {error}")))
}

fn start_voice(
    engine: &mut WasmAudioEngine,
    voice_id: &str,
    sound: VoiceSound,
) -> Result<(), JsValue> {
    if let Some(mut existing_voice) = engine.voices.remove(voice_id) {
        existing_voice.handle.stop(Tween::default());
    }
    ensure_audio_manager(engine)?;
    let manager = engine
        .manager
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio manager not initialized"))?;
    let handle = engine
        .mix
        .play(manager, voice_id, sound)
        .map_err(|e| JsValue::from_str(&format!("Play error: {e}")))?;
    engine
        .voices
        .insert(voice_id.to_string(), VoiceEntry { handle });
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[wasm_bindgen]
pub fn audio_play_instance(
    asset_id: &str,
    voice_id: &str,
    start_seconds: f64,
    duration_seconds: Option<f64>,
    gain: f64,
    pan: f64,
    rate: f64,
    loop_start_seconds: Option<f64>,
    loop_end_seconds: Option<f64>,
    strip_id: Option<String>,
) -> Result<f64, JsValue> {
    let request = VoiceRequest {
        start_seconds,
        duration_seconds,
        gain,
        pan,
        rate,
        loop_start_seconds,
        loop_end_seconds,
        envelope: None,
    };
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;
    engine.mix.route_voice(voice_id, strip_id.as_deref());
    let sound = voice_sound(engine, asset_id, &request)?;
    scheduled_backend::cancel_scheduled(voice_id);
    scheduled_backend::wake()?;
    start_voice(engine, voice_id, sound)?;
    // The rendered frame this voice starts on: every voice started before the
    // next render pump shares it.
    Ok(scheduled_backend::next_render_frame())
}

/// Starts each voice exactly on its rendered frame (`ScheduledVoice` list, as
/// the native `audio_schedule_instances`): the render loop stops there, starts
/// it, and renders on. A frame already rendered starts it on the next block
/// instead; the returned frames say which.
#[wasm_bindgen]
pub fn audio_schedule_voices(voices: JsValue) -> Result<Vec<f64>, JsValue> {
    let voices: Vec<ScheduledVoice> = serde_wasm_bindgen::from_value(voices)
        .map_err(|error| JsValue::from_str(&format!("Invalid scheduled voices: {error}")))?;
    let mut sounds = Vec::with_capacity(voices.len());
    {
        let mut guard = ENGINE
            .lock()
            .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
        let engine = guard
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;
        for voice in &voices {
            engine
                .mix
                .route_voice(&voice.voice_id, voice.strip_id.as_deref());
            sounds.push(
                voice_sound(engine, &voice.asset_id, &voice.voice)?.controlled(&voice.voice_id),
            );
        }
    }
    scheduled_backend::wake()?;
    Ok(voices
        .iter()
        .zip(sounds)
        .map(|(voice, sound)| {
            scheduled_backend::schedule(&voice.voice_id, sound, voice.start_render_frame) as f64
        })
        .collect())
}

/// A late end for a scheduled or sounding voice: `end_frame` frames after its
/// first one, fading over `release_frames`. Returns whether the voice is known.
#[wasm_bindgen]
pub fn audio_set_voice_end(voice_id: &str, end_frame: f64, release_frames: f64) -> bool {
    atome_mix_graph::voice_control::set_end(
        voice_id,
        end_frame.max(0.0) as u64,
        release_frames.max(0.0) as u64,
    )
}

// Called by the render loop at the exact frame a scheduled voice is due; the
// loop reports a voice that cannot start.
fn start_due_voice(voice_id: &str, sound: VoiceSound) -> Result<(), JsValue> {
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;
    start_voice(engine, voice_id, sound)
}

#[wasm_bindgen]
pub fn audio_stop(id: &str) -> Result<(), JsValue> {
    audio_stop_instance(id)
}

#[wasm_bindgen]
pub fn audio_stop_instance(voice_id: &str) -> Result<(), JsValue> {
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let cancelled = scheduled_backend::cancel_scheduled(voice_id);
    engine.mix.forget_voice(voice_id);
    let Some(mut voice) = engine.voices.remove(voice_id) else {
        if cancelled {
            return Ok(());
        }
        return Err(JsValue::from_str(&format!("Voice '{voice_id}' not found")));
    };
    voice.handle.stop(Tween {
        duration: Duration::from_millis(10),
        ..Default::default()
    });
    Ok(())
}

#[wasm_bindgen]
pub fn audio_set_volume(id: &str, db: f64) -> Result<(), JsValue> {
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let voice = engine
        .voices
        .get_mut(id)
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
pub fn audio_set_pan(id: &str, pan: f64) -> Result<(), JsValue> {
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;
    let voice = engine
        .voices
        .get_mut(id)
        .ok_or_else(|| JsValue::from_str(&format!("Voice '{id}' not found")))?;
    voice.handle.set_panning(
        Panning(pan.clamp(-1.0, 1.0) as f32),
        Tween {
            duration: Duration::from_millis(50),
            ..Default::default()
        },
    );
    Ok(())
}

#[wasm_bindgen]
pub fn audio_set_playback_rate(id: &str, rate: f64) -> Result<(), JsValue> {
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let voice = engine
        .voices
        .get_mut(id)
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
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    if let Some(mut voice) = engine.voices.remove(id) {
        voice.handle.stop(Tween::default());
    }
    engine.clips.remove(id);
    Ok(())
}

#[wasm_bindgen]
pub fn audio_shutdown() -> Result<(), JsValue> {
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    *guard = None;
    Ok(())
}
