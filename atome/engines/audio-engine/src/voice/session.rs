//! The voice session a host drives (Tauri commands, iOS C ABI): one `VoiceEngine` on its own
//! thread, fed every 40 ms either by the engine's microphone capture (desktop, Android) or by
//! PCM the host pushes (iOS, where Swift owns the audio session). Events wait in an outbox the
//! host reads; audio never leaves the native side.

use super::{Listening, VoiceEngine, VoiceModels};
use crate::wake_capture;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const PUMP: Duration = Duration::from_millis(40);
const MAX_PUSHED_SAMPLES: usize = 16000 * 5;

type Reply = Sender<Result<(), String>>;

enum Control {
    Phrases(Vec<String>, Reply),
    Speaking(bool),
    Listening(Listening),
    Verifier(Option<String>, Reply),
    Stop,
}

#[derive(Default)]
struct Outbox {
    events: Vec<Value>,
    input_db: Option<f64>,
    pushed: Vec<f32>,
    overrun: bool,
}

struct Session {
    control: Sender<Control>,
    outbox: Arc<Mutex<Outbox>>,
    thread: std::thread::JoinHandle<()>,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

fn locked<T>(mutex: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>, String> { mutex.lock().map_err(|_| "voice_session_poisoned".to_string()) }

/// Model files under the shipped voice assets (atome/src/assets/voice).
fn load_engine(root: &Path) -> Result<VoiceEngine, String> {
    let path = |relative: &str| root.join(relative).to_string_lossy().into_owned();
    let (vosk_dir, silero) = (path("vosk/vosk-model-small-fr-0.22"), path("vad/silero_vad.onnx"));
    let (wake_mel, wake_embedding, wake_classifier) = (path("wake/melspectrogram.onnx"), path("wake/embedding_model.onnx"), path("wake/eve_ecoute_moi.json"));
    VoiceEngine::load(&VoiceModels { vosk_dir: &vosk_dir, silero: &silero, wake_mel: &wake_mel, wake_embedding: &wake_embedding, wake_classifier: &wake_classifier })
        .map_err(|error| error.to_string())
}

/// The audio gathered since the last pump, in [-1, 1].
fn gather(own_capture: bool, outbox: &Mutex<Outbox>) -> Result<Vec<f32>, String> {
    if !own_capture { return Ok(std::mem::take(&mut locked(outbox)?.pushed)); }
    let (samples, overrun) = wake_capture::take_samples()?.ok_or("voice_capture_stopped")?;
    if overrun { locked(outbox)?.overrun = true; }
    Ok(samples.iter().map(|sample| *sample as f32 / 32768.0).collect())
}

fn apply(engine: &mut VoiceEngine, control: Control) {
    match control {
        Control::Phrases(phrases, reply) => { let _ = reply.send(engine.set_phrases(&phrases).map_err(|error| error.to_string())); }
        Control::Speaking(speaking) => engine.set_speaking(speaking),
        Control::Listening(listening) => engine.set_listening(listening),
        Control::Verifier(json, reply) => { let _ = reply.send(engine.set_wake_verifier(json.as_deref()).map_err(|error| error.to_string())); }
        Control::Stop => {}
    }
}

fn run(mut engine: VoiceEngine, own_capture: bool, outbox: Arc<Mutex<Outbox>>, control: std::sync::mpsc::Receiver<Control>) -> Result<(), String> {
    loop {
        match control.recv_timeout(PUMP) {
            Ok(Control::Stop) | Err(RecvTimeoutError::Disconnected) => return Ok(()),
            Ok(other) => { apply(&mut engine, other); continue; }
            Err(RecvTimeoutError::Timeout) => {}
        }
        let samples = gather(own_capture, &outbox)?;
        let events = engine.push(&samples).map_err(|error| error.to_string())?;
        let mut out = locked(&outbox)?;
        out.input_db = Some(engine.input_db()).filter(|db| db.is_finite());
        out.events.extend(events.iter().filter_map(|event| serde_json::to_value(event).ok()));
    }
}

/// Starts the session; `own_capture` opens the engine's microphone capture.
pub fn start(models_root: &Path, own_capture: bool) -> Result<Value, String> {
    let mut owner = locked(&SESSION)?;
    if owner.is_some() { return Err("voice_session_busy".into()); }
    let outbox = Arc::new(Mutex::new(Outbox::default()));
    let (control, receiver) = channel();
    let (ready, loaded) = channel();
    let (root, shared) = (models_root.to_path_buf(), outbox.clone());
    let thread = crate::engine_thread::spawn(move || {
        let engine = match load_engine(&root) { Ok(engine) => engine, Err(error) => { let _ = ready.send(Err(error)); return; } };
        if own_capture {
            if let Err(error) = wake_capture::start(16000) { let _ = ready.send(Err(error)); return; }
        }
        let _ = ready.send(Ok(()));
        let result = run(engine, own_capture, shared.clone(), receiver);
        if own_capture { let _ = wake_capture::stop(); }
        if let (Err(code), Ok(mut out)) = (result, shared.lock()) { out.events.push(json!({ "type": "error", "code": code })); }
    });
    match loaded.recv().map_err(|_| "voice_session_failed".to_string())? {
        Ok(()) => { *owner = Some(Session { control, outbox, thread }); Ok(json!({ "active": true })) }
        Err(error) => { let _ = thread.join(); Err(error) }
    }
}

pub fn stop() -> Result<Value, String> {
    if let Some(session) = locked(&SESSION)?.take() {
        let _ = session.control.send(Control::Stop);
        session.thread.join().map_err(|_| "voice_session_failed".to_string())?;
    }
    Ok(json!({ "active": false }))
}

fn send(control: Control) -> Result<(), String> {
    let owner = locked(&SESSION)?;
    let session = owner.as_ref().ok_or("voice_session_inactive")?;
    session.control.send(control).map_err(|_| "voice_session_stopped".to_string())
}

fn ask(build: impl FnOnce(Reply) -> Control) -> Result<Value, String> {
    let (reply, answer) = channel();
    send(build(reply))?;
    answer.recv().map_err(|_| "voice_session_stopped".to_string())??;
    Ok(json!({ "ok": true }))
}

pub fn set_phrases(phrases: Vec<String>) -> Result<Value, String> { ask(|reply| Control::Phrases(phrases, reply)) }
pub fn set_wake_verifier(verifier: Option<String>) -> Result<Value, String> { ask(|reply| Control::Verifier(verifier, reply)) }
pub fn set_speaking(speaking: bool) -> Result<Value, String> { send(Control::Speaking(speaking)).map(|()| json!({ "ok": true })) }

pub fn set_listening(listening: &str) -> Result<Value, String> {
    let mode = match listening { "conversation" => Listening::Conversation, "wake" => Listening::Wake, other => return Err(format!("voice_listening_invalid:{other}")) };
    send(Control::Listening(mode)).map(|()| json!({ "ok": true }))
}

/// PCM from a host that owns the microphone (iOS), 16 kHz mono in [-1, 1].
pub fn push(samples: &[f32]) -> Result<(), String> {
    let owner = locked(&SESSION)?;
    let session = owner.as_ref().ok_or("voice_session_inactive")?;
    let mut out = locked(&session.outbox)?;
    if out.pushed.len() + samples.len() > MAX_PUSHED_SAMPLES { out.pushed.clear(); out.overrun = true; }
    out.pushed.extend_from_slice(samples);
    Ok(())
}

/// Events since the last read, the input level, and whether audio was lost.
pub fn read() -> Result<Value, String> {
    let owner = locked(&SESSION)?;
    let Some(session) = owner.as_ref() else { return Ok(json!({ "active": false, "events": [] })) };
    let active = !session.thread.is_finished();
    let mut out = locked(&session.outbox)?;
    let events = std::mem::take(&mut out.events);
    let overrun = std::mem::take(&mut out.overrun);
    Ok(json!({ "active": active, "events": events, "input_db": out.input_db, "overrun": overrun }))
}
