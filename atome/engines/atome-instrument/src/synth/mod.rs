// The synth (R-186 Q1, R-191): a polyphonic instrument whose voice is a patch
// of bricks (patch.rs), instantiated once per voice (voice.rs). Notes land on
// their frame; each voice renders its own signals, the voices are summed at the
// synth's one output and the strip's effects then act on the whole chord. The
// block is cut at its events and at control steps aligned on the synth's own
// clock, so a performance sounds the same whatever the host's block size.
// Voices are made once: past the polyphony a new note steals the oldest voice
// already released, else the oldest, which fades out in a few milliseconds.

pub mod patch;
mod voice;

pub use patch::{BrickDesc, BrickKind, Input, Patch, RouteDesc};

use crate::event::{EventKind, EventList, NoteEvent};
use crate::sampler::{BEND_RANGE, GAIN_DB, PARAMS, POLYPHONY, TUNE_CENTS};
use atome_dsp::{ParamSpec, Processor, Smoothed, StereoBlock};
use voice::{Moment, STEP, SynthVoice, Wiring};

const EVENT_CAPACITY: usize = 256;
// The modulation wheel (MIDI controller 1) is what the wheel brick reads.
const WHEEL: u8 = 1;
// The tempo an LFO in tempo follows until the host tells its own.
const DEFAULT_BPM: f32 = 120.0;

// The instrument parameters a synth plays: the rest of PARAMS belongs to the sampler's fixed voice.
pub const SYNTH_PARAMS: [u32; 4] = [GAIN_DB, TUNE_CENTS, POLYPHONY, BEND_RANGE];

pub struct Synth {
    patch: Patch,
    wiring: Wiring,
    voices: Vec<SynthVoice>,
    events: EventList,
    mix: Vec<f32>,
    values: [f32; PARAMS.len()],
    gain: Smoothed,
    bend: f32,
    wheel: f32,
    pressure: f32,
    bpm: f32,
    sustain_down: bool,
    now: u64,
    sample_rate: f32,
}

impl Synth {
    // Built off the audio thread; `voices` bounds polyphony plus the voices fading out.
    pub fn new(patch: Patch, voices: usize, sample_rate: f32) -> Self {
        let wiring = Wiring::new(&patch);
        let voices = (0..voices.max(2))
            .map(|_| SynthVoice::new(&patch, sample_rate))
            .collect();
        Self {
            patch,
            wiring,
            voices,
            events: EventList::with_capacity(EVENT_CAPACITY),
            mix: Vec::new(),
            values: PARAMS.map(|spec| spec.default),
            gain: Smoothed::new(1.0, 21.0),
            bend: 0.0,
            wheel: 0.0,
            pressure: 0.0,
            bpm: DEFAULT_BPM,
            sustain_down: false,
            now: 0,
            sample_rate,
        }
    }

    pub fn schedule(&mut self, event: NoteEvent) {
        self.events.push(event);
    }

    pub fn dropped_events(&self) -> usize {
        self.events.dropped()
    }

    pub fn sounding_voices(&self) -> usize {
        self.voices
            .iter()
            .filter(|voice| voice.active && !voice.choking())
            .count()
    }

    fn take(&mut self) -> usize {
        let polyphony = (self.values[POLYPHONY as usize] as usize).max(1);
        if self.sounding_voices() >= polyphony
            && let Some(index) = self
                .voices
                .iter()
                .enumerate()
                .filter(|(_, voice)| voice.active && !voice.choking())
                .min_by_key(|(_, voice)| (voice.key_down || voice.sustained, voice.started_at))
                .map(|(index, _)| index)
        {
            self.voices[index].choke();
        }
        if let Some(index) = self.voices.iter().position(|voice| !voice.active) {
            return index;
        }
        self.voices
            .iter()
            .enumerate()
            .min_by_key(|(_, voice)| (!voice.choking(), voice.started_at))
            .map(|(index, _)| index)
            .expect("a synth has voices")
    }

