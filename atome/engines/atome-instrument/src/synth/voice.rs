// One voice of a synth: its own copy of every brick of the patch and its own
// signal per brick, one value per frame for at most one control step. The
// atome-dsp bricks (oscillator, noise, envelope, LFO, SVF) run here unchanged,
// fed per frame where the route is audio-rate (pitch, FM, cutoff, gain, audio)
// and once a step elsewhere (level, rate, resonance). Built off the audio
// thread; rendering never allocates.

use super::patch::{
    AD_ATTACK_MS, AD_CURVE, AD_DECAY_MS, BrickKind, DRIVE_DB, DRIVE_MIX, INPUTS, Input,
    LFO_DELAY_MS, LFO_DIVISION, LFO_DIVISIONS, LFO_SYNC, OSC_DETUNE_CENTS, OSC_LEVEL_DB, OSC_PULSE,
    OSC_SPREAD_CENTS, OSC_TRANSPOSE, OSC_UNISON, OSC_WAVEFORM, OSC_WIDTH, Patch, RANDOM_RATE_HZ,
    RANDOM_SMOOTH, Route, SLEW_FALL_MS, SLEW_RISE_MS, SVF_SLOPE, UNISON_MAX, VCA_LEVEL,
};
use atome_dsp::control::{CONSTANT_VALUE, LFO_RATE_HZ, LfoSource};
use atome_dsp::envelope::{self, Envelope};
use atome_dsp::noise::{self, Noise};
use atome_dsp::oscillator::{self, Oscillator, SYNC_TRIGGER, Waveform};
use atome_dsp::svf::{self, Svf};
use atome_dsp::{ParamBuffer, Processor, StereoBlock, db_to_amplitude};

// The longest piece a voice renders at once: one control step.
pub const STEP: usize = 32;
// A stolen voice fades out over this long.
const CHOKE_MS: f32 = 3.0;

// The routes reaching each brick, and which of its inputs any route reaches.
pub(crate) struct Wiring {
    routes_to: Vec<Vec<Route>>,
    reached: Vec<[bool; INPUTS]>,
}

impl Wiring {
    pub(crate) fn new(patch: &Patch) -> Self {
        let mut routes_to = vec![Vec::new(); patch.bricks.len()];
        let mut reached = vec![[false; INPUTS]; patch.bricks.len()];
        for route in &patch.routes {
            routes_to[route.to].push(*route);
            reached[route.to][route.input.index()] = true;
        }
        Self { routes_to, reached }
    }
}

// What every voice reads for the piece it renders.
pub(crate) struct Moment {
    // Semitones from A4 added to the note (bend, tune).
    pub offset: f32,
    pub wheel: f32,
    pub pressure: f32,
    pub bpm: f32,
}

// A random draw in −1..1 (xorshift): the same seed gives the same draws, so a replay sounds the same.
fn draw(seed: &mut u32) -> f32 {
    *seed ^= *seed << 13;
    *seed ^= *seed >> 17;
    *seed ^= *seed << 5;
    (*seed as f32 / u32::MAX as f32) * 2.0 - 1.0
}

// A one-pole step towards a target in `ms` milliseconds.
fn coefficient(ms: f32, sample_rate: f32) -> f32 {
    1.0 - (-1.0 / (ms.max(0.01) * 0.001 * sample_rate)).exp()
}

const WAVES: [Waveform; 4] = [
    Waveform::Sine,
    Waveform::Saw,
    Waveform::Square,
    Waveform::Triangle,
];

