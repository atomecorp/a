// Signal tests: they drive the real render effects (capture + graph) with
// Kira's mock Info, block by block, exactly as the Kira mixer does.

use crate::graph::{compensation, dependency_order};
use crate::module::{STATE_ACTIVE, STATE_BYPASSED, STATE_DRAINING};
use crate::shared::StripCapture;
use crate::{MixGraph, MixGraphEffect, Program};
use kira::effect::Effect;
use kira::info::MockInfoBuilder;
use kira::Frame;

const RATE: u32 = 48_000;
pub(crate) const BLOCK: usize = 128;

pub(crate) struct Rig {
    pub(crate) graph: MixGraph,
    effect: MixGraphEffect,
    captures: Vec<(String, StripCapture)>,
}

pub(crate) fn program(json: &str) -> Program {
    serde_json::from_str(json).expect("program json")
}

pub(crate) fn rig(json: &str) -> Rig {
    rig_with(json, |_| {})
}

// `before` runs ahead of the first apply (assets a program refers to).
pub(crate) fn rig_with(json: &str, before: impl FnOnce(&mut MixGraph)) -> Rig {
    let mut graph = MixGraph::new(RATE);
    before(&mut graph);
    let program = program(json);
    let captures = program.strips.iter().map(|strip| (strip.id.clone(), StripCapture::new(graph.capture_slot(&strip.id)))).collect();
    graph.apply(program).expect("apply");
    let mut effect = graph.effect_builder().into_effect();
    effect.init(RATE, BLOCK);
    Rig { graph, effect, captures }
}

impl Rig {
    // Feeds one block per strip (same frame everywhere) and returns the main mix.
    pub(crate) fn block(&mut self, inputs: &[(&str, Frame)]) -> Vec<Frame> {
        let info = MockInfoBuilder::new().build();
        for (strip_id, capture) in &mut self.captures {
            let frame = inputs.iter().find(|(id, _)| id == strip_id).map(|(_, frame)| *frame).unwrap_or(Frame::ZERO);
            let mut buffer = vec![frame; BLOCK];
            capture.process(&mut buffer, 1.0 / RATE as f64, &info);
            assert!(buffer.iter().all(|frame| *frame == Frame::ZERO), "a captured sub-track must be silenced");
        }
        let mut out = vec![Frame::ZERO; BLOCK];
        self.effect.render(&mut out);
        out
    }

    // Feeds whole blocks of frames per strip and returns the main mix.
    pub(crate) fn block_frames(&mut self, inputs: &[(&str, Vec<Frame>)]) -> Vec<Frame> {
        let info = MockInfoBuilder::new().build();
        for (strip_id, capture) in &mut self.captures {
            let mut buffer = inputs.iter().find(|(id, _)| id == strip_id).map(|(_, frames)| frames.clone()).unwrap_or_else(|| vec![Frame::ZERO; BLOCK]);
            capture.process(&mut buffer, 1.0 / RATE as f64, &info);
        }
        let mut out = vec![Frame::ZERO; BLOCK];
        self.effect.render(&mut out);
        out
    }

    pub(crate) fn settle(&mut self, inputs: &[(&str, Frame)]) -> Frame {
        let mut last = Vec::new();
        for _ in 0..4 {
            last = self.block(inputs);
        }
        *last.last().unwrap()
    }
}

fn close(actual: Frame, left: f32, right: f32) {
    assert!((actual.left - left).abs() < 1e-4 && (actual.right - right).abs() < 1e-4, "expected ({left}, {right}), got {actual:?}");
}

#[test]
fn volume_applies_where_it_sits_in_the_chain() {
    let mut rig = rig(r#"{"strips":[{"id":"a","chain":[{"id":"v","type":"volume","params":{"gain_db":-6.0206}}],"output":{"kind":"main"}}]}"#);
    close(rig.settle(&[("a", Frame::new(1.0, 1.0))]), 0.5, 0.5);
}

#[test]
fn send_before_a_volume_ignores_it_and_after_it_follows_it() {
    // V4: a pre-module send does not receive what follows it.
    let pre = r#"{"strips":[
        {"id":"a","chain":[{"id":"s","type":"send","params":{"level_db":0},"target":{"kind":"strip","id":"bus"}},
                           {"id":"v","type":"volume","params":{"gain_db":-120}}],"output":{"kind":"main"}},
        {"id":"bus","output":{"kind":"main"}}]}"#;
    close(rig(pre).settle(&[("a", Frame::new(0.8, 0.8))]), 0.8, 0.8);
    let post = r#"{"strips":[
        {"id":"a","chain":[{"id":"v","type":"volume","params":{"gain_db":-120}},
                           {"id":"s","type":"send","params":{"level_db":0},"target":{"kind":"strip","id":"bus"}}],"output":{"kind":"main"}},
        {"id":"bus","output":{"kind":"main"}}]}"#;
    close(rig(post).settle(&[("a", Frame::new(0.8, 0.8))]), 0.0, 0.0);
}

