// A shared project's light proxy rendered by the native engine (R-349): the
// page's render plan played offline with the clips and samples this engine has
// loaded (`atome_mix_graph::offline_proxy`), never through the device nor the
// engine's own manager, and coded to Opus — an Ogg Opus file, or, with the
// page's coded picture (`video`), an MP4 of both. The bytes cross in base64, as
// clip bytes come in (the one binary form a script message carries).

use super::playback::ENGINE;
use atome_mix_graph::offline_proxy::{
    PROXY_BITRATE, ProxyVideo, SampleInfo, render_proxy, render_proxy_mp4,
};
use atome_mix_graph::offline_render::{ClipStore, RenderPlan};
use base64::Engine;
use serde::Deserialize;
use serde_json::{Value, json};

/// One coded image: its bytes' length, its duration on the picture's clock, a key image or not.
#[derive(Deserialize)]
struct Image {
    size: u32,
    duration: u32,
    key: bool,
}

/// The page's coded picture (eVe `project_proxy_video.js`), its bytes in base64.
#[derive(Deserialize)]
struct Picture {
    width: u16,
    height: u16,
    timescale: u32,
    samples: Vec<Image>,
    avcc_base64: String,
    data_base64: String,
}

#[derive(Deserialize)]
struct Args {
    plan: RenderPlan,
    #[serde(default)]
    bitrate: Option<u32>,
    #[serde(default)]
    video: Option<Picture>,
}

// The plan's clips, every loaded sample and asset, copied out of the engine (shared frames, no sample copied).
pub(crate) fn store_for(plan: &RenderPlan) -> Result<ClipStore, String> {
    let guard = ENGINE
        .read()
        .map_err(|error| format!("Lock error: {error}"))?;
    let engine = guard.as_ref().ok_or("Audio engine not initialized")?;
    let mut store = ClipStore {
        samples: engine.mix.graph().instruments_ref().samples().clone(),
        // The captures and impulse responses its `dsp` modules read (an Ampli, a Réverb à convolution).
        assets: engine.mix.graph().assets().clone(),
        ..ClipStore::default()
    };
    for voice in &plan.voices {
        // A clip not loaded stays out: the render names it (`render_asset_missing:<id>`).
        if let Some(clip) = engine.clips.get(&voice.asset_id) {
            store
                .clips
                .insert(voice.asset_id.clone(), (*clip.data).clone());
        }
    }
    Ok(store)
}

fn decode(field: &str, text: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(text)
        .map_err(|error| format!("render_video_invalid:{field}:{error}"))
}

fn picture(video: Picture) -> Result<ProxyVideo, String> {
    Ok(ProxyVideo {
        width: video.width,
        height: video.height,
        timescale: video.timescale,
        avcc: decode("avcc", &video.avcc_base64)?,
        data: decode("data", &video.data_base64)?,
        samples: video
            .samples
            .into_iter()
            .map(|image| SampleInfo {
                size: image.size,
                duration: image.duration,
                key: image.key,
            })
            .collect(),
    })
}

// `{ plan, bitrate?, video? }` → the Ogg Opus file (or the MP4, with `video`) in base64, with the render it codes.
pub fn command(args: &Value) -> Result<Value, String> {
    let args: Args = serde_json::from_value(args.clone())
        .map_err(|error| format!("render_plan_invalid:{error}"))?;
    let store = store_for(&args.plan)?;
    let bitrate = args.bitrate.unwrap_or(PROXY_BITRATE);
    let (proxy, mime) = match args.video {
        Some(video) => (
            render_proxy_mp4(&args.plan, &store, bitrate, &picture(video)?)?,
            "video/mp4",
        ),
        None => (
            render_proxy(&args.plan, &store, bitrate)?,
            "audio/ogg; codecs=opus",
        ),
    };
    Ok(json!({
        "success": true,
        "mime": mime,
        "bytes_len": proxy.bytes.len(),
        "bytes_base64": base64::engine::general_purpose::STANDARD.encode(&proxy.bytes),
        "sample_rate": proxy.rate,
        "frames": proxy.frames,
        "duration_seconds": proxy.frames as f64 / f64::from(proxy.rate),
    }))
}

/// `{ plan }` → the plan rendered offline, uncoded (R-370 L11: a MIDI clip « Figer »): its interleaved stereo float
/// samples, little-endian, in base64.
pub fn render_pcm(args: &Value) -> Result<Value, String> {
    let plan: RenderPlan = serde_json::from_value(
        args.get("plan")
            .cloned()
            .ok_or("render_plan_invalid:plan_required")?,
    )
    .map_err(|error| format!("render_plan_invalid:{error}"))?;
    let rendered = atome_mix_graph::offline_render::render_offline(&plan, &store_for(&plan)?)?;
    let bytes: Vec<u8> = rendered
        .frames
        .iter()
        .flat_map(|[left, right]| left.to_le_bytes().into_iter().chain(right.to_le_bytes()))
        .collect();
    Ok(json!({
        "success": true,
        "sample_rate": rendered.rate,
        "frames": rendered.frames.len(),
        "pcm_base64": base64::engine::general_purpose::STANDARD.encode(&bytes),
    }))
}
