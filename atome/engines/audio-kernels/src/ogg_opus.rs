// Ogg Opus files (RFC 7845): the stream writer every Opus file of eVe goes
// through — its two header pages (`OpusHead`, then `OpusTags` with the vendor
// alone), then the audio pages, each closed after about one second, the last
// one marked as the stream's end with its granule position trimming the end
// padding — and the encoder of a stereo render into such a file (a shared
// project's light proxy, R-349), the packets coded by opus_packets.rs. A stream
// rides on the rate Opus runs at (48 kHz granules); its input may be any rate
// Opus codes (8, 12, 16, 24 or 48 kHz).

use crate::opus_packets::{CHANNELS, OpusPacketEncoder};
use crate::{EMPTY_RANGE, INVALID_ARGUMENT, KernelError, Result};
use ogg::writing::{PacketWriteEndInfo, PacketWriter};

pub use crate::opus_packets::{ENCODE_FAILED, GRANULE_RATE, OPUS_RATES};
/// A stereo proxy's bitrate: 96 kb/s (a natural number, rule 19).
pub const PROXY_BITRATE: u32 = 96_000;

const VENDOR: &[u8] = b"atome";
// An audio page is closed every 50 packets (one second of 20 ms frames).
const PACKETS_PER_PAGE: usize = 50;
// One stream per file: its serial number only has to be stable.
const SERIAL: u32 = 0x6576_4501;

fn write_error(error: std::io::Error) -> KernelError {
    KernelError::new(ENCODE_FAILED, format!("ogg write: {error}"))
}

/// One Ogg Opus stream being written: the headers at once, then its packets,
/// each with the stream position (48 kHz samples, the pre-skip apart) its last
/// sample reaches. The packet before is held back so the last one closes the stream.
pub struct OggOpusWriter {
    writer: PacketWriter<'static, Vec<u8>>,
    serial: u32,
    pre_skip: u16,
    pending: Option<(Vec<u8>, u64)>,
    in_page: usize,
}

impl OggOpusWriter {
    /// A stream of `channels` (1 or 2) whose source ran at `input_rate`, its
    /// decoder dropping `pre_skip` samples (48 kHz) first.
    pub fn new(serial: u32, channels: u8, input_rate: u32, pre_skip: u16) -> Result<Self> {
        if !(1..=2).contains(&channels) {
            return Err(KernelError::new(
                INVALID_ARGUMENT,
                format!("an Ogg Opus stream of {channels} channels"),
            ));
        }
        let mut writer = PacketWriter::new(Vec::new());
        let mut head = b"OpusHead".to_vec();
        head.push(1);
        head.push(channels);
        head.extend(pre_skip.to_le_bytes());
        head.extend(input_rate.to_le_bytes());
        head.extend(0i16.to_le_bytes());
        head.push(0);
        writer
            .write_packet(head, serial, PacketWriteEndInfo::EndPage, 0)
            .map_err(write_error)?;
        let mut tags = b"OpusTags".to_vec();
        tags.extend((VENDOR.len() as u32).to_le_bytes());
        tags.extend_from_slice(VENDOR);
        tags.extend(0u32.to_le_bytes());
        writer
            .write_packet(tags, serial, PacketWriteEndInfo::EndPage, 0)
            .map_err(write_error)?;
        Ok(Self {
            writer,
            serial,
            pre_skip,
            pending: None,
            in_page: 0,
        })
    }

    /// One Opus packet, its last sample at `position` (48 kHz, from the stream's start).
    pub fn push(&mut self, packet: Vec<u8>, position: u64) -> Result<()> {
        let granule = u64::from(self.pre_skip) + position;
        if let Some((previous, at)) = self.pending.replace((packet, granule)) {
            self.in_page += 1;
            let end = if self.in_page >= PACKETS_PER_PAGE {
                self.in_page = 0;
                PacketWriteEndInfo::EndPage
            } else {
                PacketWriteEndInfo::NormalPacket
            };
            self.writer
                .write_packet(previous, self.serial, end, at)
                .map_err(write_error)?;
        }
        Ok(())
    }

    /// The closed file; `length` (48 kHz samples) trims the last packet's padding.
    pub fn finish(mut self, length: Option<u64>) -> Result<Vec<u8>> {
        let (packet, granule) = self
            .pending
            .take()
            .ok_or_else(|| KernelError::new(EMPTY_RANGE, "an Ogg Opus stream without audio"))?;
        let granule = length.map_or(granule, |length| {
            granule.min(u64::from(self.pre_skip) + length)
        });
        self.writer
            .write_packet(packet, self.serial, PacketWriteEndInfo::EndStream, granule)
            .map_err(write_error)?;
        Ok(self.writer.into_inner())
    }
}

/// A stereo render coded to Ogg Opus as it comes, 20 ms at a time.
pub struct OggOpusEncoder {
    encoder: OpusPacketEncoder,
    writer: OggOpusWriter,
}

impl OggOpusEncoder {
    /// A stream of stereo frames at `rate` (one of `OPUS_RATES`), coded at `bitrate` b/s (6 000 to 510 000).
    pub fn new(rate: u32, bitrate: u32) -> Result<Self> {
        let encoder = OpusPacketEncoder::new(rate, bitrate)?;
        let writer = OggOpusWriter::new(SERIAL, CHANNELS as u8, rate, encoder.pre_skip())?;
        Ok(Self { encoder, writer })
    }

    /// The next frames of the render.
    pub fn push(&mut self, frames: &[[f32; 2]]) -> Result<()> {
        let writer = &mut self.writer;
        let pre_skip = u64::from(self.encoder.pre_skip());
        // The encoder counts every sample it decodes to, the pre-skip's included; the writer's position leaves it apart.
        self.encoder.push(frames, &mut |packet, position| {
            writer.push(packet.to_vec(), position - pre_skip)
        })
    }

    /// The file: the encoder's lookahead and the last frame padded with silence, the padding trimmed by the granule.
    pub fn finish(self) -> Result<Vec<u8>> {
        let Self {
            encoder,
            mut writer,
        } = self;
        let pre_skip = u64::from(encoder.pre_skip());
        let length = encoder
            .finish(&mut |packet, position| writer.push(packet.to_vec(), position - pre_skip))?;
        writer.finish(Some(length))
    }
}

/// Stereo `frames` at `rate` (one of `OPUS_RATES`) as an Ogg Opus file coded at `bitrate` b/s.
pub fn encode_ogg_opus(rate: u32, frames: &[[f32; 2]], bitrate: u32) -> Result<Vec<u8>> {
    let mut encoder = OggOpusEncoder::new(rate, bitrate)?;
    encoder.push(frames)?;
    encoder.finish()
}
