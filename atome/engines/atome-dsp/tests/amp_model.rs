use atome_dsp::nam::{AmpModel, INPUT_DB, SIZE};
use atome_dsp::{Processor, StereoBlock};

// One linear WaveNet layer (a leaky ReLU of slope 1): its head is the input,
// so the whole capture is a pure gain of `scale`.
fn gain_capture(scale: f32, rate: u32, loudness: Option<f32>) -> String {
    let metadata = loudness.map_or(String::new(), |l| format!(r#","metadata":{{"loudness":{l}}}"#));
    format!(
        r#"{{"version":"0.5.4","architecture":"WaveNet","config":{{"layers":[{{"input_size":1,"condition_size":1,"channels":1,"head_size":1,"kernel_size":1,"dilations":[1],"activation":{{"type":"LeakyReLU","negative_slope":1.0}},"gated":false,"head_bias":false}}],"head":null,"head_scale":{scale}}},"weights":[1,1,0,0,0,0,1,{scale}],"sample_rate":{rate}{metadata}}}"#
    )
}

fn sine(frames: usize, frequency: f32, rate: f32) -> Vec<f32> {
    (0..frames).map(|i| (i as f32 * frequency * std::f32::consts::TAU / rate).sin() * 0.5).collect()
}

fn run(amp: &mut AmpModel, input: &[f32], block: usize) -> Vec<f32> {
    let mut output = Vec::with_capacity(input.len());
    for chunk in input.chunks(block) {
        let mut left = chunk.to_vec();
        let mut right = chunk.to_vec();
        amp.process(&mut StereoBlock::new(&mut left, &mut right));
        assert_eq!(left, right, "the amp is mono, copied to both sides");
        output.extend_from_slice(&left);
    }
    output
}

fn max_error(expected: &[f32], actual: &[f32]) -> f32 {
    expected.iter().zip(actual).map(|(e, a)| (e - a).abs()).fold(0.0, f32::max)
}

#[test]
fn same_rate_runs_the_model_without_latency() {
    let mut amp = AmpModel::from_json_str(&gain_capture(0.5, 48000, None)).unwrap();
    amp.prepare(48000.0, 64);
    assert_eq!(amp.latency_frames(), 0);
    assert!(!amp.is_slimmable());
    assert_eq!(amp.params().len(), 2);
    let input = sine(9600, 440.0, 48000.0);
    let output = run(&mut amp, &input, 64);
    let expected: Vec<f32> = input.iter().map(|x| x * 0.5).collect();
    // The 5 Hz DC blocker settles within the first tenth of a second.
    assert!(max_error(&expected[4800..], &output[4800..]) < 0.01);
}

#[test]
fn another_device_rate_is_resampled_in_and_out() {
    for device_rate in [44100.0f32, 96000.0] {
        let mut amp = AmpModel::from_json_str(&gain_capture(0.5, 48000, None)).unwrap();
        amp.prepare(device_rate, 37);
        let latency = amp.latency_frames() as usize;
        assert!(latency > 0 && latency < 32, "latency {latency} at {device_rate}");
        let input = sine(device_rate as usize / 2, 997.0, device_rate);
        // Odd, uneven block sizes: the conversion must never run dry.
        let mut output = Vec::new();
        let mut start = 0;
        for size in [37usize, 1, 16, 33, 7].iter().cycle() {
            if start >= input.len() {
                break;
            }
            let end = (start + size).min(input.len());
            output.extend(run(&mut amp, &input[start..end], *size));
            start = end;
        }
        let settled = device_rate as usize / 10;
        let expected: Vec<f32> = input[settled - latency..input.len() - latency].iter().map(|x| x * 0.5).collect();
        let error = max_error(&expected, &output[settled..]);
        assert!(error < 0.01, "error {error} at {device_rate}");
    }
}

#[test]
fn loudness_is_normalised_and_input_gain_applies() {
    // A capture recorded at -12 dBFS is brought to -18 dBFS: half the level.
    let mut amp = AmpModel::from_json_str(&gain_capture(1.0, 48000, Some(-12.0))).unwrap();
    amp.prepare(48000.0, 64);
    let input = sine(9600, 440.0, 48000.0);
    let output = run(&mut amp, &input, 64);
    let peak = output[4800..].iter().fold(0.0f32, |p, x| p.max(x.abs()));
    assert!((peak - 0.25).abs() < 0.01, "peak {peak}");

    amp.set_param(INPUT_DB, -6.0206);
    let output = run(&mut amp, &input, 64);
    let peak = output[4800..].iter().fold(0.0f32, |p, x| p.max(x.abs()));
    assert!((peak - 0.125).abs() < 0.01, "peak {peak}");
}

#[test]
fn a2_size_dial_switches_the_submodel() {
    let small = gain_capture(0.25, 48000, None);
    let full = gain_capture(0.5, 48000, None);
    let json = format!(
        r#"{{"version":"0.7.0","architecture":"SlimmableContainer","config":{{"submodels":[{{"max_value":0.5,"model":{small}}},{{"max_value":1.0,"model":{full}}}]}},"weights":[],"sample_rate":48000}}"#
    );
    let mut amp = AmpModel::from_json_str(&json).unwrap();
    amp.prepare(48000.0, 64);
    assert!(amp.is_slimmable());
    assert_eq!(amp.params().len(), 3);
    let input = sine(9600, 440.0, 48000.0);
    let peak = |out: &[f32]| out[4800..].iter().fold(0.0f32, |p, x| p.max(x.abs()));
    assert!((peak(&run(&mut amp, &input, 64)) - 0.25).abs() < 0.01);
    amp.set_param(SIZE, 0.2);
    assert!((peak(&run(&mut amp, &input, 64)) - 0.125).abs() < 0.01);
}

#[test]
fn a_recurrent_capture_runs_and_stays_finite() {
    // One-layer LSTM, hidden size 2: 4h(1+h) + 4h + h + h weights, then the head (h + 1).
    let weights: Vec<String> = (0..39).map(|i| format!("{}", ((i * 7 % 11) as f32 - 5.0) * 0.1)).collect();
    let json = format!(
        r#"{{"version":"0.5.4","architecture":"LSTM","config":{{"input_size":1,"hidden_size":2,"num_layers":1}},"weights":[{}],"sample_rate":48000}}"#,
        weights.join(",")
    );
    let mut amp = AmpModel::from_json_str(&json).unwrap();
    amp.prepare(44100.0, 128);
    let output = run(&mut amp, &sine(44100, 220.0, 44100.0), 128);
    assert!(output.iter().all(|x| x.is_finite()));
    assert!(output.iter().any(|x| x.abs() > 1.0e-4), "the model answers");
}
