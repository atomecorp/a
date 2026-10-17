// Render-side plumbing: per-strip capture effect, meters, the graph hand-off
// between threads and the effect that runs the whole graph on the main track.
//
// Render-thread rule: only `try_lock` (never blocking), no allocation, and
// replaced graphs go back to the control thread to be dropped there.

use crate::dsp::AtomicParam;
use crate::graph::{Graph, MAX_BLOCK};
use kira::effect::{Effect, EffectBuilder};
use kira::info::Info;
use kira::Frame;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

pub struct CaptureSlot {
    frames: Mutex<(Vec<Frame>, usize)>,
}

impl CaptureSlot {
    pub fn new() -> Arc<Self> {
        Arc::new(Self { frames: Mutex::new((vec![Frame::ZERO; MAX_BLOCK], 0)) })
    }

    fn store(&self, input: &[Frame]) {
        if let Ok(mut guard) = self.frames.try_lock() {
            let (frames, len) = &mut *guard;
            let count = input.len().min(frames.len());
            frames[..count].copy_from_slice(&input[..count]);
            *len = count;
        }
    }

    // Moves this block's captured audio into `out` (silence when the strip's
    // track rendered nothing this block).
    pub fn take_into(&self, out: &mut [Frame]) {
        out.fill(Frame::ZERO);
        if let Ok(mut guard) = self.frames.try_lock() {
            let (frames, len) = &mut *guard;
            let count = (*len).min(out.len());
            out[..count].copy_from_slice(&frames[..count]);
            *len = 0;
        }
    }

    // Live input sources write here between blocks (lot "live input").
    pub fn push(&self, input: &[Frame]) {
        self.store(input);
    }
}

// A live input (microphone, interface input) monitored through a strip: the
// input thread pushes frames, the render thread pulls exactly one block.
// Fixed capacity; both sides only `try_lock`, a busy side drops or plays silence.
pub struct LiveInput {
    ring: Mutex<(Vec<Frame>, usize, usize)>,
}

impl LiveInput {
    pub fn new(capacity: usize) -> Arc<Self> {
        Arc::new(Self { ring: Mutex::new((vec![Frame::ZERO; capacity.max(1)], 0, 0)) })
    }

    pub fn push(&self, input: &[Frame]) {
        let Ok(mut guard) = self.ring.try_lock() else { return };
        let (frames, read, len) = &mut *guard;
        let capacity = frames.len();
        for frame in input {
            frames[(*read + *len) % capacity] = *frame;
            if *len == capacity {
                *read = (*read + 1) % capacity;
            } else {
                *len += 1;
            }
        }
    }

    // Frames waiting to be pulled (0 while the ring is busy).
    pub fn available(&self) -> usize {
        self.ring.try_lock().map(|guard| guard.2).unwrap_or(0)
    }

    pub fn pull(&self, out: &mut [Frame]) {
        out.fill(Frame::ZERO);
        let Ok(mut guard) = self.ring.try_lock() else { return };
        let (frames, read, len) = &mut *guard;
        let capacity = frames.len();
        let count = (*len).min(out.len());
        for slot in out.iter_mut().take(count) {
            *slot = frames[*read];
            *read = (*read + 1) % capacity;
        }
        *len -= count;
    }
}

#[derive(Debug, Default)]
pub struct StripMeter {
    peak: AtomicU32,
    rms: AtomicU32,
}

impl StripMeter {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
    pub fn record(&self, peak: f32, rms: f32) {
        // Keep the loudest block until the control thread reads it.
        let current = f32::from_bits(self.peak.load(Ordering::Relaxed));
        if peak > current {
            self.peak.store(peak.to_bits(), Ordering::Relaxed);
        }
        self.rms.store(rms.to_bits(), Ordering::Relaxed);
    }
    pub fn read(&self) -> (f32, f32) {
        let peak = f32::from_bits(self.peak.swap(0f32.to_bits(), Ordering::Relaxed));
        (peak, f32::from_bits(self.rms.load(Ordering::Relaxed)))
    }
}

// Extra hardware outputs (device channel pairs beyond the main pair). The
// graph appends each pair's frames during rendering; the backend drains them
// right after each rendered block. Capacities are reserved by `configure`, so
// neither side allocates on the audio threads.
#[derive(Default)]
pub struct AuxOutputs {
    pub frames: Mutex<Vec<(u16, Vec<Frame>)>>,
}

impl AuxOutputs {
    // Pairs 1..=pairs exist (pair 0 is the main output).
    pub fn configure(&self, pairs: u16, capacity: usize) {
        if let Ok(mut frames) = self.frames.lock() {
            *frames = (1..=pairs).map(|pair| (pair, Vec::with_capacity(capacity))).collect();
        }
    }

    pub fn pairs(&self) -> u16 {
        self.frames.lock().map(|frames| frames.len() as u16).unwrap_or(0)
    }

