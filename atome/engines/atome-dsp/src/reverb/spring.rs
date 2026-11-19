// Two springs (left, right) as recirculating lines whose every pass crosses
// a long chain of first-order all-passes: the treble travels slower than the
// bass, so each return is a chirp, and the loop's period gives the boing.

use super::tank::FROZEN_GAIN;
use crate::delay::DelayLine;

const STAGES: usize = 34;
// All-pass coefficient: the higher, the stronger the dispersion.
const DISPERSION: f32 = 0.55;
const SPRING_MS: [f32; 2] = [34.3, 39.7];
// A spring is a fixed object: the size only stretches it a little.
fn spring_scale(size: f32) -> f32 {
    0.6 + 0.4 * size
}

pub struct Springs {
    lines: [DelayLine; 2],
    chains: [[f32; STAGES]; 2],
    lowpass: [f32; 2],
    frames: [f32; 2],
    gains: [f32; 2],
    shelves: [f32; 2],
}

impl Springs {
    pub fn new() -> Self {
        Self {
            lines: [DelayLine::new(), DelayLine::new()],
            chains: [[0.0; STAGES]; 2],
            lowpass: [0.0; 2],
            frames: [1.0; 2],
            gains: [0.0; 2],
            shelves: [1.0; 2],
        }
    }

    pub fn allocate(&mut self, sample_rate: f32) {
        for (line, ms) in self.lines.iter_mut().zip(SPRING_MS) {
            line.allocate((ms * 0.001 * sample_rate).ceil() as usize + 4);
        }
    }

    // Lengths follow the size; each loop loses 60 dB over the decay (the
    // chain's delay in the mids counts in the loop), its treble twice as fast.
    pub fn update(&mut self, sample_rate: f32, size: f32, decay_s: f32, freeze: f32) {
        let decay_frames = decay_s * sample_rate;
        let chain = STAGES as f32 * (1.0 - DISPERSION) / (1.0 + DISPERSION);
        for (channel, ms) in SPRING_MS.into_iter().enumerate() {
            self.frames[channel] = ms * spring_scale(size) * 0.001 * sample_rate;
            let lost = 10f32.powf(-3.0 * (self.frames[channel] + chain) / decay_frames);
            self.gains[channel] = (lost + freeze * (1.0 - lost)).min(FROZEN_GAIN);
            self.shelves[channel] = lost + freeze * (1.0 - lost);
        }
    }

    #[inline]
    pub fn tick(&mut self, channel: usize, input: f32, damping: f32, dither: f32) -> f32 {
        let out = self.lines[channel].read_cubic(self.frames[channel]);
        let mut x = out;
        for state in self.chains[channel].iter_mut() {
            let y = DISPERSION * x + *state;
            *state = x - DISPERSION * y;
            x = y;
        }
        let low = &mut self.lowpass[channel];
        *low += damping * (x - *low);
        let damped = *low + self.shelves[channel] * (x - *low);
        self.lines[channel].push(input + self.gains[channel] * damped + dither);
        out
    }

    pub fn clear(&mut self) {
        for line in &mut self.lines {
            line.clear();
        }
        self.chains = [[0.0; STAGES]; 2];
        self.lowpass = [0.0; 2];
    }
}
