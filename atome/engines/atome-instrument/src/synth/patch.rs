// A synth voice described (R-186 Q1, R-191): its bricks in signal order, the
// routes between them and the brick heard. Every voice of the synth runs the
// same patch on its own signals: one value per frame and per voice for every
// brick, each note keeping its own envelopes, filters and LFO phases until the
// voices are summed at the synth's output. A route runs forward (from a brick
// to a later one), its depth scaling what it adds to the input it reaches.
// Every refusal is explicit: an unknown brick, parameter or input, a route
// backward or into an input its brick lacks, an output that makes no sound, a
// voice that could never end (no envelope).

use atome_dsp::{ParamSpec, Unit};

pub const MAX_BRICKS: usize = 32;
pub const MAX_ROUTES: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BrickKind {
    Oscillator,
    Noise,
    Envelope,
    Lfo,
    Svf,
    Vca,
    // The note's velocity (0..1), its pitch in octaves from middle C, the modulation wheel (0..1), a constant.
    Velocity,
    Note,
    Wheel,
    Constant,
    // An attack-decay contour started by the note, free of its release, its curve from straight to bowed.
    Ad,
    // A saturation: the sound driven into a soft clip.
    Drive,
    // A random value drawn at its rate (sample and hold), glided by its smoothing: −1..1.
    Random,
    // A control signal followed at most so fast, up and down (slew limiter).
    Slew,
    // The channel pressure (aftertouch), 0..1.
    Pressure,
}

pub const KINDS: [(BrickKind, &str); 15] = [
    (BrickKind::Oscillator, "oscillator"),
    (BrickKind::Noise, "noise"),
    (BrickKind::Envelope, "envelope"),
    (BrickKind::Lfo, "lfo"),
    (BrickKind::Svf, "svf"),
    (BrickKind::Vca, "vca"),
    (BrickKind::Velocity, "velocity"),
    (BrickKind::Note, "note"),
    (BrickKind::Wheel, "wheel"),
    (BrickKind::Constant, "constant"),
    (BrickKind::Ad, "ad"),
    (BrickKind::Drive, "drive"),
    (BrickKind::Random, "random"),
    (BrickKind::Slew, "slew"),
    (BrickKind::Pressure, "pressure"),
];

// What a route adds to. Audio, pitch, FM, cutoff and gain follow every frame
// (Q3, 16 Nov. 2026); level, rate and resonance every control step.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Input {
    Audio,     // summed signal the brick processes
    Pitch,     // semitones
    Fm,        // linear FM, a ratio of the oscillator's frequency
    Level,     // decibels
    Rate,      // octaves
    Cutoff,    // octaves
    Resonance, // added to the resonance
    Gain,      // linear gain of a VCA, times its level
    Width,     // added to a pulse's width (pulse-width modulation)
    Sync,      // a rising crossing of zero starts the oscillator's period again (hard sync)
    Drive,     // decibels added to a drive
    Signal,    // the control signal a slew follows
}

pub const INPUTS: usize = 12;

pub const INPUT_KEYS: [(Input, &str); INPUTS] = [
    (Input::Audio, "audio"),
    (Input::Pitch, "pitch"),
    (Input::Fm, "fm"),
    (Input::Level, "level"),
    (Input::Rate, "rate"),
    (Input::Cutoff, "cutoff"),
    (Input::Resonance, "resonance"),
    (Input::Gain, "gain"),
    (Input::Width, "width"),
    (Input::Sync, "sync"),
    (Input::Drive, "drive"),
    (Input::Signal, "signal"),
];

impl Input {
    pub fn index(self) -> usize {
        INPUT_KEYS
            .iter()
            .position(|(input, _)| *input == self)
            .expect("every input has a key")
    }

    fn from_key(key: &str) -> Result<Self, String> {
        INPUT_KEYS
            .iter()
            .find(|(_, candidate)| *candidate == key)
            .map(|(input, _)| *input)
            .ok_or_else(|| format!("synth input {key} is unknown"))
    }
}

