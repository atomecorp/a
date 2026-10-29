// The direct path renders a live input in the very block that brought it,
// keeps its backlog a few device buffers deep, and never lets a peak through.

use atome_mix_graph::direct_render::{DirectRender, BUFFER_FRAMES, LIVE_RING_FRAMES};
use atome_mix_graph::{MixGraph, Program};
use kira::Frame;

fn program(json: &str) -> Program {
    serde_json::from_str(json).expect("program")
}

const LIVE: &str = r#"{"strips":[{"id":"mic","input":{"kind":"live_audio","device_id":"mic"},
    "chain":[{"id":"g","type":"dsp","effect":"volume","params":{"volume_db":-6.0206}}],"output":{"kind":"main"}}]}"#;

#[test]
fn a_live_input_plays_in_the_block_that_brought_it() {
    let mut graph = MixGraph::with_live_capacity(48_000, LIVE_RING_FRAMES);
    let mut render = DirectRender::new(graph.effect_builder().into_effect(), 48_000);
    graph.apply(program(LIVE)).expect("apply");
    let input = graph.live_inputs().pop().expect("live input").1;
    let frames = BUFFER_FRAMES as usize;
    let mut out = vec![0.0f32; frames * 2];
    // The first block: an impulse at frame 0 comes out at frame 0, halved.
    let mut block = vec![Frame::ZERO; frames];
    block[0] = Frame::new(0.5, 0.5);
    input.push(&block);
    render.mix_interleaved(&mut out, 2);
    assert!((out[0] - 0.25).abs() < 1.0e-3, "frame 0 = {}", out[0]);
    assert!(out[2..].iter().all(|sample| sample.abs() < 1.0e-6));
}

#[test]
fn the_backlog_stays_a_few_buffers_deep() {
    let mut graph = MixGraph::with_live_capacity(48_000, LIVE_RING_FRAMES);
    let mut render = DirectRender::new(graph.effect_builder().into_effect(), 48_000);
    graph.apply(program(LIVE)).expect("apply");
    let input = graph.live_inputs().pop().expect("live input").1;
    // An input that ran ahead (20 buffers while the output slept) is cut back.
    for _ in 0..20 {
        input.push(&vec![Frame::new(0.1, 0.1); BUFFER_FRAMES as usize]);
    }
    let mut out = vec![0.0f32; BUFFER_FRAMES as usize * 2];
    render.mix_interleaved(&mut out, 2);
    assert!(input.available() <= LIVE_RING_FRAMES / 2, "backlog {}", input.available());
}

#[test]
fn the_limiter_holds_the_ceiling() {
    let mut graph = MixGraph::with_live_capacity(48_000, LIVE_RING_FRAMES);
    let mut render = DirectRender::new(graph.effect_builder().into_effect(), 48_000);
    graph.apply(program(r#"{"strips":[{"id":"mic","input":{"kind":"live_audio","device_id":"mic"},
        "chain":[{"id":"g","type":"dsp","effect":"volume","params":{"volume_db":24}}],"output":{"kind":"main"}}]}"#)).expect("apply");
    let input = graph.live_inputs().pop().expect("live input").1;
    input.push(&vec![Frame::new(0.9, -0.9); BUFFER_FRAMES as usize]);
    let mut out = vec![0.0f32; BUFFER_FRAMES as usize * 2];
    render.mix_interleaved(&mut out, 2);
    let ceiling = 10f32.powf(-1.0 / 20.0);
    assert!(out.iter().all(|sample| sample.abs() <= ceiling + 1.0e-6));
    assert!(out.iter().any(|sample| sample.abs() > ceiling * 0.9));
}

// On a real device (run with --ignored): the default input in front of the
// default output, or a loopback cable.
#[test]
#[ignore]
fn measures_the_round_trip_on_this_machine() {
    crate::playback::init().expect("engine");
    let _ = crate::commands::render_clock();
    let result = crate::commands::direct_measure_latency(None).expect("measure");
    println!("DIRECT_ROUND_TRIP {result}");
}


// Inside an audio unit (todo/effets_generateurs_audio L8): a strip whose IN is
// `host` hears what the host's render block pushes, played in that block, and
// the unit stops copying the dry input only while one listens.
#[test]
fn the_host_input_reaches_the_strip_that_listens_to_it() {
    use super::host_output::{push_host_input, HOST_INPUT_ID};
    let mut graph = MixGraph::with_live_capacity(48_000, LIVE_RING_FRAMES);
    let mut render = DirectRender::new(graph.effect_builder().into_effect(), 48_000);
    graph.apply(program(&LIVE.replace("\"device_id\":\"mic\"", &format!("\"device_id\":\"{HOST_INPUT_ID}\"")))).expect("apply");
    let (device, input) = graph.live_inputs().pop().expect("live input");
    assert_eq!(device, HOST_INPUT_ID);
    let frames = BUFFER_FRAMES as usize;
    let silent = vec![0.0f32; frames];
    assert!(!push_host_input(&silent, &silent), "nobody listens yet: the dry input stays");
    super::live_input::sync_direct(vec![(device, input)]).expect("listen");
    let mut left = vec![0.0f32; frames];
    left[0] = 0.5;
    assert!(push_host_input(&left, &left), "a strip listens: the chain plays the input");
    let mut out = vec![0.0f32; frames * 2];
    render.mix_interleaved(&mut out, 2);
    assert!((out[0] - 0.25).abs() < 1.0e-3, "frame 0 = {}", out[0]);
    super::live_input::sync_direct(Vec::new()).expect("unlisten");
    assert!(!push_host_input(&silent, &silent));
}
