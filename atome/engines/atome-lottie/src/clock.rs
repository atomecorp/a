//! The frame a Lottie shows at a time. A Lottie counts in frames from `ip` to `op` (exclusive) at `fr`
//! frames per second; the atome counts in seconds (`time_seconds`). A frame is whole: the renderer draws
//! each frame once, at the file's own rate, and never between two.
use crate::inspect::LottieReport;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LottieClock {
    pub frame_rate: f64,
    pub in_point: f64,
    pub out_point: f64,
}

impl LottieClock {
    pub fn from_report(report: &LottieReport) -> Result<Self, String> {
        let clock = Self {
            frame_rate: report.frame_rate,
            in_point: report.in_point,
            out_point: report.out_point,
        };
        if !(clock.frame_rate > 0.0 && clock.out_point > clock.in_point) {
            return Err("lottie_timing_invalid".into());
        }
        Ok(clock)
    }

    pub fn duration_seconds(&self) -> f64 {
        (self.out_point - self.in_point) / self.frame_rate
    }

    /// Whole frames shown, `op - ip` rounded up (a fractional `op` still shows its last started frame).
    pub fn frame_count(&self) -> u64 {
        (self.out_point - self.in_point).ceil().max(1.0) as u64
    }

    /// The index (0-based, from `ip`) of the frame shown at `seconds`: a loop starts again after the last
    /// frame, otherwise the last frame stays; a time before 0 shows the first frame.
    pub fn frame_index(&self, seconds: f64, looping: bool) -> u64 {
        let count = self.frame_count();
        if !seconds.is_finite() || seconds <= 0.0 {
            return 0;
        }
        // A frame starts at exactly `index / fr`: the epsilon keeps 1/fr × fr from landing on 0.9999….
        let index = (seconds * self.frame_rate + 1e-9).floor() as u64;
        if looping {
            index % count
        } else {
            index.min(count - 1)
        }
    }

    /// The Lottie frame number (`ip` + index) velato draws.
    pub fn frame_at(&self, seconds: f64, looping: bool) -> f64 {
        self.in_point + self.frame_index(seconds, looping) as f64
    }

    /// When the frame after the one shown at `seconds` starts, or `None` once a non-looping animation
    /// shows its last frame.
    pub fn next_frame_seconds(&self, seconds: f64, looping: bool) -> Option<f64> {
        let elapsed = seconds.max(0.0);
        let index = (elapsed * self.frame_rate + 1e-9).floor();
        if !looping && index as u64 + 1 >= self.frame_count() {
            return None;
        }
        Some((index + 1.0) / self.frame_rate)
    }
}
