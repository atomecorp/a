// Two-port splits with no parameter: centre and sides (Mid/Side), or each
// channel apart (Left/Right). The two ports always sum back to the input.

use crate::{ParamSpec, Processor, StereoBlock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Split {
    // Port 0: the centre on both sides; port 1: the sides, opposite in phase.
    MidSide,
    // Port 0: the left channel alone; port 1: the right one.
    LeftRight,
}

pub struct Splitter {
    split: Split,
}

impl Splitter {
    pub fn new(split: Split) -> Self {
        Self { split }
    }
}

impl Processor for Splitter {
    fn prepare(&mut self, _sample_rate: f32, _max_block: usize) {}

    fn process(&mut self, _block: &mut StereoBlock) {}

    fn process_ports(&mut self, block: &mut StereoBlock, extra: &mut [StereoBlock]) {
        let Some(second) = extra.first_mut() else { return };
        for index in 0..block.frames() {
            let (left, right) = (block.left[index], block.right[index]);
            let (first, other) = match self.split {
                Split::MidSide => {
                    let (mid, side) = ((left + right) * 0.5, (left - right) * 0.5);
                    ((mid, mid), (side, -side))
                }
                Split::LeftRight => ((left, 0.0), (0.0, right)),
            };
            (block.left[index], block.right[index]) = first;
            (second.left[index], second.right[index]) = other;
        }
    }

    fn set_param(&mut self, _id: u32, _value: f32) {}

    fn params(&self) -> &'static [ParamSpec] {
        &[]
    }

    fn reset(&mut self) {}

    fn extra_outputs(&self) -> usize {
        1
    }
}
