// The direct path in a browser AudioWorklet (todo/effets_generateurs_audio L2):
// the same mix graph and render as the native engine's output callback
// (`atome_mix_graph::direct_render`), behind a plain C ABI so the worklet
// instantiates it without any JS glue. The worklet copies each 128-frame
// quantum of its inputs into the planar buffer, calls `direct_process`, and
// reads the output from the same buffer: an input is heard in the quantum
// that brought it. Everything runs on the audio thread; `direct_process` never
// allocates. A call returning `i32` answers 0, or the length of its error text
// (`direct_text`).

use atome_mix_graph::direct_render::{DirectRender, LIVE_RING_FRAMES};
use atome_mix_graph::dsp_module::StoredAsset;
use atome_mix_graph::shared::LiveInput;
use atome_mix_graph::instrument_command::InstrumentCommand;
use atome_mix_graph::{instrument_command, round_trip, MixGraph, Program, SampleData};
use kira::Frame;
use std::sync::Arc;

pub const MAX_FRAMES: usize = 1024;
pub const MAX_INPUTS: usize = 4;
// Planar layout: input i left at (2i) × MAX_FRAMES, right at (2i + 1) ×
// MAX_FRAMES, then the output left and right.
const OUTPUT_PLANE: usize = MAX_INPUTS * 2;
const PLANES: usize = OUTPUT_PLANE + 2;

pub struct Direct {
    graph: MixGraph,
    render: DirectRender,
    // Worklet input index -> the device id the program names.
    devices: Vec<String>,
    inputs: Vec<Option<Arc<LiveInput>>>,
    planar: Vec<f32>,
    frames: Vec<Frame>,
    text: String,
}

impl Direct {
    fn new(sample_rate: u32) -> Self {
        let graph = MixGraph::with_live_capacity(sample_rate, LIVE_RING_FRAMES);
        let render = DirectRender::new(graph.effect_builder().into_effect(), sample_rate);
        Self {
            graph,
            render,
            devices: Vec::new(),
            inputs: Vec::new(),
            planar: vec![0.0; PLANES * MAX_FRAMES],
            frames: vec![Frame::ZERO; MAX_FRAMES],
            text: String::new(),
        }
    }

    fn resolve_inputs(&mut self) {
        let live = self.graph.live_inputs();
        self.inputs = self.devices.iter()
            .map(|device| live.iter().find(|(id, _)| id == device).map(|(_, input)| Arc::clone(input)))
            .collect();
    }

    fn apply(&mut self, json: &str) -> Result<(), String> {
        let program: Program = serde_json::from_str(json).map_err(|error| format!("direct program invalid: {error}"))?;
        self.graph.apply(program)?;
        self.resolve_inputs();
        Ok(())
    }

    fn set_inputs(&mut self, json: &str) -> Result<(), String> {
        let devices: Vec<String> = serde_json::from_str(json).map_err(|error| format!("direct inputs invalid: {error}"))?;
        if devices.len() > MAX_INPUTS {
            return Err(format!("direct path takes at most {MAX_INPUTS} inputs"));
        }
        self.devices = devices;
        self.resolve_inputs();
        Ok(())
    }

    fn process(&mut self, frames: usize) {
        let frames = frames.min(MAX_FRAMES);
        for (index, input) in self.inputs.iter().enumerate() {
            let Some(input) = input else { continue };
            let left = &self.planar[index * 2 * MAX_FRAMES..][..frames];
            let right = &self.planar[(index * 2 + 1) * MAX_FRAMES..][..frames];
            for ((frame, left), right) in self.frames.iter_mut().zip(left).zip(right) {
                *frame = Frame::new(*left, *right);
            }
            input.push(&self.frames[..frames]);
        }
        let (_, outputs) = self.planar.split_at_mut(OUTPUT_PLANE * MAX_FRAMES);
        let (left, right) = outputs.split_at_mut(MAX_FRAMES);
        left[..frames].fill(0.0);
        right[..frames].fill(0.0);
        self.render.mix_planar(&mut left[..frames], &mut right[..frames]);
    }

