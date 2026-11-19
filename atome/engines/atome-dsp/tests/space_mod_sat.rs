// Spaces, modulation and saturation measured on real signals (R-184).

use atome_dsp::biquad::{Coefficients, Section, Shape};
use atome_dsp::delay::{self, Echo};
use atome_dsp::lofi::{self, Lofi};
use atome_dsp::modulation::{Chorus, Flanger, Phaser, Tremolo, chorus, flanger, phaser, tremolo};
use atome_dsp::reverb::{self, Reverb};
use atome_dsp::saturator::{self, Saturator};
use atome_dsp::{Processor, StereoBlock};
use std::f32::consts::TAU;

const RATE: f32 = 48000.0;
const BLOCK: usize = 64;

fn run(processor: &mut dyn Processor, left: &[f32], right: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let (mut out_left, mut out_right) = (left.to_vec(), right.to_vec());
    for start in (0..left.len()).step_by(BLOCK) {
        let end = (start + BLOCK).min(left.len());
        processor.process(&mut StereoBlock::new(
            &mut out_left[start..end],
            &mut out_right[start..end],
        ));
    }
    (out_left, out_right)
}

fn sine(frequency: f32, frames: usize, amplitude: f32, rate: f32) -> Vec<f32> {
    (0..frames)
        .map(|n| amplitude * (TAU * frequency * n as f32 / rate).sin())
        .collect()
}

fn noise(frames: usize, amplitude: f32) -> Vec<f32> {
    let mut seed = 7u32;
    (0..frames)
        .map(|_| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            amplitude * ((seed >> 8) as f32 / 8388608.0 - 1.0)
        })
        .collect()
}

fn impulse(frames: usize, at: usize) -> Vec<f32> {
    let mut signal = vec![0.0; frames];
    signal[at] = 1.0;
    signal
}

fn energy(signal: &[f32]) -> f64 {
    signal.iter().map(|&x| (x as f64) * (x as f64)).sum()
}

fn rms(signal: &[f32]) -> f32 {
    (energy(signal) / signal.len().max(1) as f64).sqrt() as f32
}

// Magnitude of one exact frequency over a whole number of its periods.
fn tone(signal: &[f32], frequency: f32, rate: f32) -> f64 {
    let (mut re, mut im) = (0.0f64, 0.0f64);
    for (n, &x) in signal.iter().enumerate() {
        let phase = std::f64::consts::TAU * frequency as f64 * n as f64 / rate as f64;
        re += x as f64 * phase.cos();
        im += x as f64 * phase.sin();
    }
    2.0 * (re * re + im * im).sqrt() / signal.len() as f64
}

fn db(ratio: f64) -> f64 {
    20.0 * ratio.max(1.0e-12).log10()
}

// RT60 from the Schroeder backward integral between −10 and −40 dB (T30):
// the late, diffuse decay, past the direct sound and the first reflections.
fn rt60(left: &[f32], right: &[f32], rate: f32) -> f32 {
    let mut remaining: f64 = energy(left) + energy(right);
    let total = remaining;
    let (mut t10, mut t40) = (None, None);
    for (n, (l, r)) in left.iter().zip(right).enumerate() {
        let level = 10.0 * (remaining / total).log10();
        if t10.is_none() && level <= -10.0 {
            t10 = Some(n);
        }
        if level <= -40.0 {
            t40 = Some(n);
            break;
        }
        remaining -= (*l as f64).powi(2) + (*r as f64).powi(2);
    }
    2.0 * (t40.unwrap() - t10.unwrap()) as f32 / rate
}

// The decay of the mids (the octave around 1 kHz), as rooms are measured.
fn mids(signal: &[f32], rate: f32) -> Vec<f32> {
    let band = Coefficients::design(Shape::BandPass, rate, 1000.0, 1.41, 0.0);
    let mut section = Section::default();
    signal.iter().map(|x| section.tick(&band, *x)).collect()
}

fn reverb_at(rate: f32, space: usize, decay_s: f32) -> Reverb {
    let mut reverb = Reverb::new();
    reverb.set_param(reverb::SPACE, space as f32);
    reverb.set_param(reverb::DECAY_S, decay_s);
    reverb.set_param(reverb::MIX, 1.0);
    reverb.set_param(reverb::PREDELAY_MS, 0.0);
    reverb.prepare(rate, BLOCK);
    reverb.reset();
    reverb
}

