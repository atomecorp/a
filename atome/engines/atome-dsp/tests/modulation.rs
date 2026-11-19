// R-191: the control contract (modulators, audio-rate parameters, how a
// modulation adds up) and the per-module oversampling.

use atome_dsp::catalog::{ModuleAsset, ModuleKind};
use atome_dsp::oversample::Oversampled;
use atome_dsp::{ParamBuffer, Processor, StereoBlock};
use std::f32::consts::TAU;

const RATE: f32 = 48_000.0;

fn sine(frequency: f32, frames: usize, level: f32) -> Vec<f32> {
    (0..frames)
        .map(|index| level * (TAU * frequency * index as f32 / RATE).sin())
        .collect()
}

fn run(processor: &mut dyn Processor, input: &[f32], block: usize) -> Vec<f32> {
    let mut left = input.to_vec();
    let mut right = input.to_vec();
    for start in (0..input.len()).step_by(block) {
        let end = (start + block).min(input.len());
        let mut part = StereoBlock::new(&mut left[start..end], &mut right[start..end]);
        processor.process(&mut part);
    }
    left
}

fn built(key: &str) -> Box<dyn Processor> {
    let mut processor = ModuleKind::from_key(key)
        .unwrap()
        .build(ModuleAsset::None)
        .unwrap();
    processor.prepare(RATE, 4096);
    processor
}

fn rms(signal: &[f32]) -> f32 {
    (signal.iter().map(|value| value * value).sum::<f32>() / signal.len() as f32).sqrt()
}

