// A strip frozen (R-370, todo/gel_automatique_pistes_2026-11-25.md): the first steps of its chain — its source (its
// track's voices or its instrument) and the leading `dsp` modules that have no tail and touch nothing else — are read
// from a stem rendered offline by the same engine, at the strip's timeline position, instead of being computed. The
// rest of the strip (volume, pan, sends, modules with a tail, its output) stays live, so what a person touches in a
// show never waits for a render. A stem is a regenerable derivative of the description, never its truth: it lives in
// memory only, and its key says which description it was rendered from.
//
// The control thread offers a stem or a thaw (`FreezeSlot::offer`); the render thread adopts it at a chunk's start
// (`FreezeRun::adopt`, never blocking) and blends the stem in: in over FADE_IN_SECONDS, out over FADE_OUT_SECONDS.
// The thaw's long fade is the hand-over: the stem equals the warm chain, the chain restarts cold, so their crossfade
// lets what the cold chain misses (the release of a note held across the thaw) die away instead of stopping.

use crate::graph::MAX_BLOCK;
use kira::Frame;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

pub const FADE_IN_SECONDS: f64 = 0.021;
pub const FADE_OUT_SECONDS: f64 = 1.0;
// A module ringing longer than this after its input stops stays live (freeze_graph.rs).
pub const LONG_TAIL_SECONDS: f64 = 0.089;
// Packed 24-bit samples: 3 bytes each, two channels.
pub const BYTES_PER_FRAME: usize = 6;
const FULL: f32 = 8_388_607.0;

/// A stem: the strip's frozen part rendered offline, frame 0 at timeline 0 s, packed in 24 bits.
pub struct Stem {
    // Shared, so the render thread publishes it without allocating.
    pub key: Arc<str>,
    pub rate: u32,
    // The chain steps it replaces (its source always).
    pub steps: usize,
    data: Vec<u8>,
}

fn pack(sample: f32) -> [u8; 3] {
    let value = (sample.clamp(-1.0, 1.0) * FULL).round() as i32;
    let bytes = value.to_le_bytes();
    [bytes[0], bytes[1], bytes[2]]
}

fn unpack(bytes: &[u8]) -> f32 {
    // Sign-extended from the third byte.
    let value = i32::from_le_bytes([0, bytes[0], bytes[1], bytes[2]]) >> 8;
    value as f32 / FULL
}

impl Stem {
    pub fn new(key: &str, rate: u32, steps: usize, frames: &[Frame]) -> Self {
        let mut stem = Self::with_capacity(key, rate, steps, frames.len());
        stem.push(frames);
        stem
    }

    /// An empty stem filled by `push` as its render goes (freeze_store.rs), room made for `frames`.
    pub fn with_capacity(key: &str, rate: u32, steps: usize, frames: usize) -> Self {
        Self {
            key: Arc::from(key),
            rate,
            steps,
            data: Vec::with_capacity(frames * BYTES_PER_FRAME),
        }
    }

    pub fn push(&mut self, frames: &[Frame]) {
        for frame in frames {
            self.data.extend_from_slice(&pack(frame.left));
            self.data.extend_from_slice(&pack(frame.right));
        }
    }

    pub fn frames(&self) -> usize {
        self.data.len() / BYTES_PER_FRAME
    }

    /// What it holds in memory, for the budget.
    pub fn bytes(&self) -> usize {
        self.data.len()
    }

    // Silence past its end (the timeline's sound has ended there).
    fn frame(&self, index: usize) -> Frame {
        let at = index * BYTES_PER_FRAME;
        match self.data.get(at..at + BYTES_PER_FRAME) {
            Some(bytes) => Frame::new(unpack(&bytes[..3]), unpack(&bytes[3..])),
            None => Frame::ZERO,
        }
    }
}

enum Offer {
    Freeze(Arc<Stem>),
    Thaw,
}

// Stems a render thread may hold before the control thread collects them (one per offer between two collects).
const RETIRED_CAPACITY: usize = 8;

/// One strip's freeze: what the control thread offers and reads, and the render thread's state, which lives here
/// (not in the compiled graph) so a program applied again keeps what the strip hears.
pub struct FreezeSlot {
    pending: Mutex<Option<Offer>>,
    // How far the stem is heard, 0 (live) to 1 (frozen), as the render thread last left it.
    mix: AtomicU32,
    // The stem being heard: its key, read by the control thread.
    heard: Mutex<Option<Arc<str>>>,
    // Stems no longer heard, freed off the render thread.
    retired: Mutex<Vec<Arc<Stem>>>,
    // Locked by the render thread only (never contended): `try_lock` there always succeeds.
    run: Mutex<FreezeRun>,
}

impl Default for FreezeSlot {
    fn default() -> Self {
        Self {
            pending: Mutex::new(None),
            mix: AtomicU32::new(0f32.to_bits()),
            heard: Mutex::new(None),
            retired: Mutex::new(Vec::with_capacity(RETIRED_CAPACITY)),
            run: Mutex::new(FreezeRun {
                stem: None,
                mix: 0.0,
                target: 0.0,
                stem_buffer: vec![Frame::ZERO; MAX_BLOCK],
                parked: Vec::with_capacity(RETIRED_CAPACITY),
            }),
        }
    }
}

impl FreezeSlot {
    pub fn offer_freeze(&self, stem: Arc<Stem>) -> Result<(), String> {
        self.offer(Offer::Freeze(stem))
    }

    pub fn offer_thaw(&self) -> Result<(), String> {
        self.offer(Offer::Thaw)
    }

