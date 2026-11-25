// R-372, heard: the Pitch module's vibrato swings the pitch by the cents and at
// the rate it is set to, grows in over its delay after a silence, and a ramp of
// its pitch drawn by automation (one value per block, as the mixer sends it) is
// followed smoothly, with no step and no click. The pitch heard is read back by
// the voice bricks' YIN (yin.rs).

use atome_dsp::pitch::{PitchShift, SEMITONES, VIBRATO_DELAY_MS, VIBRATO_DEPTH, VIBRATO_RATE_HZ};
use atome_dsp::yin::Yin;
use atome_dsp::{Processor, StereoBlock};
use std::f32::consts::TAU;

const RATE: f32 = 48_000.0;
const BLOCK: usize = 128;
const HOP: usize = 256;

// A steady voice at `hz`: 13 harmonics, softer as they rise.
fn voice(seconds: f32, hz: f32) -> Vec<f32> {
    (0..(seconds * RATE) as usize)
        .map(|index| {
            let t = index as f32 / RATE;
            let fade = (t / 0.01).min(1.0);
            0.2 * fade
                * (1..=13)
                    .map(|k| (TAU * hz * k as f32 * t).sin() / k as f32)
                    .sum::<f32>()
        })
        .collect()
}

// The signal through the module, block by block; `automate(block_index, shift)` may set values first.
fn run(
    shift: &mut PitchShift,
    input: &[f32],
    mut automate: impl FnMut(usize, &mut PitchShift),
) -> Vec<f32> {
    shift.prepare(RATE, BLOCK);
    let mut out = Vec::with_capacity(input.len());
    for (index, chunk) in input.chunks(BLOCK).enumerate() {
        automate(index, shift);
        let mut left = chunk.to_vec();
        let mut right = chunk.to_vec();
        shift.process(&mut StereoBlock {
            left: &mut left,
            right: &mut right,
        });
        out.extend_from_slice(&left);
    }
    out
}

// The pitch heard every HOP frames, in semitones above `reference` Hz (NaN where unvoiced), with its time.
fn heard(signal: &[f32], reference: f32) -> Vec<(f32, f32)> {
    let mut yin = Yin::new(RATE);
    let size = yin.size();
    (0..signal.len().saturating_sub(size))
        .step_by(HOP)
        .map(|start| {
            let time = (start + size / 4) as f32 / RATE;
            let semitones = yin
                .detect(&signal[start..start + size])
                .map_or(f32::NAN, |hz| 12.0 * (hz / reference).log2());
            (time, semitones)
        })
        .collect()
}

fn between(readings: &[(f32, f32)], from: f32, to: f32) -> Vec<(f32, f32)> {
    readings
        .iter()
        .copied()
        .filter(|(time, value)| *time >= from && *time < to && value.is_finite())
        .collect()
}

// Peak-to-peak swing in cents, and the rate of the swing (its rising crossings of its mean per second).
fn swing(readings: &[(f32, f32)]) -> (f32, f32) {
    let mean = readings.iter().map(|r| r.1).sum::<f32>() / readings.len() as f32;
    let (low, high) = readings
        .iter()
        .fold((f32::MAX, f32::MIN), |(low, high), r| {
            (low.min(r.1), high.max(r.1))
        });
    // Each rising crossing at its interpolated time; the rate is the cycles between the first and the last.
    let crossings: Vec<f32> = readings
        .windows(2)
        .filter(|pair| pair[0].1 < mean && pair[1].1 >= mean)
        .map(|pair| {
            pair[0].0 + (pair[1].0 - pair[0].0) * (mean - pair[0].1) / (pair[1].1 - pair[0].1)
        })
        .collect();
    let rate = (crossings.len() - 1) as f32 / (crossings[crossings.len() - 1] - crossings[0]);
    ((high - low) * 100.0, rate)
}

#[test]
fn the_vibrato_swings_by_its_depth_at_its_rate() {
    let mut shift = PitchShift::new();
    shift.set_param(VIBRATO_DEPTH, 50.0);
    shift.set_param(VIBRATO_RATE_HZ, 5.0);
    let out = run(&mut shift, &voice(3.0, 220.0), |_, _| {});
    let (cents, rate) = swing(&between(&heard(&out, 220.0), 0.5, 2.8));
    println!("vibrato 50 cents at 5 Hz: heard {cents:.1} cents peak to peak at {rate:.2} Hz");
    assert!(
        (cents - 100.0).abs() < 13.0,
        "±50 cents: {cents:.1} cents peak to peak"
    );
    assert!((rate - 5.0).abs() < 0.1, "5 Hz: {rate:.2} Hz");
}

