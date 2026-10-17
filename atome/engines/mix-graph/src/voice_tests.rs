// Voice envelope tests: the real Kira sound is rendered block by block and
// compared, frame by frame, with the same voice rendered without envelope.

use crate::voice::{build_voice_sound, VoiceEnvelope, VoiceRequest};
use kira::info::MockInfoBuilder;
use kira::sound::static_sound::StaticSoundData;
use kira::sound::SoundData;
use kira::Frame;
use std::sync::Arc;

const RATE: u32 = 48_000;
const BLOCK: usize = 128;

fn ramp(frames: usize) -> StaticSoundData {
    let frames: Arc<[Frame]> = (0..frames).map(|index| Frame::from_mono(0.25 + (index % 97) as f32 / 200.0)).collect();
    StaticSoundData { sample_rate: RATE, frames, settings: Default::default(), slice: None }
}

fn render(request: &VoiceRequest, data: StaticSoundData, frames: usize) -> (Vec<f32>, bool) {
    let (mut sound, _handle) = build_voice_sound(data, request).expect("voice").into_sound().expect("sound");
    let info = MockInfoBuilder::new().build();
    let mut left = Vec::with_capacity(frames);
    let mut block = vec![Frame::ZERO; BLOCK];
    while left.len() < frames {
        sound.on_start_processing();
        sound.process(&mut block, 1.0 / RATE as f64, &info);
        left.extend(block.iter().map(|frame| frame.left));
    }
    left.truncate(frames);
    (left, sound.finished())
}

// The JS `computeEnvelope` (molecule_support.js), sampled at frame `index`.
fn reference_gain(envelope: &VoiceEnvelope, index: usize) -> f32 {
    envelope.gain_at(envelope.offset_seconds + index as f64 / RATE as f64)
}

#[test]
fn fades_are_applied_on_every_frame() {
    let envelope = VoiceEnvelope { offset_seconds: 0.0, duration_seconds: 0.5, fade_in_seconds: 0.01, fade_out_seconds: 0.02, end_seconds: None, ..Default::default() };
    let frames = (0.5 * RATE as f64) as usize;
    let plain = render(&VoiceRequest::default(), ramp(RATE as usize), frames).0;
    let shaped = render(&VoiceRequest { envelope: Some(envelope), ..Default::default() }, ramp(RATE as usize), frames).0;
    assert_eq!(shaped[0], 0.0, "a fade-in starts from silence");
    for index in 0..frames {
        let expected = plain[index] * reference_gain(&envelope, index);
        assert!((shaped[index] - expected).abs() < 1e-6, "frame {index}: {} vs {expected}", shaped[index]);
    }
    let fade_in_end = (0.01 * RATE as f64) as usize;
    assert!((shaped[fade_in_end + 5] - plain[fade_in_end + 5]).abs() < 1e-6, "full level after the fade-in");
}

#[test]
fn a_voice_started_inside_its_clip_continues_the_fade() {
    let envelope = VoiceEnvelope { offset_seconds: 0.005, duration_seconds: 1.0, fade_in_seconds: 0.01, fade_out_seconds: 0.0, end_seconds: None, ..Default::default() };
    let plain = render(&VoiceRequest::default(), ramp(RATE as usize), 1024).0;
    let shaped = render(&VoiceRequest { envelope: Some(envelope), ..Default::default() }, ramp(RATE as usize), 1024).0;
    assert!((shaped[0] - plain[0] * 0.5).abs() < 1e-6, "half way through a 10 ms fade-in");
}

#[test]
fn a_looping_voice_ends_exactly_with_its_clip() {
    // 1000-frame source looped; the clip lasts 2500 frames.
    let duration = 2500.0 / RATE as f64;
    let request = VoiceRequest {
        loop_start_seconds: Some(0.0), loop_end_seconds: Some(1000.0 / RATE as f64),
        envelope: Some(VoiceEnvelope { duration_seconds: duration, ..Default::default() }), ..Default::default()
    };
    let (shaped, finished) = render(&request, ramp(1000), 2560);
    assert!(shaped[2499].abs() > 0.0, "last frame of the clip sounds");
    assert!(shaped[2500..].iter().all(|sample| *sample == 0.0), "silent from the clip's end");
    assert!(finished, "the looping voice is over with its clip");
    let (_, unbounded) = render(&VoiceRequest { envelope: None, ..request }, ramp(1000), 2560);
    assert!(!unbounded, "without an envelope a loop never ends");
}

#[test]
fn a_voice_cut_by_a_loop_end_keeps_its_fade_out_where_it_was() {
    let envelope = VoiceEnvelope { duration_seconds: 1.0, fade_out_seconds: 0.5, end_seconds: Some(1000.0 / RATE as f64), ..Default::default() };
    let plain = render(&VoiceRequest::default(), ramp(RATE as usize), 1100).0;
    let (shaped, finished) = render(&VoiceRequest { envelope: Some(envelope), ..Default::default() }, ramp(RATE as usize), 1100);
    assert!((shaped[999] - plain[999]).abs() < 1e-6, "full level: the fade-out is at the clip's end, not the loop's");
    assert!(shaped[1000..].iter().all(|sample| *sample == 0.0), "silent from the loop end");
    assert!(finished);
}

