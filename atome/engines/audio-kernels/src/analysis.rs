// The editor's analysis tools (cahier sampler §8.3, §4.1): the end silence to
// trim, the zero crossing a cut snaps to, and the loop that joins best.
use crate::{EMPTY_RANGE, INVALID_ARGUMENT, KernelError, Result, mono, require_channels};

fn require_frame(value: usize, field: &str, min: usize, max: usize) -> Result<usize> {
    if value < min || value > max {
        return Err(KernelError::new(
            INVALID_ARGUMENT,
            format!("{field} must be a whole frame within {min}..{max}"),
        ));
    }
    Ok(value)
}

/// Where the sound really ends: after its last sample above `threshold_db`, plus `tail_frames`.
pub fn end_of_sound(channels: &[&[f32]], threshold_db: f64, tail_frames: usize) -> Result<usize> {
    let frames = require_channels(channels)?;
    let floor = 10f64.powf(threshold_db / 20.0);
    (0..frames)
        .rev()
        .find(|&index| {
            channels
                .iter()
                .any(|channel| f64::from(channel[index].abs()) > floor)
        })
        .map(|index| frames.min(index + 1 + tail_frames))
        .ok_or_else(|| KernelError::new(EMPTY_RANGE, "the sound is silent"))
}

/// The zero crossing nearest `frame` within `radius` frames (the frame itself when none).
pub fn nearest_zero_crossing(channels: &[&[f32]], frame: usize, radius: usize) -> Result<usize> {
    let frames = require_channels(channels)?;
    require_frame(frame, "frame", 0, frames)?;
    let crosses = |at: usize| {
        let (before, now) = (mono(channels, at - 1), mono(channels, at));
        now == 0.0 || (before < 0.0) != (now < 0.0)
    };
    for distance in 0..=radius {
        let below = frame.checked_sub(distance);
        let candidates = if distance == 0 {
            [below, None]
        } else {
            [below, Some(frame + distance)]
        };
        if let Some(at) = candidates
            .into_iter()
            .flatten()
            .find(|&at| at >= 1 && at < frames && crosses(at))
        {
            return Ok(at);
        }
    }
    Ok(frame)
}

// The upward zero crossings of `[from, to)` of the mono `signal`, at most `limit`, nearest `centre` first.
fn upward_crossings(
    signal: &[f64],
    centre: usize,
    from: usize,
    to: usize,
    limit: usize,
) -> Vec<usize> {
    let mut found: Vec<usize> = (from.max(1)..to)
        .filter(|&i| signal[i - 1] < 0.0 && signal[i] >= 0.0)
        .collect();
    found.sort_by_key(|&index| (index.abs_diff(centre), index));
    found.truncate(limit);
    found
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub struct Loop {
    pub start: usize,
    pub end: usize,
    pub score: f64,
}

pub struct LoopSearch {
    pub start: usize,
    pub end: usize,
    pub radius: usize,
    pub window: usize,
    pub candidates: usize,
}

/// The loop finder (§4.1 « trouver la boucle »): near the asked `start`/`end` (± `radius` frames),
/// the pair of upward zero crossings whose sounds before them match best, so the loop's end flows
/// into its start; score 1 is a seamless join.
pub fn find_loop(channels: &[&[f32]], search: &LoopSearch) -> Result<Loop> {
    let frames = require_channels(channels)?;
    let LoopSearch {
        start,
        end,
        radius,
        window,
        candidates,
    } = *search;
    require_frame(start, "start", window, frames.saturating_sub(2))?;
    require_frame(end, "end", start + 2, frames)?;
    let signal: Vec<f64> = (0..frames).map(|index| mono(channels, index)).collect();
    let starts = upward_crossings(
        &signal,
        start,
        window.max(start.saturating_sub(radius)),
        (end - 1).min(start + radius),
        candidates,
    );
    let ends = upward_crossings(
        &signal,
        end,
        (start + 2).max(end.saturating_sub(radius)),
        frames.min(end + radius),
        candidates,
    );
    if starts.is_empty() || ends.is_empty() {
        return Err(KernelError::new(
            EMPTY_RANGE,
            "no zero crossing near the loop points",
        ));
    }
    let mut best = Loop {
        start,
        end,
        score: f64::NEG_INFINITY,
    };
    for &loop_start in &starts {
        for &loop_end in &ends {
            if loop_end < loop_start + window {
                continue;
            }
            let (mut cross, mut left, mut right) = (0f64, 0f64, 0f64);
            for offset in 0..window {
                let a = signal[loop_end - window + offset];
                let b = signal[loop_start - window + offset];
                cross += a * b;
                left += a * a;
                right += b * b;
            }
            let score = if left > 0.0 && right > 0.0 {
                cross / (left * right).sqrt()
            } else {
                0.0
            };
            if score > best.score {
                best = Loop {
                    start: loop_start,
                    end: loop_end,
                    score,
                };
            }
        }
    }
    if best.score == f64::NEG_INFINITY {
        return Err(KernelError::new(
            EMPTY_RANGE,
            "the loop is shorter than the comparison window",
        ));
    }
    Ok(best)
}
