//! Silero VAD v5 through ONNX Runtime: one speech probability per 32 ms frame at 16 kHz.
//! The model reads the 512 new samples behind the last 64 ones, and carries a recurrent state.

use super::VoiceError;
use ort::environment::Environment;
use ort::session::Session;
use ort::value::Tensor;

pub const FRAME_SAMPLES: usize = 512;
const CONTEXT_SAMPLES: usize = 64;
const STATE_SIZE: usize = 2 * 128;

pub struct SileroVad {
    session: Session,
    state: Vec<f32>,
    context: Vec<f32>,
}

impl SileroVad {
    pub fn load(environment: &Environment, model_path: &str) -> Result<Self, VoiceError> {
        let fail = |error: String| VoiceError::Vad(error);
        let session = Session::builder(environment).map_err(|error| fail(error.to_string()))?
            .with_intra_threads(1).map_err(|error| fail(error.to_string()))?
            .commit_from_file(model_path).map_err(|error| fail(error.to_string()))?;
        Ok(Self { session, state: vec![0.0; STATE_SIZE], context: vec![0.0; CONTEXT_SAMPLES] })
    }

    /// The audio stream was cut (eVe spoke): the recurrent state no longer matches it.
    pub fn reset(&mut self) {
        self.state.fill(0.0);
        self.context.fill(0.0);
    }

    /// Speech probability of one frame of `FRAME_SAMPLES` samples in [-1, 1].
    pub fn probability(&mut self, frame: &[f32]) -> Result<f32, VoiceError> {
        let mut input = Vec::with_capacity(CONTEXT_SAMPLES + FRAME_SAMPLES);
        input.extend_from_slice(&self.context);
        input.extend_from_slice(frame);
        let fail = |error: ort::Error| VoiceError::Vad(error.to_string());
        let outputs = self.session.run(ort::inputs![
            "input" => Tensor::from_array(([1usize, CONTEXT_SAMPLES + FRAME_SAMPLES], input)).map_err(fail)?,
            "state" => Tensor::from_array(([2usize, 1, 128], self.state.clone())).map_err(fail)?,
            "sr" => Tensor::from_array(([1usize], vec![16000i64])).map_err(fail)?
        ]).map_err(fail)?;
        self.state.copy_from_slice(outputs["stateN"].try_extract_tensor::<f32>().map_err(fail)?.1);
        let probability = outputs["output"].try_extract_tensor::<f32>().map_err(fail)?.1[0];
        self.context.copy_from_slice(&frame[FRAME_SAMPLES - CONTEXT_SAMPLES..]);
        Ok(probability)
    }
}
