// Behaviour of each brick measured on real signals.

use atome_dsp::biquad::{Biquad, Shape};
use atome_dsp::delay::{Echo, MIX, TIME_MS};
use atome_dsp::dynamics::{Compressor, Limiter};
use atome_dsp::envelope::{self, Envelope};
use atome_dsp::gain::{Pan, Volume, VOLUME_DB};
use atome_dsp::oscillator::{Oscillator, Waveform};
use atome_dsp::{amplitude_to_db, Chain, Processor, StereoBlock};

const RATE: f32 = 48000.0;
const BLOCK: usize = 64;

fn sine(frequency: f32, frames: usize, amplitude: f32) -> Vec<f32> {
    (0..frames).map(|n| amplitude * (std::f32::consts::TAU * frequency * n as f32 / RATE).sin()).collect()
}

// Runs a processor block by block over a stereo copy of `input`.
fn run(processor: &mut dyn Processor, input: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let mut left = input.to_vec();
    let mut right = input.to_vec();
    for start in (0..input.len()).step_by(BLOCK) {
        let end = (start + BLOCK).min(input.len());
        processor.process(&mut StereoBlock::new(&mut left[start..end], &mut right[start..end]));
    }
    (left, right)
}

fn rms(samples: &[f32]) -> f32 {
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len().max(1) as f32).sqrt()
}

#[test]
fn volume_reaches_its_target_without_a_step() {
    let mut volume = Volume::new(0.0);
    volume.prepare(RATE, BLOCK);
    volume.set_param(VOLUME_DB, -6.0);
    let (left, _) = run(&mut volume, &vec![1.0; 4800]);
    let largest_step = left.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0, f32::max);
    assert!(largest_step < 0.01, "step {largest_step}");
    assert!((amplitude_to_db(left[4799]) + 6.0).abs() < 0.05);
}

#[test]
fn centred_pan_is_transparent_and_hard_left_mutes_right() {
    let mut pan = Pan::new(0.0);
    pan.prepare(RATE, BLOCK);
    let (left, right) = run(&mut pan, &[0.5; 256]);
    assert_eq!((left[255], right[255]), (0.5, 0.5));
    let mut pan = Pan::new(-1.0);
    pan.prepare(RATE, BLOCK);
    let (left, right) = run(&mut pan, &[0.5; 256]);
    assert_eq!((left[255], right[255]), (0.5, 0.0));
}

#[test]
fn low_pass_keeps_the_bass_and_cuts_the_treble() {
    let measure = |frequency: f32| {
        let mut filter = Biquad::new(Shape::LowPass, 1000.0, 0.707, 0.0);
        filter.prepare(RATE, BLOCK);
        let (left, _) = run(&mut filter, &sine(frequency, 9600, 0.5));
        amplitude_to_db(rms(&left[4800..]) / (0.5 / 2f32.sqrt()))
    };
    assert!(measure(100.0).abs() < 0.5);
    assert!((measure(1000.0) + 3.0).abs() < 0.5);
    assert!(measure(8000.0) < -30.0);
}

#[test]
fn bell_boosts_its_centre_by_its_gain() {
    let mut bell = Biquad::new(Shape::Bell, 1000.0, 1.0, 6.0);
    bell.prepare(RATE, BLOCK);
    let (left, _) = run(&mut bell, &sine(1000.0, 9600, 0.25));
    let gain = amplitude_to_db(rms(&left[4800..]) / (0.25 / 2f32.sqrt()));
    assert!((gain - 6.0).abs() < 0.3, "gain {gain}");
}

#[test]
fn compressor_reduces_a_loud_signal_by_its_ratio() {
    let mut compressor = Compressor::new();
    compressor.prepare(RATE, BLOCK);
    // -6 dBFS peak, threshold -18, ratio 3: 12 dB over → 8 dB reduction.
    let (left, _) = run(&mut compressor, &sine(220.0, 48000, 0.5));
    let out_peak = left[24000..].iter().fold(0.0f32, |a, s| a.max(s.abs()));
    let reduction = amplitude_to_db(0.5) - amplitude_to_db(out_peak);
    assert!((reduction - 8.0).abs() < 1.0, "reduction {reduction}");
}

