// One take of voice as an Ogg Opus file (RFC 7845), made from the RTP packets the SFU forwards (RFC 7587), without any
// transcoding: each Opus packet is written as it came, its place in the stream read from its RTP timestamp. A lost or
// silent stretch (a gap between two timestamps) is filled with empty Opus frames (a TOC byte alone, RFC 6716 §3.2.1:
// the decoder conceals or plays silence), so the file lasts as long as the take did. The header pages come first
// (`OpusHead`, then `OpusTags` with the vendor alone: no other metadata), each on its own page; the audio pages follow,
// each closed after about one second, the last one marked as the stream's end. The file is built in memory: a take lasts
// the floor's time at most (45 s by default, cb.floor_max_ms), and its bytes are what the live translation is handed.
use atome_audio_kernels::ogg_opus::OggOpusWriter;

/// Opus runs at 48 kHz whatever the rate it was fed (RFC 7587 §4.1).
pub const RATE: u64 = 48_000;
/// The decoder's priming at the start of a stream joined mid-way (RFC 7845 §4.2 recommends 80 ms).
pub const PRE_SKIP: u16 = 3_840;
// A gap longer than this is not filled (the take's clock jumps instead).
const GAP_FILL_MAX: u64 = 5 * RATE;
// An RTP packet's fixed header.
const RTP_HEADER: usize = 12;

/// The samples (at 48 kHz) an Opus packet carries, read from its TOC byte and frame count (RFC 6716 §3.1); none for a
/// packet that is not Opus.
pub fn opus_samples(packet: &[u8]) -> Option<u64> {
    let toc = *packet.first()?;
    let config = toc >> 3;
    // The frame's length in 1/10 ms units, by configuration.
    let tenths: u64 = match config {
        0..=11 => [100, 200, 400, 600][usize::from(config % 4)],
        12..=15 => [100, 200][usize::from(config % 2)],
        _ => [25, 50, 100, 200][usize::from(config % 4)],
    };
    let frames: u64 = match toc & 0x03 {
        0 => 1,
        1 | 2 => 2,
        _ => u64::from(*packet.get(1)? & 0x3F),
    };
    let samples = tenths * RATE / 10_000 * frames;
    // A packet never holds more than 120 ms (RFC 6716 §3.2.5).
    (frames > 0 && samples <= RATE * 120 / 1000).then_some(samples)
}

/// What an RTP packet carries: its payload type, sequence number, timestamp and payload (RFC 3550 §5.1).
pub struct Rtp<'a> {
    pub payload_type: u8,
    pub sequence: u16,
    pub timestamp: u32,
    pub payload: &'a [u8],
}

/// An RTP packet read: none for anything malformed (never trusted).
pub fn parse_rtp(packet: &[u8]) -> Option<Rtp<'_>> {
    if packet.len() < RTP_HEADER || packet[0] >> 6 != 2 {
        return None;
    }
    let csrc = usize::from(packet[0] & 0x0F) * 4;
    let mut start = RTP_HEADER + csrc;
    if packet[0] & 0x10 != 0 {
        let words = u16::from_be_bytes([*packet.get(start + 2)?, *packet.get(start + 3)?]);
        start += 4 + usize::from(words) * 4;
    }
    let mut end = packet.len();
    if packet[0] & 0x20 != 0 {
        let padding = usize::from(*packet.last()?);
        end = end.checked_sub(padding)?;
    }
    if start >= end {
        return None;
    }
    Some(Rtp {
        payload_type: packet[1] & 0x7F,
        sequence: u16::from_be_bytes([packet[2], packet[3]]),
        timestamp: u32::from_be_bytes([packet[4], packet[5], packet[6], packet[7]]),
        payload: &packet[start..end],
    })
}

/// A finished take: the Ogg Opus file and how long it lasts.
pub struct Written {
    pub bytes: Vec<u8>,
    pub duration_ms: u64,
    pub packets: usize,
}

/// One take being written.
pub struct TakeWriter {
    // The one Ogg Opus writer (audio-kernels), opened with the first packet (its channel count).
    writer: Option<OggOpusWriter>,
    serial: u32,
    payload_type: Option<u8>,
    // The first packet's timestamp, and the last one's, unwrapped to 64 bits.
    origin: Option<u64>,
    last_timestamp: u64,
    last_sequence: Option<u16>,
    // Samples written since the take's start (the pre-skip apart).
    samples: u64,
    packets: usize,
    last_toc: u8,
}

