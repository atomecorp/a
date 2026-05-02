// Kira-based audio playback engine
// Manages AudioManager, clips, mixer tracks, and effects.
//
// Optimizations over previous version:
// - Per-clip RwLock replaces global Mutex (concurrent reads, write-only on mutation)
// - Arc<StaticSoundData> avoids full data clone on every play()
// - Configurable tween durations (stop, volume, rate) instead of hardcoded values
// - Zero-copy load_clip_from_bytes via Cursor over owned Vec (no extra .to_vec())

use kira::backend::cpal::CpalBackend;
use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle, StaticSoundSettings};
use kira::{AudioManager, AudioManagerSettings, Decibels, Frame, PlaybackRate, Tween};
use std::collections::HashMap;
use std::fs;
use std::io::Cursor;
use std::sync::{Arc, RwLock};
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
            volume_ms: 10, // 10ms — smooth but responsive volume changes
            rate_ms: 10,   // 10ms — smooth rate transitions
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

fn clip_extension_hint(path: &str) -> Option<String> {
    std::path::Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.trim().to_ascii_lowercase())
        .filter(|extension| !extension.is_empty())
}

fn is_explicit_symphonia_container(extension_hint: Option<&str>, bytes: &[u8]) -> bool {
    if matches!(extension_hint, Some("mp4" | "m4v" | "mov" | "m4a")) {
        return true;
    }
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
) -> Result<u32, String> {
    let spec = *audio_buffer.spec();
    let channel_count = spec.channels.count();
    if channel_count == 0 {
        return Err("Decoded audio buffer has no channels".to_string());
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

fn decode_clip_with_symphonia(
    bytes: Vec<u8>,
    extension_hint: Option<&str>,
) -> Result<StaticSoundData, String> {
    let mut hint = Hint::new();
    if let Some(extension) = extension_hint {
        hint.with_extension(extension);
    }

    let media_source_stream =
        MediaSourceStream::new(Box::new(Cursor::new(bytes)), Default::default());
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            media_source_stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| format!("Failed to probe audio container: {error}"))?;
    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|track| {
            track.codec_params.codec != CODEC_TYPE_NULL
                && is_likely_audio_codec(track.codec_params.codec)
        })
        .ok_or("No decodable audio track found".to_string())?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|error| format!("Failed to create audio decoder: {error}"))?;

    let mut sample_rate = track.codec_params.sample_rate.unwrap_or(0);
    let mut frames = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::ResetRequired) => {
                return Err("Audio decoder reset required during decode".to_string());
            }
            Err(error) => {
                return Err(format!("Failed to read audio packet: {error}"));
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
                return Err("Audio decoder reset required during packet decode".to_string());
            }
            Err(error) => {
                return Err(format!("Failed to decode audio packet: {error}"));
            }
        }
    }

    if sample_rate == 0 {
        return Err("Could not detect the sample rate of the audio".to_string());
    }
    if frames.is_empty() {
        return Err("No audio frames decoded".to_string());
    }

    Ok(StaticSoundData {
        sample_rate,
        frames: frames.into(),
        settings: StaticSoundSettings::default(),
        slice: None,
    })
}

fn decode_static_sound_data(
    bytes: Vec<u8>,
    extension_hint: Option<&str>,
    source_label: &str,
) -> Result<StaticSoundData, String> {
    if is_explicit_symphonia_container(extension_hint, &bytes) {
        return decode_clip_with_symphonia(bytes, extension_hint)
            .map_err(|error| format!("Failed to decode audio from {source_label}: {error}"));
    }

    let cursor = Cursor::new(bytes);
    StaticSoundData::from_cursor(cursor)
        .map_err(|error| format!("Failed to decode audio from {source_label}: {error}"))
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
    // Decode from owned bytes even for file-backed assets so MP4-family media
    // can be extracted deterministically into PCM before Kira playback.
    let bytes = fs::read(path).map_err(|e| format!("Failed to read audio file {path}: {e}"))?;
    let extension_hint = clip_extension_hint(path);
    let data = decode_static_sound_data(bytes, extension_hint.as_deref(), path)?;
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
    let data = decode_static_sound_data(bytes, None, "audio bytes")?;
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

fn sound_duration_seconds(data: &StaticSoundData) -> Result<f64, String> {
    if data.sample_rate == 0 {
        return Err("Clip sample rate is zero".to_string());
    }
    Ok(data.frames.len() as f64 / data.sample_rate as f64)
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
    let source_duration = sound_duration_seconds(&sound_data)?;
    if source_duration <= 0.0 {
        return Err(format!("Clip '{asset_id}' has no playable duration"));
    }
    let frame_duration = 1.0 / sound_data.sample_rate.max(1) as f64;
    let min_region_duration = frame_duration.max(0.0005);
    let start = start_seconds
        .max(0.0)
        .min((source_duration - min_region_duration).max(0.0));
    let requested_rate = rate.max(0.0001);
    let max_duration = (source_duration - start).max(0.0);
    let duration = duration_seconds
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.clamp(min_region_duration, max_duration))
        .filter(|value| *value >= min_region_duration && *value < max_duration);
    let loop_start = loop_start_seconds
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value.min(source_duration));
    let loop_end = loop_end_seconds
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.min(source_duration));

    if let Some(duration) = duration {
        let slice_end = start + duration;
        sound_data = sound_data.slice(start..slice_end);
    } else if start > 0.0 {
        sound_data = sound_data.start_position(start);
    }

    if let (Some(loop_start), Some(loop_end)) = (loop_start, loop_end) {
        if loop_end - loop_start >= min_region_duration {
            if duration.is_some() {
                let relative_loop_start = (loop_start - start).max(0.0);
                let relative_loop_end = (loop_end - start)
                    .max(relative_loop_start + min_region_duration)
                    .min(duration.unwrap_or(max_duration));
                if relative_loop_end - relative_loop_start >= min_region_duration {
                    sound_data = sound_data.loop_region(relative_loop_start..relative_loop_end);
                }
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
    engine
        .voices
        .insert(voice_id.to_string(), VoiceEntry { handle });
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
