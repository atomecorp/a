// The parametric EQ measured on real signals.

use atome_dsp::eq::{
    self, ANALYSE, BAND_COUNT, DYNAMIC_DB, Equalizer, FREQ_HZ, GAIN_DB, ON, PARAMS, Q,
    THRESHOLD_DB, TYPE, band_param,
};
use atome_dsp::spectrum::{self, BANDS};
use atome_dsp::{Processor, StereoBlock, amplitude_to_db};

const BLOCK: usize = 64;
const BELL: f32 = 0.0;
const LOW_SHELF: f32 = 1.0;
const HIGH_PASS: f32 = 3.0;
const LOW_PASS: f32 = 4.0;

fn sine(rate: f32, frequency: f32, frames: usize, amplitude: f32) -> Vec<f32> {
    (0..frames)
        .map(|n| amplitude * (std::f32::consts::TAU * frequency * n as f32 / rate).sin())
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

fn rms(samples: &[f32]) -> f32 {
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len().max(1) as f32).sqrt()
}

// Gain in dB of a steady sine through `eq`, measured after it settles.
fn measured_db(eq: &mut Equalizer, rate: f32, frequency: f32, amplitude: f32) -> f32 {
    eq.reset();
    let frames = (rate * 1.5) as usize;
    let input = sine(rate, frequency, frames, amplitude);
    let (left, right) = run(eq, &input);
    let skip = frames / 3;
    assert!(left.iter().chain(&right).all(|s| s.is_finite()));
    amplitude_to_db(rms(&left[skip..])) - amplitude_to_db(rms(&input[skip..]))
}

fn equalizer(rate: f32) -> Equalizer {
    let mut eq = Equalizer::new();
    eq.prepare(rate, BLOCK);
    eq
}

// Applies `values` both to the processor and to a parameter vector.
fn apply(eq: &mut Equalizer, params: &mut [f32], values: &[(u32, f32)]) {
    for &(id, value) in values {
        eq.set_param(id, value);
        params[id as usize] = value;
    }
    eq.reset();
}

fn defaults() -> Vec<f32> {
    PARAMS.iter().map(|spec| spec.default).collect()
}

#[test]
fn params_and_readings_are_one_generated_table() {
    assert_eq!(PARAMS.len(), BAND_COUNT * 7 + 2);
    for (index, spec) in PARAMS.iter().enumerate() {
        assert_eq!(spec.id as usize, index);
    }
    assert_eq!(PARAMS[band_param(4, FREQ_HZ) as usize].key, "band5_freq_hz");
    assert_eq!(
        PARAMS[band_param(7, THRESHOLD_DB) as usize].key,
        "band8_threshold_db"
    );
    assert_eq!(PARAMS[band_param(0, TYPE) as usize].default, HIGH_PASS);
    assert_eq!(PARAMS[band_param(7, TYPE) as usize].default, LOW_PASS);
    assert_eq!(PARAMS[band_param(1, TYPE) as usize].default, LOW_SHELF);
    assert_eq!(eq::READINGS.len(), BANDS + BAND_COUNT);
    assert_eq!(eq::READINGS[0], "spectrum_0");
    assert_eq!(eq::READINGS[33], "spectrum_33");
    assert_eq!(eq::READINGS[34], "band1_gain_now");
    assert_eq!(eq::READINGS[41], "band8_gain_now");
}

#[test]
fn a_bell_raises_its_frequency_and_leaves_the_rest() {
    let rate = 48000.0;
    let mut eq = equalizer(rate);
    let mut params = defaults();
    let band = 2;
    apply(
        &mut eq,
        &mut params,
        &[
            (band_param(band, FREQ_HZ), 1000.0),
            (band_param(band, GAIN_DB), 6.0),
            (band_param(band, Q), 1.0),
        ],
    );
    let at_1k = measured_db(&mut eq, rate, 1000.0, 0.25);
    assert!((at_1k - 6.0).abs() < 0.2, "1 kHz {at_1k}");
    let at_100 = measured_db(&mut eq, rate, 100.0, 0.25);
    assert!(at_100.abs() < 0.3, "100 Hz {at_100}");
}

#[test]
fn a_high_pass_removes_the_rumble() {
    let rate = 44100.0;
    let mut eq = equalizer(rate);
    let mut params = defaults();
    apply(
        &mut eq,
        &mut params,
        &[(band_param(0, ON), 1.0), (band_param(0, FREQ_HZ), 100.0)],
    );
    let at_30 = measured_db(&mut eq, rate, 30.0, 0.25);
    assert!(at_30 < -18.0, "30 Hz {at_30}");
    let at_1k = measured_db(&mut eq, rate, 1000.0, 0.25);
    assert!(at_1k.abs() < 0.1, "1 kHz {at_1k}");
}

#[test]
fn response_db_matches_what_is_heard() {
    for rate in [44100.0, 48000.0, 96000.0] {
        let mut eq = equalizer(rate);
        let mut params = defaults();
        apply(
            &mut eq,
            &mut params,
            &[
                (band_param(0, ON), 1.0),
                (band_param(1, GAIN_DB), 5.0),
                (band_param(3, GAIN_DB), -8.0),
                (band_param(3, Q), 3.0),
                (band_param(4, TYPE), BELL),
                (band_param(4, GAIN_DB), 9.0),
                (band_param(6, GAIN_DB), -6.0),
                (band_param(7, ON), 1.0),
                (eq::OUTPUT_DB, -3.0),
            ],
        );
        for frequency in [55.0, 233.0, 610.0, 1597.0, 5000.0, 15000.0] {
            let heard = measured_db(&mut eq, rate, frequency, 0.125);
            let drawn = eq::response_db(&params, rate, frequency);
            assert!(
                (heard - drawn).abs() < 0.15,
                "{rate} Hz rate, {frequency} Hz: heard {heard}, drawn {drawn}"
            );
        }
    }
}

