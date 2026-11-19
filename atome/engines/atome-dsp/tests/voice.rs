// Voice effects measured on synthetic signals: pitch shifter, tuner,
// vocoder, harmonizer, doubler and noise reduction.

use atome_dsp::biquad::{Biquad, Shape};
use atome_dsp::denoise::{self, Denoise};
use atome_dsp::doubler::{self, Doubler};
use atome_dsp::harmonizer::Harmonizer;
use atome_dsp::pitch::{self, PitchShift};
use atome_dsp::tuner::{self, Tuner};
use atome_dsp::vocoder::{self, Vocoder};
use atome_dsp::{KeyBlock, Processor, StereoBlock, amplitude_to_db};
use std::f32::consts::TAU;

const RATE: f32 = 48000.0;
const BLOCK: usize = 128;

fn sine(frequency: f32, frames: usize, amplitude: f32, rate: f32) -> Vec<f32> {
    (0..frames)
        .map(|n| amplitude * (TAU * frequency * n as f32 / rate).sin())
        .collect()
}

fn noise(frames: usize, amplitude: f32, seed: u32) -> Vec<f32> {
    let mut state = seed;
    (0..frames)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            amplitude * ((state as f32 / u32::MAX as f32) * 2.0 - 1.0)
        })
        .collect()
}

fn run(processor: &mut dyn Processor, input: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let mut left = input.to_vec();
    let mut right = input.to_vec();
    for start in (0..input.len()).step_by(BLOCK) {
        let end = (start + BLOCK).min(input.len());
        processor.process(&mut StereoBlock::new(
            &mut left[start..end],
            &mut right[start..end],
        ));
    }
    (left, right)
}

fn run_keyed(processor: &mut dyn Processor, input: &[f32], key: &[f32]) -> Vec<f32> {
    let mut left = input.to_vec();
    let mut right = input.to_vec();
    for start in (0..input.len()).step_by(BLOCK) {
        let end = (start + BLOCK).min(input.len());
        processor.process_keyed(
            &mut StereoBlock::new(&mut left[start..end], &mut right[start..end]),
            KeyBlock {
                left: &key[start..end],
                right: &key[start..end],
            },
        );
    }
    left
}

fn rms(samples: &[f32]) -> f32 {
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len().max(1) as f32).sqrt()
}

// Rising zero crossings, linearly interpolated: the period of a clean tone.
fn frequency(samples: &[f32], rate: f32) -> f32 {
    let mut crossings = Vec::new();
    for (index, pair) in samples.windows(2).enumerate() {
        if pair[0] < 0.0 && pair[1] >= 0.0 {
            crossings.push(index as f32 + pair[0] / (pair[0] - pair[1]));
        }
    }
    let span = crossings.last().unwrap() - crossings.first().unwrap();
    (crossings.len() - 1) as f32 * rate / span
}

// Amplitude of the component at `hz` (Goertzel over a Hann window).
fn tone(samples: &[f32], hz: f32, rate: f32) -> f32 {
    let count = samples.len() as f32;
    let (mut re, mut im) = (0.0f64, 0.0f64);
    let mut window_sum = 0.0f64;
    for (n, sample) in samples.iter().enumerate() {
        let w = 0.5 - 0.5 * (TAU * n as f32 / count).cos();
        let angle = (TAU as f64) * (hz as f64) * n as f64 / rate as f64;
        re += (sample * w) as f64 * angle.cos();
        im -= (sample * w) as f64 * angle.sin();
        window_sum += w as f64;
    }
    (2.0 * (re * re + im * im).sqrt() / window_sum) as f32
}

fn shifted(semitones: f32) -> f32 {
    let mut shift = PitchShift::new();
    shift.prepare(RATE, BLOCK);
    shift.set_param(pitch::SEMITONES, semitones);
    shift.reset();
    let (left, right) = run(&mut shift, &sine(220.0, 48000, 0.5, RATE));
    assert!(left.iter().chain(&right).all(|s| s.is_finite()));
    assert!(rms(&left[24000..]) > 0.05, "level {}", rms(&left[24000..]));
    frequency(&left[24000..], RATE)
}

