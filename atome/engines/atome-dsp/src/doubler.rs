// Double-tracking: each side replays the voice a little late and a little
// detuned, left sharp and right flat, as a second take sung on top. The detune
// is a micro pitch shift (two crossfaded taps sweeping a delay line), cheap
// enough for every platform; a slow drift of the delay keeps it human.

use crate::delay::DelayLine;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use std::f32::consts::{PI, TAU};

pub const DETUNE_CENTS: u32 = 0;
pub const DELAY_MS: u32 = 1;
pub const WIDTH: u32 = 2;
pub const MIX: u32 = 3;
pub const PARAMS: [ParamSpec; 4] = [
    ParamSpec::new(DETUNE_CENTS, "detune_cents", 0.0, 34.0, 8.0, Unit::Plain),
    ParamSpec::new(DELAY_MS, "delay_ms", 0.0, 55.0, 21.0, Unit::Milliseconds),
    ParamSpec::new(WIDTH, "width", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 0.5, Unit::Percent),
];

// The span a tap sweeps before the other takes over.
const SWEEP_MS: f32 = 34.0;
// The right side sits a little earlier than the left: two takes never align.
const RIGHT_DELAY_RATIO: f32 = 0.62;
// Slow timing drift, in ms and Hz, different on each side.
const DRIFT_MS: f32 = 0.5;
const DRIFT_HZ: [f32; 2] = [0.21, 0.13];

struct Side {
    line: DelayLine,
    // Phase of the tap sweep in [0, 1); the second tap is half a cycle away.
    sweep: f32,
    drift: f32,
}

pub struct Doubler {
    sample_rate: f32,
    values: [f32; 4],
    sides: [Side; 2],
    detune: Smoothed,
    delay: Smoothed,
    width: Smoothed,
    mix: Smoothed,
}

impl Doubler {
    pub fn new() -> Self {
        let side = || Side {
            line: DelayLine::new(),
            sweep: 0.0,
            drift: 0.0,
        };
        let mut doubler = Self {
            sample_rate: 48000.0,
            values: PARAMS.map(|spec| spec.default),
            sides: [side(), side()],
            detune: Smoothed::new(8.0, 55.0),
            delay: Smoothed::new(21.0, 55.0),
            width: Smoothed::new(1.0, 21.0),
            mix: Smoothed::new(0.5, 21.0),
        };
        doubler.prepare(48000.0, 0);
        doubler
    }

    fn targets(&mut self) {
        let v = self.values;
        self.detune.set(v[DETUNE_CENTS as usize]);
        self.delay.set(v[DELAY_MS as usize]);
        self.width.set(v[WIDTH as usize]);
        self.mix.set(v[MIX as usize]);
    }
}

impl Default for Doubler {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Doubler {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        let longest = (PARAMS[DELAY_MS as usize].max + SWEEP_MS + 2.0 * DRIFT_MS) * 0.001;
        for side in &mut self.sides {
            side.line.allocate((longest * sample_rate) as usize + 4);
        }
        for smoothed in [
            &mut self.detune,
            &mut self.delay,
            &mut self.width,
            &mut self.mix,
        ] {
            smoothed.prepare(sample_rate);
        }
        self.targets();
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let rate = self.sample_rate;
        let sweep_frames = SWEEP_MS * 0.001 * rate;
        let per_ms = 0.001 * rate;
        for index in 0..block.frames() {
            let cents = self.detune.tick();
            // Delay change per frame for a shift of `cents`: |1 − 2^(c/1200)|.
            let slope = (cents * (std::f32::consts::LN_2 / 1200.0)).exp_m1();
            let base = self.delay.tick() * per_ms;
            let width = self.width.tick();
            let mix = self.mix.tick();
            let inputs = [block.left[index], block.right[index]];
            let mut doubles = [0.0; 2];
            for (channel, side) in self.sides.iter_mut().enumerate() {
                side.line.push(inputs[channel]);
                side.sweep = (side.sweep + slope / sweep_frames).fract();
                side.drift = (side.drift + DRIFT_HZ[channel] / rate).fract();
                let offset = if channel == 0 {
                    base
                } else {
                    base * RIGHT_DELAY_RATIO
                } + DRIFT_MS * per_ms * (1.0 + (TAU * side.drift).sin());
                let mut sum = 0.0;
                for tap in [side.sweep, (side.sweep + 0.5).fract()] {
                    // A shrinking delay raises the pitch (left), a growing one lowers it.
                    let travel = if channel == 0 { 1.0 - tap } else { tap };
                    let gain = (PI * tap).sin().powi(2);
                    sum += gain * side.line.read(1.0 + offset + travel * sweep_frames);
                }
                doubles[channel] = sum;
            }
            let spread = 0.5 * (1.0 + width);
            let wet_left = doubles[0] * spread + doubles[1] * (1.0 - spread);
            let wet_right = doubles[1] * spread + doubles[0] * (1.0 - spread);
            block.left[index] = inputs[0] + (wet_left - inputs[0]) * mix;
            block.right[index] = inputs[1] + (wet_right - inputs[1]) * mix;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
            self.targets();
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn tail_frames(&self) -> u32 {
        self.sides[0].line.capacity() as u32
    }

    fn reset(&mut self) {
        for smoothed in [
            &mut self.detune,
            &mut self.delay,
            &mut self.width,
            &mut self.mix,
        ] {
            smoothed.settle();
        }
        for (channel, side) in self.sides.iter_mut().enumerate() {
            side.line.clear();
            side.sweep = 0.0;
            side.drift = channel as f32 * 0.25;
        }
    }
}
