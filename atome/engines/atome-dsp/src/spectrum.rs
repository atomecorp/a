// Real-time spectrum analyser a processor carries: mono-summed samples feed a
// ring; every hop a Hann-windowed FFT is folded into 34 log-spaced bands from
// 20 Hz to 20 kHz, in dBFS, each falling back at 13 dB/s after a peak.
// `prepare` allocates everything; `push` never allocates, locks or does IO.

use crate::SILENCE_DB;
use realfft::num_complex::Complex;
use realfft::{RealFftPlanner, RealToComplex};
use std::sync::Arc;

pub const BANDS: usize = 34;
pub const LOWEST_HZ: f32 = 20.0;
pub const HIGHEST_HZ: f32 = 20000.0;
// Peak-hold falloff (rule 19: a Fibonacci number).
pub const FALL_DB_PER_SECOND: f32 = 13.0;

// Lower edge of band `index` (0..=BANDS); band i spans edge(i)..edge(i + 1).
pub fn band_edge_hz(index: usize) -> f32 {
    LOWEST_HZ * (HIGHEST_HZ / LOWEST_HZ).powf(index as f32 / BANDS as f32)
}

// Geometric centre of band `index`, where the UI draws its value.
pub fn band_centre_hz(index: usize) -> f32 {
    (band_edge_hz(index) * band_edge_hz(index + 1)).sqrt()
}

// FFT length: ~11.7 Hz bins at 44.1/48 kHz, the same resolution at 88.2/96 kHz.
fn fft_size(sample_rate: f32) -> usize {
    if sample_rate > 50000.0 { 8192 } else { 4096 }
}

pub struct Spectrum {
    fft: Option<Arc<dyn RealToComplex<f32>>>,
    ring: Vec<f32>,
    write: usize,
    since_hop: usize,
    hop: usize,
    window: Vec<f32>,
    input: Vec<f32>,
    output: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
    // Inclusive-exclusive bin range of each band (never empty once prepared).
    ranges: [(usize, usize); BANDS],
    // Amplitude scale turning a bin magnitude into a sine's peak amplitude.
    scale: f32,
    fall_per_hop_db: f32,
    bands: [f32; BANDS],
}

impl Default for Spectrum {
    fn default() -> Self {
        Self::new()
    }
}

impl Spectrum {
    pub fn new() -> Self {
        Self {
            fft: None,
            ring: Vec::new(),
            write: 0,
            since_hop: 0,
            hop: 0,
            window: Vec::new(),
            input: Vec::new(),
            output: Vec::new(),
            scratch: Vec::new(),
            ranges: [(0, 1); BANDS],
            scale: 0.0,
            fall_per_hop_db: 0.0,
            bands: [SILENCE_DB; BANDS],
        }
    }

    // Off the audio thread: plans the FFT and sizes every buffer.
    pub fn prepare(&mut self, sample_rate: f32) {
        let size = fft_size(sample_rate);
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(size);
        self.output = fft.make_output_vec();
        self.scratch = fft.make_scratch_vec();
        self.fft = Some(fft);
        self.ring = vec![0.0; size];
        self.input = vec![0.0; size];
        self.window = (0..size)
            .map(|n| {
                let phase = std::f32::consts::TAU * n as f32 / size as f32;
                0.5 - 0.5 * phase.cos()
            })
            .collect();
        // A sine of amplitude A peaks at A * sum(window) / 2 in its bin.
        self.scale = 2.0 / self.window.iter().sum::<f32>();
        self.hop = size / 4;
        self.fall_per_hop_db = FALL_DB_PER_SECOND * self.hop as f32 / sample_rate;
        let bins_per_hz = size as f32 / sample_rate;
        let last = size / 2;
        for (index, range) in self.ranges.iter_mut().enumerate() {
            let low = ((band_edge_hz(index) * bins_per_hz).ceil() as usize).min(last);
            let high = ((band_edge_hz(index + 1) * bins_per_hz).ceil() as usize).min(last + 1);
            *range = if high > low {
                (low, high)
            } else {
                // Narrower than a bin (the lowest bands): the bin holding its centre.
                let bin = ((band_centre_hz(index) * bins_per_hz).round() as usize).min(last);
                (bin, bin + 1)
            };
        }
        self.reset();
    }

    pub fn reset(&mut self) {
        self.ring.fill(0.0);
        self.write = 0;
        self.since_hop = 0;
        self.bands = [SILENCE_DB; BANDS];
    }

    // The 34 band levels in dBFS, low to high; SILENCE_DB at the floor.
    pub fn bands(&self) -> &[f32; BANDS] {
        &self.bands
    }

    // Feeds a stereo block, summed to mono; analyses at every hop boundary.
    pub fn push(&mut self, left: &[f32], right: &[f32]) {
        if self.fft.is_none() {
            return;
        }
        let size = self.ring.len();
        for (l, r) in left.iter().zip(right) {
            self.ring[self.write] = 0.5 * (l + r);
            self.write = (self.write + 1) % size;
            self.since_hop += 1;
            if self.since_hop == self.hop {
                self.since_hop = 0;
                self.analyse();
            }
        }
    }

    fn analyse(&mut self) {
        let Some(fft) = self.fft.as_ref() else {
            return;
        };
        let size = self.ring.len();
        // Oldest sample first: the ring unrolled from the write position.
        for (n, slot) in self.input.iter_mut().enumerate() {
            *slot = self.ring[(self.write + n) % size] * self.window[n];
        }
        let result = fft.process_with_scratch(&mut self.input, &mut self.output, &mut self.scratch);
        // Lengths come from the plan itself in `prepare`: an error is a bug.
        debug_assert!(result.is_ok(), "spectrum FFT buffers mismatch");
        let scale_squared = self.scale * self.scale;
        for (band, &(low, high)) in self.bands.iter_mut().zip(&self.ranges) {
            let peak = self.output[low..high]
                .iter()
                .map(Complex::norm_sqr)
                .fold(0.0, f32::max);
            let power = peak * scale_squared;
            let level = if power > 1.0e-12 {
                (10.0 * power.log10()).max(SILENCE_DB)
            } else {
                SILENCE_DB
            };
            *band = level.max((*band - self.fall_per_hop_db).max(SILENCE_DB));
        }
    }
}