#[test]
fn main_output_off_keeps_sends_alive() {
    // V1
    let mut rig = rig(r#"{"strips":[
        {"id":"a","chain":[{"id":"s","type":"send","params":{"level_db":-6.0206},"target":{"kind":"strip","id":"bus"}}],
         "output":{"kind":"main"},"output_enabled":false},
        {"id":"bus","output":{"kind":"main"}}]}"#);
    close(rig.settle(&[("a", Frame::new(1.0, 1.0))]), 0.5, 0.5);
}

#[test]
fn no_destination_is_silent_on_main() {
    let mut rig = rig(r#"{"strips":[{"id":"a","chain":[],"output":null}]}"#);
    close(rig.settle(&[("a", Frame::new(1.0, 1.0))]), 0.0, 0.0);
}

#[test]
fn mono_pan_and_bus_chains_sum_correctly() {
    let mut rig = rig(r#"{"strips":[
        {"id":"a","chain":[{"id":"m","type":"mono"}],"output":{"kind":"strip","id":"bus1"}},
        {"id":"b","chain":[{"id":"p","type":"pan","params":{"pan":1.0}}],"output":{"kind":"strip","id":"bus2"}},
        {"id":"bus1","output":{"kind":"strip","id":"bus2"}},
        {"id":"bus2","output":{"kind":"main"}}]}"#);
    close(rig.settle(&[("a", Frame::new(1.0, 0.0)), ("b", Frame::new(0.2, 0.2))]), 0.5, 0.7);
}

#[test]
fn a_routing_loop_closes_through_a_return() {
    // D27: `a` feeds `b`, `b` feeds `a` back at half level; each turn of the
    // loop comes back RETURN_FRAMES later.
    let looped = r#"{"strips":[
        {"id":"a","chain":[{"id":"s","type":"send","params":{"level_db":-6.0206},"target":{"kind":"strip","id":"b"}}],"output":{"kind":"main"}},
        {"id":"b","output":{"kind":"strip","id":"a"}}]}"#;
    assert!(dependency_order(&program(looped)).is_ok());
    let mut rig = rig(looped);
    let mut impulse = vec![Frame::ZERO; BLOCK];
    impulse[0] = Frame::new(1.0, 1.0);
    let mut heard = Vec::new();
    heard.extend(rig.block_frames(&[("a", impulse)]));
    for _ in 0..3 {
        heard.extend(rig.block(&[]));
    }
    for (turn, level) in [(0, 1.0), (1, 0.5), (2, 0.25), (3, 0.125)] {
        close(heard[turn * crate::graph::RETURN_FRAMES], level, level);
    }
    assert!(heard.iter().enumerate().all(|(index, frame)| index % crate::graph::RETURN_FRAMES == 0 || frame.left.abs() < 1e-6));
}

#[test]
fn mute_silences_the_strip_but_not_its_bus_siblings() {
    let mut rig = rig(r#"{"strips":[
        {"id":"a","muted":true,"output":{"kind":"main"}},
        {"id":"b","output":{"kind":"main"}}]}"#);
    close(rig.settle(&[("a", Frame::new(1.0, 1.0)), ("b", Frame::new(0.25, 0.25))]), 0.25, 0.25);
}

#[test]
fn reverb_tail_drains_then_stops_and_a_cut_stops_at_once() {
    let json = r#"{"strips":[{"id":"a","chain":[{"id":"r","type":"dsp","effect":"reverb","params":{"mix":1.0,"decay_s":0.5}}],"output":{"kind":"main"}}]}"#;
    let mut rig = rig(json);
    for _ in 0..40 {
        rig.block(&[("a", Frame::new(0.5, 0.5))]);
    }
    let mut bypassed: Program = program(json);
    bypassed.strips[0].chain[0].bypass = true;
    rig.graph.apply(bypassed.clone()).unwrap();
    let ringing = rig.block(&[]);
    assert_eq!(rig.graph.module_state("r"), Some(STATE_DRAINING));
    assert!(crate::dsp::peak(&ringing) > 1e-3, "the tail keeps sounding after the input stops feeding it");
    let mut blocks = 0;
    while rig.graph.module_state("r") == Some(STATE_DRAINING) && blocks < 2000 {
        rig.block(&[]);
        blocks += 1;
    }
    assert_eq!(rig.graph.module_state("r"), Some(STATE_BYPASSED), "the tail ends and processing really stops");
    // While bypassed the strip passes its dry signal only.
    close(rig.settle(&[("a", Frame::new(0.3, 0.3))]), 0.3, 0.3);

    let mut rig = rig_again(json);
    for _ in 0..40 {
        rig.block(&[("a", Frame::new(0.5, 0.5))]);
    }
    rig.graph.apply(bypassed).unwrap();
    rig.block(&[]);
    rig.graph.cut_tail("r").unwrap();
    let cut = rig.block(&[]);
    assert_eq!(rig.graph.module_state("r"), Some(STATE_BYPASSED));
    assert!(crate::dsp::peak(&cut) < 1e-6, "a second swipe stops the tail immediately");
    let mut active: Program = program(json);
    active.strips[0].chain[0].bypass = false;
    rig.graph.apply(active).unwrap();
    rig.block(&[]);
    assert_eq!(rig.graph.module_state("r"), Some(STATE_ACTIVE));
}

