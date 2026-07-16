# Whisper Integration in Squirrel (Tauri + Axum + Browser)

This document describes how to install and use Whisper inside the Squirrel stack, with a focus on:

* Local speech‑to‑text in **Tauri desktop apps**
* Optional **Axum server side** transcription
* A simple **JS bridge** so Squirrel/Atome can use voice as an input for AI APIs (OpenAI, Mistral, etc.)

---

## 1. High‑level architecture

### 1.1. Components

* **Frontend (Squirrel UI)**

  * Records audio through the canonical runtime media-capture adapter
  * Sends the transcription command and state through the typed WebSocket API
  * Transfers encoded audio bytes only through the explicitly documented media-byte
    boundary when a separate binary transfer is required; this is not an HTTP business
    operation or fallback
  * Targets:

    * Tauri command (desktop), or
    * Fastify / Axum WebSocket action (browser/server mode)

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

## 4. Canonical transcription boundary

Whisper is an internal runtime service. The frontend must not call a Tauri command,
Fastify REST route, or Axum HTTP route directly for transcription.

The maintained application contract is one typed `/ws/api` action, for example
`voice.transcribe`, with the same request and response semantics on Tauri, Fastify, and
supported mobile runtimes. The runtime WebSocket owner performs capability checks,
authorization, request correlation, cancellation, and error normalization before
delegating to the local Whisper engine.

When encoded audio is too large for the typed command envelope, the bytes may cross the
explicit protected media-transfer boundary. The resulting opaque media reference is then
submitted through `/ws/api`. That byte-transfer exception must not become an HTTP
transcription operation or an alternate command path.

## 5. Frontend integration

The Squirrel voice API records through the canonical runtime media-capture adapter and
submits the transcription intention through the shared WebSocket adapter. Browser
`MediaRecorder`, WebAudio conversion, native recording, and platform permission handling
are runtime implementation details behind that adapter; they are not competing product
APIs.

The frontend receives a typed result containing transcription text, language and
diagnostics, or an explicit typed failure. It must not probe another transport when the
canonical action fails.

## 6. Runtime integration

Tauri/Axum and Fastify register the same `voice.transcribe` WebSocket action and delegate
to their supported Whisper engine. Runtime-specific Rust or C/C++ helpers may own model
loading and PCM conversion internally, but no direct `invoke`, REST endpoint or HTTP
fallback is part of the application contract.

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
3. Dispatch to the right Atome/Squirrel tool.
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
* Select the explicitly configured transcription provider behind the same WebSocket action
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