// Goertzel magnitude of one frequency, normalised so a full-scale sine reads 1.
fn magnitude(signal: &[f32], frequency: f32) -> f32 {
    let omega = TAU * frequency / RATE;
    let coefficient = 2.0 * omega.cos();
    let (mut s1, mut s2) = (0.0f64, 0.0f64);
    for sample in signal {
        let s0 = f64::from(*sample) + f64::from(coefficient) * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    let power = s1 * s1 + s2 * s2 - f64::from(coefficient) * s1 * s2;
    (power.sqrt() * 2.0 / signal.len() as f64) as f32
}

#[test]
fn a_modulation_adds_in_the_parameter_unit_and_saturates_to_its_range() {
    let cutoff = atome_dsp::svf::PARAMS[0];
    assert_eq!(cutoff.modulate(1000.0, 1.0), 2000.0);
    assert_eq!(cutoff.modulate(1000.0, -1.0), 500.0);
    assert_eq!(cutoff.modulate(10_000.0, 3.0), 20_000.0);
    let gain = atome_dsp::gain::VOLUME_PARAMS[0];
    assert_eq!(gain.modulate(-6.0, -3.0), -9.0);
    assert_eq!(gain.modulate(6.0, 21.0), 12.0);
    assert!(!atome_dsp::svf::PARAMS[2].modulatable());
    assert!(cutoff.modulatable());
}

#[test]
fn modulators_pass_the_audio_and_write_their_control() {
    let input = sine(220.0, 60_000, 0.5);
    let mut lfo = built("lfo");
    lfo.set_param(atome_dsp::control::LFO_RATE_HZ, 2.0);
    let mut left = input.clone();
    let mut right = input.clone();
    let mut extremes = (0.0f32, 0.0f32);
    let mut crossings = 0;
    let mut last = 0.0f32;
    for start in (0..input.len()).step_by(500) {
        let end = (start + 500).min(input.len());
        let mut block = StereoBlock::new(&mut left[start..end], &mut right[start..end]);
        lfo.process(&mut block);
        let control = lfo.control(0);
        assert_eq!(control.len(), end - start);
        for value in control {
            extremes = (extremes.0.min(*value), extremes.1.max(*value));
            if last < 0.0 && *value >= 0.0 {
                crossings += 1;
            }
            last = *value;
        }
    }
    assert_eq!(left, input, "a modulator leaves the audio untouched");
    assert!(extremes.0 < -0.99 && extremes.1 > 0.99, "{extremes:?}");
    assert_eq!(crossings, 2, "2 Hz: upward zero crossings at 0.5 s and 1 s");

    let mut follower = built("follower");
    let loud = sine(220.0, 9600, 0.8);
    run(follower.as_mut(), &loud, 128);
    let level = follower.control(0).last().copied().unwrap();
    assert!((level - 0.8).abs() < 0.1, "follower {level}");
    run(follower.as_mut(), &vec![0.0; 48_000], 128);
    assert!(follower.control(0).last().copied().unwrap() < 0.01);
}

#[test]
fn the_svf_filters_and_follows_its_cutoff_at_every_frame() {
    let mut svf = built("svf");
    svf.set_param(atome_dsp::svf::CUTOFF_HZ, 500.0);
    svf.reset();
    let low = run(svf.as_mut(), &sine(100.0, 24_000, 0.5), 256);
    svf.reset();
    let high = run(svf.as_mut(), &sine(8000.0, 24_000, 0.5), 256);
    assert!(rms(&low[4800..]) > 0.3, "pass band");
    assert!(rms(&high[4800..]) < 0.01, "stop band");

    // A cutoff given per frame equals the filter set once at that value.
    let input = sine(3000.0, 4096, 0.5);
    let cutoff = vec![2000.0f32; 4096];
    let mut modulated = built("svf");
    let (mut left, mut right) = (input.clone(), input.clone());
    modulated.process_modulated(
        &mut StereoBlock::new(&mut left, &mut right),
        &[ParamBuffer {
            id: atome_dsp::svf::CUTOFF_HZ,
            values: &cutoff,
        }],
    );
    let mut fixed = built("svf");
    fixed.set_param(atome_dsp::svf::CUTOFF_HZ, 2000.0);
    fixed.reset();
    let reference = run(fixed.as_mut(), &input, 4096);
    for (a, b) in left.iter().zip(reference.iter()) {
        assert!((a - b).abs() < 1.0e-5);
    }

    // A cutoff swept per frame from 200 Hz to 8 kHz stays stable and finite.
    let sweep: Vec<f32> = (0..4096)
        .map(|index| 200.0 * (40.0f32).powf(index as f32 / 4096.0))
        .collect();
    let noise: Vec<f32> = (0..4096u32)
        .map(|index| ((index.wrapping_mul(2_654_435_761) >> 8) as f32 / 8_388_608.0) - 1.0)
        .collect();
    let (mut left, mut right) = (noise.clone(), noise);
    modulated.process_modulated(
        &mut StereoBlock::new(&mut left, &mut right),
        &[ParamBuffer {
            id: atome_dsp::svf::CUTOFF_HZ,
            values: &sweep,
        }],
    );
    assert!(
        left.iter()
            .all(|value| value.is_finite() && value.abs() < 4.0)
    );
}

#[test]
fn a_processor_without_audio_rate_parameters_takes_the_first_value() {
    let mut volume = built("volume");
    let values = vec![-6.0f32; 64];
    let input = vec![1.0f32; 64];
    let (mut left, mut right) = (input.clone(), input);
    volume.process_modulated(
        &mut StereoBlock::new(&mut left, &mut right),
        &[ParamBuffer {
            id: 0,
            values: &values,
        }],
    );
    assert!(!volume.audio_rate(0));
    assert!(left[63] < 0.99, "the gain moves toward −6 dB");
}

#[test]
fn the_biquad_sounds_the_same_however_the_host_cuts_its_blocks() {
    let input = sine(1500.0, 9000, 0.5);
    let render = |block: usize| {
        let mut filter = built("low_pass");
        filter.set_param(0, 4000.0);
        let mut out = Vec::new();
        let mut left = input.clone();
        let mut right = input.clone();
        for start in (0..input.len()).step_by(block) {
            if start == 288 {
                filter.set_param(0, 800.0);
            }
            let end = (start + block).min(input.len());
            filter.process(&mut StereoBlock::new(
                &mut left[start..end],
                &mut right[start..end],
            ));
        }
        out.extend_from_slice(&left);
        out
    };
    // The change lands at the same frame (3 × 96 = 288 = 9 × 32) in both cuts.
    let (a, b) = (render(96), render(32));
    assert_eq!(a, b);
}

#[test]
fn oversampling_declares_a_whole_latency_and_removes_the_aliasing() {
    for factor in [2usize, 4] {
        let mut pass = Oversampled::new(built("volume"), factor).unwrap();
        pass.prepare(RATE, 4096);
        let latency = pass.latency_frames() as usize;
        let mut impulse = vec![0.0f32; 512];
        impulse[10] = 1.0;
        let out = run(&mut pass, &impulse, 64);
        let peak = out
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.abs().total_cmp(&b.1.abs()))
            .map(|(index, _)| index)
            .unwrap();
        assert_eq!(peak, 10 + latency, "{factor}×: latency {latency}");
    }
    assert!(Oversampled::new(built("volume"), 3).is_err());

    // A hard clip of a 7 kHz sine: its 7th harmonic (49 kHz) folds to 1 kHz.
    let input = sine(7000.0, 48_000, 0.9);
    let alias = |factor: usize| {
        let mut clip = built("hard_clip");
        clip.set_param(0, 18.0);
        let out = if factor == 1 {
            run(clip.as_mut(), &input, 128)
        } else {
            let mut pass = Oversampled::new(clip, factor).unwrap();
            pass.prepare(RATE, 4096);
            run(&mut pass, &input, 128)
        };
        magnitude(&out[4800..], 1000.0)
    };
    let (plain, twice, four) = (alias(1), alias(2), alias(4));
    assert!(twice < plain * 0.3, "2×: {twice} against {plain}");
    assert!(four < twice, "4×: {four} against {twice}");
}
