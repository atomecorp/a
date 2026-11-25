// Where the music stands for a processor that counts in beats (R-367: the
// stutter, the chopper, the chaos, a synced delay). The host gives it at the
// start of every block (`Processor::set_transport`); between two blocks, and
// with no host clock at all (a live input while nothing plays, a test), the
// processor's own `BeatClock` runs on at the last tempo it heard, so a beat
// division always means something.

// A quarter note per beat; 120 bpm until a host says otherwise.
pub const DEFAULT_BEATS_PER_SECOND: f64 = 2.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Transport {
    // Whether the timeline plays (its clock then moves with the song position).
    pub playing: bool,
    // The beat at the block's first frame, counted from the timeline's start.
    pub beat: f64,
    pub beats_per_second: f64,
}

impl Default for Transport {
    fn default() -> Self {
        Self {
            playing: false,
            beat: 0.0,
            beats_per_second: DEFAULT_BEATS_PER_SECOND,
        }
    }
}

// One tempo of a tempo map: `bpm` from `start_seconds` until the next one, or, `ramp`, gliding evenly in time to the
// next one's (the Molecule model, time_model.js#rampSlope; R-379 also counts its MIDI clock on it).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TempoPoint {
    pub start_seconds: f64,
    pub bpm: f64,
    pub ramp: bool,
}

// The ramp's k of `beats = (bpm t + k t²) / 60` over the change `index` (0 when it holds its tempo).
fn slope(map: &[TempoPoint], index: usize) -> f64 {
    match (map.get(index), map.get(index + 1)) {
        (Some(point), Some(next)) if point.ramp && next.start_seconds > point.start_seconds => {
            (next.bpm - point.bpm) / (2.0 * (next.start_seconds - point.start_seconds))
        }
        _ => 0.0,
    }
}

fn segment_beats(point: &TempoPoint, slope: f64, seconds: f64) -> f64 {
    (point.bpm * seconds + slope * seconds * seconds) / 60.0
}

// The change heard at `seconds` (the first one before it) and the beat it starts on.
fn segment_at(map: &[TempoPoint], seconds: f64) -> (usize, f64) {
    let mut beat = 0.0;
    let mut index = 0;
    while index + 1 < map.len() && seconds >= map[index + 1].start_seconds {
        beat += segment_beats(
            &map[index],
            slope(map, index),
            map[index + 1].start_seconds - map[index].start_seconds,
        );
        index += 1;
    }
    (index, beat)
}

// The beat a transport stands on at `seconds`, and its tempo there (beats a second), through a tempo map (sorted,
// starting at 0), its ramps included. An empty map is 120 bpm.
pub fn beat_at(map: &[TempoPoint], seconds: f64) -> (f64, f64) {
    if map.is_empty() {
        return (seconds * DEFAULT_BEATS_PER_SECOND, DEFAULT_BEATS_PER_SECOND);
    }
    let (index, beat) = segment_at(map, seconds);
    let point = &map[index];
    let k = slope(map, index);
    let elapsed = (seconds - point.start_seconds).max(0.0);
    (
        beat + segment_beats(point, k, elapsed),
        (point.bpm + 2.0 * k * elapsed) / 60.0,
    )
}

// The time of `beat` (seconds) through the same map: the inverse of `beat_at`, a ramp's quadratic solved.
pub fn seconds_at_beat(map: &[TempoPoint], beat: f64) -> f64 {
    if map.is_empty() {
        return beat / DEFAULT_BEATS_PER_SECOND;
    }
    let mut start_beat = 0.0;
    let mut index = 0;
    while index + 1 < map.len() {
        let length = segment_beats(
            &map[index],
            slope(map, index),
            map[index + 1].start_seconds - map[index].start_seconds,
        );
        if beat < start_beat + length {
            break;
        }
        start_beat += length;
        index += 1;
    }
    let point = &map[index];
    let k = slope(map, index);
    let beats = (beat - start_beat).max(0.0) * 60.0;
    let elapsed = if k.abs() < 1e-12 {
        beats / point.bpm
    } else {
        (-point.bpm + (point.bpm * point.bpm + 4.0 * k * beats).max(0.0).sqrt()) / (2.0 * k)
    };
    point.start_seconds + elapsed
}