// One brick of one voice: its values (every parameter of its kind, in its ids' order) and its state.
enum Unit {
    // Every oscillator of the unison is made once; `unison` of them sound.
    Oscillator {
        dsp: Vec<Oscillator>,
        values: [f32; 7],
        last_sync: f32,
    },
    Noise {
        dsp: Noise,
        level_db: f32,
    },
    Envelope(Envelope),
    Lfo {
        dsp: LfoSource,
        values: [f32; 6],
        played: u32,
    },
    Svf {
        stages: [Svf; 2],
        values: [f32; 4],
    },
    Vca {
        level: f32,
    },
    Ad {
        values: [f32; 3],
        played: u32,
    },
    Drive {
        values: [f32; 2],
    },
    Random {
        values: [f32; 2],
        phase: f32,
        target: f32,
        value: f32,
        seed: u32,
    },
    Slew {
        values: [f32; 2],
        value: f32,
    },
    Velocity,
    Note,
    Wheel,
    Pressure,
    Constant(f32),
}

fn configured<P: Processor>(mut dsp: P, values: &[(u32, f32)], sample_rate: f32) -> P {
    dsp.prepare(sample_rate, STEP);
    for (id, value) in values {
        dsp.set_param(*id, *value);
    }
    dsp.reset();
    dsp
}

fn copied<const N: usize>(values: &[f32]) -> [f32; N] {
    let mut out = [0.0; N];
    out.copy_from_slice(&values[..N]);
    out
}

impl Unit {
    fn new(kind: BrickKind, values: &[f32], sample_rate: f32) -> Self {
        let all: Vec<(u32, f32)> = values
            .iter()
            .enumerate()
            .map(|(id, v)| (id as u32, *v))
            .collect();
        match kind {
            BrickKind::Oscillator => Self::Oscillator {
                dsp: (0..UNISON_MAX)
                    .map(|_| configured(Oscillator::new(Waveform::Sine, 440.0), &[], sample_rate))
                    .collect(),
                values: copied(values),
                last_sync: 0.0,
            },
            BrickKind::Noise => Self::Noise {
                dsp: configured(Noise::new(), &all, sample_rate),
                level_db: values[noise::LEVEL_DB as usize],
            },
            BrickKind::Envelope => Self::Envelope(configured(Envelope::new(), &all, sample_rate)),
            BrickKind::Lfo => Self::Lfo {
                dsp: configured(LfoSource::new(), &all[..3], sample_rate),
                values: copied(values),
                played: 0,
            },
            BrickKind::Svf => Self::Svf {
                stages: [
                    configured(Svf::new(), &all[..3], sample_rate),
                    configured(Svf::new(), &all[..3], sample_rate),
                ],
                values: copied(values),
            },
            BrickKind::Vca => Self::Vca {
                level: values[VCA_LEVEL as usize],
            },
            BrickKind::Ad => Self::Ad {
                values: copied(values),
                played: 0,
            },
            BrickKind::Drive => Self::Drive {
                values: copied(values),
            },
            BrickKind::Random => Self::Random {
                values: copied(values),
                phase: 0.0,
                target: 0.0,
                value: 0.0,
                seed: 1,
            },
            BrickKind::Slew => Self::Slew {
                values: copied(values),
                value: 0.0,
            },
            BrickKind::Velocity => Self::Velocity,
            BrickKind::Note => Self::Note,
            BrickKind::Wheel => Self::Wheel,
            BrickKind::Pressure => Self::Pressure,
            BrickKind::Constant => Self::Constant(values[CONSTANT_VALUE as usize]),
        }
    }

    // A new note: every state from its start; `seed` the voice's own draws.
    fn reset(&mut self, seed: u32) {
        match self {
            Self::Oscillator { dsp, last_sync, .. } => {
                dsp.iter_mut().for_each(Processor::reset);
                *last_sync = 0.0;
            }
            Self::Noise { dsp, .. } => dsp.reset(),
            Self::Envelope(dsp) => dsp.reset(),
            Self::Lfo { dsp, played, .. } => {
                dsp.reset();
                *played = 0;
            }
            Self::Svf { stages, .. } => stages.iter_mut().for_each(Processor::reset),
            Self::Ad { played, .. } => *played = 0,
            Self::Random {
                phase,
                target,
                value,
                seed: own,
                ..
            } => {
                *own = seed.max(1);
                *phase = 0.0;
                *target = draw(own);
                *value = *target;
            }
            Self::Slew { value, .. } => *value = 0.0,
            _ => {}
        }
    }

