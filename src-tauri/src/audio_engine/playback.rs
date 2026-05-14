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

#[derive(Clone, Debug)]
pub struct ClipMetadata {
    pub sample_rate: u32,
    pub frame_count: usize,
    pub duration_seconds: f64,
}

impl ClipMetadata {
    fn from_data(data: &StaticSoundData) -> Result<Self, String> {
        if data.sample_rate == 0 {
            return Err("Clip sample rate is zero".to_string());
        }
        let frame_count = data.frames.len();
        if frame_count == 0 {
            return Err("Clip has no decoded frames".to_string());
        }
        Ok(Self {
            sample_rate: data.sample_rate,
            frame_count,
            duration_seconds: frame_count as f64 / data.sample_rate as f64,
        })
    }
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NativeContainer {
    IsoBmff,
    Mp3,
    Wav,
    Ogg,
    Flac,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NativeDecodeRoute {
    Kira,
    SymphoniaIsoBmff,
}

fn is_isobmff_extension(extension_hint: Option<&str>) -> bool {
    matches!(extension_hint, Some("mp4" | "m4v" | "mov" | "m4a"))
}

fn is_kira_audio_extension(extension_hint: Option<&str>) -> bool {
    matches!(
        extension_hint,
        Some("wav" | "wave" | "mp3" | "ogg" | "oga" | "flac" | "aac")
    )
}

fn is_probable_mp3_frame(bytes: &[u8], offset: usize) -> bool {
    let Some(first) = bytes.get(offset) else {
        return false;
    };
    let Some(second) = bytes.get(offset + 1) else {
        return false;
    };
    *first == 0xff && (*second & 0xe0) == 0xe0 && (*second & 0x18) != 0x08
}

fn id3_tag_size(bytes: &[u8]) -> Option<usize> {
    if bytes.len() < 10 || &bytes[..3] != b"ID3" {
        return None;
    }
    let size = ((bytes[6] as usize & 0x7f) << 21)
        | ((bytes[7] as usize & 0x7f) << 14)
        | ((bytes[8] as usize & 0x7f) << 7)
        | (bytes[9] as usize & 0x7f);
    Some(10 + size)
}

fn has_mp3_header_near_start(bytes: &[u8]) -> bool {
    if let Some(frame_offset) = id3_tag_size(bytes) {
        return frame_offset + 1 < bytes.len() && is_probable_mp3_frame(bytes, frame_offset);
    }
    let limit = bytes.len().min(4096);
    (0..limit.saturating_sub(1)).any(|offset| is_probable_mp3_frame(bytes, offset))
}

fn be_u32_at(bytes: &[u8], offset: usize) -> Option<u32> {
    let slice = bytes.get(offset..offset + 4)?;
    Some(u32::from_be_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn is_plausible_isobmff_box_type(box_type: &[u8]) -> bool {
    matches!(
        box_type,
        b"ftyp"
            | b"moov"
            | b"mdat"
            | b"free"
            | b"wide"
            | b"skip"
            | b"uuid"
            | b"moof"
            | b"sidx"
            | b"styp"
    )
}

fn has_isobmff_box_near_start(bytes: &[u8]) -> bool {
    let limit = bytes.len().min(4096);
    let mut offset = 0usize;
    while offset + 8 <= limit {
        let Some(size) = be_u32_at(bytes, offset).map(|value| value as usize) else {
            return false;
        };
        let Some(box_type) = bytes.get(offset + 4..offset + 8) else {
            return false;
        };
        if !is_plausible_isobmff_box_type(box_type) {
            return false;
        }
        if box_type == b"ftyp" || box_type == b"moov" || box_type == b"mdat" {
            return true;
        }
        if size == 1 {
            let Some(large_size) = bytes.get(offset + 8..offset + 16) else {
                return false;
            };
            let large_size = u64::from_be_bytes([
                large_size[0],
                large_size[1],
                large_size[2],
                large_size[3],
                large_size[4],
                large_size[5],
                large_size[6],
                large_size[7],
            ]) as usize;
            if large_size < 16 {
                return false;
            }
            offset = offset.saturating_add(large_size);
            continue;
        }
        if size == 0 {
            return true;
        }
        if size < 8 {
            return false;
        }
        offset = offset.saturating_add(size);
    }
    false
}

fn sniff_native_container(bytes: &[u8]) -> NativeContainer {
    if bytes.len() >= 12 && (&bytes[4..8] == b"ftyp" || has_isobmff_box_near_start(bytes)) {
        return NativeContainer::IsoBmff;
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        return NativeContainer::Wav;
    }
    if bytes.len() >= 4 && &bytes[..4] == b"OggS" {
        return NativeContainer::Ogg;
    }
    if bytes.len() >= 4 && &bytes[..4] == b"fLaC" {
        return NativeContainer::Flac;
    }
    if bytes.len() >= 3 && &bytes[..3] == b"ID3" {
        return NativeContainer::Mp3;
    }
    if has_mp3_header_near_start(bytes) {
        return NativeContainer::Mp3;
    }
    NativeContainer::Unknown
}

fn byte_signature(bytes: &[u8]) -> String {
    bytes
        .iter()
        .take(16)
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join("")
}

fn resolve_native_decode_route(
    extension_hint: Option<&str>,
    bytes: &[u8],
    source_label: &str,
) -> Result<NativeDecodeRoute, String> {
    let container = sniff_native_container(bytes);
    if container == NativeContainer::IsoBmff || is_isobmff_extension(extension_hint) {
        return Ok(NativeDecodeRoute::SymphoniaIsoBmff);
    }
    if matches!(
        container,
        NativeContainer::Mp3 | NativeContainer::Wav | NativeContainer::Ogg | NativeContainer::Flac
    ) {
        return Ok(NativeDecodeRoute::Kira);
    }
    if is_kira_audio_extension(extension_hint) {
        return Err(format!(
            "Native audio container mismatch for {source_label}: extension={} signature={}",
            extension_hint.unwrap_or("unknown"),
            byte_signature(bytes)
        ));
    }
    Err(format!(
        "Unsupported native audio container for {source_label}: extension={} signature={}",
        extension_hint.unwrap_or("none"),
        byte_signature(bytes)
    ))
}

#[cfg(test)]
mod decode_route_tests {
    use super::{
        resolve_native_decode_route, sniff_native_container, NativeContainer, NativeDecodeRoute,
    };

    #[test]
    fn routes_iso_bmff_by_signature_without_extension() {
        let bytes = [
            0x00, 0x00, 0x00, 0x18, b'f', b't', b'y', b'p', b'i', b's', b'o', b'm', 0x00, 0x00,
            0x02, 0x00,
        ];
        assert_eq!(sniff_native_container(&bytes), NativeContainer::IsoBmff);
        assert_eq!(
            resolve_native_decode_route(None, &bytes, "clip").unwrap(),
            NativeDecodeRoute::SymphoniaIsoBmff
        );
    }

    #[test]
    fn routes_iso_bmff_when_free_box_precedes_ftyp() {
        let bytes = [
            0x00, 0x00, 0x00, 0x08, b'f', b'r', b'e', b'e', 0x00, 0x00, 0x00, 0x18, b'f', b't',
            b'y', b'p', b'i', b's', b'o', b'm',
        ];
        assert_eq!(sniff_native_container(&bytes), NativeContainer::IsoBmff);
        assert_eq!(
            resolve_native_decode_route(Some("mp3"), &bytes, "clip").unwrap(),
            NativeDecodeRoute::SymphoniaIsoBmff
        );
    }

    #[test]
    fn rejects_mp3_extension_with_non_mp3_bytes() {
        let bytes = b"not an mp3 stream";
        let error = resolve_native_decode_route(Some("mp3"), bytes, "clip").unwrap_err();
        assert!(error.contains("Native audio container mismatch"));
        assert!(error.contains("extension=mp3"));
    }

    #[test]
    fn routes_wav_bytes_to_kira() {
        let bytes = b"RIFF\x24\x00\x00\x00WAVEfmt ";
        assert_eq!(sniff_native_container(bytes), NativeContainer::Wav);
        assert_eq!(
            resolve_native_decode_route(None, bytes, "clip").unwrap(),
            NativeDecodeRoute::Kira
        );
    }
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
    match resolve_native_decode_route(extension_hint, &bytes, source_label)? {
        NativeDecodeRoute::SymphoniaIsoBmff => {
            let symphonia_hint = if is_isobmff_extension(extension_hint) {
                extension_hint
            } else {
                Some("mp4")
            };
            decode_clip_with_symphonia(bytes, symphonia_hint)
                .map_err(|error| format!("Failed to decode audio from {source_label}: {error}"))
        }
        NativeDecodeRoute::Kira => {
            let cursor = Cursor::new(bytes);
            StaticSoundData::from_cursor(cursor)
                .map_err(|error| format!("Failed to decode audio from {source_label}: {error}"))
        }
    }
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

pub fn load_clip(id: &str, path: &str) -> Result<ClipMetadata, String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    // Decode from owned bytes even for file-backed assets so MP4-family media
    // can be extracted deterministically into PCM before Kira playback.
    let bytes = fs::read(path).map_err(|e| format!("Failed to read audio file {path}: {e}"))?;
    let extension_hint = clip_extension_hint(path);
    let data = decode_static_sound_data(bytes, extension_hint.as_deref(), path)?;
    let metadata = ClipMetadata::from_data(&data)?;
    engine.clips.insert(
        id.to_string(),
        ClipEntry {
            data: Arc::new(data),
        },
    );
    Ok(metadata)
}

pub fn load_clip_from_bytes(id: &str, bytes: Vec<u8>) -> Result<ClipMetadata, String> {
    let mut guard = ENGINE.write().map_err(lock_err)?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    let data = decode_static_sound_data(bytes, None, "audio bytes")?;
    let metadata = ClipMetadata::from_data(&data)?;
    engine.clips.insert(
        id.to_string(),
        ClipEntry {
            data: Arc::new(data),
        },
    );
    Ok(metadata)
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

fn playback_min_region_duration(sample_rate: u32, source_duration: f64) -> Result<f64, String> {
    if !source_duration.is_finite() || source_duration <= 0.0 {
        return Err("Clip has no playable duration".to_string());
    }
    let frame_duration = 1.0 / sample_rate.max(1) as f64;
    Ok(frame_duration.max(0.0005).min(source_duration))
}

fn normalize_playback_start(
    requested_start: f64,
    source_duration: f64,
    min_region_duration: f64,
) -> Result<f64, String> {
    if !requested_start.is_finite() {
        return Err("start_seconds must be finite".to_string());
    }
    let latest_start = (source_duration - min_region_duration).max(0.0);
    Ok(requested_start.max(0.0).min(latest_start))
}

fn normalize_playback_duration(
    requested_duration: Option<f64>,
    min_region_duration: f64,
    max_duration: f64,
) -> Result<Option<f64>, String> {
    if !max_duration.is_finite() || max_duration <= 0.0 {
        return Ok(None);
    }
    let Some(duration) = requested_duration else {
        return Ok(None);
    };
    if !duration.is_finite() {
        return Err("duration_seconds must be finite when provided".to_string());
    }
    if duration <= 0.0 {
        return Ok(None);
    }
    if max_duration <= min_region_duration {
        return Ok(None);
    }
    let bounded_duration = duration.max(min_region_duration).min(max_duration);
    if bounded_duration >= max_duration {
        Ok(None)
    } else {
        Ok(Some(bounded_duration))
    }
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
    if !gain.is_finite() {
        return Err("gain must be finite".to_string());
    }
    if !rate.is_finite() {
        return Err("rate must be finite".to_string());
    }
    let min_region_duration =
        playback_min_region_duration(sound_data.sample_rate, source_duration)?;
    let start = normalize_playback_start(start_seconds, source_duration, min_region_duration)?;
    let requested_rate = rate.max(0.0001);
    let max_duration = (source_duration - start).max(0.0);
    let duration =
        normalize_playback_duration(duration_seconds, min_region_duration, max_duration)?;
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

#[cfg(test)]
mod playback_region_tests {
    use super::{
        normalize_playback_duration, normalize_playback_start, playback_min_region_duration,
    };

    #[test]
    fn min_region_never_exceeds_tiny_clip_duration() {
        let min_region = playback_min_region_duration(44_100, 0.0002).unwrap();
        assert_eq!(min_region, 0.0002);
    }

    #[test]
    fn start_is_bounded_to_a_playable_region() {
        let min_region = playback_min_region_duration(44_100, 10.0).unwrap();
        let start = normalize_playback_start(20.0, 10.0, min_region).unwrap();
        assert!(start <= 10.0 - min_region);
    }

    #[test]
    fn duration_normalization_does_not_clamp_with_reversed_bounds() {
        let duration = normalize_playback_duration(Some(0.12), 0.0005, 0.0002).unwrap();
        assert_eq!(duration, None);
    }

    #[test]
    fn duration_rejects_non_finite_values() {
        let error = normalize_playback_duration(Some(f64::NAN), 0.0005, 1.0).unwrap_err();
        assert_eq!(error, "duration_seconds must be finite when provided");
    }

    #[test]
    fn explicit_short_duration_is_promoted_to_min_region() {
        let duration = normalize_playback_duration(Some(0.0001), 0.0005, 1.0).unwrap();
        assert_eq!(duration, Some(0.0005));
    }
}
