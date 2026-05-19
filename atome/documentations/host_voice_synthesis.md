# OS Native Text-to-Speech (TTS) Integration Guide

This document explains how to speak text using the **built‑in text‑to‑speech engine of the operating system**, on:

* Web browser (desktop & mobile)
* iOS / iPadOS
* Android
* macOS
* Windows
* Linux

It also proposes a **unified abstraction** that can be used by Squirrel / eVe so that your code calls a single function (e.g. `voice.speak()`), and each platform routes to its native TTS.

---

## 1. Unified abstraction (high‑level design)

Define a generic API inside Squirrel:

```ts
// Pseudo-code / TypeScript style

export type TTSOptions = {
  lang?: string;       // e.g. "fr-FR", "en-US"
  rate?: number;       // 0.5 = slower, 1.0 = normal, 2.0 = fast
  pitch?: number;      // 0.5 = lower, 1.0 = normal, 2.0 = higher
  volume?: number;     // 0.0 - 1.0
  voiceId?: string;    // OS‑specific voice name/id
};

export interface TTSBackend {
  speak(text: string, options?: TTSOptions): Promise<void>;
  stop?(): Promise<void>;
  listVoices?(): Promise<any[]>;
}

// High-level Squirrel object
export const voice = {
  backend: null as TTSBackend | null,

  setBackend(backend: TTSBackend) {
    this.backend = backend;
  },

  async speak(text: string, options?: TTSOptions) {
    if (!this.backend) throw new Error("No TTS backend configured");
    return this.backend.speak(text, options);
  },
};
```

Then, for each OS or runtime, you provide a **different backend implementation** that wraps the native TTS APIs.

---

## 2. Browser (Web) — Web Speech API

Most modern browsers provide `speechSynthesis` (Web Speech API).

### 2.1. Implementation

```js
// browser_tts_backend.js

const BrowserTTSBackend = {
  speak(text, options = {}) {
    return new Promise((resolve, reject) => {
      if (!("speechSynthesis" in window)) {
        return reject(new Error("speechSynthesis not supported"));
      }

      const utterance = new SpeechSynthesisUtterance(text);

      if (options.lang) utterance.lang = options.lang;
      if (typeof options.rate === "number") utterance.rate = options.rate;
      if (typeof options.pitch === "number") utterance.pitch = options.pitch;
      if (typeof options.volume === "number") utterance.volume = options.volume;

      if (options.voiceId) {
        const voices = window.speechSynthesis.getVoices();
        const match = voices.find(v => v.name === options.voiceId || v.voiceURI === options.voiceId);
        if (match) utterance.voice = match;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(e.error || e);

      window.speechSynthesis.speak(utterance);
    });
  },
};

// Somewhere in your bootstrap code
// voice.setBackend(BrowserTTSBackend);
```

### 2.2. Notes

* Works in Chromium, Firefox, Safari (with differences).
* Quality and voices depend on the OS and browser.
* Good for web & Tauri (WebView) when you do not want a native plugin yet.

---

## 3. iOS / iPadOS / macOS — AVSpeechSynthesizer

Apple platforms provide **AVSpeechSynthesizer** via the AVFoundation framework.

In a Tauri context you usually:

* Implement a small **Swift (or Objective‑C) plugin**.
* Expose a function (e.g. `speak(text, lang, rate, pitch)`) to JS via Tauri commands or a plugin system.

### 3.1. Basic Swift implementation

```swift
import Foundation
import AVFoundation

@objc(TTSPlugin)
class TTSPlugin: NSObject {
    private let synthesizer = AVSpeechSynthesizer()

    @objc func speak(_ text: String, lang: String?, rate: NSNumber?, pitch: NSNumber?, volume: NSNumber?) {
        let utterance = AVSpeechUtterance(string: text)

        if let lang = lang {
            utterance.voice = AVSpeechSynthesisVoice(language: lang)
        }

        if let rate = rate {
            // AVSpeechUtteranceDefaultSpeechRate ~ 0.5, max/min are platform‑specific
            utterance.rate = rate.floatValue
        }

        if let pitch = pitch {
            utterance.pitchMultiplier = pitch.floatValue
        }

        if let volume = volume {
            utterance.volume = volume.floatValue
        }

        synthesizer.speak(utterance)
    }

    @objc func stop() {
        synthesizer.stopSpeaking(at: .immediate)
    }
}
```

