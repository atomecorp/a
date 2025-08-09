# AUv3 WebView → AU Audio Injection: fixes and best practices

## Context

- JS generates audio in a WebView (local mode = perfect).
- In AUv3 mode, JS audio is sent to Swift and mixed into the plugin’s output.
- Observed: artifacts/warble/clicks in AUv3 mode only.

## Symptoms

- Clean tone in local (WebAudio) playback.
- Distorted/unstable tone when routed through AUv3.
- Intermittent clicks and warbling at note start/end.

## Root causes

1) Host/JS sample-rate mismatch

   - WebAudio context often runs at 44.1k or device default; host was 48k.
   - Directly mixing different-rate buffers causes pitch/time errors and aliasing.

2) Per-channel consumption bug

   - The JS playback index was advanced inside a per-channel loop.
   - Result: left/right consumed different segments → combing/phase artifacts.

3) Hard edges / clipping

   - Injected buffers with zero → signal discontinuities produce clicks.
   - Additive mix at 0.5 gain risked clipping with host signal.

## Solution implemented (Swift-only)

Changes in `src-Auv3/auv3/utils.swift`:

1) Offline resampling to host sample rate

   - In `injectJavaScriptAudio(_:sampleRate:duration:)`:
     - Detect host sample rate via `getRuntimeSampleRate()`.
     - If different, resample the injected JS buffer to host rate (linear interpolation).
     - Store the processed buffer and target rate.

2) Tiny fade-in/out on the injected buffer

   - Apply ~128-sample fade at head/tail (or 5% of buffer) to remove clicks.

3) Correct per-render consumption and safer mix gain

   - In `mixJavaScriptAudio(…, frameCount:)`:
     - Compute `framesToProcess` once per render.
     - Mix the same JS segment into all channels (stereo) without advancing the index per channel.
     - Advance `jsAudioPlaybackIndex` once per render.
     - Use conservative mix gain (0.4) to reduce clipping risk.

4) Thread safety preserved

   - Continued using `jsAudioLock` around buffer access and state updates.

## Why it works

- Resampling guarantees the host receives time/pitch-correct data.
- Single-advance indexing ensures channels remain phase-aligned.
- Fades eliminate discontinuity clicks; lower gain reduces clipping.

## Files and key functions

- `src-Auv3/auv3/utils.swift`
  - `injectJavaScriptAudio(_ audioData: [Float], sampleRate: Double, duration: Double)`
    - Resample + fade + store.
  - `mixJavaScriptAudio(bufferList: AudioBufferListWrapper, frameCount: AUAudioFrameCount)`
    - Channel-safe mixing and single index advance.

## Test procedure

1) Build & run AUv3 host.
2) Open the `audio_swift.js` UI buttons.
3) Toggle AUv3 mode, play C4/A4/E5.
4) Expect clean, stable tones similar to local mode.
5) Xcode logs should show:
   - "Resampled JS audio to host rate …"
   - "JS audio injection ready …"
   - "JS audio playback completed" at end.

## Performance notes

- Linear resampling is O(n) and fast for short test buffers.
- Mixing is in the render thread but minimal; locks are short-held.
- If you stream longer audio, consider a pre-allocated ring buffer.

## Recommended next improvements (optional)

- Lock-free ring buffer queue: enqueue JS chunks; render pulls exact `frameCount` each callback.
- Generate JS buffers in multiples of the host render quantum (e.g., 256/512/1024 frames).
- Higher-quality resampler (sinc/Windowed FIR) if you need hi-fi for long files.
- Soft limiter after mix to avoid occasional clipping.

## Troubleshooting

- No sound: ensure `audioBuffer` message reaches Swift and inject logs appear.
- Warble persists: confirm host sample rate log and that resample path is taken.
- Clicks at edges: verify fade applied; increase fadeSamples to 256 if needed.
- Too hot: lower mix gain (e.g., 0.25) or add limiter.

## JS ↔ Swift contract (reference)

- JS sends: `{ type: 'audioBuffer', data: { frequency, sampleRate, duration, audioData: [Float], channels: 1 } }` via `swiftBridge`.
- Swift receives in `WebViewManager.handleAudioBuffer()` and calls `AudioController.injectJavaScriptAudio(...)`.

This approach keeps JS simple, fixes artifacts on the Swift side, and is safe for real-time AUv3 rendering.
