// A note lands on its frame, at its pitch; loops hold and let go; the pedal,
// the release takes, mono and legato behave like a player expects.

mod support;
use atome_dsp::Processor;
use atome_instrument::sampler::{MODE, POLYPHONY};
use atome_instrument::{LoopMode, LoopSpec, NoteEvent, SampleData, Segment, Zone};
use atome_instrument::event::EventKind;
use support::*;

#[test]
fn a_note_starts_on_its_exact_frame() {
    let data = SampleData::mono(level(0.5, 1.0), RATE);
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![Segment::whole(0, data.frames(), 60)])], bank(vec![data]));
    let (left, _) = render(&mut sampler, 2048, &[NoteEvent::note_on(1000, 60, 1.0)]);
    assert!(left[..1000].iter().all(|value| *value == 0.0), "silent before its frame");
    assert!(left[1000].abs() > 0.0, "sounding on its frame");
    assert!((left[1100] - 0.5).abs() < 1.0e-3, "full level a few frames later: {}", left[1100]);
}

#[test]
fn a_note_plays_at_its_pitch_from_the_root() {
    let data = SampleData::mono(sine(440.0, 2.0), RATE);
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![Segment::whole(0, data.frames(), 69)])], bank(vec![data]));
    let (left, _) = render(&mut sampler, 48_000, &[NoteEvent::note_on(0, 81, 1.0)]);
    let measured = frequency(&left[4800..43_200]);
    assert!((measured - 880.0).abs() < 3.0, "an octave up: {measured} Hz");
    let mut sampler = support::sampler(vec![Zone::new(0, 127, vec![Segment::whole(0, 96_000, 69)])], bank(vec![SampleData::mono(sine(440.0, 2.0), RATE)]));
    let (left, _) = render(&mut sampler, 48_000, &[NoteEvent::note_on(0, 62, 1.0)]);
    let measured = frequency(&left[4800..43_200]);
    let expected = 440.0 * 2f32.powf(-7.0 / 12.0);
    assert!((measured - expected).abs() < 3.0, "a fifth down: {measured} Hz, {expected} expected");
}

fn looped(mode: LoopMode) -> (Segment, SampleData) {
    // 480 Hz: a period is exactly 100 frames, the loop holds 10 of them.
    let data = SampleData::mono(sine(480.0, 0.5), RATE);
    let mut segment = Segment::whole(0, data.frames(), 60);
    segment.looping = Some(LoopSpec { start: 4800, end: 5800, mode, ping_pong: false, crossfade: 0, count: 0 });
    (segment, data)
}

#[test]
fn a_continuous_loop_outlives_its_sample() {
    let (segment, data) = looped(LoopMode::Continuous);
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![segment])], bank(vec![data]));
    let (left, _) = render(&mut sampler, 96_000, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(peak(&left[90_000..96_000]) > 0.45, "still sounding after twice the sample's length");
    assert!((frequency(&left[48_000..96_000]) - 480.0).abs() < 2.0, "the seam keeps the pitch");
    let passes = sampler.pool().voices().iter().find(|voice| voice.active).unwrap().players()[0].passes();
    assert!(passes > 80, "{passes} passes");
}

#[test]
fn a_sustain_loop_lets_go_at_the_key_release_and_the_rest_plays() {
    let (segment, data) = looped(LoopMode::Sustain);
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![segment])], bank(vec![data]));
    let (left, _) = render(&mut sampler, 72_000, &[NoteEvent::note_on(0, 60, 1.0), NoteEvent::note_off(48_000, 60)]);
    assert!(peak(&left[40_000..48_000]) > 0.45, "held in its loop");
    assert!(peak(&left[48_000..50_000]) > 0.45, "the release plays the rest of the region, no fade");
    assert_eq!(sampler.sounding_voices(), 0, "the region's end frees the voice");
}

