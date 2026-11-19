// R-191: strips of 1, 2, 4 or 8 channels, routed channel by channel, out to
// physical outputs; declared maps only, never an implicit fold.

use crate::offline_rig::{offline, try_offline};
use kira::Frame;

const RATE: u32 = 48_000;
const BLOCK: usize = 256;

fn eight_outputs(graph: &mut crate::MixGraph) {
    graph.aux_outputs().configure(3, BLOCK * 8);
}

fn close(frame: Frame, left: f32, right: f32) {
    assert!(
        (frame.left - left).abs() < 1e-5 && (frame.right - right).abs() < 1e-5,
        "{frame:?} against ({left}, {right})"
    );
}

// Eight mono strips into the eight channels of one bus, out to outputs 1–8.
fn eight_into_one() -> String {
    let mut strips: Vec<String> = (0..8)
        .map(|k| {
            format!(
                r#"{{"id":"m{k}","channels":1,"output":{{"kind":"strip","id":"bus","channels":[{k}]}}}}"#
            )
        })
        .collect();
    strips.push(
        r#"{"id":"bus","channels":8,"chain":[{"id":"v","type":"volume","params":{"gain_db":0}}],
            "output":{"kind":"outputs","channels":[0,1,2,3,4,5,6,7]}}"#
            .into(),
    );
    format!(r#"{{"strips":[{}]}}"#, strips.join(","))
}

fn level_of(strip: &str, _: usize) -> Frame {
    match strip.strip_prefix('m').and_then(|k| k.parse::<f32>().ok()) {
        Some(k) => Frame::new(0.1 * (k + 1.0), 0.1 * (k + 1.0)),
        None => Frame::ZERO,
    }
}

#[test]
fn eight_mono_strips_reach_eight_outputs_without_crosstalk() {
    let mut rig = offline(&eight_into_one(), RATE, eight_outputs);
    let main = rig.render(BLOCK, BLOCK, &level_of);
    close(main[BLOCK - 1], 0.1, 0.2);
    let aux = rig.graph.aux_outputs();
    let mut pair = vec![Frame::ZERO; BLOCK];
    for (index, (left, right)) in [(0.3, 0.4), (0.5, 0.6), (0.7, 0.8)].into_iter().enumerate() {
        aux.drain_pair(index as u16 + 1, &mut pair);
        close(pair[BLOCK - 1], left, right);
    }
}

#[test]
fn a_wide_strip_processes_each_pair_with_the_same_settings_and_no_crosstalk() {
    // Only channel 1 of a 4-channel reverb bus is fed: outputs 3–4 stay silent.
    let json = r#"{"strips":[
        {"id":"m","channels":1,"output":{"kind":"strip","id":"bus","channels":[0]}},
        {"id":"bus","channels":4,"chain":[{"id":"r","type":"dsp","effect":"reverb"}],
         "output":{"kind":"outputs","channels":[0,1,2,3]}}]}"#;
    let mut rig = offline(json, RATE, eight_outputs);
    let impulse = |strip: &str, index: usize| match (strip, index) {
        ("m", 0) => Frame::new(1.0, 1.0),
        _ => Frame::ZERO,
    };
    let aux = rig.graph.aux_outputs();
    let mut pair = vec![Frame::ZERO; BLOCK];
    let mut heard = 0.0f32;
    for _ in 0..16 {
        let main = rig.render(BLOCK, BLOCK, &impulse);
        heard = main
            .iter()
            .fold(heard, |peak, frame| peak.max(frame.left.abs()));
        aux.drain_pair(1, &mut pair);
        let leak = pair.iter().fold(0.0f32, |peak, frame| {
            peak.max(frame.left.abs()).max(frame.right.abs())
        });
        // Only the anti-denormal offset of its own reverb, under −240 dB.
        assert!(leak < 1e-12, "pair 2 stays silent: {leak}");
    }
    assert!(heard > 1e-3, "the fed pair rings");
}

#[test]
fn a_mono_strip_plays_its_one_channel_on_both_sides() {
    let json = r#"{"strips":[{"id":"m","channels":1,"output":{"kind":"main"}}]}"#;
    let out = offline(json, RATE, |_| {}).render(BLOCK, BLOCK, &|_, _| Frame::new(0.2, 0.6));
    close(out[BLOCK - 1], 0.4, 0.4);
}

