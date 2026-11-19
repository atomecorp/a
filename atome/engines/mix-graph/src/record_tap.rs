// A strip's REC point (R-183): the `record` module passes its signal on
// unchanged and, while its strip's take is armed, copies what passes there
// into a lock-free ring the control side drains into the take's file. Placed
// under IN the take is dry; after an effect, wet. The take's first frame is
// placed by the input the strip hears: where that input's last pull started
// and its capture clock (shared.rs `InputPosition`), less the latency of the
// modules before the point.

use crate::MixGraph;
use crate::shared::{InputPosition, LiveInput};
use kira::Frame;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

pub const MODULE_TYPE: &str = "record";
// Frames the ring holds between two drains (about 2.7 s at 48 kHz).
const RING_FRAMES: usize = 1 << 17;

pub struct RecordTap {
    armed: AtomicBool,
    started: AtomicBool,
    ring: Arc<LiveInput>,
    overruns: AtomicU64,
    // The take's input, set while disarmed; read by the render thread.
    source: Mutex<Option<Arc<LiveInput>>>,
    start: Mutex<Option<Option<InputPosition>>>,
    // Latency of the modules before the point (frames), set by each program.
    latency: AtomicUsize,
    // The record module that writes into this tap (control side only): a
    // module kept by a later program keeps the tap it was built with, so it
    // is kept only while that tap is still its strip's (mix_apply.rs).
    holder: Mutex<Option<String>>,
}

// Where a take's first frame was captured, on its input's clock.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TapStart {
    pub input: Option<InputPosition>,
    pub latency_frames: usize,
}

impl TapStart {
    // The input clock of the take's first frame (`ticks` per frame: 1e9 /
    // rate for host ns, 1 for context frames); None without an input clock.
    pub fn clock(&self, ticks: f64) -> Option<f64> {
        let input = self.input?;
        let (index, clock) = input.anchor?;
        let frames = input.pulled_from.wrapping_sub(index) as isize as f64;
        Some(clock + (frames - self.latency_frames as f64) * ticks)
    }
}

impl RecordTap {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            armed: AtomicBool::new(false),
            started: AtomicBool::new(false),
            ring: LiveInput::new(RING_FRAMES),
            overruns: AtomicU64::new(0),
            source: Mutex::new(None),
            start: Mutex::new(None),
            latency: AtomicUsize::new(0),
            holder: Mutex::new(None),
        })
    }

    // Render thread: what passes at the point, while armed. A block whose
    // start cannot be noted yet waits (the take starts a block later).
    pub fn write(&self, buffer: &[Frame]) {
        if !self.armed.load(Ordering::Acquire) {
            return;
        }
        if !self.started.load(Ordering::Relaxed) {
            let (Ok(mut start), Ok(source)) = (self.start.try_lock(), self.source.try_lock())
            else {
                return;
            };
            let position = source.as_ref().map(|input| input.position());
            // The take starts with its input: before the input's first push (its clock) nothing is heard yet.
            if position.is_some_and(|position| position.anchor.is_none()) {
                return;
            }
            *start = Some(position);
            self.started.store(true, Ordering::Release);
        }
        let kept = self.ring.push(buffer);
        if kept < buffer.len() {
            self.overruns
                .fetch_add((buffer.len() - kept) as u64, Ordering::Relaxed);
        }
    }

    pub fn is_armed(&self) -> bool {
        self.armed.load(Ordering::Acquire)
    }

    // Moves the frames taken so far into `out`; returns how many.
    pub fn drain(&self, out: &mut [Frame]) -> usize {
        self.ring.take(out)
    }

    pub fn start(&self) -> Option<TapStart> {
        if !self.started.load(Ordering::Acquire) {
            return None;
        }
        let input = (*self.start.lock().ok()?)?;
        Some(TapStart {
            input,
            latency_frames: self.latency.load(Ordering::Relaxed),
        })
    }

    pub fn overrun_frames(&self) -> u64 {
        self.overruns.load(Ordering::Relaxed)
    }

    pub(crate) fn set_latency(&self, frames: usize) {
        self.latency.store(frames, Ordering::Relaxed);
    }

    pub(crate) fn hold(&self, module_id: &str) -> Result<(), String> {
        *self
            .holder
            .lock()
            .map_err(|error| format!("mix record lock: {error}"))? = Some(module_id.to_string());
        Ok(())
    }

    pub(crate) fn is_held_by(&self, module_id: &str) -> Result<bool, String> {
        Ok(self
            .holder
            .lock()
            .map_err(|error| format!("mix record lock: {error}"))?
            .as_deref()
            == Some(module_id))
    }

    fn arm(&self, source: Option<Arc<LiveInput>>) -> Result<(), String> {
        if self.is_armed() {
            return Err("mix_record_already_armed".to_string());
        }
        let mut scratch = [Frame::ZERO; 1024];
        while self.ring.take(&mut scratch) > 0 {}
        *self
            .source
            .lock()
            .map_err(|error| format!("mix record lock: {error}"))? = source;
        *self
            .start
            .lock()
            .map_err(|error| format!("mix record lock: {error}"))? = None;
        self.overruns.store(0, Ordering::Relaxed);
        self.started.store(false, Ordering::Release);
        self.armed.store(true, Ordering::Release);
        Ok(())
    }

    fn disarm(&self) {
        self.armed.store(false, Ordering::Release);
    }
}

impl MixGraph {
    pub(crate) fn record_tap_for(&mut self, strip_id: &str) -> Arc<RecordTap> {
        self.record_taps
            .entry(strip_id.to_string())
            .or_insert_with(RecordTap::new)
            .clone()
    }

    // Arms the REC point of `strip_id`; `device_id` names the live input the
    // strip hears during the take (its clock places the take).
    pub fn arm_record(
        &mut self,
        strip_id: &str,
        device_id: Option<&str>,
    ) -> Result<Arc<RecordTap>, String> {
        let tap = self
            .record_taps
            .get(strip_id)
            .cloned()
            .ok_or_else(|| format!("mix_record_point_missing: {strip_id}"))?;
        let source = match device_id {
            Some(device) => Some(
                self.live_inputs
                    .get(device)
                    .cloned()
                    .ok_or_else(|| format!("mix_record_input_missing: {device}"))?,
            ),
            None => None,
        };
        tap.arm(source)?;
        Ok(tap)
    }

    pub fn disarm_record(&mut self, strip_id: &str) -> Result<(), String> {
        self.record_taps
            .get(strip_id)
            .ok_or_else(|| format!("mix_record_point_missing: {strip_id}"))?
            .disarm();
        Ok(())
    }
}
