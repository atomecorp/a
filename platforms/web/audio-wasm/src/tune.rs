// A sound clip's notes read and retuned (R-372, atome-audio-kernels tune.rs), reached from JS: planar channels
// as an Array of Float32Array, a pitch track as `{ hop, notes }` (MIDI numbers, 0 where unvoiced), notes and
// tunes flat in a Float32Array — five values a tune `[from, to, pitch, shift, drift]`, three a found note
// `[from, to, pitch]` — so a long line crosses as one typed array.
use crate::kernels::{float_array, floats, refusal, slices};
use atome_audio_kernels::{INVALID_ARGUMENT, KernelError, tune};
use js_sys::{Array, Float32Array, Object, Reflect};
use wasm_bindgen::prelude::*;

fn track_of(notes: &[f32], sample_rate: f32) -> tune::PitchTrack {
    tune::PitchTrack {
        sample_rate,
        hop: tune::TRACK_HOP,
        notes: notes.to_vec(),
    }
}

#[wasm_bindgen(js_name = trackPitch)]
pub fn track_pitch(channels: &Array, sample_rate: f32) -> Result<Object, JsValue> {
    let channels = floats(channels)?;
    let track = tune::track_pitch(&slices(&channels), sample_rate).map_err(refusal)?;
    let out = Object::new();
    Reflect::set(&out, &"hop".into(), &(track.hop as u32).into())?;
    Reflect::set(
        &out,
        &"notes".into(),
        &Float32Array::from(track.notes.as_slice()),
    )?;
    Ok(out)
}

#[wasm_bindgen(js_name = findNotes)]
pub fn find_notes(notes: &[f32], sample_rate: f32) -> Vec<f32> {
    tune::find_notes(&track_of(notes, sample_rate))
        .iter()
        .flat_map(|note| [note.from as f32, note.to as f32, note.pitch])
        .collect()
}

#[wasm_bindgen(js_name = renderTune)]
pub fn render_tune(
    channels: &Array,
    sample_rate: f32,
    notes: &[f32],
    tunes: &[f32],
    formant: f32,
) -> Result<Array, JsValue> {
    if !tunes.len().is_multiple_of(5) {
        return Err(refusal(KernelError::new(
            INVALID_ARGUMENT,
            "tunes hold five values each: from, to, pitch, shift, drift",
        )));
    }
    let tunes: Vec<tune::NoteTune> = tunes
        .chunks(5)
        .map(|t| tune::NoteTune {
            from: t[0] as usize,
            to: t[1] as usize,
            pitch: t[2],
            shift: t[3],
            drift: t[4],
        })
        .collect();
    let channels = floats(channels)?;
    tune::render_tune(
        &slices(&channels),
        sample_rate,
        &track_of(notes, sample_rate),
        &tunes,
        formant,
    )
    .map(float_array)
    .map_err(refusal)
}
