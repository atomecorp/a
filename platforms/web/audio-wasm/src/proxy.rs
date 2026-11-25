// A shared project's light proxy rendered by the page's engine (R-349): the
// render plan played offline with the clips and samples this engine has loaded
// (`atome_mix_graph::offline_proxy`, the native engines' own), never through
// the AudioContext, and coded to Opus: an Ogg Opus file, or an MP4 of the
// page's coded picture (WebCodecs, eVe `project_proxy_video.js`) and this sound
// (`render_proxy_mp4`, the one MP4 writer `atome-mp4`).

use crate::ENGINE;
use atome_mix_graph::offline_proxy::{
    PROXY_BITRATE, ProxyVideo, SampleInfo, render_proxy, render_proxy_mp4,
};
use atome_mix_graph::offline_render::{ClipStore, RenderPlan};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

/// One coded image: its bytes' length, its duration on the picture's clock, a key image or not.
#[derive(Deserialize)]
struct Image {
    size: u32,
    duration: u32,
    key: bool,
}

/// The picture's track without its bytes (they come as their own `Uint8Array`s).
#[derive(Deserialize)]
struct PictureMeta {
    width: u16,
    height: u16,
    timescale: u32,
    samples: Vec<Image>,
}

// The plan's clips, every loaded sample and asset, copied out of the page's engine (a proxy's, a stem's).
pub(crate) fn store_for(plan: &RenderPlan) -> Result<ClipStore, String> {
    let guard = ENGINE
        .lock()
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
                .insert(voice.asset_id.clone(), clip.data.clone());
        }
    }
    Ok(store)
}

fn plan_of(plan: JsValue) -> Result<RenderPlan, JsValue> {
    serde_wasm_bindgen::from_value(plan)
        .map_err(|error| JsValue::from_str(&format!("render_plan_invalid:{error}")))
}

/// The plan's Ogg Opus file (a `Uint8Array`), coded at `bitrate` b/s (the proxy's 96 kb/s when not given).
#[wasm_bindgen]
pub fn audio_render_proxy(plan: JsValue, bitrate: Option<u32>) -> Result<Vec<u8>, JsValue> {
    let plan = plan_of(plan)?;
    let store = store_for(&plan)?;
    render_proxy(&plan, &store, bitrate.unwrap_or(PROXY_BITRATE))
        .map(|proxy| proxy.bytes)
        .map_err(|error| JsValue::from_str(&error))
}

/// The plan's sound muxed with the page's coded picture as an MP4 file (a `Uint8Array`): `video` is
/// `{ width, height, timescale, samples: [{ size, duration, key }] }`, `avcc` its parameters, `data` its samples'
/// bytes one after another.
#[wasm_bindgen]
pub fn audio_render_proxy_mp4(
    plan: JsValue,
    bitrate: Option<u32>,
    video: JsValue,
    avcc: Vec<u8>,
    data: Vec<u8>,
) -> Result<Vec<u8>, JsValue> {
    let plan = plan_of(plan)?;
    let meta: PictureMeta = serde_wasm_bindgen::from_value(video)
        .map_err(|error| JsValue::from_str(&format!("render_video_invalid:{error}")))?;
    let picture = ProxyVideo {
        width: meta.width,
        height: meta.height,
        timescale: meta.timescale,
        avcc,
        data,
        samples: meta
            .samples
            .into_iter()
            .map(|image| SampleInfo {
                size: image.size,
                duration: image.duration,
                key: image.key,
            })
            .collect(),
    };
    let store = store_for(&plan)?;
    render_proxy_mp4(&plan, &store, bitrate.unwrap_or(PROXY_BITRATE), &picture)
        .map(|proxy| proxy.bytes)
        .map_err(|error| JsValue::from_str(&error))
}

/// The plan rendered offline, uncoded (R-370 L11: a MIDI clip « Figer »): its interleaved stereo float samples.
#[wasm_bindgen]
pub fn audio_render_pcm(plan: JsValue) -> Result<Vec<f32>, JsValue> {
    let plan = plan_of(plan)?;
    let store = store_for(&plan)?;
    let rendered = atome_mix_graph::offline_render::render_offline(&plan, &store)?;
    Ok(rendered.frames.iter().flat_map(|pair| *pair).collect())
}
