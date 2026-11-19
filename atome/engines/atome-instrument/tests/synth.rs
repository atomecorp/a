// R-191 / R-186: the synth's voices each carry their own signals (envelopes,
// filter, LFO phase) and are summed at its output; the render does not depend
// on the block size; releases, the pedal and stealing behave; a patch that
// cannot play is refused.

use atome_dsp::Processor;
use atome_instrument::event::EventKind;
use atome_instrument::sampler::POLYPHONY;
use atome_instrument::synth::{BrickDesc, Patch, RouteDesc};
use atome_instrument::{NoteEvent, Synth};

const RATE: f32 = 48_000.0;
const MAX_BLOCK: usize = 4096;

fn brick(id: &str, kind: &str, params: &[(&str, f32)]) -> BrickDesc {
    BrickDesc {
        id: id.into(),
        kind: kind.into(),
        params: params
            .iter()
            .map(|(key, value)| (key.to_string(), *value))
            .collect(),
    }
}

fn route(from: &str, to: &str, input: &str, depth: f32) -> RouteDesc {
    RouteDesc {
        from: from.into(),
        to: to.into(),
        input: input.into(),
        depth,
    }
}

// Two oscillators, a filter swept by its own envelope and a per-voice LFO, a VCA on the amp envelope.
fn analog() -> Patch {
    Patch::new(
        &[
            brick("lfo", "lfo", &[("rate_hz", 5.0)]),
            brick("vel", "velocity", &[]),
            brick("o1", "oscillator", &[("waveform", 1.0)]),
            brick(
                "o2",
                "oscillator",
                &[("waveform", 2.0), ("detune_cents", 7.0)],
            ),
            brick(
                "fenv",
                "envelope",
                &[
                    ("attack_ms", 3.0),
                    ("decay_ms", 144.0),
                    ("sustain", 0.3),
                    ("release_ms", 89.0),
                ],
            ),
            brick("f", "svf", &[("cutoff_hz", 610.0), ("resonance", 2.0)]),
            brick(
                "amp",
                "envelope",
                &[
                    ("attack_ms", 5.0),
                    ("decay_ms", 89.0),
                    ("sustain", 0.6),
                    ("release_ms", 55.0),
                ],
            ),
            brick("v", "vca", &[]),
        ],
        &[
            route("lfo", "o1", "pitch", 0.2),
            route("o1", "f", "audio", 1.0),
            route("o2", "f", "audio", 1.0),
            route("fenv", "f", "cutoff", 3.0),
            route("lfo", "f", "cutoff", 0.5),
            route("f", "v", "audio", 1.0),
            route("amp", "v", "gain", 1.0),
            route("vel", "v", "gain", 0.0),
        ],
        "v",
    )
    .expect("the analog patch")
}

fn synth(voices: usize) -> Synth {
    let mut synth = Synth::new(analog(), voices, RATE);
    synth.prepare(RATE, MAX_BLOCK);
    synth
}

// Renders `frames` frames in blocks of `block`, each event at its absolute frame.
fn play(synth: &mut Synth, frames: usize, block: usize, events: &[(usize, EventKind)]) -> Vec<f32> {
    let (mut left, mut right) = (vec![0.0; block], vec![0.0; block]);
    let mut out = Vec::with_capacity(frames);
    let mut done = 0;
    while done < frames {
        let length = block.min(frames - done);
        for (at, kind) in events
            .iter()
            .filter(|(at, _)| (done..done + length).contains(at))
        {
            synth.schedule(NoteEvent {
                offset: (at - done) as u32,
                kind: *kind,
            });
        }
        synth.process_outputs(&mut left, &mut right, length);
        out.extend_from_slice(&left[..length]);
        done += length;
    }
    out
}

fn on(note: u8, velocity: f32) -> EventKind {
    EventKind::NoteOn { note, velocity }
}

fn off(note: u8) -> EventKind {
    EventKind::NoteOff { note }
}

fn peak(signal: &[f32]) -> f32 {
    signal.iter().fold(0.0, |peak, value| peak.max(value.abs()))
}

#[test]
fn two_overlapping_notes_sound_as_the_sum_of_each_alone() {
    let a = [(0, on(57, 0.8)), (9_600, off(57))];
    let b = [(4_800, on(64, 0.5)), (19_200, off(64))];
    let both: Vec<_> = a.iter().chain(b.iter()).copied().collect();
    let frames = 28_800;
    let alone_a = play(&mut synth(8), frames, 128, &a);
    let alone_b = play(&mut synth(8), frames, 128, &b);
    let together = play(&mut synth(8), frames, 128, &both);
    assert!(peak(&alone_a) > 0.05 && peak(&alone_b) > 0.05);
    let worst = together
        .iter()
        .zip(alone_a.iter().zip(alone_b.iter()))
        .map(|(sum, (a, b))| (sum - (a + b)).abs())
        .fold(0.0f32, f32::max);
    assert!(
        worst < 1e-6,
        "each voice keeps its own envelopes, filter and LFO: {worst}"
    );
    // Note A's release ends while B still holds: its envelope, not B's, let it go.
    // Released at 9 600, its amp envelope (55 ms, 2 640 frames) is silent from 12 240.
    assert!(peak(&alone_a[12_300..]) < 1e-6);
    assert!(peak(&together[12_300..19_200]) > 0.01);
}

