// Split modules whose ports leave for other strips, keys taken on a strip or
// on a port, and modules that keep their state across graph swaps.

use crate::tests::{program, rig, BLOCK};
use crate::MixGraph;
use kira::Frame;

fn close(actual: Frame, left: f32, right: f32) {
    assert!((actual.left - left).abs() < 1e-3 && (actual.right - right).abs() < 1e-3, "expected ({left}, {right}), got {actual:?}");
}

#[test]
fn a_routed_port_leaves_the_strip_and_the_others_stay() {
    let routed = r#"{"strips":[
        {"id":"a","chain":[{"id":"lr","type":"dsp","effect":"left_right","outputs":[{"port":1,"target":{"kind":"strip","id":"r"}}]}],"output":{"kind":"main"}},
        {"id":"r","chain":[{"id":"v","type":"volume","params":{"gain_db":-6.0206}}],"output":{"kind":"main"}}]}"#;
    close(rig(routed).settle(&[("a", Frame::new(0.4, 0.8))]), 0.4, 0.4);
    // Nothing routed: the split rebuilds its input in the strip.
    let alone = r#"{"strips":[{"id":"a","chain":[{"id":"lr","type":"dsp","effect":"left_right"}],"output":{"kind":"main"}}]}"#;
    close(rig(alone).settle(&[("a", Frame::new(0.4, 0.8))]), 0.4, 0.8);
    // A port can go to several places at once.
    let twice = r#"{"strips":[
        {"id":"a","chain":[{"id":"lr","type":"dsp","effect":"left_right","outputs":[
            {"port":0,"target":{"kind":"strip","id":"r"}},{"port":0,"target":{"kind":"main"}}]}],"output":{"kind":"main"}},
        {"id":"r","output":{"kind":"main"}}]}"#;
    close(rig(twice).settle(&[("a", Frame::new(0.25, 0.5))]), 0.5, 0.5);
}

#[test]
fn bands_sent_elsewhere_rebuild_the_input_once_summed() {
    let json = r#"{"strips":[
        {"id":"a","chain":[{"id":"b","type":"dsp","effect":"bands_3","outputs":[{"port":2,"target":{"kind":"strip","id":"top"}}]}],"output":{"kind":"main"}},
        {"id":"top","output":{"kind":"main"}}]}"#;
    let mut rig = rig(json);
    // A constant level is all in the low band; the sum keeps it.
    close(rig.settle(&[("a", Frame::new(0.5, 0.5))]), 0.5, 0.5);
    for _ in 0..200 {
        rig.block(&[("a", Frame::new(0.5, 0.5))]);
    }
    close(rig.settle(&[("a", Frame::new(0.5, 0.5))]), 0.5, 0.5);
}

#[test]
fn a_key_on_a_strip_or_on_a_port_drives_its_module() {
    // Ducking: the music drops by its amount while the voice plays.
    let duck = r#"{"strips":[
        {"id":"voice","output":null},
        {"id":"music","chain":[{"id":"d","type":"dsp","effect":"ducker","params":{"amount_db":12,"attack_ms":0.1},"key":{"kind":"strip","id":"voice"}}],"output":{"kind":"main"}}]}"#;
    let mut rig_duck = rig(duck);
    close(rig_duck.settle(&[("music", Frame::new(0.5, 0.5))]), 0.5, 0.5);
    for _ in 0..40 {
        rig_duck.block(&[("music", Frame::new(0.5, 0.5)), ("voice", Frame::new(0.5, 0.5))]);
    }
    close(rig_duck.settle(&[("music", Frame::new(0.5, 0.5)), ("voice", Frame::new(0.5, 0.5))]), 0.1256, 0.1256);
    // Gate keyed on the right band of another strip: open while it sounds,
    // and the band still plays in its own strip.
    let gate = r#"{"strips":[
        {"id":"drums","chain":[{"id":"lr","type":"dsp","effect":"left_right"}],"output":null},
        {"id":"pad","chain":[{"id":"g","type":"dsp","effect":"gate","params":{"release_ms":5,"hold_ms":0},"key":{"kind":"port","module_id":"lr","port":1}}],"output":{"kind":"main"}}]}"#;
    let mut rig_gate = rig(gate);
    for _ in 0..40 {
        rig_gate.block(&[("pad", Frame::new(0.5, 0.5)), ("drums", Frame::new(0.0, 0.5))]);
    }
    close(rig_gate.settle(&[("pad", Frame::new(0.5, 0.5)), ("drums", Frame::new(0.0, 0.5))]), 0.5, 0.5);
    for _ in 0..40 {
        rig_gate.block(&[("pad", Frame::new(0.5, 0.5)), ("drums", Frame::new(0.5, 0.0))]);
    }
    close(rig_gate.settle(&[("pad", Frame::new(0.5, 0.5)), ("drums", Frame::new(0.5, 0.0))]), 0.0005, 0.0005);
}

