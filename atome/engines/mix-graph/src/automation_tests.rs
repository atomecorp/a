// Automation computed by the engine (Q18): a volume lane heard at the transport's own time, from
// the frames rendered, with no update between blocks; a loop wraps it; a stop leaves the value set.

use crate::automation::{AutomationPoint, Curve, evaluate};
use crate::modulation::CONTROL_FRAMES;
use crate::tests::{BLOCK, rig};
use kira::Frame;

const LANE: &str = r#"{"param": "gain_db", "points": [{"at": 0, "value": -60}, {"at": 1, "value": 0, "curve": "hold"}, {"at": 2, "value": -6}]}"#;

fn program(playing: bool, epoch: u64, seconds: f64, cycle: &str) -> String {
    format!(
        r#"{{"transports": [{{"id": "g", "epoch": {epoch}, "playing": {playing}, "seconds": {seconds}, "loop": {cycle}}}],
        "strips": [{{"id": "s", "transport": "g", "output": {{"kind": "main"}},
        "chain": [{{"id": "v", "type": "volume", "params": {{"gain_db": -12}}, "automation": [{LANE}]}}]}}]}}"#
    )
}

fn gain(rig: &crate::tests::Rig) -> f32 {
    rig.graph
        .modules
        .get("v")
        .expect("module")
        .controls
        .value
        .get()
}

#[test]
fn curves_follow_their_shape() {
    let points = |curve| {
        vec![
            AutomationPoint {
                at: 0.0,
                value: 0.0,
                curve,
            },
            AutomationPoint {
                at: 2.0,
                value: 10.0,
                curve: Curve::Linear,
            },
        ]
    };
    assert_eq!(evaluate(&points(Curve::Linear), 1.0), Some(5.0));
    assert_eq!(evaluate(&points(Curve::Hold), 1.9), Some(0.0));
    assert_eq!(
        evaluate(&points(Curve::Smooth), 0.5),
        Some(10.0 * 0.25 * 0.25 * (3.0 - 0.5))
    );
    assert_eq!(evaluate(&points(Curve::Linear), -1.0), Some(0.0));
    assert_eq!(evaluate(&points(Curve::Linear), 9.0), Some(10.0));
    assert_eq!(evaluate(&[], 1.0), None);
}

