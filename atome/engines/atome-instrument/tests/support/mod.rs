// Shared helpers for the sampler tests: tone and level samples, a block renderer.
#![allow(dead_code)]

use atome_dsp::{Processor, StereoBlock};
use atome_instrument::{FiredMarker, Keymap, Marker, MarkerKind, MarkerSpan, NoteEvent, SampleBank, SampleData, Sampler, Segment, When, Zone};

pub const RATE: f32 = 48_000.0;
pub const BLOCK: usize = 256;

pub fn sine(frequency: f32, seconds: f32) -> Vec<f32> {
    (0..(seconds * RATE) as usize).map(|i| (2.0 * std::f32::consts::PI * frequency * i as f32 / RATE).sin() * 0.5).collect()
}

pub fn level(value: f32, seconds: f32) -> Vec<f32> {
    vec![value; (seconds * RATE) as usize]
}

pub fn sampler(zones: Vec<Zone>, bank: SampleBank) -> Sampler {
    let keymap = Keymap::new(zones, &bank, 89).expect("valid keymap");
    let mut sampler = Sampler::new(keymap, bank, 34);
    sampler.prepare(RATE, BLOCK);
    sampler.set_param(atome_instrument::sampler::ATTACK_MS, 0.1);
    sampler.set_param(atome_instrument::sampler::VELOCITY_SENSE, 0.0);
    sampler
}

// A sampler whose segments name markers of `markers`, drawing from `seed`.
pub fn sampler_with(zones: Vec<Zone>, markers: Vec<Marker>, bank: SampleBank, seed: u64) -> Sampler {
    let keymap = Keymap::with_markers(zones, markers, &bank, seed).expect("valid keymap");
    let mut sampler = Sampler::new(keymap, bank, 34);
    sampler.prepare(RATE, BLOCK);
    sampler.set_param(atome_instrument::sampler::ATTACK_MS, 0.1);
    sampler.set_param(atome_instrument::sampler::VELOCITY_SENSE, 0.0);
    sampler
}

pub fn marker(frame: usize, label: u16, when: When, reports: bool) -> Marker {
    Marker { frame, kind: if reports { MarkerKind::Action } else { MarkerKind::Slice }, when, label, reports }
}

// The whole of sample `sample` (`frames` long) carrying markers `first..first + len` of the table.
pub fn marked(sample: usize, frames: usize, first: u32, len: u32) -> Segment {
    Segment { markers: MarkerSpan { first, len }, ..Segment::whole(sample, frames, 60) }
}

// The command markers reported so far, oldest first.
pub fn drained(sampler: &Sampler) -> Vec<FiredMarker> {
    let mut fired = Vec::new();
    sampler.actions().drain(|marker| fired.push(marker));
    fired
}

pub fn bank(samples: Vec<SampleData>) -> SampleBank {
    let mut bank = SampleBank::new();
    for sample in samples {
        bank.add(sample);
    }
    bank
}

// Renders `frames`, applying `events` (absolute frames) at their frame.
pub fn render(sampler: &mut Sampler, frames: usize, events: &[NoteEvent]) -> (Vec<f32>, Vec<f32>) {
    let mut left = vec![0.0; frames];
    let mut right = vec![0.0; frames];
    let mut at = 0;
    while at < frames {
        let end = (at + BLOCK).min(frames);
        for event in events.iter().filter(|event| (event.offset as usize) >= at && (event.offset as usize) < end) {
            sampler.schedule(NoteEvent { offset: event.offset - at as u32, kind: event.kind });
        }
        let (l, r) = (&mut left[at..end], &mut right[at..end]);
        sampler.process(&mut StereoBlock::new(l, r));
        at = end;
    }
    (left, right)
}

// Rising crossings with a little hysteresis, so a ripple near zero (a phase
// vocoder's) is not counted as a period.
pub fn frequency(signal: &[f32]) -> f32 {
    let threshold = peak(signal) * 0.1;
    let mut armed = false;
    let mut crossings = 0;
    for value in signal {
        if *value < -threshold {
            armed = true;
        } else if armed && *value > threshold {
            armed = false;
            crossings += 1;
        }
    }
    crossings as f32 * RATE / signal.len() as f32
}

pub fn peak(signal: &[f32]) -> f32 {
    signal.iter().fold(0.0f32, |peak, value| peak.max(value.abs()))
}
