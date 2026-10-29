// Markers that name an eVe command (Q7) never run it on the audio thread: the
// render thread reports each firing into this bounded queue of atomics (one
// producer: the instrument's render; one consumer: the host's control thread)
// and the host runs the command. Neither side waits or allocates; a full queue
// counts the firings it refused. Frames a streamed sample could not supply in
// time (stream.rs) are counted here too, for the host's same drain.

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FiredMarker {
    // Index in the marker table of the build that fired it (`generation`).
    pub marker: u32,
    pub generation: u16,
    pub note: u8,
    // The crossing's number within its note (1 for the first).
    pub count: u32,
    // The instrument's rendered-frame clock at the crossing.
    pub frame: u64,
}

pub struct ActionQueue {
    heads: Box<[AtomicU64]>,
    frames: Box<[AtomicU64]>,
    tails: Box<[AtomicU64]>,
    written: AtomicUsize,
    read: AtomicUsize,
    dropped: AtomicUsize,
    starved: AtomicUsize,
}

impl ActionQueue {
    pub fn new(capacity: usize) -> Self {
        let slots = || (0..capacity.max(1)).map(|_| AtomicU64::new(0)).collect();
        Self { heads: slots(), frames: slots(), tails: slots(), written: AtomicUsize::new(0), read: AtomicUsize::new(0), dropped: AtomicUsize::new(0), starved: AtomicUsize::new(0) }
    }

    fn capacity(&self) -> usize {
        self.heads.len()
    }

    // Render thread only.
    pub fn push(&self, fired: FiredMarker) {
        let written = self.written.load(Ordering::Relaxed);
        if written.wrapping_sub(self.read.load(Ordering::Acquire)) >= self.capacity() {
            self.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        }
        let slot = written % self.capacity();
        self.heads[slot].store((u64::from(fired.marker) << 32) | u64::from(fired.count), Ordering::Relaxed);
        self.frames[slot].store(fired.frame, Ordering::Relaxed);
        self.tails[slot].store((u64::from(fired.generation) << 8) | u64::from(fired.note), Ordering::Relaxed);
        self.written.store(written.wrapping_add(1), Ordering::Release);
    }

    // Control thread only: every firing reported so far, oldest first.
    pub fn drain(&self, mut each: impl FnMut(FiredMarker)) {
        let written = self.written.load(Ordering::Acquire);
        let mut read = self.read.load(Ordering::Relaxed);
        while read != written {
            let slot = read % self.capacity();
            let head = self.heads[slot].load(Ordering::Relaxed);
            let tail = self.tails[slot].load(Ordering::Relaxed);
            each(FiredMarker {
                marker: (head >> 32) as u32,
                count: head as u32,
                frame: self.frames[slot].load(Ordering::Relaxed),
                generation: (tail >> 8) as u16,
                note: tail as u8,
            });
            read = read.wrapping_add(1);
        }
        self.read.store(read, Ordering::Release);
    }

    // Firings refused because the host had not drained the queue (taken: counted once).
    pub fn take_dropped(&self) -> usize {
        self.dropped.swap(0, Ordering::Relaxed)
    }

    // Render thread: frames played silent because their ring was not filled yet.
    pub fn count_starved(&self, frames: usize) {
        self.starved.fetch_add(frames, Ordering::Relaxed);
    }

    // Starved frames since the last call (taken: counted once).
    pub fn take_starved(&self) -> usize {
        self.starved.swap(0, Ordering::Relaxed)
    }
}
