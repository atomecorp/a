// Flanger: the signal meets a copy of itself a millisecond or a few late,
// the delay sweeping slowly, so a comb of notches glides through the
// spectrum; feedback sharpens the comb (positive) or hollows it (negative).
// The right side sweeps a quarter turn later.

use super::{Lfo, LfoShape};
use crate::delay::DelayLine;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const RATE_HZ: u32 = 0;
pub const DEPTH: u32 = 1;
pub const FEEDBACK: u32 = 2;
pub const DELAY_MS: u32 = 3;
pub const MIX: u32 = 4;
pub const PARAMS: [ParamSpec; 5] = [
    ParamSpec::new(RATE_HZ, "rate_hz", 0.02, 8.0, 0.3, Unit::Hertz),
    ParamSpec::new(DEPTH, "depth", 0.0, 1.0, 0.89, Unit::Percent),
    ParamSpec::new(FEEDBACK, "feedback", -0.95, 0.95, 0.55, Unit::Ratio),
    ParamSpec::new(DELAY_MS, "delay_ms", 0.1, 13.0, 1.0, Unit::Milliseconds),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 0.5, Unit::Percent),
];

// The sweep at full depth, above the shortest delay.
const SWEEP_MS: f32 = 5.0;
// The cubic read needs two frames behind the newest sample.
const MIN_DELAY_FRAMES: f32 = 2.0;

pub struct Flanger {
    sample_rate: f32,
    lfo: Lfo,
    rate: Smoothed,
    depth: Smoothed,
    feedback: Smoothed,
    delay_ms: Smoothed,
    mix: Smoothed,
    lines: [DelayLine; 2],
    last: [f32; 2],
}

impl Flanger {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            lfo: Lfo::new(),
            rate: Smoothed::new(PARAMS[0].default, 55.0),
            depth: Smoothed::new(PARAMS[1].default, 34.0),
            feedback: Smoothed::new(PARAMS[2].default, 34.0),
            delay_ms: Smoothed::new(PARAMS[3].default, 55.0),
            mix: Smoothed::new(PARAMS[4].default, 20.0),
            lines: [DelayLine::new(), DelayLine::new()],
            last: [0.0; 2],
        }
    }
}

impl Default for Flanger {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Flanger {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.lfo.prepare(sample_rate);
        for smoothed in [
            &mut self.rate,
            &mut self.depth,
            &mut self.feedback,
            &mut self.delay_ms,
            &mut self.mix,
        ] {
            smoothed.prepare(sample_rate);
        }
        let frames = ((PARAMS[3].max + SWEEP_MS) * 0.001 * sample_rate).ceil() as usize + 4;
        for line in &mut self.lines {
            line.allocate(frames);
        }
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames_per_ms = 0.001 * self.sample_rate;
        for index in 0..block.frames() {
            self.lfo.set_rate(self.rate.tick());
            self.lfo.advance();
            let sweep = self.depth.tick() * SWEEP_MS;
            let shortest = self.delay_ms.tick();
            let feedback = self.feedback.tick();
            let mix = self.mix.tick();
            for (channel, sample) in [&mut block.left[index], &mut block.right[index]]
                .into_iter()
                .enumerate()
            {
                // The sweep runs from the shortest delay up, never below it.
                let motion = 0.5 + 0.5 * self.lfo.value(LfoShape::Sine, 0.25 * channel as f32);
                let delay = ((shortest + sweep * motion) * frames_per_ms).max(MIN_DELAY_FRAMES);
                let dry = *sample;
                self.lines[channel].push(dry + feedback * self.last[channel]);
                let wet = self.lines[channel].read_cubic(delay);
                self.last[channel] = wet;
                *sample = dry * (1.0 - mix) + wet * mix;
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
            FEEDBACK => self.feedback.set(value),
            DELAY_MS => self.delay_ms.set(value),
            MIX => self.mix.set(value),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    // The comb rings until its feedback has fallen 60 dB.
    fn tail_frames(&self) -> u32 {
        let feedback = self.feedback.target().abs().clamp(0.01, 0.95);
        let passes = (-3.0 / feedback.log10()).ceil();
        (passes * (PARAMS[3].max + SWEEP_MS) * 0.001 * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        for smoothed in [
            &mut self.rate,
            &mut self.depth,
            &mut self.feedback,
            &mut self.delay_ms,
            &mut self.mix,
        ] {
            smoothed.settle();
        }
        self.lfo.reset();
        self.last = [0.0; 2];
        for line in &mut self.lines {
            line.clear();
        }
    }
}
