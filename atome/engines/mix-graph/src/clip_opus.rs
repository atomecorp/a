// Opus — an Ogg `.opus` file, a WebM `.weba`, a browser's own recording — decoded by
// `opus-rs` (libopus 1.6 ported to Rust): Symphonia reads the container and hands its packets
// with their trims (the end padding), as it has no Opus codec of its own. The
// pre-skip is not a packet trim: it is read from the stream's OpusHead and dropped
// here. A Matroska stream's DiscardPadding is not read by Symphonia: its end padding stays. One stream of one or two channels; a multistream file (surround) is refused
// by its error. A malformed packet is skipped, as the other decoders do.

use crate::clip_decode::next_track_packet;
use kira::Frame;
use opus_rs::OpusDecoder;
use symphonia::core::codecs::audio::AudioCodecParameters;
use symphonia::core::formats::{FormatReader, Track};
use symphonia::core::packet::Packet;

/// Opus always decodes at 48 kHz, whatever rate its source had.
pub(crate) const OPUS_SAMPLE_RATE: u32 = 48_000;

// The longest Opus packet, 120 ms at 48 kHz.
const MAX_PACKET_FRAMES: usize = 5_760;

/// What an Opus stream's start drops before its first played frame: its pre-skip,
/// read from its `OpusHead` (RFC 7845 §5.1: the Ogg header, a Matroska CodecPrivate),
/// else the delay its track declares.
pub(crate) struct Lead {
    delay: u64,
}

impl Lead {
    pub(crate) fn of(track: &Track, params: &AudioCodecParameters) -> Self {
        let head = params
            .extra_data
            .as_deref()
            .filter(|head| head.len() >= 12 && head.starts_with(b"OpusHead"));
        let delay = match head {
            Some(head) => u64::from(u16::from_le_bytes([head[10], head[11]])),
            None => u64::from(track.delay.unwrap_or(0)),
        };
        Self { delay }
    }

    // The frames a packet of `frames` drops at its start: its trim, then what is left of the pre-skip.
    fn frames(&mut self, packet: &Packet, frames: u64) -> u64 {
        let lead = packet.trim_start.get().min(frames);
        let delayed = self.delay.min(frames - lead);
        self.delay -= delayed;
        lead + delayed
    }
}

pub(crate) fn decode_opus(
    format: &mut dyn FormatReader,
    track_id: u32,
    params: &AudioCodecParameters,
    mut lead: Lead,
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
        let start = lead.frames(&packet, decoded as u64) as usize;
        let trim_end = usize::try_from(packet.trim_end.get()).unwrap_or(usize::MAX);
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
pub(crate) fn opus_duration(
    format: &mut dyn FormatReader,
    track_id: u32,
    mut lead: Lead,
) -> Result<f64, String> {
    let mut frames: u64 = 0;
    while let Some(packet) = next_track_packet(format, track_id)? {
        let length = packet_frames(&packet.data);
        let dropped = lead.frames(&packet, length);
        frames += (length - dropped).saturating_sub(packet.trim_end.get());
    }
    if frames == 0 {
        return Err("No audio frames found".to_string());
    }
    Ok(frames as f64 / f64::from(OPUS_SAMPLE_RATE))
}
