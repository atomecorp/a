// The audio load (R-370): the time the engine spends rendering a block over the block's own duration, on the thread
// that renders it (native: the engine's render thread; Web: the page's pump). 1.0 means the render takes as long as
// the sound it makes: past it, the sound breaks up. Measured in real time, so a device slowed by its heat shows it.
// Each strip's share is measured inside the graph (graph_render.rs), what thawing a frozen strip would cost.
// The clock is the host's (`set_clock`): std's `Instant` natively, the page's `performance.now()` on the Web, where
// std has none.

use std::sync::OnceLock;
use std::sync::atomic::{AtomicU32, Ordering};

// The smoothed load follows the measures over about this long.
const SMOOTHING_SECONDS: f64 = 0.3;

static CLOCK: OnceLock<fn() -> u64> = OnceLock::new();

/// The host's monotonic clock in nanoseconds; set once, at the engine's start.
pub fn set_clock(clock: fn() -> u64) {
    let _ = CLOCK.set(clock);
}

/// Now on the host's clock, when it has given one.
pub fn now_ns() -> Option<u64> {
    CLOCK.get().map(|clock| clock())
}

/// The engine's load, smoothed, and its highest block since the last `reset_peak` (a run's peak).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct LoadReading {
    pub load: f32,
    pub peak: f32,
}

pub struct LoadMeter {
    smoothed: AtomicU32,
    peak: AtomicU32,
}

static METER: LoadMeter = LoadMeter {
    smoothed: AtomicU32::new(0),
    peak: AtomicU32::new(0),
};

impl LoadMeter {
    /// The engine's one meter.
    pub fn global() -> &'static Self {
        &METER
    }

    /// One block rendered: `busy_ns` spent on `frames` frames at `sample_rate` (render thread; no allocation).
    pub fn note_block(&self, busy_ns: u64, frames: usize, sample_rate: u32) {
        if frames == 0 || sample_rate == 0 {
            return;
        }
        let seconds = frames as f64 / f64::from(sample_rate);
        let ratio = (busy_ns as f64 / 1e9 / seconds) as f32;
        let alpha = (1.0 - (-seconds / SMOOTHING_SECONDS).exp()) as f32;
        let previous = f32::from_bits(self.smoothed.load(Ordering::Relaxed));
        self.smoothed.store(
            (previous + (ratio - previous) * alpha).to_bits(),
            Ordering::Relaxed,
        );
        if ratio > f32::from_bits(self.peak.load(Ordering::Relaxed)) {
            self.peak.store(ratio.to_bits(), Ordering::Relaxed);
        }
    }

    pub fn read(&self) -> LoadReading {
        LoadReading {
            load: f32::from_bits(self.smoothed.load(Ordering::Relaxed)),
            peak: f32::from_bits(self.peak.load(Ordering::Relaxed)),
        }
    }

    /// A run starts (a playback): its peak is measured anew.
    pub fn reset_peak(&self) {
        self.peak.store(0f32.to_bits(), Ordering::Relaxed);
    }
}

/// A strip's share of the load, measured while its chain runs (render thread).
#[derive(Debug, Default)]
pub struct StripCost {
    busy_ns: std::sync::atomic::AtomicU64,
    frames: std::sync::atomic::AtomicU64,
}

impl StripCost {
    pub fn record(&self, busy_ns: u64, frames: usize) {
        self.busy_ns.fetch_add(busy_ns, Ordering::Relaxed);
        self.frames.fetch_add(frames as u64, Ordering::Relaxed);
    }

    /// Its load since the last read (the time it took over the sound it made), and the frames it was measured on.
    pub fn take(&self, sample_rate: u32) -> (f32, u64) {
        let busy = self.busy_ns.swap(0, Ordering::Relaxed);
        let frames = self.frames.swap(0, Ordering::Relaxed);
        if frames == 0 || sample_rate == 0 {
            return (0.0, 0);
        }
        let seconds = frames as f64 / f64::from(sample_rate);
        ((busy as f64 / 1e9 / seconds) as f32, frames)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_block_as_long_as_its_sound_is_a_full_load() {
        let meter = LoadMeter {
            smoothed: AtomicU32::new(0),
            peak: AtomicU32::new(0),
        };
        // 512 frames at 48 kHz last 10.67 ms; 5.33 ms of work is half the load.
        for _ in 0..1_000 {
            meter.note_block(5_333_333, 512, 48_000);
        }
        let reading = meter.read();
        assert!((reading.load - 0.5).abs() < 0.01, "{reading:?}");
        assert!((reading.peak - 0.5).abs() < 0.01, "{reading:?}");
        meter.note_block(10_666_666, 512, 48_000);
        assert!((meter.read().peak - 1.0).abs() < 0.01);
        meter.reset_peak();
        assert_eq!(meter.read().peak, 0.0);
    }

    #[test]
    fn a_strip_cost_is_read_once() {
        let cost = StripCost::default();
        cost.record(1_000_000, 4_800);
        cost.record(1_000_000, 4_800);
        // 2 ms over 0.2 s: one hundredth.
        let (load, frames) = cost.take(48_000);
        assert!((load - 0.01).abs() < 1e-4);
        assert_eq!(frames, 9_600);
        assert_eq!(cost.take(48_000), (0.0, 0));
    }
}
