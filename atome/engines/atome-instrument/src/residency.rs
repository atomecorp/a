// Which frames of a streamed sample stay in memory (cahier sampler §2: « le
// début de chaque sample en mémoire »). A read can begin, or jump, only where
// the instrument says: a segment's start (its offsets by velocity included),
// its end when it plays backward, its loop (a wrap goes back, a let-go leaves
// from anywhere in it), and the markers a composed note jumps to. Each of those
// points is followed, in every direction it can be read, by one head: frames
// enough to cover the worker's read before the ring takes over. A round-robin
// or a composed note's draw therefore never waits for the disk: every take it
// can draw has its heads. Spans closer than a head are joined.
//
// HEAD_FRAMES = 12 288 (3 × 4096, a natural number of rule 19): read at pitch
// at 48 kHz it lasts 256 ms, two octaves up (the sinc tables' top band, ×4)
// 64 ms — against a worker that looks every 2 ms and an SSD read of a chunk
// measured under a millisecond (temp/synth/streaming). A stretched take keeps
// two heads: priming its stretcher reads up to one head ahead at the note.
// A loop is held whole (a ping-pong or a splice reads both ways in it).

use crate::composed::Follow;
use crate::interp::TAPS;
use crate::keymap::Keymap;
use crate::markers::Marker;
use crate::sample::SampleBank;
use crate::segment::{Playback, Segment};

pub const HEAD_FRAMES: usize = 12_288;
// A sample this short is held whole (three heads: a streamed one would save little).
pub const WHOLE_BELOW: usize = 3 * HEAD_FRAMES;

// The spans one segment needs, as (first, past-the-end) frames, unclamped.
fn segment_spans(segment: &Segment, markers: &[Marker], jumps: &[u16], out: &mut Vec<(i64, i64)>) {
    let head = (if segment.is_stretched() { 2 * HEAD_FRAMES } else { HEAD_FRAMES } + TAPS) as i64;
    let (start, end) = (segment.start as i64, segment.end as i64);
    let (offset, skip) = (segment.offset as i64, (segment.offset + segment.velocity_offset) as i64);
    match segment.playback {
        Playback::Forward => out.push((start + offset - TAPS as i64, start + skip + head)),
        Playback::Reverse => out.push((end - 1 - skip - head, end - offset + TAPS as i64)),
    }
    if let Some(spec) = segment.looping {
        out.push((spec.start as i64 - spec.crossfade as i64 - head, spec.end as i64 + head));
    }
    for marker in markers.iter().filter(|marker| jumps.contains(&marker.label)) {
        out.push((marker.frame as i64 - head, marker.frame as i64 + head));
    }
}

// Clamped to the sample, sorted, joined when closer than a head: (start, len).
fn joined(mut spans: Vec<(i64, i64)>, frames: usize) -> Vec<(usize, usize)> {
    for span in &mut spans {
        *span = (span.0.clamp(0, frames as i64), span.1.clamp(0, frames as i64));
    }
    spans.retain(|(start, end)| start < end);
    spans.sort_unstable();
    let mut out: Vec<(usize, usize)> = Vec::with_capacity(spans.len());
    for (start, end) in spans {
        let (start, end) = (start as usize, end as usize);
        match out.last_mut() {
            Some(last) if start <= last.0 + last.1 + HEAD_FRAMES => last.1 = last.1.max(end - last.0),
            _ => out.push((start, end - start)),
        }
    }
    out
}

impl SampleBank {
    // Off the audio thread, before the sampler is made: every streamed sample
    // reads the spans `keymap` can start, loop or jump in.
    pub fn reside(&mut self, keymap: &Keymap) -> Result<(), String> {
        let count = self.len();
        if count > crate::stream::MAX_STREAMED_SAMPLES && (0..count).any(|index| self.get(index).is_some_and(|data| data.is_streamed())) {
            return Err(format!("a streaming instrument holds {} samples at most", crate::stream::MAX_STREAMED_SAMPLES));
        }
        for (index, data) in self.samples_mut().iter_mut().enumerate() {
            if !data.is_streamed() {
                continue;
            }
            let mut wanted = Vec::new();
            for zone in keymap.zones() {
                let jumps: Vec<u16> = zone.composed.iter().flat_map(|composed| composed.transitions.iter())
                    .filter_map(|transition| match transition.follow { Follow::JumpMarker(label) => Some(label), _ => None }).collect();
                for segment in zone.segments().filter(|segment| segment.sample == index) {
                    segment_spans(segment, keymap.markers().span(segment.markers), &jumps, &mut wanted);
                }
            }
            *data = data.with_spans(&joined(wanted, data.frames()))?;
        }
        Ok(())
    }
}