fn rig_again(json: &str) -> Rig {
    rig(json)
}

#[test]
fn sidechain_key_ducks_the_consumer() {
    let json = r#"{"strips":[
        {"id":"kick","output":null},
        {"id":"pad","chain":[{"id":"c","type":"dsp","effect":"compressor","params":{"threshold_db":-40,"ratio":20,"attack_ms":0.1,"release_ms":50,"makeup_db":0},"key":{"kind":"strip","id":"kick"}}],"output":{"kind":"main"}}]}"#;
    let mut rig = rig(json);
    let quiet_key = rig.settle(&[("pad", Frame::new(0.5, 0.5))]);
    close(quiet_key, 0.5, 0.5);
    let ducked = rig.settle(&[("pad", Frame::new(0.5, 0.5)), ("kick", Frame::new(0.9, 0.9))]);
    assert!(ducked.left < 0.05, "a loud key must duck the pad, got {ducked:?}");
}

#[test]
fn parallel_routes_are_latency_aligned() {
    let routes = program(r#"{"strips":[
        {"id":"slow","chain":[{"id":"x","type":"mono"}],"output":{"kind":"main"}},
        {"id":"fast","output":{"kind":"main"}}]}"#);
    let order = dependency_order(&routes).unwrap();
    let delays = compensation(&routes, &order, &|module| if module.id == "x" { 64 } else { 0 }).unwrap();
    assert_eq!(delays, vec![vec![0], vec![64]]);
}

#[test]
fn device_channel_pairs_receive_their_strip() {
    let mut rig = rig(r#"{"strips":[{"id":"a","output":{"kind":"device","channel":2}}]}"#);
    let aux = rig.graph.aux_outputs();
    aux.configure(3, BLOCK * 8);
    let main = rig.block(&[("a", Frame::new(0.4, 0.4))]);
    close(main[BLOCK - 1], 0.0, 0.0);
    let mut pair = vec![Frame::ZERO; BLOCK];
    aux.drain_pair(2, &mut pair);
    close(pair[BLOCK - 1], 0.4, 0.4);
    aux.drain_pair(1, &mut pair);
    close(pair[BLOCK - 1], 0.0, 0.0);
}

#[test]
fn meters_report_each_strip() {
    let mut rig = rig(r#"{"strips":[{"id":"a","output":{"kind":"main"}}]}"#);
    rig.block(&[("a", Frame::new(0.6, 0.6))]);
    let levels = rig.graph.levels();
    assert_eq!(levels[0].strip_id, "a");
    assert!((levels[0].peak - 0.6).abs() < 1e-4);
}

#[test]
fn a_live_input_strip_plays_its_input_not_its_track() {
    let mut rig = rig(r#"{"strips":[{"id":"mic","input":{"kind":"live_audio","device_id":"Interface 1"},"output":{"kind":"main"}}]}"#);
    let inputs = rig.graph.live_inputs();
    assert_eq!(inputs.len(), 1);
    assert_eq!(inputs[0].0, "Interface 1");
    for _ in 0..4 {
        inputs[0].1.push(&vec![Frame::new(0.3, 0.3); BLOCK]);
        let out = rig.block(&[("mic", Frame::new(0.9, 0.9))]);
        close(out[BLOCK - 1], 0.3, 0.3);
    }
}

#[test]
fn the_graph_adds_no_latency_even_through_sends_and_buses() {
    let mut graph = MixGraph::new(RATE);
    graph.apply(program(r#"{"strips":[
        {"id":"a","chain":[{"id":"v","type":"volume","params":{"gain_db":0}},{"id":"s","type":"send","params":{"level_db":0},"target":{"kind":"strip","id":"bus"}}],"output":null},
        {"id":"bus","chain":[{"id":"p","type":"pan","params":{"pan":0}}],"output":{"kind":"main"}}]}"#)).unwrap();
    let mut capture = StripCapture::new(graph.capture_slot("a"));
    let mut effect = graph.effect_builder().into_effect();
    effect.init(RATE, BLOCK);
    let info = MockInfoBuilder::new().build();
    let mut input = vec![Frame::ZERO; BLOCK];
    input[37] = Frame::new(1.0, 1.0);
    capture.process(&mut input, 1.0 / RATE as f64, &info);
    let mut out = vec![Frame::ZERO; BLOCK];
    effect.render(&mut out);
    let first = out.iter().position(|frame| frame.left.abs() > 0.5);
    assert_eq!(first, Some(37), "the impulse leaves on the frame it entered");
}
