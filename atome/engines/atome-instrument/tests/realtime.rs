// The render thread never allocates, and sixteen pitched stereo voices of two
// takes each (a note's crossfade) render far faster than real time.

mod support;
use atome_dsp::{Processor, StereoBlock};
use atome_instrument::event::EventKind;
use atome_instrument::{Composed, Follow, LoopMode, LoopSpec, MarkerSpan, NoteEvent, SampleData, Segment, Stack, Step, StepDraw, Transition, Trigger, When, Zone};
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::sync::atomic::{AtomicUsize, Ordering};
use support::*;

struct Counting;

// Per thread: the other test, running beside this one, builds its own instrument.
thread_local! {
    static WATCHING: Cell<bool> = const { Cell::new(false) };
}
static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if WATCHING.with(Cell::get) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        if WATCHING.with(Cell::get) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.dealloc(pointer, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: Counting = Counting;

// CPU time of this thread alone: the machine may be busy with other work, and
// wall time would count the time this thread waited for a core.
#[repr(C)]
struct Timespec {
    seconds: i64,
    nanoseconds: i64,
}

extern "C" {
    fn clock_gettime(clock: i32, time: *mut Timespec) -> i32;
}

#[cfg(target_os = "macos")]
const THREAD_CPU_CLOCK: i32 = 16;
#[cfg(not(target_os = "macos"))]
const THREAD_CPU_CLOCK: i32 = 3;

fn thread_cpu_seconds() -> f64 {
    let mut time = Timespec { seconds: 0, nanoseconds: 0 };
    // SAFETY: writes into a local of the C layout the call expects.
    let status = unsafe { clock_gettime(THREAD_CPU_CLOCK, &mut time) };
    assert_eq!(status, 0, "thread CPU clock");
    time.seconds as f64 + time.nanoseconds as f64 * 1.0e-9
}

fn stereo_sine(frequency: f32, seconds: f32) -> SampleData {
    let left = sine(frequency, seconds);
    let right = sine(frequency * 1.01, seconds);
    SampleData::stereo(left, right, RATE)
}

fn instrument() -> atome_instrument::Sampler {
    instrument_stretched(1.0)
}

// A piano-like keymap: every key has a zone of two stereo takes mixed, looped.
fn instrument_stretched(factor: f32) -> atome_instrument::Sampler {
    let mut samples = Vec::new();
    let mut zones = Vec::new();
    for (index, root) in (36u8..=96).step_by(6).enumerate() {
        samples.push(stereo_sine(440.0 * 2f32.powf((root as f32 - 69.0) / 12.0), 2.0));
        let mut take = Segment { stretch: factor, ..Segment::whole(index, 96_000, root) };
        take.looping = Some(LoopSpec { start: 24_000, end: 72_000, mode: LoopMode::Sustain, ping_pong: false, crossfade: 2400, count: 0 });
        let mut zone = Zone::new(root.saturating_sub(3), root + 2, vec![take, Segment { tune_cents: 3.0, ..take }]).stack(Stack::Mix(vec![0.89, 0.55]));
        zone.cuts = Vec::new();
        zones.push(zone);
    }
    let mut sampler = sampler(zones, bank(samples));
    sampler.set_param(atome_instrument::sampler::POLYPHONY, 16.0);
    sampler
}

// Composed notes on every key: an attack drawn from two takes leads on at its
// marker (13 ms crossfade), the body loops and repeats itself crossfaded every
// fifth pass, the key's release leads to a release drawn from two, a
// controller cuts to the release, command markers report on every pass.
fn composed_instrument(factor: f32) -> atome_instrument::Sampler {
    let mut samples = Vec::new();
    let mut markers = Vec::new();
    let mut zones = Vec::new();
    for (index, root) in (36u8..=96).step_by(12).enumerate() {
        samples.push(stereo_sine(440.0 * 2f32.powf((root as f32 - 69.0) / 12.0), 2.0));
        let span = |markers: &mut Vec<atome_instrument::Marker>, list: &[(usize, u16, When, bool)]| {
            let first = markers.len() as u32;
            markers.extend(list.iter().map(|&(frame, label, when, reports)| marker(frame, label, when, reports)));
            MarkerSpan { first, len: list.len() as u32 }
        };
        let take = Segment { stretch: factor, ..Segment::whole(index, 96_000, root) };
        let attack = Segment { markers: span(&mut markers, &[(2400, 0, When::EveryPass, true), (4800, 1, When::OncePerVoice, false)]), ..take };
        let attack_two = Segment { tune_cents: 5.0, markers: span(&mut markers, &[(3600, 1, When::Once, false)]), ..take };
        let mut body = Segment { markers: span(&mut markers, &[(30_000, 2, When::Every(2), true)]), ..take };
        body.looping = Some(LoopSpec { start: 24_000, end: 48_000, mode: LoopMode::Sustain, ping_pong: false, crossfade: 2400, count: 0 });
        let release = Segment { start: 48_000, ..take };
        let steps = vec![
            Step { segments: vec![attack, attack_two], draw: StepDraw::RandomNoRepeat },
            Step { segments: vec![body], draw: StepDraw::One },
            Step { segments: vec![release, Segment { tune_cents: -5.0, ..release }], draw: StepDraw::Random },
        ];
        let transitions = vec![
            Transition { from: Some(0), trigger: Trigger::Marker(1), follow: Follow::Next, fade_ms: 13.0 },
            Transition { from: Some(1), trigger: Trigger::Passes(5), follow: Follow::Repeat, fade_ms: 5.0 },
            Transition { from: Some(1), trigger: Trigger::NoteOff, follow: Follow::Next, fade_ms: 21.0 },
            Transition { from: None, trigger: Trigger::Controller { number: 1, above: 0.9 }, follow: Follow::Target(2), fade_ms: 8.0 },
            Transition { from: Some(2), trigger: Trigger::Duration { ms: 300.0 }, follow: Follow::Fade, fade_ms: 34.0 },
        ];
        zones.push(Zone::composed(root.saturating_sub(6), root + 5, Composed { steps, transitions }));
    }
    let mut sampler = sampler_with(zones, markers, bank(samples), 89);
    sampler.set_param(atome_instrument::sampler::POLYPHONY, 16.0);
    sampler
}

#[test]
fn rendering_never_allocates_not_even_while_notes_come_and_go() {
    for factor in [1.0, 1.25] {
        never_allocates(instrument_stretched(factor));
        let composed = never_allocates(composed_instrument(factor));
        let reported = drained(&composed).len() + composed.actions().take_dropped();
        assert!(reported > 0, "the command markers reported off the render thread");
    }
}

fn never_allocates(mut sampler: atome_instrument::Sampler) -> atome_instrument::Sampler {
    let mut left = vec![0.0; BLOCK];
    let mut right = vec![0.0; BLOCK];
    WATCHING.with(|watching| watching.set(true));
    for block in 0..400u32 {
        let note = 40 + (block % 41) as u8;
        sampler.schedule(NoteEvent::note_on(block % BLOCK as u32, note, 0.8));
        if block % 3 == 0 {
            sampler.schedule(NoteEvent::note_off(7, note.saturating_sub(5)));
        }
        if block % 50 == 0 {
            sampler.schedule(NoteEvent { offset: 0, kind: EventKind::Sustain { down: block % 100 == 0 } });
        }
        if block % 7 == 0 {
            sampler.schedule(NoteEvent { offset: 3, kind: EventKind::Controller { number: 1, value: (block % 3) as f32 * 0.5 } });
        }
        sampler.process(&mut StereoBlock::new(&mut left, &mut right));
    }
    WATCHING.with(|watching| watching.set(false));
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "allocations on the render thread");
    sampler
}

