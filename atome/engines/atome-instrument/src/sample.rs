// A sample is loaded once and shared by every zone and voice that plays it
// (an `Arc`, never a copy). A short one lies whole in memory; a long one keeps
// only its spans — the frames where a read can begin, read off the audio thread
// for the instrument that plays it (residency.rs) — and the rest streams from
// its source into the players' rings (stream.rs). Both are the same reading:
// a whole sample is one span covering every frame. Voices refer to a sample by
// its index in the bank, so the audio thread never touches a reference count.

use crate::reading::Source;
use crate::stream::{FrameSource, Streams};
use crate::ActionQueue;
use std::sync::{Arc, Mutex, Weak};

// Frames of one channel pair; `right` is empty for a mono sample.
pub struct SpanFrames {
    pub left: Vec<f32>,
    pub right: Vec<f32>,
}

// Frames `start..start + len` held in memory.
#[derive(Clone)]
pub struct Span {
    pub start: usize,
    pub frames: Arc<SpanFrames>,
}

impl Span {
    pub fn len(&self) -> usize {
        self.frames.left.len()
    }

    pub fn is_empty(&self) -> bool {
        self.frames.left.is_empty()
    }

    pub fn end(&self) -> usize {
        self.start + self.len()
    }
}

// A streamed sample's source and the spans already read from it, held weakly:
// two instruments (or the direct path and the timeline) needing the same span
// share it; a span no instrument holds any more is freed.
struct Streamed {
    source: Arc<dyn FrameSource>,
    read: Mutex<Vec<(usize, usize, Weak<SpanFrames>)>>,
}

#[derive(Clone)]
pub struct SampleData {
    pub sample_rate: f32,
    frames: usize,
    mono: bool,
    // Sorted, apart from one another.
    spans: Arc<[Span]>,
    streamed: Option<Arc<Streamed>>,
}

impl SampleData {
    pub fn mono(samples: Vec<f32>, sample_rate: f32) -> Self {
        Self::whole(SpanFrames { left: samples, right: Vec::new() }, true, sample_rate)
    }

    pub fn stereo(left: Vec<f32>, right: Vec<f32>, sample_rate: f32) -> Self {
        assert_eq!(left.len(), right.len(), "a stereo sample has two channels of one length");
        Self::whole(SpanFrames { left, right }, false, sample_rate)
    }

    fn whole(frames: SpanFrames, mono: bool, sample_rate: f32) -> Self {
        let length = frames.left.len();
        Self { sample_rate, frames: length, mono, spans: Arc::new([Span { start: 0, frames: Arc::new(frames) }]), streamed: None }
    }

    // A sample read from `source`: whole when it is short, else streamed
    // (its spans are read when an instrument names it, `with_spans`).
    pub fn load(source: Arc<dyn FrameSource>) -> Result<Self, String> {
        let (frames, sample_rate, mono) = (source.frames(), source.sample_rate(), source.channels() == 1);
        if frames == 0 {
            return Err("an empty sample".to_string());
        }
        if frames <= crate::residency::WHOLE_BELOW {
            let span = read_span(source.as_ref(), 0, frames)?;
            return Ok(Self::whole(span, mono, sample_rate));
        }
        if frames > crate::stream::MAX_STREAMED_FRAMES {
            return Err(format!("a streamed sample holds {} frames at most", crate::stream::MAX_STREAMED_FRAMES));
        }
        Ok(Self { sample_rate, frames, mono, spans: Arc::new([]), streamed: Some(Arc::new(Streamed { source, read: Mutex::new(Vec::new()) })) })
    }

    pub fn frames(&self) -> usize {
        self.frames
    }

    pub fn is_mono(&self) -> bool {
        self.mono
    }

    pub fn is_streamed(&self) -> bool {
        self.streamed.is_some()
    }

    pub fn spans(&self) -> &[Span] {
        &self.spans
    }

    // Frames held in memory (a whole sample: all of them).
    pub fn resident_frames(&self) -> usize {
        self.spans.iter().map(Span::len).sum()
    }

