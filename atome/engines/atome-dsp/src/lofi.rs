// Lo-fi: the signal is held at a lower sample rate (its aliasing kept on
// purpose, as an early sampler's) and rounded to fewer bits, with an optional
// hiss under it. Bits and rate move smoothly: a fractional bit depth is a
// fractional number of steps, so a sweep never jumps.

use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const BITS: u32 = 0;
pub const RATE_HZ: u32 = 1;
pub const NOISE: u32 = 2;
pub const MIX: u32 = 3;
pub const PARAMS: [ParamSpec; 4] = [
    ParamSpec::new(BITS, "bits", 1.0, 16.0, 8.0, Unit::Count),
    ParamSpec::new(RATE_HZ, "rate_hz", 1000.0, 48000.0, 12000.0, Unit::Hertz),
    ParamSpec::new(NOISE, "noise", 0.0, 1.0, 0.0, Unit::Percent),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];

// Hiss at full `noise`: −26 dBFS of white noise.
const NOISE_LEVEL: f32 = 0.05;

pub struct Lofi {
    sample_rate: f32,
    bits: Smoothed,
    rate: Smoothed,
    noise: Smoothed,
    mix: Smoothed,
    phase: f32,
    held: [f32; 2],
    seed: u32,
}

impl Lofi {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            bits: Smoothed::new(PARAMS[0].default, 34.0),
            rate: Smoothed::new(PARAMS[1].default, 34.0),
            noise: Smoothed::new(PARAMS[2].default, 20.0),
            mix: Smoothed::new(PARAMS[3].default, 20.0),
            phase: 1.0,
            held: [0.0; 2],
            seed: 0x9e37_79b9,
        }
    }

    #[inline]
    fn white(&mut self) -> f32 {
        self.seed = self
            .seed
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        (self.seed >> 8) as f32 / 8_388_608.0 - 1.0
    }
}

impl Default for Lofi {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Lofi {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        for smoothed in [
            &mut self.bits,
            &mut self.rate,
            &mut self.noise,
            &mut self.mix,
        ] {
            smoothed.prepare(sample_rate);
        }
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for index in 0..block.frames() {
            let step = self.rate.tick() / self.sample_rate;
            // Half the steps of the bit depth on each side of zero (1 bit: −1, 0, 1).
            let levels = (self.bits.tick() - 1.0).exp2();
            let hiss = self.noise.tick() * NOISE_LEVEL;
            let mix = self.mix.tick();
            // A new sample is taken each time the phase completes a turn.
            let sample_now = self.phase >= 1.0;
            if sample_now {
                self.phase -= self.phase.floor();
            }
            self.phase += step;
            for (channel, sample) in [&mut block.left[index], &mut block.right[index]]
                .into_iter()
                .enumerate()
            {
                if sample_now {
                    self.held[channel] = *sample;
                }
                let noisy = self.held[channel] + hiss * self.white();
                let rounded = (noisy * levels).round() / levels;
                *sample = *sample * (1.0 - mix) + rounded * mix;
            }
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            BITS => self.bits.set(value),
            RATE_HZ => self.rate.set(value),
            NOISE => self.noise.set(value),
            MIX => self.mix.set(value),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        for smoothed in [
            &mut self.bits,
            &mut self.rate,
            &mut self.noise,
            &mut self.mix,
        ] {
            smoothed.settle();
        }
        self.phase = 1.0;
        self.held = [0.0; 2];
    }
}
