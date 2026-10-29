// Linkwitz-Riley band split (24 dB/octave): two, three or four bands whose sum
// is an all-pass of the input, flat in level, so the bands left in a strip
// rebuild its sound. Band k leaves on port k (port 0 stays in the block).

use crate::biquad::{Coefficients, Section, Shape};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const MAX_BANDS: usize = 4;
const BUTTERWORTH_Q: f32 = std::f32::consts::FRAC_1_SQRT_2;
const REDESIGN_FRAMES: usize = 16;

pub const BANDS_2_PARAMS: [ParamSpec; 1] = [ParamSpec::new(0, "crossover_1", 21.0, 20000.0, 987.0, Unit::Hertz)];
pub const BANDS_3_PARAMS: [ParamSpec; 2] = [
    ParamSpec::new(0, "crossover_1", 21.0, 20000.0, 233.0, Unit::Hertz),
    ParamSpec::new(1, "crossover_2", 21.0, 20000.0, 2584.0, Unit::Hertz),
];
pub const BANDS_4_PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(0, "crossover_1", 21.0, 20000.0, 144.0, Unit::Hertz),
    ParamSpec::new(1, "crossover_2", 21.0, 20000.0, 987.0, Unit::Hertz),
    ParamSpec::new(2, "crossover_3", 21.0, 20000.0, 4181.0, Unit::Hertz),
];

pub fn params_for(bands: usize) -> &'static [ParamSpec] {
    match bands {
        2 => &BANDS_2_PARAMS,
        3 => &BANDS_3_PARAMS,
        _ => &BANDS_4_PARAMS,
    }
}

#[derive(Default, Clone, Copy)]
struct Crossover {
    low: Coefficients,
    high: Coefficients,
    all_pass: Coefficients,
}

// One channel's filter states: two sections per side of each crossover, and
// the all-passes each lower band takes for every crossover above it.
#[derive(Default, Clone, Copy)]
struct Channel {
    low: [[Section; 2]; MAX_BANDS - 1],
    high: [[Section; 2]; MAX_BANDS - 1],
    all_pass: [[Section; MAX_BANDS - 1]; MAX_BANDS - 1],
}

impl Channel {
    #[inline]
    fn split(&mut self, crossovers: &[Crossover], input: f32, out: &mut [f32; MAX_BANDS]) {
        let count = crossovers.len();
        let mut rest = input;
        for (k, c) in crossovers.iter().enumerate() {
            let [low_a, low_b] = &mut self.low[k];
            let mut band = low_b.tick(&c.low, low_a.tick(&c.low, rest));
            let [high_a, high_b] = &mut self.high[k];
            rest = high_b.tick(&c.high, high_a.tick(&c.high, rest));
            for (j, above) in crossovers.iter().enumerate().skip(k + 1) {
                band = self.all_pass[k][j].tick(&above.all_pass, band);
            }
            out[k] = band;
        }
        out[count] = rest;
    }

    fn reset(&mut self) {
        *self = Self::default();
    }
}

pub struct Bands {
    bands: usize,
    sample_rate: f32,
    frequencies: [Smoothed; MAX_BANDS - 1],
    crossovers: [Crossover; MAX_BANDS - 1],
    channels: [Channel; 2],
}

impl Bands {
    pub fn new(bands: usize) -> Self {
        let bands = bands.clamp(2, MAX_BANDS);
        let mut frequencies = [Smoothed::new(1000.0, 34.0); MAX_BANDS - 1];
        for (smoothed, spec) in frequencies.iter_mut().zip(params_for(bands)) {
            *smoothed = Smoothed::new(spec.default, 34.0);
        }
        Self { bands, sample_rate: 48000.0, frequencies, crossovers: Default::default(), channels: Default::default() }
    }

    // Each crossover keeps above the one below it, whatever was asked.
    fn redesign(&mut self, frames: usize) {
        let mut floor = 0.0f32;
        for (smoothed, crossover) in self.frequencies.iter_mut().zip(self.crossovers.iter_mut()).take(self.bands - 1) {
            let mut frequency = smoothed.target();
            for _ in 0..frames.max(1) {
                frequency = smoothed.tick();
            }
            let frequency = frequency.max(floor);
            floor = frequency;
            crossover.low = Coefficients::design(Shape::LowPass, self.sample_rate, frequency, BUTTERWORTH_Q, 0.0);
            crossover.high = Coefficients::design(Shape::HighPass, self.sample_rate, frequency, BUTTERWORTH_Q, 0.0);
            crossover.all_pass = Coefficients::all_pass(self.sample_rate, frequency, BUTTERWORTH_Q);
        }
    }

    fn settled(&self) -> bool {
        self.frequencies[..self.bands - 1].iter().all(Smoothed::is_settled)
    }
}

impl Processor for Bands {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        for smoothed in &mut self.frequencies {
            smoothed.prepare(sample_rate);
            let target = smoothed.target();
            smoothed.snap(target);
        }
        self.redesign(1);
    }

    // Alone (no port wired), the split sums straight back: the all-pass.
    fn process(&mut self, block: &mut StereoBlock) {
        self.process_ports(block, &mut []);
    }

    fn process_ports(&mut self, block: &mut StereoBlock, extra: &mut [StereoBlock]) {
        let frames = block.frames();
        let crossovers = self.bands - 1;
        let mut start = 0;
        while start < frames {
            let end = (start + REDESIGN_FRAMES).min(frames);
            if !self.settled() {
                self.redesign(end - start);
            }
            let crossovers = &self.crossovers[..crossovers];
            for index in start..end {
                let mut left = [0.0; MAX_BANDS];
                let mut right = [0.0; MAX_BANDS];
                self.channels[0].split(crossovers, block.left[index], &mut left);
                self.channels[1].split(crossovers, block.right[index], &mut right);
                // A port nobody reads folds back into port 0.
                let (mut main_left, mut main_right) = (left[0], right[0]);
                for port in 1..self.bands {
                    match extra.get_mut(port - 1) {
                        Some(out) => {
                            out.left[index] = left[port];
                            out.right[index] = right[port];
                        }
                        None => {
                            main_left += left[port];
                            main_right += right[port];
                        }
                    }
                }
                block.left[index] = main_left;
                block.right[index] = main_right;
            }
            start = end;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = params_for(self.bands).get(id as usize) {
            self.frequencies[id as usize].set(spec.clamp(value));
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        params_for(self.bands)
    }

    fn reset(&mut self) {
        for smoothed in &mut self.frequencies {
            smoothed.settle();
        }
        self.redesign(1);
        for channel in &mut self.channels {
            channel.reset();
        }
    }

    fn extra_outputs(&self) -> usize {
        self.bands - 1
    }
}
