// Duration apart from pitch: a stretched take lasts its factor, keeps its
// pitch, follows the note, and starts on the note's frame — the stretcher's
// window is primed, never heard.

mod support;
use atome_instrument::{NoteEvent, SampleData, Segment, Zone};
use support::*;

fn stretched(seconds: f32, factor: f32) -> (Zone, SampleData) {
    let data = SampleData::mono(sine(440.0, seconds), RATE);
    let take = Segment { stretch: factor, ..Segment::whole(0, data.frames(), 69) };
    (Zone::new(0, 127, vec![take]), data)
}

fn loud(signal: &[f32]) -> bool {
    peak(signal) > 0.25
}

#[test]
fn a_stretched_take_lasts_its_factor_at_its_own_pitch() {
    let (zone, data) = stretched(0.5, 2.0);
    let mut sampler = sampler(vec![zone], bank(vec![data]));
    let (left, _) = render(&mut sampler, 72_000, &[NoteEvent::note_on(0, 69, 1.0)]);
    assert!(loud(&left[40_000..44_000]), "still sounding at 0.9 s (twice its 0.5 s)");
    assert!(!loud(&left[52_000..56_000]), "over shortly after 1 s");
    let measured = frequency(&left[4_800..43_200]);
    assert!((measured - 440.0).abs() < 3.0, "the stretch keeps the pitch: {measured} Hz");
}

#[test]
fn a_stretched_take_follows_the_note() {
    let (zone, data) = stretched(1.0, 1.5);
    let mut sampler = sampler(vec![zone], bank(vec![data]));
    let (left, _) = render(&mut sampler, 48_000, &[NoteEvent::note_on(0, 81, 1.0)]);
    let measured = frequency(&left[4_800..43_200]);
    assert!((measured - 880.0).abs() < 1.0, "an octave up, the reader's exact pitch: {measured} Hz");
    let (left, _) = render(&mut sampler, 96_000, &[NoteEvent::note_on(0, 81, 1.0)]);
    assert!(loud(&left[64_000..68_000]), "still sounding at 1.4 s: the octave keeps the 1.5 s");
    assert!(!loud(&left[80_000..84_000]), "over shortly after 1.5 s");
}

#[test]
fn a_chord_past_the_priming_budget_starts_on_the_next_block() {
    let (zone, data) = stretched(1.0, 1.25);
    let mut sampler = sampler(vec![zone], bank(vec![data]));
    let budget = atome_instrument::sampler::priming_budget(RATE, BLOCK);
    assert_eq!(budget, 5, "a 256-frame block at 48 kHz lasts 5.33 ms");
    let chord: Vec<NoteEvent> = (0..budget as u8 + 2).map(|index| NoteEvent::note_on(0, 60 + index, 1.0)).collect();
    let (left, _) = render(&mut sampler, BLOCK, &chord);
    assert_eq!(sampler.sounding_voices(), budget, "the block primed its budget");
    assert!(loud(&left), "and those sound on their frame");
    assert_eq!(sampler.carried_events(), 2);
    render(&mut sampler, BLOCK, &[]);
    assert_eq!(sampler.sounding_voices(), budget + 2, "the rest started at the next block");
}

#[test]
fn a_stretched_note_sounds_on_its_frame_not_a_window_later() {
    let (zone, data) = stretched(1.0, 1.25);
    let mut sampler = sampler(vec![zone], bank(vec![data]));
    let (left, _) = render(&mut sampler, 9_600, &[NoteEvent::note_on(1_000, 69, 1.0)]);
    assert!(left[..1_000].iter().all(|value| *value == 0.0), "silent before its frame");
    assert!(loud(&left[1_000..1_240]), "sounding within 5 ms of its frame (the window is 42.7 ms)");
}
