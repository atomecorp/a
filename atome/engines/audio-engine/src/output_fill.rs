// One output quantum of the device (the cpal callback, the WASAPI thread):
// the timeline's FIFO frames, the direct path mixed in after them, the extra
// channel pairs, and which rendered frame plays at which host instant.

use super::aux_outputs::{self, SharedAuxConsumers};
use super::direct::{self, SharedDirect};
use super::scheduled_backend::{note_output_quantum, SharedConsumer, CHANNELS, FIFO_FRAMES};
use ringbuf::traits::Consumer;

pub(crate) struct OutputFill {
    consumer: SharedConsumer,
    aux: SharedAuxConsumers,
    direct: SharedDirect,
    scratch: Vec<f32>,
    aux_scratch: Vec<f32>,
}

impl OutputFill {
    pub(crate) fn new(consumer: SharedConsumer, aux: SharedAuxConsumers, direct: SharedDirect) -> Self {
        Self { consumer, aux, direct, scratch: vec![0.0; FIFO_FRAMES * CHANNELS], aux_scratch: vec![0.0; FIFO_FRAMES * CHANNELS] }
    }

    pub(crate) fn fill(&mut self, data: &mut [f32], device_channels: usize, host_ns: i64) {
        let frames = data.len() / device_channels;
        if self.scratch.len() < frames * CHANNELS {
            self.scratch.resize(frames * CHANNELS, 0.0);
        }
        let popped = match self.consumer.try_lock() {
            Ok(mut fifo) => fifo.pop_slice(&mut self.scratch[..frames * CHANNELS]) / CHANNELS,
            Err(_) => 0,
        };
        for frame in 0..frames {
            let (left, right) = if frame < popped {
                (self.scratch[frame * CHANNELS], self.scratch[frame * CHANNELS + 1])
            } else {
                (0.0, 0.0)
            };
            let out = &mut data[frame * device_channels..(frame + 1) * device_channels];
            if device_channels == 1 {
                out[0] = (left + right) * 0.5;
            } else {
                out[0] = left;
                out[1] = right;
                out[2..].iter_mut().for_each(|sample| *sample = 0.0);
            }
        }
        if direct::is_active() {
            direct::note_output_quantum(frames);
            if let Ok(mut direct) = self.direct.try_lock() {
                direct.mix_interleaved(data, device_channels);
            }
        }
        aux_outputs::write_aux(&self.aux, data, device_channels, frames.min(FIFO_FRAMES), &mut self.aux_scratch);
        note_output_quantum(host_ns, frames, popped);
    }
}
