// The stretcher itself: Signalsmith Stretch 1.3.1 (MIT, Geraint Luff, Signalsmith Audio; THIRD_PARTY_LICENSES.md)
// ported to Rust for its time stretch — the duration changes, never the pitch (atome reads the pitch with its own
// sinc reader, stretch.rs). A phase vocoder: each output block's phases are predicted from the last output block
// (the "time" step) and from the neighbouring bins of the same block (the "vertical" steps, a short and a long one,
// up and down), the channel with the most energy predicted first and the others locked to it. Past ×2 of
// stretch, the vertical steps take a random time factor, as the original does, to blur what would ring.
// Same steps, same order, same constants as the C++ (signalsmith-stretch.h); the transposition, the frequency map
// and the formants, which atome never asks of it, are not carried. Nothing here allocates once built.

use super::stft::Stft;
use rustfft::num_complex::Complex32;
use std::f32::consts::PI;

const CHANNELS: usize = 2;
const NOISE_FLOOR: f32 = 1e-15;
// The stretch beyond which the vertical steps' time factor is randomised.
const MAX_CLEAN_STRETCH: f32 = 2.0;

#[derive(Clone, Copy, Default)]
struct Band {
    input: Complex32,
    prev_input: Complex32,
    output: Complex32,
    input_energy: f32,
}

#[derive(Clone, Copy, Default)]
struct Prediction {
    energy: f32,
    input: Complex32,
}

impl Prediction {
    fn output_for(&self, phase: Complex32) -> Complex32 {
        let (mut phase, mut phase_norm) = (phase, norm(phase));
        if phase_norm <= NOISE_FLOOR {
            phase = self.input;
            phase_norm = norm(self.input) + NOISE_FLOOR;
        }
        phase * (self.energy / phase_norm).sqrt()
    }
}

