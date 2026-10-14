// Kira backend of the native engine with sample-accurate scheduling (todo/timeline
// v1.6, the same design as the Web engine's `scheduled_backend.rs`). A render
// thread runs Kira ahead of the device into a lock-free FIFO, splitting each
// block at the exact frames where scheduled voices are due, so the voices of a
// playback all start on their own frame. The cpal output callback only copies
// frames and notes which rendered frame it plays at which host instant; the
// recorder notes the host instant of its first captured sample on the same host
// clock, so a take recorded during playback lands on the frame that was heard.

use super::aux_outputs::{self, SharedAuxConsumers};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use kira::backend::{Backend, Renderer};
use kira::sound::static_sound::StaticSoundData;
use ringbuf::traits::{Consumer, Observer, Producer, Split};
use ringbuf::HeapRb;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

const BLOCK_FRAMES: usize = 256;
const CHANNELS: usize = 2;
// Frames rendered ahead of the device: room for the main thread to schedule.
const LOOKAHEAD_FRAMES: u64 = 2048;
const FIFO_FRAMES: usize = 16_384;

struct PendingStart {
    voice_id: String,
    sound: StaticSoundData,
    frame: u64,
}

type StartHook = fn(&str, StaticSoundData);

// Which rendered frame the device plays at which host instant (the last callback).
#[derive(Clone, Copy)]
struct Anchor {
    frame: u64,
    host_ns: i64,
    at: Instant,
}

static PENDING: Mutex<Vec<PendingStart>> = Mutex::new(Vec::new());
static START_HOOK: Mutex<Option<StartHook>> = Mutex::new(None);
static ANCHOR: Mutex<Option<Anchor>> = Mutex::new(None);
static EPOCH: OnceLock<cpal::StreamInstant> = OnceLock::new();
// The next rendered block starts at this frame.
static FRAMES_RENDERED: AtomicU64 = AtomicU64::new(0);
// Rendered frames the device has consumed.
static FRAMES_PLAYED: AtomicU64 = AtomicU64::new(0);
// Times the device found the FIFO empty: the frame/host relation moved.
static DISCONTINUITIES: AtomicU32 = AtomicU32::new(0);
static SAMPLE_RATE: AtomicU32 = AtomicU32::new(0);
static RUNNING: AtomicBool = AtomicBool::new(false);
// One per started engine: a previous engine's threads never touch the new one.
static GENERATION: AtomicU64 = AtomicU64::new(0);

// Host instants as signed nanoseconds on one process-wide origin, so output and
// input streams compare (CoreAudio stamps both with the host clock).
pub fn host_ns(instant: &cpal::StreamInstant) -> i64 {
    let epoch = *EPOCH.get_or_init(|| *instant);
    match instant.duration_since(&epoch) {
        Some(after) => after.as_nanos() as i64,
        None => -(epoch.duration_since(instant).map(|before| before.as_nanos() as i64).unwrap_or(0)),
    }
}

// The engine starts a due voice through this hook (it owns the AudioManager).
pub fn install_start_hook(hook: StartHook) {
    if let Ok(mut slot) = START_HOOK.lock() {
        *slot = Some(hook);
    }
}

// Queues a voice for rendered frame `frame`; a frame already rendered becomes
// the next block's first frame. Returns the frame the voice will start on.
pub fn schedule(voice_id: &str, sound: StaticSoundData, frame: u64) -> u64 {
    cancel_scheduled(voice_id);
    let start = frame.max(FRAMES_RENDERED.load(Ordering::Acquire));
    if let Ok(mut pending) = PENDING.lock() {
        pending.push(PendingStart { voice_id: voice_id.to_string(), sound, frame: start });
    }
    start
}

