//! « Ève, écoute-moi » while eVe is hung up: the openWakeWord front end (melspectrogram.onnx,
//! embedding_model.onnx) and the dense classifier eve_ecoute_moi.json, with its trigger policy
//! and the optional personal verifier. Port of atome/src/squirrel/voice/wake_features.js,
//! wake_classifier.js and wake_detector_worker.js (detection mode).

use super::VoiceError;
use base64::Engine as _;
use ort::environment::Environment;
use ort::session::Session;
use ort::value::Tensor;

pub const WAKE_FRAME_SAMPLES: usize = 1280; // 80 ms
const MEL_CONTEXT_SAMPLES: usize = 480;
const MEL_FRAMES_PER_FRAME: usize = 8;
const MEL_WINDOW_FRAMES: usize = 76;
const MEL_BINS: usize = 32;
const WINDOW_EMBEDDINGS: usize = 16;
const EMBEDDING_SIZE: usize = 96;
const WINDOW_SIZE: usize = WINDOW_EMBEDDINGS * EMBEDDING_SIZE;
// Silence gate: a frame whose last second stays at the room floor reuses the previous embedding.
const GATE_HOLD_FRAMES: usize = 12;
const GATE_RATIO: f64 = 1.6;
const GATE_FLOOR_RISE: f64 = 0.002;
const GATE_MIN_RMS: f64 = 1.0;

fn invalid(what: &str) -> VoiceError { VoiceError::Wake(format!("wake_classifier_invalid: {what}")) }

fn floats(text: &serde_json::Value) -> Result<Vec<f32>, VoiceError> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(text.as_str().ok_or_else(|| invalid("base64"))?).map_err(|_| invalid("base64"))?;
    Ok(bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect())
}

struct Layer { inputs: usize, outputs: usize, weights: Vec<f32>, bias: Vec<f32> }

/// Standardized input, ReLU hidden layers, sigmoid of the last unit.
pub struct Classifier { mean: Vec<f32>, scale: Vec<f32>, layers: Vec<Layer> }

impl Classifier {
    pub fn parse(json: &serde_json::Value) -> Result<Self, VoiceError> {
        let layers = json["layers"].as_array().filter(|layers| !layers.is_empty()).ok_or_else(|| invalid("layers"))?
            .iter().map(|layer| Ok(Layer {
                inputs: layer["inputs"].as_u64().ok_or_else(|| invalid("inputs"))? as usize,
                outputs: layer["outputs"].as_u64().ok_or_else(|| invalid("outputs"))? as usize,
                weights: floats(&layer["weights"])?, bias: floats(&layer["bias"])?,
            })).collect::<Result<Vec<_>, VoiceError>>()?;
        if layers[0].inputs != WINDOW_SIZE { return Err(invalid("window size")); }
        Ok(Self { mean: floats(&json["mean"])?, scale: floats(&json["scale"])?, layers })
    }

    pub fn score(&self, window: &[f32]) -> f32 {
        let mut activation: Vec<f32> = window.iter().zip(&self.mean).zip(&self.scale).map(|((x, m), s)| (x - m) * s).collect();
        for (index, layer) in self.layers.iter().enumerate() {
            let last = index == self.layers.len() - 1;
            activation = (0..layer.outputs).map(|unit| {
                let row = &layer.weights[unit * layer.inputs..(unit + 1) * layer.inputs];
                let sum = layer.bias[unit] + row.iter().zip(&activation).map(|(w, a)| w * a).sum::<f32>();
                if last { sum } else { sum.max(0.0) }
            }).collect();
        }
        1.0 / (1.0 + (-activation[0]).exp())
    }
}

#[derive(Clone, Copy)]
pub struct Policy { threshold: f32, consecutive: u32, voice_ratio: f64, verifier_gate: f32, verifier_threshold: f32 }

impl Policy {
    pub fn parse(json: &serde_json::Value) -> Result<Self, VoiceError> {
        let number = |key: &str| json[key].as_f64().ok_or_else(|| invalid(key));
        Ok(Self { threshold: number("threshold")? as f32, consecutive: number("consecutive")? as u32, voice_ratio: number("voiceRatio")?,
            verifier_gate: number("verifierGate")? as f32, verifier_threshold: number("verifierThreshold")? as f32 })
    }
}

struct Model { session: Session, input: String, output: String }

impl Model {
    fn load(environment: &Environment, path: &str) -> Result<Self, VoiceError> {
        let fail = |error: String| VoiceError::Wake(format!("{path}: {error}"));
        let session = Session::builder(environment).map_err(|e| fail(e.to_string()))?.with_intra_threads(1).map_err(|e| fail(e.to_string()))?
            .commit_from_file(path).map_err(|e| fail(e.to_string()))?;
        let input = session.inputs().first().ok_or_else(|| fail("no input".into()))?.name().to_string();
        let output = session.outputs().first().ok_or_else(|| fail("no output".into()))?.name().to_string();
        Ok(Self { session, input, output })
    }

    fn run(&mut self, shape: &[usize], data: Vec<f32>) -> Result<Vec<f32>, VoiceError> {
        let fail = |error: ort::Error| VoiceError::Wake(error.to_string());
        let tensor = Tensor::from_array((shape.to_vec(), data)).map_err(fail)?;
        let outputs = self.session.run(ort::inputs![self.input.as_str() => tensor]).map_err(fail)?;
        Ok(outputs[self.output.as_str()].try_extract_tensor::<f32>().map_err(fail)?.1.to_vec())
    }
}

