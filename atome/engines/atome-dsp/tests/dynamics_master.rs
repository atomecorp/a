// Dynamics and mastering bricks measured on synthetic signals: the
// compressor's characters, the BS.1770 meter, the true-peak maximizer, the
// multiband, the de-esser, the transient shaper, the expander, the imager.

use atome_dsp::deesser::{self, Deesser};
use atome_dsp::dynamics::{self, Compressor};
use atome_dsp::expander::{self, Expander};
use atome_dsp::imager::{self, Imager};
use atome_dsp::loudness::LoudnessMeter;
use atome_dsp::maximizer::{self, Maximizer};
use atome_dsp::multiband::{self, Multiband};
use atome_dsp::transient::{self, TransientShaper};
use atome_dsp::{KeyBlock, Processor, StereoBlock, amplitude_to_db};
use std::f32::consts::TAU;

const RATE: f32 = 48000.0;
const BLOCK: usize = 64;

fn sine_at(rate: f32, frequency: f32, frames: usize, amplitude: f32, phase: f32) -> Vec<f32> {
    (0..frames)
        .map(|n| amplitude * (TAU * frequency * n as f32 / rate + phase).sin())
        .collect()
}

fn sine(frequency: f32, frames: usize, amplitude: f32) -> Vec<f32> {
    sine_at(RATE, frequency, frames, amplitude, 0.0)
}

fn run_stereo(processor: &mut dyn Processor, left: &[f32], right: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let (mut left, mut right) = (left.to_vec(), right.to_vec());
    for start in (0..left.len()).step_by(BLOCK) {
        let end = (start + BLOCK).min(left.len());
        processor.process(&mut StereoBlock::new(
            &mut left[start..end],
            &mut right[start..end],
        ));
    }
    (left, right)
}

fn run(processor: &mut dyn Processor, input: &[f32]) -> Vec<f32> {
    run_stereo(processor, input, input).0
}

fn peak(samples: &[f32]) -> f32 {
    samples.iter().fold(0.0f32, |a, s| a.max(s.abs()))
}

fn rms(samples: &[f32]) -> f32 {
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len().max(1) as f32).sqrt()
}

fn prepared<P: Processor>(mut processor: P, settings: &[(u32, f32)]) -> P {
    for &(id, value) in settings {
        processor.set_param(id, value);
    }
    processor.prepare(RATE, BLOCK);
    processor
}

#[test]
fn clean_compressor_reduces_by_its_ratio_and_reads_it() {
    let mut compressor = prepared(Compressor::new(), &[]);
    // −6 dBFS, threshold −18, ratio 3: 12 dB over → 8 dB of reduction.
    let out = run(&mut compressor, &sine(997.0, 48000, 0.5));
    let reduction = amplitude_to_db(0.5) - amplitude_to_db(peak(&out[24000..]));
    assert!((reduction - 8.0).abs() < 0.5, "reduction {reduction}");
    let reading = compressor.readings()[0];
    assert!((reading - 8.0).abs() < 0.5, "reading {reading}");
}

// Gain (dB) every millisecond across a burst: silence, a loud second, a quiet one.
fn trajectory(character: f32) -> Vec<f32> {
    let mut compressor = prepared(Compressor::new(), &[(dynamics::CHARACTER, character)]);
    let mut input = sine(997.0, 48000, 0.5);
    input.extend(sine(997.0, 48000, 0.05));
    let mut gains = Vec::new();
    let (mut left, mut right) = (input.clone(), input);
    for start in (0..left.len()).step_by(48) {
        compressor.process(&mut StereoBlock::new(
            &mut left[start..start + 48],
            &mut right[start..start + 48],
        ));
        gains.push(compressor.readings()[0]);
    }
    gains
}

