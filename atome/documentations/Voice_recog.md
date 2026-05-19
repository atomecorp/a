# Whisper Integration in Squirrel (Tauri + Axum + Browser)

This document describes how to install and use Whisper inside the Squirrel stack, with a focus on:

* Local speech‑to‑text in **Tauri desktop apps**
* Optional **Axum server side** transcription
* A simple **JS bridge** so Squirrel/Atome can use voice as an input for AI APIs (OpenAI, Mistral, etc.)

---

## 1. High‑level architecture

### 1.1. Components

* **Frontend (Squirrel UI)**

  * Records audio from the microphone (WebAudio / MediaRecorder)
  * Sends raw/encoded audio chunks to:

    * Tauri command (desktop), or
    * Fastify / Axum HTTP endpoint (browser/server mode)

* **Whisper engine (local)**

  * Implemented with `whisper-rs` (Rust) or `whisper.cpp` bindings
  * Runs inside:

    * Tauri Rust backend (desktop), and/or
    * Axum service (server mode)

* **AI router**

  * Consumes transcribed text
  * Sends prompts to OpenAI, Mistral or any other LLM provider
  * Returns actions / responses to Squirrel/Atome.

---

## 2. Choosing the Whisper backend

### 2.1. Recommended: `whisper-rs` in Rust (for Tauri + Axum)

* Pure Rust bindings around the Whisper C core
* Works well inside Tauri commands and standalone Axum services
* Easy to package with `tauri.conf.json` and typical Rust toolchain

### 2.2. Alternative: `whisper.cpp`

* C/C++ implementation, extremely optimized
* Good if you need fine‑grained control or GPU/Metal/CUDA
* Requires Rust FFI or a dedicated small C wrapper

**For Squirrel the simplest starting point is:**

* Tauri/Axum: `whisper-rs`

---

## 3. Installation (Rust backend)

### 3.1. Add dependencies to your Tauri/Axum `Cargo.toml`

In your **Tauri backend** crate and/or your **Axum server** crate:

```toml
[dependencies]
whisper-rs = "*"        # pick a specific version
hound = "*"             # optional, for WAV handling
serde = { version = "1", features = ["derive"] }
serde_json = "1"
axum = "*"              # if not already in use
```

Adjust versions to match your existing stack.

### 3.2. Download Whisper models

Decide which model size to ship (trade‑off: quality vs. speed):

* `tiny.en` / `tiny` – fastest, lower accuracy
* `base` / `base.en`
* `small` / `small.en` – good balance for desktop
* `medium` / `large` – best quality, slower

Place models in a folder accessible at runtime, for example:

```bash
mkdir -p ./models/whisper
# Example: download a model
curl -L -o ./models/whisper/ggml-small.en.bin "https://.../ggml-small.en.bin"
```

In `.env` (or config file used by Squirrel):

```env
WHISPER_MODEL_PATH=./models/whisper/ggml-small.en.bin
WHISPER_SAMPLE_RATE=16000
WHISPER_LANGUAGE=en
WHISPER_TASK=transcribe   # or "translate"
```

---

## 4. Implementing a Tauri command for transcription

Goal: expose a Tauri command like `whisper_transcribe` that accepts raw PCM or a WAV blob and returns text.

### 4.1. Basic Rust helper

```rust
use std::path::Path;
use whisper_rs::{WhisperContext, FullParams, SamplingStrategy};

pub struct WhisperEngine {
    ctx: WhisperContext,
}

impl WhisperEngine {
    pub fn new(model_path: &str) -> anyhow::Result<Self> {
        let ctx = WhisperContext::new(Path::new(model_path))?;
        Ok(Self { ctx })
    }

    pub fn transcribe_pcm(&self, pcm_f32: &[f32], language: &str) -> anyhow::Result<String> {
        let mut state = self.ctx.create_state()?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(language));
        params.set_n_threads(num_cpus::get() as i32);
        params.set_translate(false);

        state.full(params, pcm_f32)?;

        let num_segments = state.full_n_segments();
        let mut result = String::new();
        for i in 0..num_segments {
            if let Ok(segment) = state.full_get_segment_text(i) {
                result.push_str(&segment);
            }
        }
        Ok(result.trim().to_string())
    }
}
```

### 4.2. Tauri command wrapper

```rust
use tauri::State;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct TranscriptionRequest {
    // PCM 16‑bit mono, 16 kHz, base64 encoded from JS
    pub pcm16_base64: String,
}

pub struct WhisperState {
    pub engine: WhisperEngine,
}

#[tauri::command]
pub async fn whisper_transcribe(
    req: TranscriptionRequest,
    whisper: State<'_, WhisperState>,
) -> Result<String, String> {
    let bytes = base64::decode(&req.pcm16_base64)
        .map_err(|e| format!("base64 decode error: {e}"))?;

    // convert i16 PCM -> f32
    let mut pcm_f32 = Vec::with_capacity(bytes.len() / 2);
    for chunk in bytes.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
        pcm_f32.push(sample as f32 / 32768.0);
    }

    whisper
        .engine
        .transcribe_pcm(&pcm_f32, "en")
        .map_err(|e| format!("whisper error: {e}"))
}
```

### 4.3. Tauri `main.rs` setup

