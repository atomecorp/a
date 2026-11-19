// Parameter descriptions and the click-free smoothing every processor uses.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unit {
    Decibels,
    Hertz,
    Milliseconds,
    Seconds,
    Percent,
    Ratio,
    Pan,
    Plain,
    // One of a series (a character, a space, a shape): the value is the index
    // into `choices`, whose keys name each option for the UI and the MCP.
    Choice,
    // Semitones (pitch, formant) and degrees (an angle, a phase).
    Semitones,
    Degrees,
    // A whole number (bands, bits, a MIDI note, a tempo): set one by one.
    Count,
}

#[derive(Debug, Clone, Copy)]
pub struct ParamSpec {
    pub id: u32,
    pub key: &'static str,
    pub min: f32,
    pub max: f32,
    pub default: f32,
    pub unit: Unit,
    pub choices: &'static [&'static str],
}

impl ParamSpec {
    pub const fn new(
        id: u32,
        key: &'static str,
        min: f32,
        max: f32,
        default: f32,
        unit: Unit,
    ) -> Self {
        Self {
            id,
            key,
            min,
            max,
            default,
            unit,
            choices: &[],
        }
    }

    // A choice among `choices` (keys, never shown text), `default` its index.
    pub const fn choice(
        id: u32,
        key: &'static str,
        choices: &'static [&'static str],
        default: usize,
    ) -> Self {
        Self {
            id,
            key,
            min: 0.0,
            max: (choices.len() - 1) as f32,
            default: default as f32,
            unit: Unit::Choice,
            choices,
        }
    }

    // The option a choice value designates (rounded, clamped).
    pub fn index(&self, value: f32) -> usize {
        self.clamp(value).round() as usize
    }

    pub fn clamp(&self, value: f32) -> f32 {
        value.clamp(self.min, self.max)
    }

    // A choice or a whole number moves in steps: it is set, never modulated.
    pub fn modulatable(&self) -> bool {
        !matches!(self.unit, Unit::Choice | Unit::Count)
    }

    // The value a modulation `amount` (Σ depth × control) gives from `base`,
    // saturated to the range. The amount is in the parameter's own unit, except
    // a frequency, modulated in octaves (+1 doubles it).
    #[inline]
    pub fn modulate(&self, base: f32, amount: f32) -> f32 {
        let value = match self.unit {
            Unit::Hertz => base * amount.exp2(),
            _ => base + amount,
        };
        self.clamp(value)
    }
}

// Exponential approach toward a target, ~99 % reached after `time_ms`.
#[derive(Debug, Clone, Copy)]
pub struct Smoothed {
    current: f32,
    target: f32,
    coefficient: f32,
    time_ms: f32,
}

impl Smoothed {
    pub fn new(value: f32, time_ms: f32) -> Self {
        Self {
            current: value,
            target: value,
            coefficient: 0.0,
            time_ms,
        }
    }

    pub fn prepare(&mut self, sample_rate: f32) {
        let frames = (self.time_ms * 0.001 * sample_rate).max(1.0);
        self.coefficient = (-4.6 / frames).exp();
    }

    pub fn set(&mut self, target: f32) {
        self.target = target;
    }

    // Jumps without a ramp (first value, reset).
    pub fn snap(&mut self, value: f32) {
        self.current = value;
        self.target = value;
    }

    // Lands on the target at once: a reset starts from the described value.
    pub fn settle(&mut self) {
        self.current = self.target;
    }

    pub fn target(&self) -> f32 {
        self.target
    }

    pub fn is_settled(&self) -> bool {
        (self.current - self.target).abs() <= 1.0e-6 * self.target.abs().max(1.0)
    }

    #[inline]
    pub fn tick(&mut self) -> f32 {
        self.current = self.target + self.coefficient * (self.current - self.target);
        self.current
    }
}