#[test]
fn a_key_from_later_in_the_order_comes_through_a_return() {
    // The pad listens to its own output: a loop on a key, allowed and finite.
    let json = r#"{"strips":[{"id":"pad","chain":[{"id":"c","type":"dsp","effect":"compressor","params":{"threshold_db":-40,"ratio":20},"key":{"kind":"strip","id":"pad"}}],"output":{"kind":"main"}}]}"#;
    let mut rig = rig(json);
    for _ in 0..40 {
        let out = rig.block(&[("pad", Frame::new(0.5, 0.5))]);
        assert!(out.iter().all(|frame| frame.left.is_finite() && frame.left.abs() <= 0.5));
    }
    assert!(rig.settle(&[("pad", Frame::new(0.5, 0.5))]).left < 0.1, "compressed by its own level");
}

#[test]
fn wrong_ports_and_keys_are_refused() {
    let no_port = program(r#"{"strips":[{"id":"a","chain":[{"id":"lr","type":"dsp","effect":"left_right","outputs":[{"port":2,"target":{"kind":"main"}}]}]}]}"#);
    assert!(MixGraph::new(48_000).apply(no_port).unwrap_err().contains("no port 2"));
    let no_key = program(r#"{"strips":[{"id":"a","chain":[{"id":"e","type":"dsp","effect":"echo","key":{"kind":"strip","id":"a"}}]}]}"#);
    assert!(MixGraph::new(48_000).apply(no_key).unwrap_err().contains("takes no key"));
    let missing = program(r#"{"strips":[{"id":"a","chain":[{"id":"c","type":"dsp","effect":"compressor","key":{"kind":"port","module_id":"zz","port":0}}]}]}"#);
    assert!(MixGraph::new(48_000).apply(missing).unwrap_err().contains("zz"));
}

#[test]
fn a_module_keeps_its_state_across_edits_even_before_the_render_takes_them() {
    let echo = r#"{"strips":[{"id":"a","chain":[{"id":"e","type":"dsp","effect":"echo","params":{"time_ms":5,"feedback_db":-0.5,"mix":1}}],"output":{"kind":"main"}}]}"#;
    let mut rig = rig(echo);
    rig.block(&[("a", Frame::new(0.5, 0.5))]);
    // Two edits in a row, the first never rendered: the echo still rings.
    let with_bus = r#"{"strips":[{"id":"a","chain":[{"id":"e","type":"dsp","effect":"echo","params":{"time_ms":5,"feedback_db":-0.5,"mix":1}}],"output":{"kind":"main"}},{"id":"bus","output":{"kind":"main"}}]}"#;
    rig.graph.apply(program(with_bus)).unwrap();
    rig.graph.apply(program(echo)).unwrap();
    let ringing = rig.block(&[]);
    assert!(crate::dsp::peak(&ringing) > 0.1, "the echo in flight survives the swap");
    assert_eq!(BLOCK, ringing.len());
}
