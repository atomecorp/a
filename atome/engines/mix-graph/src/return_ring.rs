// A loop's return (D27): what a route or a key adds at a frame is delivered
// RETURN_FRAMES frames later, bent softly so a runaway loop saturates.

use crate::graph::RETURN_FRAMES;
use kira::Frame;

const RETURN_RING: usize = 512;
// A return passes untouched up to full scale, then bends softly toward +12
// dBFS: a runaway loop saturates, it never explodes.
const RETURN_KNEE: f32 = 1.0;
const RETURN_CEILING: f32 = 4.0;

#[inline]
fn guard(sample: f32) -> f32 {
    if !sample.is_finite() {
        return 0.0;
    }
    let level = sample.abs();
    if level <= RETURN_KNEE {
        return sample;
    }
    let room = RETURN_CEILING - RETURN_KNEE;
    (RETURN_KNEE + room * ((level - RETURN_KNEE) / room).tanh()).copysign(sample)
}

// A loop's return: what is added at a frame is read RETURN_FRAMES frames later.
pub struct ReturnRing {
    ring: Vec<Frame>,
}

impl ReturnRing {
    pub fn new() -> Self {
        Self { ring: vec![Frame::ZERO; RETURN_RING] }
    }

    pub fn add(&mut self, clock: usize, signal: &[Frame]) {
        for (index, frame) in signal.iter().enumerate() {
            self.ring[(clock + index + RETURN_FRAMES) & (RETURN_RING - 1)] += Frame::new(guard(frame.left), guard(frame.right));
        }
    }

    // Adds what is due now into `out` and clears it.
    pub fn take(&mut self, clock: usize, out: &mut [Frame]) {
        for (index, frame) in out.iter_mut().enumerate() {
            let slot = &mut self.ring[(clock + index) & (RETURN_RING - 1)];
            *frame += *slot;
            *slot = Frame::ZERO;
        }
    }
}
