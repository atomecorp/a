// Saturator: an analogue character pushed by its drive. Each character has
// its own curve and its own emphasis around it (what the curve hears first,
// what is given back after), so tape, tube, transformer and fuzz differ in
// which frequencies saturate, not only in how. The curve runs at twice the
// rate between half-band filters (`oversample`), so its harmonics do not fold
// back; the dry signal is delayed by the same latency, so a blend never combs.

use crate::biquad::{Coefficients, Section, Shape};
use crate::delay::DelayLine;
use crate::oversample::{HalfBand2x, LATENCY_FRAMES};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Unit, db_to_amplitude};

pub const MODE: u32 = 0;
pub const DRIVE_DB: u32 = 1;
pub const TONE: u32 = 2;
pub const MIX: u32 = 3;
pub const OUTPUT_DB: u32 = 4;
pub const PARAMS: [ParamSpec; 5] = [
    ParamSpec::choice(MODE, "mode", &["tape", "tube", "transformer", "fuzz"], 0),
    ParamSpec::new(DRIVE_DB, "drive_db", 0.0, 48.0, 12.0, Unit::Decibels),
    // Tilt around 1 kHz: −1 darker, +1 brighter (±6 dB at the ends).
    ParamSpec::new(TONE, "tone", -1.0, 1.0, 0.0, Unit::Plain),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::new(OUTPUT_DB, "output_db", -24.0, 6.0, 0.0, Unit::Decibels),
];

// The level that keeps its loudness whatever the drive (−12 dBFS).
const REFERENCE: f32 = 0.25;
const TUBE_BIAS: f32 = 0.34;
const TILT_HZ: f32 = 1000.0;
const TILT_DB: f32 = 6.0;
const DC_HZ: f32 = 5.0;
// The fuzz gate opens above −55 dB and closes under −61 dB.
const GATE_OPEN: f32 = 0.0018;
const GATE_CLOSE: f32 = 0.0009;
const GATE_RELEASE_MS: f32 = 21.0;
const GATE_MOTION_MS: f32 = 5.0;
const SWITCH_MS: f32 = 13.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Character {
    Tape,
    Tube,
    Transformer,
    Fuzz,
}

const CHARACTERS: [Character; 4] = [
    Character::Tape,
    Character::Tube,
    Character::Transformer,
    Character::Fuzz,
];

impl Character {
    // The transfer curve, at twice the rate.
    #[inline]
    fn curve(self, x: f32) -> f32 {
        match self {
            // Soft compression, symmetric: odd harmonics, a rounded top.
            Self::Tape => x.tanh(),
            // A biased triode: the two half-waves bend differently, even harmonics.
            Self::Tube => (x + TUBE_BIAS).tanh() - TUBE_BIAS.tanh(),
            // An iron core: a gentler knee, reached mostly by the lows (emphasis).
            Self::Transformer => x / (1.0 + x * x).sqrt(),
            // Hard and a little lopsided: squares the wave.
            Self::Fuzz => x.clamp(-0.8, 1.0),
        }
    }

    // Average gain of the curve at an amplitude, both half-waves together.
    fn gain_at(self, amplitude: f32) -> f32 {
        ((self.curve(amplitude) - self.curve(-amplitude)) * 0.5 / amplitude).max(1.0e-3)
    }

    // What the curve hears first, what is given back after, and a last
    // band limit: (shape, frequency, q, gain dB) each.
    fn emphasis(self) -> [(Shape, f32, f32, f32); 3] {
        match self {
            // Treble saturates first and comes back lower: the tape's HF loss.
            Self::Tape => [
                (Shape::HighShelf, 3000.0, 0.707, 6.0),
                (Shape::HighShelf, 3000.0, 0.707, -9.0),
                (Shape::LowPass, 13000.0, 0.707, 0.0),
            ],
            Self::Tube => [
                (Shape::HighPass, 21.0, 0.707, 0.0),
                (Shape::Bell, 2000.0, 0.707, 0.0),
                (Shape::LowPass, 15000.0, 0.707, 0.0),
            ],
            // Lows hit the core 9 dB harder and are given back as much.
            Self::Transformer => [
                (Shape::LowShelf, 144.0, 0.707, 9.0),
                (Shape::LowShelf, 144.0, 0.707, -9.0),
                (Shape::LowPass, 18000.0, 0.707, 0.0),
            ],
            // A thin input and a tamed fizz.
            Self::Fuzz => [
                (Shape::HighPass, 144.0, 0.707, 0.0),
                (Shape::Bell, 800.0, 0.7, 3.0),
                (Shape::LowPass, 5000.0, 0.707, 0.0),
            ],
        }
    }
}

