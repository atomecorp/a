// How a segment is read: backward, back and forth, a set number of passes,
// and a seam spliced so a loop of any length plays without a click.

mod support;
use atome_instrument::{LoopMode, LoopSpec, NoteEvent, Playback, SampleData, Segment, Zone};
use support::*;

fn ramp(frames: usize) -> Vec<f32> {
    (0..frames).map(|i| i as f32 / frames as f32).collect()
}

fn largest_step(signal: &[f32]) -> f32 {
    signal.windows(2).fold(0.0f32, |largest, pair| largest.max((pair[1] - pair[0]).abs()))
}

#[test]
fn a_reversed_segment_reads_from_its_end() {
    let data = SampleData::mono(ramp(4800), RATE);
    let mut segment = Segment::whole(0, 4800, 60);
    segment.playback = Playback::Reverse;
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![segment])], bank(vec![data]));
    let (left, _) = render(&mut sampler, 4800, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(left[100] > 0.9 && left[2400] < 0.6 && left[2400] > 0.4, "{} then {}", left[100], left[2400]);
    assert!(left[100..4700].windows(2).all(|pair| pair[1] <= pair[0] + 1.0e-4), "it only falls");
}

#[test]
fn a_back_and_forth_loop_turns_at_both_ends() {
    let data = SampleData::mono(ramp(9600), RATE);
    let mut segment = Segment::whole(0, 9600, 60);
    segment.looping = Some(LoopSpec { start: 2400, end: 4800, mode: LoopMode::Continuous, ping_pong: true, crossfade: 0, count: 0 });
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![segment])], bank(vec![data]));
    let (left, _) = render(&mut sampler, 24_000, &[NoteEvent::note_on(0, 60, 1.0)]);
    let held = &left[4800..24_000];
    assert!(held.iter().all(|value| *value > 0.24 && *value < 0.51), "stays inside the loop");
    let rising = held.windows(2).filter(|pair| pair[1] > pair[0]).count();
    let falling = held.windows(2).filter(|pair| pair[1] < pair[0]).count();
    assert!(rising > 8000 && falling > 8000, "goes both ways: {rising} up, {falling} down");
}

#[test]
fn a_counted_loop_lets_go_after_its_passes() {
    let data = SampleData::mono(level(0.5, 0.5), RATE);
    let mut segment = Segment::whole(0, data.frames(), 60);
    segment.looping = Some(LoopSpec { start: 4800, end: 9600, mode: LoopMode::Continuous, ping_pong: false, crossfade: 0, count: 3 });
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![segment])], bank(vec![data]));
    // 9600 to reach the loop's end, then 2 more passes of 4800, then the 14400 left.
    let (left, _) = render(&mut sampler, 48_000, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(left[33_000] > 0.45, "still playing after its passes");
    assert!(left[40_000].abs() < 1.0e-4, "ended at the region's end");
    assert_eq!(sampler.sounding_voices(), 0);
}

#[test]
fn a_spliced_seam_plays_a_loop_of_any_length_without_a_click() {
    // 441 Hz: the loop length (4321 frames) is not a whole number of periods.
    let data = SampleData::mono(sine(441.0, 1.0), RATE);
    let smooth = largest_step(&sine(441.0, 0.1));
    let seam = |crossfade: usize| {
        let mut segment = Segment::whole(0, data.frames(), 60);
        segment.looping = Some(LoopSpec { start: 9600, end: 9600 + 4321, mode: LoopMode::Continuous, ping_pong: false, crossfade, count: 0 });
        let mut sampler = sampler(vec![Zone::new(0, 127, vec![segment])], bank(vec![data.clone()]));
        let (left, _) = render(&mut sampler, 96_000, &[NoteEvent::note_on(0, 60, 1.0)]);
        largest_step(&left[14_000..96_000])
    };
    assert!(seam(0) > smooth * 3.0, "a bare seam clicks ({} vs {smooth})", seam(0));
    assert!(seam(1200) < smooth * 1.2, "the splice is smooth ({} vs {smooth})", seam(1200));
}

// One frame space on every platform: a sample's positions count its own file's
// frames at its own rate; the engine (48 kHz here) resamples at play.
#[test]
fn a_sample_at_its_own_rate_plays_its_pitch_and_its_positions() {
    let source = 44_100.0;
    let tone: Vec<f32> = (0..88_200).map(|i| (std::f32::consts::TAU * 441.0 * i as f32 / source).sin()).collect();
    let data = SampleData::mono(tone, source);
    let mut played = sampler(vec![Zone::new(0, 127, vec![Segment::whole(0, data.frames(), 60)])], bank(vec![data]));
    let (left, _) = render(&mut played, 48_000, &[NoteEvent::note_on(0, 60, 1.0)]);
    let measured = frequency(&left[4800..43_200]);
    assert!((measured - 441.0).abs() < 2.0, "at its root, its own pitch: {measured} Hz");
    // An offset of 22 050 source frames is half a second into the file, whatever the output rate.
    let data = SampleData::mono(ramp(44_100), source);
    let mut segment = Segment::whole(0, 44_100, 60);
    segment.offset = 22_050;
    let mut played = sampler(vec![Zone::new(0, 127, vec![segment])], bank(vec![data]));
    let (left, _) = render(&mut played, 24_000, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!((left[480] - (22_050.0 + 480.0 * source / RATE) / 44_100.0).abs() < 1.0e-3, "read from the file's half: {}", left[480]);
}
