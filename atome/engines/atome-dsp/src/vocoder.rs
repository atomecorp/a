// Channel vocoder: the block is the modulator (a voice); its band envelopes
// shape a carrier — the sidechain key (a track), a built-in rich synth or
// white noise (a whisper). Each carrier band is normalized by its own
// envelope, so the output follows the voice's spectrum whatever the carrier's.

use crate::biquad::{Coefficients, Section, Shape};
use crate::dynamics::time_coefficient;
use crate::oscillator::{self, Oscillator, Waveform};
use crate::{KeyBlock, ParamSpec, Processor, Smoothed, StereoBlock, Unit};

pub const CARRIER: u32 = 0;
pub const PITCH: u32 = 1;
pub const BANDS: u32 = 2;
pub const FORMANT: u32 = 3;
pub const ATTACK_MS: u32 = 4;
pub const RELEASE_MS: u32 = 5;
pub const SIBILANCE: u32 = 6;
pub const DRY: u32 = 7;
pub const MIX: u32 = 8;
pub const PARAMS: [ParamSpec; 9] = [
    ParamSpec::choice(CARRIER, "carrier", &["track", "internal", "noise"], 1),
    // A MIDI note: 48 is C3; the host may move it live from a keyboard.
    ParamSpec::new(PITCH, "pitch", 24.0, 96.0, 48.0, Unit::Count),
    ParamSpec::new(BANDS, "bands", 8.0, MAX_BANDS as f32, 21.0, Unit::Count),
    ParamSpec::new(FORMANT, "formant", -12.0, 12.0, 0.0, Unit::Semitones),
    ParamSpec::new(ATTACK_MS, "attack_ms", 0.5, 100.0, 5.0, Unit::Milliseconds),
    ParamSpec::new(
        RELEASE_MS,
        "release_ms",
        5.0,
        1000.0,
        55.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(SIBILANCE, "sibilance", 0.0, 1.0, 0.34, Unit::Percent),
    ParamSpec::new(DRY, "dry", 0.0, 1.0, 0.0, Unit::Percent),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];

pub const MAX_BANDS: usize = 34;
const LOWEST_HZ: f32 = 100.0;
const HIGHEST_HZ: f32 = 8000.0;
const SIBILANCE_HZ: f32 = 5000.0;
// Detune of the internal synth's two saws, in cents.
const DETUNE_CENTS: f32 = 8.0;
// Carrier bands follow their own level quickly and evenly.
const CARRIER_ATTACK_MS: f32 = 3.0;
const CARRIER_RELEASE_MS: f32 = 34.0;
const FORMANT_REDESIGN_FRAMES: usize = 32;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Carrier {
    Track,
    Internal,
    Noise,
}

#[derive(Clone, Copy, Default)]
struct Band {
    analysis: Coefficients,
    synthesis: Coefficients,
    modulator: [Section; 2],
    carrier: [Section; 2],
    modulator_level: f32,
    carrier_level: f32,
}

pub struct Vocoder {
    sample_rate: f32,
    values: [f32; 9],
    carrier: Carrier,
    bands: [Band; MAX_BANDS],
    count: usize,
    centres: [f32; MAX_BANDS],
    q: f32,
    formant: Smoothed,
    sibilance: Smoothed,
    dry: Smoothed,
    mix: Smoothed,
    attack: f32,
    release: f32,
    carrier_attack: f32,
    carrier_release: f32,
    high_pass: Coefficients,
    sibilant: [Section; 2],
    sibilant_level: f32,
    voice_level: f32,
    carrier_total: f32,
    oscillators: [Oscillator; 3],
    noise: u32,
    synth: Vec<f32>,
    scratch: [Vec<f32>; 2],
}

impl Vocoder {
    pub fn new() -> Self {
        let mut vocoder = Self {
            sample_rate: 48000.0,
            values: PARAMS.map(|spec| spec.default),
            carrier: Carrier::Internal,
            bands: [Band::default(); MAX_BANDS],
            count: 21,
            centres: [0.0; MAX_BANDS],
            q: 1.0,
            formant: Smoothed::new(0.0, 34.0),
            sibilance: Smoothed::new(0.34, 21.0),
            dry: Smoothed::new(0.0, 21.0),
            mix: Smoothed::new(1.0, 21.0),
            attack: 0.0,
            release: 0.0,
            carrier_attack: 0.0,
            carrier_release: 0.0,
            high_pass: Coefficients::default(),
            sibilant: [Section::default(); 2],
            sibilant_level: 0.0,
            voice_level: 0.0,
            carrier_total: 0.0,
            oscillators: [
                Oscillator::new(Waveform::Saw, 130.8),
                Oscillator::new(Waveform::Saw, 130.8),
                Oscillator::new(Waveform::Square, 130.8),
            ],
            noise: 0x9E37_79B9,
            synth: Vec::new(),
            scratch: [Vec::new(), Vec::new()],
        };
        vocoder.prepare(48000.0, 512);
        vocoder
    }

    fn apply(&mut self) {
        let v = self.values;
        self.carrier = match PARAMS[CARRIER as usize].index(v[CARRIER as usize]) {
            0 => Carrier::Track,
            1 => Carrier::Internal,
            _ => Carrier::Noise,
        };
        let count = v[BANDS as usize].round() as usize;
        if count != self.count {
            self.count = count;
            self.layout();
        }
        self.formant.set(v[FORMANT as usize]);
        self.sibilance.set(v[SIBILANCE as usize]);
        self.dry.set(v[DRY as usize]);
        self.mix.set(v[MIX as usize]);
        self.attack = time_coefficient(v[ATTACK_MS as usize], self.sample_rate);
        self.release = time_coefficient(v[RELEASE_MS as usize], self.sample_rate);
        let root = 440.0 * ((v[PITCH as usize] - 69.0) / 12.0).exp2();
        let detune = (DETUNE_CENTS / 1200.0).exp2();
        for (oscillator, hz) in
            self.oscillators
                .iter_mut()
                .zip([root * detune, root / detune, root])
        {
            oscillator.set_param(oscillator::FREQUENCY, hz);
        }
    }

    // Log-spaced centres; a band's 4th-order pass spans its share of the range.
    fn layout(&mut self) {
        let top = HIGHEST_HZ.min(self.sample_rate * 0.4);
        let count = self.count;
        let step = (top / LOWEST_HZ).powf(1.0 / (count - 1) as f32);
        for (index, centre) in self.centres.iter_mut().enumerate().take(count) {
            *centre = LOWEST_HZ * step.powi(index as i32);
        }
        let octaves = step.log2() * 1.25;
        self.q = 1.0 / (2.0 * (std::f32::consts::LN_2 * 0.5 * octaves).sinh());
        for index in 0..count {
            self.bands[index].analysis = Coefficients::design(
                Shape::BandPass,
                self.sample_rate,
                self.centres[index],
                self.q,
                0.0,
            );
        }
        let formant = self.formant.target();
        self.design_carrier(formant);
    }

    fn design_carrier(&mut self, formant: f32) {
        let ratio = (formant / 12.0).exp2();
        let top = self.sample_rate * 0.45;
        for index in 0..self.count {
            let centre = (self.centres[index] * ratio).min(top);
            self.bands[index].synthesis =
                Coefficients::design(Shape::BandPass, self.sample_rate, centre, self.q, 0.0);
        }
    }

    #[inline]
    fn white(&mut self) -> f32 {
        // xorshift32: cheap, allocation-free white noise in [-1, 1).
        let mut x = self.noise;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.noise = x;
        (x as f32 / u32::MAX as f32) * 2.0 - 1.0
    }

    // Fills `synth[..frames]` with the internal carrier.
    fn render_synth(&mut self, frames: usize) {
        self.synth[..frames].fill(0.0);
        let [left, right] = &mut self.scratch;
        for (oscillator, gain) in self.oscillators.iter_mut().zip([0.34, 0.34, 0.21]) {
            oscillator.process(&mut StereoBlock::new(
                &mut left[..frames],
                &mut right[..frames],
            ));
            for (synth, sample) in self.synth.iter_mut().zip(left.iter()).take(frames) {
                *synth += sample * gain;
            }
        }
    }

    fn run(&mut self, block: &mut StereoBlock, key: Option<KeyBlock>) {
        let capacity = self.synth.len();
        let mut start = 0;
        while start < block.frames() {
            let end = (start + capacity).min(block.frames());
            self.run_segment(block, key, start, end);
            start = end;
        }
    }

    fn run_segment(
        &mut self,
        block: &mut StereoBlock,
        key: Option<KeyBlock>,
        start: usize,
        end: usize,
    ) {
        if self.carrier == Carrier::Internal {
            self.render_synth(end - start);
        }
        let floor_scale = 0.03 / (self.count as f32).sqrt();
        let voice_attack = time_coefficient(1.0, self.sample_rate);
        let voice_release = time_coefficient(21.0, self.sample_rate);
        for index in start..end {
            if (index - start).is_multiple_of(FORMANT_REDESIGN_FRAMES) && !self.formant.is_settled()
            {
                let mut formant = 0.0;
                for _ in 0..FORMANT_REDESIGN_FRAMES {
                    formant = self.formant.tick();
                }
                self.design_carrier(formant);
            }
            let left = block.left[index];
            let right = block.right[index];
            let voice = 0.5 * (left + right);
            let carrier = match self.carrier {
                Carrier::Track => key.map_or(0.0, |key| 0.5 * (key.left[index] + key.right[index])),
                Carrier::Internal => self.synth[index - start],
                Carrier::Noise => self.white() * 0.5,
            };
            self.carrier_total = follow(
                self.carrier_total,
                carrier.abs(),
                self.carrier_attack,
                self.carrier_release,
            );
            let floor = 1.0e-6 + self.carrier_total * floor_scale;
            let mut wet = 0.0;
            for band in &mut self.bands[..self.count] {
                let m = cascade(&mut band.modulator, &band.analysis, voice);
                let c = cascade(&mut band.carrier, &band.synthesis, carrier);
                band.modulator_level =
                    follow(band.modulator_level, m.abs(), self.attack, self.release);
                band.carrier_level = follow(
                    band.carrier_level,
                    c.abs(),
                    self.carrier_attack,
                    self.carrier_release,
                );
                wet += c * band.modulator_level / band.carrier_level.max(floor);
            }
            // Consonants: the voice's own top band, opened when it dominates.
            let hiss = cascade(&mut self.sibilant, &self.high_pass, voice);
            self.sibilant_level =
                follow(self.sibilant_level, hiss.abs(), voice_attack, voice_release);
            self.voice_level = follow(self.voice_level, voice.abs(), voice_attack, voice_release);
            let unvoiced =
                ((self.sibilant_level / (self.voice_level + 1.0e-9) - 0.1) * 2.5).clamp(0.0, 1.0);
            wet += hiss * self.sibilance.tick() * unvoiced;
            wet += voice * self.dry.tick();
            let mix = self.mix.tick();
            block.left[index] = left + (wet - left) * mix;
            block.right[index] = right + (wet - right) * mix;
        }
    }
}

// Two identical sections in series: the 4th-order response.
#[inline]
fn cascade(sections: &mut [Section; 2], coefficients: &Coefficients, input: f32) -> f32 {
    let [first, second] = sections;
    second.tick(coefficients, first.tick(coefficients, input))
}

#[inline]
fn follow(level: f32, input: f32, attack: f32, release: f32) -> f32 {
    let coefficient = if input > level { attack } else { release };
    // The tiny offset keeps a decaying envelope out of denormal range.
    input + coefficient * (level - input) + 1.0e-20
}

impl Default for Vocoder {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Vocoder {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        self.sample_rate = sample_rate;
        let capacity = max_block.max(64);
        self.synth = vec![0.0; capacity];
        self.scratch = [vec![0.0; capacity], vec![0.0; capacity]];
        for oscillator in &mut self.oscillators {
            oscillator.prepare(sample_rate, capacity);
            oscillator.set_param(oscillator::LEVEL_DB, 0.0);
        }
        for smoothed in [
            &mut self.formant,
            &mut self.sibilance,
            &mut self.dry,
            &mut self.mix,
        ] {
            smoothed.prepare(sample_rate);
        }
        // The formant advances once per redesign, hence the slower rate.
        self.formant
            .prepare(sample_rate / FORMANT_REDESIGN_FRAMES as f32);
        self.carrier_attack = time_coefficient(CARRIER_ATTACK_MS, sample_rate);
        self.carrier_release = time_coefficient(CARRIER_RELEASE_MS, sample_rate);
        self.high_pass = Coefficients::design(
            Shape::HighPass,
            sample_rate,
            SIBILANCE_HZ.min(sample_rate * 0.4),
            0.707,
            0.0,
        );
        self.apply();
        self.layout();
        self.reset();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        self.run(block, None);
    }

    fn set_param(&mut self, id: u32, value: f32) {
        if let Some(spec) = PARAMS.get(id as usize) {
            self.values[id as usize] = spec.clamp(value);
            self.apply();
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn tail_frames(&self) -> u32 {
        (self.values[RELEASE_MS as usize] * 0.005 * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        for smoothed in [
            &mut self.formant,
            &mut self.sibilance,
            &mut self.dry,
            &mut self.mix,
        ] {
            smoothed.settle();
        }
        self.design_carrier(self.formant.target());
        for band in &mut self.bands {
            band.modulator = [Section::default(); 2];
            band.carrier = [Section::default(); 2];
            band.modulator_level = 0.0;
            band.carrier_level = 0.0;
        }
        self.sibilant = [Section::default(); 2];
        self.sibilant_level = 0.0;
        self.voice_level = 0.0;
        self.carrier_total = 0.0;
        for oscillator in &mut self.oscillators {
            oscillator.reset();
        }
    }

    // Wired with a key, the key is the carrier when `carrier` is « track ».
    fn takes_key(&self) -> bool {
        true
    }

    fn process_keyed(&mut self, block: &mut StereoBlock, key: KeyBlock) {
        self.run(block, Some(key));
    }
}
