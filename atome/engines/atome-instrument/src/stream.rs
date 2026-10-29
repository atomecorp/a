// Disk streaming (cahier sampler §2, V1.2). A long sample keeps in memory only
// the frames where a read can begin (its heads, residency.rs); the rest is read
// by one worker thread into a ring per player, preallocated with the sampler.
// The render thread never waits: it aims its ring (a request), says how far it
// has read (a cursor), and reads only the frames the worker has published
// (filled). Each is one atomic word tagged with the request's generation, so a
// ring aimed elsewhere is never read with the frames of its previous target.
// A frame the ring does not hold yet plays silent and is counted (starvation,
// reported beside the dropped markers).

use crate::interp::TAPS;
use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

// Frames a ring holds: a power of two, so a frame's slot is its low bits.
// 8192 frames last 170 ms read at pitch (48 kHz), 43 ms two octaves up.
pub const RING_FRAMES: usize = 8192;
const MASK: usize = RING_FRAMES - 1;
// Slots after the ring repeating its first TAPS: any 16 frames it holds are contiguous.
pub const RING_CELLS: usize = RING_FRAMES + TAPS;
// Frames the worker reads at once.
const CHUNK: usize = 2048;
const IDLE_SAMPLE: u64 = 0x7fff;
const FAILED: u64 = 1 << 47;
const COUNT: u64 = FAILED - 1;

// Where a sample's frames come from when they are not all in memory.
pub trait FrameSource: Send + Sync {
    fn frames(&self) -> usize;
    fn sample_rate(&self) -> f32;
    // 1 or 2 (a file with more keeps its first two).
    fn channels(&self) -> usize;
    // Frames `at..at + left.len()`, planar; a mono source fills `left` alone.
    fn read(&self, at: usize, left: &mut [f32], right: &mut [f32]) -> Result<(), String>;
}

// Where a ring reads from: frames from `origin` on, or (reverse) before it, downward.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Target {
    pub sample: usize,
    pub reverse: bool,
    pub origin: usize,
}

// Request word: generation (16 bits) | reverse (1) | sample (15) | origin (32).
fn pack(generation: u16, target: Option<Target>) -> u64 {
    let (sample, reverse, origin) = target.map_or((IDLE_SAMPLE, 0, 0), |t| (t.sample as u64, u64::from(t.reverse), t.origin as u64));
    (u64::from(generation) << 48) | (reverse << 47) | (sample << 32) | origin
}

fn unpack(word: u64) -> (u16, Option<Target>) {
    let sample = (word >> 32) & IDLE_SAMPLE;
    let target = (sample != IDLE_SAMPLE).then_some(Target { sample: sample as usize, reverse: (word >> 47) & 1 == 1, origin: (word & 0xffff_ffff) as usize });
    ((word >> 48) as u16, target)
}

// The largest sample index and origin a request can carry.
pub const MAX_STREAMED_SAMPLES: usize = IDLE_SAMPLE as usize;
pub const MAX_STREAMED_FRAMES: usize = u32::MAX as usize;

fn tagged(generation: u16, value: u64) -> u64 {
    (u64::from(generation) << 48) | value
}

fn tag(word: u64) -> u16 {
    (word >> 48) as u16
}

pub struct StreamRing {
    left: Box<[UnsafeCell<f32>]>,
    right: Box<[UnsafeCell<f32>]>,
    request: AtomicU64,
    // Frames from the origin the render reads no more (tagged).
    cursor: AtomicU64,
    // Frames from the origin the worker has written (tagged; FAILED when a read failed).
    filled: AtomicU64,
}

// SAFETY: one thread (a set's feeder) writes the cells, only those holding
// frames the render has released (`cursor`) or not yet been told of (`filled`,
// published with Release after the writes); the render reads only published,
// unreleased frames. A cell is never written while it can be read.
unsafe impl Sync for StreamRing {}

impl StreamRing {
    fn new() -> Self {
        let cells = || (0..RING_CELLS).map(|_| UnsafeCell::new(0.0)).collect();
        Self { left: cells(), right: cells(), request: AtomicU64::new(pack(0, None)), cursor: AtomicU64::new(0), filled: AtomicU64::new(0) }
    }

    pub fn target(&self) -> Option<Target> {
        unpack(self.request.load(Ordering::Relaxed)).1
    }

