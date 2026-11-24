// Scope (R-290, user 23 Nov. 2026): the signal goes through untouched; what it carries is measured for the console's
// picture. Every WINDOW_MS the readings are rewritten from the frames seen in that window:
//   wave_min_N / wave_max_N           the range of the mid channel (0–1, 0.5 the centre) in each of the 48 columns,
//   vecto_N                           the 16 × 16 Lissajous figure (mid up, side across), a log density 0–1, row by row,
//   histo_left_N / _right_N / _mid_N  the amplitude of each channel in 32 bins, each a share of its densest bin.
// The same measures as eVe/domains/rendering/molecule_mix_scope_analysis.js#analyzeSamples.

use crate::{ParamSpec, Processor, StereoBlock};

pub const COLUMNS: usize = 48;
pub const VECTOR_SIDE: usize = 16;
pub const BINS: usize = 32;
pub const READING_COUNT: usize = COLUMNS * 2 + VECTOR_SIDE * VECTOR_SIDE + BINS * 3;
pub const WINDOW_MS: f32 = 50.0;
pub const PARAMS: [ParamSpec; 0] = [];

macro_rules! reading_keys {
    ([$($w:literal),*], [$($v:literal),*], [$($h:literal),*]) => {
        [
            $(concat!("wave_min_", $w),)*
            $(concat!("wave_max_", $w),)*
            $(concat!("vecto_", $v),)*
            $(concat!("histo_left_", $h),)*
            $(concat!("histo_right_", $h),)*
            $(concat!("histo_mid_", $h),)*
        ]
    };
}

pub const READINGS: [&str; READING_COUNT] = reading_keys!(
    [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47
    ],
    [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
        48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
        71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93,
        94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
        113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130,
        131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148,
        149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166,
        167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184,
        185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202,
        203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220,
        221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238,
        239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255
    ],
    [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30, 31
    ]
);

const VECTOR_CELLS: usize = VECTOR_SIDE * VECTOR_SIDE;
const WAVE_MIN: usize = 0;
const WAVE_MAX: usize = COLUMNS;
const VECTO: usize = COLUMNS * 2;
const HISTO: usize = VECTO + VECTOR_CELLS;

pub struct Scope {
    window_frames: usize,
    seen: usize,
    low: [f32; COLUMNS],
    high: [f32; COLUMNS],
    cells: [u32; VECTOR_CELLS],
    bins: [[u32; BINS]; 3],
    readings: [f32; READING_COUNT],
}

fn bin(value01: f32, bins: usize) -> usize {
    ((value01.clamp(0.0, 1.0) * bins as f32) as usize).min(bins - 1)
}

impl Scope {
    pub fn new() -> Self {
        Self {
            window_frames: 2400,
            seen: 0,
            low: [1.0; COLUMNS],
            high: [0.0; COLUMNS],
            cells: [0; VECTOR_CELLS],
            bins: [[0; BINS]; 3],
            readings: [0.0; READING_COUNT],
        }
    }

    fn clear_window(&mut self) {
        self.seen = 0;
        self.low = [1.0; COLUMNS];
        self.high = [0.0; COLUMNS];
        self.cells = [0; VECTOR_CELLS];
        self.bins = [[0; BINS]; 3];
    }

    fn publish(&mut self) {
        for column in 0..COLUMNS {
            let empty = self.low[column] > 1.0;
            self.readings[WAVE_MIN + column] = if empty { 0.5 } else { self.low[column] };
            self.readings[WAVE_MAX + column] = if empty { 0.5 } else { self.high[column] };
        }
        let top = self.cells.iter().copied().max().unwrap_or(0);
        for (index, count) in self.cells.iter().enumerate() {
            self.readings[VECTO + index] = if top == 0 {
                0.0
            } else {
                (*count as f32).ln_1p() / (top as f32).ln_1p()
            };
        }
        for (channel, counts) in self.bins.iter().enumerate() {
            let top = counts.iter().copied().max().unwrap_or(0);
            for (index, count) in counts.iter().enumerate() {
                self.readings[HISTO + channel * BINS + index] = if top == 0 {
                    0.0
                } else {
                    *count as f32 / top as f32
                };
            }
        }
        self.clear_window();
    }
}

impl Default for Scope {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Scope {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.window_frames = ((sample_rate * WINDOW_MS / 1000.0) as usize).max(COLUMNS);
        self.clear_window();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        for frame in 0..block.frames() {
            let (left, right) = (block.left[frame], block.right[frame]);
            let (mid, side) = ((left + right) * 0.5, (left - right) * 0.5);
            let column = (self.seen * COLUMNS / self.window_frames).min(COLUMNS - 1);
            let level = ((mid + 1.0) * 0.5).clamp(0.0, 1.0);
            self.low[column] = self.low[column].min(level);
            self.high[column] = self.high[column].max(level);
            self.cells[bin((1.0 - mid) * 0.5, VECTOR_SIDE) * VECTOR_SIDE
                + bin((side + 1.0) * 0.5, VECTOR_SIDE)] += 1;
            self.bins[0][bin((left + 1.0) * 0.5, BINS)] += 1;
            self.bins[1][bin((right + 1.0) * 0.5, BINS)] += 1;
            self.bins[2][bin(level, BINS)] += 1;
            self.seen += 1;
            if self.seen >= self.window_frames {
                self.publish();
            }
        }
    }

    fn set_param(&mut self, _id: u32, _value: f32) {}

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn reset(&mut self) {
        self.clear_window();
        self.readings = [0.0; READING_COUNT];
    }

    fn readings(&self) -> &[f32] {
        &self.readings
    }
}
