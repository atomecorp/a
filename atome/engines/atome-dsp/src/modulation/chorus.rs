// Chorus: two to four voices, each a copy of the signal read a few
// milliseconds late through a delay that sways, spread over the
// oscillator's turn; the right side hears the same voices a quarter turn
// later (at full width), which opens the stereo image.

use super::{Lfo, LfoShape};
use crate::delay::DelayLine;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const RATE_HZ: u32 = 0;
pub const DEPTH: u32 = 1;
pub const DELAY_MS: u32 = 2;
pub const VOICES: u32 = 3;
pub const MIX: u32 = 4;
pub const WIDTH: u32 = 5;
pub const PARAMS: [ParamSpec; 6] = [
    ParamSpec::new(RATE_HZ, "rate_hz", 0.05, 8.0, 0.8, Unit::Hertz),
    ParamSpec::new(DEPTH, "depth", 0.0, 1.0, 0.55, Unit::Percent),
    ParamSpec::new(DELAY_MS, "delay_ms", 5.0, 34.0, 13.0, Unit::Milliseconds),
    ParamSpec::choice(VOICES, "voices", &["2", "3", "4"], 1),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 0.5, Unit::Percent),
    ParamSpec::new(WIDTH, "width", 0.0, 1.0, 1.0, Unit::Percent),
];

// The sway at full depth, on each side of the delay.
const SWEEP_MS: f32 = 3.0;
const MAX_VOICES: usize = 4;
const GOLDEN_TURN: f32 = 0.381_966;

pub struct Chorus {
    sample_rate: f32,
    lfo: Lfo,
    rate: Smoothed,
    depth: Smoothed,
    delay_ms: Smoothed,
    mix: Smoothed,
    width: Smoothed,
    voices: usize,
    // Each voice's level, ramped when the count changes so no voice pops in.
    voice_gains: [f32; MAX_VOICES],
    gain_step: f32,
    lines: [DelayLine; 2],
}

impl Chorus {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            lfo: Lfo::new(),
            rate: Smoothed::new(PARAMS[0].default, 55.0),
            depth: Smoothed::new(PARAMS[1].default, 34.0),
            delay_ms: Smoothed::new(PARAMS[2].default, 89.0),
            mix: Smoothed::new(PARAMS[4].default, 20.0),
            width: Smoothed::new(PARAMS[5].default, 34.0),
            voices: PARAMS[3].default as usize + 2,
            voice_gains: [0.0; MAX_VOICES],
            gain_step: 1.0,
            lines: [DelayLine::new(), DelayLine::new()],
        }
    }

    fn settle_voices(&mut self) {
        for (voice, gain) in self.voice_gains.iter_mut().enumerate() {
            *gain = if voice < self.voices { 1.0 } else { 0.0 };
        }
    }
}

impl Default for Chorus {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Chorus {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.lfo.prepare(sample_rate);
        for smoothed in [
            &mut self.rate,
            &mut self.depth,
            &mut self.delay_ms,
            &mut self.mix,
            &mut self.width,
        ] {
            smoothed.prepare(sample_rate);
        }
        let frames = ((PARAMS[2].max + SWEEP_MS) * 0.001 * sample_rate).ceil() as usize + 4;
        for line in &mut self.lines {
            line.allocate(frames);
        }
        self.gain_step = 1.0 / (0.034 * sample_rate);
        self.settle_voices();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames_per_ms = 0.001 * self.sample_rate;
        for index in 0..block.frames() {
            self.lfo.set_rate(self.rate.tick());
            self.lfo.advance();
            let sweep = self.depth.tick() * SWEEP_MS;
            let centre = self.delay_ms.tick();
            let mix = self.mix.tick();
            let offset = 0.25 * self.width.tick();
            let (dry_left, dry_right) = (block.left[index], block.right[index]);
            self.lines[0].push(dry_left);
            self.lines[1].push(dry_right);
            let (mut wet_left, mut wet_right, mut total) = (0.0, 0.0, 0.0);
            for voice in 0..MAX_VOICES {
                let target = if voice < self.voices { 1.0 } else { 0.0 };
                let gain = &mut self.voice_gains[voice];
                *gain = (*gain + (target - *gain).clamp(-self.gain_step, self.gain_step))
                    .clamp(0.0, 1.0);
                if *gain == 0.0 {
                    continue;
                }
                let gain = *gain;
                // Golden-angle spacing: well spread for any count, and a voice
                // keeps its place when the count changes.
                let spread = voice as f32 * GOLDEN_TURN;
                let left = self.lfo.value(LfoShape::Sine, spread);
                let right = self.lfo.value(LfoShape::Sine, spread + offset);
                wet_left +=
                    gain * self.lines[0].read_cubic((centre + sweep * left) * frames_per_ms);
                wet_right +=
                    gain * self.lines[1].read_cubic((centre + sweep * right) * frames_per_ms);
                total += gain;
            }
            // Voices add up as uncorrelated copies: keep the wet at the dry's level.
            let norm = 1.0 / total.max(1.0).sqrt();
            block.left[index] = dry_left * (1.0 - mix) + wet_left * norm * mix;
            block.right[index] = dry_right * (1.0 - mix) + wet_right * norm * mix;
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
            DELAY_MS => self.delay_ms.set(value),
            VOICES => self.voices = spec.index(value) + 2,
            MIX => self.mix.set(value),
            WIDTH => self.width.set(value),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn tail_frames(&self) -> u32 {
        ((PARAMS[2].max + SWEEP_MS) * 0.001 * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        for smoothed in [
            &mut self.rate,
            &mut self.depth,
            &mut self.delay_ms,
            &mut self.mix,
            &mut self.width,
        ] {
            smoothed.settle();
        }
        self.lfo.reset();
        self.settle_voices();
        for line in &mut self.lines {
            line.clear();
        }
    }
}