impl Default for TakeWriter {
    fn default() -> Self {
        Self::new(None)
    }
}

impl TakeWriter {
    /// A take whose RTP payload type is `payload_type` (the consumer's Opus codec; any when none).
    pub fn new(payload_type: Option<u8>) -> Self {
        Self {
            writer: None,
            serial: rand_serial(),
            payload_type,
            origin: None,
            last_timestamp: 0,
            last_sequence: None,
            samples: 0,
            packets: 0,
            last_toc: 0xF8,
        }
    }

    /// The take's length so far.
    pub fn duration_ms(&self) -> u64 {
        self.samples * 1000 / RATE
    }

    /// How many Opus packets the take holds (the gap fillers apart).
    pub fn packets(&self) -> usize {
        self.packets
    }

    /// One RTP packet from the SFU: whether it was taken (an unknown payload type, a duplicate or a late packet is not).
    pub fn push_rtp(&mut self, packet: &[u8]) -> bool {
        let Some(rtp) = parse_rtp(packet) else {
            return false;
        };
        if self
            .payload_type
            .is_some_and(|wanted| wanted != rtp.payload_type)
        {
            return false;
        }
        if let Some(last) = self.last_sequence {
            // A duplicate or a packet older than the last one written (16-bit sequence arithmetic).
            if (rtp.sequence.wrapping_sub(last) as i16) <= 0 {
                return false;
            }
        }
        let payload = rtp.payload.to_vec();
        if self.push_opus(rtp.timestamp, &payload) {
            self.last_sequence = Some(rtp.sequence);
            return true;
        }
        false
    }

    /// One Opus packet at RTP timestamp `timestamp` (48 kHz): whether it was written.
    pub fn push_opus(&mut self, timestamp: u32, packet: &[u8]) -> bool {
        let Some(samples) = opus_samples(packet) else {
            return false;
        };
        let at = self.unwrap(timestamp);
        let origin = match self.origin {
            Some(origin) => origin,
            None => {
                if self.write_headers(packet[0]).is_err() {
                    return false;
                }
                self.origin = Some(at);
                at
            }
        };
        let Some(offset) = at.checked_sub(origin) else {
            return false;
        };
        if offset < self.samples {
            // Overlaps what was written (a late packet).
            return false;
        }
        // A gap: empty frames of the last packet's configuration, as long as the gap.
        let gap = offset - self.samples;
        if gap > 0 {
            let filler = [self.last_toc & 0xFC];
            let step = opus_samples(&filler).unwrap_or(960);
            let mut filled = 0;
            while filled + step <= gap.min(GAP_FILL_MAX) {
                self.samples += step;
                filled += step;
                if self.queue(filler.to_vec()).is_err() {
                    return false;
                }
            }
            self.samples = offset;
        }
        self.samples += samples;
        self.last_toc = packet[0];
        self.packets += 1;
        self.queue(packet.to_vec()).is_ok()
    }

    /// The take closed: its file, none when no voice was written.
    pub fn finish(mut self) -> Option<Written> {
        let writer = self.writer.take()?;
        Some(Written {
            duration_ms: self.duration_ms(),
            packets: self.packets,
            bytes: writer.finish(None).ok()?,
        })
    }

    // The RTP timestamp on 64 bits: a step back of less than half the range is a late packet, else a wrap.
    fn unwrap(&mut self, timestamp: u32) -> u64 {
        if self.origin.is_none() {
            self.last_timestamp = u64::from(timestamp) + (1 << 32);
            return self.last_timestamp;
        }
        let low = self.last_timestamp & 0xFFFF_FFFF;
        let delta = i64::from(timestamp.wrapping_sub(low as u32) as i32);
        let at = (self.last_timestamp as i64 + delta).max(0) as u64;
        if at > self.last_timestamp {
            self.last_timestamp = at;
        }
        at
    }

    fn write_headers(&mut self, toc: u8) -> atome_audio_kernels::Result<()> {
        let channels: u8 = if toc & 0x04 != 0 { 2 } else { 1 };
        self.writer = Some(OggOpusWriter::new(
            self.serial,
            channels,
            RATE as u32,
            PRE_SKIP,
        )?);
        Ok(())
    }

    // The packet, its last sample at the take's position (the shared writer holds it back so the last one closes the stream).
    fn queue(&mut self, packet: Vec<u8>) -> atome_audio_kernels::Result<()> {
        let samples = self.samples;
        match self.writer.as_mut() {
            Some(writer) => writer.push(packet, samples),
            None => Err(atome_audio_kernels::KernelError::new(
                atome_audio_kernels::INVALID_ARGUMENT,
                "an Opus packet before the take's header",
            )),
        }
    }
}

