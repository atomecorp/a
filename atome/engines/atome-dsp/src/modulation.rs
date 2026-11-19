// Modulation effects: a slow oscillator moves a short delay (chorus,
// flanger), the notches of an all-pass chain (phaser) or the level and the
// side (tremolo, auto-pan). They share the one low-frequency oscillator below.

pub mod chorus;
pub mod flanger;
pub mod phaser;
pub mod tremolo;

pub use chorus::Chorus;
pub use flanger::Flanger;
pub use phaser::Phaser;
pub use tremolo::Tremolo;

use std::f32::consts::TAU;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LfoShape {
    Sine,
    Triangle,
    // Rounded edges (a clipped sine): a square that never clicks.
    Square,
    // A ramp rising over the period, falling at its start.
    Saw,
}

// A phase in turns [0, 1) and its rate; read at any offset, so the two sides
// (or the voices of a chorus) follow the same motion shifted.
#[derive(Debug, Clone, Copy)]
pub struct Lfo {
    phase: f32,
    step: f32,
    sample_rate: f32,
}

impl Lfo {
    pub fn new() -> Self {
        Self {
            phase: 0.0,
            step: 0.0,
            sample_rate: 48000.0,
        }
    }

    pub fn prepare(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate;
    }

    // A rate change keeps the phase: the motion speeds up, it never jumps.
    #[inline]
    pub fn set_rate(&mut self, rate_hz: f32) {
        self.step = rate_hz / self.sample_rate;
    }

    // One frame on; true when a new period began (a random LFO draws its next value then).
    #[inline]
    pub fn advance(&mut self) -> bool {
        self.phase += self.step;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
            return true;
        }
        false
    }

    // The wave in [−1, 1], `offset` turns ahead of the phase.
    #[inline]
    pub fn value(&self, shape: LfoShape, offset: f32) -> f32 {
        let phase = (self.phase + offset).fract();
        match shape {
            LfoShape::Sine => (TAU * phase).sin(),
            LfoShape::Triangle => 4.0 * ((phase + 0.75).fract() - 0.5).abs() - 1.0,
            LfoShape::Square => ((TAU * phase).sin() * 8.0).clamp(-1.0, 1.0),
            LfoShape::Saw => 2.0 * phase - 1.0,
        }
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
    }
}

impl Default for Lfo {
    fn default() -> Self {
        Self::new()
    }
}
