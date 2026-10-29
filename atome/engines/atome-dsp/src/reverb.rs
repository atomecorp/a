// Algorithmic room: pre-delay, four series all-pass diffusers, then an
// eight-line feedback delay network mixed by a Hadamard matrix. Each line
// loses exactly what the decay time asks for and is damped in its loop.

use crate::delay::DelayLine;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const DECAY_S: u32 = 0;
pub const SIZE: u32 = 1;
pub const DAMPING_HZ: u32 = 2;
pub const PREDELAY_MS: u32 = 3;
pub const MIX: u32 = 4;
pub const PARAMS: [ParamSpec; 5] = [
    ParamSpec::new(DECAY_S, "decay_s", 0.2, 21.0, 2.0, Unit::Seconds),
    ParamSpec::new(SIZE, "size", 0.0, 1.0, 0.55, Unit::Percent),
    ParamSpec::new(DAMPING_HZ, "damping_hz", 1000.0, 20000.0, 8000.0, Unit::Hertz),
    ParamSpec::new(PREDELAY_MS, "predelay_ms", 0.0, 233.0, 13.0, Unit::Milliseconds),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 0.34, Unit::Percent),
];

const LINES: usize = 8;
// Mutually prime-ish lengths at full size (ms); a smaller room scales them down.
const LINE_MS: [f32; LINES] = [43.7, 51.3, 58.9, 66.1, 74.3, 81.7, 89.9, 97.1];
const DIFFUSER_MS: [f32; 4] = [4.7, 3.6, 12.7, 9.3];
const DIFFUSION: f32 = 0.62;
const UPDATE_FRAMES: usize = 16;

fn line_scale(size: f32) -> f32 {
    0.25 + 0.75 * size
}

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

pub struct Reverb {
    sample_rate: f32,
    decay_s: f32,
    size: Smoothed,
    current_size: f32,
    damping_hz: f32,
    damping: f32,
    predelay_ms: Smoothed,
    mix: Smoothed,
    predelay: DelayLine,
    diffusers: [DelayLine; 4],
    diffuser_frames: [f32; 4],
    lines: [DelayLine; LINES],
    line_frames: [f32; LINES],
    gains: [f32; LINES],
    lowpass: [f32; LINES],
}

impl Reverb {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            decay_s: PARAMS[0].default,
            size: Smoothed::new(PARAMS[1].default, 144.0),
            current_size: PARAMS[1].default,
            damping_hz: PARAMS[2].default,
            damping: 0.0,
            predelay_ms: Smoothed::new(PARAMS[3].default, 89.0),
            mix: Smoothed::new(PARAMS[4].default, 20.0),
            predelay: DelayLine::new(),
            diffusers: Default::default(),
            diffuser_frames: [0.0; 4],
            lines: Default::default(),
            line_frames: [0.0; LINES],
            gains: [0.0; LINES],
            lowpass: [0.0; LINES],
        }
    }

    fn design_damping(&mut self) {
        self.damping = 1.0 - (-2.0 * std::f32::consts::PI * self.damping_hz / self.sample_rate).exp();
    }

    // Lengths follow the smoothed size; each gain loses 60 dB over the decay.
    fn update(&mut self, frames: usize) {
        for _ in 0..frames {
            self.current_size = self.size.tick();
        }
        let scale = line_scale(self.current_size) * 0.001 * self.sample_rate;
        let decay_frames = self.decay_s * self.sample_rate;
        for ((frames, gain), ms) in self.line_frames.iter_mut().zip(self.gains.iter_mut()).zip(LINE_MS) {
            *frames = ms * scale;
            *gain = 10f32.powf(-3.0 * *frames / decay_frames);
        }
    }
}

impl Default for Reverb {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Reverb {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        for smoothed in [&mut self.size, &mut self.predelay_ms, &mut self.mix] {
            smoothed.prepare(sample_rate);
            let target = smoothed.target();
            smoothed.snap(target);
        }
        let frames_per_ms = 0.001 * sample_rate;
        self.predelay.allocate((PARAMS[3].max * frames_per_ms).ceil() as usize + 1);
        for (diffuser, (frames, ms)) in self.diffusers.iter_mut().zip(self.diffuser_frames.iter_mut().zip(DIFFUSER_MS)) {
            *frames = ms * frames_per_ms;
            diffuser.allocate(frames.ceil() as usize + 1);
        }
        for (line, ms) in self.lines.iter_mut().zip(LINE_MS) {
            line.allocate((ms * frames_per_ms).ceil() as usize + 2);
        }
        self.current_size = self.size.target();
        self.design_damping();
        self.update(0);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let frames_per_ms = 0.001 * self.sample_rate;
        let mut start = 0;
        while start < frames {
            let end = (start + UPDATE_FRAMES).min(frames);
            if !self.size.is_settled() {
                self.update(end - start);
            }
            for index in start..end {
                let dry_left = block.left[index];
                let dry_right = block.right[index];
                // Pre-delay, then the diffusers smear the onset into a cloud.
                let delay = (self.predelay_ms.tick() * frames_per_ms).max(1.0);
                self.predelay.push((dry_left + dry_right) * 0.5);
                let mut x = self.predelay.read(delay);
                for (diffuser, &length) in self.diffusers.iter_mut().zip(self.diffuser_frames.iter()) {
                    let delayed = diffuser.read(length);
                    let input = x + DIFFUSION * delayed;
                    diffuser.push(input);
                    x = delayed - DIFFUSION * input;
                }
                let mut taps = [0.0; LINES];
                let mut feedback = [0.0; LINES];
                for (i, line) in self.lines.iter().enumerate() {
                    taps[i] = line.read(self.line_frames[i]);
                    self.lowpass[i] += self.damping * (taps[i] - self.lowpass[i]);
                    feedback[i] = self.lowpass[i] * self.gains[i];
                }
                hadamard(&mut feedback);
                for (i, (line, value)) in self.lines.iter_mut().zip(feedback).enumerate() {
                    let sign = if i & 1 == 0 { 1.0 } else { -1.0 };
                    line.push(value + x * sign);
                }
                let wet_left = (taps[0] + taps[2] + taps[4] + taps[6]) * 0.5;
                let wet_right = (taps[1] + taps[3] + taps[5] + taps[7]) * 0.5;
                let mix = self.mix.tick();
                block.left[index] = dry_left * (1.0 - mix) + wet_left * mix;
                block.right[index] = dry_right * (1.0 - mix) + wet_right * mix;
            }
            start = end;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else { return };
        let value = spec.clamp(value);
        match id {
            DECAY_S => {
                self.decay_s = value;
                self.update(0);
            }
            SIZE => self.size.set(value),
            DAMPING_HZ => {
                self.damping_hz = value;
                self.design_damping();
            }
            PREDELAY_MS => self.predelay_ms.set(value),
            MIX => self.mix.set(value),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn tail_frames(&self) -> u32 {
        ((self.decay_s + PARAMS[3].max * 0.001) * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        for smoothed in [&mut self.size, &mut self.predelay_ms, &mut self.mix] {
            smoothed.settle();
        }
        self.current_size = self.size.target();
        self.update(0);
        self.predelay.clear();
        for line in self.diffusers.iter_mut().chain(self.lines.iter_mut()) {
            line.clear();
        }
        self.lowpass = [0.0; LINES];
    }
}