#[test]
fn the_engine_plays_the_lane_on_its_own_clock() {
    let mut rig = rig(&program(true, 1, 0.5, "null"));
    rig.block(&[("s", Frame::new(1.0, 1.0))]);
    // The lane is evaluated every control step (R-191): after the first block it holds the value of
    // its last step, CONTROL_FRAMES before the block's end, on a ramp anchored at 0.5 s.
    let last_step = (BLOCK - CONTROL_FRAMES) as f64 / 48_000.0;
    let at = |seconds: f64| (-60.0 + 60.0 * seconds) as f32;
    assert!(
        (gain(&rig) - at(0.5 + last_step)).abs() < 1e-3,
        "{}",
        gain(&rig)
    );
    // 0.25 s later with no apply at all: the curve moved by itself.
    for _ in 0..(12_000 / BLOCK) {
        rig.block(&[("s", Frame::new(1.0, 1.0))]);
    }
    let expected = at(0.5 + ((12_000 / BLOCK) * BLOCK) as f64 / 48_000.0 + last_step);
    assert!(
        (gain(&rig) - expected).abs() < 0.1,
        "{} vs {expected}",
        gain(&rig)
    );
    // A hold keeps its value up to the next point.
    rig.graph
        .apply(crate::tests::program(&program(true, 2, 1.5, "null")))
        .expect("seek");
    rig.block(&[("s", Frame::new(1.0, 1.0))]);
    assert_eq!(gain(&rig), 0.0);
    // Stopped: the described value comes back and stays.
    rig.graph
        .apply(crate::tests::program(&program(false, 3, 0.0, "null")))
        .expect("stop");
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
    let json =
        program(true, 1, 0.0, "null").replace(r#""param": "gain_db""#, r#""param": "nothing""#);
    let mut graph = crate::MixGraph::new(48_000);
    assert!(
        graph
            .apply(crate::tests::program(&json))
            .unwrap_err()
            .contains("v#nothing")
    );
}

// R-295 AUT-02/03/04: a lane on an effect's own parameter (reverb mix, echo time, compressor threshold
// with a sidechain key) is applied by the engine at the transport's time; the compressor's lane changes
// what is heard: at a 0 dB threshold the key no longer ducks the pad.
fn effect_param(
    rig: &crate::tests::Rig,
    module: &str,
    table: &[atome_dsp::param::ParamSpec],
    key: &str,
) -> f32 {
    let index = table
        .iter()
        .position(|entry| entry.key == key)
        .expect("param");
    rig.graph
        .modules
        .get(module)
        .expect("module")
        .controls
        .parameters[index]
        .get()
}

fn effects_program(seconds: f64) -> String {
    format!(
        r#"{{"transports": [{{"id": "g", "epoch": 1, "playing": true, "seconds": {seconds}, "loop": null}}],
        "strips": [{{"id": "kick", "output": null}},
        {{"id": "pad", "transport": "g", "output": {{"kind": "main"}}, "chain": [
          {{"id": "r", "type": "dsp", "effect": "reverb", "params": {{"mix": 0.34}},
            "automation": [{{"param": "mix", "points": [{{"at": 0, "value": 0}}, {{"at": 2, "value": 1}}]}}]}},
          {{"id": "e", "type": "dsp", "effect": "echo", "params": {{"time_ms": 377}},
            "automation": [{{"param": "time_ms", "points": [{{"at": 0, "value": 100}}, {{"at": 2, "value": 1000}}]}}]}},
          {{"id": "c", "type": "dsp", "effect": "compressor",
            "params": {{"threshold_db": -40, "ratio": 20, "attack_ms": 0.1, "release_ms": 50, "makeup_db": 0}},
            "key": {{"kind": "strip", "id": "kick"}},
            "automation": [{{"param": "threshold_db", "points": [{{"at": 0, "value": -40}}, {{"at": 1, "value": -40, "curve": "hold"}}, {{"at": 1.5, "value": 0}}]}}]}}]}}]}}"#
    )
}

