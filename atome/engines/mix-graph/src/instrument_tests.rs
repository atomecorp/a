// A strip whose source is an instrument, through the real graph and the
// direct render: the note's pitch, its frame, a rebuild while it plays, the
// live settings, and the errors a host meets.

use crate::direct_render::DirectRender;
use crate::tests::program;
use crate::{EventKind, InstrumentSpec, MixGraph, SampleData};

const RATE: u32 = 48_000;
const BLOCK: usize = 256;

fn sine(frequency: f32, seconds: f32) -> SampleData {
    let frames = (RATE as f32 * seconds) as usize;
    SampleData::mono((0..frames).map(|index| 0.25 * (std::f32::consts::TAU * frequency * index as f32 / RATE as f32).sin()).collect(), RATE as f32)
}

fn instrument(root: u8, params: &str) -> InstrumentSpec {
    serde_json::from_str(&format!(r#"{{"id":"piano","seed":89,"params":{{{params}}},"zones":[{{"id":"zone_1","keys":[0,127],"velocities":[0,127],"gain_db":0,
        "takes":[{{"sample_id":"la","start":0,"end":48000,"offset":0,"velocity_offset":0,"root":{root},"tune_cents":0,"gain_db":0,"pan":0,
        "playback":"forward","loop":{{"start":4800,"end":48000,"mode":"continuous","ping_pong":false,"crossfade":0,"count":0}},"stretch":1}}],
        "stack":{{"kind":"alternate","draw":"cycle"}},"cuts":[],"release_takes":[],"release_decay_s":1,"borrow_neighbours":false}}]}}"#)).unwrap()
}

const STRIP: &str = r#"{"strips":[{"id":"keys","input":{"kind":"instrument","instrument_id":"piano"},"output":{"kind":"main"}}]}"#;

struct Rig {
    graph: MixGraph,
    render: DirectRender,
}

impl Rig {
    fn new(root: u8) -> Self {
        let mut graph = MixGraph::new(RATE);
        graph.instruments().load_sample("la", sine(440.0, 1.0));
        graph.set_instrument(instrument(root, "")).unwrap();
        graph.apply(program(STRIP)).unwrap();
        let render = DirectRender::new(graph.effect_builder().into_effect(), RATE);
        Self { graph, render }
    }

    fn blocks(&mut self, count: usize) -> Vec<f32> {
        let mut out = vec![0.0; BLOCK * 2 * count];
        for chunk in out.chunks_mut(BLOCK * 2) {
            self.render.mix_interleaved(chunk, 2);
        }
        out.chunks(2).map(|frame| frame[0]).collect()
    }

    fn note(&self, kind: EventKind, frame: Option<u64>) {
        self.graph.instruments_ref().event("piano", kind, frame).unwrap();
    }
}

// Rising zero crossings, placed between their two frames: periods over their span.
fn frequency(signal: &[f32]) -> f32 {
    let crossings: Vec<f32> = signal.windows(2).enumerate().filter(|(_, pair)| pair[0] <= 0.0 && pair[1] > 0.0)
        .map(|(index, pair)| index as f32 + pair[0] / (pair[0] - pair[1])).collect();
    (crossings.len() - 1) as f32 * RATE as f32 / (crossings[crossings.len() - 1] - crossings[0])
}

fn onset(signal: &[f32]) -> usize {
    signal.iter().position(|sample| sample.abs() > 1.0e-6).expect("the note sounds")
}

#[test]
fn a_note_plays_at_its_pitch_from_the_next_block() {
    let mut rig = Rig::new(69);
    assert!(rig.blocks(2).iter().all(|sample| *sample == 0.0), "silent before any note");
    rig.note(EventKind::NoteOn { note: 81, velocity: 1.0 }, None);
    let out = rig.blocks(40);
    assert!(onset(&out) < 2, "a live note starts with the next block, got {}", onset(&out));
    let heard = frequency(&out[4800..]);
    assert!((heard - 880.0).abs() < 1.0, "an octave above its root, heard {heard} Hz");
    rig.note(EventKind::NoteOff { note: 81 }, None);
    let released = rig.blocks(40);
    assert!(released[released.len() - BLOCK..].iter().all(|sample| sample.abs() < 1.0e-4), "the release ends the note");
}

#[test]
fn a_dated_note_lands_on_its_frame() {
    let mut rig = Rig::new(69);
    rig.blocks(3);
    let now = rig.graph.instruments_ref().rendered_frames("piano").unwrap();
    assert_eq!(now, 3 * BLOCK as u64, "the instrument counts what it rendered");
    rig.note(EventKind::NoteOn { note: 69, velocity: 1.0 }, Some(now + 300));
    let out = rig.blocks(4);
    assert_eq!(onset(&out), 300, "the note starts on its frame, across a block boundary");
}