// Thread CPU share for 10 s of 16 held voices started together, and the
// costliest block of the chord's start.
fn load_of(mut sampler: atome_instrument::Sampler) -> (f32, f32) {
    let mut left = vec![0.0; BLOCK];
    let mut right = vec![0.0; BLOCK];
    for (index, note) in (40u8..56).enumerate() {
        sampler.schedule(NoteEvent::note_on(index as u32, note, 0.8));
    }
    let mut chord: f32 = 0.0;
    for _ in 0..4 {
        let began = thread_cpu_seconds();
        sampler.process(&mut StereoBlock::new(&mut left, &mut right));
        chord = chord.max((thread_cpu_seconds() - began) as f32);
    }
    assert_eq!(sampler.sounding_voices(), 16);
    assert_eq!(sampler.carried_events(), 0, "the chord started within four blocks");
    let seconds = 10.0;
    let blocks = (seconds * RATE) as usize / BLOCK;
    let began = thread_cpu_seconds();
    for _ in 0..blocks {
        sampler.process(&mut StereoBlock::new(&mut left, &mut right));
    }
    assert_eq!(sampler.sounding_voices(), 16, "the sustain loops held every voice");
    ((thread_cpu_seconds() - began) as f32 / seconds, chord)
}

#[test]
fn sixteen_stretched_voices_hold_real_time_and_a_chord_never_overruns_a_block() {
    let (load, chord) = load_of(instrument_stretched(1.25));
    let block_seconds = BLOCK as f32 / RATE;
    println!("16 stretched voices × 2 stereo takes: {:.2} % of one core; a 16-note chord's costliest block {:.2} ms (block {:.2} ms)", load * 100.0, chord * 1000.0, block_seconds * 1000.0);
    if !cfg!(debug_assertions) {
        assert!(load < 0.5, "under half a core: {load}");
        assert!(chord < block_seconds, "no block of the chord overruns: {chord}");
    }
}

#[test]
fn sixteen_voices_of_two_takes_render_well_ahead_of_real_time() {
    let mut sampler = instrument();
    let mut left = vec![0.0; BLOCK];
    let mut right = vec![0.0; BLOCK];
    for (index, note) in (40u8..56).enumerate() {
        sampler.schedule(NoteEvent::note_on(index as u32, note, 0.8));
    }
    sampler.process(&mut StereoBlock::new(&mut left, &mut right));
    assert_eq!(sampler.sounding_voices(), 16);
    let seconds = 10.0;
    let blocks = (seconds * RATE) as usize / BLOCK;
    let began = thread_cpu_seconds();
    for _ in 0..blocks {
        sampler.process(&mut StereoBlock::new(&mut left, &mut right));
    }
    let spent = (thread_cpu_seconds() - began) as f32;
    let load = spent / seconds;
    println!("16 voices × 2 stereo takes, pitched, spliced loops: {:.2} % of one core ({spent:.3} s for {seconds} s)", load * 100.0);
    assert_eq!(sampler.sounding_voices(), 16, "the sustain loops held every voice");
    if !cfg!(debug_assertions) {
        assert!(load < 0.1, "under a tenth of a core: {load}");
    }
}
