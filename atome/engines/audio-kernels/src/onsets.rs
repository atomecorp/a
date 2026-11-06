// The Detector's attacks (cahier sampler §6.1 « par la dynamique », §8.3): where a
// sound starts anew, found on the energy of its slope — the first difference
// weighs the high frequencies a transient brings, so a hit stands out of a held
// note. Per hop of ~2.7 ms, the rise in dB over the hops before it is the onset
// curve; a peak of it is an attack when it rises more than the sensitivity
// allows and lies at least `min_gap_ms` after the last one. The frame is then
// refined to the first sample of the hit. Deterministic, fast enough to follow a
// slider live.
use crate::{INVALID_ARGUMENT, KernelError, Result, require_channels};

// Sensitivity 0 asks a 24 dB jump, 1 a 3 dB one.
const RISE_DB: [f64; 2] = [24.0, 3.0];
const HISTORY_HOPS: usize = 3;
// Below this mean slope energy a hop is silence (≈ -80 dBFS).
const SILENCE_ENERGY: f64 = 1e-8;
// The hit starts where the slope first reaches this share of its local peak.
const ATTACK_SHARE: f32 = 0.5;

pub struct OnsetSettings {
    pub sensitivity: f64,
    pub min_gap_ms: f64,
    pub start: usize,
    pub end: usize,
}

// The mono slope `x[n] - x[n-1]` over `[start, end)`.
fn slope_of(channels: &[&[f32]], start: usize, end: usize) -> Vec<f32> {
    let count = channels.len() as f64;
    (start..end)
        .map(|index| {
            let (mut now, mut before) = (0f64, 0f64);
            for channel in channels {
                now += f64::from(channel[index]);
                if index > 0 {
                    before += f64::from(channel[index - 1]);
                }
            }
            ((now - before) / count) as f32
        })
        .collect()
}

fn rise_curve(slope: &[f32], hop: usize) -> Vec<f64> {
    let count = slope.len().div_ceil(hop);
    let mut energy = vec![0f64; count];
    for (index, value) in slope.iter().enumerate() {
        energy[index / hop] += f64::from(*value) * f64::from(*value);
    }
    for (block, value) in energy.iter_mut().enumerate() {
        *value /= hop.min(slope.len() - block * hop) as f64;
    }
    let mut rise = vec![0f64; count];
    for block in 1..count {
        if energy[block] < SILENCE_ENERGY {
            continue;
        }
        let from = block.saturating_sub(HISTORY_HOPS);
        let history = energy[from..block].iter().sum::<f64>() / (block - from) as f64;
        rise[block] =
            10.0 * ((energy[block] + SILENCE_ENERGY) / (history + SILENCE_ENERGY)).log10();
    }
    rise
}

// The first sample of the hit inside the hop before and the hop of the peak.
fn refine(slope: &[f32], hop: usize, block: usize) -> usize {
    let from = (block - 1) * hop;
    let to = slope.len().min((block + 1) * hop);
    let peak = slope[from..to]
        .iter()
        .fold(0f32, |peak, value| peak.max(value.abs()));
    (from..to)
        .find(|&index| slope[index].abs() >= peak * ATTACK_SHARE)
        .unwrap_or(block * hop)
}

/// The attacks of `channels` in `[start, end)`, as source frames.
pub fn detect_onsets(
    channels: &[&[f32]],
    sample_rate: f64,
    settings: &OnsetSettings,
) -> Result<Vec<usize>> {
    let frames = require_channels(channels)?;
    let fail = |message: &str| Err(KernelError::new(INVALID_ARGUMENT, message));
    if sample_rate.is_nan() || sample_rate <= 0.0 {
        return fail("sampleRate must be positive");
    }
    if !(0.0..=1.0).contains(&settings.sensitivity) {
        return fail("sensitivity is 0..1");
    }
    if !(0.0..=10_000.0).contains(&settings.min_gap_ms) {
        return fail("min_gap_ms is 0..10000");
    }
    let OnsetSettings { start, end, .. } = *settings;
    if end > frames || start >= end {
        return fail("start..end must lie in the sound");
    }
    let hop = (crate::js_round(sample_rate / 375.0) as usize).max(16);
    let slope = slope_of(channels, start, end);
    let rise = rise_curve(&slope, hop);
    let threshold = RISE_DB[0] + (RISE_DB[1] - RISE_DB[0]) * settings.sensitivity;
    let gap = crate::js_round(settings.min_gap_ms * sample_rate / 1000.0) as usize;
    let mut onsets: Vec<usize> = Vec::new();
    // The first hop has nothing before it to rise from: the sound's own start is no cut.
    for block in 1..rise.len() {
        let value = rise[block];
        let next = rise.get(block + 1).copied().unwrap_or(0.0);
        // A plateau counts once, at its first hop.
        if value < threshold || value < rise[block - 1] || value < next || rise[block - 1] == value
        {
            continue;
        }
        let frame = start + refine(&slope, hop, block);
        if onsets.last().is_some_and(|last| frame - last < gap) {
            continue;
        }
        if frame > start {
            onsets.push(frame);
        }
    }
    Ok(onsets)
}
