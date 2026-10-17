// Host-pulled output (todo/audio_to_finalize §6.1, AUv3): inside an audio unit
// the plugin host owns the device and pulls each render quantum. The engine
// still renders ahead on its own (non real-time) thread into the FIFO, with
// voices started on their exact frames; the host's render block only copies
// frames out of the FIFO and notes which rendered frame it plays at which host
// instant, exactly as the cpal callback does. Real-time safe: no allocation,
// no blocking lock (a busy FIFO yields silence and counts a discontinuity).

use super::scheduled_backend::{note_output_quantum, SharedConsumer, CHANNELS};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

const CHUNK_FRAMES: usize = 256;

static HOST_RATE: AtomicU32 = AtomicU32::new(0);
static CONSUMER: Mutex<Option<SharedConsumer>> = Mutex::new(None);

// Selects the host-pulled output at `sample_rate` (before the engine starts).
pub fn use_host_output(sample_rate: u32) {
    HOST_RATE.store(sample_rate, Ordering::Release);
}

pub fn host_rate() -> Option<u32> {
    Some(HOST_RATE.load(Ordering::Acquire)).filter(|rate| *rate > 0)
}

pub(crate) fn install(consumer: SharedConsumer) {
    if let Ok(mut slot) = CONSUMER.lock() {
        *slot = Some(consumer);
    }
}

// Called by the host's render block: fills `left`/`right` with the next
// rendered frames; `host_ns` is the host instant of their first frame.
// Returns the frames that came from the engine (the rest is silence).
pub fn render(left: &mut [f32], right: &mut [f32], host_ns: i64) -> usize {
    let frames = left.len().min(right.len());
    left.iter_mut().for_each(|sample| *sample = 0.0);
    right.iter_mut().for_each(|sample| *sample = 0.0);
    let mut popped = 0;
    if let Ok(slot) = CONSUMER.try_lock() {
        if let Some(Ok(mut fifo)) = slot.as_ref().map(|consumer| consumer.try_lock()) {
            let mut scratch = [0.0f32; CHUNK_FRAMES * CHANNELS];
            while popped < frames {
                let wanted = (frames - popped).min(CHUNK_FRAMES);
                let got = ringbuf::traits::Consumer::pop_slice(&mut *fifo, &mut scratch[..wanted * CHANNELS]) / CHANNELS;
                for frame in 0..got {
                    left[popped + frame] = scratch[frame * CHANNELS];
                    right[popped + frame] = scratch[frame * CHANNELS + 1];
                }
                popped += got;
                if got < wanted {
                    break;
                }
            }
        }
    }
    note_output_quantum(host_ns, frames, popped);
    popped
}
