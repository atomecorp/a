//! The sound of a live stream in AAC-LC (R-248, user 25 Nov. 2026: « le son… tout passe »): an Apple TV and a Chromecast
//! both play AAC in an HLS stream. The device's own encoder (AudioToolbox's AudioConverter) turns the engine's stereo
//! output, interleaved 32-bit floats, into packets of 1024 frames each.
//!
//! The encoder exists on Apple platforms only (the iOS app, the macOS desktop app): elsewhere `AacEncoder::new` says so
//! with `aac_encoder_unavailable`, and the stream goes without sound.

#![allow(
    unsafe_code,
    reason = "drives AudioToolbox's AudioConverter through its C interface"
)]

/// Frames in one AAC-LC packet.
pub const AAC_FRAMES: usize = 1024;
/// The bitrate asked of the encoder: stereo AAC-LC at a quality no television's listener tells from the source.
pub const AAC_BITRATE: u32 = 192_000;
const CHANNELS: usize = 2;

/// The AudioSpecificConfig (ISO/IEC 14496-3 §1.6.2.1) of stereo AAC-LC at `rate`: object type 2, the rate's index,
/// channel configuration 2.
pub fn audio_specific_config(rate: u32) -> Result<[u8; 2], String> {
    const RATES: [u32; 13] = [
        96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025,
        8_000, 7_350,
    ];
    let index = RATES
        .iter()
        .position(|known| *known == rate)
        .ok_or_else(|| format!("aac_rate_unsupported:{rate}"))? as u8;
    let object_type = 2u8;
    let channel_config = CHANNELS as u8;
    Ok([
        (object_type << 3) | (index >> 1),
        ((index & 1) << 7) | (channel_config << 3),
    ])
}

#[cfg(target_vendor = "apple")]
pub use apple::AacEncoder;

#[cfg(not(target_vendor = "apple"))]
pub struct AacEncoder;

#[cfg(not(target_vendor = "apple"))]
impl AacEncoder {
    pub fn new(_rate: u32) -> Result<Self, String> {
        Err("aac_encoder_unavailable".into())
    }

    pub fn encode(&mut self, _interleaved: &[f32]) -> Result<Vec<Vec<u8>>, String> {
        Err("aac_encoder_unavailable".into())
    }
}

#[cfg(target_vendor = "apple")]
mod apple {
    use super::{AAC_BITRATE, AAC_FRAMES, CHANNELS};
    use objc2_audio_toolbox::{
        AudioConverterDispose, AudioConverterFillComplexBuffer, AudioConverterNew,
        AudioConverterRef, AudioConverterSetProperty, kAudioConverterEncodeBitRate,
    };
    use objc2_core_audio_types::{
        AudioBuffer, AudioBufferList, AudioStreamBasicDescription, AudioStreamPacketDescription,
        kAudioFormatFlagIsFloat, kAudioFormatFlagIsPacked, kAudioFormatLinearPCM,
        kAudioFormatMPEG4AAC,
    };
    use std::ffi::c_void;
    use std::ptr::{self, NonNull};

    /// The status the input procedure answers once it gave all it holds: the converter keeps what it has and asks
    /// again at the next call.
    const NO_MORE_INPUT: i32 = 0x6d6f_7265; // 'more'
    /// Room for one packet: AAC-LC never makes more than 768 bytes per channel per packet.
    const PACKET_ROOM: usize = 768 * CHANNELS;

    /// The frames the input procedure hands the converter, once.
    struct Input {
        samples: *const f32,
        frames: u32,
        given: bool,
    }

    unsafe extern "C-unwind" fn give_input(
        _converter: AudioConverterRef,
        packets: NonNull<u32>,
        data: NonNull<AudioBufferList>,
        _descriptions: *mut *mut AudioStreamPacketDescription,
        user_data: *mut c_void,
    ) -> i32 {
        // SAFETY: `user_data` is the `Input` that `encode_packet` holds alive for the whole call, `packets` and `data`
        // the converter's own.
        unsafe {
            let input = &mut *(user_data as *mut Input);
            let list = &mut *data.as_ptr();
            if input.given {
                *packets.as_ptr() = 0;
                list.mBuffers[0].mDataByteSize = 0;
                return NO_MORE_INPUT;
            }
            input.given = true;
            *packets.as_ptr() = input.frames;
            list.mNumberBuffers = 1;
            list.mBuffers[0] = AudioBuffer {
                mNumberChannels: CHANNELS as u32,
                mDataByteSize: input.frames * (CHANNELS * 4) as u32,
                mData: input.samples as *mut c_void,
            };
            0
        }
    }

    /// One AudioConverter from interleaved stereo floats to AAC-LC.
    pub struct AacEncoder {
        converter: AudioConverterRef,
        pending: Vec<f32>,
        packet: Vec<u8>,
    }

