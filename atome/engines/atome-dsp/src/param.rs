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
}

#[derive(Debug, Clone, Copy)]
pub struct ParamSpec {
    pub id: u32,
    pub key: &'static str,
    pub min: f32,
    pub max: f32,
    pub default: f32,
    pub unit: Unit,
}

impl ParamSpec {
    pub const fn new(id: u32, key: &'static str, min: f32, max: f32, default: f32, unit: Unit) -> Self {
        Self { id, key, min, max, default, unit }
    }

    pub fn clamp(&self, value: f32) -> f32 {
        value.clamp(self.min, self.max)
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
        Self { current: value, target: value, coefficient: 0.0, time_ms }
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