#[test]
fn a_dynamic_band_cuts_a_loud_tone_more_than_a_quiet_one() {
    let rate = 48000.0;
    let mut eq = equalizer(rate);
    let mut params = defaults();
    let band = 4;
    apply(
        &mut eq,
        &mut params,
        &[
            (band_param(band, FREQ_HZ), 1000.0),
            (band_param(band, DYNAMIC_DB), -12.0),
            (band_param(band, THRESHOLD_DB), -30.0),
        ],
    );
    let loud = measured_db(&mut eq, rate, 1000.0, 0.5);
    let gain_now = eq.readings()[BANDS + band];
    let quiet = measured_db(&mut eq, rate, 1000.0, 0.004);
    assert!(loud < -10.0, "loud {loud}");
    assert!(quiet.abs() < 0.3, "quiet {quiet}");
    assert!((gain_now + 12.0).abs() < 0.5, "gain now {gain_now}");
    // The static curve ignores the dynamic move.
    assert!(eq::response_db(&params, rate, 1000.0).abs() < 1.0e-4);
}

#[test]
fn the_spectrum_shows_a_sine_in_its_band() {
    let rate = 48000.0;
    let mut eq = equalizer(rate);
    let input = sine(rate, 1000.0, 24000, 0.5);
    run(&mut eq, &input);
    let readings = eq.readings();
    let (loudest, level) =
        readings[..BANDS]
            .iter()
            .copied()
            .enumerate()
            .fold(
                (0, f32::MIN),
                |best, (i, v)| if v > best.1 { (i, v) } else { best },
            );
    assert!(spectrum::band_edge_hz(loudest) <= 1000.0);
    assert!(spectrum::band_edge_hz(loudest + 1) > 1000.0);
    assert!((level - amplitude_to_db(0.5)).abs() < 1.5, "level {level}");
    assert!(readings[2] < level - 40.0, "30 Hz band {}", readings[2]);
    eq.set_param(ANALYSE, 0.0);
    run(&mut eq, &input[..BLOCK]);
    assert!(
        eq.readings()[..BANDS]
            .iter()
            .all(|&v| v == atome_dsp::SILENCE_DB)
    );
}

#[test]
fn everything_off_is_bit_transparent_and_flat_is_transparent() {
    let rate = 48000.0;
    let input: Vec<f32> = sine(rate, 440.0, 4800, 0.5)
        .iter()
        .zip(sine(rate, 7331.0, 4800, 0.25))
        .map(|(a, b)| a + b)
        .collect();
    let mut eq = equalizer(rate);
    let (left, right) = run(&mut eq, &input);
    for (out, inp) in left.iter().chain(&right).zip(input.iter().chain(&input)) {
        assert!((out - inp).abs() <= 1.0e-6);
    }
    for band in 0..BAND_COUNT {
        eq.set_param(band_param(band, ON), 0.0);
    }
    eq.reset();
    let (left, right) = run(&mut eq, &input);
    assert_eq!(left, input);
    assert_eq!(right, input);
}

#[test]
fn dragging_a_point_and_changing_a_type_never_click_nor_break() {
    for rate in [44100.0, 96000.0] {
        let mut eq = equalizer(rate);
        eq.set_param(band_param(3, GAIN_DB), 18.0);
        eq.set_param(band_param(3, Q), 18.0);
        eq.reset();
        let input = sine(rate, 300.0, (rate * 0.5) as usize, 0.25);
        let mut left = input.clone();
        let mut right = input.clone();
        let mut largest_step = 0.0f32;
        let mut previous = 0.0;
        for (index, start) in (0..input.len()).step_by(BLOCK).enumerate() {
            // A sweep of the point up and down, then a type change.
            let phase = index as f32 / 100.0;
            eq.set_param(
                band_param(3, FREQ_HZ),
                200.0 * (1.0 + phase.sin().abs() * 4.0),
            );
            if index == 200 {
                eq.set_param(band_param(3, TYPE), 5.0);
            }
            let end = (start + BLOCK).min(input.len());
            eq.process(&mut StereoBlock::new(
                &mut left[start..end],
                &mut right[start..end],
            ));
            for &sample in &left[start..end] {
                largest_step = largest_step.max((sample - previous).abs());
                previous = sample;
            }
        }
        assert!(left.iter().all(|s| s.is_finite()));
        // A 300 Hz sine boosted 18 dB moves ~0.4 per sample at 44.1 kHz at most.
        assert!(largest_step < 0.6, "{rate}: step {largest_step}");
        // Silence decays to true zero, no denormal tail (a Q 18 ring lasts seconds).
        let mut silent = vec![0.0; rate as usize * 8];
        let mut silent_right = silent.clone();
        for start in (0..silent.len()).step_by(BLOCK) {
            let end = start + BLOCK.min(silent.len() - start);
            eq.process(&mut StereoBlock::new(
                &mut silent[start..end],
                &mut silent_right[start..end],
            ));
        }
        let tail = &silent[silent.len() - BLOCK..];
        assert!(
            tail.iter().all(|&s| s == 0.0),
            "{rate}: tail {:?}",
            &tail[..4]
        );
    }
}
