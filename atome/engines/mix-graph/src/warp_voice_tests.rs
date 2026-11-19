// Warped voices: the real Kira sound rendered block by block — the map places the source where it asks, the pitch
// stays the source's (or moves by the asked semitones) whatever the speed, and the voice ends with its map.

use crate::voice::{VoiceEnvelope, VoiceRequest, build_voice_sound};
use crate::warp_voice::VoiceWarp;
use kira::Frame;
use kira::info::MockInfoBuilder;
use kira::sound::SoundData;
use kira::sound::static_sound::StaticSoundData;
use std::f32::consts::TAU;
use std::sync::Arc;

const RATE: u32 = 48_000;
const BLOCK: usize = 512;

fn source(seconds: f32, tone: impl Fn(f32) -> f32) -> StaticSoundData {
    let frames: Arc<[Frame]> = (0..(seconds * RATE as f32) as usize)
        .map(|index| Frame::from_mono(tone(index as f32 / RATE as f32)))
        .collect();
    StaticSoundData {
        sample_rate: RATE,
        frames,
        settings: Default::default(),
        slice: None,
    }
}

fn warped(points: Vec<[f64; 2]>, pitch_semitones: f64) -> VoiceRequest {
    let duration = points[points.len() - 1][0];
    VoiceRequest {
        envelope: Some(VoiceEnvelope {
            duration_seconds: duration,
            ..VoiceEnvelope::default()
        }),
        warp: Some(VoiceWarp {
            points,
            pitch_semitones,
        }),
        ..VoiceRequest::default()
    }
}

// The left channel rendered until the voice ends (or `limit` frames), and whether it ended.
fn render(request: &VoiceRequest, data: StaticSoundData, limit: usize) -> (Vec<f32>, bool) {
    let (mut sound, _handle) = build_voice_sound(data, request)
        .expect("voice")
        .into_sound()
        .expect("sound");
    let info = MockInfoBuilder::new().build();
    let mut left = Vec::new();
    let mut block = vec![Frame::ZERO; BLOCK];
    while left.len() < limit && !sound.finished() {
        sound.on_start_processing();
        sound.process(&mut block, 1.0 / RATE as f64, &info);
        left.extend(block.iter().map(|frame| frame.left));
    }
    (left, sound.finished())
}

// Frequency by rising zero crossings over `range` (seconds).
fn frequency(signal: &[f32], from: f32, to: f32) -> f32 {
    let (a, b) = ((from * RATE as f32) as usize, (to * RATE as f32) as usize);
    let crossings = signal[a..b]
        .windows(2)
        .filter(|pair| pair[0] < 0.0 && pair[1] >= 0.0)
        .count();
    crossings as f32 / (to - from)
}

#[test]
fn the_map_keeps_the_pitch_at_every_speed() {
    let data = source(3.0, |t| 0.5 * (TAU * 440.0 * t).sin());
    // Half speed for a second, then ×1.25 for two.
    let (left, ended) = render(
        &warped(vec![[0.0, 0.0], [1.0, 0.5], [3.0, 3.0]], 0.0),
        data,
        RATE as usize * 4,
    );
    assert!(ended, "the voice ends with its map");
    assert!(
        (left.len() as f32 / RATE as f32 - 3.0).abs() < 0.2,
        "it lasts the map's length: {}",
        left.len()
    );
    let slow = frequency(&left, 0.2, 0.9);
    let fast = frequency(&left, 1.2, 2.8);
    assert!((slow - 440.0).abs() < 4.0, "slowed, still 440 Hz: {slow}");
    assert!((fast - 440.0).abs() < 4.0, "sped up, still 440 Hz: {fast}");
}

#[test]
fn the_pitch_moves_without_the_length() {
    let data = source(2.0, |t| 0.5 * (TAU * 440.0 * t).sin());
    let (left, _) = render(
        &warped(vec![[0.0, 0.0], [2.0, 2.0]], 12.0),
        data,
        RATE as usize * 3,
    );
    assert!(
        (left.len() as f32 / RATE as f32 - 2.0).abs() < 0.2,
        "same length: {}",
        left.len()
    );
    let heard = frequency(&left, 0.3, 1.7);
    assert!((heard - 880.0).abs() < 8.0, "an octave up: {heard}");
}

#[test]
fn a_marker_lands_where_the_map_puts_it() {
    // A burst at 0.5 s of the source, pinned at 1.0 s of the clip.
    let data = source(2.0, |t| {
        if (0.5..0.6).contains(&t) {
            0.8 * (TAU * 1000.0 * t).sin()
        } else {
            0.0
        }
    });
    let (left, _) = render(
        &warped(vec![[0.0, 0.0], [1.0, 0.5], [2.0, 2.0]], 0.0),
        data,
        RATE as usize * 3,
    );
    let onset = left
        .iter()
        .position(|value| value.abs() > 0.2)
        .expect("the burst is heard") as f32
        / RATE as f32;
    assert!(
        (onset - 1.0).abs() < 0.015,
        "heard at 1.0 s of the clip: {onset}"
    );
}

#[test]
fn a_voice_started_inside_its_clip_hears_the_source_there() {
    let data = source(2.0, |t| {
        if (1.0..1.1).contains(&t) {
            0.8 * (TAU * 1000.0 * t).sin()
        } else {
            0.0
        }
    });
    let mut request = warped(vec![[0.0, 0.0], [2.0, 2.0]], 0.0);
    request.envelope = Some(VoiceEnvelope {
        offset_seconds: 0.5,
        duration_seconds: 2.0,
        ..VoiceEnvelope::default()
    });
    let (left, _) = render(&request, data, RATE as usize * 3);
    let onset = left
        .iter()
        .position(|value| value.abs() > 0.2)
        .expect("the burst is heard") as f32
        / RATE as f32;
    assert!(
        (onset - 0.5).abs() < 0.015,
        "0.5 s after a start at 0.5 s: {onset}"
    );
}

#[test]
fn a_map_out_of_range_is_refused() {
    let data = source(1.0, |_| 0.0);
    for points in [
        vec![[0.0, 0.0]],
        vec![[0.0, 0.0], [1.0, 5.0]],
        vec![[0.0, 0.0], [1.0, 0.1]],
        vec![[0.1, 0.0], [1.0, 1.0]],
    ] {
        assert!(build_voice_sound(data.clone(), &warped(points, 0.0)).is_err());
    }
    let mut looped = warped(vec![[0.0, 0.0], [1.0, 1.0]], 0.0);
    looped.loop_start_seconds = Some(0.0);
    looped.loop_end_seconds = Some(0.5);
    assert!(
        build_voice_sound(data, &looped).is_err(),
        "a warped voice never loops"
    );
}
