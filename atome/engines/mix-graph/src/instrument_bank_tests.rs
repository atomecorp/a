// The zone fields a bank brings (one-shot, keyswitch, filter), as the eVe
// kernel writes them (instrument_schema.js), built into the sampler.

use crate::instrument_spec::{build_sampler, InstrumentSpec};
use crate::SampleData;
use std::collections::HashMap;

fn spec(zones: &str, keyswitch: &str) -> InstrumentSpec {
    serde_json::from_str(&format!(r#"{{"id":"strings","seed":89,"params":{{}},"outputs":1,"keyswitch":{keyswitch},"zones":[{zones}]}}"#)).unwrap()
}

fn zone(id: &str, extra: &str) -> String {
    format!(r#"{{"id":"{id}","keys":[48,72],"velocities":[0,127],"gain_db":0,"takes":[{{"sample_id":"a","start":0,"end":4800,"offset":0,
        "velocity_offset":0,"root":60,"tune_cents":0,"gain_db":0,"pan":0,"playback":"forward","loop":null,"stretch":1}}],
        "stack":{{"kind":"alternate","draw":"cycle"}},"cuts":[],"release_takes":[],"release_decay_s":1,"borrow_neighbours":false,"output":0,{extra}}}"#)
}

fn samples() -> HashMap<String, SampleData> {
    HashMap::from([("a".to_string(), SampleData::mono(vec![0.5; 4800], 48_000.0))])
}

#[test]
fn a_bank_zone_builds_with_its_switch_one_shot_and_filter() {
    let filter = r#""filter":{"kind":"lowpass","cutoff_hz":1200,"q":2,"key_track_cents":100,"key_center":60,"velocity_track_cents":2400}"#;
    let zones = format!("{},{}", zone("legato", &format!(r#""one_shot":false,"switch":24,{filter}"#)), zone("stacc", r#""one_shot":true,"switch":25,"filter":null"#));
    let (sampler, _, _) = build_sampler(&spec(&zones, r#"{"keys":[24,26],"default":24}"#), &samples(), 48_000).unwrap();
    let keymap = sampler.keymap();
    assert_eq!(keymap.switches().map(|range| (range.low, range.high, range.default)), Some((24, 26, 24)));
    assert_eq!((keymap.zone(0).switch, keymap.zone(0).one_shot, keymap.zone(0).filter.map(|filter| filter.cutoff_hz)), (Some(24), false, Some(1200.0)));
    assert_eq!((keymap.zone(1).switch, keymap.zone(1).one_shot, keymap.zone(1).filter), (Some(25), true, None));
}

#[test]
fn a_zone_switch_without_its_range_or_an_unknown_filter_is_refused() {
    let switched = zone("legato", r#""one_shot":false,"switch":24,"filter":null"#);
    assert!(build_sampler(&spec(&switched, "null"), &samples(), 48_000).is_err());
    let filtered = zone("legato", r#""one_shot":false,"switch":null,"filter":{"kind":"peak","cutoff_hz":800,"q":1,"key_track_cents":0,"key_center":60,"velocity_track_cents":0}"#);
    assert!(build_sampler(&spec(&filtered, "null"), &samples(), 48_000).is_err());
}