#[test]
fn a_cell_attack_rises_from_the_cell_start_and_its_release_ends_at_the_voice_end() {
    // The cell started 100 frames before this voice's first frame; 200-frame attack and release.
    let start = 300.0 / RATE as f64;
    let envelope = VoiceEnvelope {
        offset_seconds: start, duration_seconds: 1.0, end_seconds: Some(start + 1000.0 / RATE as f64),
        attack_start_seconds: start - 100.0 / RATE as f64, attack_seconds: 200.0 / RATE as f64, release_seconds: 200.0 / RATE as f64,
        ..Default::default()
    };
    let at = |frame: f64| envelope.gain_at(start + frame / RATE as f64);
    assert!((at(0.0) - 0.5).abs() < 1e-6, "half way up the attack on the voice's first frame");
    assert!((at(100.0) - 1.0).abs() < 1e-6, "full level once the attack is over");
    assert!((at(900.0) - 0.5).abs() < 1e-6, "half way down the release 100 frames before the end");
    assert_eq!(at(1000.0), 0.0, "silent at the voice's end");
    let json: VoiceEnvelope = serde_json::from_str(r#"{"durationSeconds":1,"attackStartSeconds":0.5,"attackSeconds":0.01,"releaseSeconds":0.02}"#).expect("json");
    assert_eq!((json.attack_start_seconds, json.attack_seconds, json.release_seconds), (0.5, 0.01, 0.02));
}

#[test]
fn a_late_end_cuts_a_sounding_voice_on_its_frame_with_its_release() {
    let request = VoiceRequest { envelope: Some(VoiceEnvelope { duration_seconds: 1.0, ..Default::default() }), ..Default::default() };
    let plain = render(&VoiceRequest::default(), ramp(RATE as usize), 2000).0;
    let (mut sound, _handle) = build_voice_sound(ramp(RATE as usize), &request).expect("voice").controlled("late").into_sound().expect("sound");
    let info = MockInfoBuilder::new().build();
    let mut out = Vec::new();
    let mut block = vec![Frame::ZERO; BLOCK];
    for index in 0..16 {
        // Asked while the voice sounds: end at frame 1000, a 100-frame release.
        if index == 3 {
            assert!(crate::voice_control::set_end("late", 1000, 100));
        }
        sound.process(&mut block, 1.0 / RATE as f64, &info);
        out.extend(block.iter().map(|frame| frame.left));
    }
    assert!((out[899] - plain[899]).abs() < 1e-6, "full level before the release");
    assert!((out[950] - plain[950] * 0.5).abs() < 1e-6, "half way down the release");
    assert!(out[1000..].iter().all(|sample| *sample == 0.0), "silent from the end frame");
    assert!(sound.finished(), "the voice is over at its late end");
}

#[test]
fn request_fields_match_the_js_voice() {
    let request: VoiceRequest = serde_json::from_str(r#"{"startSeconds":1.5,"durationSeconds":2,"gain":0.5,"pan":-1,"rate":1,
        "loopStartSeconds":null,"envelope":{"offsetSeconds":0.25,"durationSeconds":4,"fadeInSeconds":0.1,"fadeOutSeconds":0.2}}"#).expect("json");
    assert_eq!(request.start_seconds, 1.5);
    assert_eq!(request.duration_seconds, Some(2.0));
    assert_eq!(request.envelope.map(|envelope| envelope.fade_out_seconds), Some(0.2));
}

// Region normalization (formerly the Tauri engine's `playback_region.rs`).
mod region {
    use crate::voice::{min_region_duration, normalize_duration, normalize_start};

    #[test]
    fn min_region_never_exceeds_tiny_clip_duration() {
        assert_eq!(min_region_duration(44_100, 0.0002).unwrap(), 0.0002);
    }

    #[test]
    fn start_is_bounded_to_a_playable_region() {
        let min_region = min_region_duration(44_100, 10.0).unwrap();
        assert!(normalize_start(20.0, 10.0, min_region).unwrap() <= 10.0 - min_region);
    }

    #[test]
    fn duration_normalization_does_not_clamp_with_reversed_bounds() {
        assert_eq!(normalize_duration(Some(0.12), 0.0005, 0.0002).unwrap(), None);
    }

    #[test]
    fn duration_rejects_non_finite_values() {
        assert_eq!(normalize_duration(Some(f64::NAN), 0.0005, 1.0).unwrap_err(), "duration_seconds must be finite when provided");
    }

    #[test]
    fn explicit_short_duration_is_promoted_to_min_region() {
        assert_eq!(normalize_duration(Some(0.0001), 0.0005, 1.0).unwrap(), Some(0.0005));
    }

    // A container that announces more audio than it decodes plays to the end.
    #[test]
    fn container_duration_cannot_extend_decoded_audio() {
        assert_eq!(normalize_duration(Some(3.626), 0.0005, 3.562_667).unwrap(), None);
        assert_eq!(normalize_duration(Some(1.25), 0.0005, 3.562_667).unwrap(), Some(1.25));
    }
}