    fn apply(&mut self, kind: EventKind) {
        match kind {
            EventKind::NoteOn { note, velocity } => {
                let index = self.take();
                self.voices[index].start(note, velocity.clamp(0.0, 1.0), self.now);
            }
            EventKind::NoteOff { note } => {
                let sustain = self.sustain_down;
                for voice in self
                    .voices
                    .iter_mut()
                    .filter(|voice| voice.active && voice.key_down && voice.note == note)
                {
                    voice.key_down = false;
                    match sustain {
                        true => voice.sustained = true,
                        false => voice.release(),
                    }
                }
            }
            EventKind::Sustain { down } => {
                self.sustain_down = down;
                if !down {
                    for voice in self.voices.iter_mut().filter(|voice| voice.sustained) {
                        voice.release();
                    }
                }
            }
            EventKind::PitchBend { semitones } => {
                self.bend = semitones.clamp(-1.0, 1.0) * self.values[BEND_RANGE as usize]
            }
            EventKind::Controller { number, value } => {
                if number == WHEEL {
                    self.wheel = value.clamp(0.0, 1.0);
                }
            }
            EventKind::AllNotesOff => {
                for voice in self.voices.iter_mut().filter(|voice| voice.active) {
                    voice.key_down = false;
                    voice.release();
                }
            }
            EventKind::Pressure { value } => self.pressure = value.clamp(0.0, 1.0),
            EventKind::Tempo { bpm } => self.bpm = bpm,
            // A brick's value set while it plays: every voice hears it, and a voice made again starts with it.
            EventKind::BrickParam {
                brick,
                param,
                value,
            } => {
                let brick = usize::from(brick);
                let Some(described) = self.patch.bricks.get_mut(brick) else {
                    return;
                };
                let Some(spec) = described.kind.params().get(usize::from(param)) else {
                    return;
                };
                if !described.kind.patchable(spec.id) {
                    return;
                }
                let value = spec.clamp(value);
                described.values[usize::from(param)] = value;
                for voice in &mut self.voices {
                    voice.set(brick, spec.id, value);
                }
            }
        }
    }

    // Frames `start..end` of the block, cut at the control steps of the clock.
    fn render(&mut self, start: usize, end: usize) {
        let moment = Moment {
            offset: self.bend + self.values[TUNE_CENTS as usize] / 100.0,
            wheel: self.wheel,
            pressure: self.pressure,
            bpm: self.bpm,
        };
        let mut at = start;
        while at < end {
            let room = STEP - (self.now % STEP as u64) as usize;
            let piece = room.min(end - at);
            let out = &mut self.mix[at..at + piece];
            for voice in self.voices.iter_mut().filter(|voice| voice.active) {
                voice.render(&self.wiring, self.patch.output, &moment, out);
            }
            at += piece;
            self.now += piece as u64;
        }
    }

    // One block on the synth's one output.
    pub fn process_outputs(&mut self, left: &mut [f32], right: &mut [f32], frames: usize) {
        let _flush = atome_dsp::denormal::FlushDenormals::new();
        let frames = frames.min(self.mix.len());
        self.mix[..frames].fill(0.0);
        let mut cursor = 0;
        for index in 0..self.events.as_slice().len() {
            let event = self.events.as_slice()[index];
            let at = (event.offset as usize).min(frames);
            self.render(cursor, at);
            cursor = at;
            self.apply(event.kind);
        }
        self.events.clear();
        self.render(cursor, frames);
        for (index, (left, right)) in left[..frames]
            .iter_mut()
            .zip(right[..frames].iter_mut())
            .enumerate()
        {
            let value = self.mix[index] * self.gain.tick();
            *left = value;
            *right = value;
        }
    }
}

impl Processor for Synth {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        if sample_rate != self.sample_rate {
            self.sample_rate = sample_rate;
            self.voices = (0..self.voices.len())
                .map(|_| SynthVoice::new(&self.patch, sample_rate))
                .collect();
        }
        self.mix = vec![0.0; max_block];
        self.gain.prepare(sample_rate);
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames = block.frames();
        self.process_outputs(block.left, block.right, frames);
    }

    // The instrument parameters of SYNTH_PARAMS; the sampler's voice shape is the patch's here.
    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        self.values[id as usize] = value;
        if id == GAIN_DB {
            self.gain.set(atome_dsp::db_to_amplitude(value));
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn tail_frames(&self) -> u32 {
        (self.patch.release_ms() * 0.001 * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        self.events.clear();
        self.bend = 0.0;
        self.wheel = 0.0;
        self.pressure = 0.0;
        self.sustain_down = false;
        for voice in &mut self.voices {
            voice.active = false;
        }
        self.gain.settle();
    }
}