#[test]
fn each_character_has_its_own_gain_trajectory() {
    let all: Vec<Vec<f32>> = (0..5).map(|c| trajectory(c as f32)).collect();
    for a in 0..5 {
        for b in a + 1..5 {
            let gap = all[a]
                .iter()
                .zip(&all[b])
                .map(|(x, y)| (x - y).abs())
                .fold(0.0, f32::max);
            assert!(gap > 0.5, "characters {a} and {b} differ by {gap} dB only");
        }
    }
    let [clean, opto, fet, tube, bus] = [&all[0], &all[1], &all[2], &all[3], &all[4]];
    // FET grabs faster than the clean VCA, the opto slower.
    assert!(
        fet[2] > clean[2] && opto[2] < clean[2],
        "{} {} {}",
        fet[2],
        clean[2],
        opto[2]
    );
    // Vari-mu: softer than the clean curve at the same settings.
    assert!(
        tube[900] < clean[900] - 1.0,
        "tube {} clean {}",
        tube[900],
        clean[900]
    );
    // Opto: two-stage release, still holding after the fast stage has gone.
    assert!(
        opto[1300] > clean[1300] + 0.5,
        "opto {} clean {}",
        opto[1300],
        clean[1300]
    );
    // Bus: after a long passage, its automatic release slows down.
    assert!(
        bus[1300] > clean[1300] + 0.5,
        "bus {} clean {}",
        bus[1300],
        clean[1300]
    );
    assert!(all.iter().flatten().all(|g| g.is_finite()));
}

#[test]
fn parallel_mix_and_the_key_high_pass() {
    let input = sine(997.0, 24000, 0.5);
    let mut dry = prepared(Compressor::new(), &[(dynamics::MIX, 0.0)]);
    assert_eq!(run(&mut dry, &input), input);
    let mut half = prepared(Compressor::new(), &[(dynamics::MIX, 0.5)]);
    let out = run(&mut half, &input);
    let level = amplitude_to_db(peak(&out[12000..]));
    // Half dry (−6 dBFS), half 8 dB down: between both.
    assert!(
        level > -6.0 - 8.0 + 1.0 && level < -6.0 - 0.5,
        "level {level}"
    );
    // A 30 Hz key barely moves the detector behind the 89 Hz high-pass.
    let key = sine(30.0, 24000, 0.5);
    let keyed = |hpf: f32| {
        let mut compressor = prepared(Compressor::new(), &[(dynamics::KEY_HPF_HZ, hpf)]);
        let (mut left, mut right) = (input.clone(), input.clone());
        for start in (0..left.len()).step_by(BLOCK) {
            compressor.process_keyed(
                &mut StereoBlock::new(
                    &mut left[start..start + BLOCK],
                    &mut right[start..start + BLOCK],
                ),
                KeyBlock {
                    left: &key[start..start + BLOCK],
                    right: &key[start..start + BLOCK],
                },
            );
        }
        compressor.readings()[0]
    };
    let (filtered, open) = (keyed(89.0), keyed(dynamics::KEY_HPF_OFF_HZ));
    assert!(
        open > 7.0 && filtered < open - 3.0,
        "filtered {filtered} open {open}"
    );
}

fn loudness_of(rate: f32, left: &[f32], right: &[f32]) -> LoudnessMeter {
    let mut meter = LoudnessMeter::new();
    meter.prepare(rate);
    meter.process(left, right);
    meter
}

#[test]
fn loudness_reads_the_bs1770_references_at_every_rate() {
    for rate in [44100.0, 48000.0, 96000.0] {
        let frames = (rate * 5.0) as usize;
        let silent = vec![0.0; frames];
        let full = sine_at(rate, 997.0, frames, 1.0, 0.0);
        let integrated = loudness_of(rate, &full, &silent).integrated_lufs();
        assert!(
            (integrated + 3.01).abs() < 0.1,
            "{rate}: full scale {integrated}"
        );
        let tone = sine_at(rate, 1000.0, frames, 0.1, 0.0);
        let meter = loudness_of(rate, &tone, &silent);
        assert!(
            (meter.integrated_lufs() + 23.0).abs() < 0.3,
            "{rate}: −20 dBFS"
        );
        assert!((meter.short_term_lufs() + 23.0).abs() < 0.3);
        assert!((meter.momentary_lufs() + 23.0).abs() < 0.3);
        // EBU Tech 3341: −23 dBFS in both channels reads −23.0 LUFS.
        let both = sine_at(rate, 1000.0, frames, 10f32.powf(-23.0 / 20.0), 0.0);
        let integrated = loudness_of(rate, &both, &both).integrated_lufs();
        assert!(
            (integrated + 23.0).abs() < 0.3,
            "{rate}: stereo {integrated}"
        );
    }
}