### 3.2. JS bridge example (Tauri)

```js
// ios_macos_tts_backend.js

const AppleTTSBackend = {
  async speak(text, options = {}) {
    // This assumes you have a Tauri command or plugin that calls TTSPlugin.speak
    return window.__TAURI__.invoke("tts_speak", {
      text,
      lang: options.lang || "fr-FR",
      rate: options.rate ?? 0.5,
      pitch: options.pitch ?? 1.0,
      volume: options.volume ?? 1.0,
    });
  },

  async stop() {
    return window.__TAURI__.invoke("tts_stop");
  },
};

// voice.setBackend(AppleTTSBackend);
```

### 3.3. Notes

* Voices and languages depend on what is installed on the device.
* Works offline.

---

## 4. Android — TextToSpeech API

Android exposes `android.speech.tts.TextToSpeech`.

You typically implement a **Kotlin/Java bridge** in your Android part of Tauri or native wrapper, then expose it to JS.

### 4.1. Basic Kotlin implementation

```kotlin
import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

class TTSManager(context: Context) : TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null

    init {
        tts = TextToSpeech(context, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.getDefault()
        }
    }

    fun speak(text: String, lang: String?, rate: Float?, pitch: Float?) {
        if (lang != null) {
            val locale = Locale.forLanguageTag(lang)
            tts?.language = locale
        }
        if (rate != null) {
            tts?.setSpeechRate(rate)
        }
        if (pitch != null) {
            tts?.setPitch(pitch)
        }
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "squirrel-tts")
    }

    fun stop() {
        tts?.stop()
    }

    fun shutdown() {
        tts?.shutdown()
    }
}
```

### 4.2. JS bridge

Depending on your integration (Tauri mobile, custom wrapper, etc.), expose a method such as `ttsSpeak(text, options)` to JavaScript and forward to `TTSManager.speak()`.

```js
const AndroidTTSBackend = {
  async speak(text, options = {}) {
    return window.__BRIDGE__.invoke("tts_speak", {
      text,
      lang: options.lang || "fr-FR",
      rate: options.rate ?? 1.0,
      pitch: options.pitch ?? 1.0,
    });
  },
};

// voice.setBackend(AndroidTTSBackend);
```

### 4.3. Notes

* Offline depends on the installed TTS engine (Google TTS, Samsung TTS, etc.).
* Users can install additional voices from system settings.

---

## 5. Windows — SAPI / UWP SpeechSynthesizer

On Windows you can use:

