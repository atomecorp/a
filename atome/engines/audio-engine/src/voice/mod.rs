//! The voice engine of the guided conversation (todo/refonte_assistant_vocal.md §4.1): 16 kHz
//! mono PCM in, events out. Silero finds speech, the turn detector keeps the person speaking
//! to the device apart from the room, Vosk hears only the phrases of the current screen.
//! Hung up or in standby, only the wake phrase is listened for, with the wake models alone in
//! memory until a conversation starts; enrollment collects the wake windows. One microphone
//! stream feeds every mode.
//! The host never sends audio to JavaScript: it relays these events.

mod grammar;
pub mod session;
mod vad;
mod wake;

pub use atome_voice_turns::Take;
use atome_voice_turns::{Action, Conversation, FRAME_SAMPLES, TurnEnd, level_db};
use grammar::{Grammar, HeardWord, TurnRecognizer, is_unknown};
use ort::environment::Environment;
use vad::SileroVad;
use wake::{Classifier, WAKE_FRAME_SAMPLES, WakeDetector};

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
            Self::OutOfVocabulary(words) => {
                write!(f, "voice_words_out_of_vocabulary: {}", words.join(", "))
            }
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
    Phrase {
        text: String,
        words: Vec<HeardWord>,
    },
    /// A turn without a phrase of the screen: nothing in the grammar, or room talk too long for a command.
    Unknown {
        reason: &'static str,
    },
    /// « Ève, écoute-moi » heard while hung up; `score` is the base model's.
    Wake {
        score: f32,
    },
    /// Collection (enrollment): one window of wake embeddings and its base score.
    Window {
        window: Vec<f32>,
        base_score: f32,
    },
}

/// Model files, all shipped with the app.
pub struct VoiceModels {
    pub vosk_dir: String,
    pub silero: String,
    pub wake_mel: String,
    pub wake_embedding: String,
    pub wake_classifier: String,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Listening {
    /// Turns of the guided conversation.
    Conversation,
    /// Hung up, or in standby: only the wake phrase.
    Wake,
    /// Enrollment: every wake window, with its base score.
    Collect,
}

impl Listening {
    pub fn parse(name: &str) -> Result<Self, String> {
        match name {
            "conversation" => Ok(Self::Conversation),
            "wake" => Ok(Self::Wake),
            "collect" => Ok(Self::Collect),
            other => Err(format!("voice_listening_invalid:{other}")),
        }
    }
}

/// What a conversation needs beyond the wake phrase: loaded with its first turn, so standby
/// holds the wake models alone (no Vosk model in memory while nobody speaks to eVe).
struct Hearing {
    vad: SileroVad,
    grammar: Grammar,
}

pub struct VoiceEngine {
    environment: Environment,
    models: VoiceModels,
    hearing: Option<Hearing>,
    conversation: Conversation,
    turn: Option<TurnRecognizer>,
    wake: WakeDetector,
    listening: Listening,
    pending: Vec<f32>,
    speaking: bool,
    input_db: f64,
}

/// A shipped model file, or `voice_model_unavailable: <path>` when it is not there, whatever
/// loads it (ONNX Runtime, the wake classifier's JSON): the hosts map that code to a missing model.
fn model_file(path: &str) -> Result<&str, VoiceError> {
    if std::path::Path::new(path).is_file() {
        Ok(path)
    } else {
        Err(VoiceError::Model(path.to_string()))
    }
}

static ENVIRONMENT: std::sync::Mutex<Option<Environment>> = std::sync::Mutex::new(None);

/// The process's ONNX Runtime environment. ONNX Runtime builds one per process, ever: a second
/// `build()` fails even once the first is dropped, so it is built at the first session and kept
/// for every later one (standby opens and closes its session at each visibility change).
fn environment() -> Result<Environment, VoiceError> {
    let mut slot = ENVIRONMENT
        .lock()
        .map_err(|_| VoiceError::Vad("voice_environment_poisoned".into()))?;
    if let Some(environment) = slot.as_ref() {
        return Ok(environment.clone());
    }
    let environment = ort::environment::init()
        .build()
        .map_err(|error| VoiceError::Vad(error.to_string()))?;
    Ok(slot.insert(environment).clone())
}

impl VoiceEngine {
    /// The wake models always; the conversation's (Silero, Vosk) only when it listens to one.
    pub fn load(models: VoiceModels, listening: Listening) -> Result<Self, VoiceError> {
        let environment = environment()?;
        let wake = WakeDetector::load(
            &environment,
            &models.wake_mel,
            &models.wake_embedding,
            &models.wake_classifier,
        )?;
        let mut engine = Self {
            environment,
            models,
            hearing: None,
            conversation: Conversation::default(),
            turn: None,
            wake,
            listening,
            pending: Vec::new(),
            speaking: false,
            input_db: f64::NEG_INFINITY,
        };
        if listening == Listening::Conversation {
            engine.hearing()?;
        }
        Ok(engine)
    }

    fn hearing(&mut self) -> Result<&mut Hearing, VoiceError> {
        let hearing = match self.hearing.take() {
            Some(hearing) => hearing,
            None => Hearing {
                vad: SileroVad::load(&self.environment, &self.models.silero)?,
                grammar: Grammar::load(&self.models.vosk_dir)?,
            },
        };
        Ok(self.hearing.insert(hearing))
    }

