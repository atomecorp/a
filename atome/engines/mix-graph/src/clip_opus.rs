// Opus — an Ogg `.opus` file, a WebM `.weba`, a browser's own recording — decoded by
// `opus-rs` (libopus 1.6 ported to Rust): Symphonia reads the container and hands its packets
// with their trims (the pre-skip, the end padding), as it has no Opus codec of its
// own. One stream of one or two channels; a multistream file (surround) is refused
// by its error. A malformed packet is skipped, as the other decoders do.

use crate::clip_decode::next_track_packet;
use kira::Frame;
use opus_rs::OpusDecoder;
use symphonia::core::codecs::audio::AudioCodecParameters;
use symphonia::core::formats::FormatReader;

/// Opus always decodes at 48 kHz, whatever rate its source had.
pub(crate) const OPUS_SAMPLE_RATE: u32 = 48_000;

// The longest Opus packet, 120 ms at 48 kHz.
const MAX_PACKET_FRAMES: usize = 5_760;

pub(crate) fn decode_opus(
    format: &mut dyn FormatReader,
    track_id: u32,
    params: &AudioCodecParameters,
) -> Result<Vec<Frame>, String> {
    let channels = params
        .channels
        .as_ref()
        .map(|channels| channels.count())
        .ok_or("Opus stream without a channel count")?;
    if !(1..=2).contains(&channels) {
        return Err(format!(
            "Opus multistream audio ({channels} channels) is not decoded"
        ));
    }
    let mut decoder = OpusDecoder::new(OPUS_SAMPLE_RATE as i32, channels)
        .map_err(|error| format!("Failed to create the Opus decoder: {error}"))?;
    let mut pcm = vec![0.0_f32; MAX_PACKET_FRAMES * channels];
    let mut frames = Vec::new();
    while let Some(packet) = next_track_packet(format, track_id)? {
        let Ok(decoded) = decoder.decode(&packet.data, MAX_PACKET_FRAMES, &mut pcm) else {
            continue;
        };
        let trim_start = usize::try_from(packet.trim_start.get()).unwrap_or(usize::MAX);
        let trim_end = usize::try_from(packet.trim_end.get()).unwrap_or(usize::MAX);
        let start = trim_start.min(decoded);
        let end = decoded.saturating_sub(trim_end).max(start);
        let kept = &pcm[start * channels..end * channels];
        if channels == 1 {
            frames.extend(kept.iter().map(|sample| Frame::from_mono(*sample)));
        } else {
            frames.extend(
                kept.chunks_exact(2)
                    .map(|pair| Frame::new(pair[0], pair[1])),
            );
        }
    }
    Ok(frames)
}

// A packet's length at 48 kHz, read from its TOC byte (RFC 6716 §3.1): the frame
// length its configuration names, times the frames its code packs.
fn packet_frames(data: &[u8]) -> u64 {
    let Some(&toc) = data.first() else {
        return 0;
    };
    let config = toc >> 3;
    let frame = match config {
        0..=11 => [480, 960, 1_920, 2_880][usize::from(config % 4)],
        12..=15 => [480, 960][usize::from(config % 2)],
        _ => [120, 240, 480, 960][usize::from(config % 4)],
    };
    let count = match toc & 0b11 {
        0 => 1,
        1 | 2 => 2,
        _ => data.get(1).map_or(0, |byte| u64::from(byte & 0x3f)),
    };
    frame * count
}

/// An Opus track's length in seconds, its packets' own lengths summed, less their
/// trims: a WebM's packets carry no duration of their own.
pub(crate) fn opus_duration(format: &mut dyn FormatReader, track_id: u32) -> Result<f64, String> {
    let mut frames: u64 = 0;
    while let Some(packet) = next_track_packet(format, track_id)? {
        let trimmed = packet.trim_start.get() + packet.trim_end.get();
        frames += packet_frames(&packet.data).saturating_sub(trimmed);
    }
    if frames == 0 {
        return Err("No audio frames found".to_string());
    }
    Ok(frames as f64 / f64::from(OPUS_SAMPLE_RATE))
}
