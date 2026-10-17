// Output at rest (todo/audio_to_finalize §6.1, iOS energy): once nothing has
// sounded for IDLE_SECONDS and nothing is waiting (no voice playing, none
// scheduled, no live input, no effect tail), the device stream pauses and the
// render thread sleeps, so an idle app is not kept awake by silence. The next
// voice, or a read of the render clock, wakes both at once.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Mutex;
use std::thread::Thread;
use std::time::{Duration, Instant};

const IDLE_SECONDS: u64 = 5;

static ACTIVE: AtomicBool = AtomicBool::new(true);
static LAST_ACTIVITY_MS: AtomicU64 = AtomicU64::new(0);
static ORIGIN: Mutex<Option<Instant>> = Mutex::new(None);
// The device thread's waker and the render thread, of the running backend.
static WAKERS: Mutex<Option<(Sender<()>, Thread)>> = Mutex::new(None);
static BUSY_PROBE: Mutex<Option<fn() -> bool>> = Mutex::new(None);

fn now_ms() -> u64 {
    let Ok(mut origin) = ORIGIN.lock() else { return 0 };
    origin.get_or_insert_with(Instant::now).elapsed().as_millis() as u64
}

// What keeps the output awake besides recent activity (the engine's voices and effects).
pub fn install_busy_probe(probe: fn() -> bool) {
    if let Ok(mut slot) = BUSY_PROBE.lock() {
        *slot = Some(probe);
    }
}

pub(crate) fn register(device: Sender<()>, render: Thread) {
    ACTIVE.store(true, Ordering::Release);
    LAST_ACTIVITY_MS.store(now_ms(), Ordering::Release);
    if let Ok(mut slot) = WAKERS.lock() {
        *slot = Some((device, render));
    }
}

static STAY_AWAKE: AtomicBool = AtomicBool::new(false);

// A host-driven output (AUv3) never rests: the host pulls every quantum.
pub(crate) fn stay_awake() {
    STAY_AWAKE.store(true, Ordering::Release);
}

pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Acquire)
}

// Something sounds or is about to: keep the output awake, waking it if it rests.
// Returns whether it was resting.
pub fn note_activity() -> bool {
    LAST_ACTIVITY_MS.store(now_ms(), Ordering::Release);
    if ACTIVE.swap(true, Ordering::AcqRel) {
        return false;
    }
    if let Ok(slot) = WAKERS.lock() {
        if let Some((device, render)) = slot.as_ref() {
            let _ = device.send(());
            render.unpark();
        }
    }
    true
}

// Called by the device thread: whether the output should rest now.
pub(crate) fn should_rest() -> bool {
    if STAY_AWAKE.load(Ordering::Acquire) || !is_active() || now_ms().saturating_sub(LAST_ACTIVITY_MS.load(Ordering::Acquire)) < IDLE_SECONDS * 1000 {
        return false;
    }
    let busy = BUSY_PROBE.lock().ok().and_then(|slot| *slot).map_or(false, |probe| probe());
    if busy {
        LAST_ACTIVITY_MS.store(now_ms(), Ordering::Release);
        return false;
    }
    ACTIVE.store(false, Ordering::Release);
    true
}

// How long the render thread waits before checking the FIFO again.
pub(crate) fn render_wait() -> Option<Duration> {
    if is_active() { Some(Duration::from_millis(1)) } else { None }
}
