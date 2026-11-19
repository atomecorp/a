// Pitch correction (« autotune »): YIN detects the voice's pitch on each
// frame, the nearest note of the chosen key and scale becomes the target, and
// the phase vocoder core moves the voice there at `speed_ms` (0 = the hard,
// robotic snap), formants kept. Unvoiced and silent passages pass untouched.

use crate::delay::DelayLine;
use crate::pitch::{PitchShifter, semitones_to_ratio};
use crate::stft::Stft;
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit};
use realfft::num_complex::Complex;

pub const KEY: u32 = 0;
pub const SCALE: u32 = 1;
pub const SPEED_MS: u32 = 2;
pub const AMOUNT: u32 = 3;
pub const FORMANT: u32 = 4;
pub const PARAMS: [ParamSpec; 5] = [
    ParamSpec::choice(
        KEY,
        "key",
        &[
            "c", "c_sharp", "d", "d_sharp", "e", "f", "f_sharp", "g", "g_sharp", "a", "a_sharp",
            "b",
        ],
        0,
    ),
    ParamSpec::choice(
        SCALE,
        "scale",
        &["chromatic", "major", "minor", "pentatonic"],
        0,
    ),
    ParamSpec::new(SPEED_MS, "speed_ms", 0.0, 400.0, 21.0, Unit::Milliseconds),
    ParamSpec::new(AMOUNT, "amount", 0.0, 1.0, 1.0, Unit::Percent),
    // 0 keeps the voice's own formants while its pitch is corrected.
    ParamSpec::new(FORMANT, "formant", -12.0, 12.0, 0.0, Unit::Semitones),
];

pub const READINGS: [&str; 2] = ["detected_hz", "correction_cents"];

// Pitch classes allowed by each scale, bit n = n semitones above the key.
const SCALES: [u16; 4] = [
    0x0FFF,
    0b1010_1011_0101, // major: 0 2 4 5 7 9 11
    0b0101_1010_1101, // natural minor: 0 2 3 5 7 8 10
    0b0010_1001_0101, // major pentatonic: 0 2 4 7 9
];
const YIN_THRESHOLD: f32 = 0.15;
const HIGHEST_HZ: f32 = 1500.0;
const LOWEST_HZ: f32 = 55.0;
// −55 dBFS mean power: quieter frames are silence.
const SILENT_POWER: f32 = 3.2e-6;
// A target note is kept until the voice leaves it by this much more than half.
const HYSTERESIS: f32 = 0.13;
// Frames between a frame's analysis and its centre reaching the output.
const GATE_DELAY: usize = 2;

pub struct Tuner {
    sample_rate: f32,
    values: [f32; 5],
    shifters: [PitchShifter; 2],
    dry: [DelayLine; 2],
    detector: Stft,
    time: Vec<f32>,
    spectrum_a: Vec<Complex<f32>>,
    spectrum_b: Vec<Complex<f32>>,
    correlation: Vec<f32>,
    energy: Vec<f32>,
    normalized: Vec<f32>,
    target_note: Option<f32>,
    correction: f32,
    gates: [f32; GATE_DELAY + 1],
    gate: Smoothed,
    formant: f32,
    readings: [f32; 2],
}

impl Tuner {
    pub fn new() -> Self {
        let mut tuner = Self {
            sample_rate: 48000.0,
            values: PARAMS.map(|spec| spec.default),
            shifters: [PitchShifter::new(48000.0, 1), PitchShifter::new(48000.0, 1)],
            dry: [DelayLine::new(), DelayLine::new()],
            detector: Stft::new(48000.0),
            time: Vec::new(),
            spectrum_a: Vec::new(),
            spectrum_b: Vec::new(),
            correlation: Vec::new(),
            energy: Vec::new(),
            normalized: Vec::new(),
            target_note: None,
            correction: 0.0,
            gates: [0.0; GATE_DELAY + 1],
            gate: Smoothed::new(0.0, 13.0),
            formant: 1.0,
            readings: [0.0; 2],
        };
        tuner.prepare(48000.0, 0);
        tuner
    }

    // YIN on the detector's frame: the fundamental in Hz, None when unvoiced.
    fn detect(&mut self) -> Option<f32> {
        let frame = self.detector.frame();
        let size = frame.len();
        let window = size / 2;
        self.energy[0] = 0.0;
        for (index, sample) in frame.iter().enumerate() {
            self.energy[index + 1] = self.energy[index] + sample * sample;
        }
        if self.energy[window] / (window as f32) < SILENT_POWER {
            return None;
        }
        // Cross term Σ x[j]·x[j+τ] by FFT: the first half against the frame.
        self.time[..window].copy_from_slice(&frame[..window]);
        self.time[window..].fill(0.0);
        let mut first = std::mem::take(&mut self.time);
        self.detector.forward(&mut first, &mut self.spectrum_a);
        first.copy_from_slice(self.detector.frame());
        self.detector.forward(&mut first, &mut self.spectrum_b);
        for (a, b) in self.spectrum_a.iter_mut().zip(&self.spectrum_b) {
            *a = a.conj() * b;
        }
        self.detector
            .inverse(&mut self.spectrum_a, &mut self.correlation);
        self.time = first;
        let scale = 1.0 / size as f32;
        let lowest_lag = (self.sample_rate / HIGHEST_HZ) as usize;
        let highest_lag = ((self.sample_rate / LOWEST_HZ) as usize).min(window - 2);
        let head = self.energy[window];
        let mut running = 0.0;
        self.normalized[0] = 1.0;
        for lag in 1..=highest_lag + 1 {
            let tail = self.energy[lag + window] - self.energy[lag];
            let difference = (head + tail - 2.0 * self.correlation[lag] * scale).max(0.0);
            running += difference;
            self.normalized[lag] = if running > 0.0 {
                difference * lag as f32 / running
            } else {
                1.0
            };
        }
        let d = &self.normalized;
        let mut lag = lowest_lag.max(2);
        while lag < highest_lag && d[lag] >= YIN_THRESHOLD {
            lag += 1;
        }
        if lag >= highest_lag {
            return None;
        }
        while lag + 1 < highest_lag && d[lag + 1] < d[lag] {
            lag += 1;
        }
        let (before, here, after) = (d[lag - 1], d[lag], d[lag + 1]);
        let curve = before + after - 2.0 * here;
        let offset = if curve > 0.0 {
            (0.5 * (before - after) / curve).clamp(-0.5, 0.5)
        } else {
            0.0
        };
        Some(self.sample_rate / (lag as f32 + offset))
    }

