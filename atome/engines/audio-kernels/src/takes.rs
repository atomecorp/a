// The cut of an auto-sampling (cahier sampler §8.3): where each planned note lies
// in the one recording. A take starts just before its first sound above the
// threshold, within its note's hold, and ends after its last sound before the
// next note; `truncated` when it still sounds at that next note.
use crate::{Result, require_channels};

/// One planned note, in recording frames: `[from, hold_end)` is where it may start, `to` the next note.
#[derive(Debug, Clone, Copy)]
pub struct TakeWindow {
    pub from: usize,
    pub hold_end: usize,
    pub to: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub struct Take {
    pub start: usize,
    pub end: usize,
    pub truncated: bool,
}

/// Each window's take, None when it stayed silent.
pub fn cut_takes(
    channels: &[&[f32]],
    threshold_db: f64,
    pre_roll: usize,
    windows: &[TakeWindow],
) -> Result<Vec<Option<Take>>> {
    let frames = require_channels(channels)?;
    let limit = 10f64.powf(threshold_db / 20.0);
    let loud = |frame: usize| {
        channels
            .iter()
            .any(|channel| f64::from(channel[frame].abs()) >= limit)
    };
    Ok(windows
        .iter()
        .map(|window| {
            let hold_end = window.hold_end.min(frames);
            let to = window.to.min(frames);
            let onset = (window.from..hold_end).find(|&frame| loud(frame))?;
            let last = ((onset + 1)..to)
                .rev()
                .find(|&frame| loud(frame))
                .unwrap_or(onset);
            Some(Take {
                start: window.from.max(onset.saturating_sub(pre_roll)),
                end: last + 1,
                truncated: last + pre_roll.max(1) >= to,
            })
        })
        .collect())
}