    // SAFETY: the converter is used by one thread at a time, its owner (a stream behind the server's lock).
    unsafe impl Send for AacEncoder {}

    impl AacEncoder {
        pub fn new(rate: u32) -> Result<Self, String> {
            super::audio_specific_config(rate)?;
            let source = AudioStreamBasicDescription {
                mSampleRate: f64::from(rate),
                mFormatID: kAudioFormatLinearPCM,
                mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
                mBytesPerPacket: (CHANNELS * 4) as u32,
                mFramesPerPacket: 1,
                mBytesPerFrame: (CHANNELS * 4) as u32,
                mChannelsPerFrame: CHANNELS as u32,
                mBitsPerChannel: 32,
                mReserved: 0,
            };
            let destination = AudioStreamBasicDescription {
                mSampleRate: f64::from(rate),
                mFormatID: kAudioFormatMPEG4AAC,
                mFormatFlags: 0,
                mBytesPerPacket: 0,
                mFramesPerPacket: AAC_FRAMES as u32,
                mBytesPerFrame: 0,
                mChannelsPerFrame: CHANNELS as u32,
                mBitsPerChannel: 0,
                mReserved: 0,
            };
            let mut converter: AudioConverterRef = ptr::null_mut();
            // SAFETY: the two descriptions and the out pointer live through the call.
            let status = unsafe {
                AudioConverterNew(
                    NonNull::from(&source),
                    NonNull::from(&destination),
                    NonNull::from(&mut converter),
                )
            };
            if status != 0 || converter.is_null() {
                return Err(format!("aac_encoder_failed:{status}"));
            }
            let encoder = Self {
                converter,
                pending: Vec::with_capacity(AAC_FRAMES * CHANNELS * 4),
                packet: vec![0; PACKET_ROOM],
            };
            let bitrate = AAC_BITRATE;
            // SAFETY: the converter was just made; the bitrate lives through the call.
            let status = unsafe {
                AudioConverterSetProperty(
                    encoder.converter,
                    kAudioConverterEncodeBitRate,
                    4,
                    NonNull::from(&bitrate).cast(),
                )
            };
            if status != 0 {
                return Err(format!("aac_bitrate_refused:{status}"));
            }
            Ok(encoder)
        }

        /// Adds interleaved stereo frames; returns the packets they completed, in order.
        pub fn encode(&mut self, interleaved: &[f32]) -> Result<Vec<Vec<u8>>, String> {
            self.pending.extend_from_slice(interleaved);
            let mut packets = Vec::new();
            let whole = self.pending.len() / (AAC_FRAMES * CHANNELS) * (AAC_FRAMES * CHANNELS);
            let mut offset = 0;
            while offset < whole {
                if let Some(packet) = self.encode_packet(offset)? {
                    packets.push(packet);
                }
                offset += AAC_FRAMES * CHANNELS;
            }
            self.pending.drain(..whole);
            Ok(packets)
        }

        /// Hands the converter 1024 frames from `offset`; returns the packet it made, if it made one (it holds the
        /// first frames back while it primes).
        fn encode_packet(&mut self, offset: usize) -> Result<Option<Vec<u8>>, String> {
            let mut input = Input {
                samples: self.pending[offset..].as_ptr(),
                frames: AAC_FRAMES as u32,
                given: false,
            };
            let mut output = AudioBufferList {
                mNumberBuffers: 1,
                mBuffers: [AudioBuffer {
                    mNumberChannels: CHANNELS as u32,
                    mDataByteSize: self.packet.len() as u32,
                    mData: self.packet.as_mut_ptr() as *mut c_void,
                }],
            };
            let mut count = 1u32;
            let mut description = AudioStreamPacketDescription {
                mStartOffset: 0,
                mVariableFramesInPacket: 0,
                mDataByteSize: 0,
            };
            // SAFETY: `input`, `output`, its packet room and `description` live through the call.
            let status = unsafe {
                AudioConverterFillComplexBuffer(
                    self.converter,
                    Some(give_input),
                    (&mut input as *mut Input).cast(),
                    NonNull::from(&mut count),
                    NonNull::from(&mut output),
                    &mut description,
                )
            };
            if status != 0 && status != NO_MORE_INPUT {
                return Err(format!("aac_encode_failed:{status}"));
            }
            if count == 0 {
                return Ok(None);
            }
            let size = (output.mBuffers[0].mDataByteSize as usize).min(self.packet.len());
            Ok(Some(self.packet[..size].to_vec()))
        }
    }

    impl Drop for AacEncoder {
        fn drop(&mut self) {
            // SAFETY: the converter is this encoder's alone and used no more.
            unsafe {
                AudioConverterDispose(self.converter);
            }
        }
    }
}