    fn levels(&mut self) -> usize {
        let levels: Vec<serde_json::Value> = self.graph.levels().into_iter()
            .map(|level| serde_json::json!({ "strip_id": level.strip_id, "peak": level.peak, "rms": level.rms }))
            .collect();
        self.text = serde_json::Value::Array(levels).to_string();
        self.text.len()
    }

    // A failed call returns the length of its error, readable in `direct_text`.
    fn fail(&mut self, error: String) -> i32 {
        self.text = error;
        self.text.len().max(1) as i32
    }
}

/// # Safety
/// `ptr`/`len` must name `len` readable bytes of this module's memory.
unsafe fn text<'a>(ptr: *const u8, len: usize) -> &'a str {
    std::str::from_utf8(std::slice::from_raw_parts(ptr, len)).unwrap_or("")
}

/// # Safety
/// `direct` must come from `direct_create` and not be freed.
unsafe fn direct<'a>(direct: *mut Direct) -> &'a mut Direct {
    &mut *direct
}

#[no_mangle]
pub extern "C" fn direct_alloc(len: usize) -> *mut u8 {
    let mut bytes = Vec::<u8>::with_capacity(len);
    let ptr = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    ptr
}

/// # Safety
/// `ptr`/`len` must come from one `direct_alloc` call.
#[no_mangle]
pub unsafe extern "C" fn direct_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

#[no_mangle]
pub extern "C" fn direct_create(sample_rate: u32) -> *mut Direct {
    Box::into_raw(Box::new(Direct::new(sample_rate)))
}

#[no_mangle]
pub extern "C" fn direct_max_frames() -> u32 {
    MAX_FRAMES as u32
}

/// # Safety
/// See `direct`.
#[no_mangle]
pub unsafe extern "C" fn direct_planar(handle: *mut Direct) -> *mut f32 {
    direct(handle).planar.as_mut_ptr()
}

/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_text(handle: *mut Direct) -> *const u8 {
    direct(handle).text.as_ptr()
}

/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_set_inputs(handle: *mut Direct, ptr: *const u8, len: usize) -> i32 {
    let direct = direct(handle);
    match direct.set_inputs(text(ptr, len)) {
        Ok(()) => 0,
        Err(error) => direct.fail(error),
    }
}

/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_apply(handle: *mut Direct, ptr: *const u8, len: usize) -> i32 {
    let direct = direct(handle);
    match direct.apply(text(ptr, len)) {
        Ok(()) => 0,
        Err(error) => direct.fail(error),
    }
}

/// # Safety
/// See `direct`.
#[no_mangle]
pub unsafe extern "C" fn direct_process(handle: *mut Direct, frames: u32) {
    direct(handle).process(frames as usize);
}

/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_load_capture(handle: *mut Direct, id: *const u8, id_len: usize, json: *const u8, json_len: usize) {
    direct(handle).graph.load_asset(text(id, id_len), StoredAsset::AmpCapture(Arc::new(text(json, json_len).to_string())));
}

/// # Safety
/// See `direct` and `text`; `left` (and `right` unless null) hold `frames` samples.
#[no_mangle]
pub unsafe extern "C" fn direct_load_impulse(handle: *mut Direct, id: *const u8, id_len: usize, left: *const f32, right: *const f32, frames: usize, sample_rate: f64) {
    let left = std::slice::from_raw_parts(left, frames).to_vec();
    let right = (!right.is_null()).then(|| std::slice::from_raw_parts(right, frames).to_vec());
    direct(handle).graph.load_asset(text(id, id_len), StoredAsset::Impulse { left: Arc::new(left), right: right.map(Arc::new), sample_rate });
}

/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_unload(handle: *mut Direct, id: *const u8, id_len: usize) -> i32 {
    let direct = direct(handle);
    match direct.graph.unload_asset(text(id, id_len)) {
        Ok(()) => 0,
        Err(error) => direct.fail(error),
    }
}

