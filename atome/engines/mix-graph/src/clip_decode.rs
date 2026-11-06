// The clip decoder of the engines that load files (native playback and the Web
// engine): an ISO-BMFF file (.m4a, .mp4, .mov, a video's sound) decoded by
// Symphonia into Kira's static sound data. Kira's own loader stops at stereo;
// here a file with more channels plays its first two (left, right), and a
// malformed packet is skipped as decoders do, the rest of the clip playing.

use kira::Frame;
use kira::sound::static_sound::{StaticSoundData, StaticSoundSettings};
use std::io::Cursor;
use symphonia::core::codecs::CodecParameters;
use symphonia::core::codecs::audio::{AudioDecoderOptions, CODEC_ID_NULL_AUDIO};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

// `extension` steers the probe (`m4a`, `mp4`…); the container is still read from the bytes.
pub fn decode_clip(bytes: Vec<u8>, extension: Option<&str>) -> Result<StaticSoundData, String> {
    let mut hint = Hint::new();
    if let Some(extension) = extension {
        hint.with_extension(extension);
    }
    let stream = MediaSourceStream::new(Box::new(Cursor::new(bytes)), Default::default());
    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|error| format!("Failed to probe audio container: {error}"))?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or("No decodable audio track found")?;
    let track_id = track.id;
    let params = match track.codec_params.as_ref() {
        Some(CodecParameters::Audio(params)) if params.codec != CODEC_ID_NULL_AUDIO => params,
        _ => return Err("No decodable audio track found".to_string()),
    };
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .map_err(|error| format!("Failed to create audio decoder: {error}"))?;
    let mut sample_rate = params.sample_rate.unwrap_or(0);
    let mut frames = Vec::new();
    let mut samples: Vec<f32> = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            // A stream cut short (a take still being written) ends where its data ends.
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(error) => return Err(format!("Failed to read audio packet: {error}")),
        };
        if packet.track_id != track_id {
            continue;
        }
        let buffer = match decoder.decode(&packet) {
            Ok(buffer) => buffer,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(error) => return Err(format!("Failed to decode audio packet: {error}")),
        };
        let channels = buffer.spec().channels().count();
        if channels == 0 {
            return Err("Decoded audio buffer has no channels".to_string());
        }
        if sample_rate == 0 {
            sample_rate = buffer.spec().rate();
        }
        samples.clear();
        buffer.copy_to_vec_interleaved(&mut samples);
        if channels == 1 {
            frames.extend(samples.iter().map(|sample| Frame::from_mono(*sample)));
        } else {
            frames.extend(
                samples
                    .chunks_exact(channels)
                    .map(|chunk| Frame::new(chunk[0], chunk[1])),
            );
        }
    }
    if sample_rate == 0 {
        return Err("Could not detect the sample rate of the audio".to_string());
    }
    if frames.is_empty() {
        return Err("No audio frames decoded".to_string());
    }
    Ok(StaticSoundData {
        sample_rate,
        frames: frames.into(),
        settings: StaticSoundSettings::default(),
        slice: None,
    })
}
