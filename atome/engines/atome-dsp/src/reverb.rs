// Algorithmic reverb, five spaces (room, hall, plate, chamber, spring).
// Stereo pre-delay, then two paths: the space's early reflections (a tapped
// line) and its tail: four all-pass diffusers per side smear the onset into
// a cloud that feeds the tank (`tank`), the spring space adding two
// dispersive springs (`spring`). The wet is high-passed (low cut), widened
// and blended. Freeze holds the tank lossless and closes its input.
// Parameters glide; a change of space fades out, empties, then fades in.

mod space;
mod spring;
mod tank;

use crate::biquad::{Coefficients, Section, Shape};
use crate::delay::DelayLine;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use space::{HALL, MAX_TAPS, SPACES, Tap};
use spring::Springs;
use tank::{Setting, Tank, allpass};

pub const DECAY_S: u32 = 0;
pub const SIZE: u32 = 1;
pub const DAMPING_HZ: u32 = 2;
pub const PREDELAY_MS: u32 = 3;
pub const MIX: u32 = 4;
pub const SPACE: u32 = 5;
pub const DIFFUSION: u32 = 6;
pub const LOW_CUT_HZ: u32 = 7;
pub const MODULATION: u32 = 8;
pub const WIDTH: u32 = 9;
pub const FREEZE: u32 = 10;
pub const PARAMS: [ParamSpec; 11] = [
    ParamSpec::new(DECAY_S, "decay_s", 0.2, 21.0, 2.0, Unit::Seconds),
    ParamSpec::new(SIZE, "size", 0.0, 1.0, 0.55, Unit::Percent),
    ParamSpec::new(
        DAMPING_HZ,
        "damping_hz",
        1000.0,
        20000.0,
        8000.0,
        Unit::Hertz,
    ),
    ParamSpec::new(
        PREDELAY_MS,
        "predelay_ms",
        0.0,
        233.0,
        13.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 0.34, Unit::Percent),
    ParamSpec::choice(
        SPACE,
        "space",
        &["room", "hall", "plate", "chamber", "spring"],
        HALL,
    ),
    ParamSpec::new(DIFFUSION, "diffusion", 0.0, 1.0, 0.89, Unit::Percent),
    ParamSpec::new(LOW_CUT_HZ, "low_cut_hz", 20.0, 1000.0, 144.0, Unit::Hertz),
    ParamSpec::new(MODULATION, "modulation", 0.0, 1.0, 0.21, Unit::Percent),
    ParamSpec::new(WIDTH, "width", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::choice(FREEZE, "freeze", &["off", "on"], 0),
];

const DIFFUSER_MS: [[f32; 4]; 2] = [[4.7, 3.6, 12.7, 9.3], [5.3, 3.1, 11.3, 8.7]];
const UPDATE_FRAMES: usize = 16;
const SWITCH_MS: f32 = 21.0;
// A size change slides the lines at most this many frames per frame: a soft
// glide of pitch (under 34 cents) rather than a jump.
const SIZE_SLEW: f32 = 0.02;

fn line_scale(size: f32) -> f32 {
    0.25 + 0.75 * size
}

fn one_pole(sample_rate: f32, frequency: f32) -> f32 {
    1.0 - (-std::f32::consts::TAU * frequency.min(sample_rate * 0.45) / sample_rate).exp()
}

pub struct Reverb {
    sample_rate: f32,
    space: usize,
    next_space: usize,
    // Space change: the wet fades out, the space changes, its input fades in.
    fade: f32,
    fade_step: f32,
    early: [Tap; MAX_TAPS],
    decay_s: Smoothed,
    diffusion: Smoothed,
    modulation: Smoothed,
    freeze: Smoothed,
    damping_hz: f32,
    predelay_ms: Smoothed,
    mix: Smoothed,
    width: Smoothed,
    low_cut_hz: Smoothed,
    // The slow parameters as last ticked (decay, diffusion, modulation,
    // freeze, low cut), and what derives from them.
    current: [f32; 5],
    dirty: bool,
    open: f32,
    scale: f32,
    scale_target: f32,
    scale_slew: f32,
    damping: f32,
    input_coefficient: f32,
    low_cut: Coefficients,
    predelay: [DelayLine; 2],
    early_line: DelayLine,
    diffusers: [[DelayLine; 4]; 2],
    diffuser_frames: [[f32; 4]; 2],
    tank: Tank,
    springs: Springs,
    low_cut_sections: [Section; 2],
}

impl Reverb {
    pub fn new() -> Self {
        let space = PARAMS[5].default as usize;
        Self {
            sample_rate: 48000.0,
            space,
            next_space: space,
            fade: 1.0,
            fade_step: 1.0,
            early: space::early_pattern(&SPACES[space]),
            decay_s: Smoothed::new(PARAMS[0].default, 89.0),
            diffusion: Smoothed::new(PARAMS[6].default, 34.0),
            modulation: Smoothed::new(PARAMS[8].default, 55.0),
            freeze: Smoothed::new(PARAMS[10].default, 55.0),
            damping_hz: PARAMS[2].default,
            predelay_ms: Smoothed::new(PARAMS[3].default, 89.0),
            mix: Smoothed::new(PARAMS[4].default, 20.0),
            width: Smoothed::new(PARAMS[9].default, 34.0),
            low_cut_hz: Smoothed::new(PARAMS[7].default, 34.0),
            current: [0.0; 5],
            dirty: true,
            open: 1.0,
            scale: line_scale(PARAMS[1].default),
            scale_target: line_scale(PARAMS[1].default),
            scale_slew: 0.0,
            damping: 1.0,
            input_coefficient: 0.0,
            low_cut: Coefficients::default(),
            predelay: Default::default(),
            early_line: DelayLine::new(),
            diffusers: Default::default(),
            diffuser_frames: [[1.0; 4]; 2],
            tank: Tank::new(),
            springs: Springs::new(),
            low_cut_sections: [Section::default(); 2],
        }
    }

    fn smoothed(&mut self) -> [&mut Smoothed; 8] {
        [
            &mut self.decay_s,
            &mut self.diffusion,
            &mut self.modulation,
            &mut self.freeze,
            &mut self.predelay_ms,
            &mut self.mix,
            &mut self.width,
            &mut self.low_cut_hz,
        ]
    }

    fn slow_settled(&self) -> bool {
        self.scale == self.scale_target
            && [
                &self.decay_s,
                &self.diffusion,
                &self.modulation,
                &self.freeze,
                &self.low_cut_hz,
            ]
            .iter()
            .all(|smoothed| smoothed.is_settled())
    }

    // The space's fixed lengths; diffusers on whole frames.
    fn lay_out(&mut self) {
        let frames_per_ms = 0.001 * self.sample_rate;
        let space = &SPACES[self.space];
        self.tank.lay_out(space, self.sample_rate);
        for (lengths, table) in self.diffuser_frames.iter_mut().zip(DIFFUSER_MS) {
            for (length, ms) in lengths.iter_mut().zip(table) {
                *length = (ms * frames_per_ms).round();
            }
        }
        self.scale_slew = SIZE_SLEW / space::longest_line_ms() / frames_per_ms;
        self.early = space::early_pattern(space);
    }

    // Everything that moves slowly follows its smoothed value every few
    // frames; the tank's losses then ramp over those `frames` (0: jump).
    fn update(&mut self, frames: usize) {
        for _ in 0..frames {
            self.current = [
                self.decay_s.tick(),
                self.diffusion.tick(),
                self.modulation.tick(),
                self.freeze.tick(),
                self.low_cut_hz.tick(),
            ];
        }
        self.dirty = false;
        let [decay_s, diffusion, modulation, freeze, low_cut_hz] = self.current;
        let space = &SPACES[self.space];
        self.open = 1.0 - freeze;
        self.input_coefficient = space.input_diffusion * diffusion;
        self.damping = one_pole(self.sample_rate, self.damping_hz * space.damping_scale);
        let setting = Setting {
            scale: self.scale,
            decay_s,
            freeze,
            modulation,
            diffusion,
            damping: self.damping,
        };
        self.tank.update(space, &setting, self.sample_rate, frames);
        self.low_cut =
            Coefficients::design(Shape::HighPass, self.sample_rate, low_cut_hz, 0.707, 0.0);
        // The springs stretch with the size as it glides, never in a jump.
        let size = (self.scale - 0.25) / 0.75;
        self.springs.update(self.sample_rate, size, decay_s, freeze);
    }

    fn clear(&mut self) {
        for line in self
            .predelay
            .iter_mut()
            .chain(std::iter::once(&mut self.early_line))
            .chain(self.diffusers.iter_mut().flatten())
        {
            line.clear();
        }
        self.tank.clear();
        self.springs.clear();
        self.low_cut_sections = [Section::default(); 2];
    }

    // Returns (output gain, input gain) of the space change under way: the
    // wet fades out, then the new space starts empty and its input fades in,
    // so nothing ever steps.
    #[inline]
    fn follow_space(&mut self) -> (f32, f32) {
        if self.space != self.next_space {
            self.fade = (self.fade - self.fade_step).max(0.0);
            if self.fade == 0.0 {
                self.space = self.next_space;
                self.clear();
                self.lay_out();
                self.dirty = true;
            }
            (self.fade, 1.0)
        } else if self.fade < 1.0 {
            self.fade = (self.fade + self.fade_step).min(1.0);
            (1.0, self.fade)
        } else {
            (1.0, 1.0)
        }
    }

    // One frame of wet signal from the pre-delayed sides.
    #[inline]
    fn wet(&mut self, left: f32, right: f32, frames_per_ms: f32) -> (f32, f32) {
        let space = &SPACES[self.space];
        // Early reflections, from the pre-delayed middle.
        self.early_line.push((left + right) * 0.5);
        let reach = self.scale * frames_per_ms;
        let (mut early_left, mut early_right) = (0.0, 0.0);
        for tap in &self.early[..space.taps] {
            let reflection = self.early_line.read(tap.ms * reach);
            early_left += tap.left * reflection;
            early_right += tap.right * reflection;
        }
        // Each side's cloud, then the tank.
        let mut sides = [left, right];
        for (side, (diffusers, lengths)) in sides
            .iter_mut()
            .zip(self.diffusers.iter_mut().zip(self.diffuser_frames.iter()))
        {
            for (diffuser, &length) in diffusers.iter_mut().zip(lengths) {
                *side = allpass(diffuser, length, self.input_coefficient, *side);
            }
        }
        let (tail_left, tail_right) = self.tank.tick(sides[0], sides[1], self.scale);
        let mut wet_left = tail_left * space.tail_level + early_left;
        let mut wet_right = tail_right * space.tail_level + early_right;
        if space.spring_level > 0.0 {
            let (damping, dither) = (self.damping, self.tank.dither());
            wet_left += space.spring_level * self.springs.tick(0, left, damping, dither);
            wet_right += space.spring_level * self.springs.tick(1, right, damping, dither);
        }
        (
            self.low_cut_sections[0].tick(&self.low_cut, wet_left),
            self.low_cut_sections[1].tick(&self.low_cut, wet_right),
        )
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
        for smoothed in self.smoothed() {
            smoothed.prepare(sample_rate);
        }
        let frames_per_ms = 0.001 * sample_rate;
        let frames = |ms: f32| (ms * frames_per_ms).ceil() as usize + 4;
        for line in &mut self.predelay {
            line.allocate(frames(PARAMS[3].max));
        }
        self.early_line
            .allocate(frames(space::longest_reflection_ms()));
        for (diffusers, table) in self.diffusers.iter_mut().zip(DIFFUSER_MS) {
            for (diffuser, ms) in diffusers.iter_mut().zip(table) {
                diffuser.allocate(frames(ms));
            }
        }
        let sway_ms = SPACES
            .iter()
            .map(|space| space.modulation_ms)
            .fold(0.0, f32::max);
        self.tank.allocate(
            frames(space::longest_line_ms() + 2.0 * sway_ms),
            frames(space::longest_allpass_ms()),
        );
        self.springs.allocate(sample_rate);
        self.fade_step = 1.0 / (SWITCH_MS * frames_per_ms);
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let frames_per_ms = 0.001 * self.sample_rate;
        let mut start = 0;
        while start < frames {
            let end = (start + UPDATE_FRAMES).min(frames);
            let moving = self.dirty || !self.slow_settled();
            if moving {
                self.update(end - start);
            }
            self.tank.renormalise();
            for index in start..end {
                let (out_gain, in_gain) = self.follow_space();
                let step =
                    (self.scale_target - self.scale).clamp(-self.scale_slew, self.scale_slew);
                self.scale += step;
                let (dry_left, dry_right) = (block.left[index], block.right[index]);
                let delay = (self.predelay_ms.tick() * frames_per_ms).max(1.0);
                let entry = self.open * in_gain;
                self.predelay[0].push(dry_left * entry);
                self.predelay[1].push(dry_right * entry);
                let left = self.predelay[0].read(delay);
                let right = self.predelay[1].read(delay);
                let (wet_left, wet_right) = self.wet(left, right, frames_per_ms);
                let middle = (wet_left + wet_right) * 0.5;
                let side = (wet_left - wet_right) * 0.5 * self.width.tick();
                let mix = self.mix.tick();
                let wet = mix * out_gain;
                block.left[index] = dry_left * (1.0 - mix) + (middle + side) * wet;
                block.right[index] = dry_right * (1.0 - mix) + (middle - side) * wet;
            }
            if moving {
                // Land the ramps exactly on their targets.
                self.update(0);
            }
            start = end;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            DECAY_S => self.decay_s.set(value),
            SIZE => {
                self.scale_target = line_scale(value);
                self.dirty = true;
            }
            DAMPING_HZ => {
                self.damping_hz = value;
                self.dirty = true;
            }
            PREDELAY_MS => self.predelay_ms.set(value),
            MIX => self.mix.set(value),
            SPACE => self.next_space = spec.index(value),
            DIFFUSION => self.diffusion.set(value),
            LOW_CUT_HZ => self.low_cut_hz.set(value),
            MODULATION => self.modulation.set(value),
            WIDTH => self.width.set(value),
            FREEZE => self.freeze.set(spec.index(value) as f32),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    // Frozen, the tank rings for ever; otherwise for the decay after the
    // latest pre-delay and reflection.
    fn tail_frames(&self) -> u32 {
        if self.freeze.target() > 0.0 {
            return u32::MAX;
        }
        let reach_s = (PARAMS[3].max + space::longest_reflection_ms()) * 0.001;
        ((self.decay_s.target() + reach_s) * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        for smoothed in self.smoothed() {
            smoothed.settle();
        }
        self.space = self.next_space;
        self.fade = 1.0;
        self.scale = self.scale_target;
        self.clear();
        self.lay_out();
        self.update(1);
        self.update(0);
    }
}