/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_cut_tail(handle: *mut Direct, id: *const u8, id_len: usize) -> i32 {
    let direct = direct(handle);
    match direct.graph.cut_tail(text(id, id_len)) {
        Ok(()) => 0,
        Err(error) => direct.fail(error),
    }
}

/// A Sampler's sample decoded by the page; `right` may be null (mono).
/// # Safety
/// See `direct` and `text`; `left` (and `right` unless null) hold `frames` samples.
#[no_mangle]
pub unsafe extern "C" fn direct_load_sample(handle: *mut Direct, id: *const u8, id_len: usize, left: *const f32, right: *const f32, frames: usize, sample_rate: f32) {
    let left = std::slice::from_raw_parts(left, frames).to_vec();
    let data = if right.is_null() { SampleData::mono(left, sample_rate) } else { SampleData::stereo(left, std::slice::from_raw_parts(right, frames).to_vec(), sample_rate) };
    direct(handle).graph.instruments().load_sample(text(id, id_len), data);
}

/// An instrument command (atome_mix_graph::instrument_command) as JSON; the
/// fired command markers are drained by `direct_instrument_actions`.
/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_instrument(handle: *mut Direct, ptr: *const u8, len: usize) -> i32 {
    let direct = direct(handle);
    let command = serde_json::from_str(text(ptr, len)).map_err(|error| format!("instrument command invalid: {error}"))
        .and_then(|command| match command {
            InstrumentCommand::DrainActions { .. } => Err("drain_actions answers through direct_instrument_actions".to_string()),
            command => Ok(command),
        });
    match command.and_then(|command| instrument_command::run(&mut direct.graph, command)) {
        Ok(_) => 0,
        Err(error) => direct.fail(error),
    }
}

/// The command markers the instrument fired since the last call, as JSON in
/// `direct_text` ({actions, dropped, stale}): answers its length, or minus the
/// length of the error there.
/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_instrument_actions(handle: *mut Direct, id: *const u8, id_len: usize) -> i32 {
    let direct = direct(handle);
    let drained = direct.graph.instruments_ref().drain_actions(text(id, id_len))
        .and_then(|drained| serde_json::to_string(&drained).map_err(|error| format!("instrument actions: {error}")));
    match drained {
        Ok(json) => {
            direct.text = json;
            direct.text.len() as i32
        }
        Err(error) => -direct.fail(error),
    }
}

/// Frames the instrument has rendered (the clock dated notes are set on), or -1.
/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_instrument_clock(handle: *mut Direct, id: *const u8, id_len: usize) -> f64 {
    direct(handle).graph.instruments_ref().rendered_frames(text(id, id_len)).map_or(-1.0, |frames| frames as f64)
}

/// The module's state, or -1 when it is not in the program.
/// # Safety
/// See `direct` and `text`.
#[no_mangle]
pub unsafe extern "C" fn direct_module_state(handle: *mut Direct, id: *const u8, id_len: usize) -> i32 {
    direct(handle).graph.module_state(text(id, id_len)).map_or(-1, i32::from)
}

/// The meters as JSON in `direct_text`; returns its length.
/// # Safety
/// See `direct`.
#[no_mangle]
pub unsafe extern "C" fn direct_levels(handle: *mut Direct) -> usize {
    direct(handle).levels()
}

#[no_mangle]
pub extern "C" fn direct_measure_arm() {
    round_trip::arm();
}

