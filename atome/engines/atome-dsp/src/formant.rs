// The spectral envelope a pitch shift keeps the formants on (pitch.rs): drawn
// through a frame's harmonic peaks, never averaged with the troughs between
// them. R-372: a plain cepstral smoothing of the spectrum, the troughs averaged
// in, blurred an « a »'s formants into one hump, and a moved voice kept the
// resampled timbre (measured in atome-audio-kernels tests/tune.rs). Only `new`
// allocates.

use crate::stft::Stft;
use realfft::num_complex::Complex;
use std::f32::consts::PI;

const ENVELOPE_FLOOR: f32 = 1.0e-3; // −60 dB under the frame's peak
// Each pass lifts the smoothed curve toward the peaks it still lies under, twice the way (Röbel's acceleration);
// the passes stop once every peak lies within 1 dB under it.
const TRUE_ENVELOPE_PASSES: usize = 13;
const TRUE_ENVELOPE_STEP: f32 = 2.0;
const TRUE_ENVELOPE_TOLERANCE: f32 = 0.115;
// The lifter of a voiced frame: 0.8 of its period (the harmonics sample the envelope every f0, so it can follow
// what changes over two of them), flat to 0.6 of it then a half cosine to 0.
const LIFTER_PERIODS: f32 = 0.8;
const LIFTER_FLAT: f32 = 0.6;

pub(crate) struct FormantEnvelope {
    log_envelope: Vec<f32>,
    log_spectrum: Vec<f32>,
    cepstrum: Vec<f32>,
    cepstrum_spectrum: Vec<Complex<f32>>,
    lifter: usize,
}

impl FormantEnvelope {
    pub(crate) fn new(sample_rate: f32, stft: &Stft) -> Self {
        let size = stft.size();
        Self {
            log_envelope: vec![0.0; stft.bins()],
            log_spectrum: vec![0.0; stft.bins()],
            cepstrum: vec![0.0; size],
            cepstrum_spectrum: stft.spectrum(),
            // Quefrencies under 1.5 ms: the formants, not the harmonics — unless the frame's harmonics say
            // otherwise (`draw`: 0.8 of the voice's period).
            lifter: ((sample_rate * 0.0015) as usize).clamp(8, size / 4),
        }
    }

    // The natural log of the envelope, one value per bin.
    pub(crate) fn log(&self) -> &[f32] {
        &self.log_envelope
    }

    // The log envelope at fractional bin `position`.
    #[inline]
    pub(crate) fn at(&self, position: f32) -> f32 {
        let envelope = &self.log_envelope;
        let last = envelope.len() - 1;
        let position = position.clamp(0.0, last as f32);
        let index = (position as usize).min(last - 1);
        let fraction = position - index as f32;
        envelope[index] + (envelope[index + 1] - envelope[index]) * fraction
    }

    // The envelope of a frame (`magnitude`, its `peaks` ascending, not empty): the log magnitudes of the peaks
    // joined by straight lines, liftered (its real cepstrum kept under 0.8 of the voice's period, read from its
    // harmonics' spacing), then lifted toward the peaks it still lies under and liftered again, until it rests on
    // them.
    pub(crate) fn draw(
        &mut self,
        stft: &mut Stft,
        magnitude: &[f32],
        peaks: &[usize],
        loudest: f32,
    ) {
        let floor = (loudest * ENVELOPE_FLOOR).max(1.0e-12);
        let level = |bin: usize| magnitude[bin].max(floor).ln();
        let (first, last) = (peaks[0], peaks[peaks.len() - 1]);
        self.log_spectrum[..=first].fill(level(first));
        self.log_spectrum[last..].fill(level(last));
        for pair in peaks.windows(2) {
            let (from, to) = (pair[0], pair[1]);
            let (low, high) = (level(from), level(to));
            for bin in from..to {
                self.log_spectrum[bin] =
                    low + (high - low) * (bin - from) as f32 / (to - from) as f32;
            }
        }
        let size = self.cepstrum.len();
        self.lifter = harmonic_spacing(magnitude, peaks)
            .map_or(self.lifter, |spacing| {
                ((size as f32 / spacing) * LIFTER_PERIODS) as usize
            })
            .clamp(8, size / 4);
        self.log_envelope.copy_from_slice(&self.log_spectrum);
        for pass in 0..TRUE_ENVELOPE_PASSES {
            if pass > 0 {
                let highest = peaks.iter().fold(0.0f32, |most, &peak| {
                    most.max(self.log_spectrum[peak] - self.log_envelope[peak])
                });
                if highest < TRUE_ENVELOPE_TOLERANCE {
                    break;
                }
                for (envelope, log) in self.log_envelope.iter_mut().zip(&self.log_spectrum) {
                    *envelope += TRUE_ENVELOPE_STEP * (log - *envelope).max(0.0);
                }
            }
            self.smooth(stft);
        }
    }

    // `log_envelope` liftered in place: its real cepstrum kept under the lifter's quefrency.
    fn smooth(&mut self, stft: &mut Stft) {
        for (value, log) in self.cepstrum_spectrum.iter_mut().zip(&self.log_envelope) {
            *value = Complex::new(*log, 0.0);
        }
        stft.inverse(&mut self.cepstrum_spectrum, &mut self.cepstrum);
        let size = self.cepstrum.len();
        let lifter = self.lifter;
        let scale = 1.0 / size as f32;
        let flat = lifter as f32 * LIFTER_FLAT;
        self.cepstrum[0] *= scale;
        for n in 1..size / 2 + 1 {
            let weight = if (n as f32) < flat {
                scale
            } else if n < lifter {
                scale * 0.5 * (1.0 + (PI * (n as f32 - flat) / (lifter as f32 - flat)).cos())
            } else {
                0.0
            };
            self.cepstrum[n] *= weight;
            if n < size - n {
                self.cepstrum[size - n] *= weight;
            }
        }
        stft.forward(&mut self.cepstrum, &mut self.cepstrum_spectrum);
        for (envelope, value) in self.log_envelope.iter_mut().zip(&self.cepstrum_spectrum) {
            *envelope = value.re;
        }
    }
}

// The spacing of the frame's strong harmonics in bins (the median gap between its peaks within 40 dB of the
// loudest), None when too few.
fn harmonic_spacing(magnitude: &[f32], peaks: &[usize]) -> Option<f32> {
    let loudest = peaks
        .iter()
        .fold(0.0f32, |most, &peak| most.max(magnitude[peak]));
    let strong: Vec<usize> = peaks
        .iter()
        .copied()
        .filter(|&peak| magnitude[peak] >= loudest * 0.01)
        .take(13)
        .collect();
    if strong.len() < 3 {
        return None;
    }
    let mut gaps: Vec<f32> = strong
        .windows(2)
        .map(|pair| (pair[1] - pair[0]) as f32)
        .collect();
    gaps.sort_by(f32::total_cmp);
    Some(gaps[gaps.len() / 2])
}