    // One parameter set while the voice plays (already clamped by its spec).
    fn set(&mut self, id: u32, value: f32) {
        let at = id as usize;
        match self {
            Self::Oscillator { values, .. } => values[at] = value,
            Self::Noise { dsp, level_db } => {
                if id == noise::LEVEL_DB {
                    *level_db = value;
                }
                dsp.set_param(id, value);
            }
            Self::Envelope(dsp) => dsp.set_param(id, value),
            Self::Lfo { dsp, values, .. } => {
                values[at] = value;
                if id < 3 {
                    dsp.set_param(id, value);
                }
            }
            Self::Svf { stages, values } => {
                values[at] = value;
                if id < 3 {
                    stages
                        .iter_mut()
                        .for_each(|stage| stage.set_param(id, value));
                }
            }
            Self::Vca { level } => *level = value,
            Self::Ad { values, .. } => values[at] = value,
            Self::Drive { values } => values[at] = value,
            Self::Random { values, .. } => values[at] = value,
            Self::Slew { values, .. } => values[at] = value,
            Self::Constant(constant) => *constant = value,
            Self::Velocity | Self::Note | Self::Wheel | Self::Pressure => {}
        }
    }
}

pub(crate) struct SynthVoice {
    units: Vec<Unit>,
    signals: Vec<[f32; STEP]>,
    pub(crate) active: bool,
    pub(crate) key_down: bool,
    pub(crate) sustained: bool,
    pub(crate) started_at: u64,
    pub(crate) note: u8,
    velocity: f32,
    released: bool,
    choke: u32,
    choke_frames: u32,
    sample_rate: f32,
}

impl SynthVoice {
    pub(crate) fn new(patch: &Patch, sample_rate: f32) -> Self {
        Self {
            units: patch
                .bricks
                .iter()
                .map(|brick| Unit::new(brick.kind, &brick.values, sample_rate))
                .collect(),
            signals: vec![[0.0; STEP]; patch.bricks.len()],
            active: false,
            key_down: false,
            sustained: false,
            started_at: 0,
            note: 0,
            velocity: 0.0,
            released: false,
            choke: 0,
            choke_frames: ((CHOKE_MS * 0.001 * sample_rate) as u32).max(1),
            sample_rate,
        }
    }

    pub(crate) fn choking(&self) -> bool {
        self.choke > 0
    }

    pub(crate) fn start(&mut self, note: u8, velocity: f32, now: u64) {
        // The voice's draws follow its note and its start: a replay draws them again.
        let seed = (now as u32).wrapping_mul(2_654_435_761) ^ (u32::from(note) << 16) ^ 0x5bd1_e995;
        for (index, unit) in self.units.iter_mut().enumerate() {
            unit.reset(seed.wrapping_add(index as u32 * 7919));
            if let Unit::Envelope(dsp) = unit {
                dsp.set_param(envelope::GATE, 1.0);
            }
        }
        self.active = true;
        self.key_down = true;
        self.sustained = false;
        self.released = false;
        self.choke = 0;
        self.started_at = now;
        self.note = note;
        self.velocity = velocity;
    }

    // One parameter of a brick set while the voice plays (the synth's BrickParam).
    pub(crate) fn set(&mut self, brick: usize, id: u32, value: f32) {
        if let Some(unit) = self.units.get_mut(brick) {
            unit.set(id, value);
        }
    }

    pub(crate) fn release(&mut self) {
        self.released = true;
        self.sustained = false;
        for unit in &mut self.units {
            if let Unit::Envelope(dsp) = unit {
                dsp.set_param(envelope::GATE, 0.0);
            }
        }
    }

    pub(crate) fn choke(&mut self) {
        self.choke = self.choke_frames;
    }