#[test]
fn limiter_never_lets_a_sample_over_the_ceiling_and_silences_nan() {
    let mut limiter = Limiter::new();
    limiter.prepare(RATE, BLOCK);
    let mut input = sine(440.0, 4800, 4.0);
    input[100] = f32::NAN;
    let (left, right) = run(&mut limiter, &input);
    let ceiling = 10f32.powf(-1.0 / 20.0);
    assert!(left.iter().chain(right.iter()).all(|s| s.is_finite() && s.abs() <= ceiling + 1.0e-6));
}

#[test]
fn echo_repeats_an_impulse_after_its_time() {
    let mut echo = Echo::new();
    echo.prepare(RATE, BLOCK);
    echo.set_param(TIME_MS, 100.0);
    echo.set_param(MIX, 1.0);
    // The impulse comes once the smoothed time has settled on 100 ms (4800 frames).
    let mut input = vec![0.0; 24000];
    input[9600] = 1.0;
    let (left, _) = run(&mut echo, &input);
    let first = left.iter().enumerate().skip(9601).max_by(|a, b| a.1.abs().total_cmp(&b.1.abs())).unwrap().0;
    assert!((first as i32 - 14400).abs() <= 1, "echo at {first}");
}

#[test]
fn saw_oscillator_is_band_limited_and_at_its_level() {
    let mut oscillator = Oscillator::new(Waveform::Saw, 440.0);
    oscillator.prepare(RATE, BLOCK);
    let (left, _) = run(&mut oscillator, &[0.0; 48000]);
    let level = amplitude_to_db(rms(&left[24000..]) * 3f32.sqrt());
    assert!((level + 12.0).abs() < 0.5, "level {level}");
    assert!(left.iter().all(|s| s.abs() <= 0.3));
}

#[test]
fn envelope_follows_gate_on_and_off() {
    let mut env = Envelope::new();
    env.prepare(RATE, BLOCK);
    env.set_param(envelope::GATE, 1.0);
    let (on, _) = run(&mut env, &[1.0; 24000]);
    assert!((on[23999] - 0.6).abs() < 1.0e-3);
    env.set_param(envelope::GATE, 0.0);
    let (off, _) = run(&mut env, &[1.0; 24000]);
    assert_eq!(off[23999], 0.0);
    assert!(env.is_idle());
}

#[test]
fn bypassed_echo_rings_out_over_the_dry_signal() {
    let mut chain = Chain::new();
    let mut echo = Echo::new();
    echo.set_param(TIME_MS, 50.0);
    echo.set_param(MIX, 0.5);
    chain.push(Box::new(echo));
    chain.prepare(RATE, BLOCK);
    let mut input = vec![0.0; 9600];
    input[4800] = 1.0;
    run(&mut chain, &input);
    chain.set_bypass(0, true);
    let (tail, _) = run(&mut chain, &vec![0.0; 9600]);
    assert!(tail.iter().any(|s| s.abs() > 1.0e-3), "tail cut");
}

#[test]
fn the_render_guard_flushes_denormals_and_restores() {
    use atome_dsp::denormal::FlushDenormals;
    let before = FlushDenormals::active();
    {
        let _guard = FlushDenormals::new();
        if cfg!(any(target_arch = "x86_64", target_arch = "aarch64")) {
            assert!(FlushDenormals::active());
            let tiny = std::hint::black_box(f32::MIN_POSITIVE);
            assert_eq!(std::hint::black_box(tiny * 0.5), 0.0, "a denormal result is flushed");
        }
    }
    assert_eq!(FlushDenormals::active(), before);
}