#[test]
fn pitch_shift_lands_an_octave_and_a_fifth_up() {
    let octave = shifted(12.0);
    assert!((octave / 440.0 - 1.0).abs() < 0.01, "octave {octave}");
    let fifth = shifted(7.0);
    assert!((fifth / 329.63 - 1.0).abs() < 0.01, "fifth {fifth}");
    let down = shifted(-12.0);
    assert!((down / 110.0 - 1.0).abs() < 0.01, "down {down}");
}

// Energy-weighted mean frequency over the harmonics of `root`.
fn centroid(samples: &[f32], root: f32) -> f32 {
    let (mut weighted, mut total) = (0.0, 0.0);
    for harmonic in 1..=(6000.0 / root) as usize {
        let hz = root * harmonic as f32;
        let power = tone(samples, hz, RATE).powi(2);
        weighted += hz * power;
        total += power;
    }
    weighted / total
}

#[test]
fn formants_stay_unless_moved() {
    // A 150 Hz buzz through one resonance at 1 kHz: a vowel-like formant.
    let buzz: Vec<f32> = (0..48000)
        .map(|n| ((n as f32 * 150.0 / RATE).fract() * 2.0 - 1.0) * 0.3)
        .collect();
    let mut resonance = Biquad::new(Shape::BandPass, 1000.0, 3.0, 0.0);
    resonance.prepare(RATE, BLOCK);
    let (voice, _) = run(&mut resonance, &buzz);
    let original = centroid(&voice[24000..], 150.0);
    let measure = |formant: f32| {
        let mut shift = PitchShift::new();
        shift.prepare(RATE, BLOCK);
        shift.set_param(pitch::SEMITONES, 12.0);
        shift.set_param(pitch::FORMANT, formant);
        shift.reset();
        let (left, _) = run(&mut shift, &voice);
        centroid(&left[24000..], 300.0)
    };
    let kept = measure(0.0);
    let moved = measure(12.0);
    assert!(
        (kept / original - 1.0).abs() < 0.15,
        "kept {kept} vs {original}"
    );
    assert!(moved > 1.6 * original, "moved {moved} vs {original}");
}

#[test]
fn unity_pitch_shift_is_the_input_delayed_by_its_latency() {
    let mut shift = PitchShift::new();
    shift.prepare(RATE, BLOCK);
    let latency = shift.latency_frames() as usize;
    let input = noise(24000, 0.3, 7);
    let (left, _) = run(&mut shift, &input);
    let error = (latency + 4096..24000)
        .map(|n| (left[n] - input[n - latency]).abs())
        .fold(0.0, f32::max);
    assert!(error < 1.0e-3, "error {error}");
}

#[test]
fn tuner_snaps_225_hz_to_a3_in_chromatic() {
    let mut tuner = Tuner::new();
    tuner.prepare(RATE, BLOCK);
    tuner.set_param(tuner::SPEED_MS, 0.0);
    let (left, _) = run(&mut tuner, &sine(225.0, 48000, 0.5, RATE));
    let corrected = frequency(&left[24000..], RATE);
    assert!(
        (corrected / 220.0 - 1.0).abs() < 0.01,
        "corrected {corrected}"
    );
}

