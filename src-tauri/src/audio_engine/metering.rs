// Real-time audio level metering
// Receives samples from the recorder input stream and computes RMS + peak levels.

use std::sync::atomic::{AtomicU64, Ordering};

// Store levels as u64 bits (f64 reinterpreted) for lock-free atomic access
static RMS_BITS: AtomicU64 = AtomicU64::new(0);
static PEAK_BITS: AtomicU64 = AtomicU64::new(0);

fn f64_to_bits(v: f64) -> u64 {
    v.to_bits()
}

fn bits_to_f64(v: u64) -> f64 {
    f64::from_bits(v)
}

/// Called from the audio input callback with raw f32 samples.
/// Computes RMS and peak and stores atomically.
pub fn push_samples(samples: &[f32]) {
    if samples.is_empty() {
        return;
    }
    let mut sum_sq: f64 = 0.0;
    let mut peak: f32 = 0.0;
    for &s in samples {
        let abs = s.abs();
        sum_sq += (abs as f64) * (abs as f64);
        if abs > peak {
            peak = abs;
        }
    }
    let rms = (sum_sq / samples.len() as f64).sqrt();
    RMS_BITS.store(f64_to_bits(rms), Ordering::Relaxed);
    PEAK_BITS.store(f64_to_bits(peak as f64), Ordering::Relaxed);
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct Levels {
    pub rms: f64,
    pub peak: f64,
    pub rms_db: f64,
    pub peak_db: f64,
}

/// Read current levels (lock-free).
pub fn get_levels() -> Levels {
    let rms = bits_to_f64(RMS_BITS.load(Ordering::Relaxed));
    let peak = bits_to_f64(PEAK_BITS.load(Ordering::Relaxed));
    let rms_db = if rms > 0.0 { 20.0 * rms.log10() } else { -120.0 };
    let peak_db = if peak > 0.0 { 20.0 * peak.log10() } else { -120.0 };
    Levels { rms, peak, rms_db, peak_db }
}

/// Reset levels to zero.
pub fn reset() {
    RMS_BITS.store(0, Ordering::Relaxed);
    PEAK_BITS.store(0, Ordering::Relaxed);
}
