//! The voice engine of the guided conversation (todo/refonte_assistant_vocal.md §4.1): 16 kHz
//! mono PCM in, events out. Silero finds speech, the turn detector keeps the person speaking
//! to the device apart from the room, Vosk hears only the phrases of the current screen.
//! Hung up, only the wake phrase is listened for. One microphone stream feeds both modes.
//! The host never sends audio to JavaScript: it relays these events.

mod grammar;
pub mod session;
mod vad;
mod wake;

use atome_voice_turns::{level_db, Action, Conversation, TurnEnd, FRAME_SAMPLES};
use grammar::{is_unknown, Grammar, HeardWord, TurnRecognizer};
use vad::SileroVad;
use wake::{Classifier, WakeDetector, WAKE_FRAME_SAMPLES};

#[derive(Debug)]
pub enum VoiceError {
    Model(String),
    Vad(String),
    OutOfVocabulary(Vec<String>),
    NoPhrases,
    Recognizer,
    Decode(String),
    Wake(String),
}

impl std::fmt::Display for VoiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Model(path) => write!(f, "voice_model_unavailable: {path}"),
            Self::Vad(message) => write!(f, "voice_vad_failed: {message}"),
            Self::OutOfVocabulary(words) => write!(f, "voice_words_out_of_vocabulary: {}", words.join(", ")),
            Self::NoPhrases => write!(f, "voice_phrases_missing"),
            Self::Recognizer => write!(f, "voice_recognizer_failed"),
            Self::Decode(message) => write!(f, "voice_decode_failed: {message}"),
            Self::Wake(message) => write!(f, "voice_wake_failed: {message}"),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VoiceEvent {
    SpeechStart,
    /// The phrase heard; `words` keeps each word's confidence, `[unk]` included.
    Phrase { text: String, words: Vec<HeardWord> },
    /// A turn without a phrase of the screen: nothing in the grammar, or room talk too long for a command.
    Unknown { reason: &'static str },
    /// « Ève, écoute-moi » heard while hung up; `score` is the base model's.
    Wake { score: f32 },
}

/// Model files, all shipped with the app.
pub struct VoiceModels<'a> {
    pub vosk_dir: &'a str,
    pub silero: &'a str,
    pub wake_mel: &'a str,
    pub wake_embedding: &'a str,
    pub wake_classifier: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Listening {
    /// Turns of the guided conversation.
    Conversation,
    /// Hung up: only the wake phrase.
    Wake,
}

pub struct VoiceEngine {
    vad: SileroVad,
    grammar: Grammar,
    conversation: Conversation,
    turn: Option<TurnRecognizer>,
    wake: WakeDetector,
    listening: Listening,
    pending: Vec<f32>,
    speaking: bool,
    input_db: f64,
}

impl VoiceEngine {
    pub fn load(models: &VoiceModels) -> Result<Self, VoiceError> {
        let environment = ort::environment::init().build().map_err(|error| VoiceError::Vad(error.to_string()))?;
        Ok(Self { vad: SileroVad::load(&environment, models.silero)?, grammar: Grammar::load(models.vosk_dir)?, conversation: Conversation::default(),
            turn: None, wake: WakeDetector::load(&environment, models.wake_mel, models.wake_embedding, models.wake_classifier)?,
            listening: Listening::Conversation, pending: Vec::new(), speaking: false, input_db: f64::NEG_INFINITY })
    }

    /// The phrases of the current screen; takes effect from the next turn.
    pub fn set_phrases(&mut self, phrases: &[String]) -> Result<(), VoiceError> { self.grammar.set_phrases(phrases) }

    /// While eVe speaks the microphone is ignored, then for 300 ms after her voice ends.
    pub fn set_speaking(&mut self, speaking: bool) {
        if self.conversation.set_speaking(speaking) { self.turn = None; self.vad.reset(); }
        self.speaking = speaking;
    }

    /// Conversation or hung up; each switch starts the new mode from a clean history.
    pub fn set_listening(&mut self, listening: Listening) {
        self.turn = None;
        self.conversation.reset();
        self.pending.clear();
        self.vad.reset();
        self.wake.reset();
        self.listening = listening;
    }

    /// The user's personal wake verifier (eve_ecoute_moi.json format), or none.
    pub fn set_wake_verifier(&mut self, verifier_json: Option<&str>) -> Result<(), VoiceError> {
        let verifier = match verifier_json {
            None => None,
            Some(text) => Some(Classifier::parse(&serde_json::from_str(text).map_err(|error| VoiceError::Wake(error.to_string()))?)?),
        };
        self.wake.set_verifier(verifier);
        Ok(())
    }

    /// Level of the last frame, in dBFS, for the assistant disc.
    pub fn input_db(&self) -> f64 { self.input_db }

    /// 16 kHz mono samples in [-1, 1]; returns the events they complete.
    pub fn push(&mut self, samples: &[f32]) -> Result<Vec<VoiceEvent>, VoiceError> {
        self.pending.extend_from_slice(samples);
        if self.listening == Listening::Wake { return self.push_wake(); }
        let mut events = Vec::new();
        while self.pending.len() >= FRAME_SAMPLES {
            let frame: Vec<f32> = self.pending.drain(..FRAME_SAMPLES).collect();
            let listened = self.conversation.listen(&frame);
            self.input_db = self.conversation.input_db();
            if !listened { continue; }
            let probability = self.vad.probability(&frame)?;
            for action in self.conversation.push(frame, probability) {
                if let Some(event) = self.act(action)? { events.push(event); }
            }
        }
        Ok(events)
    }

    fn push_wake(&mut self) -> Result<Vec<VoiceEvent>, VoiceError> {
        let mut events = Vec::new();
        while self.pending.len() >= WAKE_FRAME_SAMPLES {
            let frame: Vec<f32> = self.pending.drain(..WAKE_FRAME_SAMPLES).collect();
            self.input_db = level_db(&frame);
            // The wake models were trained on int16-scale samples.
            let frame: Vec<f32> = frame.iter().map(|sample| sample * 32768.0).collect();
            if self.speaking { continue; }
            if let Some(score) = self.wake.push(&frame)? { events.push(VoiceEvent::Wake { score }); }
        }
        Ok(events)
    }

    fn act(&mut self, action: Action) -> Result<Option<VoiceEvent>, VoiceError> {
        match action {
            Action::SpeechStart => { self.turn = Some(TurnRecognizer::new(&self.grammar)?); Ok(Some(VoiceEvent::SpeechStart)) }
            Action::Feed(pcm) => { if let Some(turn) = self.turn.as_mut() { turn.feed(&pcm)?; } Ok(None) }
            Action::Close(end) => {
                let Some(turn) = self.turn.take() else { return Ok(None) };
                let words = turn.finish();
                if end == TurnEnd::TooLong { return Ok(Some(VoiceEvent::Unknown { reason: "too_long" })); }
                let text = words.iter().filter(|word| !is_unknown(word)).map(|word| word.word.as_str()).collect::<Vec<_>>().join(" ");
                Ok(Some(if text.is_empty() { VoiceEvent::Unknown { reason: "outside_grammar" } } else { VoiceEvent::Phrase { text, words } }))
            }
        }
    }
}
