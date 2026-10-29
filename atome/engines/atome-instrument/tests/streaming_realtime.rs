// Streaming on the render thread: no allocation while streamed notes come and
// go (composed crossfades, stretched takes, the worker thread filling beside),
// composed and stretched notes streamed = whole, and what streaming costs.

mod support;
use atome_dsp::{Processor, StereoBlock};
use atome_instrument::event::EventKind;
use atome_instrument::stream::{self, Feeder};
use atome_instrument::{Composed, Follow, FrameSource, Keymap, LoopMode, LoopSpec, Marker, MarkerSpan, NoteEvent, SampleBank, SampleData, Sampler, Segment, Stack, Step, StepDraw, Transition, Trigger, When, Zone};
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use support::*;

struct Counting;

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

const FRAMES: usize = 480_000;

struct Memory(Vec<f32>, Vec<f32>);

impl FrameSource for Memory {
    fn frames(&self) -> usize {
        self.0.len()
    }
    fn sample_rate(&self) -> f32 {
        RATE
    }
    fn channels(&self) -> usize {
        2
    }
    fn read(&self, at: usize, left: &mut [f32], right: &mut [f32]) -> Result<(), String> {
        left.copy_from_slice(&self.0[at..at + left.len()]);
        right.copy_from_slice(&self.1[at..at + right.len()]);
        Ok(())
    }
}

fn tone(root: u8) -> Arc<Memory> {
    let frequency = 440.0 * 2f32.powf((root as f32 - 69.0) / 12.0);
    let seconds = FRAMES as f32 / RATE;
    Arc::new(Memory(sine(frequency, seconds), sine(frequency * 1.01, seconds)))
}

fn sample(source: &Arc<Memory>, streamed: bool) -> SampleData {
    if streamed { SampleData::load(source.clone()).expect("streams") } else { SampleData::stereo(source.0.clone(), source.1.clone(), RATE) }
}

fn build(zones: Vec<Zone>, markers: Vec<Marker>, samples: Vec<SampleData>) -> Sampler {
    let mut bank = SampleBank::new();
    for sample in samples {
        bank.add(sample);
    }
    let keymap = Keymap::with_markers(zones, markers, &bank, 89).expect("valid keymap");
    bank.reside(&keymap).expect("spans read");
    let mut sampler = Sampler::new(keymap, bank, 34);
    sampler.prepare(RATE, BLOCK);
    sampler.set_param(atome_instrument::sampler::ATTACK_MS, 0.1);
    sampler.set_param(atome_instrument::sampler::VELOCITY_SENSE, 0.0);
    sampler.set_param(atome_instrument::sampler::POLYPHONY, 16.0);
    sampler
}

// Every 6 keys a zone of two takes mixed, looped (spliced) far past the head.
fn piano(sources: &[Arc<Memory>], streamed: bool, factor: f32) -> Sampler {
    let mut zones = Vec::new();
    for (index, root) in (36u8..=96).step_by(6).enumerate() {
        let mut take = Segment { stretch: factor, ..Segment::whole(index, FRAMES, root) };
        take.looping = Some(LoopSpec { start: 120_000, end: 168_000, mode: LoopMode::Sustain, ping_pong: false, crossfade: 2400, count: 0 });
        zones.push(Zone::new(root.saturating_sub(3), root + 2, vec![take, Segment { tune_cents: 3.0, ..take }]).stack(Stack::Mix(vec![0.89, 0.55])));
    }
    build(zones, Vec::new(), sources.iter().map(|source| sample(source, streamed)).collect())
}

// Composed notes: attack → body (looped, repeated crossfaded) → release, crossfades on two players.
fn composed(sources: &[Arc<Memory>], streamed: bool) -> Sampler {
    let mut markers = Vec::new();
    let mut zones = Vec::new();
    for (index, root) in (36u8..=96).step_by(12).enumerate() {
        let mut span = |list: &[(usize, u16, When, bool)]| {
            let first = markers.len() as u32;
            markers.extend(list.iter().map(|&(frame, label, when, reports)| marker(frame, label, when, reports)));
            MarkerSpan { first, len: list.len() as u32 }
        };
        let take = Segment::whole(index, FRAMES, root);
        let attack = Segment { markers: span(&[(2400, 0, When::EveryPass, true), (4800, 1, When::OncePerVoice, false)]), ..take };
        let mut body = Segment { start: 24_000, markers: span(&[(150_000, 2, When::Every(2), true)]), ..take };
        body.looping = Some(LoopSpec { start: 120_000, end: 168_000, mode: LoopMode::Sustain, ping_pong: false, crossfade: 2400, count: 0 });
        let release = Segment { start: 240_000, ..take };
        let steps = vec![
            Step { segments: vec![attack, Segment { tune_cents: 5.0, ..attack }], draw: StepDraw::RandomNoRepeat },
            Step { segments: vec![body], draw: StepDraw::One },
            Step { segments: vec![release, Segment { tune_cents: -5.0, ..release }], draw: StepDraw::Random },
        ];
        let transitions = vec![
            Transition { from: Some(0), trigger: Trigger::Marker(1), follow: Follow::Next, fade_ms: 13.0 },
            Transition { from: Some(1), trigger: Trigger::Passes(2), follow: Follow::Repeat, fade_ms: 5.0 },
            Transition { from: Some(1), trigger: Trigger::NoteOff, follow: Follow::Next, fade_ms: 21.0 },
            Transition { from: Some(2), trigger: Trigger::Duration { ms: 900.0 }, follow: Follow::Fade, fade_ms: 34.0 },
        ];
        zones.push(Zone::composed(root.saturating_sub(6), root + 5, Composed { steps, transitions }));
    }
    build(zones, markers, sources.iter().map(|source| sample(source, streamed)).collect())
}

