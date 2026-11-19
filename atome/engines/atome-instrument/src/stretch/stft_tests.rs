// The half-bin real transform against its definition, X[k] = Σ x[n]·e^(−2πi(k+½)n/N), and a whole analysis then
// synthesis giving the input back (the window forced to perfect reconstruction).

use super::Stft;
use std::f64::consts::PI;

#[test]
fn the_spectrum_is_the_half_bin_dft() {
    let mut stft = Stft::new(1, 64, 16, 0);
    let size = stft.fft_size();
    let signal: Vec<f32> = (0..size)
        .map(|n| ((n * 7919) % 97) as f32 / 97.0 - 0.5)
        .collect();
    stft.time.copy_from_slice(&signal);
    stft.forward_transform(0);
    for bin in 0..size / 2 {
        let (mut re, mut im) = (0.0f64, 0.0f64);
        for (n, &x) in signal.iter().enumerate() {
            let phase = -2.0 * PI * (bin as f64 + 0.5) * n as f64 / size as f64;
            re += x as f64 * phase.cos();
            im += x as f64 * phase.sin();
        }
        let got = stft.spectrum(0)[bin];
        assert!(
            (got.re as f64 - re).abs() < 1e-4 && (got.im as f64 - im).abs() < 1e-4,
            "bin {bin}: {got} vs {re}+{im}i"
        );
    }
    stft.inverse_transform(0);
    for (n, &x) in signal.iter().enumerate() {
        assert!((stft.time[n] - x * size as f32).abs() < 1e-3, "sample {n}");
    }
}

#[test]
fn analysis_then_synthesis_gives_the_input_back() {
    let (block, interval) = (256, 64);
    let mut stft = Stft::new(1, block, interval, interval + 1);
    let signal: Vec<f32> = (0..4096).map(|n| (n as f32 * 0.05).sin() * 0.5).collect();
    let mut heard = Vec::new();
    for hop in signal.chunks(interval) {
        stft.write_input(0, hop);
        stft.move_input(hop.len());
        stft.analyse(0, 0);
        stft.synthesise(0);
        for _ in 0..interval {
            heard.push(stft.read_output(0));
            stft.move_output(1);
        }
    }
    let latency = stft.analysis_latency() + stft.synthesis_latency() - interval;
    for index in block * 2..signal.len() - block {
        assert!(
            (heard[index] - signal[index - latency]).abs() < 1e-4,
            "frame {index}: {} vs {}",
            heard[index],
            signal[index - latency]
        );
    }
}
