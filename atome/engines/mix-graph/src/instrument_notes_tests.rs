// A composed note and its markers through the real graph and the JSON
// commands a host sends: the attack's command marker reported by
// `drain_actions` with where it lies and what it names, the note leading on
// at its marker, a controller event, and the descriptions refused.

use crate::direct_render::DirectRender;
use crate::instrument_command::{run, InstrumentAnswer, InstrumentCommand};
use crate::tests::program;
use crate::{MixGraph, SampleData};

const RATE: u32 = 48_000;
const BLOCK: usize = 256;

fn segment(markers: &str, looping: &str) -> String {
    format!(r#"{{"sample_id":"la","start":0,"end":48000,"offset":0,"velocity_offset":0,"root":69,"tune_cents":0,"gain_db":0,"pan":0,
        "playback":"forward","loop":{looping},"stretch":1,"markers":[{markers}]}}"#)
}

fn instrument(transitions: &str) -> String {
    let attack = segment(r#"{"id":"m1","frame":4800,"kind":"slice","when":{"kind":"every_pass"},"action":null,"priority":0,"delay_ms":0},
        {"id":"go","frame":2400,"kind":"action","when":{"kind":"once_per_voice"},"action":{"command":"timeline.play","input":{}},"priority":2,"delay_ms":13}"#, "null");
    let body = segment("", r#"{"start":4800,"end":9600,"mode":"sustain","ping_pong":false,"crossfade":0,"count":0}"#);
    format!(r#"{{"command":"set","instrument":{{"id":"piano","seed":89,"params":{{"attack_ms":0.1,"velocity_sense":0}},"zones":[{{"id":"zone_1","keys":[0,127],"velocities":[0,127],
        "gain_db":0,"takes":[],"stack":{{"kind":"alternate","draw":"cycle"}},"cuts":[],"release_takes":[],"release_decay_s":1,"borrow_neighbours":false,
        "composed":{{"steps":[{{"id":"attack","draw":"one","segments":[{attack}]}},{{"id":"body","draw":"cycle","segments":[{body}]}}],
        "transitions":[{transitions}]}}}}]}}}}"#)
}

const LEAD_ON: &str = r#"{"from":"attack","trigger":{"kind":"marker","marker_id":"m1"},"follow":{"type":"next"},"fade_ms":13}"#;
const STRIP: &str = r#"{"strips":[{"id":"keys","input":{"kind":"instrument","instrument_id":"piano"},"output":{"kind":"main"}}]}"#;

fn command(graph: &mut MixGraph, json: &str) -> Result<InstrumentAnswer, String> {
    run(graph, serde_json::from_str::<InstrumentCommand>(json).map_err(|error| error.to_string())?)
}

fn rig() -> (MixGraph, DirectRender) {
    let mut graph = MixGraph::new(RATE);
    let tone = (0..48_000).map(|index| 0.25 * (std::f32::consts::TAU * 440.0 * index as f32 / RATE as f32).sin()).collect();
    graph.instruments().load_sample("la", SampleData::mono(tone, RATE as f32));
    command(&mut graph, &instrument(LEAD_ON)).unwrap();
    graph.apply(program(STRIP)).unwrap();
    let render = DirectRender::new(graph.effect_builder().into_effect(), RATE);
    (graph, render)
}

fn blocks(render: &mut DirectRender, count: usize) {
    let mut out = vec![0.0; BLOCK * 2];
    for _ in 0..count {
        render.mix_interleaved(&mut out, 2);
    }
}

#[test]
fn a_command_marker_is_drained_with_where_it_lies_and_what_it_names() {
    let (mut graph, mut render) = rig();
    blocks(&mut render, 1);
    command(&mut graph, r#"{"command":"event","instrument_id":"piano","event":{"kind":"note_on","note":69,"velocity":100}}"#).unwrap();
    command(&mut graph, r#"{"command":"event","instrument_id":"piano","event":{"kind":"controller","number":1,"value":64}}"#).unwrap();
    blocks(&mut render, 40);
    let Ok(InstrumentAnswer::Actions(drained)) = command(&mut graph, r#"{"command":"drain_actions","instrument_id":"piano"}"#) else { panic!("actions") };
    assert_eq!((drained.dropped, drained.stale), (0, 0));
    assert_eq!(drained.actions.len(), 1, "once per voice: {drained:?}");
    let fired = &drained.actions[0];
    assert_eq!((fired.marker.zone_id.as_str(), fired.marker.segment.as_str(), fired.marker.marker_id.as_str()), ("zone_1", "steps/attack/0", "go"));
    assert_eq!((fired.marker.command.as_deref(), fired.marker.priority, fired.marker.delay_ms), (Some("timeline.play"), 2, 13.0));
    assert_eq!((fired.note, fired.count, fired.frame), (69, 1, BLOCK as u64 + 2400), "the note began with the second block");
    let json = serde_json::to_value(InstrumentAnswer::Actions(drained)).unwrap();
    assert_eq!(json["actions"][0]["marker_id"], "go", "a host reads it flat: {json}");
    let Ok(InstrumentAnswer::Actions(again)) = command(&mut graph, r#"{"command":"drain_actions","instrument_id":"piano"}"#) else { panic!("actions") };
    assert!(again.actions.is_empty(), "drained once");
    assert_eq!(command(&mut graph, r#"{"command":"clock","instrument_id":"piano"}"#), Ok(InstrumentAnswer::Frames(41 * BLOCK as u64)));
}

#[test]
fn a_description_the_engine_cannot_play_is_refused() {
    let (mut graph, _) = rig();
    let refused = |graph: &mut MixGraph, transitions: &str| command(graph, &instrument(transitions)).unwrap_err();
    assert!(refused(&mut graph, r#"{"from":"attack","trigger":{"kind":"marker","marker_id":"m9"},"follow":{"type":"next"},"fade_ms":0}"#).contains("no segment carries marker m9"));
    assert!(refused(&mut graph, r#"{"from":"attack","trigger":{"kind":"note_off"},"follow":{"type":"target","target_step":"coda"},"fade_ms":0}"#).contains("step coda is unknown"));
    assert!(refused(&mut graph, r#"{"from":"body","trigger":{"kind":"note_off"},"follow":{"type":"jump_marker","marker_id":"m1"},"fade_ms":0}"#).contains("every segment"));
    assert!(refused(&mut graph, r#"{"from":"attack","trigger":{"kind":"passes","count":0},"follow":{"type":"next"},"fade_ms":0}"#).contains("passes count from 1"));
    assert!(command(&mut graph, &instrument(LEAD_ON).replace(r#""draw":"one""#, r#""draw":"twice""#)).unwrap_err().contains("draw twice"));
    assert!(command(&mut graph, &instrument(LEAD_ON).replace(r#""id":"go""#, r#""id":"m1""#)).unwrap_err().contains("used twice"));
    assert!(command(&mut graph, r#"{"command":"drain_actions","instrument_id":"organ"}"#).unwrap_err().contains("organ is not loaded"));
}