pub fn cancel_scheduled(voice_id: &str) -> bool {
    let Ok(mut pending) = PENDING.lock() else { return false };
    let before = pending.len();
    pending.retain(|entry| entry.voice_id != voice_id);
    before != pending.len()
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct RenderClock {
    pub frames_rendered: u64,
    pub sample_rate: u32,
    pub block_frames: u32,
    pub discontinuities: u32,
    pub anchor_frame: Option<u64>,
    pub anchor_host_ns: Option<i64>,
    // Rendered frame the device plays now (estimated from the last callback).
    pub played_frame_now: Option<f64>,
}

pub fn render_clock() -> Option<RenderClock> {
    if !RUNNING.load(Ordering::Acquire) {
        return None;
    }
    let sample_rate = SAMPLE_RATE.load(Ordering::Acquire);
    let anchor = ANCHOR.lock().ok().and_then(|slot| *slot);
    Some(RenderClock {
        frames_rendered: FRAMES_RENDERED.load(Ordering::Acquire),
        sample_rate,
        block_frames: BLOCK_FRAMES as u32,
        discontinuities: DISCONTINUITIES.load(Ordering::Acquire),
        anchor_frame: anchor.map(|value| value.frame),
        anchor_host_ns: anchor.map(|value| value.host_ns),
        played_frame_now: anchor.map(|value| value.frame as f64 + value.at.elapsed().as_secs_f64() * sample_rate as f64),
    })
}

// Where a capture started on the playback's clock: the host instant of its first
// sample, and which rendered frame the device was playing at which host instant
// then (the anchor nearest the take, so the two clocks barely drift apart).
#[derive(serde::Serialize, Clone, Copy, Debug)]
pub struct CaptureClock {
    pub first_capture_host_ns: i64,
    pub anchor_frame: Option<u64>,
    pub anchor_host_ns: Option<i64>,
    pub output_sample_rate: u32,
    pub discontinuities: u32,
}

// Called by an input callback: notes the capture clock once (never blocks).
pub fn note_capture_start(slot: &Mutex<Option<CaptureClock>>, info: &cpal::InputCallbackInfo) {
    let Ok(mut clock) = slot.try_lock() else { return };
    if clock.is_some() {
        return;
    }
    let anchor = ANCHOR.try_lock().ok().and_then(|value| *value);
    *clock = Some(CaptureClock {
        first_capture_host_ns: host_ns(&info.timestamp().callback),
        anchor_frame: anchor.map(|value| value.frame),
        anchor_host_ns: anchor.map(|value| value.host_ns),
        output_sample_rate: SAMPLE_RATE.load(Ordering::Acquire),
        discontinuities: DISCONTINUITIES.load(Ordering::Acquire),
    });
}

// Frames inside [from, to) where scheduled voices are due (missed ones are due at `from`).
fn due_frames(from: u64, to: u64) -> Vec<u64> {
    let Ok(pending) = PENDING.lock() else { return Vec::new() };
    let mut frames: Vec<u64> = pending.iter().filter(|entry| entry.frame < to).map(|entry| entry.frame.max(from)).collect();
    frames.sort_unstable();
    frames.dedup();
    frames
}

fn start_due(at: u64) {
    let due: Vec<PendingStart> = match PENDING.lock() {
        Ok(mut pending) => {
            let (due, rest): (Vec<PendingStart>, Vec<PendingStart>) = pending.drain(..).partition(|entry| entry.frame <= at);
            *pending = rest;
            due
        }
        Err(_) => Vec::new(),
    };
    let hook = START_HOOK.lock().ok().and_then(|slot| *slot);
    if let Some(hook) = hook {
        for entry in due {
            hook(&entry.voice_id, entry.sound);
        }
    }
}

// One block, rendered in pieces split at the frames where voices are due.
fn render_block(renderer: &mut Renderer, block: &mut [f32]) {
    let block_start = FRAMES_RENDERED.load(Ordering::Acquire);
    let mut cursor = block_start;
    for due in due_frames(block_start, block_start + BLOCK_FRAMES as u64) {
        if due > cursor {
            let from = (cursor - block_start) as usize * CHANNELS;
            let to = (due - block_start) as usize * CHANNELS;
            renderer.on_start_processing();
            renderer.process(&mut block[from..to], CHANNELS as u16);
            cursor = due;
        }
        start_due(due);
    }
    let from = (cursor - block_start) as usize * CHANNELS;
    renderer.on_start_processing();
    renderer.process(&mut block[from..], CHANNELS as u16);
    #[cfg(test)]
    if let Ok(mut tap) = RENDER_TAP.lock() {
        if let Some((base, samples)) = tap.as_mut() {
            base.get_or_insert(block_start);
            samples.extend(block.iter().step_by(CHANNELS));
        }
    }
}

// Tests read the rendered left channel from its first block (`scheduled_backend_tests.rs`).
#[cfg(test)]
pub(super) static RENDER_TAP: Mutex<Option<(Option<u64>, Vec<f32>)>> = Mutex::new(None);

#[derive(Debug)]
pub struct ScheduledBackendError(pub String);

impl std::fmt::Display for ScheduledBackendError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for ScheduledBackendError {}

pub struct ScheduledCpalBackend {
    stop: Arc<AtomicBool>,
}

fn default_output() -> Result<(cpal::Device, cpal::StreamConfig), ScheduledBackendError> {
    let device = cpal::default_host()
        .default_output_device()
        .ok_or_else(|| ScheduledBackendError("no_default_output_device".into()))?;
    let config = device
        .default_output_config()
        .map_err(|error| ScheduledBackendError(format!("default_output_config: {error}")))?
        .config();
    // The mixer may route strips to this device's extra channel pairs.
    aux_outputs::note_output_device(device.name().unwrap_or_else(|_| "default".into()), config.channels, BLOCK_FRAMES);
    Ok((device, config))
}

type SharedConsumer = Arc<Mutex<ringbuf::HeapCons<f32>>>;

fn build_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    consumer: SharedConsumer,
    aux: SharedAuxConsumers,
    lost: Arc<AtomicBool>,
) -> Result<cpal::Stream, ScheduledBackendError> {
    let device_channels = usize::from(config.channels.max(1));
    let mut scratch = vec![0.0f32; FIFO_FRAMES * CHANNELS];
    let mut aux_scratch = vec![0.0f32; FIFO_FRAMES * CHANNELS];
    let stream = device
        .build_output_stream(
            config,
            move |data: &mut [f32], info: &cpal::OutputCallbackInfo| {
                let frames = data.len() / device_channels;
                let first = FRAMES_PLAYED.load(Ordering::Acquire);
                if let Ok(mut slot) = ANCHOR.try_lock() {
                    *slot = Some(Anchor { frame: first, host_ns: host_ns(&info.timestamp().callback), at: Instant::now() });
                }
                if scratch.len() < frames * CHANNELS {
                    scratch.resize(frames * CHANNELS, 0.0);
                }
                let popped = match consumer.try_lock() {
                    Ok(mut fifo) => fifo.pop_slice(&mut scratch[..frames * CHANNELS]) / CHANNELS,
                    Err(_) => 0,
                };
                for frame in 0..frames {
                    let (left, right) = if frame < popped {
                        (scratch[frame * CHANNELS], scratch[frame * CHANNELS + 1])
                    } else {
                        (0.0, 0.0)
                    };
                    let out = &mut data[frame * device_channels..(frame + 1) * device_channels];
                    if device_channels == 1 {
                        out[0] = (left + right) * 0.5;
                    } else {
                        out[0] = left;
                        out[1] = right;
                        out[2..].iter_mut().for_each(|sample| *sample = 0.0);
                    }
                }
                aux_outputs::write_aux(&aux, data, device_channels, frames.min(FIFO_FRAMES), &mut aux_scratch);
                FRAMES_PLAYED.fetch_add(popped as u64, Ordering::AcqRel);
                if popped < frames {
                    DISCONTINUITIES.fetch_add(1, Ordering::AcqRel);
                }
            },
            move |error| {
                if matches!(error, cpal::StreamError::DeviceNotAvailable) {
                    lost.store(true, Ordering::Release);
                }
            },
            None,
        )
        .map_err(|error| ScheduledBackendError(format!("build_output_stream: {error}")))?;
    stream.play().map_err(|error| ScheduledBackendError(format!("stream_play: {error}")))?;
    Ok(stream)
}

