// Delay line (fractional read) and the stereo echo effect built on it. The
// ring is sized once in `prepare`; changing the time never reallocates.

use crate::biquad::{Coefficients, Section, Shape};
use crate::{db_to_amplitude, ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub struct DelayLine {
    ring: Vec<f32>,
    write: usize,
}

impl DelayLine {
    pub fn new() -> Self {
        Self { ring: Vec::new(), write: 0 }
    }

    pub fn allocate(&mut self, max_frames: usize) {
        self.ring = vec![0.0; max_frames.max(1) + 2];
        self.write = 0;
    }

    pub fn capacity(&self) -> usize {
        self.ring.len().saturating_sub(2)
    }

    #[inline]
    pub fn push(&mut self, sample: f32) {
        self.ring[self.write] = sample;
        self.write = (self.write + 1) % self.ring.len();
    }

    // Linear interpolation `delay` frames behind the last pushed sample.
    #[inline]
    pub fn read(&self, delay: f32) -> f32 {
        let length = self.ring.len();
        let delay = delay.clamp(1.0, self.capacity() as f32);
        let whole = delay.floor();
        let fraction = delay - whole;
        let index = (self.write + length - whole as usize) % length;
        let previous = (index + length - 1) % length;
        self.ring[index] * (1.0 - fraction) + self.ring[previous] * fraction
    }

    pub fn clear(&mut self) {
        self.ring.fill(0.0);
    }
}

impl Default for DelayLine {
    fn default() -> Self {
        Self::new()
    }
}

pub const TIME_MS: u32 = 0;
pub const FEEDBACK_DB: u32 = 1;
pub const DAMPING_HZ: u32 = 2;
pub const MIX: u32 = 3;
pub const PARAMS: [ParamSpec; 4] = [
    ParamSpec::new(TIME_MS, "time_ms", 1.0, 2000.0, 377.0, Unit::Milliseconds),
    ParamSpec::new(FEEDBACK_DB, "feedback_db", -60.0, -0.5, -9.0, Unit::Decibels),
    ParamSpec::new(DAMPING_HZ, "damping_hz", 500.0, 20000.0, 8000.0, Unit::Hertz),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 0.34, Unit::Percent),
];
const MAX_TIME_MS: f32 = 2000.0;

pub struct Echo {
    sample_rate: f32,
    time: Smoothed,
    feedback: f32,
    mix: Smoothed,
    damping: Coefficients,
    damping_hz: f32,
    lines: [DelayLine; 2],
    filters: [Section; 2],
}

impl Echo {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            time: Smoothed::new(PARAMS[0].default, 89.0),
            feedback: db_to_amplitude(PARAMS[1].default),
            mix: Smoothed::new(PARAMS[3].default, 10.0),
            damping: Coefficients::default(),
            damping_hz: PARAMS[2].default,
            lines: [DelayLine::new(), DelayLine::new()],
            filters: [Section::default(); 2],
        }
    }

    fn design_damping(&mut self) {
        self.damping = Coefficients::design(Shape::LowPass, self.sample_rate, self.damping_hz, 0.707, 0.0);
    }
}

impl Default for Echo {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Echo {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.time.prepare(sample_rate);
        self.mix.prepare(sample_rate);
        let frames = (MAX_TIME_MS * 0.001 * sample_rate).ceil() as usize;
        for line in &mut self.lines {
            line.allocate(frames);
        }
        self.design_damping();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames_per_ms = self.sample_rate * 0.001;
        for index in 0..block.frames() {
            let delay = self.time.tick() * frames_per_ms;
            let mix = self.mix.tick();
            for (channel, sample) in [&mut block.left[index], &mut block.right[index]].into_iter().enumerate() {
                let echo = self.lines[channel].read(delay);
                // Only the repeats are damped, so the first echo lands exactly on time.
                let repeat = self.filters[channel].tick(&self.damping, echo * self.feedback);
                self.lines[channel].push(*sample + repeat);
                *sample = *sample * (1.0 - mix) + echo * mix;
            }
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else { return };
        let value = spec.clamp(value);
        match id {
            TIME_MS => self.time.set(value),
            FEEDBACK_DB => self.feedback = db_to_amplitude(value),
            DAMPING_HZ => {
                self.damping_hz = value;
                self.design_damping();
            }
            MIX => self.mix.set(value),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    // The echo rings until its feedback has fallen 60 dB.
    fn tail_frames(&self) -> u32 {
        let repeats = (-60.0 / PARAMS[1].clamp(crate::amplitude_to_db(self.feedback))).ceil().max(1.0);
        (repeats * self.time.target() * 0.001 * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        self.time.settle();
        self.mix.settle();
        for line in &mut self.lines {
            line.clear();
        }
        for filter in &mut self.filters {
            filter.reset();
        }
    }
}