    // Nearest allowed note, keeping the current target within the hysteresis.
    fn target(&self, note: f32) -> f32 {
        let key = PARAMS[KEY as usize].index(self.values[KEY as usize]) as i32;
        let mask = SCALES[PARAMS[SCALE as usize].index(self.values[SCALE as usize])];
        let allowed = |n: i32| mask & (1 << (n - key).rem_euclid(12)) != 0;
        if let Some(current) = self.target_note
            && allowed(current as i32)
            && (note - current).abs() < 0.5 + HYSTERESIS
        {
            return current;
        }
        let centre = note.round() as i32;
        (centre - 2..=centre + 2)
            .filter(|&n| allowed(n))
            .min_by(|a, b| {
                (*a as f32 - note)
                    .abs()
                    .total_cmp(&(*b as f32 - note).abs())
            })
            .map_or(note, |n| n as f32)
    }

    fn on_frame(&mut self) {
        let detected = self.detect();
        let voiced = if let Some(hz) = detected {
            let note = 69.0 + 12.0 * (hz / 440.0).log2();
            let target = self.target(note);
            let wanted = target - note;
            let speed = self.values[SPEED_MS as usize];
            if self.target_note.is_none() || speed < 0.5 {
                self.correction = wanted;
            } else {
                let hop = self.detector.hop() as f32;
                let coefficient = (-hop / (speed * 0.001 * self.sample_rate)).exp();
                self.correction = wanted + coefficient * (self.correction - wanted);
            }
            self.target_note = Some(target);
            let amount = self.values[AMOUNT as usize];
            let ratio = semitones_to_ratio(self.correction * amount);
            for shifter in &mut self.shifters {
                shifter.set_voice(0, ratio, self.formant);
            }
            self.readings = [hz, self.correction * amount * 100.0];
            1.0
        } else {
            self.target_note = None;
            for shifter in &mut self.shifters {
                shifter.set_voice(0, 1.0, self.formant);
            }
            self.readings = [0.0, 0.0];
            0.0
        };
        self.gates.copy_within(1.., 0);
        self.gates[GATE_DELAY] = voiced;
        self.gate.set(self.gates[0]);
    }
}

impl Default for Tuner {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Tuner {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.shifters = [
            PitchShifter::new(sample_rate, 1),
            PitchShifter::new(sample_rate, 1),
        ];
        for line in &mut self.dry {
            line.allocate(self.shifters[0].latency() + 1);
        }
        self.detector = Stft::new(sample_rate);
        let size = self.detector.size();
        self.time = vec![0.0; size];
        self.spectrum_a = self.detector.spectrum();
        self.spectrum_b = self.detector.spectrum();
        self.correlation = vec![0.0; size];
        self.energy = vec![0.0; size + 1];
        self.normalized = vec![0.0; size / 2 + 1];
        self.gate.prepare(sample_rate);
        self.formant = semitones_to_ratio(self.values[FORMANT as usize]);
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let latency = self.shifters[0].latency() as f32;
        for index in 0..block.frames() {
            let left = block.left[index];
            let right = block.right[index];
            // The detector frames in step with the shifters: the ratio found
            // on a frame is the one that frame is synthesized with.
            if self.detector.push(0.5 * (left + right)) {
                self.on_frame();
            }
            let gate = self.gate.tick();
            for (channel, input) in [left, right].into_iter().enumerate() {
                let dry = self.dry[channel].read(latency);
                self.dry[channel].push(input);
                let mut wet = [0.0];
                self.shifters[channel].push(input, &mut wet);
                let output = dry + (wet[0] - dry) * gate;
                if channel == 0 {
                    block.left[index] = output;
                } else {
                    block.right[index] = output;
                }
            }
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
            self.formant = semitones_to_ratio(self.values[FORMANT as usize]);
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn latency_frames(&self) -> u32 {
        self.shifters[0].latency() as u32
    }

    fn tail_frames(&self) -> u32 {
        self.shifters[0].size() as u32
    }

    fn reset(&mut self) {
        for shifter in &mut self.shifters {
            shifter.reset();
            shifter.set_voice(0, 1.0, self.formant);
        }
        for line in &mut self.dry {
            line.clear();
        }
        self.detector.reset();
        self.target_note = None;
        self.correction = 0.0;
        self.gates = [0.0; GATE_DELAY + 1];
        self.gate.snap(0.0);
        self.readings = [0.0; 2];
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
