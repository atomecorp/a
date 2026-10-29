// The amp module: a Neural Amp Modeler capture (WaveNet, LSTM or A2) run by
// nam-rs. The model is mono and runs at its own capture rate; a device at
// another rate is resampled in and out. Loudness is normalised from the file's
// metadata so changing amp never jumps the level, and a DC blocker follows.

use crate::resample::{Resampler, HALF_TAPS};
use crate::{db_to_amplitude, ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use nam_rs::{Model, NamModel};

pub use nam_rs::Error as AmpModelError;

pub const INPUT_DB: u32 = 0;
pub const OUTPUT_DB: u32 = 1;
pub const SIZE: u32 = 2;
pub const PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(INPUT_DB, "input_db", -24.0, 24.0, 0.0, Unit::Decibels),
    ParamSpec::new(OUTPUT_DB, "output_db", -24.0, 24.0, 0.0, Unit::Decibels),
    // A2 width dial: CPU against fidelity. Only an A2 capture exposes it.
    ParamSpec::new(SIZE, "size", 0.0, 1.0, 1.0, Unit::Percent),
];

// NAM's reference output level: every capture is brought to it.
const NORMALISED_LOUDNESS_DB: f32 = -18.0;
const DC_BLOCKER_HZ: f32 = 5.0;

pub struct AmpModel {
    model: Model,
    model_rate: f64,
    normalisation: f32,
    input: Smoothed,
    output: Smoothed,
    dc_input: f32,
    dc_output: f32,
    dc_pole: f32,
    // Present only when the device rate differs from the capture rate.
    conversion: Option<Conversion>,
}

struct Conversion {
    inward: Resampler,
    outward: Resampler,
    scratch: Vec<f32>,
    outward_lead: usize,
    advance: f64,
    latency: u32,
}

impl AmpModel {
    // Builds the network from a parsed capture. Allocates: never on the audio thread.
    pub fn from_nam(capture: &NamModel) -> Result<Self, AmpModelError> {
        let model = Model::from_nam(capture)?;
        let normalisation = capture.loudness().map_or(1.0, |loudness| db_to_amplitude(NORMALISED_LOUDNESS_DB - loudness));
        Ok(Self {
            model,
            model_rate: capture.expected_sample_rate(),
            normalisation,
            input: Smoothed::new(1.0, 10.0),
            output: Smoothed::new(1.0, 10.0),
            dc_input: 0.0,
            dc_output: 0.0,
            dc_pole: 0.0,
            conversion: None,
        })
    }

    pub fn from_json_str(json: &str) -> Result<Self, AmpModelError> {
        Self::from_nam(&NamModel::from_json_str(json)?)
    }

    pub fn model_rate(&self) -> f64 {
        self.model_rate
    }

    pub fn is_slimmable(&self) -> bool {
        self.model.as_slimmable().is_some()
    }

    fn run_model(&mut self, mono: &mut [f32]) {
        let Some(conversion) = self.conversion.as_mut() else {
            self.model.process_buffer(mono);
            return;
        };
        for &sample in mono.iter() {
            conversion.inward.push(sample);
        }
        let mut produced = 0;
        while conversion.inward.can_read() {
            conversion.scratch[produced] = conversion.inward.read();
            produced += 1;
        }
        self.model.process_buffer(&mut conversion.scratch[..produced]);
        for &sample in &conversion.scratch[..produced] {
            conversion.outward.push(sample);
        }
        for sample in mono.iter_mut() {
            *sample = conversion.outward.read();
        }
    }
}

impl Processor for AmpModel {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.input.prepare(sample_rate);
        self.output.prepare(sample_rate);
        self.dc_pole = (-2.0 * std::f32::consts::PI * DC_BLOCKER_HZ / sample_rate).exp();
        let device_rate = sample_rate as f64;
        self.conversion = if (device_rate - self.model_rate).abs() < 0.5 {
            None
        } else {
            let ratio = self.model_rate / device_rate;
            let model_block = (max_block as f64 * ratio).ceil() as usize + 2;
            // The outward reader must never outrun what the inward side has
            // produced: it starts behind by the inward look-ahead plus a margin.
            let outward_lead = HALF_TAPS + (HALF_TAPS as f64 * ratio).ceil() as usize + 3;
            let mut inward = Resampler::new();
            inward.allocate(device_rate, self.model_rate, max_block + HALF_TAPS * 2);
            let mut outward = Resampler::new();
            outward.allocate(self.model_rate, device_rate, model_block + outward_lead + HALF_TAPS * 2);
            // The lead, in device frames, rounded down to a whole frame.
            let latency = (outward_lead as f64 / ratio).floor() as u32;
            let advance = outward_lead as f64 - latency as f64 * ratio;
            Some(Conversion { inward, outward, scratch: vec![0.0; model_block], outward_lead, advance, latency })
        };
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for (left, right) in block.left.iter_mut().zip(block.right.iter()) {
            *left = (*left + *right) * 0.5 * self.input.tick();
        }
        self.run_model(block.left);
        let gain = self.normalisation;
        for (left, right) in block.left.iter_mut().zip(block.right.iter_mut()) {
            let x = *left;
            self.dc_output = x - self.dc_input + self.dc_pole * self.dc_output;
            self.dc_input = x;
            *left = self.dc_output * gain * self.output.tick();
            *right = *left;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else { return };
        let value = spec.clamp(value);
        match id {
            INPUT_DB => self.input.set(db_to_amplitude(value)),
            OUTPUT_DB => self.output.set(db_to_amplitude(value)),
            SIZE => {
                if let Some(slimmable) = self.model.as_slimmable_mut() {
                    slimmable.set_slim_size(value);
                }
            }
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        if self.is_slimmable() {
            &PARAMS
        } else {
            &PARAMS[..2]
        }
    }

    fn latency_frames(&self) -> u32 {
        self.conversion.as_ref().map_or(0, |conversion| conversion.latency)
    }

    fn reset(&mut self) {
        self.input.settle();
        self.output.settle();
        self.model.reset();
        self.dc_input = 0.0;
        self.dc_output = 0.0;
        if let Some(conversion) = self.conversion.as_mut() {
            conversion.inward.reset(0);
            conversion.outward.reset(conversion.outward_lead);
            conversion.outward.advance(conversion.advance);
        }
    }
}
