// S5 routing through the real render effects: an instrument's outputs on
// their own strips (D-S2), IN modules mixing a source in at their level, a
// loop closed through an IN one return later, and the errors a host meets.

use crate::tests::{rig_with, BLOCK};
use crate::{EventKind, InstrumentSpec, MixGraph, SampleData};
use kira::Frame;

const RATE: u32 = 48_000;

fn sine() -> SampleData {
    SampleData::mono((0..RATE as usize).map(|index| 0.25 * (std::f32::consts::TAU * 440.0 * index as f32 / RATE as f32).sin()).collect(), RATE as f32)
}

// Two zones: notes 0–59 on output `low`, 60–127 on output `high`.
fn kit(outputs: usize, low: u8, high: u8) -> InstrumentSpec {
    let zone = |id: &str, keys: [u8; 2], output: u8| format!(r#"{{"id":"{id}","keys":[{},{}],"velocities":[0,127],"gain_db":0,"output":{output},
        "takes":[{{"sample_id":"la","start":0,"end":48000,"offset":0,"velocity_offset":0,"root":69,"tune_cents":0,"gain_db":0,"pan":0,
        "playback":"forward","loop":{{"start":4800,"end":48000,"mode":"continuous","ping_pong":false,"crossfade":0,"count":0}},"stretch":1}}],
        "stack":{{"kind":"alternate","draw":"cycle"}},"cuts":[],"release_takes":[],"release_decay_s":1,"borrow_neighbours":false}}"#, keys[0], keys[1]);
    serde_json::from_str(&format!(r#"{{"id":"kit","outputs":{outputs},"params":{{"attack_ms":0.1}},"zones":[{},{}]}}"#,
        zone("low", [0, 59], low), zone("high", [60, 127], high))).unwrap()
}

fn loaded(outputs: usize, low: u8, high: u8) -> impl FnOnce(&mut MixGraph) {
    move |graph: &mut MixGraph| {
        graph.instruments().load_sample("la", sine());
        graph.set_instrument(kit(outputs, low, high)).unwrap();
    }
}

// Each strip's peak since the last read (a read resets them all).
fn peaks(graph: &MixGraph, strips: [&str; 2]) -> [f32; 2] {
    let levels = graph.levels();
    strips.map(|strip| levels.iter().find(|level| level.strip_id == strip).map_or(-1.0, |level| level.peak))
}

const TWO_STRIPS: &str = r#"{"strips":[
    {"id":"one","input":{"kind":"instrument","instrument_id":"kit","output":0},"output":{"kind":"main"}},
    {"id":"two","input":{"kind":"instrument","instrument_id":"kit","output":1},"output":{"kind":"main"}}]}"#;

#[test]
fn a_zone_on_output_two_is_heard_only_on_strip_two() {
    let mut rig = rig_with(TWO_STRIPS, loaded(2, 0, 1));
    rig.graph.instruments_ref().event("kit", EventKind::NoteOn { note: 72, velocity: 1.0 }, None).unwrap();
    for _ in 0..8 {
        rig.block(&[]);
    }
    let [one, two] = peaks(&rig.graph, ["one", "two"]);
    assert!(two > 0.1, "the high zone sounds on strip two ({two})");
    assert_eq!(one, 0.0, "and nothing of it on strip one");
    assert_eq!(rig.graph.instruments_ref().rendered_frames("kit").unwrap(), 8 * BLOCK as u64, "read by two strips, rendered once");
    rig.graph.instruments_ref().event("kit", EventKind::AllNotesOff, None).unwrap();
    for _ in 0..40 {
        rig.block(&[]);
    }
    rig.graph.levels();
    rig.graph.instruments_ref().event("kit", EventKind::NoteOn { note: 48, velocity: 1.0 }, None).unwrap();
    for _ in 0..8 {
        rig.block(&[]);
    }
    let [one, two] = peaks(&rig.graph, ["one", "two"]);
    assert!(one > 0.1, "the low zone sounds on strip one ({one})");
    assert_eq!(two, 0.0, "and nothing of it on strip two");
}

