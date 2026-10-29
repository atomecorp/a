// Disk streaming (V1.2): a long sample keeps its heads in memory and streams
// the rest into the players' rings. Played streamed, it gives the very same
// samples as played whole — across the head → ring seam, pitched, backward,
// out of a loop — the zone a note picks sounds at its frame, and a ring the
// worker has not filled is counted as starved without ever blocking.

mod support;
use atome_dsp::{Processor, StereoBlock};
use atome_instrument::residency::HEAD_FRAMES;
use atome_instrument::stream::{self, Feeder};
use atome_instrument::{Draw, FrameSource, Keymap, LoopMode, LoopSpec, NoteEvent, Playback, SampleBank, SampleData, Sampler, Segment, Stack, Zone};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use support::{BLOCK, RATE};

const FRAMES: usize = 480_000;

// A source in memory standing for a file: `delay` per read, reads counted.
struct Memory {
    left: Vec<f32>,
    right: Vec<f32>,
    delay: Duration,
    reads: AtomicUsize,
}

impl FrameSource for Memory {
    fn frames(&self) -> usize {
        self.left.len()
    }
    fn sample_rate(&self) -> f32 {
        RATE
    }
    fn channels(&self) -> usize {
        2
    }
    fn read(&self, at: usize, left: &mut [f32], right: &mut [f32]) -> Result<(), String> {
        std::thread::sleep(self.delay);
        self.reads.fetch_add(1, Ordering::Relaxed);
        left.copy_from_slice(&self.left[at..at + left.len()]);
        right.copy_from_slice(&self.right[at..at + right.len()]);
        Ok(())
    }
}

// Deterministic noise: any frame read from the wrong place changes the output.
fn noise(seed: u64, frames: usize, offset: f32) -> Vec<f32> {
    let mut state = seed;
    (0..frames).map(|_| {
        state = state.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
        ((state >> 40) as f32 / (1u64 << 24) as f32 - 0.5) * 0.5 + offset
    }).collect()
}

fn memory(seed: u64, offset: f32, delay: Duration) -> Arc<Memory> {
    Arc::new(Memory { left: noise(seed, FRAMES, offset), right: noise(seed + 1, FRAMES, offset), delay, reads: AtomicUsize::new(0) })
}

fn whole(source: &Memory) -> SampleData {
    SampleData::stereo(source.left.clone(), source.right.clone(), RATE)
}

fn streamed(source: &Arc<Memory>) -> SampleData {
    let data = SampleData::load(source.clone()).expect("a long source streams");
    assert!(data.is_streamed());
    data
}

fn sampler(zones: Vec<Zone>, samples: Vec<SampleData>) -> Sampler {
    let mut bank = SampleBank::new();
    for sample in samples {
        bank.add(sample);
    }
    let keymap = Keymap::new(zones, &bank, 89).expect("valid keymap");
    bank.reside(&keymap).expect("spans read");
    let mut sampler = Sampler::new(keymap, bank, 34);
    sampler.prepare(RATE, BLOCK);
    sampler.set_param(atome_instrument::sampler::ATTACK_MS, 0.1);
    sampler.set_param(atome_instrument::sampler::VELOCITY_SENSE, 0.0);
    sampler
}

// Renders `frames`, applying `events` at their frame; `between` runs after each block.
fn render(sampler: &mut Sampler, frames: usize, events: &[NoteEvent], mut between: impl FnMut()) -> (Vec<f32>, Vec<f32>) {
    let (mut left, mut right) = (vec![0.0; frames], vec![0.0; frames]);
    let mut at = 0;
    while at < frames {
        let end = (at + BLOCK).min(frames);
        for event in events.iter().filter(|event| (event.offset as usize) >= at && (event.offset as usize) < end) {
            sampler.schedule(NoteEvent { offset: event.offset - at as u32, kind: event.kind });
        }
        sampler.process(&mut StereoBlock::new(&mut left[at..end], &mut right[at..end]));
        at = end;
        between();
    }
    (left, right)
}