#[test]
fn effect_lanes_follow_their_curves_and_change_what_is_heard() {
    use atome_dsp::{delay, dynamics, reverb};
    let mut rig = rig(&effects_program(0.5));
    rig.block(&[("pad", Frame::new(0.5, 0.5))]);
    let mix = effect_param(&rig, "r", &reverb::PARAMS, "mix");
    assert!((mix - 0.25).abs() < 0.01, "reverb mix at 0.5 s: {mix}");
    let time = effect_param(&rig, "e", &delay::PARAMS, "time_ms");
    assert!((time - 325.0).abs() < 2.0, "echo time at 0.5 s: {time}");
    assert_eq!(
        effect_param(&rig, "c", &dynamics::COMPRESSOR_PARAMS, "threshold_db"),
        -40.0
    );
    // A seek to 1.75 s: the threshold is up at 0 dB, the reverb mix at 0.875.
    rig.graph
        .apply(crate::tests::program(
            &effects_program(1.75).replace("\"epoch\": 1", "\"epoch\": 2"),
        ))
        .expect("seek");
    rig.block(&[("pad", Frame::new(0.5, 0.5))]);
    assert_eq!(
        effect_param(&rig, "c", &dynamics::COMPRESSOR_PARAMS, "threshold_db"),
        0.0
    );
    let mix = effect_param(&rig, "r", &reverb::PARAMS, "mix");
    assert!((mix - 0.875).abs() < 0.01, "reverb mix at 1.75 s: {mix}");
    // Heard, on a strip with the compressor alone: the key ducks the pad at -40 dB, no longer once the lane
    // has raised the threshold to 0 dB.
    let alone = |seconds: f64, epoch: u64| {
        format!(
            r#"{{"transports": [{{"id": "g", "epoch": {epoch}, "playing": true, "seconds": {seconds}, "loop": null}}],
            "strips": [{{"id": "kick", "output": null}}, {{"id": "pad", "transport": "g", "output": {{"kind": "main"}}, "chain": [
              {{"id": "c", "type": "dsp", "effect": "compressor",
                "params": {{"threshold_db": -40, "ratio": 20, "attack_ms": 0.1, "release_ms": 50, "makeup_db": 0}},
                "key": {{"kind": "strip", "id": "kick"}},
                "automation": [{{"param": "threshold_db", "points": [{{"at": 0, "value": -40}}, {{"at": 1, "value": -40, "curve": "hold"}}, {{"at": 1.5, "value": 0}}]}}]}}]}}]}}"#
        )
    };
    let both = [
        ("pad", Frame::new(0.5, 0.5)),
        ("kick", Frame::new(0.3, 0.3)),
    ];
    let mut heard = crate::tests::rig(&alone(0.5, 1));
    let ducked = heard.settle(&both);
    heard
        .graph
        .apply(crate::tests::program(&alone(1.75, 2)))
        .expect("seek");
    // Well past the compressor's release (50 ms, out of some 28 dB of reduction).
    for _ in 0..(24_000 / BLOCK) {
        heard.block(&both);
    }
    let open = heard.settle(&both);
    // The same compressor set to 0 dB by hand: the lane's 0 dB is heard as that one.
    let mut fixed = crate::tests::rig(&alone(0.5, 1).replace(r#""threshold_db": -40, "ratio""#, r#""threshold_db": 0, "ratio""#)
        .replace(r#""points": [{"at": 0, "value": -40}, {"at": 1, "value": -40, "curve": "hold"}, {"at": 1.5, "value": 0}]"#, r#""points": [{"at": 0, "value": 0}]"#));
    for _ in 0..(4_800 / BLOCK) {
        fixed.block(&both);
    }
    let reference = fixed.settle(&both);
    assert!(ducked.left < 0.05, "the key ducks at -40 dB: {ducked:?}");
    assert!(
        (open.left - reference.left).abs() < 0.01 && open.left > ducked.left * 4.0,
        "at 0 dB the lane is heard as the threshold set by hand: {open:?} vs {reference:?}"
    );
}

// R-368: a painted zone engages its module inside its blocks and bypasses it outside them, also while the transport
// stands parked (the module on where the playhead rests).
fn zone_program(playing: bool, epoch: u64, seconds: f64) -> String {
    format!(
        r#"{{"transports": [{{"id": "g", "epoch": {epoch}, "playing": {playing}, "seconds": {seconds}, "loop": null}}],
        "strips": [{{"id": "s", "transport": "g", "output": {{"kind": "main"}},
        "chain": [{{"id": "v", "type": "volume", "params": {{"gain_db": -60}}, "automation": [{{"param": "engaged",
        "points": [{{"at": 0, "value": 0, "curve": "hold"}}, {{"at": 1, "value": 1, "curve": "hold"}}, {{"at": 2, "value": 0, "curve": "hold"}}]}}]}}]}}]}}"#
    )
}

fn heard(rig: &mut crate::tests::Rig) -> f32 {
    rig.block(&[("s", Frame::new(1.0, 1.0))]);
    rig.block(&[("s", Frame::new(1.0, 1.0))])
        .last()
        .expect("frame")
        .left
}

#[test]
fn a_painted_zone_engages_its_module_inside_it_only() {
    let mut rig = rig(&zone_program(true, 1, 0.25));
    assert!(
        (heard(&mut rig) - 1.0).abs() < 1e-3,
        "before the zone the module is bypassed"
    );
    rig.graph
        .apply(crate::tests::program(&zone_program(true, 2, 1.25)))
        .expect("seek");
    assert!(heard(&mut rig) < 0.01, "inside the zone the module plays");
    rig.graph
        .apply(crate::tests::program(&zone_program(true, 3, 2.5)))
        .expect("seek");
    assert!(
        (heard(&mut rig) - 1.0).abs() < 1e-3,
        "after the zone the module is bypassed"
    );
    // Parked inside the zone, the transport stopped: the module stays on.
    rig.graph
        .apply(crate::tests::program(&zone_program(false, 4, 1.5)))
        .expect("park");
    assert!(
        heard(&mut rig) < 0.01,
        "parked in the zone the module plays"
    );
}
