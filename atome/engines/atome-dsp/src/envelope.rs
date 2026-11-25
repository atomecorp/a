// ADSR envelope applied as an amplifier (VCA), the second generator brick.
// The gate is a parameter, so MIDI notes drive it like any other value.
// A sampler's voice may also wait before the attack (delay) and hold the peak
// before the decay (hold): DAHDSR, set by `set_timing` (a bank's envelope), not
// among the brick's parameters, so a patch's envelope stays ADSR.

use crate::{ParamSpec, Processor, StereoBlock, Unit};

pub const GATE: u32 = 0;
pub const ATTACK_MS: u32 = 1;
pub const DECAY_MS: u32 = 2;
pub const SUSTAIN: u32 = 3;
pub const RELEASE_MS: u32 = 4;
pub const PARAMS: [ParamSpec; 5] = [
    ParamSpec::new(GATE, "gate", 0.0, 1.0, 0.0, Unit::Plain),
    ParamSpec::new(
        ATTACK_MS,
        "attack_ms",
        0.1,
        10000.0,
        5.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(
        DECAY_MS,
        "decay_ms",
        1.0,
        10000.0,
        144.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(SUSTAIN, "sustain", 0.0, 1.0, 0.6, Unit::Percent),
    ParamSpec::new(
        RELEASE_MS,
        "release_ms",
        1.0,
        20000.0,
        233.0,
        Unit::Milliseconds,
    ),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stage {
    Idle,
    Delay,
    Attack,
    Hold,
    Decay,
    Sustain,
    Release,
}

pub struct Envelope {
    sample_rate: f32,
    values: [f32; 5],
    stage: Stage,
    level: f32,
    release_step: f32,
    delay_ms: f32,
    hold_ms: f32,
    // Frames spent in the delay or the hold.
    waited: f32,
}

impl Envelope {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            values: PARAMS.map(|spec| spec.default),
            stage: Stage::Idle,
            level: 0.0,
            release_step: 0.0,
            delay_ms: 0.0,
            hold_ms: 0.0,
            waited: 0.0,
        }
    }

    fn frames(&self, id: u32) -> f32 {
        (self.values[id as usize] * 0.001 * self.sample_rate).max(1.0)
    }

    // The wait before the attack and the hold at the peak, in milliseconds (0: none), for
    // the next gates.
    pub fn set_timing(&mut self, delay_ms: f32, hold_ms: f32) {
        self.delay_ms = delay_ms.max(0.0);
        self.hold_ms = hold_ms.max(0.0);
    }

    // Whether `waited` frames have passed `ms`.
    fn waited_past(&self, ms: f32) -> bool {
        self.waited >= ms * 0.001 * self.sample_rate
    }

    pub fn is_idle(&self) -> bool {
        self.stage == Stage::Idle
    }

    // The level at the next frame: the envelope as a control source (a voice's
    // amplitude or filter contour).
    #[inline]
    pub fn tick(&mut self) -> f32 {
        let sustain = self.values[SUSTAIN as usize];
        match self.stage {
            Stage::Idle => {}
            Stage::Delay => {
                self.waited += 1.0;
                if self.waited_past(self.delay_ms) {
                    self.stage = Stage::Attack;
                }
            }
            Stage::Attack => {
                self.level += 1.0 / self.frames(ATTACK_MS);
                if self.level >= 1.0 {
                    self.level = 1.0;
                    self.waited = 0.0;
                    self.stage = if self.hold_ms > 0.0 {
                        Stage::Hold
                    } else {
                        Stage::Decay
                    };
                }
            }
            Stage::Hold => {
                self.waited += 1.0;
                if self.waited_past(self.hold_ms) {
                    self.stage = Stage::Decay;
                }
            }
            Stage::Decay => {
                self.level -= (1.0 - sustain) / self.frames(DECAY_MS);
                if self.level <= sustain {
                    self.level = sustain;
                    self.stage = Stage::Sustain;
                }
            }
            Stage::Sustain => self.level = sustain,
            Stage::Release => {
                self.level -= self.release_step;
                if self.level <= 0.0 {
                    self.level = 0.0;
                    self.stage = Stage::Idle;
                }
            }
        }
        self.level
    }
}

impl Default for Envelope {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Envelope {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for (left, right) in block.left.iter_mut().zip(block.right.iter_mut()) {
            let gain = self.tick();
            *left *= gain;
            *right *= gain;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        if id == GATE {
            if value >= 0.5 {
                self.waited = 0.0;
                self.stage = if self.delay_ms > 0.0 {
                    Stage::Delay
                } else {
                    Stage::Attack
                };
            } else if self.stage != Stage::Idle {
                self.stage = Stage::Release;
                self.release_step = self.level / self.frames(RELEASE_MS);
            }
        }
        self.values[id as usize] = value;
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn tail_frames(&self) -> u32 {
        self.frames(RELEASE_MS) as u32
    }

    fn reset(&mut self) {
        self.stage = Stage::Idle;
        self.level = 0.0;
        self.waited = 0.0;
    }
}
