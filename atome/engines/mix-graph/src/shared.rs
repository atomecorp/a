// Render-side plumbing: per-strip capture effect, meters, the graph hand-off
// between threads and the effect that runs the whole graph on the main track.
//
// Render-thread rule: no blocking lock, no allocation, and replaced graphs go
// back to the control thread to be dropped there. A capture slot is written
// and read on the render thread alone, so its `try_lock` never meets a rival.

use crate::dsp::AtomicParam;
use crate::graph::{Graph, MAX_BLOCK};
use kira::Frame;
use kira::effect::{Effect, EffectBuilder};
use kira::info::Info;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

pub struct CaptureSlot {
    frames: Mutex<(Vec<Frame>, usize)>,
}

impl CaptureSlot {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            frames: Mutex::new((vec![Frame::ZERO; MAX_BLOCK], 0)),
        })
    }

    fn store(&self, input: &[Frame]) {
        if let Ok(mut guard) = self.frames.try_lock() {
            let (frames, len) = &mut *guard;
            let count = input.len().min(frames.len());
            frames[..count].copy_from_slice(&input[..count]);
            *len = count;
        }
    }

    // Copies the captured frames from `offset` into `out` (silence past what
    // the strip's track rendered this block).
    pub fn read_at(&self, offset: usize, out: &mut [Frame]) {
        out.fill(Frame::ZERO);
        if let Ok(guard) = self.frames.try_lock() {
            let (frames, len) = &*guard;
            let count = len.saturating_sub(offset).min(out.len());
            out[..count].copy_from_slice(&frames[offset..offset + count]);
        }
    }

    // The block is consumed: a track silent next block plays silence.
    pub fn finish(&self) {
        if let Ok(mut guard) = self.frames.try_lock() {
            guard.1 = 0;
        }
    }

    // Live input sources write here between blocks (lot "live input").
    pub fn push(&self, input: &[Frame]) {
        self.store(input);
    }
}

// A live input (microphone, interface input) monitored through a strip: the
// input thread pushes frames, the render thread pulls exactly one block. A
// single-producer single-consumer ring of atomics: neither side ever waits.
// The reader keeps the backlog under half the ring, dropping the oldest
// frames, so a slow start never turns into a growing delay.
pub struct LiveInput {
    samples: Box<[AtomicU32]>,
    mask: usize,
    written: AtomicUsize,
    read: AtomicUsize,
    // Where the last pull started, and the capture clock of the last push
    // (its first frame's index, its clock): a REC point takes its start from
    // them (record_tap.rs). The clock is the pusher's: host ns natively, the
    // context frame on the Web.
    pulled_from: AtomicUsize,
    anchor: Mutex<Option<(usize, f64)>>,
    // The physical channels it takes from its interface's interleaved capture (R-286), counted from 0: one (mono, heard
    // on both sides) or two (left, right); none takes the first two, the first doubled on a one-channel device.
    channels: Box<[u16]>,
}

// Where a strip's input stood when a take's first frame was rendered.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InputPosition {
    pub pulled_from: usize,
    pub anchor: Option<(usize, f64)>,
}

impl LiveInput {
    pub fn new(capacity: usize) -> Arc<Self> {
        Self::with_channels(capacity, &[])
    }

    pub fn with_channels(capacity: usize, channels: &[u16]) -> Arc<Self> {
        let frames = capacity.max(2).next_power_of_two();
        Arc::new(Self {
            samples: (0..frames * 2).map(|_| AtomicU32::new(0)).collect(),
            mask: frames - 1,
            written: AtomicUsize::new(0),
            read: AtomicUsize::new(0),
            pulled_from: AtomicUsize::new(0),
            anchor: Mutex::new(None),
            channels: channels.into(),
        })
    }

    pub fn channels(&self) -> &[u16] {
        &self.channels
    }

    // Whether a capture of `width` interleaved channels holds every channel this input takes: an interface exposing
    // fewer is an error where its stream opens, never another channel in its place.
    pub fn fits(&self, width: usize) -> Result<(), String> {
        match self
            .channels
            .iter()
            .find(|channel| usize::from(**channel) >= width)
        {
            Some(channel) => Err(format!(
                "live_input_channel_unavailable: {} of {width}",
                channel + 1
            )),
            None => Ok(()),
        }
    }

