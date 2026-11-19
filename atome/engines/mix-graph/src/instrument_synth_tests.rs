// R-191 / R-186: a synth instrument played by a strip through the real graph
// and the direct render, its notes on the same rings as the sampler's; the
// strip's effects act on the whole chord; a description mixing a synth with
// the sampler's parts is refused.

use crate::direct_render::DirectRender;
use crate::tests::program;
use crate::{EventKind, InstrumentSpec, MixGraph};

const RATE: u32 = 48_000;
const BLOCK: usize = 256;

const SYNTH: &str = r#"{"id":"syn","params":{"polyphony":8},"synth":{
    "bricks":[{"id":"o","kind":"oscillator","params":{"waveform":0,"level_db":-6}},
              {"id":"e","kind":"envelope","params":{"attack_ms":1,"decay_ms":1,"sustain":1,"release_ms":21}},
              {"id":"v","kind":"vca"}],
    "routes":[{"from":"o","to":"v","input":"audio","depth":1},{"from":"e","to":"v","input":"gain","depth":1}],
    "output":"v"}}"#;

const STRIP: &str = r#"{"strips":[{"id":"keys","input":{"kind":"instrument","instrument_id":"syn"},
    "chain":[{"id":"g","type":"volume","params":{"gain_db":-6}}],"output":{"kind":"main"}}]}"#;

fn spec(json: &str) -> InstrumentSpec {
    serde_json::from_str(json).expect("an instrument description")
}

fn rig() -> (MixGraph, DirectRender) {
    let mut graph = MixGraph::new(RATE);
    graph.set_instrument(spec(SYNTH)).unwrap();
    graph.apply(program(STRIP)).unwrap();
    let render = DirectRender::new(graph.effect_builder().into_effect(), RATE);
    (graph, render)
}

fn blocks(render: &mut DirectRender, count: usize) -> Vec<f32> {
    let mut out = vec![0.0; BLOCK * 2 * count];
    for chunk in out.chunks_mut(BLOCK * 2) {
        render.mix_interleaved(chunk, 2);
    }
    out.chunks(2).map(|frame| frame[0]).collect()
}

fn peak(signal: &[f32]) -> f32 {
    signal.iter().fold(0.0, |peak, value| peak.max(value.abs()))
}

#[test]
fn a_strip_plays_a_synth_chord_through_its_effects() {
    let (graph, mut render) = rig();
    let notes = graph.instruments_ref();
    blocks(&mut render, 1);
    notes
        .event(
            "syn",
            EventKind::NoteOn {
                note: 69,
                velocity: 1.0,
            },
            None,
        )
        .unwrap();
    let one = peak(&blocks(&mut render, 8)[BLOCK..]);
    // −6 dB oscillator, the strip's −6 dB volume: a quarter.
    assert!((one - 0.25).abs() < 0.01, "one note: {one}");
    notes
        .event(
            "syn",
            EventKind::NoteOn {
                note: 81,
                velocity: 1.0,
            },
            None,
        )
        .unwrap();
    let two = peak(&blocks(&mut render, 16)[BLOCK * 4..]);
    assert!(
        two > 0.4,
        "two voices summed before the strip's volume: {two}"
    );
    notes.event("syn", EventKind::AllNotesOff, None).unwrap();
    let after = blocks(&mut render, 16);
    assert!(peak(&after[BLOCK * 8..]) == 0.0, "released, the voices end");
}

#[test]
fn a_synth_description_keeps_to_its_own_parts() {
    let mut graph = MixGraph::new(RATE);
    let mixed = SYNTH.replace(r#""params":{"polyphony":8}"#, r#""params":{"attack_ms":5}"#);
    let error = graph.set_instrument(spec(&mixed)).unwrap_err();
    assert!(
        error.contains("attack_ms belongs to the sampler"),
        "{error}"
    );
    let outputs = SYNTH.replace(r#""id":"syn","#, r#""id":"syn","outputs":2,"#);
    let error = graph.set_instrument(spec(&outputs)).unwrap_err();
    assert!(error.contains("a synth has one output"), "{error}");
    let backward = SYNTH.replace(r#"{"from":"o","to":"v""#, r#"{"from":"v","to":"o""#);
    let error = graph.set_instrument(spec(&backward)).unwrap_err();
    assert!(
        error.contains("instrument syn: synth route v → o"),
        "{error}"
    );
    graph.set_instrument(spec(SYNTH)).unwrap();
    graph.apply(program(STRIP)).unwrap();
    let error = graph
        .instruments_ref()
        .set_param("syn", "release_ms", 9.0)
        .unwrap_err();
    assert!(
        error.contains("release_ms belongs to the sampler"),
        "{error}"
    );
    graph
        .instruments_ref()
        .set_param("syn", "gain_db", -3.0)
        .unwrap();
}

#[test]
fn a_brick_value_set_while_it_plays_reaches_every_voice_and_refuses_what_is_not_there() {
    let (mut graph, mut render) = rig();
    let run = |graph: &mut MixGraph, json: &str| {
        crate::instrument_command::run(graph, serde_json::from_str(json).expect("a command"))
    };
    blocks(&mut render, 1);
    run(&mut graph, r#"{"command":"event","instrument_id":"syn","event":{"kind":"note_on","note":69,"velocity":127}}"#).unwrap();
    let loud = peak(&blocks(&mut render, 8)[BLOCK * 4..]);
    // The VCA's level halved while the note holds: the strip hears half.
    run(&mut graph, r#"{"command":"brick_param","instrument_id":"syn","module_id":"v","name":"level","value":0.5}"#).unwrap();
    let half = peak(&blocks(&mut render, 8)[BLOCK * 4..]);
    assert!((half / loud - 0.5).abs() < 0.02, "{half} / {loud}");
    let refused = |json: &str, graph: &mut MixGraph| run(graph, json).expect_err("refused");
    assert!(refused(r#"{"command":"brick_param","instrument_id":"syn","module_id":"x","name":"level","value":1}"#, &mut graph).contains("not in the voice"));
    assert!(refused(r#"{"command":"brick_param","instrument_id":"syn","module_id":"v","name":"cutoff_hz","value":1}"#, &mut graph).contains("no parameter"));
    assert!(refused(r#"{"command":"brick_param","instrument_id":"syn","module_id":"e","name":"gate","value":1}"#, &mut graph).contains("no parameter"));
    // Pressure and tempo travel as notes do.
    run(
        &mut graph,
        r#"{"command":"event","instrument_id":"syn","event":{"kind":"pressure","value":64}}"#,
    )
    .unwrap();
    run(
        &mut graph,
        r#"{"command":"event","instrument_id":"syn","event":{"kind":"tempo","bpm":90}}"#,
    )
    .unwrap();
    assert!(
        run(
            &mut graph,
            r#"{"command":"event","instrument_id":"syn","event":{"kind":"tempo","bpm":0}}"#
        )
        .is_err()
    );
}
