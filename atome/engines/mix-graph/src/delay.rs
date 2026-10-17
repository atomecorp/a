// Delay whose time changes live (todo/audio_to_finalize §6.3.3). Kira's delay
// sizes its buffer from its time, so a new time meant a new instance and the
// echo in flight was lost. Here the buffer holds MAX_DELAY_SECONDS and the read
// head glides to the new time (a short tape-like pitch bend while it moves):
// the echoes already in the buffer keep sounding.

use crate::dsp::AtomicParam;
use kira::effect::{Effect, EffectBuilder};
use kira::info::Info;
use kira::Frame;
use std::sync::Arc;

pub const MAX_DELAY_SECONDS: f64 = 4.0;
// Time constant of the read head's glide towards a new delay time.
const GLIDE_SECONDS: f64 = 0.05;

#[derive(Debug)]
struct DelayControls {
    time_seconds: AtomicParam,
    feedback_db: AtomicParam,
    mix: AtomicParam,
}

// Control-thread side: every change is picked up by the next rendered frame.
#[derive(Clone, Debug)]
pub struct DelayHandle(Arc<DelayControls>);

impl DelayHandle {
    pub fn set(&self, time_seconds: f64, feedback_db: f64, mix: f64) {
        self.0.time_seconds.set(time_seconds.clamp(0.001, MAX_DELAY_SECONDS) as f32);
        self.0.feedback_db.set(feedback_db as f32);
        self.0.mix.set(mix.clamp(0.0, 1.0) as f32);
    }
}

pub struct DelayEffectBuilder(DelayHandle);

impl DelayEffectBuilder {
    pub fn new(time_seconds: f64, feedback_db: f64, mix: f64) -> Self {
        let handle = DelayHandle(Arc::new(DelayControls {
            time_seconds: AtomicParam::new(0.0), feedback_db: AtomicParam::new(0.0), mix: AtomicParam::new(0.0),
        }));
        handle.set(time_seconds, feedback_db, mix);
        Self(handle)
    }
}

impl EffectBuilder for DelayEffectBuilder {
    type Handle = DelayHandle;

    fn build(self) -> (Box<dyn Effect>, Self::Handle) {
        let effect = DelayEffect { controls: Arc::clone(&self.0 .0), buffer: Vec::new(), write: 0, time_frames: 0.0, glide: 0.0, sample_rate: 0.0 };
        (Box::new(effect), self.0)
    }
}

struct DelayEffect {
    controls: Arc<DelayControls>,
    buffer: Vec<Frame>,
    write: usize,
    // Current (gliding) delay of the read head, in frames.
    time_frames: f64,
    glide: f64,
    sample_rate: f64,
}

impl DelayEffect {
    // A time within 1/1000 frame of a whole frame reads that frame exactly (the
    // control is an f32: 0.1 s is 4800.00007 frames at 48 kHz).
    fn target_frames(&self) -> f64 {
        let raw = f64::from(self.controls.time_seconds.get()) * self.sample_rate;
        let frames = if (raw - raw.round()).abs() < 1e-3 { raw.round() } else { raw };
        frames.clamp(1.0, (self.buffer.len() - 2) as f64)
    }

    fn allocate(&mut self, sample_rate: u32) {
        self.sample_rate = f64::from(sample_rate);
        self.buffer = vec![Frame::ZERO; (MAX_DELAY_SECONDS * self.sample_rate).ceil() as usize + 2];
        self.write = 0;
        self.glide = 1.0 - (-1.0 / (GLIDE_SECONDS * self.sample_rate)).exp();
        self.time_frames = self.target_frames();
    }
}

impl Effect for DelayEffect {
    fn init(&mut self, sample_rate: u32, _internal_buffer_size: usize) {
        self.allocate(sample_rate);
    }

    fn on_change_sample_rate(&mut self, sample_rate: u32) {
        self.allocate(sample_rate);
    }

    fn process(&mut self, input: &mut [Frame], _dt: f64, _info: &Info) {
        if self.buffer.len() < 4 {
            return;
        }
        let target = self.target_frames();
        let feedback = 10f32.powf(self.controls.feedback_db.get() / 20.0);
        let mix = self.controls.mix.get();
        let length = self.buffer.len();
        for frame in input.iter_mut() {
            // A settled head reads whole frames: the echo stays sample-exact.
            self.time_frames += (target - self.time_frames) * self.glide;
            if (target - self.time_frames).abs() < 1e-3 {
                self.time_frames = target;
            }
            let read = self.write as f64 + length as f64 - self.time_frames;
            let index = read.floor();
            let fraction = (read - index) as f32;
            let older = self.buffer[index as usize % length];
            let newer = self.buffer[(index as usize + 1) % length];
            let delayed = older + (newer - older) * fraction;
            self.buffer[self.write] = *frame + delayed * feedback;
            *frame = *frame * (1.0 - mix) + delayed * mix;
            self.write = (self.write + 1) % length;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::DelayEffectBuilder;
    use kira::effect::EffectBuilder;
    use kira::info::MockInfoBuilder;
    use kira::Frame;

    const RATE: u32 = 48_000;

    fn run(effect: &mut Box<dyn kira::effect::Effect>, frames: usize, impulse_at: Option<usize>) -> Vec<f32> {
        let info = MockInfoBuilder::new().build();
        let mut out = Vec::with_capacity(frames);
        let mut block = vec![Frame::ZERO; 128];
        while out.len() < frames {
            let start = out.len();
            block.iter_mut().enumerate().for_each(|(i, frame)| *frame = if Some(start + i) == impulse_at { Frame::from_mono(1.0) } else { Frame::ZERO });
            effect.process(&mut block, 1.0 / f64::from(RATE), &info);
            out.extend(block.iter().map(|frame| frame.left));
        }
        out
    }

    #[test]
    fn the_echo_lands_on_its_exact_frame_with_its_feedback() {
        let (mut effect, _handle) = DelayEffectBuilder::new(0.1, -6.0206, 1.0).build();
        effect.init(RATE, 128);
        let out = run(&mut effect, 15_000, Some(10));
        assert!((out[10 + 4800] - 1.0).abs() < 1e-5, "first echo, 100 ms later: {}", out[10 + 4800]);
        assert!((out[10 + 9600] - 0.5).abs() < 1e-4, "second echo at -6 dB: {}", out[10 + 9600]);
        let stray: Vec<(usize, f32)> = out.iter().copied().enumerate().filter(|(index, sample)| ![10 + 4800, 10 + 9600, 10 + 14_400].contains(index) && sample.abs() >= 1e-6).take(5).collect();
        assert!(stray.is_empty(), "nothing between the echoes: {stray:?}");
    }

    #[test]
    fn a_new_time_keeps_the_echo_in_flight() {
        let (mut effect, handle) = DelayEffectBuilder::new(0.2, -6.0, 1.0).build();
        effect.init(RATE, 128);
        let before = run(&mut effect, 4800, Some(0));
        assert!(before.iter().all(|sample| sample.abs() < 1e-6), "the echo is still in the buffer");
        handle.set(0.25, -6.0, 1.0);
        let after = run(&mut effect, 48_000, None);
        let energy: f32 = after.iter().map(|sample| sample * sample).sum();
        assert!(energy > 0.5, "the echo written before the change still sounds: {energy}");
    }
}
