// RBJ biquad (transposed direct form II): filters, shelves and bells.

use crate::{db_to_amplitude, ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use std::f32::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    LowPass,
    HighPass,
    BandPass,
    Notch,
    Bell,
    LowShelf,
    HighShelf,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Coefficients {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Coefficients {
    pub fn design(shape: Shape, sample_rate: f32, frequency: f32, q: f32, gain_db: f32) -> Self {
        let frequency = frequency.clamp(10.0, sample_rate * 0.49);
        let w = 2.0 * PI * frequency / sample_rate;
        let (sin, cos) = w.sin_cos();
        let alpha = sin / (2.0 * q.max(0.05));
        let a = db_to_amplitude(gain_db * 0.5).max(1.0e-6);
        let (b0, b1, b2, a0, a1, a2) = match shape {
            Shape::LowPass => ((1.0 - cos) / 2.0, 1.0 - cos, (1.0 - cos) / 2.0, 1.0 + alpha, -2.0 * cos, 1.0 - alpha),
            Shape::HighPass => ((1.0 + cos) / 2.0, -(1.0 + cos), (1.0 + cos) / 2.0, 1.0 + alpha, -2.0 * cos, 1.0 - alpha),
            Shape::BandPass => (alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * cos, 1.0 - alpha),
            Shape::Notch => (1.0, -2.0 * cos, 1.0, 1.0 + alpha, -2.0 * cos, 1.0 - alpha),
            Shape::Bell => (1.0 + alpha * a, -2.0 * cos, 1.0 - alpha * a, 1.0 + alpha / a, -2.0 * cos, 1.0 - alpha / a),
            Shape::LowShelf | Shape::HighShelf => {
                let root = 2.0 * a.sqrt() * alpha;
                let sign = if shape == Shape::LowShelf { 1.0 } else { -1.0 };
                (
                    a * ((a + 1.0) - sign * (a - 1.0) * cos + root),
                    sign * 2.0 * a * ((a - 1.0) - sign * (a + 1.0) * cos),
                    a * ((a + 1.0) - sign * (a - 1.0) * cos - root),
                    (a + 1.0) + sign * (a - 1.0) * cos + root,
                    -sign * 2.0 * ((a - 1.0) + sign * (a + 1.0) * cos),
                    (a + 1.0) + sign * (a - 1.0) * cos - root,
                )
            }
        };
        Self { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
    }

    // Second-order all-pass: at Q = 1/√2 it equals a Linkwitz-Riley low-pass
    // plus its high-pass, the phase a band split gives the bands it skips.
    pub fn all_pass(sample_rate: f32, frequency: f32, q: f32) -> Self {
        let frequency = frequency.clamp(10.0, sample_rate * 0.49);
        let w = 2.0 * PI * frequency / sample_rate;
        let (sin, cos) = w.sin_cos();
        let alpha = sin / (2.0 * q.max(0.05));
        let a0 = 1.0 + alpha;
        Self { b0: (1.0 - alpha) / a0, b1: -2.0 * cos / a0, b2: 1.0, a1: -2.0 * cos / a0, a2: (1.0 - alpha) / a0 }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Section {
    z1: f32,
    z2: f32,
}

impl Section {
    #[inline]
    pub fn tick(&mut self, c: &Coefficients, input: f32) -> f32 {
        let output = c.b0 * input + self.z1;
        self.z1 = c.b1 * input - c.a1 * output + self.z2;
        self.z2 = c.b2 * input - c.a2 * output;
        output
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

pub const FREQUENCY: u32 = 0;
pub const Q: u32 = 1;
pub const GAIN_DB: u32 = 2;
pub const PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(FREQUENCY, "frequency", 20.0, 20000.0, 1000.0, Unit::Hertz),
    ParamSpec::new(Q, "q", 0.1, 18.0, 0.707, Unit::Ratio),
    ParamSpec::new(GAIN_DB, "gain_db", -24.0, 24.0, 0.0, Unit::Decibels),
];

// A gain only shapes a bell or a shelf; the other shapes have none.
pub fn params_for(shape: Shape) -> &'static [ParamSpec] {
    match shape {
        Shape::Bell | Shape::LowShelf | Shape::HighShelf => &PARAMS,
        Shape::LowPass | Shape::HighPass | Shape::BandPass | Shape::Notch => &PARAMS[..2],
    }
}

// Coefficients follow the smoothed parameters every few frames: cheap and
// free of zipper noise.
const REDESIGN_FRAMES: usize = 16;

pub struct Biquad {
    shape: Shape,
    sample_rate: f32,
    frequency: Smoothed,
    q: Smoothed,
    gain_db: Smoothed,
    coefficients: Coefficients,
    left: Section,
    right: Section,
}

impl Biquad {
    pub fn new(shape: Shape, frequency: f32, q: f32, gain_db: f32) -> Self {
        Self {
            shape,
            sample_rate: 48000.0,
            frequency: Smoothed::new(frequency, 20.0),
            q: Smoothed::new(q, 20.0),
            gain_db: Smoothed::new(gain_db, 20.0),
            coefficients: Coefficients::default(),
            left: Section::default(),
            right: Section::default(),
        }
    }

    fn redesign(&mut self, frames: usize) {
        let mut frequency = 0.0;
        let mut q = 0.0;
        let mut gain = 0.0;
        for _ in 0..frames {
            frequency = self.frequency.tick();
            q = self.q.tick();
            gain = self.gain_db.tick();
        }
        self.coefficients = Coefficients::design(self.shape, self.sample_rate, frequency, q, gain);
    }
}

impl Processor for Biquad {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        for smoothed in [&mut self.frequency, &mut self.q, &mut self.gain_db] {
            smoothed.prepare(sample_rate);
            let target = smoothed.target();
            smoothed.snap(target);
        }
        self.redesign(1);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let mut start = 0;
        while start < frames {
            let end = (start + REDESIGN_FRAMES).min(frames);
            if !(self.frequency.is_settled() && self.q.is_settled() && self.gain_db.is_settled()) {
                self.redesign(end - start);
            }
            let c = self.coefficients;
            for index in start..end {
                block.left[index] = self.left.tick(&c, block.left[index]);
                block.right[index] = self.right.tick(&c, block.right[index]);
            }
            start = end;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        match id {
            FREQUENCY => self.frequency.set(PARAMS[0].clamp(value)),
            Q => self.q.set(PARAMS[1].clamp(value)),
            GAIN_DB => self.gain_db.set(PARAMS[2].clamp(value)),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        params_for(self.shape)
    }

    fn reset(&mut self) {
        for smoothed in [&mut self.frequency, &mut self.q, &mut self.gain_db] {
            smoothed.settle();
        }
        self.redesign(1);
        self.left.reset();
        self.right.reset();
    }
}