#[test]
fn every_space_decays_in_the_time_asked() {
    let cases = [
        (44100.0, 2.0),
        (48000.0, 1.0),
        (48000.0, 5.0),
        (96000.0, 2.0),
    ];
    for (rate, decay) in cases {
        for space in 0..5 {
            let mut reverb = reverb_at(rate, space, decay);
            let frames = ((decay + 0.5) * rate) as usize;
            let (left, right) = run(&mut reverb, &impulse(frames, 0), &impulse(frames, 0));
            assert!(left.iter().chain(&right).all(|x| x.is_finite()));
            let measured = rt60(&mids(&left, rate), &mids(&right, rate), rate);
            assert!(
                (measured / decay - 1.0).abs() < 0.15,
                "space {space} at {rate} Hz: RT60 {measured} s for {decay} s"
            );
            assert_ne!(left, right, "space {space}: both sides alike");
        }
    }
}

#[test]
fn spaces_have_their_own_early_pattern() {
    // Energy in the first 30 ms, before the tank has built up: the chamber's
    // dense walls are there, the plate starts dense with no wall at all.
    let early = |space: usize| {
        let mut reverb = reverb_at(RATE, space, 2.0);
        reverb.set_param(reverb::DIFFUSION, 0.0);
        reverb.reset();
        let (left, _) = run(&mut reverb, &impulse(4800, 0), &impulse(4800, 0));
        left[..1440].iter().filter(|x| x.abs() > 1.0e-3).count()
    };
    let (room, plate, chamber) = (early(0), early(2), early(3));
    assert!(
        chamber > plate && room > plate,
        "room {room} plate {plate} chamber {chamber}"
    );
}

#[test]
fn freeze_holds_the_tail_and_closes_the_input() {
    let mut reverb = reverb_at(RATE, 1, 2.0);
    let second = RATE as usize;
    run(
        &mut reverb,
        &noise(second / 2, 0.5),
        &noise(second / 2, 0.5),
    );
    reverb.set_param(reverb::FREEZE, 1.0);
    assert_eq!(reverb.tail_frames(), u32::MAX);
    // Loud input while frozen must not enter the tank.
    let (held, _) = run(
        &mut reverb,
        &noise(8 * second, 0.5),
        &noise(8 * second, 0.5),
    );
    let early = energy(&held[second..2 * second]);
    let late = energy(&held[7 * second..8 * second]);
    assert!(late > early * 0.5, "frozen tail fell {early} -> {late}");
    assert!(late < early * 2.0, "frozen tail grew {early} -> {late}");
    assert!(held.iter().all(|x| x.is_finite() && x.abs() < 4.0));
    reverb.set_param(reverb::FREEZE, 0.0);
    let silence = vec![0.0; 6 * second];
    let (released, _) = run(&mut reverb, &silence, &silence);
    assert!(energy(&released[5 * second..]) < energy(&released[..second]) * 1.0e-3);
}

#[test]
fn reverb_parameters_glide_without_steps() {
    let mut reverb = reverb_at(RATE, 1, 2.0);
    let input = sine(220.0, RATE as usize * 3, 0.5, RATE);
    let (half, rest) = input.split_at(RATE as usize);
    let (before, _) = run(&mut reverb, half, half);
    reverb.set_param(reverb::SIZE, 1.0);
    reverb.set_param(reverb::DECAY_S, 8.0);
    reverb.set_param(reverb::LOW_CUT_HZ, 610.0);
    reverb.set_param(reverb::SPACE, 3.0);
    let (after, _) = run(&mut reverb, rest, rest);
    let step = |s: &[f32]| {
        s.windows(2)
            .map(|w| (w[1] - w[0]).abs())
            .fold(0.0, f32::max)
    };
    assert!(after.iter().all(|x| x.is_finite()));
    assert!(
        step(&after) < step(&before) * 2.0,
        "{} vs {}",
        step(&after),
        step(&before)
    );
}

