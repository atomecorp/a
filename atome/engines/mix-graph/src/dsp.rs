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

// Gain ramped linearly across each block so level changes never click.
pub struct SmoothedGain {
    current: f32,
}

impl SmoothedGain {
    pub fn new(initial: f32) -> Self {
        Self { current: initial }
    }

    pub fn apply(&mut self, buffer: &mut [Frame], target: f32) {
        let start = self.current;
        let count = buffer.len().max(1) as f32;
        for (index, frame) in buffer.iter_mut().enumerate() {
            let gain = start + (target - start) * ((index + 1) as f32 / count);
            *frame *= gain;
        }
        self.current = target;
    }

    pub fn add_into(&mut self, source: &[Frame], destination: &mut [Frame], target: f32) {
        let start = self.current;
        let count = source.len().max(1) as f32;
        for (index, (out, input)) in destination.iter_mut().zip(source.iter()).enumerate() {
            let gain = start + (target - start) * ((index + 1) as f32 / count);
            *out += *input * gain;
        }
        self.current = target;
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
    let sum: f32 = buffer.iter().map(|frame| frame.left * frame.left + frame.right * frame.right).sum();
    (sum / (2 * buffer.len()) as f32).sqrt()
}

pub fn peak(buffer: &[Frame]) -> f32 {
    buffer.iter().fold(0.0f32, |acc, frame| acc.max(frame.left.abs()).max(frame.right.abs()))
}

// Fixed delay used for latency compensation of parallel routes.
pub struct DelayLine {
    ring: Vec<Frame>,
    position: usize,
}

impl DelayLine {
    pub fn new(frames: usize) -> Self {
        Self { ring: vec![Frame::ZERO; frames], position: 0 }
    }

    pub fn frames(&self) -> usize {
        self.ring.len()
    }

    pub fn process(&mut self, buffer: &mut [Frame]) {
        if self.ring.is_empty() {
            return;
        }
        for frame in buffer {
            let delayed = self.ring[self.position];
            self.ring[self.position] = *frame;
            *frame = delayed;
            self.position = (self.position + 1) % self.ring.len();
        }
    }
}
