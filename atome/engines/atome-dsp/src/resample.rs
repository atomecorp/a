// Streaming windowed-sinc resampler: a source stream at one rate is read back
// at another. Sized once in `allocate`; `push` and `read` never allocate.
// Used where a processor runs at a fixed rate of its own (a NAM model is
// captured at 48 kHz) while the device runs at another.

use std::f64::consts::PI;

pub const HALF_TAPS: usize = 8;
const TAPS: usize = HALF_TAPS * 2;
const PHASES: usize = 256;

pub struct Resampler {
    ring: Vec<f32>,
    mask: usize,
    written: usize,
    position: f64,
    step: f64,
    table: Vec<f32>,
}

impl Resampler {
    pub fn new() -> Self {
        Self { ring: Vec::new(), mask: 0, written: 0, position: 0.0, step: 1.0, table: Vec::new() }
    }

    // `step` = source rate / destination rate; `capacity` bounds the source
    // samples held between a push and the reads that consume them.
    pub fn allocate(&mut self, source_rate: f64, destination_rate: f64, capacity: usize) {
        self.step = source_rate / destination_rate;
        let length = (capacity + TAPS * 2).next_power_of_two();
        self.ring = vec![0.0; length];
        self.mask = length - 1;
        // Blackman-windowed sinc, its cutoff under the lower of the two Nyquists.
        let cutoff = 0.92 * (1.0 / self.step).min(1.0);
        self.table = vec![0.0; (PHASES + 1) * TAPS];
        for phase in 0..=PHASES {
            let fraction = phase as f64 / PHASES as f64;
            let row = &mut self.table[phase * TAPS..(phase + 1) * TAPS];
            for (tap, weight) in row.iter_mut().enumerate() {
                let x = tap as f64 - (HALF_TAPS as f64 - 1.0) - fraction;
                let sinc = if x.abs() < 1.0e-9 { 1.0 } else { (PI * cutoff * x).sin() / (PI * cutoff * x) };
                let w = (x + HALF_TAPS as f64) / TAPS as f64;
                let window = 0.42 - 0.5 * (2.0 * PI * w).cos() + 0.08 * (4.0 * PI * w).cos();
                *weight = (cutoff * sinc * window) as f32;
            }
        }
        self.reset(0);
    }

    // Starts over with `lead` silent source samples ahead of the read position:
    // the lead the reader needs, plus any margin a fixed latency asks for.
    pub fn reset(&mut self, lead: usize) {
        self.ring.fill(0.0);
        self.written = HALF_TAPS + lead;
        self.position = HALF_TAPS as f64;
    }

    // Moves the read position ahead by a fraction of a source sample, so a
    // conversion's latency lands on a whole number of destination frames.
    pub fn advance(&mut self, source_frames: f64) {
        self.position += source_frames;
    }

    #[inline]
    pub fn push(&mut self, sample: f32) {
        self.ring[self.written & self.mask] = sample;
        self.written += 1;
    }

    #[inline]
    pub fn can_read(&self) -> bool {
        self.position as usize + HALF_TAPS < self.written
    }

    #[inline]
    pub fn read(&mut self) -> f32 {
        debug_assert!(self.can_read(), "resampler read past its source");
        let base = self.position as usize;
        let phase = ((self.position - base as f64) * PHASES as f64) as usize;
        let row = &self.table[phase * TAPS..(phase + 1) * TAPS];
        let first = base + 1 - HALF_TAPS;
        let mut sum = 0.0;
        for (tap, weight) in row.iter().enumerate() {
            sum += self.ring[(first + tap) & self.mask] * weight;
        }
        self.position += self.step;
        sum
    }
}

impl Default for Resampler {
    fn default() -> Self {
        Self::new()
    }
}
