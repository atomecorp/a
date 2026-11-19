// One band's filter: Andrew Simper's linear trapezoidal state-variable
// filter, its analog prototype and the exact magnitude it realises.

use super::BandType;
use crate::SILENCE_DB;
use std::f32::consts::PI;

// The analog prototype of one band, s normalised to `g` (prewarped cutoff):
// H(s) = m0 + m1·s/D(s) + m2/D(s), D(s) = s² + k·s + 1.
#[derive(Debug, Clone, Copy, Default)]
pub(super) struct Design {
    pub(super) g: f32,
    pub(super) k: f32,
    pub(super) m0: f32,
    pub(super) m1: f32,
    pub(super) m2: f32,
}

impl Design {
    // Simper's shapes: bell and shelves at gain 0 dB are exactly the identity.
    pub(super) fn new(
        kind: BandType,
        sample_rate: f32,
        centre_hz: f32,
        q: f32,
        gain_db: f32,
    ) -> Self {
        let centre_hz = centre_hz.min(sample_rate * 0.49);
        let g = (PI * centre_hz / sample_rate).tan();
        let k = 1.0 / q;
        let a = 10f32.powf(gain_db / 40.0);
        let (g, k, m0, m1, m2) = match kind {
            BandType::Bell => (g, k / a, 1.0, k / a * (a * a - 1.0), 0.0),
            BandType::LowShelf => (g / a.sqrt(), k, 1.0, k * (a - 1.0), a * a - 1.0),
            BandType::HighShelf => (g * a.sqrt(), k, a * a, k * (1.0 - a) * a, 1.0 - a * a),
            BandType::HighPass => (g, k, 1.0, -k, -1.0),
            BandType::LowPass => (g, k, 0.0, 0.0, 1.0),
            BandType::Notch => (g, k, 1.0, -k, 0.0),
        };
        Self { g, k, m0, m1, m2 }
    }

    // Unity-peak band-pass over the same region: the dynamic band's detector.
    pub(super) fn band_pass(sample_rate: f32, centre_hz: f32, q: f32) -> Self {
        let k = 1.0 / q;
        Self {
            g: (PI * centre_hz.min(sample_rate * 0.49) / sample_rate).tan(),
            k,
            m0: 0.0,
            m1: k,
            m2: 0.0,
        }
    }

    // |H(e^jω)| in dB: the prototype at s = j·tan(ω/2)/g, exactly what the
    // trapezoidal filter realises.
    pub(super) fn magnitude_db(&self, sample_rate: f32, frequency: f32) -> f32 {
        let x = (PI * frequency.clamp(0.0, sample_rate * 0.4999) / sample_rate).tan() / self.g;
        let d_re = 1.0 - x * x;
        let d_im = self.k * x;
        let n_re = self.m0 * d_re + self.m2;
        let n_im = x * (self.m0 * self.k + self.m1);
        let numerator = n_re * n_re + n_im * n_im;
        let denominator = (d_re * d_re + d_im * d_im).max(1.0e-30);
        (10.0 * (numerator / denominator).log10()).max(SILENCE_DB)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub(super) struct Svf {
    pub(super) a1: f32,
    pub(super) a2: f32,
    pub(super) a3: f32,
    pub(super) m0: f32,
    pub(super) m1: f32,
    pub(super) m2: f32,
}

impl From<Design> for Svf {
    fn from(d: Design) -> Self {
        let a1 = 1.0 / (1.0 + d.g * (d.g + d.k));
        let a2 = d.g * a1;
        Self {
            a1,
            a2,
            a3: d.g * a2,
            m0: d.m0,
            m1: d.m1,
            m2: d.m2,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub(super) struct State {
    pub(super) ic1: f32,
    pub(super) ic2: f32,
}

impl State {
    #[inline]
    pub(super) fn tick(&mut self, c: &Svf, v0: f32) -> f32 {
        let v3 = v0 - self.ic2;
        let v1 = c.a1 * self.ic1 + c.a2 * v3;
        let v2 = self.ic2 + c.a2 * self.ic1 + c.a3 * v3;
        self.ic1 = 2.0 * v1 - self.ic1;
        self.ic2 = 2.0 * v2 - self.ic2;
        c.m0 * v0 + c.m1 * v1 + c.m2 * v2
    }

    // WebAssembly has no flush-to-zero: a dying state is cleared by hand.
    pub(super) fn flush(&mut self) {
        if self.ic1.abs() < 1.0e-20 {
            self.ic1 = 0.0;
        }
        if self.ic2.abs() < 1.0e-20 {
            self.ic2 = 0.0;
        }
    }
}
