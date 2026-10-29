// S5 routing never allocates on the render thread: an instrument's two
// outputs on two strips, an IN mixing one of them into a third strip, a
// microphone read by a strip and an IN, and a loop closed through an IN.
// (Its own test binary: the counting allocator is global.)

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

fn zone(id: &str, keys: [u8; 2], output: u8) -> String {
    format!(r#"{{"id":"{id}","keys":[{},{}],"velocities":[0,127],"gain_db":0,"output":{output},
        "takes":[{{"sample_id":"tone","start":0,"end":24000,"offset":0,"velocity_offset":0,"root":60,"tune_cents":0,"gain_db":0,"pan":0,
        "playback":"forward","loop":{{"start":2400,"end":24000,"mode":"sustain","ping_pong":false,"crossfade":480,"count":0}},"stretch":1}}],
        "stack":{{"kind":"alternate","draw":"cycle"}},"cuts":[],"release_takes":[],"release_decay_s":1,"borrow_neighbours":false}}"#, keys[0], keys[1])
}

const PROGRAM: &str = r#"{"strips":[
    {"id":"drums","input":{"kind":"instrument","instrument_id":"kit","output":0},"output":{"kind":"main"}},
    {"id":"hats","input":{"kind":"instrument","instrument_id":"kit","output":1},"output":{"kind":"main"}},
    {"id":"mic","input":{"kind":"live_audio","device_id":"mic"},"output":{"kind":"main"}},
    {"id":"mix","input":{"kind":"live_audio","device_id":"mic"},
     "chain":[{"id":"in_kit","type":"input","params":{"mix_db":-6},"source":{"kind":"instrument","instrument_id":"kit","output":1}},
              {"id":"in_loop","type":"input","params":{"mix_db":-12},"source":{"kind":"strip","id":"mix"}},
              {"id":"in_drums","type":"input","params":{"mix_db":-3},"source":{"kind":"strip","id":"drums"}}],
     "output":{"kind":"main"}}]}"#;

#[test]
fn outputs_and_in_modules_never_allocate() {
    let mut graph = MixGraph::new(48_000);
    let tone: Vec<f32> = (0..24_000).map(|index| (index as f32 * 0.05).sin() * 0.2).collect();
    graph.instruments().load_sample("tone", SampleData::mono(tone, 48_000.0));
    let kit = format!(r#"{{"id":"kit","outputs":2,"params":{{"polyphony":8}},"zones":[{},{}]}}"#, zone("low", [0, 59], 0), zone("high", [60, 127], 1));
    graph.set_instrument(serde_json::from_str::<InstrumentSpec>(&kit).unwrap()).unwrap();
    graph.apply(serde_json::from_str::<Program>(PROGRAM).unwrap()).unwrap();
    let mic = graph.live_inputs().pop().unwrap().1;
    let mut effect = graph.effect_builder().into_effect();
    effect.init(48_000, 256);
    let mut out = vec![Frame::ZERO; 256];
    let voice = vec![Frame::new(0.1, 0.1); 256];
    effect.render(&mut out);
    WATCHING.store(true, Ordering::SeqCst);
    for block in 0..400u32 {
        let note = 36 + (block % 48) as u8;
        graph.instruments_ref().event("kit", EventKind::NoteOn { note, velocity: 0.8 }, None).unwrap();
        if block % 3 == 0 {
            graph.instruments_ref().event("kit", EventKind::NoteOff { note: note.saturating_sub(5) }, None).unwrap();
        }
        mic.push(&voice);
        out.fill(Frame::ZERO);
        effect.render(&mut out);
    }
    WATCHING.store(false, Ordering::SeqCst);
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "blocks allocated");
    assert!(out.iter().any(|frame| frame.left.abs() > 1.0e-3), "it sounds");
    assert!(out.iter().all(|frame| frame.left.is_finite()), "the loop through IN stays bounded");
}