    /// The phrases of the current screen; takes effect from the next turn.
    pub fn set_phrases(&mut self, phrases: &[String]) -> Result<(), VoiceError> {
        self.hearing()?.grammar.set_phrases(phrases)
    }

    /// While eVe speaks the microphone is ignored, then for 300 ms after her voice ends.
    pub fn set_speaking(&mut self, speaking: bool) {
        if self.conversation.set_speaking(speaking) {
            self.turn = None;
            if let Some(hearing) = self.hearing.as_mut() {
                hearing.vad.reset();
            }
        }
        self.speaking = speaking;
    }

    /// Conversation, hung up or collection; each switch starts the new mode from a clean history.
    /// The first conversation loads Silero and Vosk.
    pub fn set_listening(&mut self, listening: Listening) -> Result<(), VoiceError> {
        if listening == Listening::Conversation {
            self.hearing()?;
        }
        self.turn = None;
        self.conversation.reset();
        self.pending.clear();
        if let Some(hearing) = self.hearing.as_mut() {
            hearing.vad.reset();
        }
        self.wake.reset();
        self.listening = listening;
        Ok(())
    }

    /// The user's personal wake verifier (eve_ecoute_moi.json format), or none.
    pub fn set_wake_verifier(&mut self, verifier_json: Option<&str>) -> Result<(), VoiceError> {
        let verifier = match verifier_json {
            None => None,
            Some(text) => Some(Classifier::parse(
                &serde_json::from_str(text).map_err(|error| VoiceError::Wake(error.to_string()))?,
            )?),
        };
        self.wake.set_verifier(verifier);
        Ok(())
    }

    /// Level of the last frame, in dBFS, for the assistant disc.
    pub fn input_db(&self) -> f64 {
        self.input_db
    }

    /// Test mode, off by default: every frame scored, handed over with each turn's close (`take_recording`).
    pub fn set_recording(&mut self, on: bool) {
        self.conversation.set_recording(on);
    }
    pub fn take_recording(&mut self) -> Option<Take> {
        self.conversation.take_recording()
    }

    /// 16 kHz mono samples in [-1, 1]; returns the events they complete.
    pub fn push(&mut self, samples: &[f32]) -> Result<Vec<VoiceEvent>, VoiceError> {
        self.pending.extend_from_slice(samples);
        if self.listening != Listening::Conversation {
            return self.push_wake();
        }
        let mut events = Vec::new();
        while self.pending.len() >= FRAME_SAMPLES {
            let frame: Vec<f32> = self.pending.drain(..FRAME_SAMPLES).collect();
            let listened = self.conversation.listen(&frame);
            self.input_db = self.conversation.input_db();
            if !listened {
                continue;
            }
            let probability = self.hearing()?.vad.probability(&frame)?;
            for action in self.conversation.push(frame, probability) {
                if let Some(event) = self.act(action)? {
                    events.push(event);
                }
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
            if self.speaking {
                continue;
            }
            if self.listening == Listening::Collect {
                if let Some((window, base_score)) = self.wake.collect(&frame)? {
                    events.push(VoiceEvent::Window { window, base_score });
                }
            } else if let Some(score) = self.wake.push(&frame)? {
                events.push(VoiceEvent::Wake { score });
            }
        }
        Ok(events)
    }

    fn act(&mut self, action: Action) -> Result<Option<VoiceEvent>, VoiceError> {
        match action {
            Action::SpeechStart => {
                self.turn = Some(TurnRecognizer::new(&self.hearing()?.grammar)?);
                Ok(Some(VoiceEvent::SpeechStart))
            }
            Action::Feed(pcm) => {
                if let Some(turn) = self.turn.as_mut() {
                    turn.feed(&pcm)?;
                }
                Ok(None)
            }
            Action::Close(end) => {
                let Some(turn) = self.turn.take() else {
                    return Ok(None);
                };
                let words = turn.finish();
                if end == TurnEnd::TooLong {
                    return Ok(Some(VoiceEvent::Unknown { reason: "too_long" }));
                }
                let text = words
                    .iter()
                    .filter(|word| !is_unknown(word))
                    .map(|word| word.word.as_str())
                    .collect::<Vec<_>>()
                    .join(" ");
                Ok(Some(if text.is_empty() {
                    VoiceEvent::Unknown {
                        reason: "outside_grammar",
                    }
                } else {
                    VoiceEvent::Phrase { text, words }
                }))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    // A second voice session in the same process (the guide restarted, standby resumed) gets the
    // environment the first one built: ONNX Runtime refuses to build another.
    #[test]
    fn every_session_shares_the_one_process_environment() {
        assert!(super::environment().is_ok());
        assert!(super::environment().is_ok());
    }

    // A missing model file says so (`voice_model_unavailable`), as the browser's
    // `wake_model_missing` does, never a generic wake failure.
    #[test]
    fn a_missing_model_file_is_reported_as_unavailable() {
        let missing = |name: &str| format!("/nonexistent/voice/{name}");
        let models = super::VoiceModels {
            vosk_dir: missing("vosk"),
            silero: missing("silero.onnx"),
            wake_mel: missing("melspectrogram.onnx"),
            wake_embedding: missing("embedding_model.onnx"),
            wake_classifier: missing("eve_ecoute_moi.json"),
        };
        let error = super::VoiceEngine::load(models, super::Listening::Wake)
            .err()
            .expect("missing models must fail");
        assert!(
            matches!(error, super::VoiceError::Model(ref path) if path.ends_with("eve_ecoute_moi.json"))
        );
    }
}