// 230 Hz lies nearer A♯3 (233.1 Hz) than A3: chromatic takes A♯, C major,
// which has no A♯, brings it down to A3.
#[test]
fn tuner_snaps_230_hz_to_a3_in_c_major() {
    let mut tuner = Tuner::new();
    tuner.prepare(RATE, BLOCK);
    tuner.set_param(tuner::SCALE, 1.0);
    let (left, _) = run(&mut tuner, &sine(230.0, 48000, 0.5, RATE));
    let corrected = frequency(&left[24000..], RATE);
    assert!(
        (corrected / 220.0 - 1.0).abs() < 0.01,
        "corrected {corrected}"
    );
    let readings = tuner.readings();
    assert!(
        (readings[0] - 230.0).abs() < 1.0,
        "detected {}",
        readings[0]
    );
    assert!((readings[1] + 77.0).abs() < 2.0, "cents {}", readings[1]);
}

#[test]
fn tuner_passes_silence_and_noise_untouched() {
    let mut tuner = Tuner::new();
    tuner.prepare(RATE, BLOCK);
    let latency = tuner.latency_frames() as usize;
    let input = noise(24000, 0.2, 3);
    let (left, _) = run(&mut tuner, &input);
    let error = (latency..24000)
        .map(|n| (left[n] - input[n - latency]).abs())
        .fold(0.0, f32::max);
    assert!(error < 1.0e-3, "error {error}");
    assert_eq!(tuner.readings()[0], 0.0);
}

#[test]
fn vocoder_follows_the_voice_and_sings_the_carrier_pitch() {
    let mut vocoder = Vocoder::new();
    vocoder.prepare(RATE, BLOCK);
    // A3 = 220 Hz carrier, a burst of noise as the voice, then silence.
    vocoder.set_param(vocoder::PITCH, 57.0);
    let mut voice = noise(24000, 0.3, 11);
    voice.extend(std::iter::repeat_n(0.0, 24000));
    let (left, _) = run(&mut vocoder, &voice);
    assert!(left.iter().all(|s| s.is_finite()));
    let singing = &left[4800..19200];
    let after = &left[40800..];
    assert!(rms(singing) > 0.01, "singing {}", rms(singing));
    assert!(
        amplitude_to_db(rms(after) / rms(singing)) < -60.0,
        "after {}",
        rms(after)
    );
    let harmonic = tone(singing, 220.0, RATE) + tone(singing, 440.0, RATE);
    let between = tone(singing, 330.0, RATE) + tone(singing, 550.0, RATE);
    assert!(harmonic > 5.0 * between, "{harmonic} vs {between}");
}

#[test]
fn vocoder_track_carrier_comes_from_the_key() {
    let mut vocoder = Vocoder::new();
    vocoder.prepare(RATE, BLOCK);
    vocoder.set_param(vocoder::CARRIER, 0.0);
    let carrier: Vec<f32> = (0..24000)
        .map(|n| ((n as f32 * 300.0 / RATE).fract() * 2.0 - 1.0) * 0.3)
        .collect();
    let silent = run_keyed(&mut vocoder, &vec![0.0; 24000], &carrier);
    assert!(
        rms(&silent[4800..]) < 1.0e-4,
        "silent {}",
        rms(&silent[4800..])
    );
    vocoder.reset();
    let output = run_keyed(&mut vocoder, &noise(24000, 0.3, 5), &carrier);
    let singing = &output[4800..];
    let harmonic = tone(singing, 300.0, RATE) + tone(singing, 600.0, RATE);
    let between = tone(singing, 450.0, RATE) + tone(singing, 750.0, RATE);
    assert!(harmonic > 5.0 * between, "{harmonic} vs {between}");
}

#[test]
fn harmonizer_adds_its_intervals() {
    let mut harmonizer = Harmonizer::new();
    harmonizer.prepare(RATE, BLOCK);
    let (left, right) = run(&mut harmonizer, &sine(220.0, 48000, 0.5, RATE));
    let both: Vec<f32> = left.iter().zip(&right).map(|(l, r)| l + r).collect();
    let tail = &both[24000..];
    let up = tone(tail, 220.0 * (3.0f32 / 12.0).exp2(), RATE);
    let down = tone(tail, 220.0 * (-5.0f32 / 12.0).exp2(), RATE);
    let dry = tone(tail, 220.0, RATE);
    let elsewhere = tone(tail, 300.0, RATE);
    assert!(dry > 0.5, "dry {dry}");
    assert!(up > 20.0 * elsewhere && up > 0.1, "up {up} vs {elsewhere}");
    assert!(
        down > 20.0 * elsewhere && down > 0.1,
        "down {down} vs {elsewhere}"
    );
    // Voice 1 leans left, voice 2 right.
    assert!(tone(&left[24000..], 261.63, RATE) > tone(&right[24000..], 261.63, RATE));
}

