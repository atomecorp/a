// A stereo render coded to Opus packets as it comes, 20 ms at a time (`opus-rs`, libopus 1.6 in Rust): the coding
// every Opus of eVe's renders goes through, whatever carries the packets — an Ogg stream (ogg_opus.rs, a project
// heard only) or an MP4 track (atome-mp4, a project with a picture; R-349). Each packet comes with the stream
// position (48 kHz samples) its last sample reaches; the encoder's lookahead is the stream's pre-skip.

use crate::{EMPTY_RANGE, INVALID_ARGUMENT, KernelError, Result};
use opus_rs::{Application, OpusEncoder};

/// Opus granules count 48 kHz samples whatever the input rate (RFC 7845 §4).
pub const GRANULE_RATE: u32 = 48_000;
/// The rates an Opus encoder takes as they are.
pub const OPUS_RATES: [u32; 5] = [8_000, 12_000, 16_000, 24_000, 48_000];
pub const ENCODE_FAILED: &str = "ogg_opus/encode_failed";
/// A packet's length on the 48 kHz clock: 20 ms.
pub const PACKET_GRANULES: u32 = GRANULE_RATE / 50;

// The largest packet one 20 ms frame codes to (RFC 6716 §3.2.1: 1275 bytes per frame).
const MAX_PACKET_BYTES: usize = 1_275;
pub(crate) const CHANNELS: usize = 2;

/// The stereo Opus coder: frames in, packets out to `sink(packet, position)`.
pub struct OpusPacketEncoder {
    encoder: OpusEncoder,
    // 48 kHz samples per input sample, and input samples per frame.
    scale: u64,
    frame: usize,
    lookahead: usize,
    pre_skip: u16,
    rate: u32,
    staged: Vec<f32>,
    received: u64,
    position: u64,
    packet: Vec<u8>,
}

impl OpusPacketEncoder {
    /// A stream of stereo frames at `rate` (one of `OPUS_RATES`), coded at `bitrate` b/s (6 000 to 510 000).
    pub fn new(rate: u32, bitrate: u32) -> Result<Self> {
        if !OPUS_RATES.contains(&rate) {
            return Err(KernelError::new(
                INVALID_ARGUMENT,
                format!("ogg_opus_rate_unsupported:{rate}"),
            ));
        }
        if !(6_000..=510_000).contains(&bitrate) {
            return Err(KernelError::new(
                INVALID_ARGUMENT,
                format!("ogg_opus_bitrate_invalid:{bitrate}"),
            ));
        }
        let mut encoder = OpusEncoder::new(rate as i32, CHANNELS, Application::Audio)
            .map_err(|error| KernelError::new(ENCODE_FAILED, error))?;
        encoder.bitrate_bps = bitrate as i32;
        let scale = u64::from(GRANULE_RATE / rate);
        let lookahead = encoder.lookahead();
        let pre_skip = u16::try_from(lookahead as u64 * scale)
            .map_err(|_| KernelError::new(ENCODE_FAILED, "an Opus lookahead past 16 bits"))?;
        let frame = rate as usize / 50;
        Ok(Self {
            encoder,
            scale,
            frame,
            lookahead,
            pre_skip,
            rate,
            staged: Vec::with_capacity(frame * CHANNELS),
            received: 0,
            position: 0,
            packet: vec![0; MAX_PACKET_BYTES],
        })
    }

    /// The samples (48 kHz) a decoder drops first: the encoder's lookahead.
    pub fn pre_skip(&self) -> u16 {
        self.pre_skip
    }

    /// The rate the frames come at.
    pub fn input_rate(&self) -> u32 {
        self.rate
    }

    /// The next frames of the render.
    pub fn push(
        &mut self,
        frames: &[[f32; 2]],
        sink: &mut impl FnMut(&[u8], u64) -> Result<()>,
    ) -> Result<()> {
        self.received += frames.len() as u64;
        for frame in frames {
            self.staged.extend_from_slice(frame);
            if self.staged.len() == self.frame * CHANNELS {
                self.encode_staged(sink)?;
            }
        }
        Ok(())
    }

    /// The end: the encoder's lookahead and the last frame padded with silence. Answers the render's length on
    /// the 48 kHz clock, which trims that padding.
    pub fn finish(mut self, sink: &mut impl FnMut(&[u8], u64) -> Result<()>) -> Result<u64> {
        if self.received == 0 {
            return Err(KernelError::new(EMPTY_RANGE, "no audio to encode"));
        }
        let mut padding = self.lookahead;
        while padding > 0 || !self.staged.is_empty() {
            self.staged.extend_from_slice(&[0.0; CHANNELS]);
            padding = padding.saturating_sub(1);
            if self.staged.len() == self.frame * CHANNELS {
                self.encode_staged(sink)?;
            }
        }
        Ok(self.received * self.scale)
    }

    fn encode_staged(&mut self, sink: &mut impl FnMut(&[u8], u64) -> Result<()>) -> Result<()> {
        let bytes = self
            .encoder
            .encode(&self.staged, self.frame, &mut self.packet)
            .map_err(|error| KernelError::new(ENCODE_FAILED, error))?;
        self.staged.clear();
        self.position += self.frame as u64 * self.scale;
        sink(&self.packet[..bytes], self.position)
    }
}
