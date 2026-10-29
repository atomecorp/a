// Host-pulled output (todo/audio_to_finalize §6.1, AUv3): inside an audio unit
// the plugin host owns the device and pulls each render quantum. The engine
// still renders ahead on its own (non real-time) thread into the FIFO, with
// voices started on their exact frames; the host's render block only copies
// frames out of the FIFO and notes which rendered frame it plays at which host
// instant, exactly as the cpal callback does. Real-time safe: no allocation,
// no blocking lock (a busy FIFO yields silence and counts a discontinuity).
// The host's input (todo/effets_generateurs_audio L8): a strip whose IN is
// `host` listens to the sound the host sends the unit; the render block pushes
// it just before it renders, so the direct path plays it in the same quantum.

use super::direct::{self, SharedDirect};
use super::scheduled_backend::{note_output_quantum, SharedConsumer, CHANNELS};
use atome_mix_graph::shared::LiveInput;
use kira::Frame;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

pub const HOST_INPUT_ID: &str = "host";

const CHUNK_FRAMES: usize = 256;

static HOST_RATE: AtomicU32 = AtomicU32::new(0);
static CONSUMER: Mutex<Option<(SharedConsumer, SharedDirect)>> = Mutex::new(None);
static HOST_LISTENERS: Mutex<Vec<Arc<LiveInput>>> = Mutex::new(Vec::new());

// Selects the host-pulled output at `sample_rate` (before the engine starts).
pub fn use_host_output(sample_rate: u32) {
    HOST_RATE.store(sample_rate, Ordering::Release);
}

pub fn host_rate() -> Option<u32> {
    Some(HOST_RATE.load(Ordering::Acquire)).filter(|rate| *rate > 0)
}

// The strips that now listen to the host's input (live_input.rs#reconcile).
pub(crate) fn listen_host_input(inputs: Vec<Arc<LiveInput>>) -> Result<(), String> {
    *HOST_LISTENERS.lock().map_err(|error| format!("Lock error: {error}"))? = inputs;
    Ok(())
}

// Called by the host's render block with the host's input: true when a strip
// listens to it (the dry input is then the chain's to play, not the unit's to
// copy through). Real-time safe: a busy list drops the quantum.
pub fn push_host_input(left: &[f32], right: &[f32]) -> bool {
    let Ok(listeners) = HOST_LISTENERS.try_lock() else { return false };
    if listeners.is_empty() {
        return false;
    }
    let mut frames = [Frame::ZERO; CHUNK_FRAMES];
    for (left, right) in left.chunks(CHUNK_FRAMES).zip(right.chunks(CHUNK_FRAMES)) {
        let count = left.len().min(right.len());
        for frame in 0..count {
            frames[frame] = Frame::new(left[frame], right[frame]);
        }
        listeners.iter().for_each(|input| input.push(&frames[..count]));
    }
    true
}

pub(crate) fn install(consumer: SharedConsumer, direct: SharedDirect) {
    if let Ok(mut slot) = CONSUMER.lock() {
        *slot = Some((consumer, direct));
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
    let Ok(slot) = CONSUMER.try_lock() else {
        note_output_quantum(host_ns, frames, 0);
        return 0;
    };
    if let Some(Ok(mut fifo)) = slot.as_ref().map(|(consumer, _)| consumer.try_lock()) {
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
    if direct::is_active() {
        if let Some(Ok(mut direct)) = slot.as_ref().map(|(_, direct)| direct.try_lock()) {
            direct.mix_planar(&mut left[..frames], &mut right[..frames]);
        }
    }
    note_output_quantum(host_ns, frames, popped);
    popped
}