#[derive(Clone, Copy, Default)]
struct ChannelState {
    filters: [Section; 3],
    dc_input: f32,
    dc_output: f32,
    tilt_low: f32,
}

pub struct Saturator {
    sample_rate: f32,
    character: Character,
    next_character: Character,
    fade: f32,
    fade_step: f32,
    drive_db: f32,
    drive: Smoothed,
    compensation: Smoothed,
    tone: Smoothed,
    mix: Smoothed,
    output: Smoothed,
    designs: [[Coefficients; 3]; 4],
    dc: f32,
    tilt: f32,
    gate_release: f32,
    gate_motion: f32,
    gate_envelope: f32,
    gate_open: bool,
    gate: f32,
    oversamplers: [HalfBand2x; 2],
    dry: [DelayLine; 2],
    channels: [ChannelState; 2],
}

impl Saturator {
    pub fn new() -> Self {
        let drive_db = PARAMS[1].default;
        let mut saturator = Self {
            sample_rate: 48000.0,
            character: Character::Tape,
            next_character: Character::Tape,
            fade: 1.0,
            fade_step: 1.0,
            drive_db,
            drive: Smoothed::new(db_to_amplitude(drive_db), 20.0),
            compensation: Smoothed::new(1.0, 20.0),
            tone: Smoothed::new(PARAMS[2].default, 20.0),
            mix: Smoothed::new(PARAMS[3].default, 20.0),
            output: Smoothed::new(db_to_amplitude(PARAMS[4].default), 20.0),
            designs: [[Coefficients::default(); 3]; 4],
            dc: 1.0,
            tilt: 0.0,
            gate_release: 0.0,
            gate_motion: 0.0,
            gate_envelope: 0.0,
            gate_open: true,
            gate: 1.0,
            oversamplers: [HalfBand2x::new(); 2],
            dry: [DelayLine::new(), DelayLine::new()],
            channels: [ChannelState::default(); 2],
        };
        saturator.follow_drive();
        let compensation = saturator.compensation.target();
        saturator.compensation.snap(compensation);
        saturator
    }

    fn follow_drive(&mut self) {
        let drive = db_to_amplitude(self.drive_db);
        self.drive.set(drive);
        self.compensation
            .set(1.0 / (drive * self.next_character.gain_at(REFERENCE * drive)));
    }

    #[inline]
    fn follow_character(&mut self) -> f32 {
        if self.character != self.next_character {
            self.fade = (self.fade - self.fade_step).max(0.0);
            if self.fade == 0.0 {
                self.character = self.next_character;
                for channel in &mut self.channels {
                    channel.filters = Default::default();
                }
            }
        } else if self.fade < 1.0 {
            self.fade = (self.fade + self.fade_step).min(1.0);
        }
        self.fade
    }

    // The fuzz closes on silence, so its hiss does not stand in the pauses.
    #[inline]
    fn follow_gate(&mut self, level: f32) -> f32 {
        self.gate_envelope = level.max(self.gate_envelope * self.gate_release);
        if self.gate_open && self.gate_envelope < GATE_CLOSE {
            self.gate_open = false;
        } else if !self.gate_open && self.gate_envelope > GATE_OPEN {
            self.gate_open = true;
        }
        let target = if self.gate_open { 1.0 } else { 0.0 };
        self.gate += self.gate_motion * (target - self.gate);
        self.gate
    }
}