    // Moves up to `out.len()` frames of `pair` into `out` (the rest is silence).
    pub fn drain_pair(&self, pair: u16, out: &mut [Frame]) {
        out.fill(Frame::ZERO);
        let Ok(mut frames) = self.frames.try_lock() else { return };
        let Some((_, buffer)) = frames.iter_mut().find(|(candidate, _)| *candidate == pair) else { return };
        let count = buffer.len().min(out.len());
        out[..count].copy_from_slice(&buffer[..count]);
        buffer.drain(..count);
    }
}

pub struct GraphShared {
    pub pending: Mutex<Option<Box<Graph>>>,
    pub retired: Mutex<Vec<Box<Graph>>>,
    pub sample_rate: AtomicU32,
    pub block_size: AtomicUsize,
    pub aux: Arc<AuxOutputs>,
    pub output_gain: AtomicParam,
}

impl GraphShared {
    pub fn new(sample_rate: u32) -> Arc<Self> {
        Arc::new(Self {
            pending: Mutex::new(None),
            retired: Mutex::new(Vec::with_capacity(4)),
            sample_rate: AtomicU32::new(sample_rate),
            block_size: AtomicUsize::new(MAX_BLOCK),
            aux: Arc::new(AuxOutputs::default()),
            output_gain: AtomicParam::new(1.0),
        })
    }
}

pub struct MixGraphEffect {
    shared: Arc<GraphShared>,
    graph: Option<Box<Graph>>,
}

impl MixGraphEffect {
    fn adopt_pending(&mut self) {
        // The retired list's capacity is reserved by the control thread, so
        // handing the old graph back never allocates; when full, wait a block.
        let Ok(mut retired) = self.shared.retired.try_lock() else { return };
        if retired.len() >= retired.capacity() {
            return;
        }
        let Ok(mut pending) = self.shared.pending.try_lock() else { return };
        let Some(next) = pending.take() else { return };
        if let Some(previous) = self.graph.replace(next) {
            retired.push(previous);
        }
    }

    // Exposed for tests and offline rendering.
    pub fn render(&mut self, out: &mut [Frame], dt: f64, info: &Info) {
        self.adopt_pending();
        let Some(graph) = self.graph.as_mut() else { return };
        for block in out.chunks_mut(MAX_BLOCK) {
            graph.process(block.len(), dt, info);
            for (frame, mixed) in block.iter_mut().zip(graph.main.iter()) {
                *frame += *mixed;
            }
            if !graph.aux.is_empty() {
                if let Ok(mut aux) = self.shared.aux.frames.try_lock() {
                    for (channel, buffer) in &graph.aux {
                        if let Some((_, target)) = aux.iter_mut().find(|(candidate, _)| candidate == channel) {
                            let free = target.capacity() - target.len();
                            target.extend_from_slice(&buffer[..block.len().min(free)]);
                        }
                    }
                }
            }
        }
    }
}

impl Effect for MixGraphEffect {
    fn init(&mut self, sample_rate: u32, internal_buffer_size: usize) {
        self.shared.sample_rate.store(sample_rate, Ordering::Relaxed);
        self.shared.block_size.store(internal_buffer_size, Ordering::Relaxed);
    }

    fn process(&mut self, input: &mut [Frame], dt: f64, info: &Info) {
        self.render(input, dt, info);
    }
}

pub struct MixGraphEffectBuilder {
    pub(crate) shared: Arc<GraphShared>,
}

impl EffectBuilder for MixGraphEffectBuilder {
    type Handle = ();
    fn build(self) -> (Box<dyn Effect>, Self::Handle) {
        (Box::new(MixGraphEffect { shared: self.shared, graph: None }), ())
    }
}

impl MixGraphEffectBuilder {
    pub fn into_effect(self) -> MixGraphEffect {
        MixGraphEffect { shared: self.shared, graph: None }
    }
}

// Sits on a strip's Kira sub-track: hands the voices of that strip to the
// graph and silences the sub-track itself (the graph owns the strip output).
pub struct StripCapture {
    slot: Arc<CaptureSlot>,
}

impl StripCapture {
    pub fn new(slot: Arc<CaptureSlot>) -> Self {
        Self { slot }
    }
}

impl Effect for StripCapture {
    fn process(&mut self, input: &mut [Frame], _dt: f64, _info: &Info) {
        self.slot.store(input);
        input.fill(Frame::ZERO);
    }
}

pub struct StripCaptureBuilder {
    pub(crate) slot: Arc<CaptureSlot>,
}

impl EffectBuilder for StripCaptureBuilder {
    type Handle = ();
    fn build(self) -> (Box<dyn Effect>, Self::Handle) {
        (Box::new(StripCapture::new(self.slot)), ())
    }
}
