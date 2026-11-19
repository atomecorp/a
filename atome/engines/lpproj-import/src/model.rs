//! The normalized Loopy Pro project: only what playback needs, in the units the
//! bundle stores. Every time is in beats (quarter notes) of the project clock, the
//! unit of Loopy Pro's own `duration`, `offset` and `resourceSubregion` values; the
//! seconds are derived from the clock tempo, never stored twice.

use serde::Serialize;

/// The project clock (`Clock`): the tempo every clip is played at.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LoopyClock {
    pub tempo_bpm: f64,
    pub beats_per_bar: u32,
    /// Length of the master loop in beats (`masterLength`), absent on old projects.
    pub master_length_beats: Option<f64>,
}

/// One page of the project (`Scene` in the bundle): a grid of clip cells.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LoopyPage {
    /// Object id of the page in the bundle (stable across reads of one bundle).
    pub source_id: i64,
    pub title: Option<String>,
    pub columns: u32,
    pub rows: u32,
    pub clips: Vec<LoopyClip>,
}

/// The cell a clip covers in its page (`frame`: column, row, width, height in cells).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct LoopyCell {
    pub column: f64,
    pub row: f64,
    pub width: f64,
    pub height: f64,
}

/// One clip of a page (`Track` in the bundle): a looping instance of audio segments.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LoopyClip {
    /// Object id of the clip in the bundle: the key that pairs it with its atome clip.
    pub source_id: i64,
    pub page_id: i64,
    pub cell: LoopyCell,
    pub title: Option<String>,
    /// The clip's loop length in beats (`duration`).
    pub length_beats: f64,
    /// Loops while playing (`loop`) unless it is a one-shot (`playOnce`).
    pub looping: bool,
    pub play_once: bool,
    pub reverse: bool,
    /// Tape speed (`speed`, pitch follows) and time-stretch rate (`rate`, pitch kept).
    pub speed: f64,
    pub rate: f64,
    /// Pitch shift in semitones (`pitch`).
    pub pitch_semitones: f64,
    pub volume: f64,
    /// The clip's fades, its own or the project default's (a clip's `-1`).
    pub fade_in: LoopyFade,
    pub fade_out: LoopyFade,
    pub segments: Vec<LoopySegment>,
}

/// A fade as the bundle stores it: a duration and the code of its unit
/// (`fadeInUnit`). The unit codes are not documented; only a zero duration (no
/// fade) is converted, any other is reported, never guessed.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct LoopyFade {
    pub duration: f64,
    pub unit_code: Option<i64>,
}

/// One audio segment of a clip (`AudioSegment` inside a `Layer`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LoopySegment {
    pub source_id: i64,
    /// The shared audio resource it plays (`resourceId`, a file of `Resources/`).
    pub resource_id: String,
    /// Where the segment starts on its clip's time, in beats of the clock (`offset`):
    /// negative when the loop shows a later part of a longer take.
    pub clip_offset_beats: f64,
    /// How long it lasts on its clip's time, in beats of the clock (`duration`). Its
    /// source is stretched to keep its beats: a source beat is a clock beat.
    pub duration_beats: f64,
    /// Where it starts reading its resource and how much it reads, in beats of the
    /// resource's own tempo (`resourceSubregion`).
    pub source_offset_beats: f64,
    pub source_length_beats: f64,
    /// Tempo the resource was recorded at (`originalTempo`): the time-stretch reference.
    pub original_tempo_bpm: f64,
    /// Boundary ramps (Loopy Pro's anti-click crossfades), in beats.
    pub ramp_in_beats: Option<f64>,
    pub ramp_out_beats: Option<f64>,
    /// The region of the clip's time it folds into (`wrapRegion`: offset, duration in
    /// beats), for a segment recorded across that region's end.
    pub wrap_region: Option<(f64, f64)>,
    pub volume: f64,
    pub layer_volume: f64,
    pub enabled: bool,
}

/// One audio file of the bundle, shared by every segment that names it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LoopyResource {
    pub resource_id: String,
    /// File name inside `Resources/`.
    pub file_name: String,
    /// SHA-256 of the file's bytes: the identity used to never store it twice.
    pub sha256: String,
    pub byte_length: u64,
}

/// Something the bundle holds that this importer does not carry over, named exactly.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LoopyUnsupported {
    pub kind: String,
    pub source_id: Option<i64>,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LoopyProject {
    pub clock: LoopyClock,
    pub pages: Vec<LoopyPage>,
    pub resources: Vec<LoopyResource>,
    pub unsupported: Vec<LoopyUnsupported>,
}

impl LoopyClock {
    pub fn seconds(&self, beats: f64) -> f64 {
        beats * 60.0 / self.tempo_bpm
    }
}