pub const OSC_WAVEFORM: u32 = 0;
pub const OSC_LEVEL_DB: u32 = 1;
pub const OSC_TRANSPOSE: u32 = 2;
pub const OSC_DETUNE_CENTS: u32 = 3;
pub const OSC_WIDTH: u32 = 4;
pub const OSC_UNISON: u32 = 5;
pub const OSC_SPREAD_CENTS: u32 = 6;
// The pulse among the waves (its width OSC_WIDTH); the unison's oscillators, at most.
pub const OSC_PULSE: usize = 4;
pub const UNISON_MAX: usize = 7;
pub const OSC_PARAMS: [ParamSpec; 7] = [
    ParamSpec::choice(
        OSC_WAVEFORM,
        "waveform",
        &["sine", "saw", "square", "triangle", "pulse"],
        1,
    ),
    ParamSpec::new(OSC_LEVEL_DB, "level_db", -120.0, 0.0, -6.0, Unit::Decibels),
    ParamSpec::new(OSC_TRANSPOSE, "transpose", -48.0, 48.0, 0.0, Unit::Plain),
    ParamSpec::new(
        OSC_DETUNE_CENTS,
        "detune_cents",
        -100.0,
        100.0,
        0.0,
        Unit::Plain,
    ),
    ParamSpec::new(OSC_WIDTH, "width", 0.03, 0.97, 0.5, Unit::Percent),
    ParamSpec::new(
        OSC_UNISON,
        "unison",
        1.0,
        UNISON_MAX as f32,
        1.0,
        Unit::Count,
    ),
    ParamSpec::new(
        OSC_SPREAD_CENTS,
        "spread_cents",
        0.0,
        55.0,
        13.0,
        Unit::Plain,
    ),
];

// The synth's filter: atome-dsp's SVF and its slope, 12 dB (one stage) or 24 dB (two in series).
pub const SVF_SLOPE: u32 = 3;
pub const SVF_PARAMS: [ParamSpec; 4] = [
    atome_dsp::svf::PARAMS[0],
    atome_dsp::svf::PARAMS[1],
    atome_dsp::svf::PARAMS[2],
    ParamSpec::choice(SVF_SLOPE, "slope", &["db12", "db24"], 0),
];

// The synth's LFO: atome-dsp's, its start after the note (it fades in over that time) and its rate in tempo.
pub const LFO_DELAY_MS: u32 = 3;
pub const LFO_SYNC: u32 = 4;
pub const LFO_DIVISION: u32 = 5;
// The tempo divisions, in beats per period.
pub const LFO_DIVISIONS: [f32; 7] = [4.0, 2.0, 1.0, 0.5, 0.25, 2.0 / 3.0, 1.0 / 3.0];
pub const LFO_PARAMS: [ParamSpec; 6] = [
    atome_dsp::control::LFO_PARAMS[0],
    atome_dsp::control::LFO_PARAMS[1],
    atome_dsp::control::LFO_PARAMS[2],
    ParamSpec::new(
        LFO_DELAY_MS,
        "delay_ms",
        1.0,
        5000.0,
        1.0,
        Unit::Milliseconds,
    ),
    ParamSpec::choice(LFO_SYNC, "sync", &["free", "tempo"], 0),
    ParamSpec::choice(
        LFO_DIVISION,
        "division",
        &[
            "bar",
            "half",
            "quarter",
            "eighth",
            "sixteenth",
            "quarter_triplet",
            "eighth_triplet",
        ],
        2,
    ),
];

