// eVe real-time DSP: the one processor contract every effect, generator brick
// and mixer module honours, whatever hosts it (native device callback, Kira
// mixer graph, Web AudioWorklet). `process` never allocates, locks or does IO.

pub mod biquad;
pub mod catalog;
pub mod chain;
pub mod control;
pub mod convolution;
pub mod crossover;
pub mod deesser;
pub mod delay;
pub mod denoise;
pub mod denormal;
pub mod detector;
pub mod doubler;
pub mod drive;
pub mod dynamics;
pub mod envelope;
pub mod eq;
pub mod expander;
mod formant;
pub mod gain;
pub mod gate;
pub mod harmonizer;
pub mod imager;
pub mod lofi;
pub mod loudness;
pub mod maximizer;
pub mod modulation;
pub mod multiband;
pub mod nam;
pub mod noise;
pub mod oscillator;
pub mod oversample;
pub mod param;
pub mod pitch;
pub mod resample;
pub mod reverb;
pub mod rhythm;
pub mod saturator;
pub mod scope;
pub mod spectrum;
pub mod split;
pub mod stft;
pub mod svf;
pub mod transient;
pub mod transport;
pub mod tuner;
pub mod vocoder;
pub mod yin;

pub use chain::Chain;
pub use param::{ParamSpec, Smoothed, Unit};
pub use transport::Transport;

// A parameter's value at every frame of the block (audio-rate modulation).
#[derive(Clone, Copy)]
pub struct ParamBuffer<'a> {
    pub id: u32,
    pub values: &'a [f32],
}

// What a control output carries: a modulator writes values in this range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ControlRange {
    // −1..1 (an LFO, a macro).
    Bipolar,
    // 0..1 (an envelope, a follower).
    Unipolar,
}

// Planar stereo block: a mono processor works on `left` and copies to `right`.
pub struct StereoBlock<'a> {
    pub left: &'a mut [f32],
    pub right: &'a mut [f32],
}

impl<'a> StereoBlock<'a> {
    pub fn new(left: &'a mut [f32], right: &'a mut [f32]) -> Self {
        debug_assert_eq!(left.len(), right.len());
        Self { left, right }
    }

    pub fn frames(&self) -> usize {
        self.left.len()
    }

    // A shorter view on the same samples, used to split a block at an event.
    pub fn slice(&mut self, start: usize, end: usize) -> StereoBlock<'_> {
        StereoBlock {
            left: &mut self.left[start..end],
            right: &mut self.right[start..end],
        }
    }
}

// A read-only stereo signal: the key that drives a keyed processor (sidechain).
#[derive(Clone, Copy)]
pub struct KeyBlock<'a> {
    pub left: &'a [f32],
    pub right: &'a [f32],
}

pub trait Processor: Send + Sync {
    // Called off the audio thread before any `process`; the only place a
    // processor may allocate. `max_block` bounds every later block.
    fn prepare(&mut self, sample_rate: f32, max_block: usize);

    fn process(&mut self, block: &mut StereoBlock);

    // Called on the audio thread; the processor smooths the value itself.
    fn set_param(&mut self, id: u32, value: f32);

    // The parameters this processor exposes (UI, MCP, presets read them).
    fn params(&self) -> &'static [ParamSpec];

    // Frames by which the output lags the input (latency compensation).
    fn latency_frames(&self) -> u32 {
        0
    }

    // Frames the output keeps ringing after the input falls silent.
    fn tail_frames(&self) -> u32 {
        0
    }

    // Clears every internal state (delay lines, envelopes) without reallocating.
    fn reset(&mut self);

    // Where the music stands at the start of the next block (its beat and
    // tempo); only a processor that counts in beats listens (R-367).
    fn set_transport(&mut self, transport: &Transport) {
        let _ = transport;
    }

    // Signals written beyond `block` (a band split): port 0 is `block` itself,
    // ports 1.. land in `extra`, each as long as `block`.
    fn extra_outputs(&self) -> usize {
        0
    }

    fn process_ports(&mut self, block: &mut StereoBlock, extra: &mut [StereoBlock]) {
        debug_assert!(extra.is_empty());
        self.process(block);
    }

    // Whether another signal may drive this processor (a sidechain key).
    fn takes_key(&self) -> bool {
        false
    }

    fn process_keyed(&mut self, block: &mut StereoBlock, key: KeyBlock) {
        let _ = key;
        self.process(block);
    }

    // Live measurements the UI shows (gain reduction, loudness, a spectrum),
    // in the order of its kind's `readings` keys; written by `process`, read
    // after it on the audio thread and published lock-free by the host.
    fn readings(&self) -> &[f32] {
        &[]
    }

    // Control signals it writes beside its audio (a modulator): one value per
    // frame of the last processed block, read by the host right after it.
    fn control_outputs(&self) -> usize {
        0
    }

    fn control(&self, output: usize) -> &[f32] {
        let _ = output;
        &[]
    }

    // Whether the parameter follows a value per frame (`process_modulated`);
    // any other parameter is stepped by `set_param` and smoothed as usual.
    fn audio_rate(&self, id: u32) -> bool {
        let _ = id;
        false
    }

    // Processes the block with `params` given at every frame. A processor
    // without audio-rate parameters takes each one's first value.
    fn process_modulated(&mut self, block: &mut StereoBlock, params: &[ParamBuffer]) {
        for param in params {
            if let Some(value) = param.values.first() {
                self.set_param(param.id, *value);
            }
        }
        self.process(block);
    }
}

pub const SILENCE_DB: f32 = -120.0;

pub fn db_to_amplitude(db: f32) -> f32 {
    if db <= SILENCE_DB {
        0.0
    } else {
        10f32.powf(db / 20.0)
    }
}

pub fn amplitude_to_db(amplitude: f32) -> f32 {
    if amplitude <= 1.0e-6 {
        SILENCE_DB
    } else {
        20.0 * amplitude.log10()
    }
}