#[test]
fn echo_on_the_tempo_lands_on_the_eighth_note() {
    let mut echo = Echo::new();
    echo.set_param(delay::MIX, 1.0);
    echo.set_param(delay::SYNC, 2.0); // 1/8
    echo.set_param(delay::TEMPO_BPM, 120.0);
    echo.prepare(RATE, BLOCK);
    echo.reset();
    let input = impulse(24000, 0);
    let (left, _) = run(&mut echo, &input, &input);
    let peak = (1..24000)
        .max_by(|&a, &b| left[a].abs().total_cmp(&left[b].abs()))
        .unwrap();
    assert_eq!(peak, 12000, "250 ms at 120 bpm");
    // Dotted eighth at 90 bpm: 500 ms.
    echo.set_param(delay::SYNC, 3.0);
    echo.set_param(delay::TEMPO_BPM, 90.0);
    echo.reset();
    let input = impulse(36000, 0);
    let (left, _) = run(&mut echo, &input, &input);
    let peak = (1..36000)
        .max_by(|&a, &b| left[a].abs().total_cmp(&left[b].abs()))
        .unwrap();
    assert_eq!(peak, 24000);
}

#[test]
fn ping_pong_repeats_alternate_sides() {
    let mut echo = Echo::new();
    echo.set_param(delay::MIX, 1.0);
    echo.set_param(delay::TIME_MS, 100.0);
    echo.set_param(delay::MODE, 2.0);
    echo.prepare(RATE, BLOCK);
    echo.reset();
    let input = impulse(24000, 0);
    let (left, right) = run(&mut echo, &input, &input);
    let window = |s: &[f32], at: usize| {
        s[at - 50..at + 50]
            .iter()
            .fold(0.0f32, |p, x| p.max(x.abs()))
    };
    assert!(window(&left, 4800) > 0.5 && window(&right, 4800) < 1.0e-3);
    assert!(window(&right, 9600) > 0.1 && window(&left, 9600) < 1.0e-3);
    assert!(window(&left, 14400) > 0.01 && window(&right, 14400) < 1.0e-3);
}

#[test]
fn tape_repeats_waver_and_darken() {
    let repeats = |mode: f32| {
        let mut echo = Echo::new();
        echo.set_param(delay::MIX, 1.0);
        echo.set_param(delay::TIME_MS, 100.0);
        echo.set_param(delay::FEEDBACK_DB, -3.0);
        echo.set_param(delay::MODE, mode);
        echo.prepare(RATE, BLOCK);
        echo.reset();
        let input = sine(6000.0, 2400, 0.5, RATE);
        let mut signal = input.clone();
        signal.resize(48000, 0.0);
        let (left, _) = run(&mut echo, &signal, &signal);
        // The fourth repeat's level of 6 kHz.
        rms(&left[19200 + 400..19200 + 2000])
    };
    let (digital, tape) = (repeats(0.0), repeats(1.0));
    assert!(tape < digital * 0.5, "tape {tape} digital {digital}");
    assert!(tape > 0.0);
}

// Zero-crossing periods of a sine through a modulated delay vary.
fn period_spread(signal: &[f32]) -> f32 {
    let crossings: Vec<f32> = signal
        .windows(2)
        .enumerate()
        .filter(|(_, w)| w[0] <= 0.0 && w[1] > 0.0)
        .map(|(n, w)| n as f32 + w[0] / (w[0] - w[1]))
        .collect();
    let periods: Vec<f32> = crossings.windows(2).map(|w| w[1] - w[0]).collect();
    let (lo, hi) = periods
        .iter()
        .fold((f32::MAX, 0.0f32), |(lo, hi), p| (lo.min(*p), hi.max(*p)));
    hi - lo
}

#[test]
fn chorus_moves_the_pitch_and_opens_the_sides() {
    let input = sine(1000.0, 96000, 0.5, RATE);
    let mut still = Chorus::new();
    still.set_param(chorus::MIX, 1.0);
    still.set_param(chorus::DEPTH, 0.0);
    still.prepare(RATE, BLOCK);
    still.reset();
    let (flat, _) = run(&mut still, &input, &input);
    let mut chorus = Chorus::new();
    chorus.set_param(chorus::MIX, 1.0);
    chorus.set_param(chorus::VOICES, 0.0); // 2 voices
    chorus.prepare(RATE, BLOCK);
    chorus.reset();
    let (left, right) = run(&mut chorus, &input, &input);
    let (flat, moved) = (period_spread(&flat[4800..]), period_spread(&left[4800..]));
    assert!(flat < 0.03 && moved > 0.3, "still {flat}, moving {moved}");
    assert!(
        left.iter().zip(&right).any(|(l, r)| (l - r).abs() > 0.05),
        "stereo"
    );
}