    // Frame `index` when it is in memory: (left, right).
    pub fn frame(&self, index: usize) -> Option<(f32, f32)> {
        let span = self.span_at(index)?;
        let at = index - span.start;
        let left = span.frames.left[at];
        Some((left, if self.mono { left } else { span.frames.right[at] }))
    }

    // The span holding frame `index`.
    pub fn span_at(&self, index: usize) -> Option<&Span> {
        let next = self.spans.partition_point(|span| span.start <= index);
        self.spans[..next].last().filter(|span| index < span.end())
    }

    pub(crate) fn source(&self) -> Option<Arc<dyn FrameSource>> {
        self.streamed.as_ref().map(|streamed| streamed.source.clone())
    }

    // The same sample holding `wanted` (sorted, apart) in memory, read off the
    // audio thread; a span already read for another instrument is shared.
    pub fn with_spans(&self, wanted: &[(usize, usize)]) -> Result<Self, String> {
        let Some(streamed) = &self.streamed else { return Ok(self.clone()) };
        let mut read = streamed.read.lock().map_err(|error| format!("sample spans lock: {error}"))?;
        read.retain(|(_, _, frames)| frames.strong_count() > 0);
        let mut spans = Vec::with_capacity(wanted.len());
        for &(start, len) in wanted {
            let known = read.iter().find(|(at, length, _)| *at == start && *length == len).and_then(|(_, _, frames)| frames.upgrade());
            let frames = match known {
                Some(frames) => frames,
                None => {
                    let frames = Arc::new(read_span(streamed.source.as_ref(), start, len)?);
                    read.push((start, len, Arc::downgrade(&frames)));
                    frames
                }
            };
            spans.push(Span { start, frames });
        }
        Ok(Self { spans: spans.into(), ..self.clone() })
    }
}

fn read_span(source: &dyn FrameSource, start: usize, len: usize) -> Result<SpanFrames, String> {
    let mut left = vec![0.0; len];
    let mut right = if source.channels() == 1 { Vec::new() } else { vec![0.0; len] };
    let mut scratch = Vec::new();
    let right_out = if right.is_empty() {
        scratch.resize(len, 0.0);
        &mut scratch[..]
    } else {
        &mut right[..]
    };
    source.read(start, &mut left, right_out)?;
    Ok(SpanFrames { left, right })
}

#[derive(Clone, Default)]
pub struct SampleBank {
    samples: Vec<SampleData>,
    streams: Option<Arc<Streams>>,
    resided: bool,
}

impl SampleBank {
    pub fn new() -> Self {
        Self::default()
    }

    // Returns the index zones and segments use to name this sample.
    pub fn add(&mut self, sample: SampleData) -> usize {
        self.samples.push(sample);
        self.samples.len() - 1
    }

    pub fn get(&self, index: usize) -> Option<&SampleData> {
        self.samples.get(index)
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    // Frames held in memory by every sample of the bank.
    pub fn resident_frames(&self) -> usize {
        self.samples.iter().map(SampleData::resident_frames).sum()
    }

    // Residency (residency.rs) reads the spans of the streamed samples.
    pub(crate) fn samples_mut(&mut self) -> &mut [SampleData] {
        self.resided = true;
        &mut self.samples
    }

    // With the sampler, off the audio thread: `rings` rings when a sample streams.
    // A streamed sample must already hold its spans (`reside`).
    pub fn prepare_streams(&mut self, rings: usize) {
        if self.streams.is_some() || !self.samples.iter().any(SampleData::is_streamed) {
            return;
        }
        assert!(self.resided, "a bank with streamed samples is resided against its keymap before its sampler is prepared");
        self.streams = Some(Streams::new(self.samples.iter().map(SampleData::source).collect(), rings));
    }

    // The rings a feeder fills (stream::serve), when a sample streams.
    pub fn streams(&self) -> Option<&Arc<Streams>> {
        self.streams.as_ref()
    }

    // How a player reads sample `sample` through ring `ring` (render thread).
    pub fn source<'a>(&'a self, sample: usize, ring: usize, report: &'a ActionQueue) -> Source<'a> {
        let data = &self.samples[sample];
        let ring = self.streams.as_ref().filter(|_| data.is_streamed()).map(|streams| streams.ring(ring));
        Source::new(data, sample, ring, report)
    }
}
