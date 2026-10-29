// The render thread never allocates (D28): a counting allocator watches
// every block of a graph that uses splits, keys, a loop and long tails, and
// the swap to a new graph.

use atome_mix_graph::{MixGraph, Program, StripCapture};
use kira::effect::Effect;
use kira::info::MockInfoBuilder;
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

const PROGRAM: &str = r#"{"strips":[
    {"id":"guitar","chain":[
        {"id":"amp_eq","type":"dsp","effect":"bell","params":{"gain_db":6}},
        {"id":"split","type":"dsp","effect":"bands_3","outputs":[{"port":2,"target":{"kind":"strip","id":"air"}}]},
        {"id":"room","type":"dsp","effect":"reverb","params":{"decay_s":3}},
        {"id":"echo","type":"dsp","effect":"echo"},
        {"id":"send","type":"send","params":{"level_db":-9},"target":{"kind":"strip","id":"air"}}],"output":{"kind":"main"}},
    {"id":"air","chain":[
        {"id":"duck","type":"dsp","effect":"ducker","key":{"kind":"strip","id":"voice"}},
        {"id":"back","type":"send","params":{"level_db":-12},"target":{"kind":"strip","id":"guitar"}}],"output":{"kind":"main"}},
    {"id":"voice","chain":[{"id":"gate","type":"dsp","effect":"gate","key":{"kind":"port","module_id":"split","port":0}}],"output":{"kind":"main"}}]}"#;

#[test]
fn rendering_never_allocates_not_even_across_a_swap() {
    let mut graph = MixGraph::new(48_000);
    let program: Program = serde_json::from_str(PROGRAM).unwrap();
    let mut captures: Vec<StripCapture> = program.strips.iter().map(|strip| StripCapture::new(graph.capture_slot(&strip.id))).collect();
    graph.apply(program.clone()).unwrap();
    let mut effect = graph.effect_builder().into_effect();
    effect.init(48_000, 128);
    let info = MockInfoBuilder::new().build();
    let mut input = vec![Frame::new(0.25, -0.25); 512];
    let mut out = vec![Frame::ZERO; 512];
    let mut render = |effect: &mut atome_mix_graph::MixGraphEffect, captures: &mut [StripCapture]| {
        for capture in captures.iter_mut() {
            input.fill(Frame::new(0.25, -0.25));
            capture.process(&mut input, 1.0 / 48_000.0, &info);
        }
        out.fill(Frame::ZERO);
        effect.render(&mut out);
    };
    render(&mut effect, &mut captures);
    WATCHING.store(true, Ordering::SeqCst);
    for _ in 0..200 {
        render(&mut effect, &mut captures);
    }
    WATCHING.store(false, Ordering::SeqCst);
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "blocks allocated");
    // An edit: the render thread swaps graphs and adopts the modules.
    let mut edited = program;
    edited.strips[0].chain[2].params.insert("decay_s".into(), atome_mix_graph::program::serde_json_value::Value::Number(5.0));
    edited.strips[0].chain.remove(3);
    graph.apply(edited).unwrap();
    WATCHING.store(true, Ordering::SeqCst);
    for _ in 0..20 {
        render(&mut effect, &mut captures);
    }
    WATCHING.store(false, Ordering::SeqCst);
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "the swap allocated");
    assert!(out.iter().all(|frame| frame.left.is_finite() && frame.right.is_finite()));
}