#[test]
fn integrated_loudness_gates_silence_and_quiet_passages() {
    let silent = vec![0.0; 480000];
    let mut tone = sine(1000.0, 480000, 0.1);
    tone.extend(&silent);
    let mut quiet = sine(1000.0, 480000, 0.1);
    quiet.extend(sine(1000.0, 480000, 0.00316));
    let right = vec![0.0; tone.len()];
    let gated = loudness_of(RATE, &tone, &right).integrated_lufs();
    assert!((gated + 23.0).abs() < 0.3, "silence gated: {gated}");
    let gated = loudness_of(RATE, &quiet, &right).integrated_lufs();
    assert!((gated + 23.0).abs() < 0.3, "quiet passage gated: {gated}");
    let mut meter = loudness_of(RATE, &tone, &right);
    meter.reset();
    assert!(meter.integrated_lufs() <= -119.0);
}

#[test]
fn true_peak_sees_between_the_samples() {
    // A quarter of the rate at 45°: every sample at −3 dB, the wave at 0 dBFS.
    let wave = sine_at(RATE, RATE / 4.0, 4800, 1.0, TAU / 8.0);
    assert!(amplitude_to_db(peak(&wave)) < -2.9);
    let meter = loudness_of(RATE, &wave, &wave);
    let true_peak = meter.true_peak_db();
    assert!(true_peak.abs() < 0.3, "true peak {true_peak}");
}

// A finer, independent true-peak (16×, long windowed sinc), in dBTP.
fn fine_true_peak(samples: &[f32]) -> f32 {
    let half = 64i64;
    let mut largest = 0.0f64;
    for n in half as usize..samples.len() - half as usize {
        for p in 0..16 {
            let t = n as f64 + p as f64 / 16.0;
            let mut value = 0.0f64;
            for k in -half..=half {
                let index = (n as i64 + k) as usize;
                let x = t - index as f64;
                let sinc = if x == 0.0 {
                    1.0
                } else {
                    (std::f64::consts::PI * x).sin() / (std::f64::consts::PI * x)
                };
                let w = 0.5 + 0.5 * (std::f64::consts::PI * x / (half as f64 + 1.0)).cos();
                value += samples[index] as f64 * sinc * w;
            }
            largest = largest.max(value.abs());
        }
    }
    20.0 * largest.log10() as f32
}

#[test]
fn maximizer_holds_its_true_peak_ceiling_on_a_hot_master() {
    let mut maximizer = prepared(Maximizer::new(), &[(maximizer::GAIN_DB, 12.0)]);
    let frames = 96000;
    let mut input = sine(997.0, frames, 0.4);
    for (n, (sample, high)) in input
        .iter_mut()
        .zip(sine_at(RATE, 11025.0, frames, 0.3, 0.7))
        .enumerate()
    {
        // Drum-like bursts on top.
        let burst = if n % 12000 < 300 { 0.6 } else { 0.0 };
        *sample += high + burst * (n as f32 * 0.37).sin();
    }
    let right: Vec<f32> = input.iter().map(|s| -0.8 * s).collect();
    let (left, right) = run_stereo(&mut maximizer, &input, &right);
    assert!(
        left.iter()
            .chain(&right)
            .all(|s| s.is_finite() && s.abs() <= 0.8913)
    );
    let readings = maximizer.readings();
    assert!(
        readings[3] <= -1.0 + 1.0e-3,
        "meter true peak {}",
        readings[3]
    );
    let fine = fine_true_peak(&left[24000..48000]).max(fine_true_peak(&right[24000..48000]));
    assert!(fine <= -0.98, "fine true peak {fine}");
    assert!(readings[0] > 3.0, "reduction {}", readings[0]);
    assert!(readings[1] > -12.0 && readings[2] > -12.0, "{readings:?}");
    assert_eq!(maximizer::target_lufs(3), -16.0);
}

#[test]
fn maximizer_latency_is_constant_and_exact() {
    for rate in [44100.0, 48000.0, 96000.0] {
        let mut maximizer = Maximizer::new();
        maximizer.prepare(rate, BLOCK);
        let latency = maximizer.latency_frames() as usize;
        let mut input = vec![0.0; latency + 1024];
        input[100] = 0.5;
        let out = run(&mut maximizer, &input);
        let found = out.iter().position(|s| s.abs() > 0.25).unwrap();
        assert_eq!(found, 100 + latency, "{rate}");
        let mut nan = vec![0.1; 2048];
        nan[10] = f32::NAN;
        assert!(run(&mut maximizer, &nan).iter().all(|s| s.is_finite()));
    }
}