impl Default for Saturator {
    fn default() -> Self {
        Self::new()
    }
}

fn one_pole(sample_rate: f32, frequency: f32) -> f32 {
    1.0 - (-std::f32::consts::TAU * frequency / sample_rate).exp()
}

impl Processor for Saturator {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        for smoothed in [
            &mut self.drive,
            &mut self.compensation,
            &mut self.tone,
            &mut self.mix,
            &mut self.output,
        ] {
            smoothed.prepare(sample_rate);
        }
        for (design, character) in self.designs.iter_mut().zip(CHARACTERS) {
            for (coefficients, (shape, frequency, q, gain)) in
                design.iter_mut().zip(character.emphasis())
            {
                *coefficients = Coefficients::design(shape, sample_rate, frequency, q, gain);
            }
        }
        self.dc = 1.0 - std::f32::consts::TAU * DC_HZ / sample_rate;
        self.tilt = one_pole(sample_rate, TILT_HZ);
        self.gate_release = (-1.0 / (GATE_RELEASE_MS * 0.001 * sample_rate)).exp();
        self.gate_motion = one_pole(sample_rate, 1000.0 / GATE_MOTION_MS);
        self.fade_step = 1.0 / (SWITCH_MS * 0.001 * sample_rate);
        for line in &mut self.dry {
            line.allocate(LATENCY_FRAMES as usize + 1);
        }
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let latency = LATENCY_FRAMES as f32;
        for index in 0..block.frames() {
            let fade = self.follow_character();
            let character = self.character;
            let design = self.designs[character as usize];
            let drive = self.drive.tick();
            let compensation = self.compensation.tick();
            let high = db_to_amplitude(self.tone.tick() * TILT_DB);
            let low = 1.0 / high;
            let mix = self.mix.tick();
            let output = self.output.tick();
            let (input_left, input_right) = (block.left[index], block.right[index]);
            let gate = if character == Character::Fuzz {
                self.follow_gate(input_left.abs().max(input_right.abs()))
            } else {
                1.0
            };
            for (channel, sample) in [&mut block.left[index], &mut block.right[index]]
                .into_iter()
                .enumerate()
            {
                let state = &mut self.channels[channel];
                let dry = self.dry[channel].read(latency);
                self.dry[channel].push(*sample);
                let heard = state.filters[0].tick(&design[0], *sample) * drive;
                let [even, odd] = self.oversamplers[channel].up(heard);
                let bent =
                    self.oversamplers[channel].down([character.curve(even), character.curve(odd)]);
                let given = state.filters[1].tick(&design[1], bent);
                let given = state.filters[2].tick(&design[2], given);
                state.dc_output = given - state.dc_input + self.dc * state.dc_output;
                state.dc_input = given;
                let wet = state.dc_output * compensation * gate;
                state.tilt_low += self.tilt * (wet - state.tilt_low);
                let wet = state.tilt_low * low + (wet - state.tilt_low) * high;
                *sample = (dry * (1.0 - mix) + wet * mix * fade) * output;
            }
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            MODE => {
                self.next_character = CHARACTERS[spec.index(value)];
                self.follow_drive();
            }
            DRIVE_DB => {
                self.drive_db = value;
                self.follow_drive();
            }
            TONE => self.tone.set(value),
            MIX => self.mix.set(value),
            OUTPUT_DB => self.output.set(db_to_amplitude(value)),
            _ => {}
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn latency_frames(&self) -> u32 {
        LATENCY_FRAMES
    }

    fn reset(&mut self) {
        for smoothed in [
            &mut self.drive,
            &mut self.compensation,
            &mut self.tone,
            &mut self.mix,
            &mut self.output,
        ] {
            smoothed.settle();
        }
        self.character = self.next_character;
        self.fade = 1.0;
        self.gate_envelope = 0.0;
        self.gate_open = true;
        self.gate = 1.0;
        for oversampler in &mut self.oversamplers {
            oversampler.reset();
        }
        for line in &mut self.dry {
            line.clear();
        }
        self.channels = [ChannelState::default(); 2];
    }
}
