//! Who is speaking to the device? A frame is "near" when Silero hears speech and its level
//! stands MARGIN_DB above the room: the 90th percentile of the last 10 s outside any turn,
//! i.e. the peaks of a television (its pauses between sentences included) or of steady noise.
//! No turn opens before 1 s of room has been heard. After that second, a frame enters the room
//! at most RISE_DB above it: a missed phrase must not raise the bar for the next one, while a
//! louder room (television turned up) is still learned within seconds. A turn opens on a near frame and closes
//! after 1 s without one. A turn too long for a command was the room speaking (a television): its
//! frames join the room by the same rule, else the room is never learned while it talks and every
//! sentence opens a turn. Measured on the lot 0 corpus (todo/refonte_assistant_vocal.md §11) and on
//! a 2-minute television (§18): 8 dB keeps the corpus and lets more commands through a television on
//! the iPad; below it, the television's own sentences open turns and mix into the commands (§18.6).

use std::collections::VecDeque;

const MARGIN_DB: f64 = 8.0;
const SPEECH_PROBABILITY: f32 = 0.5;
const AMBIENT_FRAMES: usize = 313; // 10 s of 32 ms frames
const MIN_AMBIENT_FRAMES: usize = 31; // 1 s
const RISE_DB: f64 = 4.5;
const ONSET_FRAMES: usize = 9; // 300 ms: the start of the phrase, not the room
const END_FRAMES: usize = 31; // 1 s without a near frame
const MAX_TURN_FRAMES: usize = 250; // 8 s: no command lasts that long
const MAX_NEAR_SECONDS: f64 = 2.2; // a command, not a conversation
const SPEECH_AMBIENT_SHARE: f64 = 0.3;
const FLOOR_DB: f64 = -60.0;
pub const FRAME_SECONDS: f64 = 0.032;

/// What one frame means for the turn in progress.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TurnStep {
    Idle,
    /// The first near frame: the turn starts; `gain` applies to every frame of the turn.
    Opened { gain: f32 },
    /// A frame inside the turn and the gain to feed it with (low frames attenuated under a television).
    Inside { gain: f32 },
    Closed(TurnEnd),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TurnEnd {
    Spoken,
    TooLong,
}

pub fn level_db(frame: &[f32]) -> f64 {
    let energy = frame.iter().map(|sample| (*sample as f64).powi(2)).sum::<f64>() / frame.len().max(1) as f64;
    (10.0 * energy.max(1e-18).log10()).max(FLOOR_DB)
}

struct Open { reference_db: f64, gate: bool, frames: usize, first_near: usize, last_near: usize, heard: Vec<(f64, bool)> }

#[derive(Default)]
pub struct TurnDetector {
    ambient: VecDeque<(f64, bool)>,
    open: Option<Open>,
}

impl TurnDetector {
    fn reference_db(&self) -> f64 {
        let mut levels: Vec<f64> = self.ambient.iter().map(|(level, _)| *level).collect();
        if levels.is_empty() { return FLOOR_DB; }
        levels.sort_by(|a, b| a.total_cmp(b));
        levels[(levels.len() - 1) * 9 / 10]
    }

    /// A television is speech: under it, frames that do not stand out are attenuated by 20 dB
    /// before recognition. Under steady noise the attenuation costs words, so it stays off.
    fn speech_ambient(&self) -> bool {
        let speech = self.ambient.iter().filter(|(_, speech)| *speech).count();
        !self.ambient.is_empty() && speech as f64 / self.ambient.len() as f64 > SPEECH_AMBIENT_SHARE
    }

    pub fn reset(&mut self) { self.open = None; }

    /// A frame of the room: at most RISE_DB above it once its first second is known.
    fn learn(&mut self, level: f64, speech: bool) {
        let room = if self.ambient.len() < MIN_AMBIENT_FRAMES { level } else { level.min(self.reference_db() + RISE_DB) };
        self.ambient.push_back((room, speech));
        if self.ambient.len() > AMBIENT_FRAMES { self.ambient.pop_front(); }
    }

    pub fn push(&mut self, probability: f32, level: f64) -> TurnStep {
        let speech = probability > SPEECH_PROBABILITY;
        let Some(open) = self.open.as_mut() else {
            let reference_db = self.reference_db();
            if speech && level > reference_db + MARGIN_DB && self.ambient.len() >= MIN_AMBIENT_FRAMES {
                // The softer first syllables that preceded this frame belong to the person.
                let mut onset: Vec<(f64, bool)> = (0..ONSET_FRAMES.min(self.ambient.len())).filter_map(|_| self.ambient.pop_back()).collect();
                onset.reverse();
                onset.push((level, speech));
                let gate = self.speech_ambient();
                self.open = Some(Open { reference_db, gate, frames: 1, first_near: 0, last_near: 0, heard: onset });
                return TurnStep::Opened { gain: 1.0 };
            }
            self.learn(level, speech);
            return TurnStep::Idle;
        };
        let index = open.frames;
        open.frames += 1;
        let near = speech && level > open.reference_db + MARGIN_DB;
        if near { open.last_near = index; }
        open.heard.push((level, speech));
        let end = if index - open.last_near >= END_FRAMES { Some(TurnEnd::Spoken) }
            else if open.frames >= MAX_TURN_FRAMES { Some(TurnEnd::TooLong) } else { None };
        if let Some(end) = end {
            let near_seconds = (open.last_near - open.first_near + 1) as f64 * FRAME_SECONDS;
            let end = if near_seconds > MAX_NEAR_SECONDS { TurnEnd::TooLong } else { end };
            let heard = std::mem::take(&mut open.heard);
            self.open = None;
            if end == TurnEnd::TooLong { for (level, speech) in heard { self.learn(level, speech); } }
            return TurnStep::Closed(end);
        }
        TurnStep::Inside { gain: self.gain(level) }
    }

    /// Gain for a frame of the open turn (also used for the pre-roll frames).
    pub fn gain(&self, level: f64) -> f32 {
        match &self.open {
            Some(open) if open.gate && level <= open.reference_db + MARGIN_DB => 0.1,
            _ => 1.0,
        }
    }
}
