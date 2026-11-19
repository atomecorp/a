// R-191: the render thread never allocates with the new capabilities either —
// modulation at the frame (forward, backward through a control ring, onto a
// filter, a send and a volume), automation on control steps, a 4× oversampled
// module, eight mono strips into an eight-channel bus out to physical outputs,
// and a synth instrument whose voices come, steal and end — at block sizes
// that cut every control step. (Its own test binary: the allocator is global.)

#![allow(
    unsafe_code,
    reason = "a counting global allocator proves the render thread never allocates"
)]

use atome_mix_graph::{EventKind, InstrumentSpec, MixGraph, Program, StripCapture};
use kira::Frame;
use kira::effect::Effect;
use kira::info::MockInfoBuilder;
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

const SYNTH: &str = r#"{"id":"syn","params":{"polyphony":3},"synth":{
    "bricks":[{"id":"lfo","kind":"lfo","params":{"rate_hz":5}},
              {"id":"o1","kind":"oscillator"},{"id":"o2","kind":"oscillator","params":{"waveform":2,"detune_cents":7}},
              {"id":"n","kind":"noise","params":{"color":1}},
              {"id":"fe","kind":"envelope","params":{"release_ms":34}},
              {"id":"f","kind":"svf","params":{"cutoff_hz":610,"resonance":3}},
              {"id":"ae","kind":"envelope","params":{"release_ms":21}},
              {"id":"v","kind":"vca"}],
    "routes":[{"from":"lfo","to":"o1","input":"pitch","depth":0.3},{"from":"o1","to":"o2","input":"fm","depth":0.2},
              {"from":"o1","to":"f","input":"audio","depth":1},{"from":"o2","to":"f","input":"audio","depth":1},
              {"from":"n","to":"f","input":"audio","depth":0.1},{"from":"fe","to":"f","input":"cutoff","depth":3},
              {"from":"lfo","to":"f","input":"resonance","depth":1},
              {"from":"f","to":"v","input":"audio","depth":1},{"from":"ae","to":"v","input":"gain","depth":1}],
    "output":"v"}}"#;

fn program() -> String {
    let mut strips: Vec<String> = (0..8)
        .map(|k| {
            format!(
                r#"{{"id":"m{k}","channels":1,"chain":[{{"id":"l{k}","type":"dsp","effect":"lfo","params":{{"rate_hz":{}}},
                    "modulations":[{{"module_id":"v{k}","param":"gain_db","depth":6}}]}},{{"id":"v{k}","type":"volume","params":{{"gain_db":-6}}}}],
                    "output":{{"kind":"strip","id":"bus","channels":[{k}]}}}}"#,
                k + 1
            )
        })
        .collect();
    strips.push(
        r#"{"id":"bus","channels":8,"transport":"t","chain":[
            {"id":"bv","type":"volume","params":{"gain_db":-3},"automation":[{"param":"gain_db","points":[{"at":0,"value":-24},{"at":0.5,"value":0,"curve":"smooth"},{"at":1,"value":-6,"curve":"hold"}]}]},
            {"id":"room","type":"dsp","effect":"reverb"}],
           "output":{"kind":"outputs","channels":[0,1,2,3,4,5,6,7]}}"#
            .into(),
    );
    strips.push(
        r#"{"id":"keys","input":{"kind":"instrument","instrument_id":"syn"},"chain":[
            {"id":"vol","type":"volume","params":{"gain_db":-6}},
            {"id":"follow","type":"dsp","effect":"follower","modulations":[{"module_id":"vol","param":"gain_db","depth":-9},{"module_id":"cut","param":"cutoff_hz","depth":1}]},
            {"id":"cut","type":"dsp","effect":"svf"},
            {"id":"clip","type":"dsp","effect":"soft_clip","oversample":4},
            {"id":"s","type":"send","params":{"level_db":-9},"target":{"kind":"strip","id":"bus","channels":[0,1]}}],
           "output":{"kind":"main"}}"#
            .into(),
    );
    format!(
        r#"{{"transports":[{{"id":"t","epoch":1,"playing":true,"seconds":0}}],"strips":[{}]}}"#,
        strips.join(",")
    )
}

#[test]
fn the_new_capabilities_render_without_allocating() {
    let mut graph = MixGraph::new(48_000);
    graph.aux_outputs().configure(3, 4096);
    graph
        .set_instrument(serde_json::from_str::<InstrumentSpec>(SYNTH).unwrap())
        .unwrap();
    let program: Program = serde_json::from_str(&program()).unwrap();
    let mut captures: Vec<StripCapture> = program
        .strips
        .iter()
        .map(|strip| StripCapture::new(graph.capture_slot(&strip.id)))
        .collect();
    graph.apply(program).unwrap();
    let mut effect = graph.effect_builder().into_effect();
    effect.init(48_000, 512);
    let info = MockInfoBuilder::new().build();
    let mut input = vec![Frame::ZERO; 512];
    let mut out = vec![Frame::ZERO; 512];
    let mut pair = vec![Frame::ZERO; 512];
    let aux = graph.aux_outputs();
    let mut render = |effect: &mut atome_mix_graph::MixGraphEffect, length: usize| {
        for capture in captures.iter_mut() {
            input[..length].fill(Frame::new(0.25, -0.25));
            capture.process(&mut input[..length], 1.0 / 48_000.0, &info);
        }
        out[..length].fill(Frame::ZERO);
        effect.render(&mut out[..length]);
        for index in 1..4 {
            aux.drain_pair(index, &mut pair[..length]);
        }
    };
    render(&mut effect, 128);
    WATCHING.store(true, Ordering::SeqCst);
    for block in 0..400u32 {
        let instruments = graph.instruments_ref();
        let note = 40 + (block % 24) as u8;
        instruments
            .event(
                "syn",
                EventKind::NoteOn {
                    note,
                    velocity: 0.7,
                },
                None,
            )
            .unwrap();
        if block % 2 == 0 {
            instruments
                .event(
                    "syn",
                    EventKind::NoteOff {
                        note: note.saturating_sub(3),
                    },
                    None,
                )
                .unwrap();
        }
        if block % 40 == 0 {
            instruments
                .set_param("syn", "gain_db", -3.0 - (block % 7) as f32)
                .unwrap();
        }
        render(&mut effect, [17, 333, 128, 500, 31][block as usize % 5]);
    }
    WATCHING.store(false, Ordering::SeqCst);
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "blocks allocated");
    assert!(
        out.iter()
            .all(|frame| frame.left.is_finite() && frame.right.is_finite())
    );
}
