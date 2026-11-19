// The short-time Fourier transform under the stretcher: Signalsmith Linear's DynamicSTFT (MIT, Geraint Luff,
// Signalsmith Audio; THIRD_PARTY_LICENSES.md) ported to Rust in the one configuration the stretcher uses —
// half-bin-shifted ("modified") real spectra, every step computed at once, a Kaiser window forced to perfect
// reconstruction, the same window for analysis and synthesis, centred on the block.
// The real transform is the original's: pairs of samples twisted by half a bin into a complex FFT of half the
// size (rustfft), then untangled by its twiddles. Nothing here allocates once built.

use rustfft::num_complex::Complex32;
use rustfft::{Fft, FftPlanner};
use std::f64::consts::PI;
use std::sync::Arc;

const ALMOST_ZERO: f32 = 1e-30;

pub struct Stft {
    channels: usize,
    block: usize,
    fft_size: usize,
    bins: usize,
    interval: usize,
    offset: usize,
    // The input ring (`input_length` frames a channel) and the output ring (`block` frames a channel).
    input_length: usize,
    input_pos: usize,
    input: Vec<f32>,
    output_pos: usize,
    output: Vec<f32>,
    products: Vec<f32>,
    window: Vec<f32>,
    time: Vec<f32>,
    spectrum: Vec<Complex32>,
    half: Vec<Complex32>,
    scratch: Vec<Complex32>,
    twiddles: Vec<Complex32>,
    twists: Vec<Complex32>,
    forward: Arc<dyn Fft<f32>>,
    inverse: Arc<dyn Fft<f32>>,
}

// The original's size rule: the smallest fast size (2^n × 1..8, never 7) at or above `size`.
fn fast_size_above(size: usize) -> usize {
    let mut pow2 = 1;
    while pow2 < 16 && pow2 < size {
        pow2 *= 2;
    }
    while pow2 * 8 < size {
        pow2 *= 2;
    }
    let multiple = size.div_ceil(pow2);
    (if multiple == 7 { 8 } else { multiple }) * pow2
}

fn bessel0(x: f64) -> f64 {
    let (mut result, mut term, mut m) = (0.0, 1.0, 0.0);
    while term > 1e-4 {
        result += term;
        m += 1.0;
        term *= (x * x) / (4.0 * m * m);
    }
    result
}

// Kaiser for a bandwidth (the original's heuristic optimum), then each hop's sum of squares brought to 1.
fn kaiser_window(block: usize, interval: usize) -> Vec<f32> {
    let bandwidth = block as f64 / interval as f64;
    let bandwidth = (bandwidth
        + 8.0 / ((bandwidth + 3.0) * (bandwidth + 3.0))
        + 0.25 * (3.0 - bandwidth).max(0.0))
    .max(2.0);
    let beta = (bandwidth * bandwidth * 0.25 - 1.0).sqrt() * PI;
    let inverse_b0 = 1.0 / bessel0(beta);
    let mut window: Vec<f32> = (0..block)
        .map(|index| {
            let r = (2 * index + 1) as f64 / block as f64 - 1.0;
            (bessel0(beta * (1.0 - r * r).sqrt()) * inverse_b0) as f32
        })
        .collect();
    for start in 0..interval {
        let sum: f64 = window[start..]
            .iter()
            .step_by(interval)
            .map(|&v| (v * v) as f64)
            .sum();
        let factor = 1.0 / sum.sqrt();
        for value in window[start..].iter_mut().step_by(interval) {
            *value = (*value as f64 * factor) as f32;
        }
    }
    window
}

fn polar(phase: f32) -> Complex32 {
    Complex32::new(phase.cos(), phase.sin())
}

impl Stft {
    // `history`: input frames kept beyond the block.
    pub fn new(channels: usize, block: usize, interval: usize, history: usize) -> Self {
        let fft_size = fast_size_above(block.div_ceil(2).div_ceil(2)) * 4;
        let half = fft_size / 2;
        let mut planner = FftPlanner::new();
        let forward = planner.plan_fft_forward(half);
        let inverse = planner.plan_fft_inverse(half);
        let scratch = forward
            .get_inplace_scratch_len()
            .max(inverse.get_inplace_scratch_len());
        let twiddles = (0..half / 2 + 1)
            .map(|i| polar(((i as f64 + 0.5) * (-2.0 * PI / fft_size as f64) - PI / 2.0) as f32))
            .collect();
        let twists = (0..half)
            .map(|i| polar((-2.0 * PI * i as f64 / fft_size as f64) as f32))
            .collect();
        let input_length = block + history;
        let mut stft = Self {
            channels,
            block,
            fft_size,
            bins: half,
            interval,
            offset: block / 2,
            input_length,
            input_pos: 0,
            input: vec![0.0; input_length * channels],
            output_pos: 0,
            output: vec![0.0; block * channels],
            products: vec![0.0; block],
            window: kaiser_window(block, interval),
            time: vec![0.0; fft_size],
            spectrum: vec![Complex32::default(); half * channels],
            half: vec![Complex32::default(); half],
            scratch: vec![Complex32::default(); scratch],
            twiddles,
            twists,
            forward,
            inverse,
        };
        stft.reset(1.0);
        stft
    }

    pub fn block(&self) -> usize {
        self.block
    }
    pub fn fft_size(&self) -> usize {
        self.fft_size
    }
    pub fn interval(&self) -> usize {
        self.interval
    }
    pub fn bins(&self) -> usize {
        self.bins
    }
    pub fn analysis_latency(&self) -> usize {
        self.block - self.offset
    }
    pub fn synthesis_latency(&self) -> usize {
        self.offset
    }
    pub fn bin_to_freq(&self, bin: f32) -> f32 {
        (bin + 0.5) / self.fft_size as f32
    }