#[test]
fn multiband_is_flat_at_rest_and_compresses_one_band() {
    let mut input = sine(60.0, 48000, 0.3);
    for (sample, high) in input.iter_mut().zip(sine(8000.0, 48000, 0.01)) {
        *sample += high;
    }
    let mut rest = prepared(
        Multiband::new(),
        &[
            (multiband::LOW_RATIO, 1.0),
            (multiband::MID_RATIO, 1.0),
            (multiband::HIGH_RATIO, 1.0),
        ],
    );
    let out = run(&mut rest, &input);
    let gap = amplitude_to_db(rms(&out[24000..])) - amplitude_to_db(rms(&input[24000..]));
    assert!(gap.abs() < 0.1, "flat {gap}");
    let mut squeezed = prepared(
        Multiband::new(),
        &[
            (multiband::LOW_THRESHOLD_DB, -30.0),
            (multiband::LOW_RATIO, 4.0),
        ],
    );
    let _ = run(&mut squeezed, &input);
    let [low, mid, high] = [0, 1, 2].map(|band| squeezed.readings()[band]);
    assert!(low > 9.0 && mid < 0.5 && high < 0.5, "{low} {mid} {high}");
}

#[test]
fn deesser_takes_down_the_sibilance_only() {
    let mut split = prepared(Deesser::new(), &[(deesser::RANGE_DB, -9.0)]);
    let ess = sine(9000.0, 24000, 0.5);
    let out = run(&mut split, &ess);
    // The band's whole range; at 9 kHz the low band still holds −15.6 dB of the
    // tone (Linkwitz-Riley at 1.5× its crossover), so the tone drops ~7 dB.
    let cut = amplitude_to_db(peak(&ess[12000..])) - amplitude_to_db(peak(&out[12000..]));
    assert!((cut - 7.0).abs() < 0.5, "sibilance cut {cut}");
    assert!((split.readings()[0] - 9.0).abs() < 0.5);
    let mut split = prepared(Deesser::new(), &[]);
    let voice = sine(200.0, 24000, 0.5);
    let out = run(&mut split, &voice);
    let gap = amplitude_to_db(peak(&out[12000..])) - amplitude_to_db(0.5);
    assert!(gap.abs() < 0.05, "voice {gap}");
    let mut wide = prepared(Deesser::new(), &[(deesser::MODE, 1.0)]);
    let mut mixed = sine(200.0, 24000, 0.5);
    for (sample, ess) in mixed.iter_mut().zip(&ess) {
        *sample += ess;
    }
    let out = run(&mut wide, &mixed);
    let cut = amplitude_to_db(peak(&mixed[12000..])) - amplitude_to_db(peak(&out[12000..]));
    assert!(
        (cut - 9.0).abs() < 0.5,
        "wide turns the whole signal down: {cut}"
    );
}

#[test]
fn transient_shaper_lifts_onsets_and_trims_tails() {
    // A plucked tone: instant onset, exponential decay.
    let pluck: Vec<f32> = sine(220.0, 24000, 0.5)
        .iter()
        .enumerate()
        .map(|(n, s)| s * (-(n as f32) / 4800.0).exp())
        .collect();
    let mut neutral = prepared(TransientShaper::new(), &[]);
    let out = run(&mut neutral, &pluck);
    assert!(out.iter().zip(&pluck).all(|(a, b)| (a - b).abs() < 1.0e-6));
    let mut punch = prepared(TransientShaper::new(), &[(transient::ATTACK, 1.0)]);
    let out = run(&mut punch, &pluck);
    assert!(peak(&out[..480]) > peak(&pluck[..480]) * 1.5);
    let mut dry = prepared(TransientShaper::new(), &[(transient::SUSTAIN, -1.0)]);
    let out = run(&mut dry, &pluck);
    assert!(rms(&out[9600..14400]) < rms(&pluck[9600..14400]) * 0.7);
}

