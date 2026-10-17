// The sound one timeline voice plays, shared by the native (Tauri/iOS) and Web
// engines: the clip's source region, its loop, gain, pan and rate, and its
// envelope applied to every rendered frame (todo/audio_to_finalize §2.2). Kira's
// own volume tweens are interpolated in dB per render chunk and start on chunk
// boundaries, so they cannot render a linear fade exactly; the envelope here is
// the timeline's `computeEnvelope` sampled at each output frame.

use kira::info::Info;
use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle};
use kira::sound::{Sound, SoundData};
use kira::{Decibels, Frame, Panning, PlaybackRate};
use serde::Deserialize;
use std::sync::Arc;

use crate::voice_control::{self, VoiceControl};

// Timeline window of a voice: where the voice starts inside its clip, the clip's
// length, its linear fades and, when it stops before the clip's end (a loop
// pass), where it stops; all in seconds of clip (= output) time.
#[derive(Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceEnvelope {
    #[serde(default)]
    pub offset_seconds: f64,
    pub duration_seconds: f64,
    #[serde(default)]
    pub fade_in_seconds: f64,
    #[serde(default)]
    pub fade_out_seconds: f64,
    #[serde(default)]
    pub end_seconds: Option<f64>,
    // A cell's own attack and release (todo/timeline v1.6 §3.9): the attack
    // rises from `attack_start_seconds` (clip time where the cell started), the
    // release falls to silence at the voice's end.
    #[serde(default)]
    pub attack_start_seconds: f64,
    #[serde(default)]
    pub attack_seconds: f64,
    #[serde(default)]
    pub release_seconds: f64,
}

impl VoiceEnvelope {
    // Gain at `t` seconds into the clip; silent once the clip is over.
    pub fn gain_at(&self, t: f64) -> f32 {
        if t >= self.duration_seconds {
            return 0.0;
        }
        let offset = t.clamp(0.0, self.duration_seconds);
        let fade_in = if self.fade_in_seconds > 0.0 { (offset / self.fade_in_seconds).clamp(0.0, 1.0) } else { 1.0 };
        let fade_out_start = (self.duration_seconds - self.fade_out_seconds).max(0.0);
        let fade_out = if self.fade_out_seconds > 0.0 && offset >= fade_out_start {
            ((self.duration_seconds - offset) / self.fade_out_seconds).clamp(0.0, 1.0)
        } else {
            1.0
        };
        let attack = if self.attack_seconds > 0.0 { ((offset - self.attack_start_seconds) / self.attack_seconds).clamp(0.0, 1.0) } else { 1.0 };
        let end = self.end_seconds.map_or(self.duration_seconds, |end| end.min(self.duration_seconds));
        let release = if self.release_seconds > 0.0 { ((end - offset) / self.release_seconds).clamp(0.0, 1.0) } else { 1.0 };
        fade_in.min(fade_out).min(attack).min(release) as f32
    }
}

fn one() -> f64 {
    1.0
}

// What a voice plays; the field names are those of the JS `schedule_instances` voices.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRequest {
    #[serde(default)]
    pub start_seconds: f64,
    #[serde(default)]
    pub duration_seconds: Option<f64>,
    #[serde(default = "one")]
    pub gain: f64,
    #[serde(default)]
    pub pan: f64,
    #[serde(default = "one")]
    pub rate: f64,
    #[serde(default)]
    pub loop_start_seconds: Option<f64>,
    #[serde(default)]
    pub loop_end_seconds: Option<f64>,
    #[serde(default)]
    pub envelope: Option<VoiceEnvelope>,
}

impl Default for VoiceRequest {
    fn default() -> Self {
        Self {
            start_seconds: 0.0, duration_seconds: None, gain: 1.0, pan: 0.0, rate: 1.0,
            loop_start_seconds: None, loop_end_seconds: None, envelope: None,
        }
    }
}

// A voice started on an exact rendered frame (the JS `schedule_instances` list).
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledVoice {
    pub asset_id: String,
    pub voice_id: String,
    pub start_render_frame: u64,
    #[serde(default)]
    pub strip_id: Option<String>,
    #[serde(flatten)]
    pub voice: VoiceRequest,
}

// A voice's sound: Kira's static sound, shaped by its envelope when it has one,
// and reachable by its id for a late end (`voice_control`) once scheduled.
pub struct VoiceSound {
    pub data: StaticSoundData,
    pub envelope: Option<VoiceEnvelope>,
    pub control: Option<Arc<VoiceControl>>,
}

impl VoiceSound {
    // The voice can be ended later by `voice_control::set_end(voice_id, ..)`.
    pub fn controlled(mut self, voice_id: &str) -> Self {
        if self.envelope.is_some() {
            self.control = Some(voice_control::register(voice_id));
        }
        self
    }
}

impl SoundData for VoiceSound {
    type Error = ();
    type Handle = StaticSoundHandle;

    fn into_sound(self) -> Result<(Box<dyn Sound>, Self::Handle), Self::Error> {
        let (inner, handle) = self.data.into_sound()?;
        match self.envelope {
            Some(envelope) => Ok((Box::new(EnvelopedSound { inner, envelope, frames: 0, dt: 0.0, control: self.control }), handle)),
            None => Ok((inner, handle)),
        }
    }
}

struct EnvelopedSound {
    inner: Box<dyn Sound>,
    envelope: VoiceEnvelope,
    // Frames rendered so far: time is counted in frames, so it never drifts.
    frames: u64,
    dt: f64,
    control: Option<Arc<VoiceControl>>,
}

