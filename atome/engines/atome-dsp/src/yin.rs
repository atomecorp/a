// YIN pitch detection (de Cheveigné & Kawahara), the one detector of the
// voice bricks: the tuner reads it frame by frame as the voice plays, and the
// offline note analysis of a sound clip (atome-audio-kernels tune.rs, R-372)
// reads it over a whole recording. The cross term is computed by FFT, the
// cumulative mean normalized difference picks the first dip under the
// threshold, and a parabola refines its lag. Only `new` allocates.

use crate::stft::Stft;
use realfft::num_complex::Complex;

const THRESHOLD: f32 = 0.15;
pub const HIGHEST_HZ: f32 = 1500.0;
pub const LOWEST_HZ: f32 = 55.0;
// −55 dBFS mean power: quieter frames are silence.
const SILENT_POWER: f32 = 3.2e-6;

pub struct Yin {
    sample_rate: f32,
    fft: Stft,
    time: Vec<f32>,
    spectrum_a: Vec<Complex<f32>>,
    spectrum_b: Vec<Complex<f32>>,
    correlation: Vec<f32>,
    energy: Vec<f32>,
    normalized: Vec<f32>,
}

impl Yin {
    // Frames of `frame_size_for(sample_rate)` samples (stft.rs), about 43 ms.
    pub fn new(sample_rate: f32) -> Self {
        let fft = Stft::new(sample_rate);
        let size = fft.size();
        Self {
            sample_rate,
            time: vec![0.0; size],
            spectrum_a: fft.spectrum(),
            spectrum_b: fft.spectrum(),
            correlation: vec![0.0; size],
            energy: vec![0.0; size + 1],
            normalized: vec![0.0; size / 2 + 1],
            fft,
        }
    }

    pub fn size(&self) -> usize {
        self.fft.size()
    }

    // The fundamental of `frame` (`size()` samples) in Hz; None when unvoiced or silent.
    pub fn detect(&mut self, frame: &[f32]) -> Option<f32> {
        let size = self.fft.size();
        debug_assert_eq!(frame.len(), size);
        let window = size / 2;
        self.energy[0] = 0.0;
        for (index, sample) in frame.iter().enumerate() {
            self.energy[index + 1] = self.energy[index] + sample * sample;
        }
        if self.energy[window] / (window as f32) < SILENT_POWER {
            return None;
        }
        // Cross term Σ x[j]·x[j+τ] by FFT: the first half against the frame.
        self.time[..window].copy_from_slice(&frame[..window]);
        self.time[window..].fill(0.0);
        self.fft.forward(&mut self.time, &mut self.spectrum_a);
        self.time.copy_from_slice(frame);
        self.fft.forward(&mut self.time, &mut self.spectrum_b);
        for (a, b) in self.spectrum_a.iter_mut().zip(&self.spectrum_b) {
            *a = a.conj() * b;
        }
        self.fft
            .inverse(&mut self.spectrum_a, &mut self.correlation);
        let scale = 1.0 / size as f32;
        let lowest_lag = (self.sample_rate / HIGHEST_HZ) as usize;
        let highest_lag = ((self.sample_rate / LOWEST_HZ) as usize).min(window - 2);
        let head = self.energy[window];
        let mut running = 0.0;
        self.normalized[0] = 1.0;
        for lag in 1..=highest_lag + 1 {
            let tail = self.energy[lag + window] - self.energy[lag];
            let difference = (head + tail - 2.0 * self.correlation[lag] * scale).max(0.0);
            running += difference;
            self.normalized[lag] = if running > 0.0 {
                difference * lag as f32 / running
            } else {
                1.0
            };
        }
        let d = &self.normalized;
        let mut lag = lowest_lag.max(2);
        while lag < highest_lag && d[lag] >= THRESHOLD {
            lag += 1;
        }
        if lag >= highest_lag {
            return None;
        }
        while lag + 1 < highest_lag && d[lag + 1] < d[lag] {
            lag += 1;
        }
        let (before, here, after) = (d[lag - 1], d[lag], d[lag + 1]);
        let curve = before + after - 2.0 * here;
        let offset = if curve > 0.0 {
            (0.5 * (before - after) / curve).clamp(-0.5, 0.5)
        } else {
            0.0
        };
        Some(self.sample_rate / (lag as f32 + offset))
    }
}
