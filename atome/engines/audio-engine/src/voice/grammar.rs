//! Vosk restricted to the phrases of the current screen. A phrase holding a word the model
//! does not know is refused: Vosk itself would drop it silently.

use super::VoiceError;
use vosk::{CompleteResult, DecodingState, Model, Recognizer};

pub const SAMPLE_RATE: f32 = 16000.0;
const UNKNOWN: &str = "[unk]";

pub struct Grammar {
    model: Model,
    phrases: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HeardWord {
    pub word: String,
    pub conf: f32,
}

impl Grammar {
    pub fn load(model_dir: &str) -> Result<Self, VoiceError> {
        vosk::set_log_level(vosk::LogLevel::Error);
        let model = Model::new(model_dir).ok_or_else(|| VoiceError::Model(model_dir.to_string()))?;
        Ok(Self { model, phrases: Vec::new() })
    }

    pub fn set_phrases(&mut self, phrases: &[String]) -> Result<(), VoiceError> {
        let mut missing: Vec<String> = phrases.iter().flat_map(|phrase| phrase.split_whitespace())
            .filter(|word| self.model.find_word(word).is_none()).map(str::to_string).collect();
        missing.dedup();
        if !missing.is_empty() { return Err(VoiceError::OutOfVocabulary(missing)); }
        self.phrases = phrases.to_vec();
        self.phrases.push(UNKNOWN.to_string());
        Ok(())
    }

    pub fn recognizer(&self) -> Result<Recognizer, VoiceError> {
        if self.phrases.is_empty() { return Err(VoiceError::NoPhrases); }
        let mut recognizer = Recognizer::new_with_grammar(&self.model, SAMPLE_RATE, &self.phrases).ok_or(VoiceError::Recognizer)?;
        recognizer.set_words(true);
        Ok(recognizer)
    }
}

/// Words of a recognizer result, appended to `words`.
fn collect(result: CompleteResult, words: &mut Vec<HeardWord>) {
    if let Some(single) = result.single() {
        words.extend(single.result.iter().map(|word| HeardWord { word: word.word.to_string(), conf: word.conf }));
    }
}

/// The recognizer of one turn: fed while the person speaks, read when the turn closes.
pub struct TurnRecognizer {
    recognizer: Recognizer,
    words: Vec<HeardWord>,
}

impl TurnRecognizer {
    pub fn new(grammar: &Grammar) -> Result<Self, VoiceError> {
        Ok(Self { recognizer: grammar.recognizer()?, words: Vec::new() })
    }

    pub fn feed(&mut self, pcm: &[i16]) -> Result<(), VoiceError> {
        match self.recognizer.accept_waveform(pcm) {
            Ok(DecodingState::Finalized) => { collect(self.recognizer.result(), &mut self.words); Ok(()) }
            Ok(_) => Ok(()),
            Err(error) => Err(VoiceError::Decode(format!("{error:?}"))),
        }
    }

    /// The heard words; `[unk]` stands for speech outside the grammar.
    pub fn finish(mut self) -> Vec<HeardWord> {
        collect(self.recognizer.final_result(), &mut self.words);
        self.words
    }
}

pub fn is_unknown(word: &HeardWord) -> bool { word.word == UNKNOWN }
