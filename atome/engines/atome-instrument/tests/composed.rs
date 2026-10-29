// The composed note: steps drawn from lists, transitions taken at the frame of
// their trigger — a marker (with a crossfade on two players), the key's
// release into a release step, a tied note, the third pass of a loop, a
// duration, the velocity, a controller — a jump that fires nothing, seeded
// draws that replay.

mod support;
use atome_dsp::Processor;
use atome_instrument::event::EventKind;
use atome_instrument::sampler::{MODE, RELEASE_MS};
use atome_instrument::{Composed, Follow, LoopMode, LoopSpec, Marker, NoteEvent, SampleData, Segment, Step, StepDraw, Transition, Trigger, When, Zone};
use support::*;

// Four constant levels: which one sounds tells which segment plays.
const LEVELS: [f32; 4] = [0.5, 0.25, 0.125, 0.0625];

fn levels() -> Vec<SampleData> {
    LEVELS.iter().map(|value| SampleData::mono(level(*value, 1.0), RATE)).collect()
}

fn whole(sample: usize) -> Segment {
    Segment::whole(sample, 48_000, 60)
}

fn looped(sample: usize, mode: LoopMode) -> Segment {
    Segment { looping: Some(LoopSpec { start: 4800, end: 5800, mode, ping_pong: false, crossfade: 0, count: 0 }), ..whole(sample) }
}

fn step(segments: Vec<Segment>, draw: StepDraw) -> Step {
    Step { segments, draw }
}

fn transition(from: usize, trigger: Trigger, follow: Follow, fade_ms: f32) -> Transition {
    Transition { from: Some(from), trigger, follow, fade_ms }
}

fn composed(steps: Vec<Step>, transitions: Vec<Transition>, markers: Vec<Marker>, seed: u64) -> atome_instrument::Sampler {
    sampler_with(vec![Zone::composed(0, 127, Composed { steps, transitions })], markers, bank(levels()), seed)
}

fn near(value: f32, expected: f32) -> bool {
    (value - expected).abs() < 1.0e-3
}

// The sound changes from `before` to `after` on frame `frame`: the frame before
// is the old segment's, the new one starts there (its sinc reader settles over
// half its taps: a segment's start reads silence before its first frame).
fn switches(left: &[f32], frame: usize, before: f32, after: f32) -> bool {
    near(left[frame - 1], before) && !near(left[frame], before) && near(left[frame + 16], after)
}

