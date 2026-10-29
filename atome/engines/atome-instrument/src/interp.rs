// Variable-rate windowed-sinc interpolation for sample playback. One table per
// pitch band: a sample read faster than its rate (pitched up) needs a lower
// cutoff, or its top octave folds back as aliasing. Rows are blended between
// two phases, and the 16-tap dot product runs on fixed-size arrays so the
// compiler vectorizes it (NEON, AVX, simd128).

use std::f64::consts::PI;

pub const TAPS: usize = 16;
const HALF: usize = TAPS / 2;
const PHASES: usize = 512;
// Upper reading step (source frames per output frame) each table covers.
const BANDS: [f64; 5] = [1.0, 1.414, 2.0, 2.828, 4.0];

pub struct SincTables {
    rows: Vec<[f32; TAPS]>,
}

impl SincTables {
    pub fn new() -> Self {
        let mut rows = Vec::with_capacity(BANDS.len() * (PHASES + 1));
        for &step in &BANDS {
            let cutoff = 0.94 / step;
            for phase in 0..=PHASES {
                let fraction = phase as f64 / PHASES as f64;
                let mut row = [0.0f32; TAPS];
                let mut sum = 0.0;
                for (tap, weight) in row.iter_mut().enumerate() {
                    let x = tap as f64 - (HALF as f64 - 1.0) - fraction;
                    let sinc = if x.abs() < 1.0e-9 { 1.0 } else { (PI * cutoff * x).sin() / (PI * cutoff * x) };
                    let w = (x + HALF as f64) / TAPS as f64;
                    let window = 0.42 - 0.5 * (2.0 * PI * w).cos() + 0.08 * (4.0 * PI * w).cos();
                    let value = cutoff * sinc * window;
                    *weight = value as f32;
                    sum += value;
                }
                // Unity gain at DC: a held level stays exactly where it was.
                for weight in row.iter_mut() {
                    *weight = (*weight as f64 / sum) as f32;
                }
                rows.push(row);
            }
        }
        Self { rows }
    }

    // The rows of the band that reads at `step` (fixed for a run of frames).
    #[inline]
    pub fn band(&self, step: f64) -> &[[f32; TAPS]] {
        let band = BANDS.iter().position(|&limit| step.abs() <= limit + 1.0e-9).unwrap_or(BANDS.len() - 1);
        &self.rows[band * (PHASES + 1)..(band + 1) * (PHASES + 1)]
    }

    // The weights for reading at `fraction` (0..1) past a frame with `step`.
    #[inline]
    pub fn weights(&self, step: f64, fraction: f64) -> [f32; TAPS] {
        weights(self.band(step), fraction)
    }
}

#[inline]
pub fn weights(band: &[[f32; TAPS]], fraction: f64) -> [f32; TAPS] {
    {
        let exact = fraction * PHASES as f64;
        let phase = (exact as usize).min(PHASES - 1);
        let blend = (exact - phase as f64) as f32;
        let a = &band[phase];
        let b = &band[phase + 1];
        let mut out = [0.0f32; TAPS];
        for tap in 0..TAPS {
            out[tap] = a[tap] + blend * (b[tap] - a[tap]);
        }
        out
    }
}

impl Default for SincTables {
    fn default() -> Self {
        Self::new()
    }
}

// The first source frame a read at integer frame `base` touches.
#[inline]
pub fn first_tap(base: i64) -> i64 {
    base + 1 - HALF as i64
}

// Lane-wise products then a tree sum: no serial dependency, so it vectorizes.
#[inline]
pub fn dot(weights: &[f32; TAPS], taps: &[f32; TAPS]) -> f32 {
    let mut lanes = [0.0f32; HALF];
    for lane in 0..HALF {
        lanes[lane] = weights[lane] * taps[lane] + weights[lane + HALF] * taps[lane + HALF];
    }
    let quarter = [lanes[0] + lanes[4], lanes[1] + lanes[5], lanes[2] + lanes[6], lanes[3] + lanes[7]];
    (quarter[0] + quarter[2]) + (quarter[1] + quarter[3])
}
