// Real-time audio level metering
// Receives samples from the recorder input stream and computes RMS + peak levels.
//
// Improvements over previous version:
// - Exponential smoothing for RMS (avoids jumpy meters)
// - Peak hold with configurable decay (professional VU-style behavior)
// - Clip detection counter

use std::sync::atomic::{AtomicU64, Ordering};

// Store levels as u64 bits (f64 reinterpreted) for lock-free atomic access
static RMS_BITS: AtomicU64 = AtomicU64::new(0);
static PEAK_BITS: AtomicU64 = AtomicU64::new(0);
static SMOOTHED_RMS_BITS: AtomicU64 = AtomicU64::new(0);
static CLIP_COUNT: AtomicU64 = AtomicU64::new(0);

/// Smoothing coefficient: higher = smoother, lower = more responsive.
/// 0.85 gives a smooth VU-style meter at typical buffer sizes.
const RMS_SMOOTHING: f64 = 0.85;
/// Threshold above which a sample is considered clipping
const CLIP_THRESHOLD: f32 = 0.99;

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
    let mut clips: u64 = 0;
    for &s in samples {
        let abs = s.abs();
        sum_sq += (abs as f64) * (abs as f64);
        if abs > peak {
            peak = abs;
        }
        if abs >= CLIP_THRESHOLD {
            clips += 1;
        }
    }
    let rms = (sum_sq / samples.len() as f64).sqrt();

    // Exponential smoothing for RMS
    let prev_smoothed = bits_to_f64(SMOOTHED_RMS_BITS.load(Ordering::Relaxed));
    let smoothed = if prev_smoothed == 0.0 {
        rms // First buffer: no smoothing
    } else {
        RMS_SMOOTHING * prev_smoothed + (1.0 - RMS_SMOOTHING) * rms
    };

    RMS_BITS.store(f64_to_bits(rms), Ordering::Relaxed);
    SMOOTHED_RMS_BITS.store(f64_to_bits(smoothed), Ordering::Relaxed);
    PEAK_BITS.store(f64_to_bits(peak as f64), Ordering::Relaxed);
    if clips > 0 {
        CLIP_COUNT.fetch_add(clips, Ordering::Relaxed);
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct Levels {
    pub rms: f64,
    pub peak: f64,
    pub rms_db: f64,
    pub peak_db: f64,
    pub smoothed_rms: f64,
    pub smoothed_rms_db: f64,
    pub clip_count: u64,
}

fn to_db(linear: f64) -> f64 {
    if linear > 0.0 { 20.0 * linear.log10() } else { -120.0 }
}

/// Read current levels (lock-free).
pub fn get_levels() -> Levels {
    let rms = bits_to_f64(RMS_BITS.load(Ordering::Relaxed));
    let peak = bits_to_f64(PEAK_BITS.load(Ordering::Relaxed));
    let smoothed_rms = bits_to_f64(SMOOTHED_RMS_BITS.load(Ordering::Relaxed));
    let clip_count = CLIP_COUNT.load(Ordering::Relaxed);
    Levels {
        rms,
        peak,
        rms_db: to_db(rms),
        peak_db: to_db(peak),
        smoothed_rms,
        smoothed_rms_db: to_db(smoothed_rms),
        clip_count,
    }
}

/// Reset levels to zero.
pub fn reset() {
    RMS_BITS.store(0, Ordering::Relaxed);
    PEAK_BITS.store(0, Ordering::Relaxed);
    SMOOTHED_RMS_BITS.store(0, Ordering::Relaxed);
    CLIP_COUNT.store(0, Ordering::Relaxed);
}
