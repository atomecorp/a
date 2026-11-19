// REC point and mono outputs (R-183): a take armed on a strip copies what
// passes at its REC point — dry under IN, wet after an effect — placed by the
// clock of the input the strip hears; an OUT on mono sums the pair to one
// channel.

use crate::tests::{BLOCK, rig};
use kira::Frame;

const HALF_DB: &str = "-6.0206";

fn chain(rec_first: bool) -> String {
    let rec = r#"{"id":"rec","type":"record","params":{}}"#;
    let gain = format!(r#"{{"id":"fx","type":"volume","params":{{"gain_db":{HALF_DB}}}}}"#);
    let modules = if rec_first {
        format!("{rec},{gain}")
    } else {
        format!("{gain},{rec}")
    };
    format!(
        r#"{{"strips":[{{"id":"take","input":{{"kind":"live_audio","device_id":"mic"}},"chain":[{modules}],"output":{{"kind":"main"}}}}]}}"#
    )
}

// Plays four blocks of 0.8 through the strip, armed from the second, and
// returns what the REC point took and the last main frame.
fn take(rec_first: bool) -> (Vec<Frame>, Frame, Option<f64>) {
    let mut rig = rig(&chain(rec_first));
    let mic = rig.graph.live_inputs().pop().unwrap().1;
    mic.push_at(&vec![Frame::new(0.8, 0.8); BLOCK], 1_000.0);
    rig.block(&[]);
    let tap = rig.graph.arm_record("take", Some("mic")).unwrap();
    let mut last = Frame::ZERO;
    for _ in 0..3 {
        mic.push_at(&vec![Frame::new(0.8, 0.8); BLOCK], 0.0);
        last = *rig.block(&[]).last().unwrap();
    }
    rig.graph.disarm_record("take").unwrap();
    mic.push(&vec![Frame::new(0.8, 0.8); BLOCK]);
    rig.block(&[]);
    let mut taken = vec![Frame::ZERO; BLOCK * 8];
    let count = tap.drain(&mut taken);
    taken.truncate(count);
    let clock = tap.start().and_then(|start| start.clock(1.0));
    (taken, last, clock)
}

#[test]
fn a_rec_point_under_in_takes_the_dry_signal() {
    let (taken, main, _) = take(true);
    assert_eq!(taken.len(), BLOCK * 3, "the armed blocks only");
    assert!(taken.iter().all(|frame| (frame.left - 0.8).abs() < 1e-5));
    assert!(
        (main.left - 0.4).abs() < 1e-4,
        "the strip still plays wet: {main:?}"
    );
}

#[test]
fn a_rec_point_after_an_effect_takes_the_wet_signal() {
    let (taken, _, _) = take(false);
    assert_eq!(taken.len(), BLOCK * 3);
    assert!(
        taken
            .iter()
            .skip(64)
            .all(|frame| (frame.left - 0.4).abs() < 1e-4),
        "{:?}",
        taken[64]
    );
}

#[test]
fn a_take_is_placed_by_its_inputs_clock() {
    let (_, _, clock) = take(true);
    // The first armed block pulled the second push (frames 128..), anchored at 0.
    assert_eq!(clock, Some(0.0));
}

#[test]
fn a_take_starts_with_its_inputs_first_push() {
    let mut rig = rig(&chain(true));
    let mic = rig.graph.live_inputs().pop().unwrap().1;
    let tap = rig.graph.arm_record("take", Some("mic")).unwrap();
    rig.block(&[]);
    assert!(tap.start().is_none(), "no input yet, no take yet");
    mic.push_at(&vec![Frame::new(0.8, 0.8); BLOCK], 500.0);
    rig.block(&[]);
    assert_eq!(tap.start().and_then(|start| start.clock(1.0)), Some(500.0));
    let mut taken = vec![Frame::ZERO; BLOCK * 4];
    assert_eq!(tap.drain(&mut taken), BLOCK);
}

#[test]
fn an_unarmed_rec_point_takes_nothing_and_passes_its_signal() {
    let mut rig = rig(&chain(true));
    let mic = rig.graph.live_inputs().pop().unwrap().1;
    mic.push(&vec![Frame::new(0.8, 0.8); BLOCK]);
    let out = rig.block(&[]);
    assert!((out[BLOCK - 1].left - 0.4).abs() < 1e-4);
    assert!(rig.graph.arm_record("nowhere", None).is_err());
}

#[test]
fn a_mono_out_sums_the_pair_to_one_channel() {
    for (mono, left, right) in [(0, 0.5f32, 0.0f32), (1, 0.0, 0.5)] {
        let mut rig = rig(&format!(
            r#"{{"strips":[{{"id":"a","chain":[],"output":{{"kind":"main","mono":{mono}}}}}]}}"#
        ));
        let out = rig.settle(&[("a", Frame::new(0.8, 0.2))]);
        assert!(
            (out.left - left).abs() < 1e-4 && (out.right - right).abs() < 1e-4,
            "mono {mono}: {out:?}"
        );
    }
}

fn live_strip(id: &str, record: &str) -> String {
    format!(
        r#"{{"id":"{id}","input":{{"kind":"live_audio","device_id":"mic"}},"chain":[{{"id":"{record}","type":"record","params":{{}}}}],"output":{{"kind":"main"}}}}"#
    )
}

// A strip laid by a later apply records at its REC point, even when its
// record module takes an id another strip's REC point had (the Web probes lay
// every strip with a module "r"): a REC point belongs to its strip.
#[test]
fn a_strip_applied_later_takes_its_input() {
    let mut rig = rig(&format!(r#"{{"strips":[{}]}}"#, live_strip("a", "r")));
    let mic = rig.graph.live_inputs().pop().unwrap().1;
    mic.push_at(&vec![Frame::new(0.8, 0.8); BLOCK], 0.0);
    rig.block(&[]);
    let later = format!(
        r#"{{"strips":[{},{}]}}"#,
        live_strip("a", "a:record"),
        live_strip("b", "r")
    );
    rig.graph.apply(crate::tests::program(&later)).unwrap();
    rig.block(&[]);
    let tap = rig.graph.arm_record("b", Some("mic")).unwrap();
    for index in 0..3 {
        mic.push_at(
            &vec![Frame::new(0.8, 0.8); BLOCK],
            (BLOCK * (index + 2)) as f64,
        );
        rig.block(&[]);
    }
    rig.graph.disarm_record("b").unwrap();
    let mut taken = vec![Frame::ZERO; BLOCK * 8];
    let count = tap.drain(&mut taken);
    assert_eq!(count, BLOCK * 3, "the later strip's armed blocks");
    let rms = (taken[..count]
        .iter()
        .map(|frame| frame.left * frame.left)
        .sum::<f32>()
        / count as f32)
        .sqrt();
    assert!((rms - 0.8).abs() < 1e-3, "rms {rms}");
}
