// Small DSP blocks owned by the mixer itself (atome-dsp covers the effects).

use kira::Frame;
use std::sync::atomic::{AtomicU32, Ordering};

pub const SILENCE_DB: f32 = -120.0;

pub fn db_to_amplitude(db: f32) -> f32 {
    if db <= SILENCE_DB {
        0.0
    } else {
        10f32.powf(db / 20.0)
    }
}

// Lock-free f32 parameter written by the control thread, read by the render thread.
#[derive(Debug)]
pub struct AtomicParam(AtomicU32);

impl AtomicParam {
    pub fn new(value: f32) -> Self {
        Self(AtomicU32::new(value.to_bits()))
    }
    pub fn get(&self) -> f32 {
        f32::from_bits(self.0.load(Ordering::Relaxed))
    }
    pub fn set(&self, value: f32) {
        self.0.store(value.to_bits(), Ordering::Relaxed);
    }
}

// Gain ramped linearly over RAMP_FRAMES whenever its target changes, the ramp
// carried across calls: level changes never click, and the same changes sound
// the same whatever the block size (R-191).
pub const RAMP_FRAMES: u32 = 32;

pub struct SmoothedGain {
    current: f32,
    start: f32,
    target: f32,
    done: u32,
}

impl SmoothedGain {
    pub fn new(initial: f32) -> Self {
        Self {
            current: initial,
            start: initial,
            target: initial,
            done: RAMP_FRAMES,
        }
    }

    fn next(&mut self, target: f32) -> f32 {
        if target != self.target {
            self.start = self.current;
            self.target = target;
            self.done = 0;
        }
        if self.done < RAMP_FRAMES {
            self.done += 1;
            self.current = match self.done {
                RAMP_FRAMES => target,
                done => self.start + (target - self.start) * (done as f32 / RAMP_FRAMES as f32),
            };
        }
        self.current
    }

    pub fn apply(&mut self, buffer: &mut [Frame], target: f32) {
        for frame in buffer.iter_mut() {
            *frame *= self.next(target);
        }
    }

    // The gain a modulation left it at: the next ramp starts there.
    pub fn hold(&mut self, gain: f32) {
        self.current = gain;
        self.start = gain;
        self.target = gain;
        self.done = RAMP_FRAMES;
    }

    pub fn add_into(&mut self, source: &[Frame], destination: &mut [Frame], target: f32) {
        for (out, input) in destination.iter_mut().zip(source.iter()) {
            *out += *input * self.next(target);
        }
    }
}

// Stereo balance: -1 keeps only the left channel, +1 only the right one.
pub fn apply_pan(buffer: &mut [Frame], pan: f32) {
    let pan = pan.clamp(-1.0, 1.0);
    let left = (1.0 - pan).min(1.0);
    let right = (1.0 + pan).min(1.0);
    for frame in buffer {
        frame.left *= left;
        frame.right *= right;
    }
}

pub fn apply_mono(buffer: &mut [Frame]) {
    for frame in buffer {
        let mid = (frame.left + frame.right) * 0.5;
        frame.left = mid;
        frame.right = mid;
    }
}

pub fn rms(buffer: &[Frame]) -> f32 {
    if buffer.is_empty() {
        return 0.0;
    }
    let sum: f32 = buffer
        .iter()
        .map(|frame| frame.left * frame.left + frame.right * frame.right)
        .sum();
    (sum / (2 * buffer.len()) as f32).sqrt()
}

pub fn peak(buffer: &[Frame]) -> f32 {
    buffer.iter().fold(0.0f32, |acc, frame| {
        acc.max(frame.left.abs()).max(frame.right.abs())
    })
}

// Fixed delay used for latency compensation of parallel routes.
pub struct DelayLine {
    ring: Vec<Frame>,
    position: usize,
}

impl DelayLine {
    pub fn new(frames: usize) -> Self {
        Self {
            ring: vec![Frame::ZERO; frames],
            position: 0,
        }
    }

    pub fn frames(&self) -> usize {
        self.ring.len()
    }

    pub fn process(&mut self, buffer: &mut [Frame]) {
        if self.ring.is_empty() {
            return;
        }
        for frame in buffer {
            std::mem::swap(&mut self.ring[self.position], &mut *frame);
            self.position = (self.position + 1) % self.ring.len();
        }
    }
}
