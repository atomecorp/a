//! Containers read by the clip decoder (clip_decode.rs): a CAF holding linear PCM, Opus in Ogg and WebM.

use super::clip_decode::{
    decode_clip, is_caf_container, is_matroska_container, is_ogg_opus_container,
    is_symphonia_container, probe_duration,
};

// A CAF file of `frames` stereo 16-bit little-endian frames at 48 kHz, a ramp on both channels.
fn caf_pcm(frames: usize) -> Vec<u8> {
    let mut bytes = b"caff".to_vec();
    bytes.extend_from_slice(&1u16.to_be_bytes());
    bytes.extend_from_slice(&0u16.to_be_bytes());
    bytes.extend_from_slice(b"desc");
    bytes.extend_from_slice(&32i64.to_be_bytes());
    bytes.extend_from_slice(&48_000f64.to_be_bytes());
    bytes.extend_from_slice(b"lpcm");
    // kCAFLinearPCMFormatFlagIsLittleEndian
    bytes.extend_from_slice(&2u32.to_be_bytes());
    bytes.extend_from_slice(&4u32.to_be_bytes());
    bytes.extend_from_slice(&1u32.to_be_bytes());
    bytes.extend_from_slice(&2u32.to_be_bytes());
    bytes.extend_from_slice(&16u32.to_be_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&((4 + frames * 4) as i64).to_be_bytes());
    bytes.extend_from_slice(&0u32.to_be_bytes());
    for frame in 0..frames {
        let sample = ((frame % 200) as i16 - 100) * 100;
        bytes.extend_from_slice(&sample.to_le_bytes());
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

#[test]
fn a_caf_is_recognised_as_this_decoders_container() {
    let bytes = caf_pcm(16);
    assert!(is_caf_container(&bytes));
    assert!(is_symphonia_container(&bytes));
    assert!(!is_caf_container(b"RIFF\x00\x00\x00\x00WAVEfmt "));
}

#[test]
fn a_caf_of_linear_pcm_probes_and_decodes_whatever_its_name() {
    let bytes = caf_pcm(24_000);
    for extension in [Some("caf"), Some("mp4"), None] {
        let seconds = probe_duration(&bytes, extension).expect("probe caf");
        assert!((seconds - 0.5).abs() < 1e-6, "{seconds}");
    }
    let sound = decode_clip(bytes, None).expect("decode caf");
    assert_eq!(sound.sample_rate, 48_000);
    assert_eq!(sound.frames.len(), 24_000);
    assert!(sound.frames.iter().any(|frame| frame.left.abs() > 0.1));
}

// Opus (clip_opus.rs): a stereo Ogg Opus and a mono WebM tone of 0.5 s at 440 Hz,
// made by ffmpeg (libopus), read whole at 48 kHz with their pre-skip removed (R-349), their
// peak the one ffmpeg's own decoder reads (`volumedetect`: −20.7 dB and −17.9 dB).
const TONE_OPUS: &[u8] = include_bytes!("test_fixtures/tone.opus");
const TONE_WEBA: &[u8] = include_bytes!("test_fixtures/tone.weba");

#[test]
fn recognizes_opus_containers() {
    assert!(is_ogg_opus_container(TONE_OPUS));
    assert!(is_matroska_container(TONE_WEBA));
    assert!(is_symphonia_container(TONE_OPUS));
    assert!(is_symphonia_container(TONE_WEBA));
    // An Ogg Vorbis page names no OpusHead: Kira keeps it.
    assert!(!is_ogg_opus_container(
        b"OggS\0\x02\0\0\0\0\0\0\0\0\x01vorbis"
    ));
}

#[test]
fn decodes_ogg_opus_and_webm_tones() {
    for (bytes, extension, reference) in [(TONE_OPUS, "opus", 0.092), (TONE_WEBA, "weba", 0.127)] {
        let sound = decode_clip(bytes.to_vec(), Some(extension)).expect(extension);
        assert_eq!(sound.sample_rate, 48_000, "{extension}");
        // The pre-skip dropped exactly (its OpusHead's 312 frames); a WebM keeps its end
        // padding, as Symphonia reads no DiscardPadding.
        let exact = if extension == "opus" { 24_000 } else { 24_648 };
        assert_eq!(sound.frames.len(), exact, "{extension}: frames");
        let seconds = sound.frames.len() as f64 / 48_000.0;
        assert!((seconds - 0.5).abs() < 0.03, "{extension}: {seconds} s");
        let peak = sound
            .frames
            .iter()
            .map(|frame| frame.left.abs().max(frame.right.abs()))
            .fold(0.0_f32, f32::max);
        assert!((peak - reference).abs() < 0.005, "{extension}: peak {peak}");
        let duration = probe_duration(bytes, Some(extension)).expect(extension);
        assert!(
            (duration - 0.5).abs() < 0.03,
            "{extension}: probed {duration} s"
        );
    }
}
