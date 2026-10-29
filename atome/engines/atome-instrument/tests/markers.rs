// Markers stuck to the sound: crossed forward or backward they fire, a note's
// start on or past them never does; markers on one frame fire by creation;
// « When » counts the crossings of a note, « once » those of the instrument;
// a loop's wrap crosses its loop start, never its end. Command markers reach
// the host through the action queue.

mod support;
use atome_dsp::Processor;
use atome_instrument::{LoopMode, LoopSpec, NoteEvent, Playback, SampleData, Segment, When, Zone};
use support::*;

fn one_marker(segment: Segment, frame: usize) -> atome_instrument::Sampler {
    let data = SampleData::mono(level(0.5, 1.0), RATE);
    sampler_with(vec![Zone::new(0, 127, vec![segment])], vec![marker(frame, 0, When::EveryPass, true)], bank(vec![data]), 89)
}

#[test]
fn a_marker_fires_when_crossed_forward_and_backward() {
    let mut forward = one_marker(marked(0, 48_000, 0, 1), 12_000);
    render(&mut forward, 24_000, &[NoteEvent::note_on(0, 60, 1.0)]);
    let fired = drained(&forward);
    assert_eq!(fired.len(), 1);
    assert_eq!((fired[0].marker, fired[0].frame, fired[0].count, fired[0].note), (0, 12_000, 1, 60), "the first frame read past it");
    let mut backward = one_marker(Segment { playback: Playback::Reverse, ..marked(0, 48_000, 0, 1) }, 12_000);
    render(&mut backward, 48_000, &[NoteEvent::note_on(0, 60, 1.0)]);
    let fired = drained(&backward);
    assert_eq!(fired.len(), 1, "crossed once, reading backward");
    assert_eq!(fired[0].frame, 36_000, "47 999 down to 12 000 is 36 000 frames");
}

#[test]
fn a_note_starting_on_or_past_a_marker_never_fires_it() {
    for offset in [12_000, 24_000] {
        let mut sampler = one_marker(Segment { offset, ..marked(0, 48_000, 0, 1) }, 12_000);
        render(&mut sampler, 24_000, &[NoteEvent::note_on(0, 60, 1.0)]);
        assert!(drained(&sampler).is_empty(), "a start at {offset} is a jump, not a crossing");
    }
}

#[test]
fn markers_on_one_frame_fire_in_creation_order_in_either_direction() {
    let data = SampleData::mono(level(0.5, 1.0), RATE);
    // Table order is frame, then creation: two on 1000 (created 5 then 3), one on 2000.
    let markers = vec![marker(1000, 5, When::EveryPass, true), marker(1000, 3, When::EveryPass, true), marker(2000, 1, When::EveryPass, true)];
    let play = |playback| {
        let segment = Segment { playback, ..marked(0, 3000, 0, 3) };
        let mut sampler = sampler_with(vec![Zone::new(0, 127, vec![segment])], markers.clone(), bank(vec![data.clone()]), 89);
        render(&mut sampler, 4000, &[NoteEvent::note_on(0, 60, 1.0)]);
        drained(&sampler).iter().map(|fired| fired.marker).collect::<Vec<_>>()
    };
    assert_eq!(play(Playback::Forward), vec![0, 1, 2]);
    assert_eq!(play(Playback::Reverse), vec![2, 0, 1], "by position as met, then by creation");
}

#[test]
fn when_counts_a_notes_passes_and_once_holds_for_the_instrument() {
    // A loop 4800..5800: a marker at 5000 is crossed on entry, then once a pass.
    let data = SampleData::mono(level(0.5, 0.5), RATE);
    let markers = vec![
        marker(4800, 0, When::EveryPass, true),
        marker(5000, 1, When::EveryPass, true),
        marker(5000, 2, When::Every(2), true),
        marker(5000, 3, When::Nth(3), true),
        marker(5000, 4, When::OncePerVoice, true),
        marker(5000, 5, When::Once, true),
        marker(5800, 6, When::EveryPass, true),
    ];
    let mut segment = marked(0, data.frames(), 0, 7);
    segment.looping = Some(LoopSpec { start: 4800, end: 5800, mode: LoopMode::Continuous, ping_pong: false, crossfade: 0, count: 0 });
    let mut sampler = sampler_with(vec![Zone::new(0, 127, vec![segment])], markers, bank(vec![data]), 89);
    sampler.set_param(atome_instrument::sampler::RELEASE_MS, 1.0);
    // Ten crossings of 5000: at 5000, then one per 1000-frame pass.
    render(&mut sampler, 14_500, &[NoteEvent::note_on(0, 60, 1.0)]);
    let fired = drained(&sampler);
    let of = |marker: u32| fired.iter().filter(|fired| fired.marker == marker).map(|fired| fired.count).collect::<Vec<_>>();
    assert_eq!(of(0).len(), 10, "the loop start: entered, then every wrap");
    assert_eq!(of(1), (1..=10).collect::<Vec<_>>());
    assert_eq!(of(2), vec![2, 4, 6, 8, 10]);
    assert_eq!(of(3), vec![3], "at the third pass only");
    assert_eq!(of(4), vec![1]);
    assert_eq!(of(5), vec![1]);
    assert!(of(6).is_empty(), "a round loop never reaches its end frame");
    // A second note: once per voice fires again, once for the instrument does not.
    render(&mut sampler, 12_000, &[NoteEvent::note_off(0, 60), NoteEvent::note_on(2400, 60, 1.0)]);
    let fired = drained(&sampler);
    assert_eq!(fired.iter().filter(|fired| fired.marker == 4).count(), 1);
    assert_eq!(fired.iter().filter(|fired| fired.marker == 5).count(), 0);
    assert_eq!(fired.iter().filter(|fired| fired.marker == 3).count(), 1, "each note counts its own passes");
}

#[test]
fn a_ping_pong_loop_crosses_back_what_it_read() {
    let data = SampleData::mono(level(0.5, 0.5), RATE);
    let mut segment = marked(0, data.frames(), 0, 1);
    segment.looping = Some(LoopSpec { start: 4800, end: 5800, mode: LoopMode::Continuous, ping_pong: true, crossfade: 0, count: 0 });
    let mut sampler = sampler_with(vec![Zone::new(0, 127, vec![segment])], vec![marker(5500, 0, When::EveryPass, true)], bank(vec![data]), 89);
    // Up to 5500 (1), turn at 5800, down past 5500 (2), turn at 4800, up past 5500 (3).
    render(&mut sampler, 5500 + 300 + 300 + 700 + 700 + 100, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert_eq!(drained(&sampler).len(), 3);
}

#[test]
fn a_full_queue_counts_what_it_refused() {
    let data = SampleData::mono(level(0.5, 0.5), RATE);
    let mut segment = marked(0, data.frames(), 0, 1);
    segment.looping = Some(LoopSpec { start: 4800, end: 4900, mode: LoopMode::Continuous, ping_pong: false, crossfade: 0, count: 0 });
    let mut sampler = sampler_with(vec![Zone::new(0, 127, vec![segment])], vec![marker(4850, 0, When::EveryPass, true)], bank(vec![data]), 89);
    // 100-frame passes: 400 crossings in 40 000 frames, the queue holds 256.
    render(&mut sampler, 4850 + 40_000, &[NoteEvent::note_on(0, 60, 1.0)]);
    let kept = drained(&sampler).len();
    assert_eq!(kept, 256);
    assert_eq!(sampler.actions().take_dropped(), 401 - 256);
}