    // One frame of an interleaved capture (`frame`, every channel of the interface at one instant), as this input takes
    // it. Its channels were checked against the capture's width (`fits`) when the stream opened.
    pub fn frame_of(&self, frame: &[f32]) -> Frame {
        let at = |channel: u16| frame.get(usize::from(channel)).copied().unwrap_or(0.0);
        match *self.channels {
            [] => {
                let left = frame.first().copied().unwrap_or(0.0);
                Frame::new(left, frame.get(1).copied().unwrap_or(left))
            }
            [mono] => Frame::from_mono(at(mono)),
            [left, right, ..] => Frame::new(at(left), at(right)),
        }
    }

    // A push whose first frame was captured at `clock` (never waits: a busy
    // anchor keeps the previous one, still exact for a steady input).
    pub fn push_at(&self, input: &[Frame], clock: f64) -> usize {
        let first = self.written.load(Ordering::Relaxed);
        if let Ok(mut anchor) = self.anchor.try_lock() {
            *anchor = Some((first, clock));
        }
        self.push(input)
    }

    pub fn position(&self) -> InputPosition {
        InputPosition {
            pulled_from: self.pulled_from.load(Ordering::Relaxed),
            anchor: self.anchor.try_lock().ok().and_then(|anchor| *anchor),
        }
    }

    // Moves every waiting frame (up to `out.len()`) into `out`, dropping none:
    // a REC point's ring, drained by its writer (record_tap.rs).
    pub fn take(&self, out: &mut [Frame]) -> usize {
        let written = self.written.load(Ordering::Acquire);
        let read = self.read.load(Ordering::Relaxed);
        let count = written.wrapping_sub(read).min(out.len());
        for (index, slot) in out.iter_mut().take(count).enumerate() {
            let at = (read.wrapping_add(index) & self.mask) * 2;
            *slot = Frame::new(
                f32::from_bits(self.samples[at].load(Ordering::Relaxed)),
                f32::from_bits(self.samples[at + 1].load(Ordering::Relaxed)),
            );
        }
        self.read.store(read.wrapping_add(count), Ordering::Release);
        count
    }

    fn frames(&self) -> usize {
        self.mask + 1
    }

    // A full ring drops what does not fit; returns the frames kept.
    pub fn push(&self, input: &[Frame]) -> usize {
        let written = self.written.load(Ordering::Relaxed);
        let read = self.read.load(Ordering::Acquire);
        let free = self.frames() - written.wrapping_sub(read);
        for (index, frame) in input.iter().take(free).enumerate() {
            let slot = (written.wrapping_add(index) & self.mask) * 2;
            self.samples[slot].store(frame.left.to_bits(), Ordering::Relaxed);
            self.samples[slot + 1].store(frame.right.to_bits(), Ordering::Relaxed);
        }
        self.written.store(
            written.wrapping_add(input.len().min(free)),
            Ordering::Release,
        );
        input.len().min(free)
    }

    // Frames waiting to be pulled.
    pub fn available(&self) -> usize {
        self.written
            .load(Ordering::Acquire)
            .wrapping_sub(self.read.load(Ordering::Relaxed))
    }

    pub fn pull(&self, out: &mut [Frame]) {
        out.fill(Frame::ZERO);
        let written = self.written.load(Ordering::Acquire);
        let mut read = self.read.load(Ordering::Relaxed);
        let backlog = written.wrapping_sub(read);
        if backlog > self.frames() / 2 {
            read = written.wrapping_sub(self.frames() / 2);
        }
        self.pulled_from.store(read, Ordering::Relaxed);
        self.read.store(read, Ordering::Relaxed);
        self.take(out);
    }
}

#[derive(Debug, Default)]
pub struct StripMeter {
    left: AtomicU32,
    right: AtomicU32,
    rms: AtomicU32,
}

// What a strip's meter read: the loudest sample of each channel since the last read, and the last block's RMS.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct MeterReading {
    pub left: f32,
    pub right: f32,
    pub rms: f32,
}

// Keeps the loudest block until the control thread reads it.
fn hold_peak(slot: &AtomicU32, peak: f32) {
    if peak > f32::from_bits(slot.load(Ordering::Relaxed)) {
        slot.store(peak.to_bits(), Ordering::Relaxed);
    }
}