impl Backend for ScheduledCpalBackend {
    type Settings = ();
    type Error = ScheduledBackendError;

    fn setup(_settings: (), _internal_buffer_size: usize) -> Result<(Self, u32), Self::Error> {
        let (_, config) = default_output()?;
        SAMPLE_RATE.store(config.sample_rate.0, Ordering::Release);
        Ok((Self { stop: Arc::new(AtomicBool::new(false)) }, config.sample_rate.0))
    }

    fn start(&mut self, mut renderer: Renderer) -> Result<(), Self::Error> {
        let generation = GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
        FRAMES_PLAYED.store(FRAMES_RENDERED.load(Ordering::Acquire), Ordering::Release);
        if let Ok(mut pending) = PENDING.lock() {
            pending.clear();
        }
        let (producer, consumer) = HeapRb::<f32>::new(FIFO_FRAMES * CHANNELS).split();
        let consumer: SharedConsumer = Arc::new(Mutex::new(consumer));
        let (mut aux_feeder, aux_consumers) = aux_outputs::create_aux(FIFO_FRAMES, BLOCK_FRAMES);
        let stop = Arc::clone(&self.stop);
        // The device thread owns the stream (a cpal Stream is not Send) and
        // rebuilds it on the default device when the device goes away.
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let stream_stop = Arc::clone(&stop);
        std::thread::spawn(move || {
            let lost = Arc::new(AtomicBool::new(false));
            let open = || default_output().and_then(|(device, config)| build_stream(&device, &config, Arc::clone(&consumer), Arc::clone(&aux_consumers), Arc::clone(&lost)));
            let mut stream = match open() {
                Ok(stream) => {
                    let _ = ready_tx.send(Ok(()));
                    Some(stream)
                }
                Err(error) => {
                    let _ = ready_tx.send(Err(error.0));
                    return;
                }
            };
            while !stream_stop.load(Ordering::Acquire) {
                std::thread::sleep(Duration::from_millis(250));
                if lost.swap(false, Ordering::AcqRel) || stream.is_none() {
                    drop(stream.take());
                    DISCONTINUITIES.fetch_add(1, Ordering::AcqRel);
                    stream = open().ok();
                }
            }
            drop(stream);
        });
        ready_rx
            .recv()
            .map_err(|_| ScheduledBackendError("output_thread_failed".into()))?
            .map_err(ScheduledBackendError)?;
        RUNNING.store(true, Ordering::Release);
        // The render thread keeps LOOKAHEAD_FRAMES rendered ahead of the device.
        std::thread::spawn(move || {
            let mut producer = producer;
            let mut block = vec![0.0f32; BLOCK_FRAMES * CHANNELS];
            while !stop.load(Ordering::Acquire) && GENERATION.load(Ordering::Acquire) == generation {
                while FRAMES_RENDERED.load(Ordering::Acquire) - FRAMES_PLAYED.load(Ordering::Acquire) < LOOKAHEAD_FRAMES
                    && producer.vacant_len() >= block.len()
                {
                    block.iter_mut().for_each(|sample| *sample = 0.0);
                    render_block(&mut renderer, &mut block);
                    producer.push_slice(&block);
                    aux_feeder.feed();
                    FRAMES_RENDERED.fetch_add(BLOCK_FRAMES as u64, Ordering::AcqRel);
                }
                std::thread::sleep(Duration::from_millis(1));
            }
            if GENERATION.load(Ordering::Acquire) == generation {
                RUNNING.store(false, Ordering::Release);
            }
        });
        Ok(())
    }
}

impl Drop for ScheduledCpalBackend {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
    }
}