fn mul(a: Complex32, b: Complex32) -> Complex32 {
    Complex32::new(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
}
// a × conj(b).
fn mul_conj(a: Complex32, b: Complex32) -> Complex32 {
    Complex32::new(b.re * a.re + b.im * a.im, b.re * a.im - b.im * a.re)
}
fn norm(a: Complex32) -> f32 {
    a.re * a.re + a.im * a.im
}

pub struct Stretcher {
    stft: Stft,
    bands: Vec<Band>,
    predictions: Vec<Prediction>,
    seek_buffer: Vec<f32>,
    prev_input_offset: i64,
    did_seek: bool,
    seek_time_factor: f32,
    silence_counter: usize,
    silence_first: bool,
    // Output frames since the last block (none yet: a block at once).
    since_block: usize,
    time_factor: f32,
    random: u32,
}

impl Stretcher {
    pub fn new(block: usize, interval: usize) -> Self {
        let stft = Stft::new(CHANNELS, block, interval, interval + 1);
        let bins = stft.bins();
        let mut stretcher = Self {
            bands: vec![Band::default(); bins * CHANNELS],
            predictions: vec![Prediction::default(); bins * CHANNELS],
            seek_buffer: vec![0.0; block + interval],
            stft,
            prev_input_offset: -1,
            did_seek: false,
            seek_time_factor: 1.0,
            silence_counter: 0,
            silence_first: true,
            since_block: usize::MAX,
            time_factor: 1.0,
            random: 0x9e37_79b9,
        };
        stretcher.reset();
        stretcher
    }

    pub fn input_latency(&self) -> usize {
        self.stft.analysis_latency()
    }
    pub fn output_latency(&self) -> usize {
        self.stft.synthesis_latency()
    }

    pub fn reset(&mut self) {
        self.stft.reset(0.1);
        self.prev_input_offset = -1;
        self.bands.fill(Band::default());
        self.silence_counter = 0;
        self.did_seek = false;
        self.since_block = usize::MAX;
    }

    // Input before the playing point (ideally a block and an interval), the speed not taken from it.
    pub fn seek(&mut self, input: [&[f32]; CHANNELS], playback_rate: f64) {
        let length = self.seek_buffer.len();
        let frames = input[0].len();
        let start = frames.saturating_sub(length);
        let pad = length + start - frames;
        let mut energy = 0.0f32;
        for (channel, source) in input.iter().enumerate() {
            self.seek_buffer.fill(0.0);
            for index in start..frames {
                energy += source[index] * source[index];
                self.seek_buffer[index - start + pad] = source[index];
            }
            self.stft.write_input(channel, &self.seek_buffer);
        }
        self.stft.move_input(length);
        if energy >= NOISE_FLOOR {
            self.silence_counter = 0;
            self.silence_first = true;
        }
        self.did_seek = true;
        let interval = self.stft.interval() as f64;
        self.seek_time_factor = if playback_rate * interval > 1.0 {
            (1.0 / playback_rate) as f32
        } else {
            interval as f32
        };
    }

    // `input[c][..to]` past what was copied, the last block + interval of it, into the STFT's input.
    fn copy_input(&mut self, input: [&[f32]; CHANNELS], copied: &mut usize, to: usize) {
        let length = (self.stft.block() + self.stft.interval()).min(to - *copied);
        for (channel, source) in input.iter().enumerate() {
            self.stft.write_input(channel, &source[to - length..to]);
        }
        self.stft.move_input(length);
        *copied = to;
    }

    pub fn process(&mut self, input: [&[f32]; CHANNELS], output: [&mut [f32]; CHANNELS]) {
        let [left, right] = output;
        let (in_frames, out_frames) = (input[0].len(), left.len());
        let mut copied = 0;
        let energy: f32 = input
            .iter()
            .flat_map(|channel| channel.iter())
            .map(|s| s * s)
            .sum();
        if energy < NOISE_FLOOR {
            if self.silence_counter >= 2 * self.stft.block() {
                if self.silence_first {
                    self.silence_first = false;
                    self.since_block = usize::MAX;
                    for band in &mut self.bands {
                        band.input = Complex32::default();
                        band.prev_input = Complex32::default();
                        band.output = Complex32::default();
                        band.input_energy = 0.0;
                    }
                }
                for index in 0..out_frames {
                    let (l, r) = if in_frames > 0 {
                        (input[0][index % in_frames], input[1][index % in_frames])
                    } else {
                        (0.0, 0.0)
                    };
                    left[index] = l;
                    right[index] = r;
                }
                self.copy_input(input, &mut copied, in_frames);
                return;
            }
            self.silence_counter += in_frames;
        } else {
            self.silence_counter = 0;
            self.silence_first = true;
        }
        let interval = self.stft.interval();
        for index in 0..out_frames {
            if self.since_block >= interval {
                self.since_block = 0;
                let offset = (index as f32 * in_frames as f32 / out_frames as f32).round() as i64;
                let step = offset - self.prev_input_offset;
                self.prev_input_offset = offset;
                self.copy_input(input, &mut copied, offset as usize);
                self.block(step);
            }
            self.since_block += 1;
            left[index] = self.stft.read_output(0);
            right[index] = self.stft.read_output(1);
            self.stft.move_output(1);
        }
        self.copy_input(input, &mut copied, in_frames);
        self.prev_input_offset -= in_frames as i64;
    }

    // One output block, `step` input frames after the last.
    fn block(&mut self, step: i64) {
        let interval = self.stft.interval();
        let new_spectrum = self.did_seek || step > 0;
        if new_spectrum {
            if self.did_seek || (step - interval as i64).abs() > 1 {
                self.analyse(interval, |band, value| band.prev_input = value);
            }
            self.analyse(0, |band, value| band.input = value);
        }
        self.time_factor = if self.did_seek {
            self.seek_time_factor
        } else {
            interval as f32 / (step as f32).max(1.0)
        };
        self.did_seek = false;
        self.process_spectrum(new_spectrum);
        let bins = self.stft.bins();
        for channel in 0..CHANNELS {
            let bands = &self.bands[channel * bins..(channel + 1) * bins];
            for (slot, band) in self.stft.spectrum(channel).iter_mut().zip(bands) {
                *slot = band.output;
            }
        }
        for channel in 0..CHANNELS {
            self.stft.synthesise(channel);
        }
    }

    fn analyse(&mut self, past: usize, store: fn(&mut Band, Complex32)) {
        let bins = self.stft.bins();
        for channel in 0..CHANNELS {
            self.stft.analyse(channel, past);
            let bands = &mut self.bands[channel * bins..(channel + 1) * bins];
            for (band, &value) in bands.iter_mut().zip(self.stft.spectrum(channel).iter()) {
                store(band, value);
            }
        }
    }

    fn random_between(&mut self, low: f32, high: f32) -> f32 {
        // xorshift32: the original draws from std::default_random_engine, seeded at random.
        self.random ^= self.random << 13;
        self.random ^= self.random >> 17;
        self.random ^= self.random << 5;
        low + (high - low) * ((self.random >> 8) as f32 / (1u32 << 24) as f32)
    }

    // The band's `input` at a fractional bin, zero outside the spectrum.
    fn input_at(&self, channel: usize, bin: f32) -> Complex32 {
        let bins = self.stft.bins() as i64;
        let low = bin.floor();
        let fraction = bin - low;
        let at = |index: i64| {
            if (0..bins).contains(&index) {
                self.bands[(channel as i64 * bins + index) as usize].input
            } else {
                Complex32::default()
            }
        };
        let (a, b) = (at(low as i64), at(low as i64 + 1));
        a + (b - a) * fraction
    }

    fn process_spectrum(&mut self, new_spectrum: bool) {
        let bins = self.stft.bins();
        let interval = self.stft.interval() as f32;
        let long_step = (self.stft.fft_size() as f32 / interval).round() as usize;
        let time_factor = self.time_factor.max(1.0 / MAX_CLEAN_STRETCH);
        let random_factor = time_factor > MAX_CLEAN_STRETCH;
        if new_spectrum {
            let step = polar(
                (self.stft.bin_to_freq(1.0) - self.stft.bin_to_freq(0.0)) * interval * 2.0 * PI,
            );
            for channel in 0..CHANNELS {
                let mut rotation = polar(self.stft.bin_to_freq(0.0) * interval * 2.0 * PI);
                for band in &mut self.bands[channel * bins..(channel + 1) * bins] {
                    band.output = mul(band.output, rotation);
                    band.prev_input = mul(band.prev_input, rotation);
                    rotation = mul(rotation, step);
                }
            }
        }
        for band in &mut self.bands {
            band.input_energy = norm(band.input);
        }
        // The phase vocoder's own prediction, from the last output block.
        for index in 0..bins * CHANNELS {
            let band = &mut self.bands[index];
            let prediction = &mut self.predictions[index];
            let previous = prediction.energy;
            prediction.energy = band.input_energy;
            prediction.input = band.input;
            let phase = mul(band.output, mul_conj(prediction.input, band.prev_input));
            band.output = phase / (previous.max(prediction.energy) + NOISE_FLOOR);
        }
        // Re-predicted from the neighbouring bins, the loudest channel first.
        for bin in 0..bins {
            let loudest = (1..CHANNELS).fold(0, |best, channel| {
                if self.predictions[channel * bins + bin].energy
                    > self.predictions[best * bins + bin].energy
                {
                    channel
                } else {
                    best
                }
            });
            let base = loudest * bins;
            let prediction = self.predictions[base + bin];
            let mut phase = Complex32::default();
            if bin > 0 {
                let factor = if random_factor {
                    self.random_between(MAX_CLEAN_STRETCH * 2.0 - time_factor, time_factor)
                } else {
                    time_factor
                };
                let down = self.input_at(loudest, bin as f32 - factor);
                phase += mul(
                    self.bands[base + bin - 1].output,
                    mul_conj(prediction.input, down),
                );
                if bin >= long_step {
                    let long_down = self.input_at(loudest, bin as f32 - long_step as f32 * factor);
                    phase += mul(
                        self.bands[base + bin - long_step].output,
                        mul_conj(prediction.input, long_down),
                    );
                }
            }
            if bin < bins - 1 {
                let factor = if random_factor {
                    self.random_between(MAX_CLEAN_STRETCH * 2.0 - time_factor, time_factor)
                } else {
                    time_factor
                };
                let up = self.predictions[base + bin + 1];
                let down = self.input_at(loudest, (bin + 1) as f32 - factor);
                phase += mul_conj(self.bands[base + bin + 1].output, mul_conj(up.input, down));
                if bin < bins - long_step {
                    let long_up = self.predictions[base + bin + long_step];
                    let long_down = self.input_at(
                        loudest,
                        (bin + long_step) as f32 - long_step as f32 * factor,
                    );
                    phase += mul_conj(
                        self.bands[base + bin + long_step].output,
                        mul_conj(long_up.input, long_down),
                    );
                }
            }
            let output = prediction.output_for(phase);
            self.bands[base + bin].output = output;
            for channel in (0..CHANNELS).filter(|&channel| channel != loudest) {
                let other = self.predictions[channel * bins + bin];
                let locked = mul(output, mul_conj(other.input, prediction.input));
                self.bands[channel * bins + bin].output = other.output_for(locked);
            }
        }
        if new_spectrum {
            for band in &mut self.bands {
                band.prev_input = band.input;
            }
        }
    }
}

fn polar(phase: f32) -> Complex32 {
    Complex32::new(phase.cos(), phase.sin())
}
