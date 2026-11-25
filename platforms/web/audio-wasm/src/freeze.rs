// The Web engine's track freeze (R-370): the page's own engine renders stems a slice at a time on the page's thread
// (`audio_freeze_advance`, called by eVe between two pumps while the page is idle), only while the engine's load
// leaves room, and hears them in place of a strip's frozen part once the page asks. The bookkeeping is mix-graph's
// (`freeze_store::Renders`), the native engine's too. Stems live in memory only: a derivative, never stored.

use atome_mix_graph::freeze_store::{
    RENDER_LOAD_CEILING, RENDER_SLICE_FRAMES, Renders, offer_strip, status,
};
use atome_mix_graph::load_meter::{self, LoadMeter};
use serde::Serialize;
use std::cell::{OnceCell, RefCell};
use wasm_bindgen::prelude::*;

thread_local! {
    static RENDERS: RefCell<Renders> = RefCell::new(Renders::default());
    static PERFORMANCE: OnceCell<web_sys::Performance> = const { OnceCell::new() };
}

/// The page's clock in nanoseconds (`performance.now()`), once `install_clock` has found it.
pub(crate) fn now_ns() -> u64 {
    PERFORMANCE.with(|cell| {
        cell.get()
            .map_or(0, |performance| (performance.now() * 1e6) as u64)
    })
}

/// The engine is made: the load and each strip's cost are timed on the page's clock.
pub(crate) fn install_clock() -> Result<(), JsValue> {
    let performance = web_sys::window()
        .and_then(|window| window.performance())
        .ok_or_else(|| {
            JsValue::from_str("freeze_clock_missing: the page has no performance clock")
        })?;
    PERFORMANCE.with(|cell| {
        let _ = cell.set(performance);
    });
    load_meter::set_clock(now_ns);
    Ok(())
}

fn to_js(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

/// `plan` (the page's render plan of the whole timeline) and `strip_id`: the stem of the strip's freezable part is
/// rendered by `audio_freeze_advance` (or already is). `{ key, ready, steps }`.
#[wasm_bindgen]
pub fn audio_freeze_render(plan: JsValue, strip_id: &str) -> Result<JsValue, JsValue> {
    let plan: serde_json::Value = serde_wasm_bindgen::from_value(plan)
        .map_err(|error| JsValue::from_str(&format!("render_plan_invalid:{error}")))?;
    let steps = crate::mix::with_engine(|engine| engine.mix.graph().freezable_steps(strip_id))?;
    // store_for locks the engine: no lock of it is held here.
    let offered = RENDERS.with(|renders| {
        offer_strip(
            &mut renders.borrow_mut(),
            steps,
            &plan.to_string(),
            strip_id,
            crate::proxy::store_for,
        )
    })?;
    to_js(&offered)
}

/// Renders for at most `budget_ms` while the engine's load leaves room; whether renders remain.
#[wasm_bindgen]
pub fn audio_freeze_advance(budget_ms: f64) -> Result<bool, JsValue> {
    let deadline = now_ns() + (budget_ms.max(0.0) * 1e6) as u64;
    RENDERS.with(|renders| {
        let mut renders = renders.borrow_mut();
        while now_ns() < deadline && LoadMeter::global().read().load < RENDER_LOAD_CEILING {
            let Some((key, mut job)) = renders.take_next() else {
                break;
            };
            match job.advance(RENDER_SLICE_FRAMES) {
                Ok(whole) => renders.put_back(&key, job, whole),
                Err(error) => renders.fail(&key, error),
            }
        }
        Ok(renders.has_pending())
    })
}

/// The strip is heard through the stem rendered under `key` (refused when the strip changed since).
#[wasm_bindgen]
pub fn audio_freeze_apply(strip_id: &str, key: &str) -> Result<(), JsValue> {
    let stem = RENDERS.with(|renders| renders.borrow().stem(key))?;
    crate::mix::with_engine(|engine| engine.mix.graph_mut().freeze_strip(strip_id, stem))
}

/// The strip plays live again, its stem fading out.
#[wasm_bindgen]
pub fn audio_freeze_thaw(strip_id: &str) -> Result<(), JsValue> {
    crate::mix::with_engine(|engine| engine.mix.graph_mut().thaw_strip(strip_id))
}

/// The load, its peak, each strip's share, the frozen strips and the renders (`freeze_store::status`).
#[wasm_bindgen]
pub fn audio_freeze_status() -> Result<JsValue, JsValue> {
    let report = crate::mix::with_engine(|engine| {
        Ok(RENDERS.with(|renders| status(engine.mix.graph(), &renders.borrow())))
    })?;
    to_js(&report)
}

/// A run starts: its peak is measured anew.
#[wasm_bindgen]
pub fn audio_freeze_reset_peak() {
    LoadMeter::global().reset_peak();
}

/// Every stem and render but those `keys` name is forgotten.
#[wasm_bindgen]
pub fn audio_freeze_retain(keys: Vec<String>) {
    RENDERS.with(|renders| renders.borrow_mut().retain(&keys));
}
