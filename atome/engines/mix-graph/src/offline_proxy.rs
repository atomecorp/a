// A shared project's light proxy (R-349): its plan rendered offline and coded
// to Opus as the frames come, never held whole — an Ogg Opus file for a project
// heard only, an MP4 for a project with a picture: the H.264 images the page
// coded (WebCodecs) and this sound as an Opus track (atome-mp4, the one MP4
// writer). A render at a rate Opus does not code (44.1 kHz) is brought to
// 48 kHz by the engines' resampler.

use crate::offline_render::{ClipStore, OfflineRenderer, RenderPlan};
use crate::resample::LinearResampler;
use atome_audio_kernels::ogg_opus::{GRANULE_RATE, OPUS_RATES, OggOpusEncoder};
use atome_audio_kernels::opus_packets::{OpusPacketEncoder, PACKET_GRANULES};
use atome_mp4::{Codec, Edit, Track, write_mp4};
use kira::Frame;

pub use atome_audio_kernels::ogg_opus::PROXY_BITRATE;
/// A picture's sample, as the engines' commands read them.
pub use atome_mp4::SampleInfo;

const BLOCK_FRAMES: usize = 4_096;

/// The proxy file, and the render it codes.
pub struct Proxy {
    pub bytes: Vec<u8>,
    pub rate: u32,
    pub frames: u64,
}

/// A project's coded picture (eVe `project_proxy_video.js`): its size, its clock, its samples in decode order and
/// their bytes one after another (AVC length-prefixed), its `avcC` record.
pub struct ProxyVideo {
    pub width: u16,
    pub height: u16,
    pub timescale: u32,
    pub avcc: Vec<u8>,
    pub data: Vec<u8>,
    pub samples: Vec<SampleInfo>,
}

fn opus_rate_of(plan: &RenderPlan) -> u32 {
    if OPUS_RATES.contains(&plan.rate) {
        plan.rate
    } else {
        GRANULE_RATE
    }
}

/// The plan rendered block after block, each block at `opus_rate` handed to `push`.
fn render_blocks(
    plan: &RenderPlan,
    store: &ClipStore,
    opus_rate: u32,
    mut push: impl FnMut(&[[f32; 2]]) -> Result<(), String>,
) -> Result<(), String> {
    let mut renderer = OfflineRenderer::new(plan, store)?;
    let mut resampler =
        (opus_rate != plan.rate).then(|| LinearResampler::new(plan.rate, opus_rate));
    let mut block = vec![Frame::ZERO; BLOCK_FRAMES];
    let capacity = BLOCK_FRAMES * opus_rate.div_ceil(plan.rate) as usize + 2;
    let mut resampled: Vec<Frame> = Vec::with_capacity(capacity);
    let mut pairs: Vec<[f32; 2]> = Vec::with_capacity(capacity);
    loop {
        let rendered = renderer.render_into(&mut block)?;
        if rendered == 0 {
            return Ok(());
        }
        let frames = match resampler.as_mut() {
            Some(resampler) => {
                resampled.clear();
                resampler.process(&block[..rendered], &mut resampled);
                &resampled[..]
            }
            None => &block[..rendered],
        };
        pairs.clear();
        pairs.extend(frames.iter().map(|frame| [frame.left, frame.right]));
        push(&pairs)?;
    }
}

/// The plan rendered and coded at `bitrate` b/s (`PROXY_BITRATE` for a stereo proxy), as an Ogg Opus file.
pub fn render_proxy(plan: &RenderPlan, store: &ClipStore, bitrate: u32) -> Result<Proxy, String> {
    let opus_rate = opus_rate_of(plan);
    let mut encoder = OggOpusEncoder::new(opus_rate, bitrate).map_err(|error| error.to_string())?;
    render_blocks(plan, store, opus_rate, |pairs| {
        encoder.push(pairs).map_err(|error| error.to_string())
    })?;
    Ok(Proxy {
        bytes: encoder.finish().map_err(|error| error.to_string())?,
        rate: plan.rate,
        frames: plan.duration_frames,
    })
}

/// The plan rendered and coded at `bitrate` b/s, muxed with `video` as an MP4: track 1 the picture, track 2 the
/// sound, its encoder's lookahead and its end padding cut by its edit.
pub fn render_proxy_mp4(
    plan: &RenderPlan,
    store: &ClipStore,
    bitrate: u32,
    video: &ProxyVideo,
) -> Result<Proxy, String> {
    let opus_rate = opus_rate_of(plan);
    let mut encoder =
        OpusPacketEncoder::new(opus_rate, bitrate).map_err(|error| error.to_string())?;
    let (pre_skip, input_rate) = (encoder.pre_skip(), encoder.input_rate());
    let mut data: Vec<u8> = Vec::new();
    let mut samples: Vec<SampleInfo> = Vec::new();
    let mut keep = |packet: &[u8], _position: u64| {
        data.extend_from_slice(packet);
        samples.push(SampleInfo {
            size: packet.len() as u32,
            duration: PACKET_GRANULES,
            key: true,
        });
        Ok(())
    };
    render_blocks(plan, store, opus_rate, |pairs| {
        encoder
            .push(pairs, &mut keep)
            .map_err(|error| error.to_string())
    })?;
    let length = encoder
        .finish(&mut keep)
        .map_err(|error| error.to_string())?;
    let bytes = write_mp4(&[
        Track {
            codec: Codec::Avc {
                avcc: video.avcc.clone(),
                width: video.width,
                height: video.height,
            },
            timescale: video.timescale,
            samples: video.samples.clone(),
            data: &video.data,
            edit: None,
        },
        Track {
            codec: Codec::Opus {
                channels: 2,
                pre_skip,
                input_rate,
            },
            timescale: GRANULE_RATE,
            samples,
            data: &data,
            edit: Some(Edit {
                media_time: u32::from(pre_skip),
                duration: length,
            }),
        },
    ])?;
    Ok(Proxy {
        bytes,
        rate: plan.rate,
        frames: plan.duration_frames,
    })
}
