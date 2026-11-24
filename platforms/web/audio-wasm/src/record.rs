// A take of a strip's REC point on the Web (R-183): the timeline's graph
// copies what passes at the strip's `record` module (atome-mix-graph
// record_tap.rs); the page drains it while the take runs and writes the take
// itself. Its first frame is given on the context's frame clock — the input's
// own chunks carry it (`audio_mix_live_push`) — so the take is placed like a
// capture on the shared context (`exact_placement.js#webTakeStart`).

use crate::mix::with_engine;
use atome_mix_graph::record_tap::RecordTap;
use kira::Frame;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use wasm_bindgen::prelude::*;

static TAPS: Mutex<Option<HashMap<String, Arc<RecordTap>>>> = Mutex::new(None);
const DRAIN_FRAMES: usize = 8192;

fn tap(strip_id: &str) -> Result<Arc<RecordTap>, JsValue> {
    TAPS.lock()
        .map_err(|error| JsValue::from_str(&format!("Lock error: {error}")))?
        .as_ref()
        .and_then(|taps| taps.get(strip_id).cloned())
        .ok_or_else(|| JsValue::from_str(&format!("mix_record_not_armed: {strip_id}")))
}

// Arms `strip_id`'s REC point, the strip hearing `device_id`; returns the graph's rate. A browser hands its input down
// as one mono stream, so a Web take never takes an interface's own channels (R-286: refused by the page first).
#[wasm_bindgen]
pub fn audio_mix_record_start(strip_id: &str, device_id: Option<String>) -> Result<f64, JsValue> {
    let (tap, rate) = with_engine(|engine| {
        let graph = engine.mix.graph_mut();
        let tap = graph.arm_record(strip_id, device_id.as_deref(), &[])?;
        Ok((tap, graph.sample_rate()))
    })?;
    TAPS.lock()
        .map_err(|error| JsValue::from_str(&format!("Lock error: {error}")))?
        .get_or_insert_with(HashMap::new)
        .insert(strip_id.to_string(), tap);
    Ok(f64::from(rate))
}

// What the point took since the last drain: `{ left, right, first_frame, overrun_frames }`
// (`first_frame`: the context frame of the take's first frame, null while unknown).
#[wasm_bindgen]
pub fn audio_mix_record_drain(strip_id: &str) -> Result<js_sys::Object, JsValue> {
    let tap = tap(strip_id)?;
    let (mut left, mut right) = (Vec::new(), Vec::new());
    let mut frames = vec![Frame::ZERO; DRAIN_FRAMES];
    loop {
        let count = tap.drain(&mut frames);
        left.extend(frames[..count].iter().map(|frame| frame.left));
        right.extend(frames[..count].iter().map(|frame| frame.right));
        if count < frames.len() {
            break;
        }
    }
    let out = js_sys::Object::new();
    js_sys::Reflect::set(&out, &"left".into(), &js_sys::Float32Array::from(&left[..]))?;
    js_sys::Reflect::set(
        &out,
        &"right".into(),
        &js_sys::Float32Array::from(&right[..]),
    )?;
    let first = tap.start().and_then(|start| start.clock(1.0));
    js_sys::Reflect::set(
        &out,
        &"first_frame".into(),
        &first.map_or(JsValue::NULL, JsValue::from),
    )?;
    js_sys::Reflect::set(
        &out,
        &"overrun_frames".into(),
        &(tap.overrun_frames() as f64).into(),
    )?;
    Ok(out)
}

// Ends the take: the point stops taking; what it took last is drained after.
#[wasm_bindgen]
pub fn audio_mix_record_stop(strip_id: &str) -> Result<(), JsValue> {
    with_engine(|engine| engine.mix.graph_mut().disarm_record(strip_id))
}

// Forgets the take's point once its last frames are drained.
#[wasm_bindgen]
pub fn audio_mix_record_release(strip_id: &str) -> Result<(), JsValue> {
    if let Some(taps) = TAPS
        .lock()
        .map_err(|error| JsValue::from_str(&format!("Lock error: {error}")))?
        .as_mut()
    {
        taps.remove(strip_id);
    }
    Ok(())
}
