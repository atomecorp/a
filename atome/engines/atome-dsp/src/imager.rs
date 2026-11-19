// Stereo imager (mid/side): the side is scaled by the width (0 mono, 1 as
// is, 2 twice as wide); under `bass_mono_hz` the side is removed (the low
// end kept mono, as a cut needs it): the side keeps only its Linkwitz-Riley
// high band and the mid takes the matching all-pass, so both stay in phase. The correlation of the output is read
// (+1 mono, 0 unrelated, −1 out of phase).

use crate::biquad::{Coefficients, Section, Shape};
use crate::dynamics::time_coefficient;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const WIDTH: u32 = 0;
pub const BASS_MONO_HZ: u32 = 1;
pub const PARAMS: [ParamSpec; 2] = [
    ParamSpec::new(WIDTH, "width", 0.0, 2.0, 1.0, Unit::Ratio),
    // 0 = off.
    ParamSpec::new(BASS_MONO_HZ, "bass_mono_hz", 0.0, 500.0, 0.0, Unit::Hertz),
];
pub const READINGS: [&str; 1] = ["correlation"];

const BUTTERWORTH_Q: f32 = std::f32::consts::FRAC_1_SQRT_2;
const REDESIGN_FRAMES: usize = 16;
// The filter's frequency while the bass mono is off (it keeps running).
const IDLE_HZ: f32 = 89.0;
const CORRELATION_MS: f32 = 300.0;

pub struct Imager {
    sample_rate: f32,
    width: Smoothed,
    frequency: Smoothed,
    // 0 = bass mono off, 1 = on, crossfaded.
    bass_mono: Smoothed,
    high_pass: Coefficients,
    all_pass: Coefficients,
    side_filter: [Section; 2],
    mid_filter: Section,
    average: f32,
    products: [f32; 3],
    readings: [f32; 1],
}

impl Imager {
    pub fn new() -> Self {
        let bass = PARAMS[1].default;
        Self {
            sample_rate: 48000.0,
            width: Smoothed::new(PARAMS[0].default, 21.0),
            frequency: Smoothed::new(if bass > 0.0 { bass } else { IDLE_HZ }, 34.0),
            bass_mono: Smoothed::new(if bass > 0.0 { 1.0 } else { 0.0 }, 21.0),
            high_pass: Coefficients::default(),
            all_pass: Coefficients::default(),
            side_filter: [Section::default(); 2],
            mid_filter: Section::default(),
            average: 0.0,
            products: [0.0; 3],
            readings: [0.0],
        }
    }

    fn redesign(&mut self, frames: usize) {
        let mut frequency = self.frequency.target();
        for _ in 0..frames.max(1) {
            frequency = self.frequency.tick();
        }
        self.high_pass = Coefficients::design(
            Shape::HighPass,
            self.sample_rate,
            frequency,
            BUTTERWORTH_Q,
            0.0,
        );
        self.all_pass = Coefficients::all_pass(self.sample_rate, frequency, BUTTERWORTH_Q);
    }

    fn smoothers(&mut self) -> [&mut Smoothed; 3] {
        [&mut self.width, &mut self.frequency, &mut self.bass_mono]
    }
}

impl Default for Imager {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Imager {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        for smoothed in self.smoothers() {
            smoothed.prepare(sample_rate);
            smoothed.settle();
        }
        self.average = time_coefficient(CORRELATION_MS, sample_rate);
        self.redesign(1);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let mut start = 0;
        while start < frames {
            let end = (start + REDESIGN_FRAMES).min(frames);
            if !self.frequency.is_settled() {
                self.redesign(end - start);
            }
            let (high_pass, all_pass) = (self.high_pass, self.all_pass);
            for index in start..end {
                let width = self.width.tick();
                let bass_mono = self.bass_mono.tick();
                let (left, right) = (block.left[index], block.right[index]);
                let mid = 0.5 * (left + right);
                let side = 0.5 * (left - right);
                // The filters always run, so turning bass mono on or off
                // crossfades between two warm paths.
                let first = self.side_filter[0].tick(&high_pass, side);
                let side_high = self.side_filter[1].tick(&high_pass, first);
                let mid_phased = self.mid_filter.tick(&all_pass, mid);
                let mid = mid + bass_mono * (mid_phased - mid);
                let side = width * (side + bass_mono * (side_high - side));
                let (out_left, out_right) = (mid + side, mid - side);
                block.left[index] = out_left;
                block.right[index] = out_right;
                for (product, value) in self.products.iter_mut().zip([
                    out_left * out_right,
                    out_left * out_left,
                    out_right * out_right,
                ]) {
                    *product = value + self.average * (*product - value);
                    if product.abs() < 1.0e-20 {
                        *product = 0.0;
                    }
                }
            }
            start = end;
        }
        let [cross, left, right] = self.products;
        let power = (left * right).sqrt();
        self.readings[0] = if power > 1.0e-10 {
            (cross / power).clamp(-1.0, 1.0)
        } else {
            0.0
        };
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            WIDTH => self.width.set(value),
            BASS_MONO_HZ if value > 0.0 => {
                self.frequency.set(value);
                self.bass_mono.set(1.0);
            }
            BASS_MONO_HZ => self.bass_mono.set(0.0),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        for smoothed in self.smoothers() {
            smoothed.settle();
        }
        self.redesign(1);
        self.side_filter = [Section::default(); 2];
        self.mid_filter = Section::default();
        self.products = [0.0; 3];
        self.readings = [0.0];
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