#[test]
fn an_in_module_mixes_its_source_at_its_level() {
    let mut rig = rig_with(r#"{"strips":[
        {"id":"keys","input":{"kind":"instrument","instrument_id":"kit"},"output":null},
        {"id":"vox","chain":[{"id":"in","type":"input","params":{"mix_db":-6.0206},"source":{"kind":"instrument","instrument_id":"kit","output":0}}],
         "output":{"kind":"main"}}]}"#, loaded(1, 0, 0));
    rig.graph.instruments_ref().event("kit", EventKind::NoteOn { note: 69, velocity: 1.0 }, None).unwrap();
    for _ in 0..8 {
        rig.block(&[]);
    }
    let [played, mixed] = peaks(&rig.graph, ["keys", "vox"]);
    assert!(played > 0.1, "the instrument plays on its strip ({played})");
    assert!((mixed / played - 0.5).abs() < 0.005, "the IN mixes it at -6 dB: {mixed} of {played}");
    // Its own track's signal stays: the IN adds, it does not replace.
    let out = rig.block(&[("vox", Frame::new(0.125, 0.125))]);
    assert!(out.iter().any(|frame| frame.left > 0.125), "track plus the mixed instrument");
}

#[test]
fn an_in_reads_another_strip_in_the_same_block_and_a_microphone_is_consumed_once() {
    let mut rig = rig_with(r#"{"strips":[
        {"id":"mic","input":{"kind":"live_audio","device_id":"Interface 1"},"output":null},
        {"id":"also","input":{"kind":"live_audio","device_id":"Interface 1"},"output":{"kind":"main"}},
        {"id":"mix","chain":[{"id":"in","type":"input","params":{"mix_db":0},"source":{"kind":"strip","id":"mic"}}],"output":{"kind":"main"}}]}"#, |_| {});
    let inputs = rig.graph.live_inputs();
    assert_eq!(inputs.len(), 1, "one device, opened once");
    let mut impulse = vec![Frame::ZERO; BLOCK];
    impulse[10] = Frame::new(0.5, 0.5);
    inputs[0].1.push(&impulse);
    let out = rig.block(&[]);
    assert!((out[10].left - 1.0).abs() < 1e-5, "both readers get the whole frame, the IN with no delay: {:?}", out[10]);
}

#[test]
fn a_loop_through_an_in_runs_one_return_later() {
    let mut rig = rig_with(r#"{"strips":[{"id":"loop","input":{"kind":"live_audio","device_id":"mic"},
        "chain":[{"id":"in","type":"input","params":{"mix_db":-6.0206},"source":{"kind":"strip","id":"loop"}}],"output":{"kind":"main"}}]}"#, |_| {});
    let mic = rig.graph.live_inputs().pop().unwrap().1;
    let mut impulse = vec![Frame::ZERO; BLOCK];
    impulse[10] = Frame::new(1.0, 1.0);
    mic.push(&impulse);
    let mut out = rig.block(&[]);
    for _ in 0..3 {
        out.extend(rig.block(&[]));
    }
    let return_frames = crate::graph::RETURN_FRAMES;
    for (pass, level) in [1.0f32, 0.5, 0.25, 0.125].iter().enumerate() {
        let at = 10 + pass * return_frames;
        assert!((out[at].left - level).abs() < 1e-4, "pass {pass} at frame {at}: {:?}", out[at]);
    }
    assert!(out.iter().enumerate().all(|(index, frame)| (index >= 10 && (index - 10) % return_frames == 0) || frame.left == 0.0), "nothing between the passes");
}

#[test]
fn a_host_is_told_which_output_is_missing() {
    let mut graph = MixGraph::new(RATE);
    graph.instruments().load_sample("la", sine());
    assert!(graph.set_instrument(kit(1, 0, 1)).unwrap_err().contains("output 1, the instrument has 1"));
    assert!(graph.set_instrument(kit(17, 0, 1)).unwrap_err().contains("1 to 16"));
    graph.set_instrument(kit(1, 0, 0)).unwrap();
    assert!(graph.apply(crate::tests::program(TWO_STRIPS)).unwrap_err().contains("no output 2"));
    graph.set_instrument(kit(2, 0, 1)).unwrap();
    graph.apply(crate::tests::program(TWO_STRIPS)).unwrap();
    assert!(graph.set_instrument(kit(1, 0, 0)).unwrap_err().contains("output 2 plays on a strip"), "a routed output is kept");
    assert!(graph.apply(crate::tests::program(r#"{"strips":[{"id":"x","chain":[{"id":"in","type":"input","params":{"mix_db":0}}]}]}"#))
        .unwrap_err().contains("only it reads a source"));
}
