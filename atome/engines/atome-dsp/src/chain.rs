// A strip's modules in order. The host builds a chain off the audio thread
// (prepare allocates everything) and swaps it in whole; on the audio thread
// only bypass and parameters change.

use crate::delay::DelayLine;
use crate::{ParamSpec, Processor, StereoBlock};

// A bypassed effect keeps ringing: its tail is fed silence and added over the
// dry signal until it has rung for `tail_frames`.
struct Slot {
    processor: Box<dyn Processor>,
    bypassed: bool,
    tail_left: u32,
    // Keeps a bypassed module's latency so parallel paths stay aligned (D3).
    compensation: [DelayLine; 2],
}

pub struct Chain {
    slots: Vec<Slot>,
    scratch: [Vec<f32>; 2],
}

impl Chain {
    pub fn new() -> Self {
        Self { slots: Vec::new(), scratch: [Vec::new(), Vec::new()] }
    }

    pub fn push(&mut self, processor: Box<dyn Processor>) {
        self.slots.push(Slot { processor, bypassed: false, tail_left: 0, compensation: [DelayLine::new(), DelayLine::new()] });
    }

    pub fn len(&self) -> usize {
        self.slots.len()
    }

    pub fn is_empty(&self) -> bool {
        self.slots.is_empty()
    }

    pub fn set_bypass(&mut self, index: usize, bypassed: bool) {
        let Some(slot) = self.slots.get_mut(index) else { return };
        if bypassed && !slot.bypassed {
            slot.tail_left = slot.processor.tail_frames();
        }
        if !bypassed && slot.bypassed {
            slot.tail_left = 0;
        }
        slot.bypassed = bypassed;
    }

    pub fn set_module_param(&mut self, index: usize, id: u32, value: f32) {
        if let Some(slot) = self.slots.get_mut(index) {
            slot.processor.set_param(id, value);
        }
    }

    pub fn module_params(&self, index: usize) -> &'static [ParamSpec] {
        self.slots.get(index).map(|slot| slot.processor.params()).unwrap_or(&[])
    }
}

impl Default for Chain {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Chain {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.scratch = [vec![0.0; max_block], vec![0.0; max_block]];
        for slot in &mut self.slots {
            slot.processor.prepare(sample_rate, max_block);
            let latency = slot.processor.latency_frames() as usize;
            if latency > 0 {
                for line in &mut slot.compensation {
                    line.allocate(latency);
                }
            }
        }
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let [scratch_left, scratch_right] = &mut self.scratch;
        for slot in &mut self.slots {
            if !slot.bypassed {
                slot.processor.process(block);
                continue;
            }
            let latency = slot.processor.latency_frames() as f32;
            if latency > 0.0 {
                for (channel, line) in [&mut *block.left, &mut *block.right].into_iter().zip(slot.compensation.iter_mut()) {
                    for sample in channel.iter_mut() {
                        let delayed = line.read(latency);
                        line.push(*sample);
                        *sample = delayed;
                    }
                }
            }
            if slot.tail_left > 0 {
                let left = &mut scratch_left[..frames];
                let right = &mut scratch_right[..frames];
                left.fill(0.0);
                right.fill(0.0);
                slot.processor.process(&mut StereoBlock::new(left, right));
                for (out, ring) in block.left.iter_mut().zip(left.iter()) {
                    *out += *ring;
                }
                for (out, ring) in block.right.iter_mut().zip(right.iter()) {
                    *out += *ring;
                }
                slot.tail_left = slot.tail_left.saturating_sub(frames as u32);
            }
        }
    }

    fn set_param(&mut self, _id: u32, _value: f32) {}

    fn params(&self) -> &'static [ParamSpec] {
        &[]
    }

    // Bypassed modules keep their latency (compensation), so the sum is stable.
    fn latency_frames(&self) -> u32 {
        self.slots.iter().map(|slot| slot.processor.latency_frames()).sum()
    }

    fn tail_frames(&self) -> u32 {
        self.slots.iter().map(|slot| slot.processor.tail_frames()).max().unwrap_or(0)
    }

    fn reset(&mut self) {
        for slot in &mut self.slots {
            slot.processor.reset();
            slot.tail_left = 0;
            for line in &mut slot.compensation {
                line.clear();
            }
        }
    }
}
