use atome_dsp::convolution::{Convolution, Impulse, ImpulseError, MIX as CONVOLUTION_MIX};
use atome_dsp::reverb::{Reverb, DECAY_S, MIX, PREDELAY_MS};
use atome_dsp::{Processor, StereoBlock};

fn run(processor: &mut dyn Processor, left: &[f32], right: &[f32], block: usize) -> (Vec<f32>, Vec<f32>) {
    let (mut out_left, mut out_right) = (Vec::new(), Vec::new());
    for (l, r) in left.chunks(block).zip(right.chunks(block)) {
        let (mut l, mut r) = (l.to_vec(), r.to_vec());
        processor.process(&mut StereoBlock::new(&mut l, &mut r));
        out_left.extend(l);
        out_right.extend(r);
    }
    (out_left, out_right)
}

fn impulse(frames: usize) -> Vec<f32> {
    let mut signal = vec![0.0; frames];
    signal[0] = 1.0;
    signal
}

fn energy(signal: &[f32]) -> f32 {
    signal.iter().map(|x| x * x).sum()
}

#[test]
fn an_impulse_must_carry_sound() {
    assert_eq!(Impulse::new(vec![], None, 48000.0).err(), Some(ImpulseError::Empty));
    assert_eq!(Impulse::new(vec![0.0; 8], None, 48000.0).err(), Some(ImpulseError::Silent));
    assert_eq!(Impulse::new(vec![1.0; 8], Some(vec![1.0; 4]), 48000.0).err(), Some(ImpulseError::ChannelLengthMismatch));
}

#[test]
fn convolution_has_no_latency_and_keeps_each_side() {
    // Left: a pure 2-frame delay; right: a 5-frame delay.
    let mut left_ir = vec![0.0; 6];
    left_ir[2] = 1.0;
    let mut right_ir = vec![0.0; 6];
    right_ir[5] = 1.0;
    let mut convolution = Convolution::new(Impulse::new(left_ir, Some(right_ir), 48000.0).unwrap());
    convolution.prepare(48000.0, 32);
    assert_eq!(convolution.latency_frames(), 0);
    let input: Vec<f32> = (0..256).map(|i| ((i * 13 % 17) as f32 - 8.0) / 8.0).collect();
    let (left, right) = run(&mut convolution, &input, &input, 32);
    for i in 8..256 {
        assert!((left[i] - input[i - 2]).abs() < 1.0e-4, "left frame {i}");
        assert!((right[i] - input[i - 5]).abs() < 1.0e-4, "right frame {i}");
    }
}

#[test]
fn a_long_response_at_another_rate_rings_and_keeps_the_level() {
    // Two seconds of decaying noise recorded at 44.1 kHz, played at 48 kHz.
    let mut seed = 1u32;
    let ir: Vec<f32> = (0..88200)
        .map(|i| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            ((seed >> 8) as f32 / 8388608.0 - 1.0) * (-(i as f32) / 13000.0).exp()
        })
        .collect();
    let mut convolution = Convolution::new(Impulse::new(ir, None, 44100.0).unwrap());
    convolution.prepare(48000.0, 64);
    let tail = convolution.tail_frames() as usize;
    assert!((95990..96010).contains(&tail), "tail {tail}");
    let (left, right) = run(&mut convolution, &impulse(tail + 4800), &impulse(tail + 4800), 64);
    assert_eq!(left, right);
    assert!((energy(&left) - 1.0).abs() < 0.02, "unit energy {}", energy(&left));
    assert!(energy(&left[tail..]) < 1.0e-9, "silent after the tail");

    convolution.set_param(CONVOLUTION_MIX, 0.0);
    convolution.reset();
    let (dry, _) = run(&mut convolution, &[0.5; 4800], &[0.5; 4800], 64);
    assert!((dry[4799] - 0.5).abs() < 1.0e-4, "dry only at mix 0");
}

#[test]
fn reverb_decays_as_asked_and_spreads_both_sides() {
    let rate = 48000.0;
    let mut reverb = Reverb::new();
    reverb.prepare(rate, 64);
    reverb.set_param(DECAY_S, 2.0);
    reverb.set_param(MIX, 1.0);
    reverb.set_param(PREDELAY_MS, 0.0);
    let frames = 3 * rate as usize;
    let (left, right) = run(&mut reverb, &impulse(frames), &impulse(frames), 64);
    assert!(left.iter().chain(&right).all(|x| x.is_finite()));
    assert_ne!(left, right, "the two sides are decorrelated");
    // 60 dB over 2 s is 30 dB over one second: compare 0.5–1 s with 1.5–2 s.
    let window = |start: f32| energy(&left[(start * rate) as usize..((start + 0.5) * rate) as usize]);
    let drop_db = 10.0 * (window(0.5) / window(1.5)).log10();
    assert!((drop_db - 30.0).abs() < 4.0, "drop {drop_db} dB over a second");
}

#[test]
fn reverb_stays_stable_at_its_longest() {
    let mut reverb = Reverb::new();
    reverb.prepare(44100.0, 128);
    reverb.set_param(DECAY_S, 21.0);
    reverb.set_param(MIX, 1.0);
    let noise: Vec<f32> = (0..44100).map(|i| ((i * 7919 % 1000) as f32 / 500.0 - 1.0) * 0.5).collect();
    let (left, _) = run(&mut reverb, &noise, &noise, 128);
    let silence = vec![0.0; 441000];
    let (after, _) = run(&mut reverb, &silence, &silence, 128);
    let peak = left.iter().chain(&after).fold(0.0f32, |p, x| p.max(x.abs()));
    assert!(peak < 4.0, "peak {peak}");
    assert!(energy(&after[396900..]) < energy(&after[..44100]), "still decaying");
}
