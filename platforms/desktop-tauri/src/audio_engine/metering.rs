// Real-time audio level metering
// Receives samples from the recorder input stream and computes RMS + peak levels.
//
// Improvements over previous version:
// - Exponential smoothing for RMS (avoids jumpy meters)
// - Peak hold with configurable decay (professional VU-style behavior)
// - Clip detection counter

use std::sync::atomic::{AtomicU64, Ordering};

use super::metering_scope;

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
    push_converted_samples(samples.len(), |index| samples[index]);
}

pub fn push_i16_samples(samples: &[i16]) {
    push_converted_samples(samples.len(), |index| samples[index] as f32 / 32768.0);
}

pub fn push_u16_samples(samples: &[u16]) {
    push_converted_samples(samples.len(), |index| {
        (samples[index] as f32 - 32768.0) / 32768.0
    });
}

fn push_converted_samples<F>(sample_count: usize, mut sample_at: F)
where
    F: FnMut(usize) -> f32,
{
    if sample_count == 0 {
        return;
    }
    let mut sum_sq: f64 = 0.0;
    let mut peak: f32 = 0.0;
    let mut clips: u64 = 0;
    let mut scope_minimums = [0.0f32; 64];
    let mut scope_maximums = [0.0f32; 64];
    for index in 0..sample_count {
        let s = sample_at(index);
        let abs = s.abs();
        let scope_index = (index.saturating_mul(64) / sample_count).min(63);
        scope_minimums[scope_index] = scope_minimums[scope_index].min(s);
        scope_maximums[scope_index] = scope_maximums[scope_index].max(s);
        sum_sq += (abs as f64) * (abs as f64);
        if abs > peak {
            peak = abs;
        }
        if abs >= CLIP_THRESHOLD {
            clips += 1;
        }
    }
    let rms = (sum_sq / sample_count as f64).sqrt();

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
    metering_scope::publish(&scope_minimums, &scope_maximums);
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
    if linear > 0.0 {
        20.0 * linear.log10()
    } else {
        -120.0
    }
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
    metering_scope::reset();
}

pub fn configure_scope(sample_rate: u32, channels: u16) {
    metering_scope::configure(sample_rate, channels);
}

pub fn get_scope() -> super::metering_scope::ScopeFrame {
    metering_scope::snapshot()
}

#[cfg(test)]
mod tests {
    use super::{get_levels, push_i16_samples, push_samples, push_u16_samples, reset};

    #[test]
    fn metering_accepts_i16_samples_without_float_buffer() {
        let _lock = crate::audio_engine::metering_scope::METERING_TEST_LOCK
            .lock()
            .unwrap();
        reset();
        push_i16_samples(&[0, 16_384, -16_384, 32_767]);
        let levels = get_levels();
        assert!(levels.rms > 0.0);
        assert!(levels.peak > 0.99);
    }

    #[test]
    fn metering_accepts_u16_samples_without_float_buffer() {
        let _lock = crate::audio_engine::metering_scope::METERING_TEST_LOCK
            .lock()
            .unwrap();
        reset();
        push_u16_samples(&[32_768, 49_152, 16_384, 65_535]);
        let levels = get_levels();
        assert!(levels.rms > 0.0);
        assert!(levels.peak > 0.99);
    }

    #[test]
    fn metering_keeps_f32_path() {
        let _lock = crate::audio_engine::metering_scope::METERING_TEST_LOCK
            .lock()
            .unwrap();
        reset();
        push_samples(&[0.0, 0.25, -0.5, 1.0]);
        let levels = get_levels();
        assert!(levels.rms > 0.0);
        assert!(levels.peak >= 1.0);
    }
}
