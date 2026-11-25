// Real-time rhythm effects (R-367): they cut the sound, chop it, repeat it,
// throw it about or slow it down while it passes, on the transport's beats
// (transport.rs). Each has one `active` switch: a touch turns it on or off, a
// note or a pad held keeps it on while held, a painted region of the timeline
// is an automation of it. Their memory is sized once in `prepare`.

pub mod chop;
pub mod glitch;
pub mod speed;
pub mod stutter;

use crate::delay::DelayLine;

// The beat divisions every rhythm effect offers (a quarter note is one beat).
pub const DIVISIONS: [&str; 13] = [
    "1_1", "1_2", "1_4", "1_8", "1_16", "1_32", "1_64", "1_2t", "1_4t", "1_8t", "1_16t", "1_8d",
    "1_16d",
];
const DIVISION_BEATS: [f64; 13] = [
    4.0,
    2.0,
    1.0,
    0.5,
    0.25,
    0.125,
    0.0625,
    4.0 / 3.0,
    2.0 / 3.0,
    1.0 / 3.0,
    1.0 / 6.0,
    0.75,
    0.375,
];

pub fn division_beats(index: usize) -> f64 {
    DIVISION_BEATS[index.min(DIVISION_BEATS.len() - 1)]
}

pub const SWITCH: [&str; 2] = ["off", "on"];

// The longest memory a rhythm effect keeps: a 1/1 slice down to 30 bpm.
pub const MEMORY_SECONDS: f32 = 8.0;
// Every cut is faded over this time, so no edge ever clicks.
pub const EDGE_MS: f32 = 1.5;
// A move back to the live signal crossfades over this time.
pub const RETURN_MS: f32 = 13.0;

// SplitMix64: the same seed and slice always draw the same numbers, so a
// chaos sounds the same on every playback and in every export.
pub fn draw(seed: u64, slice: i64, salt: u64) -> f64 {
    let mut z = seed
        .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        .wrapping_add((slice as u64).wrapping_mul(0xBF58_476D_1CE4_E5B9))
        .wrapping_add(salt.wrapping_mul(0x94D0_49BB_1331_11EB));
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    (z >> 11) as f64 / (1u64 << 53) as f64
}

// The stereo past of the signal, read any number of frames back.
pub struct History {
    lines: [DelayLine; 2],
}

impl History {
    pub fn new() -> Self {
        Self {
            lines: [DelayLine::new(), DelayLine::new()],
        }
    }

    pub fn allocate(&mut self, frames: usize) {
        for line in &mut self.lines {
            line.allocate(frames);
        }
    }

    pub fn capacity(&self) -> usize {
        self.lines[0].capacity()
    }

    #[inline]
    pub fn push(&mut self, left: f32, right: f32) {
        self.lines[0].push(left);
        self.lines[1].push(right);
    }

    // `delay` 1 is the frame just pushed; fractional reads interpolate.
    #[inline]
    pub fn read(&self, delay: f32) -> (f32, f32) {
        (self.lines[0].read(delay), self.lines[1].read(delay))
    }

    #[inline]
    pub fn read_smooth(&self, delay: f32) -> (f32, f32) {
        (
            self.lines[0].read_cubic(delay),
            self.lines[1].read_cubic(delay),
        )
    }

    pub fn clear(&mut self) {
        for line in &mut self.lines {
            line.clear();
        }
    }
}

impl Default for History {
    fn default() -> Self {
        Self::new()
    }
}

// The gain of a piece `length` frames long at `position`: faded in and out
// over `edge` frames at its two ends.
#[inline]
pub fn edge_gain(position: f32, length: f32, edge: f32) -> f32 {
    if edge <= 0.0 || length <= 0.0 {
        return 1.0;
    }
    let edge = edge.min(length * 0.5);
    (position / edge)
        .min((length - position) / edge)
        .clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_draw_is_the_same_for_the_same_seed_and_slice() {
        assert_eq!(draw(1, 42, 0), draw(1, 42, 0));
        assert_ne!(draw(1, 42, 0), draw(2, 42, 0));
        assert_ne!(draw(1, 42, 0), draw(1, 43, 0));
        let value = draw(7, -3, 5);
        assert!((0.0..1.0).contains(&value));
    }

    #[test]
    fn a_piece_fades_at_both_ends() {
        assert_eq!(edge_gain(0.0, 100.0, 10.0), 0.0);
        assert_eq!(edge_gain(50.0, 100.0, 10.0), 1.0);
        assert_eq!(edge_gain(95.0, 100.0, 10.0), 0.5);
    }
}