#[test]
fn a_marker_leads_attack_to_body_crossfaded_on_two_players() {
    let attack = Segment { markers: atome_instrument::MarkerSpan { first: 0, len: 1 }, ..whole(0) };
    let mut sampler = composed(
        vec![step(vec![attack], StepDraw::One), step(vec![looped(1, LoopMode::Continuous)], StepDraw::One)],
        vec![transition(0, Trigger::Marker(7), Follow::Next, 10.0)],
        vec![marker(9600, 7, When::EveryPass, false)],
        89,
    );
    let (head, _) = render(&mut sampler, 9800, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(near(head[9599], 0.5), "the attack up to its marker");
    let voice = sampler.pool().voices().iter().find(|voice| voice.active).unwrap();
    assert_eq!(voice.players().len(), 2, "two players while they cross");
    let (tail, _) = render(&mut sampler, 4800, &[]);
    let crossed = |past: f32| 0.5 * (std::f32::consts::FRAC_PI_2 * past).cos() + 0.25 * (std::f32::consts::FRAC_PI_2 * past).sin();
    assert!(near(head[9600], 0.5), "the fade begins on the marker's frame");
    assert!(near(head[9600 + 120], crossed(0.25)));
    // tail[0] is frame 9800: the fade's middle (frame 9840) is tail[40].
    assert!(near(tail[40], crossed(0.5)), "equal power at the fade's middle: {} vs {}", tail[40], crossed(0.5));
    assert!(near(tail[1000], 0.25), "the body alone after 10 ms");
    assert_eq!(sampler.pool().voices().iter().find(|voice| voice.active).unwrap().players().len(), 1);
}

#[test]
fn the_key_release_leads_to_a_release_step_that_plays_out() {
    let release = Segment::whole(3, 9600, 60);
    let mut sampler = composed(
        vec![step(vec![looped(0, LoopMode::Sustain)], StepDraw::One), step(vec![release], StepDraw::One)],
        vec![transition(0, Trigger::NoteOff, Follow::Next, 0.0)],
        Vec::new(),
        89,
    );
    sampler.set_param(RELEASE_MS, 1.0);
    let (left, _) = render(&mut sampler, 36_000, &[NoteEvent::note_on(0, 60, 1.0), NoteEvent::note_off(24_000, 60)]);
    assert!(switches(&left, 24_000, 0.5, 0.0625), "the release step on the key's frame");
    assert!(near(left[24_000 + 9599], 0.0625), "played out, the envelope open");
    assert_eq!(left[24_000 + 9600], 0.0, "then the note ends");
    assert_eq!(sampler.sounding_voices(), 0);
}

#[test]
fn a_tied_note_plays_the_legato_step_on_the_same_voice() {
    let mut sampler = composed(
        vec![step(vec![looped(0, LoopMode::Continuous)], StepDraw::One), step(vec![looped(1, LoopMode::Continuous)], StepDraw::One)],
        vec![transition(0, Trigger::Legato, Follow::Next, 0.0)],
        Vec::new(),
        89,
    );
    sampler.set_param(MODE, 2.0);
    let (left, _) = render(&mut sampler, 24_000, &[NoteEvent::note_on(0, 60, 1.0), NoteEvent::note_on(12_000, 62, 1.0)]);
    assert!(switches(&left, 12_000, 0.5, 0.25), "the tie step at the tied note's frame");
    assert_eq!(sampler.pool().voices().iter().filter(|voice| voice.active).count(), 1, "one voice");
}

#[test]
fn the_third_pass_of_a_loop_leads_on_at_its_frame() {
    let mut sampler = composed(
        vec![step(vec![looped(0, LoopMode::Continuous)], StepDraw::One), step(vec![whole(1)], StepDraw::One)],
        vec![transition(0, Trigger::Passes(3), Follow::Next, 0.0)],
        Vec::new(),
        89,
    );
    // Wraps at 5800, 6800, 7800.
    let (left, _) = render(&mut sampler, 9600, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(switches(&left, 7800, 0.5, 0.25), "the next step from the third wrap");
}

#[test]
fn a_duration_a_velocity_and_a_controller_lead_on() {
    let two = || vec![step(vec![looped(0, LoopMode::Continuous)], StepDraw::One), step(vec![looped(1, LoopMode::Continuous)], StepDraw::One)];
    let mut timed = composed(two(), vec![transition(0, Trigger::Duration { ms: 100.0 }, Follow::Next, 0.0)], Vec::new(), 89);
    let (left, _) = render(&mut timed, 9600, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(switches(&left, 4800, 0.5, 0.25), "100 ms: frame 4800");
    for (velocity, expected) in [(1.0, 0.25), (0.5, 0.5)] {
        let mut hard = composed(two(), vec![transition(0, Trigger::Velocity(100), Follow::Target(1), 0.0)], Vec::new(), 89);
        let (left, _) = render(&mut hard, 960, &[NoteEvent::note_on(0, 60, velocity)]);
        assert!(near(left[100], expected), "velocity {velocity}: {}", left[100]);
    }
    let mut moved = composed(two(), vec![transition(0, Trigger::Controller { number: 1, above: 0.5 }, Follow::Next, 0.0)], Vec::new(), 89);
    let controller = |offset, value| NoteEvent { offset, kind: EventKind::Controller { number: 1, value } };
    let (left, _) = render(&mut moved, 12_000, &[NoteEvent::note_on(0, 60, 1.0), controller(4800, 0.3), controller(9600, 0.8)]);
    assert!(switches(&left, 9600, 0.5, 0.25), "above 0.5 at its event's frame");
}

#[test]
fn a_jump_to_a_marker_fires_none_of_the_markers_it_skips() {
    let segment = Segment { markers: atome_instrument::MarkerSpan { first: 0, len: 3 }, ..whole(0) };
    let markers = vec![marker(2400, 1, When::EveryPass, false), marker(12_000, 2, When::EveryPass, true), marker(20_000, 3, When::EveryPass, true)];
    let mut sampler = composed(vec![step(vec![segment], StepDraw::One)], vec![transition(0, Trigger::Marker(1), Follow::JumpMarker(3), 0.0)], markers, 89);
    render(&mut sampler, 4800, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(drained(&sampler).is_empty(), "neither the skipped marker nor the one landed on");
    let position = sampler.pool().voices().iter().find(|voice| voice.active).unwrap().players()[0].position();
    assert!((position - 22_400.0).abs() < 1.0, "read on from the marker: {position}");
}

#[test]
fn seeded_draws_replay_and_random_without_repeat_never_repeats() {
    let draws = |seed: u64| {
        let mut sampler = composed(vec![step(vec![whole(0), whole(1), whole(2)], StepDraw::RandomNoRepeat)], Vec::new(), Vec::new(), seed);
        sampler.set_param(RELEASE_MS, 1.0);
        (0..21).map(|_| {
            let (left, _) = render(&mut sampler, 960, &[NoteEvent::note_on(0, 60, 1.0), NoteEvent::note_off(480, 60)]);
            LEVELS.iter().position(|level| near(left[100], *level)).expect("one segment sounds")
        }).collect::<Vec<_>>()
    };
    let first = draws(89);
    assert_eq!(first, draws(89), "the same seed replays the same draws");
    assert_ne!(first, draws(13));
    assert!(first.windows(2).all(|pair| pair[0] != pair[1]), "{first:?}");
    assert!((0..3).all(|segment| first.contains(&segment)));
    for (velocity, expected) in [(30.0 / 127.0, 0.5), (1.0, 0.25)] {
        let mut by_velocity = composed(vec![step(vec![whole(0), whole(1)], StepDraw::Velocity)], Vec::new(), Vec::new(), 89);
        let (left, _) = render(&mut by_velocity, 480, &[NoteEvent::note_on(0, 60, velocity)]);
        assert!(near(left[100], expected), "softest first: velocity {velocity}");
    }
}

#[test]
fn a_description_the_engine_cannot_play_is_refused() {
    let bank = bank(levels());
    let keymap = |steps: Vec<Step>, transitions: Vec<Transition>, markers: Vec<Marker>| {
        atome_instrument::Keymap::with_markers(vec![Zone::composed(0, 127, Composed { steps, transitions })], markers, &bank, 89).err().unwrap_or_default()
    };
    assert!(keymap(Vec::new(), Vec::new(), Vec::new()).contains("one step at least"));
    assert!(keymap(vec![step(vec![whole(0), whole(1)], StepDraw::One)], Vec::new(), Vec::new()).contains("single segment"));
    assert!(keymap(vec![step(vec![whole(0)], StepDraw::One)], vec![transition(0, Trigger::NoteOff, Follow::Target(4), 0.0)], Vec::new()).contains("step the note does not have"));
    assert!(keymap(vec![step(vec![whole(0)], StepDraw::One)], vec![transition(0, Trigger::Marker(2), Follow::Next, 0.0)], Vec::new()).contains("carries that marker"));
    let marked = Segment { markers: atome_instrument::MarkerSpan { first: 0, len: 1 }, ..whole(0) };
    let jump = vec![transition(0, Trigger::NoteOff, Follow::JumpMarker(2), 0.0)];
    assert!(keymap(vec![step(vec![marked, whole(1)], StepDraw::Cycle)], jump, vec![marker(100, 2, When::Once, false)]).contains("every segment"));
    assert!(keymap(vec![step(vec![marked], StepDraw::One)], Vec::new(), vec![marker(48_000, 2, When::Once, false)]).contains("outside its region"));
    assert!(keymap(vec![step(vec![marked], StepDraw::One)], Vec::new(), vec![marker(10, 2, When::Nth(0), false)]).contains("count from 1"));
    let both = Zone { takes: vec![whole(0)], ..Zone::composed(0, 127, Composed { steps: vec![step(vec![whole(0)], StepDraw::One)], transitions: Vec::new() }) };
    assert!(atome_instrument::Keymap::new(vec![both], &bank, 89).err().unwrap().contains("not takes"));
}

#[test]
fn stop_cuts_and_fade_fades_the_note() {
    let one = || vec![step(vec![looped(0, LoopMode::Continuous)], StepDraw::One)];
    let mut stopped = composed(one(), vec![transition(0, Trigger::Duration { ms: 100.0 }, Follow::Stop, 0.0)], Vec::new(), 89);
    let (left, _) = render(&mut stopped, 9600, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(left[4800 + 480].abs() < 1.0e-4, "silent within a few milliseconds");
    let mut faded = composed(one(), vec![transition(0, Trigger::Duration { ms: 100.0 }, Follow::Fade, 100.0)], Vec::new(), 89);
    let (left, _) = render(&mut faded, 19_200, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!(left[4800 + 480].abs() > 0.05, "still fading 10 ms in");
    assert_eq!(faded.sounding_voices(), 0);
}