/// Once the measure is done, its frames as JSON in `direct_text` (null for
/// an impulse never heard); returns its length, 0 while it runs.
/// # Safety
/// See `direct`.
#[no_mangle]
pub unsafe extern "C" fn direct_measure_results(handle: *mut Direct) -> usize {
    let Some(results) = round_trip::results() else { return 0 };
    let direct = direct(handle);
    direct.text = serde_json::Value::from(results.into_iter().map(|frames| frames.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null)).collect::<Vec<_>>()).to_string();
    direct.text.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_input_quantum_comes_out_in_the_same_quantum() {
        let handle = direct_create(48_000);
        let program = r#"{"strips":[{"id":"mic","input":{"kind":"live_audio","device_id":"default"},
            "chain":[{"id":"g","type":"dsp","effect":"volume","params":{"volume_db":-6.0206}}],"output":{"kind":"main"}}]}"#;
        let inputs = r#"["default"]"#;
        unsafe {
            assert_eq!(direct_set_inputs(handle, inputs.as_ptr(), inputs.len()), 0);
            assert_eq!(direct_apply(handle, program.as_ptr(), program.len()), 0);
            let planar = std::slice::from_raw_parts_mut(direct_planar(handle), PLANES * MAX_FRAMES);
            planar[0] = 0.5;
            planar[MAX_FRAMES] = 0.5;
            direct_process(handle, 128);
            let out = &planar[OUTPUT_PLANE * MAX_FRAMES..];
            assert!((out[0] - 0.25).abs() < 1.0e-3, "out {}", out[0]);
            assert!(out[1..128].iter().all(|sample| sample.abs() < 1.0e-6));
            let bad = "{";
            assert!(direct_apply(handle, bad.as_ptr(), bad.len()) > 0);
        }
    }

    #[test]
    fn a_note_sent_to_the_worklet_sounds_in_the_next_quantum() {
        let handle = direct_create(48_000);
        let tone: Vec<f32> = (0..48_000).map(|index| (index as f32 * 0.0576).sin() * 0.25).collect();
        let id = "la";
        let set = r#"{"command":"set","instrument":{"id":"keys","zones":[{"id":"zone_1","keys":[0,127],"velocities":[0,127],"gain_db":0,
            "takes":[{"sample_id":"la","start":0,"end":48000,"offset":0,"velocity_offset":0,"root":69,"tune_cents":0,"gain_db":0,"pan":0,
            "playback":"forward","loop":null,"stretch":1}],"stack":{"kind":"alternate","draw":"cycle"},"cuts":[],"release_takes":[],
            "release_decay_s":1,"borrow_neighbours":false}]}}"#;
        let program = r#"{"strips":[{"id":"keys","input":{"kind":"instrument","instrument_id":"keys"},"output":{"kind":"main"}}]}"#;
        let note = r#"{"command":"event","instrument_id":"keys","event":{"kind":"note_on","note":69,"velocity":127}}"#;
        let stretched = set.replace(r#""stretch":1"#, r#""stretch":2"#);
        unsafe {
            direct_load_sample(handle, id.as_ptr(), id.len(), tone.as_ptr(), std::ptr::null(), tone.len(), 48_000.0);
            assert_eq!(direct_instrument(handle, set.as_ptr(), set.len()), 0);
            assert_eq!(direct_apply(handle, program.as_ptr(), program.len()), 0);
            direct_process(handle, 128);
            assert_eq!(direct_instrument(handle, note.as_ptr(), note.len()), 0);
            direct_process(handle, 128);
            let planar = std::slice::from_raw_parts(direct_planar(handle), PLANES * MAX_FRAMES);
            let out = &planar[OUTPUT_PLANE * MAX_FRAMES..][..128];
            assert!(out.iter().any(|sample| sample.abs() > 1.0e-3), "the note sounds in the quantum after it was sent");
            assert_eq!(direct_instrument_clock(handle, "keys".as_ptr(), 4), 256.0);
            let length = direct_instrument_actions(handle, "keys".as_ptr(), 4);
            let json = std::str::from_utf8(std::slice::from_raw_parts(direct_text(handle), length.max(0) as usize)).unwrap();
            assert_eq!(json, r#"{"actions":[],"dropped":0,"stale":0,"starved":0}"#, "no command marker fired, no frame starved");
            assert!(direct_instrument_actions(handle, "organ".as_ptr(), 5) < 0, "an unknown instrument is an error");
            let drain = r#"{"command":"drain_actions","instrument_id":"keys"}"#;
            assert!(direct_instrument(handle, drain.as_ptr(), drain.len()) > 0, "drained through its own export");
            if cfg!(target_arch = "wasm32") {
                assert!(direct_instrument(handle, stretched.as_ptr(), stretched.len()) > 0, "no real-time stretch on the Web");
            }
        }
    }
}
