use atome_dsp::catalog::{ModuleAsset, ModuleKind};
use atome_dsp::split::Split;
use atome_dsp::{amplitude_to_db, KeyBlock, StereoBlock};

fn sine(frequency: f32, frames: usize) -> Vec<f32> {
    (0..frames).map(|i| (2.0 * std::f32::consts::PI * frequency * i as f32 / 48000.0).sin() * 0.5).collect()
}

fn rms(signal: &[f32]) -> f32 {
    (signal.iter().map(|x| x * x).sum::<f32>() / signal.len() as f32).sqrt()
}

// Every port in its own buffer, in 64-frame blocks.
fn split(kind: ModuleKind, input: &[f32]) -> Vec<Vec<f32>> {
    let mut processor = kind.build(ModuleAsset::None).unwrap();
    processor.prepare(48000.0, 64);
    let ports = kind.outputs();
    let mut out = vec![Vec::new(); ports];
    for chunk in input.chunks(64) {
        let mut buffers: Vec<(Vec<f32>, Vec<f32>)> = (0..ports).map(|_| (chunk.to_vec(), chunk.to_vec())).collect();
        let (first, rest) = buffers.split_first_mut().unwrap();
        let mut extra: Vec<StereoBlock> = rest.iter_mut().map(|(l, r)| StereoBlock::new(l, r)).collect();
        processor.process_ports(&mut StereoBlock::new(&mut first.0, &mut first.1), &mut extra);
        for (port, (left, _)) in buffers.iter().enumerate() {
            out[port].extend_from_slice(left);
        }
    }
    out
}

#[test]
fn bands_sum_back_flat_and_part_the_spectrum() {
    for bands in [2u8, 3, 4] {
        let kind = ModuleKind::Bands(bands);
        for frequency in [34.0, 233.0, 987.0, 2584.0, 6765.0, 15000.0] {
            let input = sine(frequency, 48000);
            let ports = split(kind, &input);
            let sum: Vec<f32> = (0..input.len()).map(|i| ports.iter().map(|port| port[i]).sum()).collect();
            let error_db = amplitude_to_db(rms(&sum[24000..])) - amplitude_to_db(rms(&input[24000..]));
            assert!(error_db.abs() < 0.05, "{bands} bands at {frequency} Hz: {error_db} dB");
        }
        // Low notes land in the first band, high ones in the last.
        let low = split(kind, &sine(34.0, 48000));
        let high = split(kind, &sine(15000.0, 48000));
        assert!(rms(&low[0][24000..]) > 0.33, "{bands}: low in band 0");
        assert!(rms(&high[bands as usize - 1][24000..]) > 0.33, "{bands}: high in the last band");
    }
}

#[test]
fn a_split_left_alone_rebuilds_its_input() {
    let input = sine(440.0, 4800);
    let mut processor = ModuleKind::Bands(3).build(ModuleAsset::None).unwrap();
    processor.prepare(48000.0, 64);
    let ports = split(ModuleKind::Bands(3), &input);
    let mut alone = Vec::new();
    for chunk in input.chunks(64) {
        let (mut left, mut right) = (chunk.to_vec(), chunk.to_vec());
        processor.process(&mut StereoBlock::new(&mut left, &mut right));
        alone.extend(left);
    }
    for (i, value) in alone.iter().enumerate() {
        let sum: f32 = ports.iter().map(|port| port[i]).sum();
        assert!((value - sum).abs() < 1.0e-5, "frame {i}");
    }
}

#[test]
fn mid_side_and_left_right_sum_exactly() {
    for split_kind in [Split::MidSide, Split::LeftRight] {
        let mut processor = ModuleKind::Split(split_kind).build(ModuleAsset::None).unwrap();
        processor.prepare(48000.0, 64);
        let (left, right) = (sine(440.0, 64), sine(97.0, 64));
        let (mut a_left, mut a_right) = (left.clone(), right.clone());
        let (mut b_left, mut b_right) = (vec![0.0; 64], vec![0.0; 64]);
        processor.process_ports(&mut StereoBlock::new(&mut a_left, &mut a_right), &mut [StereoBlock::new(&mut b_left, &mut b_right)]);
        for i in 0..64 {
            assert!((a_left[i] + b_left[i] - left[i]).abs() < 1.0e-6);
            assert!((a_right[i] + b_right[i] - right[i]).abs() < 1.0e-6);
        }
        if split_kind == Split::LeftRight {
            assert!(a_right.iter().chain(&b_left).all(|x| *x == 0.0));
        }
    }
}

// Runs a keyed processor for a second and returns the last block's level.
fn keyed(kind: ModuleKind, input: f32, key: Option<f32>, params: &[(u32, f32)]) -> f32 {
    let mut processor = kind.build(ModuleAsset::None).unwrap();
    processor.prepare(48000.0, 64);
    for &(id, value) in params {
        processor.set_param(id, value);
    }
    let key_signal = key.map(|amplitude| vec![amplitude; 64]);
    let mut last = 0.0;
    for _ in 0..750 {
        let (mut left, mut right) = (vec![input; 64], vec![input; 64]);
        let mut block = StereoBlock::new(&mut left, &mut right);
        match &key_signal {
            Some(key) => processor.process_keyed(&mut block, KeyBlock { left: key, right: key }),
            None => processor.process(&mut block),
        }
        last = left[63];
    }
    amplitude_to_db(last.abs()) - amplitude_to_db(input)
}

#[test]
fn a_key_drives_the_dynamics() {
    use atome_dsp::dynamics::{RATIO, THRESHOLD_DB};
    use atome_dsp::gate::{DUCK_AMOUNT_DB, GATE_RANGE_DB, GATE_RELEASE_MS};
    // Compressor: a quiet block is turned down only while its key is loud.
    let settings = [(THRESHOLD_DB, -30.0), (RATIO, 5.0)];
    assert!(keyed(ModuleKind::Compressor, 0.01, None, &settings).abs() < 0.01);
    let ducked = keyed(ModuleKind::Compressor, 0.01, Some(1.0), &settings);
    assert!((ducked + 24.0).abs() < 0.5, "compressed by its key: {ducked} dB");
    // Gate: shut by a silent key, open on a loud one, whatever its own level.
    assert!((keyed(ModuleKind::Gate, 0.5, Some(0.0), &[(GATE_RANGE_DB, -60.0), (GATE_RELEASE_MS, 55.0)]) + 60.0).abs() < 0.5);
    assert!(keyed(ModuleKind::Gate, 0.001, Some(0.5), &[]).abs() < 0.01);
    // Ducker: its amount while the key plays, nothing without a key.
    assert!((keyed(ModuleKind::Ducker, 0.5, Some(0.5), &[(DUCK_AMOUNT_DB, 12.0)]) + 12.0).abs() < 0.1);
    assert!(keyed(ModuleKind::Ducker, 0.5, Some(0.0), &[]).abs() < 0.01);
    assert!(keyed(ModuleKind::Ducker, 0.5, None, &[]).abs() < 1.0e-6);
}