pub const AD_ATTACK_MS: u32 = 0;
pub const AD_DECAY_MS: u32 = 1;
pub const AD_CURVE: u32 = 2;
pub const AD_PARAMS: [ParamSpec; 3] = [
    ParamSpec::new(
        AD_ATTACK_MS,
        "attack_ms",
        1.0,
        5000.0,
        5.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(
        AD_DECAY_MS,
        "decay_ms",
        1.0,
        10000.0,
        233.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(AD_CURVE, "curve", 0.0, 1.0, 0.5, Unit::Percent),
];

pub const DRIVE_DB: u32 = 0;
pub const DRIVE_MIX: u32 = 1;
pub const DRIVE_PARAMS: [ParamSpec; 2] = [
    ParamSpec::new(DRIVE_DB, "drive_db", 0.0, 34.0, 8.0, Unit::Decibels),
    ParamSpec::new(DRIVE_MIX, "mix", 0.0, 1.0, 1.0, Unit::Percent),
];

pub const RANDOM_RATE_HZ: u32 = 0;
pub const RANDOM_SMOOTH: u32 = 1;
pub const RANDOM_PARAMS: [ParamSpec; 2] = [
    ParamSpec::new(RANDOM_RATE_HZ, "rate_hz", 0.01, 89.0, 3.0, Unit::Hertz),
    ParamSpec::new(RANDOM_SMOOTH, "smooth", 0.0, 1.0, 0.0, Unit::Percent),
];

pub const SLEW_RISE_MS: u32 = 0;
pub const SLEW_FALL_MS: u32 = 1;
pub const SLEW_PARAMS: [ParamSpec; 2] = [
    ParamSpec::new(
        SLEW_RISE_MS,
        "rise_ms",
        1.0,
        5000.0,
        89.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(
        SLEW_FALL_MS,
        "fall_ms",
        1.0,
        5000.0,
        89.0,
        Unit::Milliseconds,
    ),
];

pub const VCA_LEVEL: u32 = 0;
pub const VCA_PARAMS: [ParamSpec; 1] = [ParamSpec::new(
    VCA_LEVEL,
    "level",
    0.0,
    1.0,
    1.0,
    Unit::Percent,
)];

impl BrickKind {
    pub fn from_key(key: &str) -> Result<Self, String> {
        KINDS
            .iter()
            .find(|(_, candidate)| *candidate == key)
            .map(|(kind, _)| *kind)
            .ok_or_else(|| format!("synth brick {key} is unknown"))
    }

    pub fn params(self) -> &'static [ParamSpec] {
        match self {
            Self::Oscillator => &OSC_PARAMS,
            Self::Noise => &atome_dsp::noise::PARAMS,
            Self::Envelope => &atome_dsp::envelope::PARAMS,
            Self::Lfo => &LFO_PARAMS,
            Self::Svf => &SVF_PARAMS,
            Self::Vca => &VCA_PARAMS,
            Self::Constant => &atome_dsp::control::CONSTANT_PARAMS,
            Self::Ad => &AD_PARAMS,
            Self::Drive => &DRIVE_PARAMS,
            Self::Random => &RANDOM_PARAMS,
            Self::Slew => &SLEW_PARAMS,
            Self::Velocity | Self::Note | Self::Wheel | Self::Pressure => &[],
        }
    }

    // A parameter a patch may set: an envelope's gate follows the note.
    pub fn patchable(self, id: u32) -> bool {
        !(self == Self::Envelope && id == atome_dsp::envelope::GATE)
    }

    pub fn inputs(self) -> &'static [Input] {
        match self {
            Self::Oscillator => &[
                Input::Pitch,
                Input::Fm,
                Input::Level,
                Input::Width,
                Input::Sync,
            ],
            Self::Noise => &[Input::Level],
            Self::Lfo | Self::Random => &[Input::Rate],
            Self::Svf => &[Input::Audio, Input::Cutoff, Input::Resonance],
            Self::Vca => &[Input::Audio, Input::Gain],
            Self::Drive => &[Input::Audio, Input::Drive],
            Self::Slew => &[Input::Signal],
            Self::Envelope
            | Self::Velocity
            | Self::Note
            | Self::Wheel
            | Self::Constant
            | Self::Ad
            | Self::Pressure => &[],
        }
    }

    pub fn key(self) -> &'static str {
        KINDS
            .iter()
            .find(|(kind, _)| *kind == self)
            .map(|(_, key)| *key)
            .expect("every brick has a key")
    }

    // Whether a brick can be the voice's output (it makes sound).
    pub fn sounds(self) -> bool {
        matches!(
            self,
            Self::Oscillator | Self::Noise | Self::Svf | Self::Vca | Self::Drive
        )
    }
}

