// R-186: the synth's bricks added with the rack — the pulse and its width, hard sync, unison, the 24 dB slope, the AD
// contour, the drive, the random value, the slew, the pressure, the LFO's delay and tempo, the VCA's level times its
// gain — and a brick's value set while it plays (BrickParam). Each renders the same whatever the block size.

use atome_dsp::Processor;
use atome_instrument::event::EventKind;
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

fn synth(bricks: &[BrickDesc], routes: &[RouteDesc], output: &str) -> Synth {
    let patch = Patch::new(bricks, routes, output).expect("the patch plays");
    let mut synth = Synth::new(patch, 8, RATE);
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

fn on(note: u8) -> EventKind {
    EventKind::NoteOn {
        note,
        velocity: 0.8,
    }
}

fn peak(signal: &[f32]) -> f32 {
    signal.iter().fold(0.0, |peak, value| peak.max(value.abs()))
}

fn rms(signal: &[f32]) -> f32 {
    (signal.iter().map(|value| value * value).sum::<f32>() / signal.len() as f32).sqrt()
}

fn rising_crossings(signal: &[f32]) -> usize {
    signal
        .windows(2)
        .filter(|pair| pair[0] <= 0.0 && pair[1] > 0.0)
        .count()
}

fn amp() -> BrickDesc {
    brick(
        "amp",
        "envelope",
        &[("attack_ms", 1.0), ("sustain", 1.0), ("release_ms", 21.0)],
    )
}

// Every new brick in one voice: a pulse in unison, its width moved by a random value, synced to a second oscillator,
// driven, filtered at 24 dB by an AD and a slewed LFO in tempo, its level following the pressure.
fn everything() -> (Vec<BrickDesc>, Vec<RouteDesc>) {
    (
        vec![
            amp(),
            brick(
                "ad",
                "ad",
                &[("attack_ms", 8.0), ("decay_ms", 144.0), ("curve", 0.8)],
            ),
            brick(
                "lfo",
                "lfo",
                &[
                    ("sync", 1.0),
                    ("division", 3.0),
                    ("delay_ms", 89.0),
                    ("shape", 3.0),
                ],
            ),
            brick("slew", "slew", &[("rise_ms", 21.0), ("fall_ms", 55.0)]),
            brick("rnd", "random", &[("rate_hz", 13.0), ("smooth", 0.5)]),
            brick("touch", "pressure", &[]),
            brick(
                "master",
                "oscillator",
                &[("waveform", 0.0), ("transpose", -12.0)],
            ),
            brick(
                "o",
                "oscillator",
                &[
                    ("waveform", 4.0),
                    ("width", 0.3),
                    ("unison", 5.0),
                    ("spread_cents", 21.0),
                ],
            ),
            brick("d", "drive", &[("drive_db", 13.0), ("mix", 0.8)]),
            brick("f", "svf", &[("cutoff_hz", 987.0), ("slope", 1.0)]),
            brick("v", "vca", &[("level", 0.8)]),
        ],
        vec![
            route("lfo", "slew", "signal", 1.0),
            route("rnd", "o", "width", 0.2),
            route("master", "o", "sync", 1.0),
            route("o", "d", "audio", 1.0),
            route("d", "f", "audio", 1.0),
            route("ad", "f", "cutoff", 2.0),
            route("slew", "f", "cutoff", 1.0),
            route("touch", "d", "drive", 8.0),
            route("f", "v", "audio", 1.0),
            route("amp", "v", "gain", 1.0),
        ],
    )
}

#[test]
fn every_new_brick_renders_the_same_whatever_the_block_size() {
    let (bricks, routes) = everything();
    let events = [
        (0, EventKind::Tempo { bpm: 90.0 }),
        (0, on(57)),
        (2_000, EventKind::Pressure { value: 0.6 }),
        (7_000, on(64)),
    ];
    let small = play(&mut synth(&bricks, &routes, "v"), 24_000, 64, &events);
    let large = play(&mut synth(&bricks, &routes, "v"), 24_000, 4096, &events);
    assert!(peak(&small) > 0.05, "the voice sounds");
    assert!(small.iter().all(|value| value.is_finite()));
    let worst = small
        .iter()
        .zip(large.iter())
        .map(|(a, b)| (a - b).abs())
        .fold(0.0f32, f32::max);
    assert!(worst < 1e-5, "the block size changes nothing: {worst}");
}

#[test]
fn a_brick_value_set_while_it_plays_is_heard_at_once_as_if_set_from_the_start() {
    let bricks = |cutoff: f32| {
        vec![
            amp(),
            brick("o", "oscillator", &[]),
            brick("f", "svf", &[("cutoff_hz", cutoff)]),
            brick("v", "vca", &[]),
        ]
    };
    let routes = [
        route("o", "f", "audio", 1.0),
        route("f", "v", "audio", 1.0),
        route("amp", "v", "gain", 1.0),
    ];
    let set = EventKind::BrickParam {
        brick: 2,
        param: 0,
        value: 233.0,
    };
    let live = play(
        &mut synth(&bricks(4181.0), &routes, "v"),
        9_600,
        128,
        &[(0, set), (0, on(57))],
    );
    let built = play(
        &mut synth(&bricks(233.0), &routes, "v"),
        9_600,
        128,
        &[(0, on(57))],
    );
    let bright = play(
        &mut synth(&bricks(4181.0), &routes, "v"),
        9_600,
        128,
        &[(0, on(57))],
    );
    let worst = live
        .iter()
        .zip(built.iter())
        .map(|(a, b)| (a - b).abs())
        .fold(0.0f32, f32::max);
    assert!(worst < 1e-5, "set live = built with it: {worst}");
    assert!(rms(&bright) > rms(&live) * 1.3, "the lower cutoff is heard");
    // An envelope's gate follows the note: a BrickParam on it changes nothing.
    let gated = play(
        &mut synth(&bricks(4181.0), &routes, "v"),
        9_600,
        128,
        &[
            (0, on(57)),
            (
                10,
                EventKind::BrickParam {
                    brick: 0,
                    param: 0,
                    value: 0.0,
                },
            ),
        ],
    );
    assert!(
        gated
            .iter()
            .zip(bright.iter())
            .all(|(a, b)| (a - b).abs() < 1e-6)
    );
}

#[test]
fn a_vca_multiplies_its_gain_by_its_level() {
    let patch = |level: f32| {
        vec![
            amp(),
            brick("o", "oscillator", &[]),
            brick("v", "vca", &[("level", level)]),
        ]
    };
    let routes = [
        route("o", "v", "audio", 1.0),
        route("amp", "v", "gain", 1.0),
    ];
    let full = play(
        &mut synth(&patch(1.0), &routes, "v"),
        4_800,
        256,
        &[(0, on(57))],
    );
    let half = play(
        &mut synth(&patch(0.5), &routes, "v"),
        4_800,
        256,
        &[(0, on(57))],
    );
    assert!((rms(&half) / rms(&full) - 0.5).abs() < 0.01);
}

#[test]
fn a_24_db_slope_cuts_more_above_the_cutoff_than_12_db() {
    let patch = |slope: f32| {
        vec![
            amp(),
            // A saw at 1760 Hz, three octaves above the cutoff: what the slope cuts.
            brick("n", "oscillator", &[("waveform", 1.0)]),
            brick("f", "svf", &[("cutoff_hz", 233.0), ("slope", slope)]),
            brick("v", "vca", &[]),
        ]
    };
    let routes = [
        route("n", "f", "audio", 1.0),
        route("f", "v", "audio", 1.0),
        route("amp", "v", "gain", 1.0),
    ];
    let gentle = play(
        &mut synth(&patch(0.0), &routes, "v"),
        9_600,
        256,
        &[(0, on(93))],
    );
    let steep = play(
        &mut synth(&patch(1.0), &routes, "v"),
        9_600,
        256,
        &[(0, on(93))],
    );
    assert!(
        rms(&steep) < rms(&gentle) * 0.3,
        "{} vs {}",
        rms(&steep),
        rms(&gentle)
    );
}

#[test]
fn a_pulse_follows_its_width_and_a_unison_keeps_the_loudness_of_one() {
    let patch = |params: &[(&str, f32)]| {
        vec![
            amp(),
            brick("o", "oscillator", params),
            brick("v", "vca", &[]),
        ]
    };
    let routes = [
        route("o", "v", "audio", 1.0),
        route("amp", "v", "gain", 1.0),
    ];
    let render = |params: &[(&str, f32)]| {
        play(
            &mut synth(&patch(params), &routes, "v"),
            9_600,
            256,
            &[(0, on(57))],
        )
    };
    let square = render(&[("waveform", 4.0), ("width", 0.5)]);
    let narrow = render(&[("waveform", 4.0), ("width", 0.1)]);
    // A centred pulse: its mean stays near zero whatever its width.
    let mean = narrow[2_400..].iter().sum::<f32>() / (narrow.len() - 2_400) as f32;
    assert!(mean.abs() < 0.02, "no DC offset: {mean}");
    // A centred pulse of width w: its RMS is 2·sqrt(w·(1 − w)) times the square's, 0.6 at 0.1.
    let energy = rms(&narrow[2_400..]) / rms(&square[2_400..]);
    assert!(
        (energy - 0.6).abs() < 0.03,
        "a narrow pulse carries less energy: {energy}"
    );
    let one = render(&[("waveform", 1.0)]);
    let seven = render(&[("waveform", 1.0), ("unison", 7.0), ("spread_cents", 21.0)]);
    let ratio = rms(&seven[2_400..]) / rms(&one[2_400..]);
    assert!(
        (0.5..1.6).contains(&ratio),
        "a unison stays as loud as one oscillator: {ratio}"
    );
}

#[test]
fn hard_sync_restarts_the_slave_at_the_master_period() {
    let bricks = vec![
        amp(),
        brick("m", "oscillator", &[("waveform", 0.0)]),
        brick("s", "oscillator", &[("waveform", 1.0), ("transpose", 7.0)]),
        brick("v", "vca", &[]),
    ];
    let free = [
        route("s", "v", "audio", 1.0),
        route("amp", "v", "gain", 1.0),
    ];
    let synced = [
        route("m", "s", "sync", 1.0),
        route("s", "v", "audio", 1.0),
        route("amp", "v", "gain", 1.0),
    ];
    let a = play(&mut synth(&bricks, &free, "v"), 9_600, 256, &[(0, on(57))]);
    let b = play(
        &mut synth(&bricks, &synced, "v"),
        9_600,
        256,
        &[(0, on(57))],
    );
    // Synced to A3 (220 Hz), the saw's pattern repeats at the master's period: 48 000 / 220 frames.
    let period = (RATE / 220.0).round() as usize;
    let repeat = b[4_800..4_800 + period]
        .iter()
        .zip(b[4_800 + period..4_800 + 2 * period].iter())
        .map(|(x, y)| (x - y).abs())
        .sum::<f32>()
        / period as f32;
    assert!(
        repeat < 0.05,
        "the synced wave repeats at the master period: {repeat}"
    );
    assert!(
        a.iter().zip(b.iter()).any(|(x, y)| (x - y).abs() > 0.1),
        "sync changes the wave"
    );
}

#[test]
fn an_ad_contour_ends_while_the_key_is_held() {
    let bricks = vec![
        amp(),
        brick("ad", "ad", &[("attack_ms", 5.0), ("decay_ms", 89.0)]),
        brick("o", "oscillator", &[]),
        brick("v", "vca", &[]),
    ];
    let routes = [route("o", "v", "audio", 1.0), route("ad", "v", "gain", 1.0)];
    let out = play(
        &mut synth(&bricks, &routes, "v"),
        9_600,
        256,
        &[(0, on(57))],
    );
    assert!(peak(&out[..2_400]) > 0.2, "the contour rises");
    assert!(
        peak(&out[4_800..]) < 1e-6,
        "after 94 ms it is silent, the key still held"
    );
}

#[test]
fn the_pressure_reaches_its_brick() {
    let bricks = vec![
        amp(),
        brick("p", "pressure", &[]),
        brick("o", "oscillator", &[]),
        brick("v", "vca", &[]),
    ];
    let routes = [route("o", "v", "audio", 1.0), route("p", "v", "gain", 1.0)];
    let out = play(
        &mut synth(&bricks, &routes, "v"),
        9_600,
        256,
        &[(0, on(57)), (4_800, EventKind::Pressure { value: 1.0 })],
    );
    assert!(peak(&out[..4_800]) < 1e-6, "no pressure, no sound");
    assert!(peak(&out[4_900..]) > 0.2, "pressed, it sounds");
}

// An LFO heard on its own: a value of 1 into a VCA whose gain the LFO moves.
fn lfo_alone(params: &[(&str, f32)], events: &[(usize, EventKind)]) -> Vec<f32> {
    let bricks = vec![
        amp(),
        brick("one", "constant", &[("value", 1.0)]),
        brick("l", "lfo", params),
        brick("v", "vca", &[]),
    ];
    let routes = [
        route("one", "v", "audio", 1.0),
        route("l", "v", "gain", 1.0),
    ];
    play(&mut synth(&bricks, &routes, "v"), 48_000, 256, events)
}

#[test]
fn an_lfo_in_tempo_follows_the_host_and_its_delay_fades_it_in() {
    // A quarter at 120 bpm is 2 Hz; at 60 bpm, 1 Hz.
    let fast = lfo_alone(
        &[("sync", 1.0), ("division", 2.0), ("phase_deg", 90.0)],
        &[(0, EventKind::Tempo { bpm: 120.0 }), (0, on(57))],
    );
    let slow = lfo_alone(
        &[("sync", 1.0), ("division", 2.0), ("phase_deg", 90.0)],
        &[(0, EventKind::Tempo { bpm: 60.0 }), (0, on(57))],
    );
    assert_eq!(rising_crossings(&fast), 2 * rising_crossings(&slow));
    let delayed = lfo_alone(&[("rate_hz", 5.0), ("delay_ms", 610.0)], &[(0, on(57))]);
    assert!(
        peak(&delayed[..2_400]) < 0.1 * peak(&delayed[38_400..]),
        "its first 50 ms barely move"
    );
}

#[test]
fn a_random_value_is_drawn_again_the_same_on_a_replay_and_a_slew_follows_slowly() {
    let bricks = vec![
        amp(),
        brick("one", "constant", &[("value", 1.0)]),
        brick("r", "random", &[("rate_hz", 21.0)]),
        brick("v", "vca", &[]),
    ];
    let routes = [
        route("one", "v", "audio", 1.0),
        route("r", "v", "gain", 1.0),
    ];
    let a = play(
        &mut synth(&bricks, &routes, "v"),
        48_000,
        256,
        &[(0, on(57))],
    );
    let b = play(
        &mut synth(&bricks, &routes, "v"),
        48_000,
        128,
        &[(0, on(57))],
    );
    assert_eq!(a, b, "a replay draws the same values");
    let steps = a
        .windows(2)
        .filter(|pair| (pair[0] - pair[1]).abs() > 1e-6)
        .count();
    assert!(
        (15..=25).contains(&steps),
        "about 21 new values in a second: {steps}"
    );
    let slewed = vec![
        amp(),
        brick("one", "constant", &[("value", 1.0)]),
        brick("s", "slew", &[("rise_ms", 89.0)]),
        brick("v", "vca", &[]),
    ];
    let routes = [
        route("one", "s", "signal", 1.0),
        route("one", "v", "audio", 1.0),
        route("s", "v", "gain", 1.0),
    ];
    let rise = play(
        &mut synth(&slewed, &routes, "v"),
        48_000,
        256,
        &[(0, on(57))],
    );
    assert!(
        rise[480] < 0.2 && rise[24_000] > 0.99,
        "a step reached in its rise time: {} {}",
        rise[480],
        rise[24_000]
    );
}

#[test]
fn a_drive_saturates_and_its_mix_brings_the_dry_sound_back() {
    let patch = |mix: f32| {
        vec![
            amp(),
            brick("o", "oscillator", &[("waveform", 0.0), ("level_db", 0.0)]),
            brick("d", "drive", &[("drive_db", 21.0), ("mix", mix)]),
            brick("v", "vca", &[]),
        ]
    };
    let routes = [
        route("o", "d", "audio", 1.0),
        route("d", "v", "audio", 1.0),
        route("amp", "v", "gain", 1.0),
    ];
    let wet = play(
        &mut synth(&patch(1.0), &routes, "v"),
        9_600,
        256,
        &[(0, on(57))],
    );
    let dry = play(
        &mut synth(&patch(0.0), &routes, "v"),
        9_600,
        256,
        &[(0, on(57))],
    );
    assert!(peak(&wet) <= 1.0001, "the soft clip keeps full scale");
    assert!(
        rms(&wet[2_400..]) > rms(&dry[2_400..]) * 1.2,
        "driven, a sine fills towards a square"
    );
}