// The same take played whole and streamed (the feeder filling after each block): identical bits.
fn same_as_whole(take: Segment, events: &[NoteEvent], frames: usize) {
    let source = memory(13, 0.0, Duration::ZERO);
    let mut reference = sampler(vec![Zone::new(0, 127, vec![take])], vec![whole(&source)]);
    let (expected_left, expected_right) = render(&mut reference, frames, events, || {});
    let mut player = sampler(vec![Zone::new(0, 127, vec![take])], vec![streamed(&source)]);
    let streams = player.streams().expect("a streamed sample gets rings").clone();
    streams.claim().expect("one feeder");
    let mut feeder = Feeder::new();
    streams.fill(&mut feeder);
    let (left, right) = render(&mut player, frames, events, || {
        streams.fill(&mut feeder);
    });
    assert_eq!(player.actions().take_starved(), 0, "the ring always kept ahead");
    assert!(source.reads.load(Ordering::Relaxed) > 0, "frames past the heads came from the source");
    let first_wrong = left.iter().zip(&expected_left).chain(right.iter().zip(&expected_right)).position(|(a, b)| a.to_bits() != b.to_bits());
    assert_eq!(first_wrong, None, "streamed = whole, frame for frame");
    assert!(expected_left[frames / 2..].iter().any(|value| value.abs() > 0.01), "still sounding past the head");
}

#[test]
fn a_streamed_sample_plays_exactly_as_the_whole_one_across_the_head_seam() {
    same_as_whole(Segment::whole(0, FRAMES, 60), &[NoteEvent::note_on(3, 60, 1.0)], 96_000);
}

#[test]
fn pitched_up_and_down_the_seam_stays_exact() {
    same_as_whole(Segment::whole(0, FRAMES, 60), &[NoteEvent::note_on(0, 67, 1.0)], 96_000);
    same_as_whole(Segment::whole(0, FRAMES, 60), &[NoteEvent::note_on(0, 84, 1.0)], 48_000);
    same_as_whole(Segment::whole(0, FRAMES, 60), &[NoteEvent::note_on(0, 53, 1.0)], 96_000);
}

#[test]
fn backward_from_an_offset_by_velocity_the_seam_stays_exact() {
    let take = Segment { playback: Playback::Reverse, offset: 5_000, velocity_offset: 8_000, ..Segment::whole(0, FRAMES, 60) };
    same_as_whole(take, &[NoteEvent::note_on(0, 60, 0.7)], 96_000);
}

#[test]
fn leaving_a_held_loop_the_rest_streams_exactly() {
    let looping = Some(LoopSpec { start: 200_000, end: 210_000, mode: LoopMode::Sustain, ping_pong: false, crossfade: 0, count: 0 });
    let take = Segment { start: 150_000, looping, ..Segment::whole(0, FRAMES, 60) };
    // Note off 1.5 s in: the loop let go, the region plays on from wherever the loop was.
    same_as_whole(take, &[NoteEvent::note_on(0, 60, 1.0), NoteEvent::note_off(72_000, 60)], 168_000);
}

#[test]
fn only_the_heads_stay_in_memory() {
    let sources: Vec<_> = (0..3).map(|seed| memory(seed, 0.0, Duration::ZERO)).collect();
    let mut bank = SampleBank::new();
    for source in &sources {
        bank.add(streamed(source));
    }
    let takes = (0..3).map(|index| Segment::whole(index, FRAMES, 60)).collect();
    let keymap = Keymap::new(vec![Zone::new(0, 127, takes)], &bank, 89).expect("valid keymap");
    assert_eq!(bank.resident_frames(), 0, "nothing read before an instrument names the samples");
    bank.reside(&keymap).expect("spans read");
    assert_eq!(bank.resident_frames(), 3 * (HEAD_FRAMES + 16), "three heads (and their taps), not 3 × {FRAMES} frames");
    let again = bank.get(0).expect("in the bank").with_spans(&[(0, HEAD_FRAMES + 16)]).expect("shared");
    assert!(Arc::ptr_eq(&again.spans()[0].frames, &bank.get(0).expect("in the bank").spans()[0].frames), "a span read once is shared");
}

