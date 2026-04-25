// WASM audio engine for Squirrel
// Compiled to WebAssembly via wasm-pack. Provides the same audio API
// as the native Tauri engine, routing through CPAL + Kira in the browser.

use kira::backend::cpal::CpalBackend;
use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle, StaticSoundSettings};
use kira::{AudioManager, AudioManagerSettings, Decibels, Frame, PlaybackRate, Tween};
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Mutex;
use std::time::Duration;
use symphonia::core::audio::{AudioBufferRef, SampleBuffer};
use symphonia::core::codecs::{
    CodecType, DecoderOptions, CODEC_TYPE_AAC, CODEC_TYPE_ALAC, CODEC_TYPE_EAC3, CODEC_TYPE_FLAC,
    CODEC_TYPE_MP1, CODEC_TYPE_MP2, CODEC_TYPE_MP3, CODEC_TYPE_NULL, CODEC_TYPE_OPUS,
    CODEC_TYPE_VORBIS,
};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use wasm_bindgen::prelude::*;

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

fn is_explicit_symphonia_container(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[4..8] == b"ftyp"
}

fn is_likely_audio_codec(codec: CodecType) -> bool {
    matches!(
        codec,
        CODEC_TYPE_AAC
            | CODEC_TYPE_ALAC
            | CODEC_TYPE_EAC3
            | CODEC_TYPE_FLAC
            | CODEC_TYPE_MP1
            | CODEC_TYPE_MP2
            | CODEC_TYPE_MP3
            | CODEC_TYPE_OPUS
            | CODEC_TYPE_VORBIS
    )
}

fn append_audio_buffer_frames(
    audio_buffer: AudioBufferRef<'_>,
    frames: &mut Vec<Frame>,
) -> Result<u32, JsValue> {
    let spec = *audio_buffer.spec();
    let channel_count = spec.channels.count();
    if channel_count == 0 {
        return Err(JsValue::from_str("Decoded audio buffer has no channels"));
    }

    let mut sample_buffer = SampleBuffer::<f32>::new(audio_buffer.capacity() as u64, spec);
    sample_buffer.copy_interleaved_ref(audio_buffer);
    let samples = sample_buffer.samples();

    if channel_count == 1 {
        for sample in samples {
            frames.push(Frame::from_mono(*sample));
        }
    } else {
        for chunk in samples.chunks(channel_count) {
            let left = *chunk.first().unwrap_or(&0.0);
            let right = *chunk.get(1).unwrap_or(&left);
            frames.push(Frame::new(left, right));
        }
    }

    Ok(spec.rate)
}

fn decode_clip_with_symphonia(data: &[u8]) -> Result<StaticSoundData, JsValue> {
    let media_source_stream =
        MediaSourceStream::new(Box::new(Cursor::new(data.to_vec())), Default::default());
    let probed = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            media_source_stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| JsValue::from_str(&format!("Failed to probe audio container: {error}")))?;
    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|track| {
            track.codec_params.codec != CODEC_TYPE_NULL
                && is_likely_audio_codec(track.codec_params.codec)
        })
        .ok_or_else(|| JsValue::from_str("No decodable audio track found"))?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|error| JsValue::from_str(&format!("Failed to create audio decoder: {error}")))?;

    let mut sample_rate = track.codec_params.sample_rate.unwrap_or(0);
    let mut frames = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::ResetRequired) => {
                return Err(JsValue::from_str(
                    "Audio decoder reset required during decode",
                ));
            }
            Err(error) => {
                return Err(JsValue::from_str(&format!(
                    "Failed to read audio packet: {error}"
                )));
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(audio_buffer) => {
                let detected_sample_rate = append_audio_buffer_frames(audio_buffer, &mut frames)?;
                if sample_rate == 0 {
                    sample_rate = detected_sample_rate;
                }
            }
            Err(SymphoniaError::IoError(_)) | Err(SymphoniaError::DecodeError(_)) => continue,
            Err(SymphoniaError::ResetRequired) => {
                return Err(JsValue::from_str(
                    "Audio decoder reset required during packet decode",
                ));
            }
            Err(error) => {
                return Err(JsValue::from_str(&format!(
                    "Failed to decode audio packet: {error}"
                )));
            }
        }
    }

    if sample_rate == 0 {
        return Err(JsValue::from_str(
            "Could not detect the sample rate of the audio",
        ));
    }
    if frames.is_empty() {
        return Err(JsValue::from_str("No audio frames decoded"));
    }

    Ok(StaticSoundData {
        sample_rate,
        frames: frames.into(),
        settings: StaticSoundSettings::default(),
        slice: None,
    })
}

#[wasm_bindgen]
pub fn audio_init() -> Result<(), JsValue> {
    let manager = AudioManager::<CpalBackend>::new(AudioManagerSettings::default())
        .map_err(|e| JsValue::from_str(&format!("Failed to create AudioManager: {e}")))?;
    let mut guard = ENGINE
        .lock()
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
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let sound_data = if is_explicit_symphonia_container(data) {
        decode_clip_with_symphonia(data)?
    } else {
        let cursor = Cursor::new(data.to_vec());
        StaticSoundData::from_cursor(cursor)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode audio: {e}")))?
    };

    engine
        .clips
        .insert(id.to_string(), ClipEntry { data: sound_data });
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
    let mut guard = ENGINE
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Lock error: {e}")))?;
    let engine = guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("Audio engine not initialized"))?;

    let sound_data_template = engine
        .clips
        .get(asset_id)
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

    let handle = engine
        .manager
        .play(sound_data)
        .map_err(|e| JsValue::from_str(&format!("Play error: {e}")))?;
    engine
        .voices
        .insert(voice_id.to_string(), VoiceEntry { handle });
    Ok(())
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

    let mut voice = engine
        .voices
        .remove(voice_id)
        .ok_or_else(|| JsValue::from_str(&format!("Voice '{voice_id}' not found")))?;
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
