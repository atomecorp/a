// Streaming short-time Fourier framer shared by the spectral voice bricks
// (pitch shifter, tuner, noise reduction): Hann window, 4× overlap, the
// frame synthesized as soon as its last sample arrives. Only `new` allocates.

use realfft::num_complex::Complex;
use realfft::{ComplexToReal, RealFftPlanner, RealToComplex};
use std::f32::consts::TAU;
use std::sync::Arc;

// About 43 ms at 44.1/48 kHz, the same duration at 96 kHz and beyond.
pub fn frame_size_for(sample_rate: f32) -> usize {
    if sample_rate <= 50_000.0 {
        2048
    } else if sample_rate <= 100_000.0 {
        4096
    } else {
        8192
    }
}

#[inline]
pub(crate) fn wrap_phase(phase: f32) -> f32 {
    phase - TAU * (phase / TAU).round()
}

pub struct Stft {
    size: usize,
    hop: usize,
    forward: Arc<dyn RealToComplex<f32>>,
    inverse: Arc<dyn ComplexToReal<f32>>,
    scratch: Vec<Complex<f32>>,
    window: Vec<f32>,
    input: Vec<f32>,
    time: Vec<f32>,
    fill: usize,
}

impl Stft {
    // Allocates every buffer: call it from `new` or `prepare`, never `process`.
    pub fn new(sample_rate: f32) -> Self {
        let size = frame_size_for(sample_rate);
        let mut planner = RealFftPlanner::<f32>::new();
        let forward = planner.plan_fft_forward(size);
        let inverse = planner.plan_fft_inverse(size);
        let scratch_len = forward.get_scratch_len().max(inverse.get_scratch_len());
        let window = (0..size)
            .map(|n| 0.5 - 0.5 * (TAU * n as f32 / size as f32).cos())
            .collect();
        Self {
            size,
            hop: size / 4,
            forward,
            inverse,
            scratch: vec![Complex::default(); scratch_len],
            window,
            input: vec![0.0; size],
            time: vec![0.0; size],
            fill: 0,
        }
    }

    pub fn size(&self) -> usize {
        self.size
    }

    pub fn hop(&self) -> usize {
        self.hop
    }

    pub fn bins(&self) -> usize {
        self.size / 2 + 1
    }

    // A frame is synthesized as soon as its last sample arrives.
    pub fn latency(&self) -> usize {
        self.size - 1
    }

    pub fn spectrum(&self) -> Vec<Complex<f32>> {
        vec![Complex::default(); self.bins()]
    }

    // Takes one sample; true when the latest `size` samples form a new frame.
    #[inline]
    pub fn push(&mut self, sample: f32) -> bool {
        if self.fill == self.hop {
            self.input.copy_within(self.hop.., 0);
            self.fill = 0;
        }
        self.input[self.size - self.hop + self.fill] = sample;
        self.fill += 1;
        self.fill == self.hop
    }

    // Where the sample just pushed reads its output in an `Overlap`.
    #[inline]
    pub fn read_index(&self) -> usize {
        self.fill % self.hop
    }

    // The latest `size` raw samples, valid right after `push` returned true.
    pub fn frame(&self) -> &[f32] {
        &self.input
    }

    // Windowed forward transform of the current frame.
    pub fn analyse(&mut self, spectrum: &mut [Complex<f32>]) {
        for ((time, input), window) in self.time.iter_mut().zip(&self.input).zip(&self.window) {
            *time = input * window;
        }
        let result = self
            .forward
            .process_with_scratch(&mut self.time, spectrum, &mut self.scratch);
        debug_assert!(result.is_ok());
    }

    // Raw forward transform (unwindowed); `time` is used as scratch.
    pub fn forward(&mut self, time: &mut [f32], spectrum: &mut [Complex<f32>]) {
        let result = self
            .forward
            .process_with_scratch(time, spectrum, &mut self.scratch);
        debug_assert!(result.is_ok());
    }

    // Raw inverse transform, unnormalized (× size); `spectrum` is scratch.
    pub fn inverse(&mut self, spectrum: &mut [Complex<f32>], time: &mut [f32]) {
        let last = spectrum.len() - 1;
        spectrum[0].im = 0.0;
        spectrum[last].im = 0.0;
        let result = self
            .inverse
            .process_with_scratch(spectrum, time, &mut self.scratch);
        debug_assert!(result.is_ok());
    }

    // Inverse transform, synthesis window and overlap-add; `spectrum` is scratch.
    pub fn synthesize(&mut self, spectrum: &mut [Complex<f32>], overlap: &mut Overlap) {
        let mut time = std::mem::take(&mut self.time);
        self.inverse(spectrum, &mut time);
        // Hann² at 4× overlap sums to 1.5.
        let scale = 1.0 / (self.size as f32 * 1.5);
        for ((accum, sample), window) in overlap.accum.iter_mut().zip(&time).zip(&self.window) {
            *accum += sample * window * scale;
        }
        self.time = time;
        overlap.emit(self.hop);
    }

    pub fn reset(&mut self) {
        self.input.fill(0.0);
        self.fill = 0;
    }
}

// One synthesized output stream: the overlap-add accumulator and the hop of
// finished samples it hands out.
pub struct Overlap {
    accum: Vec<f32>,
    out: Vec<f32>,
}

impl Overlap {
    pub fn new(stft: &Stft) -> Self {
        Self {
            accum: vec![0.0; stft.size],
            out: vec![0.0; stft.hop],
        }
    }

    fn emit(&mut self, hop: usize) {
        self.out.copy_from_slice(&self.accum[..hop]);
        self.accum.copy_within(hop.., 0);
        let size = self.accum.len();
        self.accum[size - hop..].fill(0.0);
    }

    #[inline]
    pub fn read(&self, index: usize) -> f32 {
        self.out[index]
    }

    pub fn clear(&mut self) {
        self.accum.fill(0.0);
        self.out.fill(0.0);
    }
}
