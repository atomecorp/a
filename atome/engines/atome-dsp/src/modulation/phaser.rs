// Phaser: a chain of first-order all-pass stages whose corner sweeps around
// a centre; mixed with the dry signal, every two stages carve one notch that
// glides through the spectrum. Feedback around the chain deepens the notches.
// The right side sweeps a quarter turn later.

use super::{Lfo, LfoShape};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use std::f32::consts::PI;

pub const RATE_HZ: u32 = 0;
pub const DEPTH: u32 = 1;
pub const STAGES: u32 = 2;
pub const FEEDBACK: u32 = 3;
pub const CENTER_HZ: u32 = 4;
pub const MIX: u32 = 5;
pub const PARAMS: [ParamSpec; 6] = [
    ParamSpec::new(RATE_HZ, "rate_hz", 0.02, 8.0, 0.5, Unit::Hertz),
    ParamSpec::new(DEPTH, "depth", 0.0, 1.0, 0.89, Unit::Percent),
    ParamSpec::choice(STAGES, "stages", &["4", "6", "8", "12"], 1),
    ParamSpec::new(FEEDBACK, "feedback", -0.95, 0.95, 0.34, Unit::Ratio),
    ParamSpec::new(CENTER_HZ, "center_hz", 100.0, 5000.0, 987.0, Unit::Hertz),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 0.5, Unit::Percent),
];

const STAGE_COUNTS: [usize; 4] = [4, 6, 8, 12];
const MAX_STAGES: usize = 12;
// Octaves the sweep reaches on each side of the centre at full depth.
const SWEEP_OCTAVES: f32 = 2.0;

pub struct Phaser {
    sample_rate: f32,
    lfo: Lfo,
    rate: Smoothed,
    depth: Smoothed,
    feedback: Smoothed,
    center_hz: Smoothed,
    mix: Smoothed,
    stages: usize,
    // Per side: each stage's state, and the chain's last output (feedback).
    states: [[f32; MAX_STAGES]; 2],
    last: [f32; 2],
}

impl Phaser {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            lfo: Lfo::new(),
            rate: Smoothed::new(PARAMS[0].default, 55.0),
            depth: Smoothed::new(PARAMS[1].default, 34.0),
            feedback: Smoothed::new(PARAMS[3].default, 34.0),
            center_hz: Smoothed::new(PARAMS[4].default, 55.0),
            mix: Smoothed::new(PARAMS[5].default, 20.0),
            stages: STAGE_COUNTS[PARAMS[2].default as usize],
            states: [[0.0; MAX_STAGES]; 2],
            last: [0.0; 2],
        }
    }
}

impl Default for Phaser {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Phaser {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.lfo.prepare(sample_rate);
        for smoothed in [
            &mut self.rate,
            &mut self.depth,
            &mut self.feedback,
            &mut self.center_hz,
            &mut self.mix,
        ] {
            smoothed.prepare(sample_rate);
        }
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let nyquist_guard = self.sample_rate * 0.45;
        for index in 0..block.frames() {
            self.lfo.set_rate(self.rate.tick());
            self.lfo.advance();
            let octaves = self.depth.tick() * SWEEP_OCTAVES;
            let centre = self.center_hz.tick();
            let feedback = self.feedback.tick();
            let mix = self.mix.tick();
            for (channel, sample) in [&mut block.left[index], &mut block.right[index]]
                .into_iter()
                .enumerate()
            {
                let motion = self.lfo.value(LfoShape::Sine, 0.25 * channel as f32);
                let corner = (centre * (octaves * motion).exp2()).clamp(20.0, nyquist_guard);
                let t = (PI * corner / self.sample_rate).tan();
                let a = (t - 1.0) / (t + 1.0);
                let dry = *sample;
                let mut x = dry + feedback * self.last[channel];
                for state in self.states[channel][..self.stages].iter_mut() {
                    let y = a * x + *state;
                    *state = x - a * y;
                    x = y;
                }
                self.last[channel] = x;
                *sample = dry * (1.0 - mix) + x * mix;
            }
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            RATE_HZ => self.rate.set(value),
            DEPTH => self.depth.set(value),
            STAGES => {
                let stages = STAGE_COUNTS[spec.index(value)];
                // Stages joining the chain start from rest.
                for states in &mut self.states {
                    for state in states[self.stages.min(stages)..].iter_mut() {
                        *state = 0.0;
                    }
                }
                self.stages = stages;
            }
            FEEDBACK => self.feedback.set(value),
            CENTER_HZ => self.center_hz.set(value),
            MIX => self.mix.set(value),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        for smoothed in [
            &mut self.rate,
            &mut self.depth,
            &mut self.feedback,
            &mut self.center_hz,
            &mut self.mix,
        ] {
            smoothed.settle();
        }
        self.lfo.reset();
        self.states = [[0.0; MAX_STAGES]; 2];
        self.last = [0.0; 2];
    }
}
