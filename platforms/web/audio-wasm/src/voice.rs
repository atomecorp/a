//! The voice engine's turn logic for the browser (atome-voice-turns, the same code as the native
//! engine): the page scores frames with Silero (onnxruntime-web) and feeds Vosk (vosk-browser);
//! this object decides who speaks to the device and what the recognizer hears.
use atome_voice_turns::{Action, Conversation, TurnEnd};
use js_sys::{Array, Float32Array, Int16Array, Object, Reflect, Uint32Array};
use wasm_bindgen::prelude::*;

fn action(kind: &str, extra: Option<(&str, JsValue)>) -> JsValue {
    let object = Object::new();
    let _ = Reflect::set(&object, &"type".into(), &kind.into());
    if let Some((key, value)) = extra { let _ = Reflect::set(&object, &key.into(), &value); }
    object.into()
}

#[wasm_bindgen]
pub struct VoiceConversation(Conversation);

#[wasm_bindgen]
impl VoiceConversation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self { Self(Conversation::default()) }

    /// True when the stream is cut: the page resets the Silero state.
    #[wasm_bindgen(js_name = setSpeaking)]
    pub fn set_speaking(&mut self, speaking: bool) -> bool { self.0.set_speaking(speaking) }

    pub fn reset(&mut self) { self.0.reset() }

    /// Test mode (todo/refonte_assistant_vocal.md §18.7), off by default: every frame scored is kept.
    #[wasm_bindgen(js_name = setRecording)]
    pub fn set_recording(&mut self, on: bool) { self.0.set_recording(on) }

    /// `{ pcm: Float32Array, cuts: Uint32Array }` of the turn the last `close` ended, once; else undefined.
    #[wasm_bindgen(js_name = takeRecording)]
    pub fn take_recording(&mut self) -> JsValue {
        let Some(take) = self.0.take_recording() else { return JsValue::UNDEFINED };
        let cuts: Vec<u32> = take.cuts.iter().map(|cut| *cut as u32).collect();
        let object = Object::new();
        let _ = Reflect::set(&object, &"pcm".into(), &Float32Array::from(take.pcm.as_slice()).into());
        let _ = Reflect::set(&object, &"cuts".into(), &Uint32Array::from(cuts.as_slice()).into());
        object.into()
    }

    #[wasm_bindgen(js_name = inputDb)]
    pub fn input_db(&self) -> f64 { self.0.input_db() }

    /// 512 samples in [-1, 1]: whether Silero must score this frame.
    pub fn listen(&mut self, frame: &[f32]) -> bool { self.0.listen(frame) }

    /// `{ type: 'speech_start' }`, `{ type: 'feed', pcm: Int16Array }`, `{ type: 'close', end: 'spoken' | 'too_long' }`.
    pub fn push(&mut self, frame: Vec<f32>, probability: f32) -> Array {
        self.0.push(frame, probability).into_iter().map(|step| match step {
            Action::SpeechStart => action("speech_start", None),
            Action::Feed(pcm) => action("feed", Some(("pcm", Int16Array::from(pcm.as_slice()).into()))),
            Action::Close(end) => action("close", Some(("end", (if end == TurnEnd::TooLong { "too_long" } else { "spoken" }).into()))),
        }).collect()
    }
}
