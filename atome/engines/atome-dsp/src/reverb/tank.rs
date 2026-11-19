// The tail: eight delay lines mixed by a Hadamard matrix (a lossless
// feedback delay network). Every line sways slowly (no metallic ringing),
// carries an all-pass of its own (density) and loses exactly what the decay
// time asks for, its treble above the damping frequency twice as fast (a
// shelf sized to each line, so no line rings brighter than another). Losses
// ramp sample by sample between two updates: a change never zips.

use super::space::{LINES, Space};
use crate::delay::DelayLine;

// Each line sways at its own rate around the space's, never in step.
const SWAY_RATIOS: [f32; LINES] = [1.0, 1.13, 0.89, 1.27, 0.94, 1.08, 0.81, 1.21];
// Frozen, a loop keeps all but a millionth: endless to the ear (60 dB take
// days), yet rounding can never make the tank grow.
pub const FROZEN_GAIN: f32 = 0.999_999;
// A signal far under audibility keeps the dying tail out of denormal range.
const DITHER: f32 = 1.0e-18;

// In-place fast Walsh-Hadamard transform, normalised to stay lossless.
#[inline]
fn hadamard(v: &mut [f32; LINES]) {
    let mut span = 1;
    while span < LINES {
        let mut start = 0;
        while start < LINES {
            for i in start..start + span {
                let (a, b) = (v[i], v[i + span]);
                v[i] = a + b;
                v[i + span] = a - b;
            }
            start += span * 2;
        }
        span *= 2;
    }
    let norm = 1.0 / (LINES as f32).sqrt();
    for x in v.iter_mut() {
        *x *= norm;
    }
}

// Schroeder all-pass on a whole number of frames.
#[inline]
pub fn allpass(line: &mut DelayLine, frames: f32, coefficient: f32, x: f32) -> f32 {
    let delayed = line.read(frames);
    let input = x + coefficient * delayed;
    line.push(input);
    delayed - coefficient * input
}

// What the tank follows, as the reverb last smoothed it.
pub struct Setting {
    pub scale: f32,
    pub decay_s: f32,
    pub freeze: f32,
    pub modulation: f32,
    pub diffusion: f32,
    pub damping: f32,
}

pub struct Tank {
    lines: [DelayLine; LINES],
    allpasses: [DelayLine; LINES],
    line_base: [f32; LINES],
    allpass_frames: [f32; LINES],
    lowpass: [f32; LINES],
    sway: [[f32; 2]; LINES],
    sway_turn: [[f32; 2]; LINES],
    sway_frames: f32,
    gains: [f32; LINES],
    gain_steps: [f32; LINES],
    shelves: [f32; LINES],
    shelf_steps: [f32; LINES],
    damping: f32,
    coefficient: f32,
    dither: f32,
}

impl Tank {
    pub fn new() -> Self {
        Self {
            lines: Default::default(),
            allpasses: Default::default(),
            line_base: [1.0; LINES],
            allpass_frames: [1.0; LINES],
            lowpass: [0.0; LINES],
            sway: [[0.0, 1.0]; LINES],
            sway_turn: [[1.0, 0.0]; LINES],
            sway_frames: 0.0,
            gains: [0.0; LINES],
            gain_steps: [0.0; LINES],
            shelves: [1.0; LINES],
            shelf_steps: [0.0; LINES],
            damping: 1.0,
            coefficient: 0.0,
            dither: DITHER,
        }
    }

    pub fn allocate(&mut self, line_frames: usize, allpass_frames: usize) {
        for line in &mut self.lines {
            line.allocate(line_frames);
        }
        for line in &mut self.allpasses {
            line.allocate(allpass_frames);
        }
        for (i, phase) in self.sway.iter_mut().enumerate() {
            let angle = std::f32::consts::TAU * i as f32 / LINES as f32;
            *phase = [angle.cos(), angle.sin()];
        }
    }

