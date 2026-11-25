// The rhythm effects (R-367) heard through the real graph: a strip hands its
// transport's beat and tempo map to its modules, so a chopper cuts on the
// song's beats, at the tempo the map gives there.

use crate::tests::{BLOCK, rig};
use kira::Frame;

const RATE: f64 = 48_000.0;

// A « half » chopper of quarter steps (open on even beats), on a strip whose
// transport plays from `seconds` with `tempo` (a JSON tempo map).
fn chopper(seconds: f64, tempo: &str) -> String {
    format!(
        r#"{{"transports": [{{"id": "g", "epoch": 1, "playing": true, "seconds": {seconds}, "loop": null, "tempo": {tempo}}}],
        "strips": [{{"id": "s", "transport": "g", "output": {{"kind": "main"}},
        "chain": [{{"id": "c", "type": "dsp", "effect": "chop",
          "params": {{"active": 1, "division": 2, "pattern": 1, "length": 1, "smooth_ms": 0.1}}}}]}}]}}"#
    )
}

// The main mix's level at each of `blocks` blocks of a steady input of 1.
fn levels(json: &str, blocks: usize) -> Vec<f32> {
    let mut rig = rig(json);
    (0..blocks)
        .map(|_| rig.block(&[("s", Frame::new(1.0, 1.0))])[BLOCK / 2].left)
        .collect()
}

fn level_at(levels: &[f32], seconds: f64) -> f32 {
    levels[(seconds * RATE) as usize / BLOCK]
}

#[test]
fn a_chopper_cuts_on_the_beats_of_its_transport() {
    // 60 bpm: a beat per second, the second beat closed.
    let heard = levels(&chopper(0.0, r#"[{"start_seconds": 0, "bpm": 60}]"#), 600);
    assert!((level_at(&heard, 0.5) - 1.0).abs() < 1e-3);
    assert!(level_at(&heard, 1.5).abs() < 1e-3);
}

#[test]
fn it_follows_the_tempo_map_and_the_song_position() {
    // 120 bpm up to 1 s, then 60: from 0.75 s, beat 1.5 (closed), then beat 2 at 1 s (open)
    // and beat 3 at 2 s (closed).
    let map = r#"[{"start_seconds": 0, "bpm": 120}, {"start_seconds": 1, "bpm": 60}]"#;
    let heard = levels(&chopper(0.75, map), 600);
    assert!(level_at(&heard, 0.1).abs() < 1e-3);
    assert!((level_at(&heard, 0.6) - 1.0).abs() < 1e-3);
    assert!(level_at(&heard, 1.4).abs() < 1e-3);
}