    pub fn spectrum(&mut self, channel: usize) -> &mut [Complex32] {
        &mut self.spectrum[channel * self.bins..(channel + 1) * self.bins]
    }

    pub fn reset(&mut self, product_weight: f32) {
        self.input_pos = self.block % self.input_length;
        self.output_pos = 0;
        self.input.fill(0.0);
        self.output.fill(0.0);
        self.spectrum.fill(Complex32::default());
        self.products.fill(0.0);
        self.add_window_product();
        for index in (0..self.block - self.interval).rev() {
            self.products[index] += self.products[index + self.interval];
        }
        for value in &mut self.products {
            *value = *value * product_weight + ALMOST_ZERO;
        }
        self.move_output(self.interval);
    }

    pub fn write_input(&mut self, channel: usize, frames: &[f32]) {
        let ring = &mut self.input[channel * self.input_length..(channel + 1) * self.input_length];
        for (index, &value) in frames.iter().enumerate() {
            ring[(self.input_pos + index) % self.input_length] = value;
        }
    }

    pub fn move_input(&mut self, frames: usize) {
        self.input_pos = (self.input_pos + frames) % self.input_length;
    }

    // The output frame at the ring's head, normalised by the windows that made it.
    pub fn read_output(&self, channel: usize) -> f32 {
        self.output[channel * self.block + self.output_pos] / self.products[self.output_pos]
    }

    pub fn move_output(&mut self, frames: usize) {
        for index in 0..frames {
            let at = (self.output_pos + index) % self.block;
            for channel in 0..self.channels {
                self.output[channel * self.block + at] = 0.0;
            }
            self.products[at] = ALMOST_ZERO;
        }
        self.output_pos = (self.output_pos + frames) % self.block;
    }

    fn add_window_product(&mut self) {
        let scale = self.fft_size as f32;
        for index in 0..self.block {
            self.products[(self.output_pos + index) % self.block] +=
                self.window[index] * self.window[index] * scale;
        }
    }

    // The block ending `past` frames before the input's head, windowed, into the channel's spectrum.
    pub fn analyse(&mut self, channel: usize, past: usize) {
        let start =
            (self.input_length * 2 + self.input_pos - self.block - past) % self.input_length;
        let ring = &self.input[channel * self.input_length..(channel + 1) * self.input_length];
        for index in 0..self.block {
            let value = ring[(start + index) % self.input_length];
            if index < self.offset {
                self.time[index + self.fft_size - self.offset] = value * -self.window[index];
            } else {
                self.time[index - self.offset] = value * self.window[index];
            }
        }
        self.time[self.block - self.offset..self.fft_size - self.offset].fill(0.0);
        self.forward_transform(channel);
    }

    // The channel's spectrum back to time, windowed and added into the output ring (the first channel also adds
    // the block's window product).
    pub fn synthesise(&mut self, channel: usize) {
        if channel == 0 {
            self.add_window_product();
        }
        self.inverse_transform(channel);
        let ring = &mut self.output[channel * self.block..(channel + 1) * self.block];
        for index in 0..self.block {
            let at = (self.output_pos + index) % self.block;
            if index < self.offset {
                ring[at] += self.time[index + self.fft_size - self.offset] * -self.window[index];
            } else {
                ring[at] += self.time[index - self.offset] * self.window[index];
            }
        }
    }

    fn forward_transform(&mut self, channel: usize) {
        let size = self.bins;
        for (index, slot) in self.half.iter_mut().enumerate() {
            let (tr, ti, twist) = (
                self.time[2 * index],
                self.time[2 * index + 1],
                self.twists[index],
            );
            *slot = Complex32::new(tr * twist.re - ti * twist.im, ti * twist.re + tr * twist.im);
        }
        self.forward
            .process_with_scratch(&mut self.half, &mut self.scratch);
        let freq = &mut self.spectrum[channel * size..(channel + 1) * size];
        for index in 0..size / 2 + 1 {
            let conj = size - 1 - index;
            let twiddle = self.twiddles[index];
            let (a, b) = (self.half[index], self.half[conj].conj());
            let odd = (a + b) * 0.5;
            let even = (a - b) * 0.5;
            let rotated = Complex32::new(
                even.re * twiddle.re - even.im * twiddle.im,
                even.im * twiddle.re + even.re * twiddle.im,
            );
            freq[index] = odd + rotated;
            freq[conj] = Complex32::new(odd.re - rotated.re, rotated.im - odd.im);
        }
    }

    fn inverse_transform(&mut self, channel: usize) {
        let size = self.bins;
        let freq = &self.spectrum[channel * size..(channel + 1) * size];
        for index in 0..size / 2 + 1 {
            let conj = size - 1 - index;
            let twiddle = self.twiddles[index];
            let odd = freq[index] + freq[conj].conj();
            let rotated = freq[index] - freq[conj].conj();
            let even = Complex32::new(
                rotated.re * twiddle.re + rotated.im * twiddle.im,
                rotated.im * twiddle.re - rotated.re * twiddle.im,
            );
            self.half[index] = odd + even;
            self.half[conj] = Complex32::new(odd.re - even.re, even.im - odd.im);
        }
        self.inverse
            .process_with_scratch(&mut self.half, &mut self.scratch);
        for (index, value) in self.half.iter().enumerate() {
            let twist = self.twists[index];
            self.time[2 * index] = value.re * twist.re + value.im * twist.im;
            self.time[2 * index + 1] = value.im * twist.re - value.re * twist.im;
        }
    }
}

#[cfg(test)]
#[path = "stft_tests.rs"]
mod tests;