    // Render: read from `target` on (None: nothing to read ahead). A new note
    // forces it even when unchanged: the frames read before are released.
    pub fn aim(&self, target: Option<Target>, force: bool) {
        let (generation, current) = unpack(self.request.load(Ordering::Relaxed));
        if force || current != target {
            self.request.store(pack(generation.wrapping_add(1), target), Ordering::Release);
        }
    }

    // Render: the first `frames` from the origin will not be read again.
    pub fn release(&self, frames: usize) {
        let generation = tag(self.request.load(Ordering::Relaxed));
        self.cursor.store(tagged(generation, frames as u64), Ordering::Release);
    }

    // Render: the frames of its target it may read now, `start..end` in source frames.
    pub fn valid(&self) -> Option<(i64, i64)> {
        let (generation, target) = unpack(self.request.load(Ordering::Relaxed));
        let target = target?;
        let filled = self.filled.load(Ordering::Acquire);
        if tag(filled) != generation {
            return None;
        }
        let count = (filled & COUNT) as i64;
        let cursor = self.cursor.load(Ordering::Relaxed);
        let released = if tag(cursor) == generation { (cursor & COUNT) as i64 } else { 0 };
        let origin = target.origin as i64;
        Some(if target.reverse { (origin - count, origin - released) } else { (origin + released, origin + count) })
    }

    pub(crate) fn cells(&self) -> (*const f32, *const f32) {
        (self.left[0].get() as *const f32, self.right[0].get() as *const f32)
    }

    fn store(&self, frame: usize, left: f32, right: f32) {
        let slot = frame & MASK;
        // SAFETY: see `Sync` above; the feeder alone writes, outside the readable frames.
        unsafe {
            *self.left[slot].get() = left;
            *self.right[slot].get() = right;
            if slot < TAPS {
                *self.left[RING_FRAMES + slot].get() = left;
                *self.right[RING_FRAMES + slot].get() = right;
            }
        }
    }

    // Feeder: reads ahead as far as the ring has room; answers the frames written.
    fn fill(&self, sources: &[Option<Arc<dyn FrameSource>>], feeder: &mut Feeder) -> usize {
        let (generation, target) = unpack(self.request.load(Ordering::Acquire));
        let Some(target) = target else { return 0 };
        let filled = self.filled.load(Ordering::Relaxed);
        let mut count = if tag(filled) == generation {
            if filled & FAILED != 0 {
                return 0;
            }
            (filled & COUNT) as usize
        } else {
            self.filled.store(tagged(generation, 0), Ordering::Release);
            0
        };
        let Some(source) = sources.get(target.sample).and_then(Option::as_ref) else {
            feeder.fail(format!("ring aimed at sample {}, which does not stream", target.sample));
            self.filled.store(tagged(generation, count as u64 | FAILED), Ordering::Release);
            return 0;
        };
        let cursor = self.cursor.load(Ordering::Acquire);
        let released = if tag(cursor) == generation { (cursor & COUNT) as usize } else { 0 };
        // A starved player is ahead of the ring: frames it released are skipped.
        count = count.max(released);
        let available = if target.reverse { target.origin } else { source.frames().saturating_sub(target.origin) };
        let limit = (released + RING_FRAMES - TAPS).min(available);
        let mut written = 0;
        while count < limit {
            let len = (limit - count).min(CHUNK);
            let at = if target.reverse { target.origin - count - len } else { target.origin + count };
            let (left, right) = (&mut feeder.left[..len], &mut feeder.right[..len]);
            if let Err(reason) = source.read(at, left, right) {
                feeder.fail(reason);
                self.filled.store(tagged(generation, count as u64 | FAILED), Ordering::Release);
                return written;
            }
            let mono = source.channels() == 1;
            for (index, (l, r)) in left.iter().zip(right.iter()).enumerate() {
                self.store(at + index, *l, if mono { *l } else { *r });
            }
            count += len;
            written += len;
            self.filled.store(tagged(generation, count as u64), Ordering::Release);
            if tag(self.request.load(Ordering::Acquire)) != generation {
                break;
            }
        }
        written
    }
}

// The rings of one sampler (voices × players) and the sources of its streamed samples.
pub struct Streams {
    rings: Box<[StreamRing]>,
    sources: Box<[Option<Arc<dyn FrameSource>>]>,
    claimed: AtomicBool,
}

impl Streams {
    pub fn new(sources: Vec<Option<Arc<dyn FrameSource>>>, rings: usize) -> Arc<Self> {
        Arc::new(Self { rings: (0..rings).map(|_| StreamRing::new()).collect(), sources: sources.into(), claimed: AtomicBool::new(false) })
    }

