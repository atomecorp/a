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
use super::scheduled_backend::{
    CHANNELS, CaptureClock, SharedConsumer, note_capture_start_at, note_output_quantum,
};
use atome_mix_graph::shared::LiveInput;
use kira::Frame;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

pub const HOST_INPUT_ID: &str = "host";

const CHUNK_FRAMES: usize = 256;

static HOST_RATE: AtomicU32 = AtomicU32::new(0);
static CONSUMER: Mutex<Option<(SharedConsumer, SharedDirect)>> = Mutex::new(None);
static HOST_LISTENERS: Mutex<Vec<Arc<LiveInput>>> = Mutex::new(Vec::new());

// Where a take of the host's input starts on the engine's clock (R-179): the host
// instant of its first sample and the output anchor the render block noted last,
// as a device capture notes it (`scheduled_backend::CaptureClock`), so the take is
// placed by the same rule (`exact_placement.js#nativeTakeStart`). Real-time safe:
// a busy anchor gives a clock without an anchor (the next quantum tries again).
pub fn capture_clock(first_capture_host_ns: i64) -> Option<CaptureClock> {
    let slot = Mutex::new(None);
    note_capture_start_at(&slot, first_capture_host_ns);
    slot.into_inner().ok().flatten()
}

// Selects the host-pulled output at `sample_rate` (before the engine starts).
pub fn use_host_output(sample_rate: u32) {
    HOST_RATE.store(sample_rate, Ordering::Release);
}

pub fn host_rate() -> Option<u32> {
    Some(HOST_RATE.load(Ordering::Acquire)).filter(|rate| *rate > 0)
}

// The strips that now listen to the host's input (live_input.rs#reconcile).
pub(crate) fn listen_host_input(inputs: Vec<Arc<LiveInput>>) -> Result<(), String> {
    // The host sends a stereo pair: a strip taking another channel of it is an error (R-286).
    inputs.iter().try_for_each(|input| input.fits(2))?;
    *HOST_LISTENERS
        .lock()
        .map_err(|error| format!("Lock error: {error}"))? = inputs;
    Ok(())
}

// Called by the host's render block with the host's input, its first frame at
// `host_ns` (the quantum's host instant, the clock `render` notes): true when a
// strip listens to it (the dry input is then the chain's to play, not the
// unit's to copy through). Real-time safe: a busy list drops the quantum.
pub fn push_host_input(left: &[f32], right: &[f32], host_ns: i64) -> bool {
    let Ok(listeners) = HOST_LISTENERS.try_lock() else {
        return false;
    };
    if listeners.is_empty() {
        return false;
    }
    let mut frames = [Frame::ZERO; CHUNK_FRAMES];
    let nanos_per_frame = 1e9 / f64::from(HOST_RATE.load(Ordering::Acquire).max(1));
    let chunks = left.chunks(CHUNK_FRAMES).zip(right.chunks(CHUNK_FRAMES));
    for (chunk, (left, right)) in chunks.enumerate() {
        let count = left.len().min(right.len());
        let at = host_ns as f64 + (chunk * CHUNK_FRAMES) as f64 * nanos_per_frame;
        // Each strip takes its own channels of the pair (R-286): both, or one heard on both sides.
        listeners.iter().for_each(|input| {
            for (index, slot) in frames.iter_mut().take(count).enumerate() {
                *slot = input.frame_of(&[left[index], right[index]]);
            }
            input.push_at(&frames[..count], at);
        });
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
            let got =
                ringbuf::traits::Consumer::pop_slice(&mut *fifo, &mut scratch[..wanted * CHANNELS])
                    / CHANNELS;
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
    if direct::is_active()
        && let Some(Ok(mut direct)) = slot.as_ref().map(|(_, direct)| direct.try_lock())
    {
        direct.mix_planar(&mut left[..frames], &mut right[..frames]);
    }
    note_output_quantum(host_ns, frames, popped);
    popped
}

/// Frames Atome's output lags what it plays and hears: the slower of its two graphs (the console and the
/// direct path), the latency a host compensates (AUv3 `latency`).
pub fn output_latency_frames() -> usize {
    super::mix::output_latency_frames().max(direct::output_latency_frames())
}