    fn offer(&self, offer: Offer) -> Result<(), String> {
        *self
            .pending
            .lock()
            .map_err(|error| format!("freeze lock: {error}"))? = Some(offer);
        Ok(())
    }

    /// 0 live, 1 frozen; between, a fade under way.
    pub fn mix(&self) -> f32 {
        f32::from_bits(self.mix.load(Ordering::Acquire))
    }

    /// The key of the stem heard (frozen, or fading in or out), if any.
    pub fn heard(&self) -> Option<String> {
        self.heard
            .lock()
            .ok()
            .and_then(|heard| heard.as_deref().map(str::to_string))
    }

    /// Frees the stems the render thread left (control thread).
    pub fn collect(&self) {
        if let Ok(mut retired) = self.retired.lock() {
            retired.clear();
            retired.reserve(RETIRED_CAPACITY);
        }
    }

    /// Render thread, at a chunk's start: the offer taken, and the steps skipped this chunk (all those the stem
    /// replaces once it is fully heard; none while it fades or is absent) and those it stands for while heard.
    pub fn begin(&self) -> FreezeChunk {
        let Ok(mut run) = self.run.try_lock() else {
            return FreezeChunk::default();
        };
        run.hand_over(self);
        // An offer waits while no stem could be retired (the control thread has not collected yet).
        if run.has_room() {
            let offer = self
                .pending
                .try_lock()
                .ok()
                .and_then(|mut pending| pending.take());
            match offer {
                Some(Offer::Freeze(stem)) => {
                    if let Some(previous) = run.stem.replace(stem) {
                        // A new render of the same strip: heard at once (they sound the same).
                        run.retire(self, previous);
                    }
                    run.target = 1.0;
                    run.publish_heard(self);
                }
                Some(Offer::Thaw) => run.target = 0.0,
                None => {}
            }
        }
        FreezeChunk {
            skipped: run
                .stem
                .as_ref()
                .filter(|_| run.mix >= 1.0 && run.target >= 1.0)
                .map(|stem| stem.steps),
            replaced: run.stem.as_ref().map(|stem| stem.steps),
        }
    }

    /// Render thread: blends the stem into `work` (the strip's first pair, after the steps it replaces);
    /// `seconds_at(i)` says where the timeline stands at the chunk's frame `i` (None: stopped, the stem silent).
    pub fn blend(&self, work: &mut [Frame], seconds_at: impl Fn(usize) -> Option<f64>) {
        if let Ok(mut run) = self.run.try_lock() {
            run.blend(self, work, seconds_at);
        }
    }
}

/// What a strip does with its stem this chunk.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FreezeChunk {
    pub skipped: Option<usize>,
    pub replaced: Option<usize>,
}

struct FreezeRun {
    stem: Option<Arc<Stem>>,
    mix: f32,
    target: f32,
    stem_buffer: Vec<Frame>,
    // Stems retired while the shared list was busy, handed over at a later chunk.
    parked: Vec<Arc<Stem>>,
}

impl FreezeRun {
    // Callers check `has_room` first: nothing is ever freed or allocated on the render thread.
    fn retire(&mut self, slot: &FreezeSlot, stem: Arc<Stem>) {
        self.parked.push(stem);
        self.hand_over(slot);
    }

    fn has_room(&self) -> bool {
        self.parked.len() < self.parked.capacity()
    }

    // The parked stems join the shared list when it is free and has room (its capacity reserved off this thread).
    fn hand_over(&mut self, slot: &FreezeSlot) {
        if self.parked.is_empty() {
            return;
        }
        let Ok(mut retired) = slot.retired.try_lock() else {
            return;
        };
        while retired.len() < retired.capacity()
            && let Some(stem) = self.parked.pop()
        {
            retired.push(stem);
        }
    }

    fn publish_heard(&self, slot: &FreezeSlot) {
        if let Ok(mut heard) = slot.heard.try_lock() {
            // The key the stem shares (no allocation); the one replaced stays held by its parked stem.
            *heard = self.stem.as_ref().map(|stem| stem.key.clone());
        }
    }

    fn blend(
        &mut self,
        slot: &FreezeSlot,
        work: &mut [Frame],
        seconds_at: impl Fn(usize) -> Option<f64>,
    ) {
        let Some(stem) = self.stem.as_ref() else {
            return;
        };
        let frames = work.len().min(self.stem_buffer.len());
        let rate = f64::from(stem.rate);
        for (index, out) in self.stem_buffer[..frames].iter_mut().enumerate() {
            *out = match seconds_at(index) {
                Some(seconds) if seconds >= 0.0 => stem.frame((seconds * rate).round() as usize),
                _ => Frame::ZERO,
            };
        }
        let step_in = (1.0 / (FADE_IN_SECONDS * rate)) as f32;
        let step_out = (1.0 / (FADE_OUT_SECONDS * rate)) as f32;
        for (live, frozen) in work[..frames].iter_mut().zip(&self.stem_buffer[..frames]) {
            if self.mix < self.target {
                self.mix = (self.mix + step_in).min(self.target);
            } else if self.mix > self.target {
                self.mix = (self.mix - step_out).max(self.target);
            }
            // Linear: the two signals are the same sound (correlated), so their sum keeps its level.
            *live = *frozen * self.mix + *live * (1.0 - self.mix);
        }
        slot.mix.store(self.mix.to_bits(), Ordering::Release);
        if self.mix <= 0.0 && self.target <= 0.0 && self.has_room() {
            if let Some(stem) = self.stem.take() {
                self.retire(slot, stem);
            }
            self.publish_heard(slot);
        }
    }
}

#[cfg(test)]
#[path = "freeze_tests.rs"]
mod tests;
