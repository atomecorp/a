// The direct path's render (todo/effets_generateurs_audio L2): a mix graph
// played in the device callback itself, not ahead of it, its output through a
// limiter that is always on. The same render runs in the native engine's
// output callback and in the Web AudioWorklet; the round-trip probe rides on it.

use crate::round_trip::RoundTrip;
use crate::MixGraphEffect;
use atome_dsp::dynamics::Limiter;
use atome_dsp::{Processor, StereoBlock};
use kira::effect::Effect;
use kira::Frame;

// The device buffer the direct path asks for: 1.33 ms at 48 kHz.
pub const BUFFER_FRAMES: u32 = 64;
// Its live inputs hold a few device buffers; the reader keeps under half.
pub const LIVE_RING_FRAMES: usize = BUFFER_FRAMES as usize * 4;
const SCRATCH_FRAMES: usize = 4096;

pub struct DirectRender {
    effect: MixGraphEffect,
    limiter: Limiter,
    frames: Vec<Frame>,
    left: Vec<f32>,
    right: Vec<f32>,
    probe: RoundTrip,
}

impl DirectRender {
    pub fn new(mut effect: MixGraphEffect, sample_rate: u32) -> Self {
        effect.init(sample_rate, SCRATCH_FRAMES);
        let mut limiter = Limiter::new();
        limiter.prepare(sample_rate as f32, SCRATCH_FRAMES);
        Self {
            effect,
            limiter,
            frames: vec![Frame::ZERO; SCRATCH_FRAMES],
            left: vec![0.0; SCRATCH_FRAMES],
            right: vec![0.0; SCRATCH_FRAMES],
            probe: RoundTrip::new(sample_rate),
        }
    }

    // Renders `frames` frames into the planar scratch, limited.
    fn render(&mut self, frames: usize) {
        self.frames[..frames].fill(Frame::ZERO);
        self.effect.render(&mut self.frames[..frames]);
        for (index, frame) in self.frames[..frames].iter().enumerate() {
            self.left[index] = frame.left;
            self.right[index] = frame.right;
        }
        self.limiter.process(&mut StereoBlock::new(&mut self.left[..frames], &mut self.right[..frames]));
        self.probe.process(&mut self.left[..frames], &mut self.right[..frames]);
    }

    // Adds the direct path over an interleaved device buffer.
    pub fn mix_interleaved(&mut self, data: &mut [f32], channels: usize) {
        let total = data.len() / channels.max(1);
        let mut start = 0;
        while start < total {
            let frames = (total - start).min(SCRATCH_FRAMES);
            self.render(frames);
            for index in 0..frames {
                let out = &mut data[(start + index) * channels..(start + index + 1) * channels];
                if channels == 1 {
                    out[0] += (self.left[index] + self.right[index]) * 0.5;
                } else {
                    out[0] += self.left[index];
                    out[1] += self.right[index];
                }
            }
            start += frames;
        }
    }

    // Adds the direct path over a host's planar buffers (an audio unit).
    pub fn mix_planar(&mut self, left: &mut [f32], right: &mut [f32]) {
        let total = left.len().min(right.len());
        let mut start = 0;
        while start < total {
            let frames = (total - start).min(SCRATCH_FRAMES);
            self.render(frames);
            for index in 0..frames {
                left[start + index] += self.left[index];
                right[start + index] += self.right[index];
            }
            start += frames;
        }
    }
}
