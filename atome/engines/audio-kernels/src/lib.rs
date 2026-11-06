// eVe's offline audio kernels: the work a page does on whole sounds, off the
// audio thread — the waveform of a clip, the attacks a Slice cuts at, the loop
// that joins best, an edit's render, the takes of an auto-sampling, the WAV and
// FLAC files a sample is kept in, and the cue tones of the Sport session and the
// metronome. The Web reaches them through squirrel-audio-wasm (src/kernels.rs);
// the JS keeps only the glue (step 7 of the Rust-first study: each kernel
// measured faster here than the JS it replaced, temp/step7_compute/).
// Channels are planar: one slice per channel, every slice of one length.

pub mod analysis;
pub mod flac;
pub mod onsets;
pub mod peaks;
pub mod render;
pub mod takes;
pub mod tones;
pub mod wav;

use std::fmt;

/// A refusal, its `code` the caller's own vocabulary (the sample editor's or the bank's).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KernelError {
    pub code: &'static str,
    pub message: String,
}

pub const INVALID_ARGUMENT: &str = "INVALID_ARGUMENT";
pub const EMPTY_RANGE: &str = "EMPTY_RANGE";
pub const UNREADABLE: &str = "bank/unreadable";
pub const UNSUPPORTED: &str = "bank/unsupported";

impl KernelError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for KernelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for KernelError {}

pub type Result<T> = std::result::Result<T, KernelError>;

/// Planar channels, checked: one channel at least, every one of the same length.
pub fn require_channels<T>(channels: &[&[T]]) -> Result<usize> {
    let Some(first) = channels.first() else {
        return Err(KernelError::new(INVALID_ARGUMENT, "one channel at least"));
    };
    if channels.iter().any(|channel| channel.len() != first.len()) {
        return Err(KernelError::new(INVALID_ARGUMENT, "channels of one length"));
    }
    Ok(first.len())
}

/// JavaScript's `Math.round` (half up, toward +∞), which every frame and level here follows.
pub fn js_round(value: f64) -> f64 {
    (value + 0.5).floor()
}

/// The mono mean of `channels` at `index`, summed in f64 as the editor always did.
pub(crate) fn mono(channels: &[&[f32]], index: usize) -> f64 {
    channels
        .iter()
        .map(|channel| f64::from(channel[index]))
        .sum::<f64>()
        / channels.len() as f64
}