// A processor's own count of beats, frame by frame.
#[derive(Debug, Clone, Copy)]
pub struct BeatClock {
    beat: f64,
    beats_per_second: f64,
    sample_rate: f64,
    playing: bool,
}

impl BeatClock {
    pub fn new() -> Self {
        Self {
            beat: 0.0,
            beats_per_second: DEFAULT_BEATS_PER_SECOND,
            sample_rate: 48000.0,
            playing: false,
        }
    }

    pub fn prepare(&mut self, sample_rate: f32) {
        self.sample_rate = f64::from(sample_rate.max(1.0));
    }

    pub fn sync(&mut self, transport: &Transport) {
        if transport.beats_per_second.is_finite() && transport.beats_per_second > 0.0 {
            self.beats_per_second = transport.beats_per_second;
        }
        if transport.beat.is_finite() {
            self.beat = transport.beat;
        }
        self.playing = transport.playing;
    }

    pub fn beat(&self) -> f64 {
        self.beat
    }

    pub fn playing(&self) -> bool {
        self.playing
    }

    // Frames that `beats` last at the current tempo.
    pub fn frames_of(&self, beats: f64) -> f64 {
        beats / self.beats_per_second * self.sample_rate
    }

    pub fn advance(&mut self) {
        self.beat += self.beats_per_second / self.sample_rate;
    }

    pub fn reset(&mut self) {
        self.beat = 0.0;
    }
}

impl Default for BeatClock {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tempo_map_counts_its_beats_piece_by_piece() {
        let map = [
            TempoPoint {
                start_seconds: 0.0,
                bpm: 120.0,
                ramp: false,
            },
            TempoPoint {
                start_seconds: 2.0,
                bpm: 60.0,
                ramp: false,
            },
        ];
        assert_eq!(beat_at(&map, 1.0), (2.0, 2.0));
        assert_eq!(beat_at(&map, 4.0), (6.0, 1.0));
        assert_eq!(beat_at(&[], 1.5), (3.0, 2.0));
        assert!((seconds_at_beat(&map, 6.0) - 4.0).abs() < 1e-12);
        assert!((seconds_at_beat(&map, 2.0) - 1.0).abs() < 1e-12);
    }

    // 60 bpm gliding to 120 over 4 s: 6 beats in the ramp (time_model.js counts the same), its tempo heard halfway 90.
    #[test]
    fn a_ramp_glides_both_ways() {
        let map = [
            TempoPoint {
                start_seconds: 0.0,
                bpm: 60.0,
                ramp: true,
            },
            TempoPoint {
                start_seconds: 4.0,
                bpm: 120.0,
                ramp: false,
            },
        ];
        let (beat, bps) = beat_at(&map, 2.0);
        assert!((beat - 2.5).abs() < 1e-12);
        assert!((bps - 1.5).abs() < 1e-12);
        assert!((beat_at(&map, 4.0).0 - 6.0).abs() < 1e-12);
        assert!((beat_at(&map, 5.0).0 - 8.0).abs() < 1e-12);
        for beat in [0.0, 1.0, 2.5, 5.9, 6.0, 8.0] {
            let seconds = seconds_at_beat(&map, beat);
            assert!(
                (beat_at(&map, seconds).0 - beat).abs() < 1e-9,
                "beat {beat}"
            );
        }
    }

    #[test]
    fn a_clock_runs_on_at_the_tempo_it_heard() {
        let mut clock = BeatClock::new();
        clock.prepare(100.0);
        clock.sync(&Transport {
            playing: true,
            beat: 4.0,
            beats_per_second: 1.0,
        });
        for _ in 0..50 {
            clock.advance();
        }
        assert!((clock.beat() - 4.5).abs() < 1e-9);
        assert!((clock.frames_of(0.25) - 25.0).abs() < 1e-9);
    }
}
