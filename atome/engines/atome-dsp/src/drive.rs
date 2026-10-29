// Drive: the signal is pushed by its drive gain into a curve that rounds it
// (soft clip, tanh) or cuts it flat at full scale (hard clip), then mixed
// with the dry signal.

use crate::{db_to_amplitude, ParamSpec, Processor, Smoothed, StereoBlock, Unit};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Clip {
    Soft,
    Hard,
}

pub const DRIVE_DB: u32 = 0;
pub const MIX: u32 = 1;
pub const PARAMS: [ParamSpec; 2] = [
    ParamSpec::new(DRIVE_DB, "drive_db", 0.0, 48.0, 12.0, Unit::Decibels),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];

pub struct Drive {
    clip: Clip,
    drive: Smoothed,
    mix: Smoothed,
}

impl Drive {
    pub fn new(clip: Clip) -> Self {
        Self { clip, drive: Smoothed::new(db_to_amplitude(PARAMS[0].default), 10.0), mix: Smoothed::new(PARAMS[1].default, 10.0) }
    }

    #[inline]
    fn shape(&self, x: f32) -> f32 {
        match self.clip {
            Clip::Soft => x.tanh(),
            Clip::Hard => x.clamp(-1.0, 1.0),
        }
    }
}

impl Processor for Drive {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.drive.prepare(sample_rate);
        self.mix.prepare(sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for (left, right) in block.left.iter_mut().zip(block.right.iter_mut()) {
            let (drive, mix) = (self.drive.tick(), self.mix.tick());
            *left = *left * (1.0 - mix) + self.shape(*left * drive) * mix;
            *right = *right * (1.0 - mix) + self.shape(*right * drive) * mix;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else { return };
        match id {
            DRIVE_DB => self.drive.set(db_to_amplitude(spec.clamp(value))),
            MIX => self.mix.set(spec.clamp(value)),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        self.drive.settle();
        self.mix.settle();
    }
}