#[test]
fn doubler_adds_a_detuned_late_copy_and_is_transparent_dry() {
    let mut doubler = Doubler::new();
    doubler.prepare(RATE, BLOCK);
    let input = sine(220.0, 48000, 0.5, RATE);
    let (left, right) = run(&mut doubler, &input);
    assert!(left.iter().chain(&right).all(|s| s.is_finite()));
    let difference: Vec<f32> = left.iter().zip(&input).map(|(o, i)| o - i).collect();
    assert!(rms(&difference[4800..]) > 0.01);
    assert!(rms(&left[4800..]) > 0.2 && rms(&left[4800..]) < 0.5);
    doubler.set_param(doubler::MIX, 0.0);
    doubler.reset();
    let (dry, _) = run(&mut doubler, &input);
    assert_eq!(dry, input);
}

#[test]
fn denoise_lowers_white_noise_and_keeps_a_tone() {
    let frames = 4 * 48000;
    let hiss = noise(frames, 0.05, 9);
    let mut denoise = Denoise::new();
    denoise.prepare(RATE, BLOCK);
    let (left, _) = run(&mut denoise, &hiss);
    let tail = 2 * 48000;
    let lowered = amplitude_to_db(rms(&left[tail..]) / rms(&hiss[tail..]));
    assert!(lowered < -10.0, "lowered {lowered} dB");
    let floor = denoise.readings()[0];
    let actual = amplitude_to_db(rms(&hiss));
    assert!((floor - actual).abs() < 3.0, "floor {floor} vs {actual}");

    let mut denoise = Denoise::new();
    denoise.prepare(RATE, BLOCK);
    let quiet = noise(frames, 0.003, 13);
    let input: Vec<f32> = sine(1000.0, frames, 0.5, RATE)
        .iter()
        .zip(&quiet)
        .map(|(s, n)| s + n)
        .collect();
    let latency = denoise.latency_frames() as usize;
    let (left, _) = run(&mut denoise, &input);
    let kept = tone(&left[tail..], 1000.0, RATE)
        / tone(&input[tail - latency..frames - latency], 1000.0, RATE);
    assert!(
        amplitude_to_db(kept).abs() < 1.0,
        "kept {} dB",
        amplitude_to_db(kept)
    );
    let _ = denoise::PARAMS;
}

#[test]
fn every_voice_effect_stays_finite_at_every_rate() {
    for rate in [44100.0, 48000.0, 96000.0] {
        let input: Vec<f32> = sine(180.0, 24000, 0.4, rate)
            .iter()
            .zip(noise(24000, 0.1, 21))
            .map(|(s, n)| s + n)
            .collect();
        let processors: Vec<Box<dyn Processor>> = vec![
            Box::new(PitchShift::new()),
            Box::new(Harmonizer::new()),
            Box::new(Tuner::new()),
            Box::new(Doubler::new()),
            Box::new(Denoise::new()),
            Box::new(Vocoder::new()),
        ];
        for mut processor in processors {
            processor.prepare(rate, BLOCK);
            for spec in processor.params() {
                processor.set_param(spec.id, spec.max);
            }
            let (left, right) = run(processor.as_mut(), &input);
            assert!(
                left.iter()
                    .chain(&right)
                    .all(|s| s.is_finite() && s.abs() < 8.0)
            );
        }
    }
}
