// How a player reads its sample on the render thread: from the spans in memory
// (a whole sample is one span) or from its ring (stream.rs). A window is a run
// of frames readable as contiguous 16-tap rows; a read straddling two windows
// gathers its taps one by one; a frame neither holds yet plays silent and is
// counted as starved. The player aims its ring at the end of the span it is in,
// in the direction it will leave it, so the frames after a head are in the ring
// before the head runs out.

use crate::action_queue::ActionQueue;
use crate::interp::TAPS;
use crate::sample::SampleData;
use crate::stream::{StreamRing, Target, RING_CELLS, RING_FRAMES};
use std::marker::PhantomData;

pub struct Source<'a> {
    data: &'a SampleData,
    sample: usize,
    ring: Option<&'a StreamRing>,
    report: &'a ActionQueue,
}

// Frames `start..end`, frame `f` at cell `(f - base) & mask` of each channel.
#[derive(Clone, Copy)]
pub struct Window<'a> {
    left: *const f32,
    right: *const f32,
    cells: usize,
    base: i64,
    mask: usize,
    pub start: i64,
    pub end: i64,
    life: PhantomData<&'a f32>,
}

impl Window<'_> {
    // The 16 taps from `first` of the left channel, or of the right (a mono
    // sample's right is its left).
    #[inline]
    pub fn taps(&self, first: i64, right: bool) -> [f32; TAPS] {
        let at = ((first - self.base) as usize) & self.mask;
        assert!(first >= self.start && first + TAPS as i64 <= self.end && at + TAPS <= self.cells, "taps inside their window");
        let channel = if right { self.right } else { self.left };
        // SAFETY: `at..at + TAPS` lies in the window's cells (checked above);
        // a ring's readable frames are never written while readable (stream.rs).
        unsafe { std::ptr::read(channel.add(at) as *const [f32; TAPS]) }
    }

    fn contains(&self, first: i64, last: i64) -> bool {
        first >= self.start && last <= self.end
    }
}

impl<'a> Source<'a> {
    pub fn new(data: &'a SampleData, sample: usize, ring: Option<&'a StreamRing>, report: &'a ActionQueue) -> Self {
        Self { data, sample, ring, report }
    }

    pub fn data(&self) -> &'a SampleData {
        self.data
    }

    pub fn frames(&self) -> usize {
        self.data.frames()
    }

    pub fn is_mono(&self) -> bool {
        self.data.is_mono()
    }

    // Aims the ring past the span holding `position`, in `direction` (a read
    // in no span keeps the ring where it is: it is reading it). `force`: a new
    // start, whose earlier frames are gone even if the target is the same.
    pub fn aim(&self, position: f64, direction: f64, force: bool) {
        let Some(ring) = self.ring else { return };
        let frame = position.max(0.0) as usize;
        let Some(span) = self.data.span_at(frame) else {
            if force {
                ring.aim(None, true);
            }
            return;
        };
        let target = if direction > 0.0 {
            (span.end() < self.frames()).then(|| Target { sample: self.sample, reverse: false, origin: span.end() - TAPS })
        } else {
            (span.start > 0).then(|| Target { sample: self.sample, reverse: true, origin: span.start + TAPS })
        };
        ring.aim(target, force);
    }

    // The frames before `position` (after it, reading backward) are read no more.
    pub fn release(&self, position: f64) {
        let Some(ring) = self.ring else { return };
        let Some(target) = ring.target() else { return };
        let frame = position.max(0.0) as i64;
        let origin = target.origin as i64;
        let released = if target.reverse { origin - (frame + 1 + TAPS as i64) } else { frame - TAPS as i64 - origin };
        ring.release(released.max(0) as usize);
    }

    fn span_window(&self, frame: i64) -> Option<Window<'a>> {
        let span = self.data.span_at(usize::try_from(frame).ok()?)?;
        let left = span.frames.left.as_ptr();
        let right = if self.data.is_mono() { left } else { span.frames.right.as_ptr() };
        Some(Window { left, right, cells: span.len(), base: span.start as i64, mask: usize::MAX, start: span.start as i64, end: span.end() as i64, life: PhantomData })
    }

    fn ring_window(&self) -> Option<Window<'a>> {
        let ring = self.ring?;
        let (start, end) = ring.valid()?;
        let (left, right) = ring.cells();
        Some(Window { left, right, cells: RING_CELLS, base: 0, mask: RING_FRAMES - 1, start, end, life: PhantomData })
    }

    // The window holding `first` that reaches furthest forward.
    pub fn window(&self, first: i64) -> Option<Window<'a>> {
        let span = self.span_window(first);
        let ring = self.ring_window().filter(|window| window.start <= first && first < window.end);
        match (span, ring) {
            (Some(span), Some(ring)) => Some(if ring.end > span.end { ring } else { span }),
            (span, ring) => span.or(ring),
        }
    }

    // A window holding `first..last` whole.
    pub fn window_over(&self, first: i64, last: i64) -> Option<Window<'a>> {
        self.span_window(first).filter(|window| window.contains(first, last))
            .or_else(|| self.ring_window().filter(|window| window.contains(first, last)))
    }

    // Frame `index` (inside the sample) wherever it is held.
    pub fn frame(&self, index: i64) -> Option<(f32, f32)> {
        if let Some(found) = self.data.frame(index as usize) {
            return Some(found);
        }
        let window = self.ring_window().filter(|window| window.contains(index, index + 1))?;
        let at = ((index - window.base) as usize) & window.mask;
        // SAFETY: `index` is a readable frame of the ring (stream.rs).
        Some(unsafe { (*window.left.add(at), *window.right.add(at)) })
    }

    // A frame read with taps nobody holds yet: played silent, counted.
    pub fn starve(&self) {
        self.report.count_starved(1);
    }
}
