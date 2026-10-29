// A segment is a sample, its region and how it is read (the Segment brick, S3a):
// once forward or backward, a loop that runs to the note's end (continuous) or
// while the key is held (sustain: the release plays the rest), back and forth
// or round, a given number of passes, an equal-power splice at the loop seam.
// Positions are source frames; a region end and a loop end are exclusive.
// Its markers (markers.rs) fire as the reading crosses them: a player stops
// its block on the frame that crossed one, or wrapped its loop, so the voice
// acts on that frame. A player reads through a `Source` (reading.rs): spans
// in memory, and for a streamed sample its ring, aimed at each render.

use crate::interp::{dot, first_tap, weights, SincTables, TAPS};
use crate::markers::{crossed, Hits, Marker, MarkerSpan, EDGE};
use crate::reading::{Source, Window};
use crate::sample::SampleData;
use std::f64::consts::FRAC_PI_2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Playback {
    Forward,
    Reverse,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoopMode {
    Continuous,
    Sustain,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LoopSpec {
    pub start: usize,
    pub end: usize,
    pub mode: LoopMode,
    pub ping_pong: bool,
    // Splice length in frames, taken before the loop start (forward round loops).
    pub crossfade: usize,
    // Passes before the loop lets go; 0 loops for ever.
    pub count: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Segment {
    pub sample: usize,
    pub start: usize,
    pub end: usize,
    // Frames skipped at the start, plus `velocity_offset` × velocity.
    pub offset: usize,
    pub velocity_offset: usize,
    pub root: u8,
    pub tune_cents: f32,
    pub gain_db: f32,
    pub pan: f32,
    pub playback: Playback,
    pub looping: Option<LoopSpec>,
    // Duration factor apart from pitch (1 = as recorded): read through the stretcher.
    pub stretch: f32,
    // Its markers in the instrument's marker table.
    pub markers: MarkerSpan,
}

impl Segment {
    // The whole sample, read once forward at its own pitch on `root`.
    pub fn whole(sample: usize, frames: usize, root: u8) -> Self {
        Self { sample, start: 0, end: frames, offset: 0, velocity_offset: 0, root, tune_cents: 0.0, gain_db: 0.0, pan: 0.0, playback: Playback::Forward, looping: None, stretch: 1.0, markers: MarkerSpan { first: 0, len: 0 } }
    }

    pub fn is_stretched(&self) -> bool {
        self.stretch != 1.0
    }

    pub fn validate(&self, data: &SampleData) -> Result<(), String> {
        let frames = data.frames();
        if self.start >= self.end || self.end > frames {
            return Err(format!("segment region {}..{} outside the sample's {} frames", self.start, self.end, frames));
        }
        if self.is_stretched() {
            if cfg!(target_arch = "wasm32") {
                return Err("real-time stretch is not built for this platform".into());
            }
            if !(0.25..=4.0).contains(&self.stretch) {
                return Err(format!("stretch ×{} outside ×0.25..×4", self.stretch));
            }
        }
        if let Some(spec) = self.looping {
            if spec.start < self.start || spec.end > self.end || spec.start + 2 > spec.end {
                return Err(format!("loop {}..{} outside its region {}..{}", spec.start, spec.end, self.start, self.end));
            }
            if spec.crossfade > 0 && (spec.ping_pong || spec.crossfade > spec.start || spec.crossfade > spec.end - spec.start) {
                return Err("a loop splice needs a round loop, as long as the loop at most, with that much sound before it".into());
            }
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
pub struct SegmentPlayer {
    segment: Segment,
    position: f64,
    direction: f64,
    looping: bool,
    passes: u32,
    finished: bool,
    mono: bool,
    gain_left: f32,
    gain_right: f32,
    // Its ring among the sampler's (voice × player); `reaim`: started or
    // moved since its last render, so its ring is aimed anew.
    ring: usize,
    reaim: bool,
}

impl SegmentPlayer {
    pub const IDLE: Self = Self {
        segment: Segment { sample: 0, start: 0, end: 1, offset: 0, velocity_offset: 0, root: 60, tune_cents: 0.0, gain_db: 0.0, pan: 0.0, playback: Playback::Forward, looping: None, stretch: 1.0, markers: MarkerSpan { first: 0, len: 0 } },
        position: 0.0,
        direction: 1.0,
        looping: false,
        passes: 0,
        finished: true,
        mono: false,
        gain_left: 0.0,
        gain_right: 0.0,
        ring: 0,
        reaim: false,
    };

    pub fn start(&mut self, segment: Segment, data: &SampleData, velocity: f32, level: f32) {
        let skip = segment.offset as f64 + (segment.velocity_offset as f64 * velocity as f64).round();
        let (position, direction) = match segment.playback {
            Playback::Forward => ((segment.start as f64 + skip).min(segment.end as f64 - 1.0), 1.0),
            Playback::Reverse => ((segment.end as f64 - 1.0 - skip).max(segment.start as f64), -1.0),
        };
        let amplitude = atome_dsp::db_to_amplitude(segment.gain_db) * level;
        let angle = (segment.pan.clamp(-1.0, 1.0) + 1.0) * 0.25 * std::f32::consts::PI;
        *self = Self {
            segment,
            position,
            direction,
            looping: segment.looping.is_some(),
            passes: 0,
            finished: false,
            mono: data.is_mono(),
            gain_left: amplitude * angle.cos() * std::f32::consts::SQRT_2,
            gain_right: amplitude * angle.sin() * std::f32::consts::SQRT_2,
            ring: self.ring,
            reaim: true,
        };
    }

    pub fn segment(&self) -> &Segment {
        &self.segment
    }

    pub fn ring(&self) -> usize {
        self.ring
    }

    pub fn set_ring(&mut self, ring: usize) {
        self.ring = ring;
    }

    pub fn is_finished(&self) -> bool {
        self.finished
    }

    pub fn passes(&self) -> u32 {
        self.passes
    }

    pub fn position(&self) -> f64 {
        self.position
    }

    // The key is up: a sustain loop lets go and the rest of the region plays.
    pub fn release(&mut self) {
        if self.looping && matches!(self.segment.looping, Some(LoopSpec { mode: LoopMode::Sustain, .. })) {
            self.let_go();
        }
    }

    pub fn stop(&mut self) {
        self.finished = true;
    }

    // A jump to `frame` (no marker fires). A loop the jump leaves behind lets go.
    pub fn seek(&mut self, frame: usize) {
        self.position = (frame as f64).clamp(self.segment.start as f64, self.segment.end as f64 - 1.0);
        if let Some(spec) = self.segment.looping.filter(|_| self.looping) {
            let past = if self.direction > 0.0 { self.position >= spec.end as f64 } else { self.position < spec.start as f64 };
            if past {
                self.let_go();
            }
        }
        self.finished = false;
        self.reaim = true;
    }

    // Adds up to `left.len()` frames read at `step` source frames per output
    // frame; stops after a frame that crossed a marker of `markers` (the
    // segment's own, sorted) or wrapped the loop, listed in `hits`. Answers the
    // frames rendered (fewer only on a hit or at the segment's end).
    #[allow(clippy::too_many_arguments)]
    pub fn render(&mut self, source: &Source, tables: &SincTables, step: f64, markers: &[Marker], left: &mut [f32], right: &mut [f32], hits: &mut Hits) -> usize {
        hits.clear();
        // A loop is left in the region's own direction: the ring waits there.
        let leaving = if self.looping { if self.segment.playback == Playback::Forward { 1.0 } else { -1.0 } } else { self.direction };
        source.aim(self.position, leaving, std::mem::take(&mut self.reaim));
        source.release(self.position);
        let frames = left.len();
        let mut at = 0;
        while at < frames && !self.finished {
            let (plain, window) = self.plain_frames(source, step, markers);
            let plain = plain.min(frames - at);
            if let Some(window) = window.filter(|_| plain > 0) {
                let from = self.position;
                self.render_plain(&window, tables, step, &mut left[at..at + plain], &mut right[at..at + plain]);
                at += plain;
                crossed(markers, from, self.position, |index| hits.push(index));
            } else {
                let (l, r) = self.frame(source, tables, step);
                left[at] += l * self.gain_left;
                right[at] += r * self.gain_right;
                self.advance(step, markers, hits);
                at += 1;
            }
            if hits.any() {
                break;
            }
        }
        at
    }

    // Frames that can be read forward with no seam, no wrap and every tap inside
    // one window (a span in memory, or the ring): the common case, rendered
    // without a test per frame. The run ends on the frame that crosses the next marker.
    fn plain_frames<'a>(&self, source: &Source<'a>, step: f64, markers: &[Marker]) -> (usize, Option<Window<'a>>) {
        if self.direction < 0.0 || self.position < (TAPS / 2) as f64 {
            return (0, None);
        }
        let Some(window) = source.window(first_tap(self.position.floor() as i64)) else { return (0, None) };
        let half = (TAPS / 2) as f64;
        let mut limit = (window.end as f64 - half - 1.0).min(self.segment.end as f64);
        if self.looping {
            let spec = self.segment.looping.expect("looping player has a loop");
            let seam = if spec.crossfade > 0 { spec.end - spec.crossfade } else { spec.end };
            limit = limit.min(seam as f64 - if spec.crossfade == 0 && !spec.ping_pong { half + 1.0 } else { 0.0 });
        }
        let room = limit - self.position;
        if room <= 0.0 {
            return (0, None);
        }
        let frames = ((room / step).floor() as usize).saturating_sub(1);
        let next = markers.partition_point(|marker| marker.frame as f64 <= self.position);
        let frames = match markers.get(next) {
            Some(marker) => frames.min(((marker.frame as f64 - self.position) / step).ceil() as usize),
            None => frames,
        };
        (frames, Some(window))
    }

    fn render_plain(&mut self, window: &Window, tables: &SincTables, step: f64, left: &mut [f32], right: &mut [f32]) {
        let band = tables.band(step);
        let mut position = self.position;
        let (gain_left, gain_right) = (self.gain_left, self.gain_right);
        for (out_left, out_right) in left.iter_mut().zip(right.iter_mut()) {
            let base = position.floor();
            let w = weights(band, position - base);
            let first = first_tap(base as i64);
            let l = dot(&w, &window.taps(first, false));
            let r = if self.mono { l } else { dot(&w, &window.taps(first, true)) };
            *out_left += l * gain_left;
            *out_right += r * gain_right;
            position += step;
        }
        self.position = position;
    }

    #[inline]
    fn frame(&self, source: &Source, tables: &SincTables, step: f64) -> (f32, f32) {
        let (l, r) = self.read(source, tables, step, self.position);
        let Some(spec) = self.segment.looping else { return (l, r) };
        if !self.looping || spec.crossfade == 0 || self.direction < 0.0 {
            return (l, r);
        }
        let into = self.position - (spec.end - spec.crossfade) as f64;
        if into < 0.0 {
            return (l, r);
        }
        let (fade_in, fade_out) = (into / spec.crossfade as f64 * FRAC_PI_2).sin_cos();
        let (bl, br) = self.read(source, tables, step, self.position - (spec.end - spec.start) as f64);
        (l * fade_out as f32 + bl * fade_in as f32, r * fade_out as f32 + br * fade_in as f32)
    }

    #[inline]
    fn read(&self, source: &Source, tables: &SincTables, step: f64, position: f64) -> (f32, f32) {
        let base = position.floor();
        let weights = tables.weights(step, position - base);
        let Some((left, right)) = self.taps(source, first_tap(base as i64)) else {
            source.starve();
            return (0.0, 0.0);
        };
        let left = dot(&weights, &left);
        (left, if self.mono { left } else { dot(&weights, &right) })
    }

    // The taps from `first`, both channels; None when a frame of the sample is
    // not held yet (its ring is behind).
    #[inline]
    fn taps(&self, source: &Source, first: i64) -> Option<([f32; TAPS], [f32; TAPS])> {
        let last = first + TAPS as i64;
        let wrap = match self.segment.looping {
            Some(spec) if self.looping && spec.crossfade == 0 && !spec.ping_pong && self.direction > 0.0 => Some(spec),
            _ => None,
        };
        let frames = source.frames() as i64;
        let inside = first >= 0 && last <= frames;
        if inside && wrap.is_none_or(|spec| last <= spec.end as i64) {
            if let Some(window) = source.window_over(first, last) {
                return Some((window.taps(first, false), window.taps(first, true)));
            }
        }
        let mut taps = ([0.0f32; TAPS], [0.0f32; TAPS]);
        for tap in 0..TAPS {
            let mut index = first + tap as i64;
            if let Some(spec) = wrap {
                if index >= spec.end as i64 {
                    index = spec.start as i64 + (index - spec.end as i64) % (spec.end - spec.start) as i64;
                }
            }
            if index >= 0 && index < frames {
                (taps.0[tap], taps.1[tap]) = source.frame(index)?;
            }
        }
        Some(taps)
    }

    // One output frame on: the loop's wrap or turn, the markers crossed on the way.
    #[inline]
    fn advance(&mut self, step: f64, markers: &[Marker], hits: &mut Hits) {
        let from = self.position;
        self.position += step * self.direction;
        let segment = self.segment;
        let mut hit = |index| hits.push(index);
        if self.looping {
            let spec = segment.looping.expect("looping player has a loop");
            let (start, end) = (spec.start as f64, spec.end as f64);
            let wrapped = if self.direction > 0.0 && self.position >= end {
                crossed(markers, from, end - EDGE, &mut hit);
                if spec.ping_pong {
                    self.position = 2.0 * end - self.position - 1.0;
                    self.direction = -1.0;
                    crossed(markers, end - EDGE, self.position, &mut hit);
                } else {
                    self.position -= end - start;
                    crossed(markers, start - EDGE, self.position, &mut hit);
                }
                true
            } else if self.direction < 0.0 && self.position < start {
                if spec.ping_pong && segment.playback == Playback::Forward {
                    crossed(markers, from, start, &mut hit);
                    self.position = 2.0 * start - self.position;
                    self.direction = 1.0;
                    crossed(markers, start, self.position, &mut hit);
                } else {
                    crossed(markers, from, start - EDGE, &mut hit);
                    self.position += end - start;
                    crossed(markers, end - EDGE, self.position, &mut hit);
                }
                true
            } else {
                crossed(markers, from, self.position, &mut hit);
                false
            };
            if wrapped {
                hits.wrapped = true;
                self.passes += 1;
                if spec.count > 0 && self.passes >= spec.count {
                    self.let_go();
                }
            }
            return;
        }
        crossed(markers, from, self.position, hit);
        if self.position >= segment.end as f64 || self.position < segment.start as f64 {
            self.finished = true;
        }
    }

    // Leaving a loop resumes the region's own direction.
    fn let_go(&mut self) {
        self.looping = false;
        self.direction = if self.segment.playback == Playback::Forward { 1.0 } else { -1.0 };
    }
}

impl Default for SegmentPlayer {
    fn default() -> Self {
        Self::IDLE
    }
}