impl EnvelopedSound {
    // Seconds into the clip of the next rendered frame.
    fn clip_time(&self) -> f64 {
        self.envelope.offset_seconds + self.frames as f64 * self.dt
    }

    // Frames the voice lasts: the clip's remaining time, in whole output frames,
    // or less when a late end was asked.
    fn length_frames(&self) -> u64 {
        let end = self.envelope.end_seconds.map_or(self.envelope.duration_seconds, |end| end.min(self.envelope.duration_seconds));
        let natural = ((end - self.envelope.offset_seconds).max(0.0) / self.dt).round() as u64;
        self.control.as_ref().and_then(|control| control.end_frame()).map_or(natural, |late| late.min(natural))
    }

    // The late end's release: full level until `release` frames before the end.
    fn release_gain(&self, length: u64) -> f32 {
        let Some(control) = self.control.as_ref().filter(|control| control.end_frame().is_some()) else { return 1.0 };
        let release = control.release_frames();
        if release == 0 || self.frames + release < length {
            return 1.0;
        }
        (length.saturating_sub(self.frames) as f64 / release as f64).clamp(0.0, 1.0) as f32
    }
}

impl Sound for EnvelopedSound {
    fn on_start_processing(&mut self) {
        self.inner.on_start_processing();
    }

    fn process(&mut self, out: &mut [Frame], dt: f64, info: &Info) {
        self.inner.process(out, dt, info);
        self.dt = dt;
        let length = self.length_frames();
        for frame in out.iter_mut() {
            let gain = if self.frames < length { self.envelope.gain_at(self.clip_time()) * self.release_gain(length) } else { 0.0 };
            *frame = *frame * gain;
            self.frames += 1;
        }
    }

    // A looping source ends with its clip.
    fn finished(&self) -> bool {
        self.inner.finished() || (self.dt > 0.0 && self.frames >= self.length_frames())
    }
}

fn gain_to_decibels(gain: f64) -> Decibels {
    Decibels((20.0 * gain.clamp(0.000_001, 16.0).log10()) as f32)
}

fn duration_seconds(data: &StaticSoundData) -> Result<f64, String> {
    if data.sample_rate == 0 {
        return Err("Clip sample rate is zero".to_string());
    }
    Ok(data.frames.len() as f64 / data.sample_rate as f64)
}

// Shortest region a voice plays: one source frame, at least half a millisecond.
pub fn min_region_duration(sample_rate: u32, source_duration: f64) -> Result<f64, String> {
    if !source_duration.is_finite() || source_duration <= 0.0 {
        return Err("Clip has no playable duration".to_string());
    }
    Ok((1.0 / sample_rate.max(1) as f64).max(0.0005).min(source_duration))
}

pub fn normalize_start(requested: f64, source_duration: f64, min_region: f64) -> Result<f64, String> {
    if !requested.is_finite() {
        return Err("start_seconds must be finite".to_string());
    }
    Ok(requested.max(0.0).min((source_duration - min_region).max(0.0)))
}

// The cropped length, or None when the voice plays to the end of the source.
pub fn normalize_duration(requested: Option<f64>, min_region: f64, max_duration: f64) -> Result<Option<f64>, String> {
    if !max_duration.is_finite() || max_duration <= 0.0 {
        return Ok(None);
    }
    let Some(duration) = requested else { return Ok(None) };
    if !duration.is_finite() {
        return Err("duration_seconds must be finite when provided".to_string());
    }
    if duration <= 0.0 || max_duration <= min_region {
        return Ok(None);
    }
    let bounded = duration.max(min_region).min(max_duration);
    Ok(if bounded >= max_duration { None } else { Some(bounded) })
}

// The voice's sound from the clip's decoded data.
pub fn build_voice_sound(mut data: StaticSoundData, request: &VoiceRequest) -> Result<VoiceSound, String> {
    let source_duration = duration_seconds(&data)?;
    if !request.gain.is_finite() {
        return Err("gain must be finite".to_string());
    }
    if !request.rate.is_finite() {
        return Err("rate must be finite".to_string());
    }
    let min_region = min_region_duration(data.sample_rate, source_duration)?;
    let start = normalize_start(request.start_seconds, source_duration, min_region)?;
    let max_duration = (source_duration - start).max(0.0);
    let duration = normalize_duration(request.duration_seconds, min_region, max_duration)?;
    let loop_start = request.loop_start_seconds.filter(|value| value.is_finite() && *value >= 0.0).map(|value| value.min(source_duration));
    let loop_end = request.loop_end_seconds.filter(|value| value.is_finite() && *value > 0.0).map(|value| value.min(source_duration));
    if let Some(duration) = duration {
        data = data.slice(start..start + duration);
    } else if start > 0.0 {
        data = data.start_position(start);
    }
    if let (Some(loop_start), Some(loop_end)) = (loop_start, loop_end) {
        if loop_end - loop_start >= min_region {
            match duration {
                Some(duration) => {
                    let relative_start = (loop_start - start).max(0.0);
                    let relative_end = (loop_end - start).max(relative_start + min_region).min(duration);
                    if relative_end - relative_start >= min_region {
                        data = data.loop_region(relative_start..relative_end);
                    }
                }
                None => data = data.loop_region(loop_start..loop_end),
            }
        }
    }
    let data = data
        .volume(gain_to_decibels(request.gain))
        .panning(Panning(request.pan.clamp(-1.0, 1.0) as f32))
        .playback_rate(PlaybackRate(request.rate.max(0.0001)));
    let envelope = request.envelope.filter(|envelope| envelope.duration_seconds.is_finite() && envelope.duration_seconds > 0.0);
    Ok(VoiceSound { data, envelope, control: None })
}