// RMS in 21 ms windows: a sweeping comb makes a steady sine rise and fall.
fn level_swing(signal: &[f32]) -> f32 {
    let levels: Vec<f32> = signal.chunks(1008).map(rms).collect();
    let (lo, hi) = levels
        .iter()
        .fold((f32::MAX, 0.0f32), |(lo, hi), x| (lo.min(*x), hi.max(*x)));
    hi / lo.max(1.0e-9)
}

#[test]
fn flanger_and_phaser_sweep_their_notches() {
    let input = sine(1000.0, 4 * 48000, 0.5, RATE);
    let mut flanger = Flanger::new();
    flanger.set_param(flanger::RATE_HZ, 0.5);
    flanger.prepare(RATE, BLOCK);
    flanger.reset();
    let (left, _) = run(&mut flanger, &input, &input);
    assert!(left.iter().all(|x| x.is_finite() && x.abs() < 2.0));
    assert!(
        level_swing(&left[4800..]) > 3.0,
        "flanger {}",
        level_swing(&left[4800..])
    );
    let mut phaser = Phaser::new();
    phaser.set_param(phaser::RATE_HZ, 0.5);
    phaser.set_param(phaser::STAGES, 2.0); // 8 stages
    phaser.prepare(RATE, BLOCK);
    phaser.reset();
    let (left, _) = run(&mut phaser, &input, &input);
    assert!(left.iter().all(|x| x.is_finite() && x.abs() < 2.0));
    assert!(
        level_swing(&left[4800..]) > 3.0,
        "phaser {}",
        level_swing(&left[4800..])
    );
}

#[test]
fn tremolo_dips_the_level_and_auto_pan_swaps_the_sides() {
    let input = vec![0.5; 48000];
    let mut tremolo = Tremolo::new();
    tremolo.set_param(tremolo::DEPTH, 1.0);
    tremolo.prepare(RATE, BLOCK);
    tremolo.reset();
    let (left, right) = run(&mut tremolo, &input, &input);
    let (lo, hi) = left[4800..]
        .iter()
        .fold((f32::MAX, 0.0f32), |(lo, hi), x| (lo.min(*x), hi.max(*x)));
    assert!(lo < 0.01 && hi > 0.49, "{lo} {hi}");
    assert_eq!(left, right);
    tremolo.set_param(tremolo::MODE, 1.0);
    tremolo.set_param(tremolo::SHAPE, 1.0);
    tremolo.reset();
    let (left, right) = run(&mut tremolo, &input, &input);
    // One side is always whole, the other dips: they never fall together.
    assert!(left.iter().zip(&right).all(|(l, r)| l.max(*r) > 0.49));
    assert!(left.iter().any(|x| *x < 0.05) && right.iter().any(|x| *x < 0.05));
}

fn saturator(mode: f32, drive_db: f32) -> Saturator {
    let mut saturator = Saturator::new();
    saturator.set_param(saturator::MODE, mode);
    saturator.set_param(saturator::DRIVE_DB, drive_db);
    saturator.prepare(RATE, BLOCK);
    saturator.reset();
    saturator
}

#[test]
fn saturator_characters_make_their_harmonics() {
    let input = sine(1000.0, 52800, 0.5, RATE);
    let harmonics = |mode: f32| {
        let mut saturator = saturator(mode, 12.0);
        let (left, _) = run(&mut saturator, &input, &input);
        let window = &left[4800..52800];
        let fundamental = tone(window, 1000.0, RATE);
        (
            db(tone(window, 2000.0, RATE) / fundamental),
            db(tone(window, 3000.0, RATE) / fundamental),
        )
    };
    let (tape_2, tape_3) = harmonics(0.0);
    let (tube_2, _) = harmonics(1.0);
    assert!(tape_3 > -30.0 && tape_2 < -60.0, "tape {tape_2} {tape_3}");
    assert!(tube_2 > -30.0, "tube {tube_2}");
    // The transformer bends the lows more than the mids.
    let thd = |frequency: f32| {
        let mut saturator = saturator(2.0, 12.0);
        let input = sine(frequency, 52800, 0.25, RATE);
        let (left, _) = run(&mut saturator, &input, &input);
        let window = &left[4800..52800];
        db(tone(window, 3.0 * frequency, RATE) / tone(window, frequency, RATE))
    };
    assert!(
        thd(60.0) > thd(2000.0) + 6.0,
        "{} {}",
        thd(60.0),
        thd(2000.0)
    );
}

