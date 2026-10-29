// `dsp` modules through the real graph: parameters by key, live retune,
// assets, and the latency the graph compensates.

use crate::dsp_module::StoredAsset;
use crate::tests::{program, rig, rig_with, BLOCK};
use kira::Frame;
use std::sync::Arc;

// A one-layer linear WaveNet captured at 44.1 kHz: a pure gain of `scale`,
// resampled by the amp module inside a 48 kHz graph.
fn gain_capture(scale: f32) -> StoredAsset {
    StoredAsset::AmpCapture(Arc::new(format!(
        r#"{{"version":"0.5.4","architecture":"WaveNet","config":{{"layers":[{{"input_size":1,"condition_size":1,"channels":1,"head_size":1,"kernel_size":1,"dilations":[1],"activation":{{"type":"LeakyReLU","negative_slope":1.0}},"gated":false,"head_bias":false}}],"head":null,"head_scale":{scale}}},"weights":[1,1,0,0,0,0,1,{scale}],"sample_rate":44100}}"#
    )))
}

#[test]
fn parameters_follow_their_keys_and_retune_live() {
    let json = |pan: f32| format!(r#"{{"strips":[{{"id":"a","chain":[{{"id":"p","type":"dsp","effect":"pan","params":{{"pan":{pan}}}}}],"output":{{"kind":"main"}}}}]}}"#);
    let mut rig = rig(&json(1.0));
    let hard_right = rig.settle(&[("a", Frame::new(0.5, 0.5))]);
    assert!(hard_right.left.abs() < 1.0e-3 && (hard_right.right - 0.5).abs() < 1.0e-3, "{hard_right:?}");
    rig.graph.apply(program(&json(-1.0))).unwrap();
    // A live change glides over 10 ms so it never clicks.
    rig.settle(&[("a", Frame::new(0.5, 0.5))]);
    let hard_left = rig.settle(&[("a", Frame::new(0.5, 0.5))]);
    assert!((hard_left.left - 0.5).abs() < 1.0e-3 && hard_left.right.abs() < 1.0e-3, "{hard_left:?}");
}

#[test]
fn an_amp_needs_its_loaded_capture() {
    let json = r#"{"strips":[{"id":"a","chain":[{"id":"amp","type":"dsp","effect":"amp","params":{"asset_id":"plexi"}}]}]}"#;
    let mut graph = crate::MixGraph::new(48_000);
    let error = graph.apply(program(json)).unwrap_err();
    assert!(error.contains("plexi is not loaded"), "{error}");
    let unknown = r#"{"strips":[{"id":"a","chain":[{"id":"x","type":"dsp","effect":"chorus"}]}]}"#;
    assert!(graph.apply(program(unknown)).unwrap_err().contains("unknown module kind"));
    let generator = r#"{"strips":[{"id":"a","chain":[{"id":"o","type":"dsp","effect":"oscillator"}]}]}"#;
    assert!(graph.apply(program(generator)).unwrap_err().contains("strip input"));
}

#[test]
fn the_graph_aligns_a_dry_strip_with_a_resampled_amp() {
    let json = r#"{"strips":[
        {"id":"guitar","chain":[{"id":"amp","type":"dsp","effect":"amp","params":{"asset_id":"plexi"}}],"output":{"kind":"main"}},
        {"id":"dry","output":{"kind":"main"}}]}"#;
    let mut rig = rig_with(json, |graph| graph.load_asset("plexi", gain_capture(0.5)));
    rig.settle(&[]);
    let out = rig.block(&[("guitar", Frame::new(1.0, 1.0)), ("dry", Frame::new(1.0, 1.0))]);
    // 44.1 → 48 → 44.1 kHz conversion in a 48 kHz graph: the amp lags by a
    // fixed latency, and the dry strip waits for it.
    let onset = out.iter().position(|frame| frame.left > 0.9).expect("both paths arrive");
    assert!((10..40).contains(&onset), "aligned onset at {onset}");
    assert!(out[..onset - 12].iter().all(|frame| frame.left.abs() < 0.05), "the dry path is held back too");
    let steady = out[BLOCK - 1].left;
    assert!((steady - 1.5).abs() < 0.1, "amp half + dry full, got {steady}");
}
