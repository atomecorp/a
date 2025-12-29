# Atome / Squirrel Voice Abstraction Spec (Capture + STT)

Goal: provide a **modular voice tool layer** that works across **Browser, Tauri Desktop, iOS, Android, Windows, Linux**, primarily using **host/system speech** (STT) when available, while also supporting an audio **recorder** for reusable audio workflows.

This spec defines:

1. A unified **audio capture (recorder)** tool (for saving/streaming audio)
2. A unified **speech-to-text (STT)** tool (host/system first)
3. A unified **high-level “listen”** tool (STT streaming / partial results)
4. Events, state machine, permissions, and cancellation

---

## 1) Design principles

* **One public API** for Squirrel/Atome, many platform backends.
* **Do not force a file path** as the primary audio format.

  * Use `bytes/blob/stream` as first-class; `path` is optional.
* **Support streaming** results (partial) to reduce perceived latency.
* **Always support cancel/stop**.
* **Recorder is reusable** for non-STT audio workflows (clips, logs, audio notes, etc.).
* Host/system STT may **not expose raw audio** (e.g., browser Web Speech API). The API must allow STT without recorder.

---

## 2) Public API surface

### 2.1 Names

Avoid names like `record_audio(path)`.

Recommended names:

* `voice.capture.*` for recording audio (recorder)
* `voice.stt.*` for speech recognition
* `voice.listen.*` for high-level dictation mode (streaming STT)

---

## 3) Types

### 3.1 AudioInput

```ts
export type AudioInput =
  | { kind: "bytes"; data: Uint8Array; mime?: string }
  | { kind: "blob"; blob: Blob; mime?: string }
  | { kind: "path"; path: string; mime?: string }
  | { kind: "stream"; id: string };
```

### 3.2 Capture options and result

```ts
export type CaptureOptions = {
  format?: "wav" | "webm" | "caf" | "pcm16"; // platform-dependent
  sampleRate?: 16000 | 24000 | 44100 | 48000;
  channels?: 1 | 2;
  persist?: "none" | "temp" | "path"; // whether to keep a file
  path?: string;                           // only if persist == "path"
  maxDurationMs?: number;
};

export type CaptureResult = {
  input: AudioInput;     // bytes/blob/path depending on platform
  durationMs: number;
  sampleRate?: number;
  channels?: number;
  path?: string;         // if persist produced a file
};
```

### 3.3 STT options and result

```ts
export type STTOptions = {
  lang?: string;         // e.g. "fr-FR"
  partial?: boolean;     // if backend supports interim results
  timestamps?: boolean;  // if backend supports segments
};

export type STTSegment = {
  text: string;
  startMs?: number;
  endMs?: number;
};

export type STTResult = {
  text: string;
  confidence?: number;
  segments?: STTSegment[];
  provider?: string;     // "host-ios", "host-android", "browser", etc.
};
```

---

## 4) Recorder tool (modular)

### 4.1 Why keep the recorder as a separate tool?

Because you want modular tools and reuse:

* Audio notes / voice memos
* Attachments to messages
* Debug audio capture issues
* Later: upload to Whisper/other STT if needed
* Later: apply audio processing (gain, denoise, etc.)

### 4.2 API

```ts
export interface Recorder {
  start(options?: CaptureOptions): Promise<void>;
  stop(): Promise<CaptureResult>;
  cancel(): Promise<void>;
  isRecording(): boolean;
}

export const voice = {
  capture: {
    start: (options?: CaptureOptions) => Promise<void>,
    stop: () => Promise<CaptureResult>,
    cancel: () => Promise<void>,
    isRecording: () => boolean,
  },
  // stt and listen below
};
```

### 4.3 Platform notes

* Browser: `MediaRecorder` (webm/opus) + optional WebAudio resample to PCM.
* iOS/macOS: `AVAudioEngine` / `AVAudioRecorder`.
* Android: `AudioRecord` / MediaRecorder.
* Windows/Linux: native capture via OS APIs or a Rust audio crate.

---

## 5) STT tool (host/system first)

### 5.1 Two STT modes

1. **Dictation / live STT**: best UX, low perceived latency (partial events)
2. **Transcribe**: feed recorded audio (bytes/blob/path) and return final text

### 5.2 API

```ts
export interface STT {
  // Live mode
  start(options?: STTOptions): Promise<{ sessionId: string }>;
  stop(sessionId: string): Promise<STTResult>;      // final
  cancel(sessionId: string): Promise<void>;

  // Offline/async transcription (if backend supports it)
  transcribe(input: AudioInput, options?: STTOptions): Promise<STTResult>;
}

export const voice = {
  // capture...
  stt: {
    start: (options?: STTOptions) => Promise<{ sessionId: string }>,
    stop: (sessionId: string) => Promise<STTResult>,
    cancel: (sessionId: string) => Promise<void>,
    transcribe: (input: AudioInput, options?: STTOptions) => Promise<STTResult>,
  },
};
```