pub struct WakeDetector {
    mel_model: Model,
    embedding_model: Model,
    base: Classifier,
    verifier: Option<Classifier>,
    policy: Policy,
    mel_input: Vec<f32>,
    mel: Vec<f32>,
    embeddings: Vec<f32>,
    filled: usize,
    floor: Option<f64>,
    quiet_frames: usize,
    recent: [f64; GATE_HOLD_FRAMES + 1],
    recent_index: usize,
    streak: u32,
}

impl WakeDetector {
    pub fn load(environment: &Environment, mel_path: &str, embedding_path: &str, classifier_path: &str) -> Result<Self, VoiceError> {
        let text = std::fs::read_to_string(classifier_path).map_err(|e| VoiceError::Wake(format!("{classifier_path}: {e}")))?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|_| invalid("json"))?;
        let mut detector = Self { mel_model: Model::load(environment, mel_path)?, embedding_model: Model::load(environment, embedding_path)?,
            base: Classifier::parse(&json)?, verifier: None, policy: Policy::parse(&json["policy"])?, mel_input: Vec::new(), mel: Vec::new(),
            embeddings: Vec::new(), filled: 0, floor: None, quiet_frames: 0, recent: [0.0; GATE_HOLD_FRAMES + 1], recent_index: 0, streak: 0 };
        detector.reset();
        Ok(detector)
    }

    /// The personal verifier (same JSON format, from the user's vault), or none.
    pub fn set_verifier(&mut self, verifier: Option<Classifier>) { self.verifier = verifier; }

    /// Every listening session starts from an empty history.
    pub fn reset(&mut self) {
        self.mel_input = vec![0.0; MEL_CONTEXT_SAMPLES + WAKE_FRAME_SAMPLES];
        self.mel = vec![1.0; MEL_WINDOW_FRAMES * MEL_BINS]; // silence after scaling, as the reference does
        self.embeddings = vec![0.0; WINDOW_SIZE];
        self.filled = 0; self.floor = None; self.quiet_frames = 0;
        self.recent = [0.0; GATE_HOLD_FRAMES + 1]; self.recent_index = 0; self.streak = 0;
    }

    fn quiet(&mut self, frame: &[f32]) -> bool {
        let rms = (frame.iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / frame.len() as f64).sqrt().max(GATE_MIN_RMS);
        self.recent[self.recent_index] = rms;
        self.recent_index = (self.recent_index + 1) % self.recent.len();
        let floor = match self.floor { Some(floor) if rms >= floor => floor + (rms - floor) * GATE_FLOOR_RISE, _ => rms };
        self.floor = Some(floor);
        self.quiet_frames = if rms <= floor * GATE_RATIO { self.quiet_frames + 1 } else { 0 };
        self.filled == WINDOW_EMBEDDINGS && self.quiet_frames > GATE_HOLD_FRAMES
    }

    fn voice_ratio(&self) -> f64 {
        self.floor.map_or(0.0, |floor| self.recent.iter().copied().fold(0.0, f64::max) / floor)
    }

    /// One 80 ms frame in int16 scale; the base score when the phrase is detected.
    pub fn push(&mut self, frame: &[f32]) -> Result<Option<f32>, VoiceError> {
        let skip = self.quiet(frame);
        self.mel_input.copy_within(WAKE_FRAME_SAMPLES.., 0);
        self.mel_input[MEL_CONTEXT_SAMPLES..].copy_from_slice(frame);
        let frames = self.mel_model.run(&[1, MEL_CONTEXT_SAMPLES + WAKE_FRAME_SAMPLES], self.mel_input.clone())?;
        if frames.len() != MEL_FRAMES_PER_FRAME * MEL_BINS { return Err(VoiceError::Wake("wake_mel_shape_invalid".into())); }
        self.mel.copy_within(frames.len().., 0);
        let tail = self.mel.len() - frames.len();
        for (slot, value) in self.mel[tail..].iter_mut().zip(&frames) { *slot = value / 10.0 + 2.0; }
        let latest = WINDOW_SIZE - EMBEDDING_SIZE;
        self.embeddings.copy_within(EMBEDDING_SIZE.., 0);
        if skip {
            // Nothing can be said in a silent second: no window is scored, the streak is kept.
            self.embeddings.copy_within(latest - EMBEDDING_SIZE..latest, latest);
            return Ok(None);
        }
        let embedding = self.embedding_model.run(&[1, MEL_WINDOW_FRAMES, MEL_BINS, 1], self.mel.clone())?;
        self.embeddings[latest..].copy_from_slice(&embedding);
        self.filled = (self.filled + 1).min(WINDOW_EMBEDDINGS);
        if self.filled < WINDOW_EMBEDDINGS { return Ok(None); }
        let base = self.base.score(&self.embeddings);
        let passed = match &self.verifier {
            None => base >= self.policy.threshold,
            Some(verifier) => base >= self.policy.verifier_gate && verifier.score(&self.embeddings) >= self.policy.verifier_threshold,
        };
        let voiced = self.voice_ratio() >= self.policy.voice_ratio;
        self.streak = if voiced && passed { self.streak + 1 } else { 0 };
        Ok((self.streak == self.policy.consecutive).then_some(base))
    }
}
