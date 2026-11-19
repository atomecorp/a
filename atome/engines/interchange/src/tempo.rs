//! A source's tempo map in beats (DAWproject's `Tempo`, `TempoAutomation`,
//! `TimeSignatureAutomation`) turned into seconds, by the Molecule model itself:
//! a change holds its tempo until the next one, or glides to it evenly in time
//! (`ramp`), exactly as `time_model.js` plays it. A beat is a quarter note.

use crate::ImportError;
use crate::molecule_writer::TempoEvent;

/// A tempo change at `beat`; `ramp`: glides evenly in time to the next change.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TempoPoint {
    /// Where it starts, in beats from the start.
    pub beat: f64,
    /// Beats per minute.
    pub bpm: f64,
    /// True when the tempo glides to the next change's.
    pub ramp: bool,
}

/// A meter change at `beat`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MeterPoint {
    /// Where it starts, in beats from the start.
    pub beat: f64,
    /// Beats per bar (the numerator).
    pub numerator: u32,
    /// The beat's note value (the denominator).
    pub denominator: u32,
}

#[derive(Clone, Copy, Debug)]
struct Segment {
    beat: f64,
    seconds: f64,
    bpm: f64,
    // Beats per second squared share: the ramp's slope k of `beats = (bpm t + k t²) / 60`.
    slope: f64,
}

/// Beats and seconds both ways over one tempo map.
#[derive(Clone, Debug)]
pub struct TempoMap {
    segments: Vec<Segment>,
    meters: Vec<MeterPoint>,
}

fn segment_beats(segment: &Segment, seconds: f64) -> f64 {
    (segment.bpm * seconds + segment.slope * seconds * seconds) / 60.0
}

fn segment_seconds(segment: &Segment, beats: f64) -> f64 {
    if segment.slope.abs() < 1e-12 {
        return beats * 60.0 / segment.bpm;
    }
    let disc = (segment.bpm * segment.bpm + 4.0 * segment.slope * beats * 60.0).max(0.0);
    (-segment.bpm + disc.sqrt()) / (2.0 * segment.slope)
}

impl TempoMap {
    /// A map from its tempo and meter changes (sorted here); the first tempo
    /// change is moved to beat 0, and a map without one holds `default_bpm`.
    pub fn new(
        mut tempos: Vec<TempoPoint>,
        mut meters: Vec<MeterPoint>,
    ) -> Result<TempoMap, ImportError> {
        for point in &tempos {
            if !(point.bpm.is_finite()
                && point.bpm > 0.0
                && point.beat.is_finite()
                && point.beat >= 0.0)
            {
                return Err(ImportError::new(
                    "tempo_invalid",
                    "a tempo change is not a positive tempo at a time >= 0",
                ));
            }
        }
        for meter in &meters {
            if meter.numerator == 0
                || meter.denominator == 0
                || !(meter.beat.is_finite() && meter.beat >= 0.0)
            {
                return Err(ImportError::new(
                    "meter_invalid",
                    "a time signature is not positive",
                ));
            }
        }
        tempos.sort_by(|a, b| a.beat.total_cmp(&b.beat));
        tempos.dedup_by(|later, earlier| later.beat == earlier.beat);
        if tempos.is_empty() {
            tempos.push(TempoPoint {
                beat: 0.0,
                bpm: 120.0,
                ramp: false,
            });
        }
        tempos[0].beat = 0.0;
        meters.sort_by(|a, b| a.beat.total_cmp(&b.beat));
        meters.dedup_by(|later, earlier| later.beat == earlier.beat);
        let mut segments: Vec<Segment> = Vec::with_capacity(tempos.len());
        for (index, point) in tempos.iter().enumerate() {
            let seconds = match segments.last() {
                Some(previous) => {
                    previous.seconds + segment_seconds(previous, point.beat - previous.beat)
                }
                None => 0.0,
            };
            let slope = match tempos.get(index + 1) {
                Some(next) if point.ramp && next.bpm != point.bpm => {
                    let length = 120.0 * (next.beat - point.beat) / (point.bpm + next.bpm);
                    (next.bpm - point.bpm) / (2.0 * length)
                }
                _ => 0.0,
            };
            segments.push(Segment {
                beat: point.beat,
                seconds,
                bpm: point.bpm,
                slope,
            });
        }
        Ok(TempoMap { segments, meters })
    }