    pub fn ring(&self, index: usize) -> &StreamRing {
        &self.rings[index]
    }

    pub fn rings(&self) -> usize {
        self.rings.len()
    }

    // One thread fills a set of rings: the first claim wins, a second is refused.
    pub fn claim(&self) -> Result<(), String> {
        self.claimed.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).map(|_| ()).map_err(|_| "these rings already have their feeder".to_string())
    }

    // Feeder thread only (after `claim`): every ring read ahead; answers the frames written.
    pub fn fill(&self, feeder: &mut Feeder) -> usize {
        debug_assert!(self.claimed.load(Ordering::Relaxed), "fill after claim");
        self.rings.iter().map(|ring| ring.fill(&self.sources, feeder)).sum()
    }
}

// The feeder's own buffers (one chunk), and the reads that failed.
pub struct Feeder {
    left: Vec<f32>,
    right: Vec<f32>,
    failures: Vec<String>,
}

impl Feeder {
    pub fn new() -> Self {
        Self { left: vec![0.0; CHUNK], right: vec![0.0; CHUNK], failures: Vec::new() }
    }

    fn fail(&mut self, reason: String) {
        if self.failures.len() < 8 {
            self.failures.push(reason);
        }
    }

    pub fn take_failures(&mut self) -> Vec<String> {
        std::mem::take(&mut self.failures)
    }
}

impl Default for Feeder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use worker::{serve, take_failures};

#[cfg(target_arch = "wasm32")]
pub fn serve(_streams: &Arc<Streams>) -> Result<(), String> {
    Err("disk streaming is not built for this platform".to_string())
}

#[cfg(target_arch = "wasm32")]
pub fn take_failures() -> Vec<String> {
    Vec::new()
}

// The process's one streaming thread: it fills every served set, then waits
// 2 ms when nothing needed reading (a ring lasts 43 ms or more), and sleeps
// outright while no set is served. A set it holds weakly goes with its sampler.
#[cfg(not(target_arch = "wasm32"))]
mod worker {
    use super::{Feeder, Streams};
    use std::sync::{Arc, Mutex, OnceLock, Weak};
    use std::thread::{self, Thread};
    use std::time::Duration;

    const IDLE_WAIT: Duration = Duration::from_millis(2);

    struct Worker {
        sets: Mutex<Vec<Weak<Streams>>>,
        failures: Mutex<Vec<String>>,
        thread: Thread,
    }

    fn worker() -> &'static Worker {
        static WORKER: OnceLock<Worker> = OnceLock::new();
        WORKER.get_or_init(|| {
            let thread = thread::Builder::new().name("atome-sample-stream".into()).spawn(run).expect("the sample streaming thread starts");
            Worker { sets: Mutex::new(Vec::new()), failures: Mutex::new(Vec::new()), thread: thread.thread().clone() }
        })
    }

    // Off the audio thread: the worker fills these rings from now on.
    pub fn serve(streams: &Arc<Streams>) -> Result<(), String> {
        streams.claim()?;
        let worker = worker();
        worker.sets.lock().map_err(|error| format!("stream worker lock: {error}"))?.push(Arc::downgrade(streams));
        worker.thread.unpark();
        Ok(())
    }

    // The reads that failed since the last call (their rings starve, counted).
    pub fn take_failures() -> Vec<String> {
        worker().failures.lock().map(|mut failures| std::mem::take(&mut *failures)).unwrap_or_default()
    }

    fn run() {
        let mut feeder = Feeder::new();
        let mut live: Vec<Arc<Streams>> = Vec::new();
        loop {
            let worker = worker();
            if let Ok(mut sets) = worker.sets.lock() {
                sets.retain(|set| set.strong_count() > 0);
                live.extend(sets.iter().filter_map(Weak::upgrade));
            }
            if live.is_empty() {
                thread::park();
                continue;
            }
            let written: usize = live.iter().map(|set| set.fill(&mut feeder)).sum();
            live.clear();
            let failed = feeder.take_failures();
            if !failed.is_empty() {
                if let Ok(mut failures) = worker.failures.lock() {
                    failures.extend(failed);
                    failures.truncate(21);
                }
            }
            if written == 0 {
                thread::park_timeout(IDLE_WAIT);
            }
        }
    }
}