#[test]
fn a_rebuilt_instrument_and_its_settings_reach_the_playing_strip() {
    let mut rig = Rig::new(69);
    rig.blocks(1);
    rig.graph.set_instrument(instrument(57, r#""gain_db":-6"#)).unwrap();
    rig.note(EventKind::NoteOn { note: 69, velocity: 1.0 }, None);
    let out = rig.blocks(40);
    let heard = frequency(&out[4800..]);
    assert!((heard - 880.0).abs() < 1.0, "root 57 now: note 69 is an octave up, heard {heard} Hz");
    let loud = out[4800..].iter().fold(0.0f32, |peak, sample| peak.max(sample.abs()));
    rig.graph.instruments_ref().set_param("piano", "gain_db", -60.0).unwrap();
    let quiet = rig.blocks(40)[BLOCK * 20..].iter().fold(0.0f32, |peak, sample| peak.max(sample.abs()));
    assert!(quiet < loud * 0.01, "the level follows live: {loud} → {quiet}");
}

#[test]
fn a_host_is_told_what_is_missing() {
    let mut graph = MixGraph::new(RATE);
    assert!(graph.apply(program(STRIP)).unwrap_err().contains("instrument piano is not loaded"));
    assert!(graph.set_instrument(instrument(69, "")).unwrap_err().contains("sample la is not loaded"));
    graph.instruments().load_sample("la", sine(440.0, 1.0));
    graph.set_instrument(instrument(69, "")).unwrap();
    assert!(graph.instruments_ref().event("piano", EventKind::AllNotesOff, None).unwrap_err().contains("on no strip"));
    assert!(graph.set_instrument(instrument(69, r#""mode":"chord""#)).unwrap_err().contains("mode chord"));
    graph.apply(program(STRIP)).unwrap();
    graph.apply(program(r#"{"strips":[]}"#)).unwrap();
    assert!(graph.instruments_ref().event("piano", EventKind::AllNotesOff, None).is_err(), "a strip removed drops its slot");
}

#[test]
fn zz_probe_web_spec() {
    let full = r#"{"id": "piano", "kind": "sampler", "seed": 89, "params": {"mode": "mono", "gain_db": 0, "attack_ms": 1, "decay_ms": 144, "sustain": 1, "release_ms": 233, "velocity_sense": 0.89, "tune_cents": 0, "glide_ms": 55, "polyphony": 21, "bend_range": 2}, "samples": [], "zones": [{"id": "zone_1", "keys": [0, 127], "velocities": [0, 127], "gain_db": 0, "takes": [{"sample_id": "la", "start": 0, "end": 48000, "offset": 0, "velocity_offset": 0, "root": 57, "tune_cents": 0, "gain_db": 0, "pan": 0, "playback": "forward", "loop": {"start": 4800, "end": 48000, "crossfade": 0, "ping_pong": false, "mode": "sustain", "count": 0}, "stretch": 1}, {"sample_id": "la3", "start": 0, "end": 48000, "offset": 0, "velocity_offset": 0, "root": 69, "tune_cents": 0, "gain_db": 0, "pan": 0, "playback": "forward", "loop": null, "stretch": 1}], "stack": {"kind": "alternate", "draw": "cycle"}, "cuts": [], "release_takes": [], "release_decay_s": 1, "borrow_neighbours": false}]}"#;
    let mut graph = MixGraph::new(RATE);
    graph.instruments().load_sample("la", sine(440.0, 1.0));
    graph.instruments().load_sample("la3", sine(220.0, 1.0));
    graph.set_instrument(serde_json::from_str(r#"{"id":"piano","seed":89,"params":{},"zones":[]}"#).unwrap()).unwrap();
    graph.apply(program(STRIP)).unwrap();
    let mut render = DirectRender::new(graph.effect_builder().into_effect(), RATE);
    let mut run = |count: usize| { let mut out = vec![0.0; BLOCK * 2 * count]; for chunk in out.chunks_mut(BLOCK * 2) { render.mix_interleaved(chunk, 2); } out.iter().fold(0.0f32, |p, s| p.max(s.abs())) };
    run(4);
    graph.set_instrument(serde_json::from_str(full).unwrap()).unwrap();
    run(4);
    graph.instruments_ref().event("piano", EventKind::NoteOn { note: 69, velocity: 100.0 / 127.0 }, None).unwrap();
    println!("held {}", run(160));
    graph.instruments_ref().event("piano", EventKind::NoteOff { note: 69 }, None).unwrap();
    println!("after release {}", run(60));
    println!("later {}", run(200));
}