impl StripMeter {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
    pub fn record(&self, (left, right): (f32, f32), rms: f32) {
        hold_peak(&self.left, left);
        hold_peak(&self.right, right);
        self.rms.store(rms.to_bits(), Ordering::Relaxed);
    }
    pub fn read(&self) -> MeterReading {
        let take = |slot: &AtomicU32| f32::from_bits(slot.swap(0f32.to_bits(), Ordering::Relaxed));
        MeterReading {
            left: take(&self.left),
            right: take(&self.right),
            rms: f32::from_bits(self.rms.load(Ordering::Relaxed)),
        }
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
            *frames = (1..=pairs)
                .map(|pair| (pair, Vec::with_capacity(capacity)))
                .collect();
        }
    }

    pub fn pairs(&self) -> u16 {
        self.frames
            .lock()
            .map(|frames| frames.len() as u16)
            .unwrap_or(0)
    }

    // Moves up to `out.len()` frames of `pair` into `out` (the rest is silence).
    pub fn drain_pair(&self, pair: u16, out: &mut [Frame]) {
        out.fill(Frame::ZERO);
        let Ok(mut frames) = self.frames.try_lock() else {
            return;
        };
        let Some((_, buffer)) = frames.iter_mut().find(|(candidate, _)| *candidate == pair) else {
            return;
        };
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
    // Frames rendered so far: the clock a transport is anchored on (automation.rs).
    pub frames: AtomicU64,
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
            frames: AtomicU64::new(0),
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
        let Ok(mut retired) = self.shared.retired.try_lock() else {
            return;
        };
        if retired.len() >= retired.capacity() {
            return;
        }
        let Ok(mut pending) = self.shared.pending.try_lock() else {
            return;
        };
        let Some(mut next) = pending.take() else {
            return;
        };
        if let Some(previous) = self.graph.as_mut() {
            next.adopt(previous);
        }
        if let Some(previous) = self.graph.replace(next) {
            retired.push(previous);
        }
    }

    // Exposed for tests and offline rendering.
    pub fn render(&mut self, out: &mut [Frame]) {
        let _flush = atome_dsp::denormal::FlushDenormals::new();
        self.adopt_pending();
        let Some(graph) = self.graph.as_mut() else {
            return;
        };
        let sample_rate = self.shared.sample_rate.load(Ordering::Relaxed).max(1) as f64;
        for block in out.chunks_mut(MAX_BLOCK) {
            let frame = self.shared.frames.load(Ordering::Relaxed);
            graph.process(block.len(), frame, sample_rate);
            self.shared
                .frames
                .fetch_add(block.len() as u64, Ordering::Relaxed);
            for (frame, mixed) in block.iter_mut().zip(graph.main.iter()) {
                *frame += *mixed;
            }
            if !graph.aux.is_empty()
                && let Ok(mut aux) = self.shared.aux.frames.try_lock()
            {
                for (channel, buffer) in &graph.aux {
                    if let Some((_, target)) =
                        aux.iter_mut().find(|(candidate, _)| candidate == channel)
                    {
                        let free = target.capacity() - target.len();
                        target.extend_from_slice(&buffer[..block.len().min(free)]);
                    }
                }
            }
        }
    }
}

impl Effect for MixGraphEffect {
    fn init(&mut self, sample_rate: u32, internal_buffer_size: usize) {
        self.shared
            .sample_rate
            .store(sample_rate, Ordering::Relaxed);
        self.shared
            .block_size
            .store(internal_buffer_size, Ordering::Relaxed);
    }

    fn process(&mut self, input: &mut [Frame], _dt: f64, _info: &Info) {
        self.render(input);
    }
}

pub struct MixGraphEffectBuilder {
    pub(crate) shared: Arc<GraphShared>,
}

impl EffectBuilder for MixGraphEffectBuilder {
    type Handle = ();
    fn build(self) -> (Box<dyn Effect>, Self::Handle) {
        (
            Box::new(MixGraphEffect {
                shared: self.shared,
                graph: None,
            }),
            (),
        )
    }
}

impl MixGraphEffectBuilder {
    pub fn into_effect(self) -> MixGraphEffect {
        MixGraphEffect {
            shared: self.shared,
            graph: None,
        }
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
