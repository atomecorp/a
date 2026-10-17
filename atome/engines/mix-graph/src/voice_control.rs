// A late end for a voice already scheduled or sounding (todo/timeline v1.6,
// cells §3.12, §5.5): a quantized stop lands inside a pass whose voices were
// scheduled ahead, and a released cell fades out from wherever it is. The
// voice's envelope reads two atomics on every frame, so the end is exact to the
// frame and the audio thread never locks; the registry that finds a voice by
// its id is only touched by the threads that schedule and command voices.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Weak};

pub struct VoiceControl {
    // Frame of the voice's own count (its first rendered frame is 0) where it is
    // silent; u64::MAX while no end was asked.
    end_frame: AtomicU64,
    release_frames: AtomicU64,
}

impl VoiceControl {
    fn new() -> Self {
        Self { end_frame: AtomicU64::new(u64::MAX), release_frames: AtomicU64::new(0) }
    }

    pub fn end_frame(&self) -> Option<u64> {
        Some(self.end_frame.load(Ordering::Acquire)).filter(|frame| *frame != u64::MAX)
    }

    pub fn release_frames(&self) -> u64 {
        self.release_frames.load(Ordering::Acquire)
    }
}

static REGISTRY: Mutex<Option<HashMap<String, Weak<VoiceControl>>>> = Mutex::new(None);

// The control of a voice about to be scheduled under `voice_id` (a voice id
// reused by a later pass replaces the earlier one's entry).
pub fn register(voice_id: &str) -> Arc<VoiceControl> {
    let control = Arc::new(VoiceControl::new());
    if let Ok(mut registry) = REGISTRY.lock() {
        let map = registry.get_or_insert_with(HashMap::new);
        map.retain(|_, entry| entry.strong_count() > 0);
        map.insert(voice_id.to_string(), Arc::downgrade(&control));
    }
    control
}

// The voice ends `end_frame` frames after its first one, fading over the last
// `release_frames`. Returns whether the voice is still known.
pub fn set_end(voice_id: &str, end_frame: u64, release_frames: u64) -> bool {
    let control = REGISTRY.lock().ok().and_then(|registry| registry.as_ref()?.get(voice_id)?.upgrade());
    let Some(control) = control else { return false };
    control.release_frames.store(release_frames, Ordering::Release);
    control.end_frame.store(end_frame, Ordering::Release);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_end_reaches_a_registered_voice_until_it_is_dropped() {
        let control = register("v");
        assert!(set_end("v", 480, 96));
        assert_eq!((control.end_frame(), control.release_frames()), (Some(480), 96));
        drop(control);
        assert!(!set_end("v", 1, 0), "a finished voice is gone");
    }
}
