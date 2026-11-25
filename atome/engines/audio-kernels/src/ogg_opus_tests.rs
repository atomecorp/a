// The Ogg Opus encoder read back: its pages with ogg's reader, its packets with
// opus-rs's decoder, the pre-skip and the end trim applied as a player does.

use crate::ogg_opus::{GRANULE_RATE, PROXY_BITRATE, encode_ogg_opus};
use opus_rs::OpusDecoder;
use std::io::Cursor;

fn tone(rate: u32, seconds: f32, hz: f32, level: f32) -> Vec<[f32; 2]> {
    let frames = (rate as f32 * seconds) as usize;
    (0..frames)
        .map(|index| {
            let value = level * (std::f32::consts::TAU * hz * index as f32 / rate as f32).sin();
            [value, value * 0.5]
        })
        .collect()
}

fn rms(samples: impl Iterator<Item = f32>) -> f32 {
    let (sum, count) = samples.fold((0.0f64, 0usize), |(sum, count), value| {
        (sum + f64::from(value) * f64::from(value), count + 1)
    });
    (sum / count.max(1) as f64).sqrt() as f32
}

struct Decoded {
    channels: u8,
    input_rate: u32,
    frames: Vec<[f32; 2]>,
}

// Decoded at 48 kHz, the pre-skip dropped and the stream cut at its last granule.
fn decode(bytes: Vec<u8>) -> Decoded {
    let mut reader = ogg::reading::PacketReader::new(Cursor::new(bytes));
    let head = reader.read_packet_expected().expect("head");
    assert!(head.data.starts_with(b"OpusHead") && head.first_in_stream());
    let channels = head.data[9];
    let pre_skip = u16::from_le_bytes([head.data[10], head.data[11]]) as usize;
    let input_rate = u32::from_le_bytes(head.data[12..16].try_into().expect("rate"));
    let tags = reader.read_packet_expected().expect("tags");
    assert!(tags.data.starts_with(b"OpusTags"));
    let mut decoder = OpusDecoder::new(GRANULE_RATE as i32, 2).expect("decoder");
    let mut pcm = vec![0.0f32; 5_760 * 2];
    let mut all = Vec::new();
    let mut last = 0;
    while let Some(packet) = reader.read_packet().expect("packet") {
        let decoded = decoder
            .decode(&packet.data, 5_760, &mut pcm)
            .expect("decode");
        all.extend(
            pcm[..decoded * 2]
                .chunks_exact(2)
                .map(|pair| [pair[0], pair[1]]),
        );
        if packet.last_in_stream() {
            last = packet.absgp_page() as usize;
            break;
        }
        // A page's granule: every sample decoded so far, the pre-skip's included (RFC 7845 §4), as a player
        // dates the pages and trims the last one.
        if packet.last_in_page() {
            assert_eq!(packet.absgp_page() as usize, all.len(), "page granule");
        }
    }
    let end = last.min(all.len());
    Decoded {
        channels,
        input_rate,
        frames: all[pre_skip..end].to_vec(),
    }
}

#[test]
fn a_stereo_render_reads_back_at_its_length_and_level() {
    let source = tone(48_000, 1.5, 440.0, 0.5);
    let decoded = decode(encode_ogg_opus(48_000, &source, PROXY_BITRATE).expect("encoded"));
    assert_eq!((decoded.channels, decoded.input_rate), (2, 48_000));
    assert_eq!(
        decoded.frames.len(),
        source.len(),
        "trimmed to the render's length"
    );
    for channel in 0..2 {
        let original = rms(source.iter().map(|frame| frame[channel]));
        let read = rms(decoded.frames.iter().map(|frame| frame[channel]));
        let db = 20.0 * (read / original).log10();
        assert!(db.abs() < 0.5, "channel {channel}: {db} dB");
    }
}

#[test]
fn a_lower_opus_rate_is_coded_as_it_is() {
    let source = tone(24_000, 0.5, 300.0, 0.4);
    let decoded = decode(encode_ogg_opus(24_000, &source, PROXY_BITRATE).expect("encoded"));
    assert_eq!(decoded.input_rate, 24_000);
    assert_eq!(decoded.frames.len(), source.len() * 2, "48 kHz granules");
    let db = 20.0
        * (rms(decoded.frames.iter().map(|frame| frame[0]))
            / rms(source.iter().map(|frame| frame[0])))
        .log10();
    assert!(db.abs() < 0.5, "{db} dB");
}

#[test]
fn what_opus_cannot_code_is_refused() {
    let source = tone(44_100, 0.1, 440.0, 0.5);
    let error = encode_ogg_opus(44_100, &source, PROXY_BITRATE).expect_err("44.1 kHz");
    assert!(
        error.message.contains("ogg_opus_rate_unsupported:44100"),
        "{error}"
    );
    let error = encode_ogg_opus(48_000, &[], PROXY_BITRATE).expect_err("empty");
    assert_eq!(error.code, crate::EMPTY_RANGE);
    let error = encode_ogg_opus(48_000, &source, 1_000).expect_err("bitrate");
    assert!(
        error.message.contains("ogg_opus_bitrate_invalid"),
        "{error}"
    );
}