#[test]
fn the_pedal_holds_notes_until_it_lifts() {
    let data = SampleData::mono(level(0.5, 3.0), RATE);
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![Segment::whole(0, data.frames(), 60)])], bank(vec![data]));
    let events = [
        NoteEvent { offset: 0, kind: EventKind::Sustain { down: true } },
        NoteEvent::note_on(10, 60, 1.0),
        NoteEvent::note_off(4800, 60),
        NoteEvent { offset: 24_000, kind: EventKind::Sustain { down: false } },
    ];
    let (left, _) = render(&mut sampler, 48_000, &events);
    assert!(left[20_000] > 0.45, "the pedal holds the released key");
    assert!(left[40_000].abs() < 1.0e-4, "lifting the pedal releases it");
}

#[test]
fn a_release_take_sounds_at_the_key_release_quieter_after_a_long_hold() {
    let body = SampleData::mono(level(0.5, 3.0), RATE);
    let damper = SampleData::mono(level(0.5, 0.2), RATE);
    let mut zone = Zone::new(0, 127, vec![Segment::whole(0, body.frames(), 60)]);
    zone.release_takes = vec![Segment::whole(1, damper.frames(), 60)];
    zone.release_decay_s = 1.0;
    let take_level = |hold: u32| {
        let mut sampler = sampler(vec![zone.clone()], bank(vec![body.clone(), damper.clone()]));
        sampler.set_param(atome_instrument::sampler::RELEASE_MS, 1.0);
        let (left, _) = render(&mut sampler, hold as usize + 4800, &[NoteEvent::note_on(0, 60, 1.0), NoteEvent::note_off(hold, 60)]);
        left[hold as usize + 2400]
    };
    let short = take_level(4800);
    let long = take_level(96_000);
    assert!(short > 0.4, "a short hold: the damper almost full ({short})");
    assert!((long / short - (-1.9f32).exp()).abs() < 0.02, "two seconds held: e^-2 of it ({long} vs {short})");
}

#[test]
fn legato_glides_on_one_voice_and_mono_restarts() {
    let data = SampleData::mono(sine(440.0, 3.0), RATE);
    let zones = vec![Zone::new(0, 127, vec![Segment::whole(0, data.frames(), 69)])];
    let mut legato = sampler(zones.clone(), bank(vec![data.clone()]));
    legato.set_param(MODE, 2.0);
    let (left, _) = render(&mut legato, 72_000, &[NoteEvent::note_on(0, 69, 1.0), NoteEvent::note_on(24_000, 81, 1.0)]);
    assert_eq!(legato.pool().voices().iter().filter(|voice| voice.active).count(), 1, "one voice glides");
    assert!((frequency(&left[48_000..72_000]) - 880.0).abs() < 4.0, "it reached the new note");
    let mut mono = sampler(zones, bank(vec![data]));
    mono.set_param(MODE, 1.0);
    render(&mut mono, 30_000, &[NoteEvent::note_on(0, 69, 1.0), NoteEvent::note_on(24_000, 81, 1.0)]);
    assert_eq!(mono.sounding_voices(), 1, "the old note was cut, the new one restarted");
    let restarted = mono.pool().voices().iter().find(|voice| voice.active && !voice.choking).unwrap();
    assert!(restarted.players()[0].position() < 24_000.0, "the new note read its sample from the start");
}

#[test]
fn polyphony_steals_the_oldest_voice() {
    let data = SampleData::mono(level(0.2, 3.0), RATE);
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![Segment::whole(0, data.frames(), 60)])], bank(vec![data]));
    sampler.set_param(POLYPHONY, 2.0);
    let notes: Vec<NoteEvent> = (0..5).map(|i| NoteEvent::note_on(i * 1000, 60 + i as u8, 1.0)).collect();
    render(&mut sampler, 12_000, &notes);
    assert_eq!(sampler.sounding_voices(), 2);
    let notes: Vec<u8> = sampler.pool().voices().iter().filter(|voice| voice.active && !voice.choking).map(|voice| voice.note).collect();
    assert!(notes.contains(&63) && notes.contains(&64), "the newest stay: {notes:?}");
}