fn rand_serial() -> u32 {
    let bytes = *uuid::Uuid::new_v4().as_bytes();
    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rtp(sequence: u16, timestamp: u32, payload: &[u8]) -> Vec<u8> {
        // Version 2, the extension bit set (one word of extension, as the SFU sends), payload type 100.
        let mut packet = vec![0x90, 100];
        packet.extend(sequence.to_be_bytes());
        packet.extend(timestamp.to_be_bytes());
        packet.extend(0x1234_5678u32.to_be_bytes());
        packet.extend([0xBE, 0xDE, 0, 1, 0x10, 0x7F, 0, 0]);
        packet.extend_from_slice(payload);
        packet
    }

    #[test]
    fn the_samples_of_an_opus_packet() {
        assert_eq!(opus_samples(&[0xF8, 1, 2]), Some(960), "CELT 20 ms");
        assert_eq!(opus_samples(&[0xFC]), Some(960), "stereo 20 ms");
        assert_eq!(opus_samples(&[0x09]), Some(1920), "SILK 20 ms, two frames");
        assert_eq!(
            opus_samples(&[0x0B, 0x03]),
            Some(2880),
            "three frames of 20 ms"
        );
        assert_eq!(opus_samples(&[0x0B, 0x0F]), None, "over 120 ms");
        assert_eq!(opus_samples(&[]), None);
    }

    #[test]
    fn rtp_is_read_past_its_extension_and_padding() {
        let packet = rtp(7, 960, &[0xF8, 0xAA]);
        let read = parse_rtp(&packet).expect("rtp");
        assert_eq!(
            (
                read.payload_type,
                read.sequence,
                read.timestamp,
                read.payload
            ),
            (100, 7, 960, &[0xF8, 0xAA][..])
        );
        let mut padded = packet.clone();
        padded[0] |= 0x20;
        padded.extend([0, 0, 3]);
        assert_eq!(parse_rtp(&padded).expect("padded").payload, &[0xF8, 0xAA]);
        assert!(parse_rtp(&[0x80, 0]).is_none());
        assert!(parse_rtp(&[0x40; 20]).is_none(), "version 1");
    }

    // A take of 1 s with a 200 ms gap, a duplicate, a late packet and a wrapped timestamp: its pages read back, the
    // headers first, its granule the take's length.
    #[test]
    fn a_take_reads_back_as_ogg_opus() {
        let mut take = TakeWriter::new(Some(100));
        let mut timestamp = u32::MAX - 960 * 10;
        let mut sequence = u16::MAX - 5;
        for n in 0..40 {
            if n == 20 {
                timestamp = timestamp.wrapping_add(960 * 10);
            }
            assert!(take.push_rtp(&rtp(sequence, timestamp, &[0xF8, n as u8, 7])));
            if n == 5 {
                assert!(
                    !take.push_rtp(&rtp(sequence, timestamp, &[0xF8, 0])),
                    "duplicate"
                );
                assert!(
                    !take.push_rtp(&rtp(sequence.wrapping_sub(2), timestamp, &[0xF8])),
                    "late"
                );
            }
            timestamp = timestamp.wrapping_add(960);
            sequence = sequence.wrapping_add(1);
        }
        let written = take.finish().expect("written");
        assert_eq!(written.duration_ms, 1000, "40 × 20 ms and a 200 ms gap");
        let mut reader = ogg::reading::PacketReader::new(std::io::Cursor::new(written.bytes));
        let head = reader.read_packet_expected().expect("head");
        assert!(head.data.starts_with(b"OpusHead") && head.first_in_stream());
        assert_eq!(head.data[9], 1, "mono");
        let tags = reader.read_packet_expected().expect("tags");
        assert!(tags.data.starts_with(b"OpusTags"));
        let (mut count, mut last) = (0, 0);
        while let Some(packet) = reader.read_packet().expect("packet") {
            count += 1;
            last = packet.absgp_page();
            if packet.last_in_stream() {
                break;
            }
        }
        assert_eq!(
            count, 50,
            "40 packets kept (not the duplicate nor the late one) and 10 fillers"
        );
        assert_eq!(last, u64::from(PRE_SKIP) + 48_000);
        assert!(
            TakeWriter::new(None).finish().is_none(),
            "no voice, no file"
        );
    }
}