    // The space's fixed lengths: lines at full size, all-passes on whole
    // frames (an all-pass read between frames dulls it).
    pub fn lay_out(&mut self, space: &Space, sample_rate: f32) {
        let frames_per_ms = 0.001 * sample_rate;
        for i in 0..LINES {
            self.line_base[i] = space.lines_ms[i] * frames_per_ms;
            self.allpass_frames[i] = (space.allpass_ms[i] * frames_per_ms).round().max(1.0);
        }
        for (turn, ratio) in self.sway_turn.iter_mut().zip(SWAY_RATIOS) {
            let angle = std::f32::consts::TAU * space.modulation_hz * ratio / sample_rate;
            *turn = [angle.cos(), angle.sin()];
        }
    }

    // New losses, reached over the next `frames` (0: at once).
    pub fn update(&mut self, space: &Space, setting: &Setting, sample_rate: f32, frames: usize) {
        self.sway_frames = setting.modulation * space.modulation_ms * 0.001 * sample_rate;
        self.coefficient = space.tank_diffusion * setting.diffusion;
        self.damping = setting.damping;
        let decay_frames = setting.decay_s * sample_rate;
        let ramp = 1.0 / frames.max(1) as f32;
        for i in 0..LINES {
            let loop_frames =
                self.line_base[i] * setting.scale + self.sway_frames + self.allpass_frames[i];
            let lost = 10f32.powf(-3.0 * loop_frames / decay_frames);
            let kept = lost + setting.freeze * (1.0 - lost);
            let gain = kept.min(FROZEN_GAIN);
            if frames == 0 {
                self.gains[i] = gain;
                self.gain_steps[i] = 0.0;
                self.shelves[i] = kept;
                self.shelf_steps[i] = 0.0;
            } else {
                self.gain_steps[i] = (gain - self.gains[i]) * ramp;
                self.shelf_steps[i] = (kept - self.shelves[i]) * ramp;
            }
        }
    }

    // The alternating sign of the anti-denormal signal this frame.
    pub fn dither(&self) -> f32 {
        self.dither
    }

    // One frame: the diffused sides enter, the tank turns once; returns the
    // two output taps.
    #[inline]
    pub fn tick(&mut self, left: f32, right: f32, scale: f32) -> (f32, f32) {
        let mut taps = [0.0; LINES];
        let mut feedback = [0.0; LINES];
        for i in 0..LINES {
            let [cos, sin] = self.sway_turn[i];
            let [x, y] = self.sway[i];
            self.sway[i] = [x * cos - y * sin, x * sin + y * cos];
            let delay = self.line_base[i] * scale + self.sway_frames * (1.0 + self.sway[i][1]);
            taps[i] = self.lines[i].read_cubic(delay);
            self.lowpass[i] += self.damping * (taps[i] - self.lowpass[i]);
            self.shelves[i] += self.shelf_steps[i];
            let damped = self.lowpass[i] + self.shelves[i] * (taps[i] - self.lowpass[i]);
            let dense = allpass(
                &mut self.allpasses[i],
                self.allpass_frames[i],
                self.coefficient,
                damped,
            );
            self.gains[i] += self.gain_steps[i];
            feedback[i] = dense * self.gains[i];
        }
        hadamard(&mut feedback);
        self.dither = -self.dither;
        for (i, (line, value)) in self.lines.iter_mut().zip(feedback).enumerate() {
            let input = match i & 3 {
                0 => left,
                1 => right,
                2 => -left,
                _ => -right,
            };
            line.push(value + input + self.dither);
        }
        let wet_left = (taps[0] + taps[2] + taps[4] + taps[6]) * 0.5;
        let wet_right = (taps[1] + taps[3] + taps[5] + taps[7]) * 0.5;
        (wet_left, wet_right)
    }

    // Keeps the sway oscillators on the unit circle (rounding drifts them).
    pub fn renormalise(&mut self) {
        for [x, y] in self.sway.iter_mut() {
            let norm = 1.0 / (*x * *x + *y * *y).sqrt().max(1.0e-9);
            *x *= norm;
            *y *= norm;
        }
    }

    pub fn clear(&mut self) {
        for line in self.lines.iter_mut().chain(self.allpasses.iter_mut()) {
            line.clear();
        }
        self.lowpass = [0.0; LINES];
    }
}