#[test]
fn without_depth_the_pitch_holds() {
    let mut shift = PitchShift::new();
    shift.set_param(VIBRATO_RATE_HZ, 8.0);
    let out = run(&mut shift, &voice(2.0, 220.0), |_, _| {});
    let (cents, _) = swing(&between(&heard(&out, 220.0), 0.3, 1.8));
    assert!(cents < 4.0, "no vibrato at 0 cents: {cents:.1} cents");
}

#[test]
fn the_vibrato_grows_in_over_its_delay_after_a_silence() {
    let mut shift = PitchShift::new();
    shift.set_param(VIBRATO_DEPTH, 50.0);
    shift.set_param(VIBRATO_RATE_HZ, 5.0);
    shift.set_param(VIBRATO_DELAY_MS, 1500.0);
    // A note, a half-second silence, then the note again: the delay starts over with it.
    let mut input = voice(2.5, 220.0);
    input.extend(std::iter::repeat_n(0.0, (0.5 * RATE) as usize));
    input.extend(voice(2.5, 220.0));
    let out = run(&mut shift, &input, |_, _| {});
    let readings = heard(&out, 220.0);
    let early = swing(&between(&readings, 0.1, 0.5)).0;
    let full = swing(&between(&readings, 1.7, 2.4)).0;
    let again = swing(&between(&readings, 3.1, 3.5)).0;
    println!(
        "delay 1.5 s: {early:.1} cents in the first 0.5 s, {full:.1} after the delay, {again:.1} after the silence"
    );
    assert!(early < 40.0, "the vibrato starts small: {early:.1} cents");
    assert!(
        (full - 100.0).abs() < 15.0,
        "then swings in full: {full:.1} cents"
    );
    assert!(
        again < 40.0,
        "a silence starts the delay over: {again:.1} cents"
    );
}

#[test]
fn a_ramp_of_the_pitch_is_followed_without_steps() {
    // An octave up over 2 s, written once per block as automation writes it.
    let seconds = 3.0;
    let ramp = |time: f32| (time.clamp(0.5, 2.5) - 0.5) * 6.0;
    let mut shift = PitchShift::new();
    let out = run(&mut shift, &voice(seconds, 220.0), |block, module| {
        module.set_param(SEMITONES, ramp((block * BLOCK) as f32 / RATE));
    });
    let readings = between(&heard(&out, 220.0), 0.2, 2.8);
    // The module answers late by its latency and its 34 ms smoothing: the heard ramp is the asked one, a little later.
    let lag = 0.034 + 1024.0 / RATE;
    let worst = readings
        .iter()
        .map(|(time, value)| ((value - ramp(time - lag)) * 100.0).abs())
        .fold(0.0f32, f32::max);
    let steps = readings
        .windows(2)
        .map(|pair| ((pair[1].1 - pair[0].1) * 100.0).abs())
        .fold(0.0f32, f32::max);
    // 6 semitones a second: 32 cents between two readings 5.3 ms apart.
    println!(
        "ramp: farthest {worst:.1} cents from the asked ramp, largest move between readings {steps:.1} cents (a smooth glide: 3.2)"
    );
    assert!(
        worst < 35.0,
        "the ramp is followed: {worst:.1} cents off at worst"
    );
    assert!(
        steps < 15.0,
        "no step: {steps:.1} cents between two readings"
    );
    let high = 10.0 * {
        let filtered: Vec<f32> = out.windows(3).map(|w| w[0] - 2.0 * w[1] + w[2]).collect();
        filtered.iter().map(|x| x * x).sum::<f32>() / out.iter().map(|x| x * x).sum::<f32>()
    }
    .log10();
    let source = voice(seconds, 220.0);
    let reference = 10.0 * {
        let filtered: Vec<f32> = source
            .windows(3)
            .map(|w| w[0] - 2.0 * w[1] + w[2])
            .collect();
        filtered.iter().map(|x| x * x).sum::<f32>() / source.iter().map(|x| x * x).sum::<f32>()
    }
    .log10();
    // The second difference weighs the highs: an octave up doubles every harmonic (+12 dB per octave), clicks far more.
    println!("ramp highs (second difference): {high:.1} dB, source {reference:.1} dB");
    assert!(
        high < reference + 14.0,
        "no click on the ramp: {high:.1} dB against {reference:.1} dB"
    );
}