#[test]
fn a_declared_map_folds_a_wide_strip_into_the_main_pair() {
    let json = r#"{"strips":[
        {"id":"m","channels":1,"output":{"kind":"strip","id":"quad","channels":[0,1,2,3]}},
        {"id":"quad","channels":4,"output":{"kind":"main","channels":[0,1,0,1]}}]}"#;
    let out = offline(json, RATE, |_| {}).render(BLOCK, BLOCK, &|strip, _| match strip {
        "m" => Frame::new(0.25, 0.25),
        _ => Frame::ZERO,
    });
    close(out[BLOCK - 1], 0.5, 0.5);
}

#[test]
fn a_stereo_strip_keeps_its_exact_sound() {
    // The stereo path is untouched: no map, no staging, the pair goes as it is.
    let json = r#"{"strips":[{"id":"a","chain":[{"id":"v","type":"volume","params":{"gain_db":-6}}],"output":{"kind":"main"}}]}"#;
    let out = offline(json, RATE, |_| {}).render(BLOCK, 64, &|_, _| Frame::new(0.3, -0.7));
    let gain = 10f32.powf(-6.0 / 20.0);
    close(out[BLOCK - 1], 0.3 * gain, -0.7 * gain);
}

#[test]
fn an_oversampled_path_is_compensated_on_the_others() {
    // b's impulse waits for a's 2× oversampled module: it lands 23 frames late.
    let json = r#"{"strips":[
        {"id":"a","chain":[{"id":"d","type":"dsp","effect":"soft_clip","oversample":2}],"output":{"kind":"main"}},
        {"id":"b","output":{"kind":"main"}}]}"#;
    let out = offline(json, RATE, |_| {}).render(BLOCK, 64, &|strip, index| match (strip, index) {
        ("b", 0) => Frame::new(0.5, 0.5),
        _ => Frame::ZERO,
    });
    let at = out.iter().position(|frame| frame.left.abs() > 0.25);
    assert_eq!(at, Some(23));
}

#[test]
fn widths_and_maps_refuse_what_they_cannot_route() {
    let refused = |json: &str, before: fn(&mut crate::MixGraph), words: &str| {
        let error = try_offline(json, RATE, before)
            .err()
            .unwrap_or_else(|| panic!("accepted: {json}"));
        assert!(error.contains(words), "{error} (expected «{words}»)");
    };
    let none: fn(&mut crate::MixGraph) = |_| {};
    refused(
        r#"{"strips":[{"id":"a","channels":3,"output":{"kind":"main"}}]}"#,
        none,
        "a strip has 1, 2, 4 or 8",
    );
    refused(
        r#"{"strips":[{"id":"a","output":{"kind":"strip","id":"q"}},{"id":"q","channels":4,"output":{"kind":"outputs","channels":[0,1,0,1]}}]}"#,
        none,
        "needs its channel map",
    );
    refused(
        r#"{"strips":[{"id":"q","channels":4,"output":{"kind":"main"}}]}"#,
        none,
        "needs its channel map",
    );
    refused(
        r#"{"strips":[{"id":"a","output":{"kind":"strip","id":"q","channels":[0,5]}},{"id":"q","channels":4,"output":{"kind":"main","channels":[0,1,0,1]}}]}"#,
        none,
        "channel 6 does not exist",
    );
    refused(
        r#"{"strips":[{"id":"a","output":{"kind":"main","channels":[0,1,1]}}]}"#,
        none,
        "3 channels listed for a 2-channel signal",
    );
    refused(
        r#"{"strips":[{"id":"a","output":{"kind":"outputs","channels":[2,3]}}]}"#,
        none,
        "output channel 3 is not available",
    );
    refused(
        r#"{"strips":[{"id":"q","channels":4,"output":{"kind":"main","channels":[0,1,0,1]}},
            {"id":"d","chain":[{"id":"c","type":"dsp","effect":"compressor","key":{"kind":"strip","id":"q"}}],"output":{"kind":"main"}}]}"#,
        none,
        "a key or an IN reads a mono or stereo strip",
    );
    refused(
        r#"{"strips":[{"id":"q","channels":4,"output":{"kind":"main","channels":[0,1,0,1]}},
            {"id":"x","chain":[{"id":"in","type":"input","source":{"kind":"strip","id":"q"}}],"output":{"kind":"main"}}]}"#,
        none,
        "a key or an IN reads a mono or stereo strip",
    );
    refused(
        r#"{"strips":[{"id":"q","channels":4,"chain":[{"id":"rec","type":"record","params":{}}],"output":{"kind":"main","channels":[0,1,0,1]}}]}"#,
        none,
        "a take records a mono or stereo strip",
    );
    // With outputs 1–8 configured the same route is accepted.
    assert!(
        try_offline(
            r#"{"strips":[{"id":"a","output":{"kind":"outputs","channels":[2,3]}}]}"#,
            RATE,
            eight_outputs
        )
        .is_ok()
    );
}
