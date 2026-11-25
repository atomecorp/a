// The MIDI sync's arithmetic (R-379, « Synchro MIDI »): where eVe's clock ticks fall when it is the master (24 a quarter
// note, through the project's tempo map, its ramps included: atome-dsp transport.rs), the beat at a song second and
// back (a song position names sixteenths), and the tempo a master's clock beats at, read from its ticks' arrival times.
// The page only schedules what this computes (eVe/domains/midi/midi_sync_out.js, midi_sync_in.js).

use atome_dsp::transport::{TempoPoint, beat_at, seconds_at_beat};

pub const TICKS_PER_BEAT: f64 = 24.0;

/// A tempo map from its columns (changes' starts in seconds, tempos, ramps), sorted, as the page lays it.
pub fn tempo_map(starts: &[f64], bpms: &[f64], ramps: &[u8]) -> Vec<TempoPoint> {
    let mut map: Vec<TempoPoint> = starts
        .iter()
        .zip(bpms)
        .enumerate()
        .filter(|(_, (start, bpm))| start.is_finite() && bpm.is_finite() && **bpm > 0.0)
        .map(|(index, (start, bpm))| TempoPoint {
            start_seconds: start.max(0.0),
            bpm: *bpm,
            ramp: ramps.get(index).is_some_and(|ramp| *ramp != 0),
        })
        .collect();
    map.sort_by(|left, right| left.start_seconds.total_cmp(&right.start_seconds));
    if let Some(first) = map.first_mut() {
        first.start_seconds = 0.0;
    }
    map
}

/// The beat at song second `seconds`.
pub fn beat_of(map: &[TempoPoint], seconds: f64) -> f64 {
    beat_at(map, seconds).0
}

/// The song second of `beat` (a song position's sixteenths / 4).
pub fn seconds_at(map: &[TempoPoint], beat: f64) -> f64 {
    seconds_at_beat(map, beat)
}

/// The song seconds of every clock tick in [`from`, `to`).
pub fn clock_ticks(map: &[TempoPoint], from: f64, to: f64) -> Vec<f64> {
    if !(from.is_finite() && to.is_finite()) || to <= from {
        return Vec::new();
    }
    let first = (beat_at(map, from.max(0.0)).0 * TICKS_PER_BEAT - 1e-9).ceil().max(0.0);
    let mut ticks = Vec::new();
    let mut tick = first;
    loop {
        let seconds = seconds_at_beat(map, tick / TICKS_PER_BEAT);
        if seconds >= to {
            return ticks;
        }
        if seconds >= from {
            ticks.push(seconds);
        }
        tick += 1.0;
    }
}

/// The tempo (bpm) a clock beats at, from its ticks' arrival times (ms, oldest first): the slope of the line fitted
/// through them, so the jitter of each arrival cancels out; 0 under three ticks.
pub fn clock_tempo(arrivals_ms: &[f64]) -> f64 {
    let count = arrivals_ms.len();
    if count < 3 {
        return 0.0;
    }
    let n = count as f64;
    let mean_index = (n - 1.0) / 2.0;
    let mean_time = arrivals_ms.iter().sum::<f64>() / n;
    let (mut covariance, mut variance) = (0.0, 0.0);
    for (index, time) in arrivals_ms.iter().enumerate() {
        let offset = index as f64 - mean_index;
        covariance += offset * (time - mean_time);
        variance += offset * offset;
    }
    let tick_ms = covariance / variance;
    if tick_ms > 0.0 {
        60_000.0 / (tick_ms * TICKS_PER_BEAT)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn steady(bpm: f64) -> Vec<TempoPoint> {
        tempo_map(&[0.0], &[bpm], &[0])
    }

    #[test]
    fn at_120_bpm_a_tick_every_twentieth_of_a_second_and_a_half() {
        let ticks = clock_ticks(&steady(120.0), 0.0, 0.5);
        assert_eq!(ticks.len(), 24);
        assert!((ticks[1] - 0.5 / 24.0).abs() < 1e-12);
        // From mid-tick, the next tick only.
        let later = clock_ticks(&steady(120.0), 0.01, 0.05);
        assert!((later[0] - 0.5 / 24.0).abs() < 1e-12);
        assert!(clock_ticks(&steady(120.0), 1.0, 1.0).is_empty());
    }

    #[test]
    fn a_ramp_tightens_its_ticks() {
        let map = tempo_map(&[0.0, 4.0], &[60.0, 120.0], &[1, 0]);
        let ticks = clock_ticks(&map, 0.0, 4.0);
        assert_eq!(ticks.len(), 6 * 24);
        let first = ticks[1] - ticks[0];
        let last = ticks[ticks.len() - 1] - ticks[ticks.len() - 2];
        assert!(last < first);
    }

    #[test]
    fn a_jittered_clock_reads_its_tempo() {
        let arrivals: Vec<f64> = (0..96)
            .map(|index| f64::from(index) * 2500.0 / 121.8 + if index % 2 == 0 { 0.8 } else { -0.8 })
            .collect();
        assert!((clock_tempo(&arrivals) - 121.8).abs() < 0.05);
        assert_eq!(clock_tempo(&[0.0, 20.0]), 0.0);
    }

    #[test]
    fn a_song_position_lands_on_its_second() {
        let map = steady(120.0);
        // Sixteenth 8 = beat 2 = one second at 120 bpm.
        assert!((seconds_at_beat(&map, 8.0 / 4.0) - 1.0).abs() < 1e-12);
    }
}