#[test]
fn the_render_is_the_same_whatever_the_block_size() {
    let events = [
        (0, on(48, 1.0)),
        (1_000, on(55, 0.7)),
        (7_777, EventKind::PitchBend { semitones: 0.5 }),
        (9_001, off(48)),
        (12_345, on(60, 0.9)),
        (20_000, EventKind::AllNotesOff),
    ];
    let reference = play(&mut synth(8), 24_000, 128, &events);
    for block in [17, 64, 500, 4096] {
        let other = play(&mut synth(8), 24_000, block, &events);
        let worst = reference
            .iter()
            .zip(other.iter())
            .map(|(a, b)| (a - b).abs())
            .fold(0.0f32, f32::max);
        assert!(worst < 1e-6, "block {block}: differs by {worst}");
    }
}

#[test]
fn a_released_voice_ends_with_its_envelopes() {
    let mut synth = synth(8);
    play(
        &mut synth,
        4_800,
        256,
        &[(0, on(60, 1.0)), (2_400, off(60))],
    );
    // The filter envelope releases in 89 ms, the amp's in 55 ms: the voice lives until the longer one.
    assert_eq!(synth.sounding_voices(), 1);
    let rest = play(&mut synth, 4_800, 256, &[]);
    assert_eq!(synth.sounding_voices(), 0);
    assert!(peak(&rest[4_000..]) == 0.0);
    assert_eq!(synth.tail_frames(), (0.089 * RATE) as u32);
}

#[test]
fn the_pedal_holds_released_notes_until_it_lifts() {
    let mut synth = synth(8);
    let events = [
        (0, EventKind::Sustain { down: true }),
        (10, on(60, 1.0)),
        (2_000, off(60)),
    ];
    let held = play(&mut synth, 24_000, 256, &events);
    assert!(
        peak(&held[20_000..]) > 0.01,
        "the pedal keeps the note at its sustain"
    );
    play(
        &mut synth,
        9_600,
        256,
        &[(0, EventKind::Sustain { down: false })],
    );
    assert_eq!(synth.sounding_voices(), 0);
}

#[test]
fn past_the_polyphony_the_oldest_voice_is_stolen() {
    let mut synth = synth(8);
    synth.set_param(POLYPHONY, 2.0);
    play(
        &mut synth,
        4_800,
        256,
        &[(0, on(60, 1.0)), (100, on(64, 1.0)), (200, on(67, 1.0))],
    );
    assert_eq!(synth.sounding_voices(), 2);
}

#[test]
fn a_patch_that_cannot_play_is_refused() {
    let refused = |bricks: &[BrickDesc], routes: &[RouteDesc], output: &str, words: &str| {
        let error = Patch::new(bricks, routes, output).err().expect("refused");
        assert!(error.contains(words), "{error} (expected «{words}»)");
    };
    let osc = || brick("o", "oscillator", &[]);
    let env = || brick("e", "envelope", &[]);
    refused(
        &[brick("x", "theremin", &[])],
        &[],
        "x",
        "synth brick theremin is unknown",
    );
    refused(
        &[brick("o", "oscillator", &[("color", 1.0)])],
        &[],
        "o",
        "has no parameter color",
    );
    refused(
        &[osc(), brick("e", "envelope", &[("gate", 1.0)])],
        &[],
        "o",
        "its gate follows the note",
    );
    refused(&[osc()], &[], "o", "the patch needs one");
    refused(&[osc(), env()], &[], "e", "makes no sound");
    refused(
        &[osc(), env()],
        &[route("o", "e", "audio", 1.0)],
        "o",
        "has no audio input",
    );
    refused(
        &[env(), osc()],
        &[route("o", "e", "gain", 1.0)],
        "o",
        "runs forward",
    );
    refused(
        &[osc(), env()],
        &[route("o", "o2", "pitch", 1.0)],
        "o",
        "o2 is not in the voice",
    );
    refused(
        &[osc(), env()],
        &[route("e", "o", "wobble", 1.0)],
        "o",
        "runs forward",
    );
    refused(
        &[env(), osc()],
        &[route("e", "o", "wobble", 1.0)],
        "o",
        "synth input wobble is unknown",
    );
    refused(&[osc(), osc()], &[], "o", "appears twice");
}