* **SAPI** (classic, C++/C#/COM)
* **UWP `SpeechSynthesizer`** (C#) in modern apps

In a Tauri context, the easiest is usually to create a small **C# helper app or plugin** that exposes a command.

### 5.1. C# example (UWP / .NET)

```csharp
using System;
using System.Threading.Tasks;
using Windows.Media.SpeechSynthesis;
using Windows.Storage.Streams;

public class TTSService
{
    private readonly SpeechSynthesizer _synth = new SpeechSynthesizer();

    public async Task SpeakAsync(string text, string lang = "fr-FR")
    {
        var voices = SpeechSynthesizer.AllVoices;
        foreach (var voice in voices)
        {
            if (voice.Language == lang)
            {
                _synth.Voice = voice;
                break;
            }
        }

        SpeechSynthesisStream stream = await _synth.SynthesizeTextToStreamAsync(text);
        // Here you can directly play the stream via MediaElement / MediaPlayer in a native host.
    }
}
```

You can then expose a simple CLI or RPC so that Tauri’s Rust backend can call:

```bash
win-tts.exe --lang fr-FR "Bonjour, je suis la voix du système."
```

From Tauri (Rust):

```rust
use std::process::Command;

#[tauri::command]
async fn tts_speak(text: String, lang: Option<String>) -> Result<(), String> {
    let lang = lang.unwrap_or_else(|| "fr-FR".to_string());
    Command::new("win-tts.exe")
        .arg("--lang").arg(lang)
        .arg(text)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

JS side can then call this command in the same way as macOS/iOS.

---

## 6. Linux — eSpeak / speech-dispatcher

Linux does not have a single universal TTS engine, but common options are:

* `espeak` or `espeak-ng`
* `spd-say` (speech-dispatcher)

You can simply **call a CLI tool** from Rust (Tauri / server), which in turn uses the system’s TTS.

### 6.1. eSpeak example

```bash
espeak -v fr "Bonjour, je suis la voix Linux."
```

Rust command wrapper:

```rust
use std::process::Command;

#[tauri::command]
async fn tts_speak(text: String, lang: Option<String>) -> Result<(), String> {
    let lang = lang.unwrap_or_else(|| "fr".to_string());

    Command::new("espeak")
        .arg("-v").arg(lang)
        .arg(text)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
```

JS side can reuse the same `voice.speak()` wrapper.

### 6.2. speech-dispatcher (spd-say)

```bash
spd-say -l fr "Bonjour, je suis la voix Linux via speech-dispatcher."
```

Same pattern: Tauri Rust command shells out to `spd-say`.

---

## 7. Putting it together in Squirrel / eVe

You can detect or configure the platform at runtime and select the correct backend.

### 7.1. Backend selection

```js
import { voice } from "./voice_core";
import { BrowserTTSBackend } from "./browser_tts_backend";
import { AppleTTSBackend } from "./ios_macos_tts_backend";
import { AndroidTTSBackend } from "./android_tts_backend";
import { NativeCliTTSBackend } from "./native_cli_tts_backend"; // Windows / Linux

export function setupTTS(env) {
  if (env.runtime === "browser") {
    voice.setBackend(BrowserTTSBackend);
  } else if (env.platform === "ios" || env.platform === "macos") {
    voice.setBackend(AppleTTSBackend);
  } else if (env.platform === "android") {
    voice.setBackend(AndroidTTSBackend);
  } else if (env.platform === "windows" || env.platform === "linux") {
    voice.setBackend(NativeCliTTSBackend);
  }
}
```

Then, anywhere in Squirrel/Atome:

```js
await voice.speak("Hello from the OS voice", {
  lang: "en-US",
  rate: 1.0,
  pitch: 1.0,
});
```

The correct native TTS engine will be called depending on platform.

---

## 8. Design considerations

1. **Latency**

   * OS TTS is usually fast and good enough for interactive usage.

2. **Consistency**

   * Voices and quality may differ across OSes.
   * To create a unified brand/identity, you will later replace the backend with Piper/Coqui, but keep the same `voice.speak()` API.

3. **Offline**

   * Most OS engines work offline once voices are installed.
   * On mobile, the user may need to download the language pack.

4. **Permissions**

   * No special microphone permission is needed for TTS (only for STT).

5. **Future swap**

   * Because the abstraction is unified, you can later swap the backend to:

     * Piper (local) or
     * Coqui (server)
   * without touching the higher‑level code.

---

## 9. Minimal checklist

* [ ] Implement `voice.speak(text, options)` abstraction in JS.
* [ ] Create platform‑specific backends (browser, Apple, Android, Windows, Linux).
* [ ] Implement Tauri / native commands or plugins for each OS.
* [ ] Add configuration (env / runtime detection) to pick the backend.
* [ ] Test on:

  * [ ] iOS
  * [ ] Android
  * [ ] macOS
  * [ ] Windows
  * [ ] Linux
* [ ] Log all `voice.speak` calls for debugging (optional).
