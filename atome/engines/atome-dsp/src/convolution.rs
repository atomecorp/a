// Convolution with a measured impulse response: the cabinet (Baffle) after an
// amp, or a room. Zero latency: the head of the response runs in small
// partitions, its tail in large ones (two-stage uniform partitioning).

use crate::resample::{Resampler, HALF_TAPS};
use crate::{db_to_amplitude, ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use fft_convolver::TwoStageFFTConvolver;

pub const MIX: u32 = 0;
pub const LEVEL_DB: u32 = 1;
pub const PARAMS: [ParamSpec; 2] = [
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::new(LEVEL_DB, "level_db", -24.0, 24.0, 0.0, Unit::Decibels),
];

const HEAD_BLOCK: usize = 64;

#[derive(Debug, Clone, PartialEq)]
pub enum ImpulseError {
    Empty,
    ChannelLengthMismatch,
    Silent,
}

// The response as it was measured, one or two channels at its own rate.
pub struct Impulse {
    left: Vec<f32>,
    right: Option<Vec<f32>>,
    sample_rate: f64,
}

impl Impulse {
    pub fn new(left: Vec<f32>, right: Option<Vec<f32>>, sample_rate: f64) -> Result<Self, ImpulseError> {
        if left.is_empty() {
            return Err(ImpulseError::Empty);
        }
        if right.as_ref().is_some_and(|right| right.len() != left.len()) {
            return Err(ImpulseError::ChannelLengthMismatch);
        }
        let energy: f32 = left.iter().chain(right.iter().flatten()).map(|x| x * x).sum();
        if energy <= 1.0e-12 {
            return Err(ImpulseError::Silent);
        }
        Ok(Self { left, right, sample_rate })
    }

    pub fn frames(&self) -> usize {
        self.left.len()
    }

    fn at_rate(channel: &[f32], source_rate: f64, device_rate: f64) -> Vec<f32> {
        if (source_rate - device_rate).abs() < 0.5 {
            channel.to_vec()
        } else {
            resample_whole(channel, source_rate, device_rate)
        }
    }
}

// Offline conversion of a whole response, its filter delay removed.
fn resample_whole(source: &[f32], source_rate: f64, device_rate: f64) -> Vec<f32> {
    let ratio = device_rate / source_rate;
    let frames = (source.len() as f64 * ratio).ceil() as usize;
    let mut resampler = Resampler::new();
    resampler.allocate(source_rate, device_rate, source.len() + HALF_TAPS * 4);
    for &sample in source.iter().chain(std::iter::repeat_n(&0.0, HALF_TAPS * 2)) {
        resampler.push(sample);
    }
    let mut out = Vec::with_capacity(frames);
    while out.len() < frames && resampler.can_read() {
        out.push(resampler.read());
    }
    out
}

pub struct Convolution {
    impulse: Impulse,
    convolvers: [TwoStageFFTConvolver<f32>; 2],
    wet: [Vec<f32>; 2],
    mix: Smoothed,
    level: Smoothed,
    tail: u32,
}

impl Convolution {
    pub fn new(impulse: Impulse) -> Self {
        Self {
            impulse,
            convolvers: [TwoStageFFTConvolver::default(), TwoStageFFTConvolver::default()],
            wet: [Vec::new(), Vec::new()],
            mix: Smoothed::new(PARAMS[0].default, 20.0),
            level: Smoothed::new(1.0, 10.0),
            tail: 0,
        }
    }
}

impl Processor for Convolution {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.mix.prepare(sample_rate);
        self.level.prepare(sample_rate);
        let impulse = &self.impulse;
        let device_rate = sample_rate as f64;
        let mut left = Impulse::at_rate(&impulse.left, impulse.sample_rate, device_rate);
        let mut right = impulse.right.as_ref().map(|right| Impulse::at_rate(right, impulse.sample_rate, device_rate));
        // Energy-normalised so the wet signal keeps the dry level, whatever
        // the response's own gain.
        let channels = if right.is_some() { 2.0 } else { 1.0 };
        let energy = left.iter().chain(right.iter().flatten()).map(|x| x * x).sum::<f32>() / channels;
        let scale = 1.0 / energy.sqrt();
        for sample in left.iter_mut().chain(right.iter_mut().flatten()) {
            *sample *= scale;
        }
        self.tail = left.len() as u32;
        let tail_block = (left.len() / 8).next_power_of_two().clamp(HEAD_BLOCK * 4, 2048);
        for (convolver, response) in self.convolvers.iter_mut().zip([&left, right.as_ref().unwrap_or(&left)]) {
            convolver
                .init(HEAD_BLOCK, tail_block, response)
                .expect("block sizes are non-zero by construction");
        }
        self.wet = [vec![0.0; max_block], vec![0.0; max_block]];
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let [wet_left, wet_right] = &mut self.wet;
        let [convolver_left, convolver_right] = &mut self.convolvers;
        convolver_left
            .process(block.left, &mut wet_left[..frames])
            .expect("input and output share the block length");
        convolver_right
            .process(block.right, &mut wet_right[..frames])
            .expect("input and output share the block length");
        for index in 0..frames {
            let mix = self.mix.tick();
            let level = self.level.tick();
            block.left[index] = block.left[index] * (1.0 - mix) + wet_left[index] * mix * level;
            block.right[index] = block.right[index] * (1.0 - mix) + wet_right[index] * mix * level;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else { return };
        let value = spec.clamp(value);
        match id {
            MIX => self.mix.set(value),
            LEVEL_DB => self.level.set(db_to_amplitude(value)),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn tail_frames(&self) -> u32 {
        self.tail
    }

    fn reset(&mut self) {
        self.mix.settle();
        self.level.settle();
        for convolver in &mut self.convolvers {
            convolver.reset();
        }
    }
}
