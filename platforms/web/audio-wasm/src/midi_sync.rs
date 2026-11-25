// The MIDI sync's kernels reached from JS (R-379, atome-audio-kernels midi_sync.rs): a tempo map comes as its columns
// (starts in seconds, tempos, ramps 0 or 1), as eVe/domains/midi/midi_sync_out.js#tempoArrays lays it.
use atome_audio_kernels::midi_sync;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = midiClockTicks)]
pub fn midi_clock_ticks(
    starts: &[f64],
    bpms: &[f64],
    ramps: &[u8],
    from: f64,
    to: f64,
) -> Vec<f64> {
    midi_sync::clock_ticks(&midi_sync::tempo_map(starts, bpms, ramps), from, to)
}

#[wasm_bindgen(js_name = midiBeatAt)]
pub fn midi_beat_at(starts: &[f64], bpms: &[f64], ramps: &[u8], seconds: f64) -> f64 {
    midi_sync::beat_of(&midi_sync::tempo_map(starts, bpms, ramps), seconds)
}

#[wasm_bindgen(js_name = midiSecondsAtBeat)]
pub fn midi_seconds_at_beat(starts: &[f64], bpms: &[f64], ramps: &[u8], beat: f64) -> f64 {
    midi_sync::seconds_at(&midi_sync::tempo_map(starts, bpms, ramps), beat)
}

#[wasm_bindgen(js_name = midiClockTempo)]
pub fn midi_clock_tempo(arrivals_ms: &[f64]) -> f64 {
    midi_sync::clock_tempo(arrivals_ms)
}