### 5.3 Events

During live STT, emit events on the Atome/Squirrel bus:

* `voice.stt.state` → `{ sessionId, state: "idle"|"listening"|"processing" }`
* `voice.stt.partial` → `{ sessionId, text, confidence? }`
* `voice.stt.final` → `{ sessionId, text, segments?, confidence? }`
* `voice.stt.error` → `{ sessionId, code, message }`

---

## 6) High-level convenience tool: `listen()`

`listen()` is the **one call** feature for product usage:

* Starts STT live
* Streams partial text
* Resolves with final text

```ts
export type ListenOptions = STTOptions & {
  timeoutMs?: number;
};

export async function listen(options?: ListenOptions): Promise<STTResult> {
  const { sessionId } = await voice.stt.start(options);

  // The UI can show partial results via events.
  // Implementation should also enforce timeout if requested.

  return new Promise((resolve, reject) => {
    // Listen to bus events voice.stt.final / voice.stt.error for this sessionId.
    // On final: resolve.
    // On error: reject.
  });
}

// Public:
voice.listen = listen;
```

---

## 7) Permissions API

Host/system STT often requires explicit permissions.

```ts
export type VoicePermissions = {
  mic: "unknown" | "granted" | "denied";
  speech: "unknown" | "granted" | "denied";
};

voice.permissions = {
  status: (): Promise<VoicePermissions>,
  request: (): Promise<VoicePermissions>,
};
```

Platform mapping:

* iOS/macOS: request `AVAudioSession` mic + `SFSpeechRecognizer` speech.
* Android: `RECORD_AUDIO` + availability of speech services.
* Browser: mic permission; Web Speech availability is separate.

---

## 8) Backend strategy (per platform)

### 8.1 Browser backend

* STT: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
* Recorder: `MediaRecorder`

Important limitation:

* Web Speech API usually returns text only; it does not provide raw audio.
* Therefore `voice.listen()` works even if `voice.capture` is unused.

### 8.2 iOS/macOS backend

* STT: Apple Speech framework (`SFSpeechRecognizer` + `AVAudioEngine`)
* Recorder: `AVAudioRecorder` / `AVAudioEngine`

Implementation approach:

* Provide a native plugin that emits events to JS.

### 8.3 Android backend

* STT: `SpeechRecognizer`
* Recorder: `AudioRecord` or `MediaRecorder`

Implementation approach:

* Provide a native plugin that emits partial/final events.

### 8.4 Windows backend

* STT: Windows Speech APIs (native helper)
* Recorder: native capture or Rust audio crate

### 8.5 Linux backend

* Host STT is not uniform.
* Options:

  * Declare host STT unsupported on Linux (listen not available)
  * Or provide fallback engine (Vosk/Whisper) only on Linux

---

## 9) Tool modularity: Recorder + STT composition

Your original idea (record → path → to_text(path)) is valid as a **composition**:

```ts
await voice.capture.start({ persist: "temp", format: "wav" });
const audio = await voice.capture.stop();
const stt = await voice.stt.transcribe(audio.input, { lang: "fr-FR" });
```

But it should not be the only path.

Why?

* Host STT can bypass recorder and give results faster.
* Some backends cannot provide a path.
* Streaming partial results improves UX drastically.

So we keep:

* `voice.capture.*` (recorder) as a reusable modular tool
* `voice.stt.*` (STT) for host/system recognition
* `voice.listen()` as the best user-facing function

---

## 10) Recommended defaults

* Prefer **push-to-talk** UX at first.
* Use `voice.listen({ partial: true, lang: "fr-FR" })`.
* Record separately only when you need to store audio.

---

## 11) .env / config

```env
SQUIRREL_STT_BACKEND=host        # host | fallback
SQUIRREL_STT_LANG=fr-FR
SQUIRREL_STT_PARTIAL=1

SQUIRREL_RECORDER_FORMAT=wav
SQUIRREL_RECORDER_PERSIST=temp

# Optional Linux fallback
SQUIRREL_LINUX_STT_FALLBACK=vosk  # or whisper
```

---

## 12) Checklist

* [ ] Implement JS API (`voice.capture`, `voice.stt`, `voice.listen`, `voice.permissions`).
* [ ] Implement browser backend (Web Speech + MediaRecorder).
* [ ] Implement iOS/macOS plugin backend (Speech + AVAudio).
* [ ] Implement Android plugin backend (SpeechRecognizer + recorder).
* [ ] Add event emission and sessionId routing.
* [ ] Add stop/cancel/timeout.
* [ ] Add structured logs for debugging.
* [ ] Decide Linux/Windows host STT support vs fallback.

---

## 13) Notes on correctness and UX

* Always include `sessionId` in events.
* Always provide a `cancel()`.
* Treat partial results as UI-only; commit only final results.
* Provide a timeout to prevent stuck sessions.
* Centralize errors into `voice.stt.error` with native error codes.