```rust
fn main() {
    let model_path = std::env::var("WHISPER_MODEL_PATH").expect("WHISPER_MODEL_PATH not set");
    let engine = WhisperEngine::new(&model_path).expect("Failed to load Whisper model");

    tauri::Builder::default()
        .manage(WhisperState { engine })
        .invoke_handler(tauri::generate_handler![whisper_transcribe])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 5. Frontend integration (Squirrel UI)

### 5.1. Recording audio in JS (browser or Tauri WebView)

Example: record mono audio, 16 kHz, send to Tauri.

```js
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  const chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    const pcm16 = await decodeToPCM16(arrayBuffer); // you implement this
    const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));

    const text = await window.__SQUIRREL_BRIDGE__.transcribeVoice(base64);
    console.log('Whisper text:', text);
  };

  mediaRecorder.start();
  return () => mediaRecorder.stop();
}
```

`decodeToPCM16` can be implemented using WebAudio (decode audio, resample to 16 kHz mono, export Int16Array).

### 5.2. Squirrel bridge to Tauri

Expose a Squirrel‑style API that hides Tauri internals:

```js
// squirrel/voice/whisper_client.js

export async function transcribeVoice(base64Pcm16) {
  // In Tauri
  if (window.__TAURI__) {
    return await window.__TAURI__.invoke('whisper_transcribe', {
      req: { pcm16Base64: base64Pcm16 },
    });
  }

  // In browser mode (Fastify HTTP route)
  const res = await fetch('/api/voice/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pcm16_base64: base64Pcm16 }),
  });

  if (!res.ok) throw new Error('Transcription failed');
  const data = await res.json();
  return data.text;
}

// Higher‑level helper
export async function voiceToAI(provider, options = {}) {
  const stop = await startRecording();
  // stop() will be called by UI when the user releases a button, etc.
}
```

(You can adapt this to Squirrel DSL conventions.)

---

## 6. Axum server route (optional, shared Whisper on server)

If you want a central server doing STT for browser clients:

```rust
use axum::{routing::post, Router, Json};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct ServerTranscriptionRequest {
    pcm16_base64: String,
}

#[derive(Serialize)]
struct ServerTranscriptionResponse {
    text: String,
}

async fn transcribe_handler(
    Json(req): Json<ServerTranscriptionRequest>,
    State(whisper): State<WhisperState>,
) -> Result<Json<ServerTranscriptionResponse>, StatusCode> {
    // same PCM16 -> f32 conversion as Tauri command
    // ...
    let text = whisper
        .engine
        .transcribe_pcm(&pcm_f32, "en")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ServerTranscriptionResponse { text }))
}

fn app(whisper: WhisperState) -> Router {
    Router::new()
        .route("/api/voice/transcribe", post(transcribe_handler))
        .with_state(whisper)
}
```

---

## 7. Connecting Whisper output to AI providers

Once you have **transcribed text**, you can forward it to the existing AI router of Squirrel.

### 7.1. Example JSON contract

```jsonc
{
  "mode": "voice",
  "provider": "openai",      // or "mistral", "local"
  "text": "Schedule a meeting tomorrow at 3pm",
  "meta": {
    "language": "en",
    "app": "calendar",
    "user_id": "..."
  }
}
```

### 7.2. AI router behavior

1. Receive transcription event (from Tauri or Axum/Fastify).
2. Apply NLP / intent detection (LLM or custom rules).
3. Dispatch to the right Atome/Squirrel tool (calendar, email, etc.).
4. Optionally, ask for confirmation before executing destructive actions.

---

## 8. Configuration and environment variables

Add to `.env` or Squirrel config:

```env
WHISPER_ENABLED=1
WHISPER_MODEL_PATH=./models/whisper/ggml-small.en.bin
WHISPER_SAMPLE_RATE=16000
WHISPER_LANGUAGE=en
WHISPER_TASK=transcribe

# Voice → AI routing
VOICE_AI_DEFAULT_PROVIDER=openai
VOICE_AI_ALLOW_UNSAFE_ACTIONS=0
```

Your server/app code should read these variables to:

* Enable or disable local Whisper
* Switch between local Whisper and a remote API if needed
* Control which AI provider to use by default

---

## 9. Testing checklist

1. **Model loading**

   * Start Tauri: check logs for successful Whisper model load
   * Start Axum: same

2. **Microphone**

   * Confirm `getUserMedia` works (browser and Tauri)
   * Confirm audio blob size and duration are correct

3. **PCM conversion**

   * Ensure resampling to 16 kHz mono is correct
   * Verify no clipping or silence due to wrong byte order

4. **Transcription**

   * Test short phrases in quiet environment
   * Then test noisy conditions and longer sentences

5. **AI routing**

   * Send transcription to OpenAI/Mistral
   * Verify correct intent parsing and Atome actions

6. **Performance**

   * Measure latency from end of speech to final text
   * Try different models (`tiny`, `base`, `small`) and compare

---

## 10. Next steps

* Add **streaming transcription** (partial results) instead of single shot
* Add **hotword / wake word** detection ("Hey eVe") with a lightweight local model
* Log all voice → text → action chains in Squirrel for debugging and replay
* Expose a unified Squirrel API, e.g. `atome.voice.ask()` and `atome.voice.command()` that internally use this Whisper pipeline.
