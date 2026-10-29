// An instrument strip never allocates on the render thread either: notes
// coming and going, the sustain pedal, a rebuilt sampler taken over, a live
// setting, and a composed note crossing its markers, crossfading its steps
// and reporting its command markers. (Its own test binary: the counting
// allocator is global.)

use atome_mix_graph::{EventKind, InstrumentSpec, MixGraph, Program, SampleData};
use kira::effect::Effect;
use kira::Frame;
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

struct Counting;

static WATCHING: AtomicBool = AtomicBool::new(false);
static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if WATCHING.load(Ordering::Relaxed) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        if WATCHING.load(Ordering::Relaxed) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.dealloc(pointer, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: Counting = Counting;

const INSTRUMENT: &str = r#"{"id":"kit","params":{"polyphony":8},"zones":[{"id":"zone_1","keys":[0,127],"velocities":[0,127],"gain_db":0,
    "takes":[{"sample_id":"tone","start":0,"end":24000,"offset":0,"velocity_offset":0,"root":60,"tune_cents":0,"gain_db":0,"pan":0,
    "playback":"forward","loop":{"start":2400,"end":24000,"mode":"sustain","ping_pong":false,"crossfade":480,"count":0},"stretch":1}],
    "stack":{"kind":"alternate","draw":"random_no_repeat"},"cuts":[],"release_takes":[],"release_decay_s":1,"borrow_neighbours":false}]}"#;

#[test]
fn an_instrument_strip_never_allocates_while_it_plays() {
    let mut graph = MixGraph::new(48_000);
    let tone: Vec<f32> = (0..24_000).map(|index| (index as f32 * 0.05).sin() * 0.2).collect();
    graph.instruments().load_sample("tone", SampleData::mono(tone, 44_100.0));
    graph.set_instrument(serde_json::from_str::<InstrumentSpec>(INSTRUMENT).unwrap()).unwrap();
    let program: Program = serde_json::from_str(r#"{"strips":[{"id":"keys","input":{"kind":"instrument","instrument_id":"kit"},"output":{"kind":"main"}}]}"#).unwrap();
    graph.apply(program).unwrap();
    let mut effect = graph.effect_builder().into_effect();
    effect.init(48_000, 128);
    let mut out = vec![Frame::ZERO; 256];
    let render = |effect: &mut atome_mix_graph::MixGraphEffect, out: &mut [Frame]| {
        out.fill(Frame::ZERO);
        effect.render(out);
    };
    render(&mut effect, &mut out);
    WATCHING.store(true, Ordering::SeqCst);
    for block in 0..400u32 {
        let instruments = graph.instruments_ref();
        let note = 36 + (block % 48) as u8;
        instruments.event("kit", EventKind::NoteOn { note, velocity: 0.8 }, None).unwrap();
        if block % 3 == 0 {
            instruments.event("kit", EventKind::NoteOff { note: note.saturating_sub(5) }, None).unwrap();
        }
        if block % 50 == 0 {
            instruments.event("kit", EventKind::Sustain { down: block % 100 == 0 }, None).unwrap();
            instruments.set_param("kit", "release_ms", 21.0 + block as f32).unwrap();
        }
        render(&mut effect, &mut out);
    }
    WATCHING.store(false, Ordering::SeqCst);
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "blocks allocated");
    graph.set_instrument(serde_json::from_str::<InstrumentSpec>(&INSTRUMENT.replace(r#""root":60"#, r#""root":48"#)).unwrap()).unwrap();
    WATCHING.store(true, Ordering::SeqCst);
    for _ in 0..20 {
        graph.instruments_ref().event("kit", EventKind::NoteOn { note: 60, velocity: 1.0 }, None).unwrap();
        render(&mut effect, &mut out);
    }
    WATCHING.store(false, Ordering::SeqCst);
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "taking the rebuilt sampler allocated");
    assert!(out.iter().any(|frame| frame.left.abs() > 1.0e-3), "the instrument sounds");
    graph.set_instrument(serde_json::from_str::<InstrumentSpec>(&composed()).unwrap()).unwrap();
    WATCHING.store(true, Ordering::SeqCst);
    for block in 0..400u32 {
        let instruments = graph.instruments_ref();
        let note = 36 + (block % 48) as u8;
        instruments.event("kit", EventKind::NoteOn { note, velocity: 0.8 }, None).unwrap();
        if block % 3 == 0 {
            instruments.event("kit", EventKind::NoteOff { note: note.saturating_sub(2) }, None).unwrap();
        }
        if block % 7 == 0 {
            instruments.event("kit", EventKind::Controller { number: 1, value: (block % 3) as f32 * 0.5 }, None).unwrap();
        }
        render(&mut effect, &mut out);
    }
    WATCHING.store(false, Ordering::SeqCst);
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "a composed note allocated");
    let drained = graph.instruments_ref().drain_actions("kit").unwrap();
    assert!(!drained.actions.is_empty(), "its command markers were reported");
    assert!(drained.actions.iter().all(|fired| fired.marker.command.as_deref() == Some("timeline.play")));
}

// Attack → (marker m1, 8 ms) → body held in a sustain loop, repeated every third
// pass → (key up, 21 ms) → release; a controller above 0.9 cuts to the release.
fn composed() -> String {
    let segment = |start: usize, markers: &str, looping: &str| format!(r#"{{"sample_id":"tone","start":{start},"end":24000,"offset":0,"velocity_offset":0,"root":60,
        "tune_cents":0,"gain_db":0,"pan":0,"playback":"forward","loop":{looping},"stretch":1,"markers":[{markers}]}}"#);
    let action = r#"{"id":"go","frame":600,"kind":"action","when":{"kind":"every_pass"},"action":{"command":"timeline.play","input":{}}}"#;
    let attack = segment(0, &format!(r#"{action},{{"id":"m1","frame":1200,"kind":"slice","when":{{"kind":"once_per_voice"}}}}"#), "null");
    let attack_two = segment(240, r#"{"id":"m1","frame":1800,"kind":"slice","when":{"kind":"every_pass"}}"#, "null");
    let body = segment(0, r#"{"id":"go","frame":3000,"kind":"action","when":{"kind":"every_n","n":2},"action":{"command":"timeline.play","input":{}}}"#,
        r#"{"start":2400,"end":4800,"mode":"sustain","ping_pong":false,"crossfade":240,"count":0}"#);
    let release = segment(12000, "", "null");
    format!(r#"{{"id":"kit","params":{{"polyphony":8}},"zones":[{{"id":"zone_1","keys":[0,127],"velocities":[0,127],"gain_db":0,"takes":[],
        "stack":{{"kind":"alternate","draw":"cycle"}},"cuts":[],"release_takes":[],"release_decay_s":1,"borrow_neighbours":false,"composed":{{
        "steps":[{{"id":"attack","draw":"random_no_repeat","segments":[{attack},{attack_two}]}},{{"id":"body","draw":"one","segments":[{body}]}},
            {{"id":"release","draw":"random","segments":[{release},{release}]}}],
        "transitions":[{{"from":"attack","trigger":{{"kind":"marker","marker_id":"m1"}},"follow":{{"type":"next"}},"fade_ms":8}},
            {{"from":"body","trigger":{{"kind":"passes","count":3}},"follow":{{"type":"repeat"}},"fade_ms":5}},
            {{"from":"body","trigger":{{"kind":"note_off"}},"follow":{{"type":"next"}},"fade_ms":21}},
            {{"from":null,"trigger":{{"kind":"controller","number":1,"above":0.9}},"follow":{{"type":"target","target_step":"release"}},"fade_ms":8}}]}}}}]}}"#)
}
