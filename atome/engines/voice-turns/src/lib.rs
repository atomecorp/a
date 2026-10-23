//! The turn logic of the voice engine (todo/refonte_assistant_vocal.md §11), without any model:
//! the host scores each 32 ms frame with Silero and feeds the recognizer; this crate decides
//! who speaks to the device, when a phrase starts and ends, and what the recognizer hears.
//! Shared by the native engine (atome-audio-engine `voice`) and the browser WASM.

mod turn;

pub use turn::{level_db, TurnEnd};
use std::collections::VecDeque;
use turn::{TurnDetector, TurnStep};

/// 32 ms at 16 kHz: the frame Silero scores.
pub const FRAME_SAMPLES: usize = 512;
const PREROLL_FRAMES: usize = 9; // 300 ms before the first near frame
const SPEAKING_TAIL_FRAMES: usize = 9; // 300 ms after eVe's voice ends

/// What the host does with a scored frame.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    /// A turn opens: create the recognizer of the current screen.
    SpeechStart,
    /// 16-bit PCM for the recognizer of the open turn.
    Feed(Vec<i16>),
    /// The turn closes: read the recognizer.
    Close(TurnEnd),
}

fn to_pcm(frame: &[f32], gain: f32) -> Vec<i16> {
    frame.iter().map(|sample| (sample * gain * 32768.0).clamp(-32768.0, 32767.0) as i16).collect()
}

pub struct Conversation {
    turns: TurnDetector,
    preroll: VecDeque<(Vec<f32>, f64)>,
    speaking: bool,
    tail: usize,
    input_db: f64,
}

impl Default for Conversation {
    fn default() -> Self {
        Self { turns: TurnDetector::default(), preroll: VecDeque::new(), speaking: false, tail: 0, input_db: f64::NEG_INFINITY }
    }
}

impl Conversation {
    /// While eVe speaks the microphone is ignored, then for 300 ms after her voice ends.
    /// True when the stream is cut: the host resets the Silero state.
    pub fn set_speaking(&mut self, speaking: bool) -> bool {
        if speaking { self.reset(); }
        else if self.speaking { self.tail = SPEAKING_TAIL_FRAMES; }
        self.speaking = speaking;
        speaking
    }

    /// Drops the turn in progress (eVe speaks, or the listening mode changes).
    pub fn reset(&mut self) {
        self.turns.reset();
        self.preroll.clear();
    }

    /// Level of the last frame, in dBFS.
    pub fn input_db(&self) -> f64 { self.input_db }

    /// First step of every frame (`FRAME_SAMPLES` samples in [-1, 1]): records its level and
    /// tells whether the host must score it, i.e. whether anyone is listened to.
    pub fn listen(&mut self, frame: &[f32]) -> bool {
        self.input_db = level_db(frame);
        if self.speaking { return false; }
        if self.tail > 0 { self.tail -= 1; return false; }
        true
    }

    /// Second step, for a frame `listen` accepted: its Silero speech probability.
    pub fn push(&mut self, frame: Vec<f32>, probability: f32) -> Vec<Action> {
        let level = self.input_db;
        match self.turns.push(probability, level) {
            TurnStep::Idle => {
                self.preroll.push_back((frame, level));
                if self.preroll.len() > PREROLL_FRAMES { self.preroll.pop_front(); }
                Vec::new()
            }
            TurnStep::Opened { gain } => {
                let mut actions = vec![Action::SpeechStart];
                for (before, before_level) in self.preroll.drain(..) { actions.push(Action::Feed(to_pcm(&before, self.turns.gain(before_level)))); }
                actions.push(Action::Feed(to_pcm(&frame, gain)));
                actions
            }
            TurnStep::Inside { gain } => vec![Action::Feed(to_pcm(&frame, gain))],
            TurnStep::Closed(end) => vec![Action::Close(end)],
        }
    }
}
