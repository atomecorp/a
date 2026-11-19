// Harmonizer: two extra voices at fixed intervals from one shared analysis of
// the (mono) voice, formants kept, panned apart by `width`. The defaults, a
// minor third up (+3) and a fourth down (−5), lay with the voice a minor triad
// in second inversion (G–C–E♭ over C): both intervals natural numbers.

use crate::delay::DelayLine;
use crate::pitch::{PitchShifter, SEGMENT, semitones_to_ratio};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use std::f32::consts::FRAC_PI_4;

pub const VOICE1_SEMITONES: u32 = 0;
pub const VOICE1_LEVEL: u32 = 1;
pub const VOICE2_SEMITONES: u32 = 2;
pub const VOICE2_LEVEL: u32 = 3;
pub const DRY: u32 = 4;
pub const WIDTH: u32 = 5;
pub const PARAMS: [ParamSpec; 6] = [
    ParamSpec::new(
        VOICE1_SEMITONES,
        "voice1_semitones",
        -24.0,
        24.0,
        3.0,
        Unit::Semitones,
    ),
    ParamSpec::new(VOICE1_LEVEL, "voice1_level", 0.0, 1.0, 0.55, Unit::Percent),
    ParamSpec::new(
        VOICE2_SEMITONES,
        "voice2_semitones",
        -24.0,
        24.0,
        -5.0,
        Unit::Semitones,
    ),
    ParamSpec::new(VOICE2_LEVEL, "voice2_level", 0.0, 1.0, 0.55, Unit::Percent),
    ParamSpec::new(DRY, "dry", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::new(WIDTH, "width", 0.0, 1.0, 0.55, Unit::Percent),
];

pub struct Harmonizer {
    values: [f32; 6],
    shifter: PitchShifter,
    dry_line: [DelayLine; 2],
    intervals: [Smoothed; 2],
    levels: [Smoothed; 2],
    dry: Smoothed,
    width: Smoothed,
}

impl Harmonizer {
    pub fn new() -> Self {
        let mut harmonizer = Self {
            values: PARAMS.map(|spec| spec.default),
            shifter: PitchShifter::new(48000.0, 2),
            dry_line: [DelayLine::new(), DelayLine::new()],
            intervals: [Smoothed::new(3.0, 34.0), Smoothed::new(-5.0, 34.0)],
            levels: [Smoothed::new(0.55, 21.0), Smoothed::new(0.55, 21.0)],
            dry: Smoothed::new(1.0, 21.0),
            width: Smoothed::new(0.55, 21.0),
        };
        harmonizer.prepare(48000.0, 0);
        harmonizer
    }

    fn targets(&mut self) {
        let v = self.values;
        self.intervals[0].set(v[VOICE1_SEMITONES as usize]);
        self.intervals[1].set(v[VOICE2_SEMITONES as usize]);
        self.levels[0].set(v[VOICE1_LEVEL as usize]);
        self.levels[1].set(v[VOICE2_LEVEL as usize]);
        self.dry.set(v[DRY as usize]);
        self.width.set(v[WIDTH as usize]);
    }
}

impl Default for Harmonizer {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Harmonizer {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.shifter = PitchShifter::new(sample_rate, 2);
        for line in &mut self.dry_line {
            line.allocate(self.shifter.latency() + 1);
        }
        for interval in &mut self.intervals {
            interval.prepare(sample_rate / SEGMENT as f32);
        }
        for smoothed in self
            .levels
            .iter_mut()
            .chain([&mut self.dry, &mut self.width])
        {
            smoothed.prepare(sample_rate);
        }
        self.targets();
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        let latency = self.shifter.latency() as f32;
        let mut start = 0;
        while start < frames {
            let end = (start + SEGMENT).min(frames);
            for voice in 0..2 {
                let ratio = semitones_to_ratio(self.intervals[voice].tick());
                self.shifter.set_voice(voice, ratio, 1.0);
            }
            for index in start..end {
                let left = block.left[index];
                let right = block.right[index];
                let mut voices = [0.0; 2];
                self.shifter.push(0.5 * (left + right), &mut voices);
                let dry_left = self.dry_line[0].read(latency);
                let dry_right = self.dry_line[1].read(latency);
                self.dry_line[0].push(left);
                self.dry_line[1].push(right);
                let dry = self.dry.tick();
                // Constant-power pan: voice 1 to the left, voice 2 to the right.
                let width = self.width.tick();
                let (far, near) = (FRAC_PI_4 * (1.0 - width)).sin_cos();
                let first = voices[0] * self.levels[0].tick();
                let second = voices[1] * self.levels[1].tick();
                block.left[index] = dry_left * dry + first * near + second * far;
                block.right[index] = dry_right * dry + first * far + second * near;
            }
            start = end;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
            self.targets();
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn latency_frames(&self) -> u32 {
        self.shifter.latency() as u32
    }

    fn tail_frames(&self) -> u32 {
        self.shifter.size() as u32
    }

    fn reset(&mut self) {
        for smoothed in self
            .intervals
            .iter_mut()
            .chain(self.levels.iter_mut())
            .chain([&mut self.dry, &mut self.width])
        {
            smoothed.settle();
        }
        self.shifter.reset();
        for line in &mut self.dry_line {
            line.clear();
        }
    }
}