    // Adds this voice's piece (at most STEP frames) into `out`.
    pub(crate) fn render(
        &mut self,
        wiring: &Wiring,
        output: usize,
        moment: &Moment,
        out: &mut [f32],
    ) {
        let len = out.len().min(STEP);
        let rate = self.sample_rate;
        let mut inputs = [[0.0f32; STEP]; INPUTS];
        let mut scratch = [0.0f32; STEP];
        let pitch = f32::from(self.note) - 69.0 + moment.offset;
        for index in 0..self.units.len() {
            let reached = &wiring.reached[index];
            for (input, used) in inputs.iter_mut().zip(reached.iter()) {
                if *used {
                    input[..len].fill(0.0);
                }
            }
            for route in &wiring.routes_to[index] {
                let source = &self.signals[route.from];
                let input = &mut inputs[route.input.index()];
                for (value, from) in input[..len].iter_mut().zip(source[..len].iter()) {
                    *value += route.depth * from;
                }
            }
            let has = |input: Input| reached[input.index()];
            let first = |input: Input| inputs[input.index()][0];
            let signal = &mut self.signals[index][..len];
            let scratch = &mut scratch[..len];
            match &mut self.units[index] {
                Unit::Oscillator {
                    dsp,
                    values,
                    last_sync,
                } => {
                    let value = |id: u32| values[id as usize];
                    let count = (value(OSC_UNISON).round() as usize).clamp(1, UNISON_MAX);
                    let wave = value(OSC_WAVEFORM).round() as usize;
                    let width = value(OSC_WIDTH)
                        + if has(Input::Width) {
                            first(Input::Width)
                        } else {
                            0.0
                        };
                    // The unison's oscillators share the level: together they sound as loud as one.
                    let level = value(OSC_LEVEL_DB)
                        + if has(Input::Level) {
                            first(Input::Level)
                        } else {
                            0.0
                        }
                        - 10.0 * (count as f32).log10();
                    // A rising crossing of zero of what reaches Sync starts the period again.
                    let mut triggers = [0.0f32; STEP];
                    if has(Input::Sync) {
                        for (trigger, now) in triggers[..len]
                            .iter_mut()
                            .zip(inputs[Input::Sync.index()][..len].iter())
                        {
                            *trigger = if *last_sync <= 0.0 && *now > 0.0 {
                                1.0
                            } else {
                                0.0
                            };
                            *last_sync = *now;
                        }
                    }
                    let base = pitch + value(OSC_TRANSPOSE) + value(OSC_DETUNE_CENTS) / 100.0;
                    let spread = value(OSC_SPREAD_CENTS) / 100.0;
                    let (bend, fm) = (&inputs[Input::Pitch.index()], &inputs[Input::Fm.index()]);
                    signal.fill(0.0);
                    for (voice, osc) in dsp.iter_mut().take(count).enumerate() {
                        match wave {
                            OSC_PULSE => osc.set_waveform(Waveform::Pulse),
                            index => osc.set_waveform(WAVES[index.min(WAVES.len() - 1)]),
                        }
                        osc.set_width(width);
                        osc.set_param(oscillator::LEVEL_DB, level);
                        // Spread evenly from −spread to +spread around the note.
                        let offset = match count {
                            1 => 0.0,
                            _ => spread * (2.0 * voice as f32 / (count - 1) as f32 - 1.0),
                        };
                        let mut hertz = [0.0f32; STEP];
                        for (k, value) in hertz[..len].iter_mut().enumerate() {
                            let semitones =
                                base + offset + if has(Input::Pitch) { bend[k] } else { 0.0 };
                            let ratio = if has(Input::Fm) { 1.0 + fm[k] } else { 1.0 };
                            *value = 440.0 * (semitones / 12.0).exp2() * ratio;
                        }
                        let mut left = [0.0f32; STEP];
                        let buffers = [
                            ParamBuffer {
                                id: oscillator::FREQUENCY,
                                values: &hertz[..len],
                            },
                            ParamBuffer {
                                id: SYNC_TRIGGER,
                                values: &triggers[..len],
                            },
                        ];
                        osc.process_modulated(
                            &mut StereoBlock::new(&mut left[..len], scratch),
                            &buffers,
                        );
                        for (sum, add) in signal.iter_mut().zip(left[..len].iter()) {
                            *sum += add;
                        }
                    }
                }
                Unit::Noise { dsp, level_db } => {
                    if has(Input::Level) {
                        dsp.set_param(noise::LEVEL_DB, *level_db + first(Input::Level));
                    }
                    dsp.process(&mut StereoBlock::new(signal, scratch));
                }
                Unit::Envelope(dsp) => {
                    signal.fill(1.0);
                    scratch.fill(0.0);
                    dsp.process(&mut StereoBlock::new(signal, scratch));
                }
                Unit::Lfo {
                    dsp,
                    values,
                    played,
                } => {
                    let value = |id: u32| values[id as usize];
                    // In tempo, a period lasts its division of beats at the host's tempo.
                    let own = match value(LFO_SYNC) >= 0.5 {
                        true => {
                            moment.bpm
                                / 60.0
                                / LFO_DIVISIONS[(value(LFO_DIVISION).round() as usize)
                                    .min(LFO_DIVISIONS.len() - 1)]
                        }
                        false => value(LFO_RATE_HZ),
                    };
                    let modulated = if has(Input::Rate) {
                        own * first(Input::Rate).exp2()
                    } else {
                        own
                    };
                    dsp.set_param(LFO_RATE_HZ, modulated);
                    dsp.process(&mut StereoBlock::new(signal, scratch));
                    signal.copy_from_slice(&dsp.control(0)[..len]);
                    // Its delay: it fades in over that long after the note.
                    let delay = value(LFO_DELAY_MS) * 0.001 * rate;
                    if value(LFO_DELAY_MS) > 1.0 {
                        for value in signal.iter_mut() {
                            *value *= (*played as f32 / delay).min(1.0);
                            *played = played.saturating_add(1);
                        }
                    }
                }
                Unit::Svf { stages, values } => {
                    let audio = &inputs[Input::Audio.index()][..len];
                    signal.copy_from_slice(audio);
                    scratch.copy_from_slice(audio);
                    let resonance = values[svf::RESONANCE as usize];
                    let cutoff_hz = values[svf::CUTOFF_HZ as usize];
                    let count = if values[SVF_SLOPE as usize] >= 0.5 {
                        2
                    } else {
                        1
                    };
                    let mut hertz = [0.0f32; STEP];
                    if has(Input::Cutoff) {
                        let spec = &svf::PARAMS[svf::CUTOFF_HZ as usize];
                        for (value, octave) in hertz[..len]
                            .iter_mut()
                            .zip(inputs[Input::Cutoff.index()].iter())
                        {
                            *value = spec.clamp(cutoff_hz * octave.exp2());
                        }
                    }
                    for stage in stages.iter_mut().take(count) {
                        if has(Input::Resonance) {
                            stage.set_param(svf::RESONANCE, resonance + first(Input::Resonance));
                        }
                        let mut block = StereoBlock::new(&mut *signal, &mut *scratch);
                        match has(Input::Cutoff) {
                            true => stage.process_modulated(
                                &mut block,
                                &[ParamBuffer {
                                    id: svf::CUTOFF_HZ,
                                    values: &hertz[..len],
                                }],
                            ),
                            false => stage.process(&mut block),
                        }
                    }
                }
                Unit::Vca { level } => {
                    let audio = &inputs[Input::Audio.index()];
                    let gain = &inputs[Input::Gain.index()];
                    // The gain that reaches it, times its own level (its level alone when nothing reaches it).
                    for (k, value) in signal.iter_mut().enumerate() {
                        *value = audio[k] * *level * if has(Input::Gain) { gain[k] } else { 1.0 };
                    }
                }
                Unit::Ad { values, played } => {
                    let attack = (values[AD_ATTACK_MS as usize] * 0.001 * rate).max(1.0);
                    let decay = (values[AD_DECAY_MS as usize] * 0.001 * rate).max(1.0);
                    // The curve bows the contour: straight at 0, fast to start and slow to end at 1.
                    let bow = 1.0 + 4.0 * values[AD_CURVE as usize];
                    for value in signal.iter_mut() {
                        let t = *played as f32;
                        *value = if t < attack {
                            1.0 - (1.0 - t / attack).powf(bow)
                        } else if t < attack + decay {
                            (1.0 - (t - attack) / decay).powf(bow)
                        } else {
                            0.0
                        };
                        *played = played.saturating_add(1);
                    }
                }
                Unit::Drive { values } => {
                    let audio = &inputs[Input::Audio.index()][..len];
                    let drive = values[DRIVE_DB as usize]
                        + if has(Input::Drive) {
                            first(Input::Drive)
                        } else {
                            0.0
                        };
                    let gain = db_to_amplitude(drive.max(0.0));
                    let mix = values[DRIVE_MIX as usize];
                    // A soft clip whose full scale stays full scale, mixed with the dry sound.
                    let norm = gain.tanh().max(f32::EPSILON);
                    for (value, dry) in signal.iter_mut().zip(audio.iter()) {
                        let wet = (dry * gain).tanh() / norm;
                        *value = dry + (wet - dry) * mix;
                    }
                }
                Unit::Random {
                    values,
                    phase,
                    target,
                    value,
                    seed,
                } => {
                    let own = values[RANDOM_RATE_HZ as usize];
                    let hertz = if has(Input::Rate) {
                        own * first(Input::Rate).exp2()
                    } else {
                        own
                    };
                    let step = hertz / rate;
                    let smooth = values[RANDOM_SMOOTH as usize];
                    let glide = match smooth > 0.0 {
                        true => coefficient(smooth * 1000.0 / hertz.max(0.01), rate),
                        false => 1.0,
                    };
                    for out in signal.iter_mut() {
                        *phase += step;
                        if *phase >= 1.0 {
                            *phase -= phase.floor();
                            *target = draw(seed);
                        }
                        *value += (*target - *value) * glide;
                        *out = *value;
                    }
                }
                Unit::Slew { values, value } => {
                    let rise = coefficient(values[SLEW_RISE_MS as usize], rate);
                    let fall = coefficient(values[SLEW_FALL_MS as usize], rate);
                    let input = &inputs[Input::Signal.index()][..len];
                    for (out, target) in signal.iter_mut().zip(input.iter()) {
                        let pace = if *target > *value { rise } else { fall };
                        *value += (target - *value) * pace;
                        *out = *value;
                    }
                }
                Unit::Velocity => signal.fill(self.velocity),
                Unit::Note => signal.fill((f32::from(self.note) - 60.0) / 12.0),
                Unit::Wheel => signal.fill(moment.wheel),
                Unit::Pressure => signal.fill(moment.pressure),
                Unit::Constant(value) => signal.fill(*value),
            }
        }
        let heard = &self.signals[output][..len];
        match self.choke {
            0 => {
                for (out, value) in out.iter_mut().zip(heard.iter()) {
                    *out += value;
                }
            }
            _ => {
                let frames = self.choke_frames as f32;
                for (out, value) in out.iter_mut().zip(heard.iter()) {
                    *out += value * (self.choke as f32 / frames);
                    self.choke = self.choke.saturating_sub(1);
                }
                if self.choke == 0 {
                    self.active = false;
                }
            }
        }
        if self.released
            && self.units.iter().all(|unit| match unit {
                Unit::Envelope(dsp) => dsp.is_idle(),
                _ => true,
            })
        {
            self.active = false;
        }
    }
}
