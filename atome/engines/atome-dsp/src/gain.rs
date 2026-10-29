// Volume (the strip's fader module) and stereo pan.

use crate::{db_to_amplitude, ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const VOLUME_DB: u32 = 0;
pub const VOLUME_PARAMS: [ParamSpec; 1] = [ParamSpec::new(VOLUME_DB, "volume_db", -120.0, 12.0, 0.0, Unit::Decibels)];

pub struct Volume {
    gain: Smoothed,
}

impl Volume {
    pub fn new(volume_db: f32) -> Self {
        Self { gain: Smoothed::new(db_to_amplitude(volume_db), 10.0) }
    }
}

impl Processor for Volume {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.gain.prepare(sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for (left, right) in block.left.iter_mut().zip(block.right.iter_mut()) {
            let gain = self.gain.tick();
            *left *= gain;
            *right *= gain;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if id == VOLUME_DB {
            self.gain.set(db_to_amplitude(VOLUME_PARAMS[0].clamp(value)));
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &VOLUME_PARAMS
    }

    fn reset(&mut self) {
        self.gain.settle();
    }
}

pub const PAN: u32 = 0;
pub const PAN_PARAMS: [ParamSpec; 1] = [ParamSpec::new(PAN, "pan", -1.0, 1.0, 0.0, Unit::Pan)];

// Constant-power pan: centre keeps the level of each side (-3 dB law avoided
// so a centred strip sounds exactly as it does without the module).
pub struct Pan {
    position: Smoothed,
}

impl Pan {
    pub fn new(pan: f32) -> Self {
        Self { position: Smoothed::new(pan.clamp(-1.0, 1.0), 10.0) }
    }
}

impl Processor for Pan {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.position.prepare(sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for (left, right) in block.left.iter_mut().zip(block.right.iter_mut()) {
            let pan = self.position.tick();
            *left *= (1.0 - pan).min(1.0);
            *right *= (1.0 + pan).min(1.0);
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if id == PAN {
            self.position.set(PAN_PARAMS[0].clamp(value));
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PAN_PARAMS
    }

    fn reset(&mut self) {
        self.position.settle();
    }
}
