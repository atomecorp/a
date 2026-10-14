// Mixer commands of the Web engine: the program compiled from the canonical
// `timeline.mix`, meters and tail cuts (shared logic in atome-mix-graph).

use crate::ENGINE;
use wasm_bindgen::prelude::*;

fn with_engine<T>(action: impl FnOnce(&mut crate::WasmAudioEngine) -> Result<T, String>) -> Result<T, JsValue> {
    let mut guard = ENGINE.lock().map_err(|error| JsValue::from_str(&format!("Lock error: {error}")))?;
    let engine = crate::ensure_engine(&mut guard);
    crate::ensure_audio_manager(engine)?;
    action(engine).map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn audio_mix_apply(program: JsValue) -> Result<f64, JsValue> {
    let program: atome_mix_graph::Program = serde_wasm_bindgen::from_value(program)
        .map_err(|error| JsValue::from_str(&format!("mix program invalid: {error}")))?;
    with_engine(|engine| {
        let manager = engine.manager.as_mut().ok_or("Audio manager not initialized")?;
        engine.mix.apply(manager, program).map(|count| count as f64)
    })
}

#[wasm_bindgen]
pub fn audio_mix_levels() -> Result<js_sys::Array, JsValue> {
    let levels = with_engine(|engine| Ok(engine.mix.levels()))?;
    let out = js_sys::Array::new();
    for level in levels {
        let entry = js_sys::Object::new();
        js_sys::Reflect::set(&entry, &"strip_id".into(), &level.strip_id.into())?;
        js_sys::Reflect::set(&entry, &"peak".into(), &(level.peak as f64).into())?;
        js_sys::Reflect::set(&entry, &"rms".into(), &(level.rms as f64).into())?;
        out.push(&entry);
    }
    Ok(out)
}

#[wasm_bindgen]
pub fn audio_mix_cut_tail(module_id: &str) -> Result<(), JsValue> {
    with_engine(|engine| engine.mix.cut_tail(module_id))
}

#[wasm_bindgen]
pub fn audio_mix_module_state(module_id: &str) -> Result<Option<u8>, JsValue> {
    with_engine(|engine| Ok(engine.mix.module_state(module_id)))
}

// Web live input: the recorder worklet's chunks (mono) for one input device.
#[wasm_bindgen]
pub fn audio_mix_live_push(device_id: &str, pcm: &[f32]) -> Result<(), JsValue> {
    with_engine(|engine| {
        if let Some((_, input)) = engine.mix.graph().live_inputs().into_iter().find(|(device, _)| device == device_id) {
            let frames: Vec<kira::Frame> = pcm.iter().map(|sample| kira::Frame::from_mono(*sample)).collect();
            input.push(&frames);
        }
        Ok(())
    })
}