fn sources(step: usize) -> Vec<Arc<Memory>> {
    (36u8..=96).step_by(step).map(tone).collect()
}

// Notes coming and going for `blocks`; `between` after each block.
fn play(sampler: &mut Sampler, blocks: u32, mut between: impl FnMut(&mut Sampler)) -> Vec<f32> {
    let (mut left, mut right) = (vec![0.0; BLOCK], vec![0.0; BLOCK]);
    let mut heard = Vec::with_capacity(blocks as usize * BLOCK);
    for block in 0..blocks {
        let note = 40 + (block * 7 % 41) as u8;
        if block % 4 == 0 {
            sampler.schedule(NoteEvent::note_on(block % BLOCK as u32, note, 0.8));
        }
        if block % 6 == 5 {
            sampler.schedule(NoteEvent::note_off(7, 40 + ((block - 5) * 7 % 41) as u8));
        }
        if block % 50 == 0 {
            sampler.schedule(NoteEvent { offset: 0, kind: EventKind::Sustain { down: block % 100 == 0 } });
        }
        WATCHING.with(|watching| watching.set(true));
        sampler.process(&mut StereoBlock::new(&mut left, &mut right));
        WATCHING.with(|watching| watching.set(false));
        heard.extend_from_slice(&left);
        between(sampler);
    }
    heard
}

// Streamed, fed after each block, against whole: identical bits, nothing starved.
fn streamed_equals_whole(whole: &mut Sampler, streamed: &mut Sampler, blocks: u32) {
    let expected = play(whole, blocks, |_| {});
    let streams = streamed.streams().expect("rings").clone();
    streams.claim().expect("one feeder");
    let mut feeder = Feeder::new();
    streams.fill(&mut feeder);
    let heard = play(streamed, blocks, |_| {
        streams.fill(&mut feeder);
    });
    assert_eq!(streamed.actions().take_starved(), 0);
    let wrong = heard.iter().zip(&expected).position(|(a, b)| a.to_bits() != b.to_bits());
    assert_eq!(wrong, None, "streamed = whole");
}

#[test]
fn composed_notes_crossfade_streamed_exactly_as_whole() {
    let sources = sources(12);
    streamed_equals_whole(&mut composed(&sources, false), &mut composed(&sources, true), 900);
}

#[test]
fn stretched_takes_prime_from_their_heads_exactly_as_whole() {
    let sources = sources(6);
    streamed_equals_whole(&mut piano(&sources, false, 1.25), &mut piano(&sources, true, 1.25), 600);
}

#[test]
fn streaming_never_allocates_on_the_render_thread() {
    for (mut sampler, label) in [(piano(&sources(6), true, 1.0), "piano"), (piano(&sources(6), true, 1.25), "stretched"), (composed(&sources(12), true), "composed")] {
        stream::serve(sampler.streams().expect("rings")).expect("served");
        ALLOCATIONS.store(0, Ordering::SeqCst);
        play(&mut sampler, 400, |_| std::thread::sleep(std::time::Duration::from_micros(500)));
        assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0, "{label}: allocations on the render thread");
        println!("{label}: {} frames starved while the render ran 10× faster than real time", sampler.actions().take_starved());
    }
}

// Thread CPU of `process` alone for 10 s of 16 held voices, fed between blocks off the clock.
fn load(sampler: &mut Sampler) -> f32 {
    let (mut left, mut right) = (vec![0.0; BLOCK], vec![0.0; BLOCK]);
    let streams = sampler.streams().cloned();
    let mut feeder = Feeder::new();
    if let Some(streams) = &streams {
        streams.claim().expect("one feeder");
        streams.fill(&mut feeder);
    }
    for (index, note) in (40u8..56).enumerate() {
        sampler.schedule(NoteEvent::note_on(index as u32, note, 0.8));
    }
    let blocks = (10.0 * RATE) as usize / BLOCK;
    let mut spent = std::time::Duration::ZERO;
    for _ in 0..blocks {
        let began = cpu_time::now();
        sampler.process(&mut StereoBlock::new(&mut left, &mut right));
        spent += cpu_time::now() - began;
        if let Some(streams) = &streams {
            streams.fill(&mut feeder);
        }
    }
    assert_eq!(sampler.sounding_voices(), 16);
    assert_eq!(sampler.actions().take_starved(), 0);
    spent.as_secs_f32() / 10.0
}

#[test]
fn sixteen_streamed_voices_cost_about_what_whole_ones_do() {
    let sources = sources(6);
    let whole = load(&mut piano(&sources, false, 1.0));
    let streamed = load(&mut piano(&sources, true, 1.0));
    println!("16 voices × 2 stereo takes: whole {:.2} %, streamed {:.2} % of one core (render thread)", whole * 100.0, streamed * 100.0);
    if !cfg!(debug_assertions) {
        assert!(streamed < 0.1, "under a tenth of a core: {streamed}");
    }
}

mod cpu_time {
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

    // CPU time of this thread alone.
    pub fn now() -> std::time::Duration {
        let mut time = Timespec { seconds: 0, nanoseconds: 0 };
        // SAFETY: writes into a local of the C layout the call expects.
        assert_eq!(unsafe { clock_gettime(THREAD_CPU_CLOCK, &mut time) }, 0, "thread CPU clock");
        std::time::Duration::new(time.seconds as u64, time.nanoseconds as u32)
    }
}