    /// A constant tempo.
    pub fn constant(bpm: f64, numerator: u32, denominator: u32) -> Result<TempoMap, ImportError> {
        TempoMap::new(
            vec![TempoPoint {
                beat: 0.0,
                bpm,
                ramp: false,
            }],
            vec![MeterPoint {
                beat: 0.0,
                numerator,
                denominator,
            }],
        )
    }

    fn segment_at_beat(&self, beat: f64) -> &Segment {
        let index = self
            .segments
            .partition_point(|segment| segment.beat <= beat);
        &self.segments[index.saturating_sub(1)]
    }

    fn segment_at_seconds(&self, seconds: f64) -> &Segment {
        let index = self
            .segments
            .partition_point(|segment| segment.seconds <= seconds);
        &self.segments[index.saturating_sub(1)]
    }

    /// The time of `beat`, in seconds (beats before 0 extend the first tempo).
    pub fn seconds_at(&self, beat: f64) -> f64 {
        let segment = self.segment_at_beat(beat);
        segment.seconds + segment_seconds(segment, beat - segment.beat)
    }

    /// The beat at `seconds`.
    pub fn beat_at(&self, seconds: f64) -> f64 {
        let segment = self.segment_at_seconds(seconds);
        segment.beat + segment_beats(segment, seconds - segment.seconds)
    }

    /// The tempo heard at `beat`.
    pub fn bpm_at(&self, beat: f64) -> f64 {
        let segment = self.segment_at_beat(beat);
        let seconds = segment_seconds(segment, beat - segment.beat);
        segment.bpm + 2.0 * segment.slope * seconds
    }

    /// The first tempo.
    pub fn first_bpm(&self) -> f64 {
        self.segments[0].bpm
    }

    /// The meter at `beat` (4/4 before any).
    pub fn meter_at(&self, beat: f64) -> (u32, u32) {
        self.meters
            .iter()
            .rev()
            .find(|meter| meter.beat <= beat)
            .map_or((4, 4), |meter| (meter.numerator, meter.denominator))
    }

    /// Number of tempo changes after the first.
    pub fn tempo_changes(&self) -> usize {
        self.segments.len() - 1
    }

    /// Number of meter changes after the first.
    pub fn meter_changes(&self) -> usize {
        self.meters.len().saturating_sub(1)
    }

    /// The Molecule `tempo_map`: one event per tempo or meter change, a ramp cut
    /// at a meter change keeping its course (the cut takes the tempo heard there).
    pub fn molecule_events(&self) -> Vec<TempoEvent> {
        let mut beats: Vec<f64> = self.segments.iter().map(|s| s.beat).collect();
        beats.extend(self.meters.iter().map(|m| m.beat));
        beats.sort_by(f64::total_cmp);
        beats.dedup();
        let mut events: Vec<TempoEvent> = Vec::with_capacity(beats.len());
        for beat in beats {
            let seconds = self.seconds_at(beat);
            if events
                .last()
                .is_some_and(|last| last.start_seconds == seconds)
            {
                continue;
            }
            let segment = self.segment_at_beat(beat);
            let (beats_per_bar, beat_unit) = self.meter_at(beat);
            events.push(TempoEvent {
                start_seconds: if events.is_empty() { 0.0 } else { seconds },
                bpm: self.bpm_at(beat),
                beats_per_bar,
                beat_unit,
                ramp: segment.slope != 0.0,
            });
        }
        events
    }
}

#[cfg(test)]
mod tests {
    use super::{MeterPoint, TempoMap, TempoPoint};

    #[test]
    fn beats_and_seconds_both_ways_over_a_ramp() {
        let map = TempoMap::new(
            vec![
                TempoPoint {
                    beat: 0.0,
                    bpm: 120.0,
                    ramp: true,
                },
                TempoPoint {
                    beat: 8.0,
                    bpm: 60.0,
                    ramp: false,
                },
            ],
            vec![MeterPoint {
                beat: 0.0,
                numerator: 4,
                denominator: 4,
            }],
        )
        .expect("map");
        // An even glide from 120 to 60 bpm over 8 beats lasts 120 × 8 / (120 + 60) s.
        let end = map.seconds_at(8.0);
        assert!((end - 16.0 / 3.0).abs() < 1e-12);
        assert!((map.beat_at(end) - 8.0).abs() < 1e-9);
        assert!((map.seconds_at(9.0) - end - 1.0).abs() < 1e-12);
        assert!((map.bpm_at(8.0) - 60.0).abs() < 1e-9);
        assert_eq!(map.molecule_events().len(), 2);
    }
}