#[test]
fn expander_turns_down_what_falls_under_its_threshold() {
    let mut expander = prepared(Expander::new(), &[]);
    // −60 dBFS, 15 dB under −45, ratio 2: 15 dB down.
    let quiet = sine(997.0, 96000, 0.001);
    let out = run(&mut expander, &quiet);
    let cut = amplitude_to_db(0.001) - amplitude_to_db(peak(&out[72000..]));
    assert!((cut - 15.0).abs() < 1.0, "cut {cut}");
    let mut deep = prepared(Expander::new(), &[(expander::RATIO, 8.0)]);
    let _ = run(&mut deep, &quiet);
    assert!((deep.readings()[0] - 21.0).abs() < 0.5, "range holds");
    let mut open = prepared(Expander::new(), &[]);
    let loud = sine(997.0, 24000, 0.3);
    let out = run(&mut open, &loud);
    assert!((peak(&out[12000..]) - 0.3).abs() < 0.003);
    assert!(Expander::new().takes_key());
}

#[test]
fn imager_narrows_widens_and_reads_correlation() {
    let left = sine(440.0, 24000, 0.5);
    let right = sine(660.0, 24000, 0.5);
    let mut mono = prepared(Imager::new(), &[(imager::WIDTH, 0.0)]);
    let (l, r) = run_stereo(&mut mono, &left, &right);
    assert!(l.iter().zip(&r).all(|(a, b)| (a - b).abs() < 1.0e-6));
    assert!((mono.readings()[0] - 1.0).abs() < 0.01);
    let inverted: Vec<f32> = left.iter().map(|s| -s).collect();
    let mut wide = prepared(Imager::new(), &[]);
    let _ = run_stereo(&mut wide, &left, &inverted);
    assert!((wide.readings()[0] + 1.0).abs() < 0.01);
    // Bass mono at 233 Hz: an out-of-phase 50 Hz becomes almost silent side.
    let bass = sine(50.0, 48000, 0.5);
    let bass_inverted: Vec<f32> = bass.iter().map(|s| -s).collect();
    let mut tight = prepared(Imager::new(), &[(imager::BASS_MONO_HZ, 233.0)]);
    let (l, r) = run_stereo(&mut tight, &bass, &bass_inverted);
    let side: Vec<f32> = l.iter().zip(&r).map(|(a, b)| 0.5 * (a - b)).collect();
    assert!(rms(&side[24000..]) < rms(&bass[24000..]) * 0.1);
}

#[test]
fn every_brick_stays_finite_and_smooth_at_every_rate() {
    for rate in [44100.0, 48000.0, 96000.0] {
        let input = sine_at(rate, 997.0, 9600, 0.9, 0.0);
        let mut bricks: Vec<Box<dyn Processor>> = vec![
            Box::new(Compressor::new()),
            Box::new(Maximizer::new()),
            Box::new(Multiband::new()),
            Box::new(Deesser::new()),
            Box::new(TransientShaper::new()),
            Box::new(Expander::new()),
            Box::new(Imager::new()),
        ];
        for character in 0..5 {
            let mut compressor = Compressor::new();
            compressor.set_param(dynamics::CHARACTER, character as f32);
            compressor.set_param(dynamics::RATIO, 20.0);
            compressor.set_param(dynamics::ATTACK_MS, 0.1);
            bricks.push(Box::new(compressor));
        }
        for brick in &mut bricks {
            brick.prepare(rate, BLOCK);
            let out = run(brick.as_mut(), &input);
            assert!(out.iter().all(|s| s.is_finite() && s.abs() < 4.0));
            brick.reset();
        }
    }
    // A gain change ramps, never jumps.
    let mut shaper = prepared(TransientShaper::new(), &[]);
    let mut left = vec![0.25; 4800];
    let mut right = left.clone();
    shaper.process(&mut StereoBlock::new(&mut left[..64], &mut right[..64]));
    shaper.set_param(transient::OUTPUT_DB, 12.0);
    shaper.process(&mut StereoBlock::new(&mut left[64..], &mut right[64..]));
    let step = left
        .windows(2)
        .map(|w| (w[1] - w[0]).abs())
        .fold(0.0, f32::max);
    assert!(step < 0.01, "step {step}");
}