#[test]
fn the_zone_a_note_picks_sounds_at_its_frame_from_its_head() {
    // Two zones, three takes in turn on the first: each told apart by its level.
    let sources: Vec<_> = [0.1, 0.2, 0.3, -0.4].iter().enumerate().map(|(seed, level)| memory(seed as u64, *level, Duration::ZERO)).collect();
    let zones = || {
        let low = Zone::new(0, 63, (0..3).map(|index| Segment::whole(index, FRAMES, 60)).collect()).stack(Stack::Alternate(Draw::Cycle));
        vec![low, Zone::new(64, 127, vec![Segment::whole(3, FRAMES, 72)])]
    };
    let onsets = [1_000u32, 6_101, 11_203, 16_007];
    let notes = [60u8, 61, 72, 62];
    let events: Vec<NoteEvent> = onsets.iter().zip(notes).map(|(at, note)| NoteEvent::note_on(*at, note, 1.0)).collect();
    let mut player = sampler(zones(), sources.iter().map(streamed).collect());
    let streams = player.streams().expect("rings").clone();
    streams.claim().expect("one feeder");
    let mut feeder = Feeder::new();
    let (left, _) = render(&mut player, 24_000, &events, || {
        streams.fill(&mut feeder);
    });
    assert_eq!(player.actions().take_starved(), 0, "every take drawn sounded from its head");
    let whole_render = |count: usize| render(&mut sampler(zones(), sources.iter().map(|source| whole(source)).collect()), 24_000, &events[..count], || {}).0;
    assert!(left.iter().zip(&whole_render(4)).all(|(a, b)| a.to_bits() == b.to_bits()), "streamed = whole");
    // What each note adds: nothing before its frame, its zone's take right after.
    let expected = [0.1, 0.2, -0.4, 0.3];
    for (index, (onset, level)) in onsets.iter().zip(expected).enumerate() {
        let (with, without) = (whole_render(index + 1), whole_render(index));
        let added: Vec<f32> = with.iter().zip(&without).map(|(a, b)| a - b).collect();
        let at = *onset as usize;
        assert!(added[..at].iter().all(|value| *value == 0.0), "note {index} adds nothing before frame {at}");
        assert!(added[at..at + 8].iter().any(|value| *value != 0.0), "note {index} sounds from frame {at}");
        let mean = added[at + 48..at + 1_048].iter().sum::<f32>() / 1_000.0;
        assert!((mean - level).abs() < 0.03, "note {index}: level {mean}, its zone's take is {level}");
    }
}

#[test]
fn an_unfilled_ring_starves_counted_and_never_blocks() {
    let source = memory(5, 0.25, Duration::ZERO);
    let mut player = sampler(vec![Zone::new(0, 127, vec![Segment::whole(0, FRAMES, 60)])], vec![streamed(&source)]);
    let streams = player.streams().expect("rings").clone();
    streams.claim().expect("one feeder");
    let started = std::time::Instant::now();
    let (left, _) = render(&mut player, 48_000, &[NoteEvent::note_on(0, 60, 1.0)], || {});
    assert!(started.elapsed() < Duration::from_secs(1), "the render never waits for the disk");
    let starved = player.actions().take_starved();
    let silent = left[HEAD_FRAMES + 64..].iter().filter(|value| **value == 0.0).count();
    assert!(starved >= 48_000 - HEAD_FRAMES - 64, "every frame past the head counted: {starved}");
    assert_eq!(silent, 48_000 - HEAD_FRAMES - 64, "past the head the starved frames are silent");
    assert!(left[..HEAD_FRAMES - 64].iter().skip(48).all(|value| value.abs() > 0.0), "the head played");
    // The feeder catches up from where the player is, and the sound comes back.
    let mut feeder = Feeder::new();
    let (left, _) = render(&mut player, 24_000, &[], || {
        streams.fill(&mut feeder);
    });
    assert!(left[BLOCK * 2..].iter().all(|value| value.abs() > 0.0), "sounding again once fed");
    assert!(player.actions().take_starved() <= BLOCK * 2, "starving stops once the ring is filled");
}

#[test]
fn the_worker_thread_keeps_up_with_a_slow_source_in_real_time() {
    let source = memory(21, 0.0, Duration::from_millis(1));
    let take = Segment::whole(0, FRAMES, 60);
    let events = [NoteEvent::note_on(0, 84, 1.0)];
    let mut reference = sampler(vec![Zone::new(0, 127, vec![take])], vec![whole(&source)]);
    let (expected, _) = render(&mut reference, 72_000, &events, || {});
    let mut player = sampler(vec![Zone::new(0, 127, vec![take])], vec![streamed(&source)]);
    stream::serve(player.streams().expect("rings")).expect("served");
    assert!(stream::serve(player.streams().expect("rings")).is_err(), "one feeder per sampler");
    let block = Duration::from_secs_f32(BLOCK as f32 / RATE);
    let (left, _) = render(&mut player, 72_000, &events, || std::thread::sleep(block));
    assert_eq!(player.actions().take_starved(), 0, "two octaves up (×4), 1 ms per read: the head covered it");
    assert!(left.iter().zip(&expected).all(|(a, b)| a.to_bits() == b.to_bits()), "streamed = whole");
    assert!(stream::take_failures().is_empty());
}