// The description as it arrives (keys), before Patch::new checks it.
pub struct BrickDesc {
    pub id: String,
    pub kind: String,
    pub params: Vec<(String, f32)>,
}

pub struct RouteDesc {
    pub from: String,
    pub to: String,
    pub input: String,
    pub depth: f32,
}

pub struct Brick {
    pub kind: BrickKind,
    // Every parameter of the kind, clamped, in its ids' order.
    pub values: Vec<f32>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Route {
    pub from: usize,
    pub to: usize,
    pub input: Input,
    pub depth: f32,
}

pub struct Patch {
    pub bricks: Vec<Brick>,
    pub routes: Vec<Route>,
    pub output: usize,
}

impl Patch {
    pub fn new(bricks: &[BrickDesc], routes: &[RouteDesc], output: &str) -> Result<Self, String> {
        if bricks.is_empty() || bricks.len() > MAX_BRICKS {
            return Err(format!(
                "a synth voice has 1 to {MAX_BRICKS} bricks, this one {}",
                bricks.len()
            ));
        }
        if routes.len() > MAX_ROUTES {
            return Err(format!("a synth voice has at most {MAX_ROUTES} routes"));
        }
        let position = |id: &str| {
            bricks
                .iter()
                .position(|brick| brick.id == id)
                .ok_or_else(|| format!("synth brick {id} is not in the voice"))
        };
        let mut built = Vec::with_capacity(bricks.len());
        for (index, desc) in bricks.iter().enumerate() {
            if position(&desc.id)? != index {
                return Err(format!("synth brick {} appears twice", desc.id));
            }
            let kind = BrickKind::from_key(&desc.kind)?;
            let specs = kind.params();
            let mut values: Vec<f32> = specs.iter().map(|spec| spec.default).collect();
            for (key, value) in &desc.params {
                let spec = specs
                    .iter()
                    .find(|spec| spec.key == key.as_str())
                    .ok_or_else(|| format!("synth brick {} has no parameter {key}", desc.id))?;
                if !kind.patchable(spec.id) {
                    return Err(format!(
                        "synth brick {}: its gate follows the note",
                        desc.id
                    ));
                }
                if !value.is_finite() {
                    return Err(format!("synth brick {}: {key} is not a number", desc.id));
                }
                values[spec.id as usize] = spec.clamp(*value);
            }
            built.push(Brick { kind, values });
        }
        let mut wired = Vec::with_capacity(routes.len());
        for route in routes {
            let (from, to) = (position(&route.from)?, position(&route.to)?);
            if from >= to {
                return Err(format!(
                    "synth route {} → {}: a voice route runs forward, from a brick to a later one",
                    route.from, route.to
                ));
            }
            let input = Input::from_key(&route.input)?;
            if !built[to].kind.inputs().contains(&input) {
                return Err(format!(
                    "synth brick {} has no {} input",
                    route.to, route.input
                ));
            }
            if !route.depth.is_finite() {
                return Err(format!(
                    "synth route {} → {}: its depth is not a number",
                    route.from, route.to
                ));
            }
            wired.push(Route {
                from,
                to,
                input,
                depth: route.depth,
            });
        }
        let output = position(output)?;
        if !built[output].kind.sounds() {
            return Err(format!(
                "synth output {}: a {} makes no sound",
                bricks[output].id, bricks[output].kind
            ));
        }
        if !built.iter().any(|brick| brick.kind == BrickKind::Envelope) {
            return Err("a synth voice ends with its envelopes: the patch needs one".into());
        }
        Ok(Self {
            bricks: built,
            routes: wired,
            output,
        })
    }

    // The longest release of its envelopes, in milliseconds.
    pub fn release_ms(&self) -> f32 {
        self.bricks
            .iter()
            .filter(|brick| brick.kind == BrickKind::Envelope)
            .map(|brick| brick.values[atome_dsp::envelope::RELEASE_MS as usize])
            .fold(0.0, f32::max)
    }
}
