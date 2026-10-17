// Extra channel pairs of the output device, fed by the mixer graph (a strip
// routed to « <device> 3-4 », « 5-6 », …). The render thread drains the graph's
// pairs after each block into one FIFO per pair, always pushing a full block
// (silence when empty) so every FIFO stays in step with the main one; the
// device callback copies them to channels 3.. exactly as it copies 1-2.

use atome_mix_graph::AuxOutputs;
use kira::Frame;
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};
use std::sync::{Arc, Mutex};

pub const MAX_AUX_PAIRS: usize = 7;

#[derive(Clone, Debug, serde::Serialize)]
pub struct OutputDevice {
    pub id: String,
    pub name: String,
    pub channels: u16,
}

static AUX_SOURCE: Mutex<Option<Arc<AuxOutputs>>> = Mutex::new(None);
static OUTPUT_DEVICE: Mutex<Option<OutputDevice>> = Mutex::new(None);

pub fn install_aux_source(aux: Arc<AuxOutputs>) {
    if let Ok(mut slot) = AUX_SOURCE.lock() {
        *slot = Some(aux);
    }
}

pub fn output_device() -> Option<OutputDevice> {
    OUTPUT_DEVICE.lock().ok().and_then(|slot| slot.clone())
}

// The opened device decides how many extra pairs the graph may feed.
pub(super) fn note_output_device(name: String, channels: u16, block_frames: usize) {
    let pairs = (usize::from(channels / 2)).saturating_sub(1).min(MAX_AUX_PAIRS) as u16;
    if let Some(aux) = AUX_SOURCE.lock().ok().and_then(|slot| slot.clone()) {
        aux.configure(pairs, block_frames * 4);
    }
    if let Ok(mut slot) = OUTPUT_DEVICE.lock() {
        *slot = Some(OutputDevice { id: name.clone(), name, channels });
    }
}

pub(super) type SharedAuxConsumers = Arc<Mutex<Vec<HeapCons<f32>>>>;

pub(super) struct AuxFeeder {
    source: Option<Arc<AuxOutputs>>,
    producers: Vec<HeapProd<f32>>,
    frames: Vec<Frame>,
    interleaved: Vec<f32>,
}

pub(super) fn create_aux(fifo_frames: usize, block_frames: usize) -> (AuxFeeder, SharedAuxConsumers) {
    let (producers, consumers): (Vec<_>, Vec<_>) = (0..MAX_AUX_PAIRS)
        .map(|_| HeapRb::<f32>::new(fifo_frames * 2).split())
        .unzip();
    let feeder = AuxFeeder {
        source: AUX_SOURCE.lock().ok().and_then(|slot| slot.clone()),
        producers,
        frames: vec![Frame::ZERO; block_frames],
        interleaved: vec![0.0; block_frames * 2],
    };
    (feeder, Arc::new(Mutex::new(consumers)))
}

impl AuxFeeder {
    // Called right after each rendered block, on the render thread.
    pub(super) fn feed(&mut self) {
        for (index, producer) in self.producers.iter_mut().enumerate() {
            match &self.source {
                Some(source) => source.drain_pair(index as u16 + 1, &mut self.frames),
                None => self.frames.fill(Frame::ZERO),
            }
            for (frame, sample) in self.frames.iter().zip(self.interleaved.chunks_mut(2)) {
                sample[0] = frame.left;
                sample[1] = frame.right;
            }
            producer.push_slice(&self.interleaved);
        }
    }
}

// Device callback: the same `frames` the main FIFO gave, into channels 3...
pub(super) fn write_aux(consumers: &SharedAuxConsumers, data: &mut [f32], device_channels: usize, frames: usize, scratch: &mut [f32]) {
    let Ok(mut rings) = consumers.try_lock() else { return };
    let pairs = (device_channels / 2).saturating_sub(1).min(rings.len());
    for (pair, ring) in rings.iter_mut().enumerate() {
        let popped = ring.pop_slice(&mut scratch[..frames * 2]) / 2;
        if pair >= pairs {
            continue;
        }
        let channel = 2 + pair * 2;
        for frame in 0..frames {
            let (left, right) = if frame < popped { (scratch[frame * 2], scratch[frame * 2 + 1]) } else { (0.0, 0.0) };
            data[frame * device_channels + channel] = left;
            data[frame * device_channels + channel + 1] = right;
        }
    }
}