#[test]
fn saturator_oversampling_keeps_aliasing_down() {
    // A 7 kHz tone through the biased tube curve: at the device rate its
    // 5th to 8th harmonics fold to 13, 6, 1 and 8 kHz; oversampled they are
    // filtered out before coming back down.
    let input = sine(7000.0, 52800, 0.5, RATE);
    let mut saturator = saturator(1.0, 12.0);
    let (left, _) = run(&mut saturator, &input, &input);
    let drive = 10f32.powf(12.0 / 20.0);
    let naive: Vec<f32> = input
        .iter()
        .map(|x| (x * drive + 0.34).tanh() - 0.34f32.tanh())
        .collect();
    let alias = |signal: &[f32]| {
        let window = &signal[4800..52800];
        let fundamental = tone(window, 7000.0, RATE);
        [13000.0, 6000.0, 1000.0, 8000.0]
            .iter()
            .map(|f| db(tone(window, *f, RATE) / fundamental))
            .fold(f64::MIN, f64::max)
    };
    let (oversampled, plain) = (alias(&left), alias(&naive));
    assert!(plain > -50.0, "the naive curve aliases: {plain}");
    assert!(oversampled < plain - 30.0, "{oversampled} vs {plain}");
}

#[test]
fn saturator_reports_its_latency_and_the_dry_lines_up() {
    let mut blend = saturator(0.0, 12.0);
    blend.set_param(saturator::MIX, 0.0);
    blend.reset();
    let latency = blend.latency_frames() as usize;
    assert_eq!(latency, 23);
    let input = noise(4800, 0.5);
    let (left, _) = run(&mut blend, &input, &input);
    for n in latency..4800 {
        assert!((left[n] - input[n - latency]).abs() < 1.0e-6);
    }
    // Fully wet, a small sine comes back aligned with the dry (linear phase).
    let mut wet = saturator(1.0, 0.0);
    let input = sine(440.0, 9600, 0.01, RATE);
    let (left, _) = run(&mut wet, &input, &input);
    let error = (4800..9600)
        .map(|n| (left[n] - input[n - latency]).abs())
        .fold(0.0f32, f32::max);
    assert!(error < 0.002, "{error}");
}

#[test]
fn fuzz_gate_closes_on_silence() {
    let mut fuzz = saturator(3.0, 36.0);
    let mut input = sine(220.0, 24000, 0.5, RATE);
    input.extend(noise(24000, 0.0003));
    let (left, _) = run(&mut fuzz, &input, &input);
    assert!(rms(&left[4800..24000]) > 0.05);
    assert!(rms(&left[36000..]) < 1.0e-4, "{}", rms(&left[36000..]));
}

#[test]
fn lofi_rounds_to_its_bits_and_holds_at_its_rate() {
    let mut lofi = Lofi::new();
    lofi.set_param(lofi::BITS, 3.0);
    lofi.set_param(lofi::RATE_HZ, 12000.0);
    lofi.prepare(RATE, BLOCK);
    lofi.reset();
    let input = sine(440.0, 4800, 0.9, RATE);
    let (left, _) = run(&mut lofi, &input, &input);
    assert!(
        left.iter()
            .all(|x| (x * 4.0 - (x * 4.0).round()).abs() < 1.0e-6)
    );
    assert!(
        left.chunks(4)
            .all(|held| held.iter().all(|x| *x == held[0]))
    );
    let levels: std::collections::BTreeSet<i32> = left.iter().map(|x| (x * 4.0) as i32).collect();
    assert!(levels.len() <= 9);
    let mut clean = Lofi::new();
    clean.set_param(lofi::BITS, 16.0);
    clean.set_param(lofi::RATE_HZ, 48000.0);
    clean.prepare(RATE, BLOCK);
    clean.reset();
    let (left, _) = run(&mut clean, &input, &input);
    assert!(left.iter().zip(&input).all(|(a, b)| (a - b).abs() < 3.1e-5));
}
