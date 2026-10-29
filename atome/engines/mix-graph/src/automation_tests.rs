// Automation computed by the engine (Q18): a volume lane heard at the transport's own time, from
// the frames rendered, with no update between blocks; a loop wraps it; a stop leaves the value set.

use crate::automation::{evaluate, AutomationPoint, Curve};
use crate::tests::{rig, BLOCK};
use kira::Frame;

const LANE: &str = r#"{"param": "gain_db", "points": [{"at": 0, "value": -60}, {"at": 1, "value": 0, "curve": "hold"}, {"at": 2, "value": -6}]}"#;

fn program(playing: bool, epoch: u64, seconds: f64, cycle: &str) -> String {
    format!(r#"{{"transports": [{{"id": "g", "epoch": {epoch}, "playing": {playing}, "seconds": {seconds}, "loop": {cycle}}}],
        "strips": [{{"id": "s", "transport": "g", "output": {{"kind": "main"}},
        "chain": [{{"id": "v", "type": "volume", "params": {{"gain_db": -12}}, "automation": [{LANE}]}}]}}]}}"#)
}

fn gain(rig: &crate::tests::Rig) -> f32 {
    rig.graph.modules.get("v").expect("module").controls.value.get()
}

#[test]
fn curves_follow_their_shape() {
    let points = |curve| vec![AutomationPoint { at: 0.0, value: 0.0, curve }, AutomationPoint { at: 2.0, value: 10.0, curve: Curve::Linear }];
    assert_eq!(evaluate(&points(Curve::Linear), 1.0), Some(5.0));
    assert_eq!(evaluate(&points(Curve::Hold), 1.9), Some(0.0));
    assert_eq!(evaluate(&points(Curve::Smooth), 0.5), Some(10.0 * 0.25 * 0.25 * (3.0 - 0.5)));
    assert_eq!(evaluate(&points(Curve::Linear), -1.0), Some(0.0));
    assert_eq!(evaluate(&points(Curve::Linear), 9.0), Some(10.0));
    assert_eq!(evaluate(&[], 1.0), None);
}

#[test]
fn the_engine_plays_the_lane_on_its_own_clock() {
    let mut rig = rig(&program(true, 1, 0.5, "null"));
    rig.block(&[("s", Frame::new(1.0, 1.0))]);
    // The first block runs at the anchor: 0.5 s → halfway from -60 to 0.
    assert!((gain(&rig) + 30.0).abs() < 1e-3, "{}", gain(&rig));
    // 0.25 s later with no apply at all: the curve moved by itself.
    for _ in 0..(12_000 / BLOCK) {
        rig.block(&[("s", Frame::new(1.0, 1.0))]);
    }
    let expected = -60.0 + 60.0 * (0.5 + ((12_000 / BLOCK) * BLOCK) as f64 / 48_000.0) as f32;
    assert!((gain(&rig) - expected).abs() < 0.1, "{} vs {expected}", gain(&rig));
    // A hold keeps its value up to the next point.
    rig.graph.apply(crate::tests::program(&program(true, 2, 1.5, "null"))).expect("seek");
    rig.block(&[("s", Frame::new(1.0, 1.0))]);
    assert_eq!(gain(&rig), 0.0);
    // Stopped: the described value comes back and stays.
    rig.graph.apply(crate::tests::program(&program(false, 3, 0.0, "null"))).expect("stop");
    rig.block(&[("s", Frame::new(1.0, 1.0))]);
    assert_eq!(gain(&rig), -12.0);
}

#[test]
fn a_loop_wraps_the_curve() {
    let mut rig = rig(&program(true, 1, 0.99, r#"{"start": 0, "end": 1}"#));
    for _ in 0..(4_800 / BLOCK + 1) {
        rig.block(&[("s", Frame::new(1.0, 1.0))]);
    }
    // 0.99 s + ~0.1 s wraps to ~0.09 s: back near the start of the ramp.
    assert!(gain(&rig) < -50.0, "{}", gain(&rig));
}

#[test]
fn a_lane_on_no_parameter_is_refused() {
    let json = program(true, 1, 0.0, "null").replace(r#""param": "gain_db""#, r#""param": "nothing""#);
    let mut graph = crate::MixGraph::new(48_000);
    assert!(graph.apply(crate::tests::program(&json)).unwrap_err().contains("v#nothing"));
}
