# Tauri Native — Video Playback Stutter Fix

## Symptom

On Tauri macOS, video clips inside an MTrack played with a visible stutter: the video would freeze for ~100-200ms every 15-30 frames, then resume normally. The stutter was perfectly periodic.

The same project opened in the browser via Axum on port 3000 was completely smooth — not a single dropped frame.

---

## Root Cause Analysis

### Why the browser is smooth

In the browser, `shouldDrivePlaybackFramesWithAudioEngine()` returns `false`. The playhead is driven by a **visual clock** (`performance.now()` extrapolation). No audio engine synchronization is attempted. AVFoundation is never interrupted.

### Why Tauri stuttered (two independent causes)

#### Cause 1 — Hard seeks flushing the AVFoundation decoder

On Tauri, `shouldDrivePlaybackFramesWithAudioEngine()` returns `true` because `isTauriNativeKira()` is `true`.

The canonical playhead is read from `resolveHmtracksCanonicalPlayheadSeconds()`, which returns `snapshot.playhead_seconds`. This snapshot is updated from Kira telemetry events (`eventHub.emit('engine_state', payload)`) at discrete intervals.

Inside `syncVideoPlayback()` in `mtrax_renderer_webgpu_adapter.js`, the drift between `state.playhead` (Kira) and `video.currentTime` (AVFoundation) was computed every frame. The seek threshold was **0.20 seconds**.

Because the Kira telemetry snapshot updates discretely, `state.playhead` would jump forward by several hundred milliseconds when a new snapshot arrived. This appeared as a large drift → `syncVideoPlayback` immediately issued a hard seek (`video.currentTime = targetTime`).

**Hard seeking a playing `<video>` in WKWebView flushes the AVFoundation decoder buffer.** The codec must re-decode from the nearest keyframe (I-frame). This takes 100-200ms during which the video element outputs the same frame → visible freeze → periodic stutter at the exact frequency of Kira telemetry updates.

All `<video>` elements used in MTrack on Tauri are **muted** — they are pure GPU texture sources for WebGPU `copyExternalImageToTexture`. Audio comes exclusively from the native Kira engine. There is therefore **zero reason to force A/V synchronization at sub-second precision** for these elements.

#### Cause 2 — `requestAnimationFrame` chained after the async update

In `play_runtime.js`, the `frame()` function scheduled the next `requestAnimationFrame(frame)` call inside `.finally()`, after the full async chain (eval → position clips → audio sync → render) completed.

If the async chain took 22ms, the next display update was scheduled at 22 + 16.67 = **38.67ms after the current frame** — breaking the vsync cadence and adding visual judder on top of the decoder stalls.

---

## Files Modified

### 1. `src/application/eVe/intuition/tools/core/mtrax_renderer_webgpu_adapter.js`

**Change**: Raised the seek threshold from 0.20s to **2.0s** on Tauri for playing muted video.

Key constants affected:
```javascript
// Before
const GPU_VIDEO_RATE_SYNC_SEEK_THRESHOLD_TAURI_S = 0.60; // (was 0.20 originally)

// After
const GPU_VIDEO_RATE_SYNC_SEEK_THRESHOLD_TAURI_S = 2.0;
```

Key logic in `syncVideoPlayback()`:
```javascript
const useRateSync = isTauriRuntime() && playing && !warmup && !prewarm && !forceSeek;

const shouldSeekPlaying = playing && canSeek && (
    useRateSync ? drift > 2.0 : drift > policy.threshold
);
```

On Tauri, a seek is only issued if drift exceeds 2 full seconds. In practice this never happens during normal playback — AVFoundation and Kira stay within a few hundred milliseconds of each other.

Note: A previous attempt introduced a **rate sync** approach (adjusting `video.playbackRate` proportionally to drift). This was abandoned because changing `playbackRate` at 60fps caused AVFoundation to oscillate its decode pipeline, which made the stutter worse, not better. `GPU_VIDEO_RATE_SYNC_GAIN_TAURI` was set to `0` and no rate adjustments are made.

---

### 2. `src/application/eVe/domains/mtrax/timeline/play_runtime.js`

**Change**: Moved `requestAnimationFrame(frame)` to the **start** of `frame()`, before any async work.

```javascript
// Before (simplified)
function frame(ts) {
    if (!state.isPlaying) return;
    const perfDebug = ensurePerfDebug();
    perfDebug.beginFrame();
    doAsyncWork()
        .finally(() => {
            perfDebug.endFrame();
            if (state.isPlaying) {
                state.rafId = requestAnimationFrame(frame); // ← scheduled AFTER async
            }
        });
}

// After
function frame(ts) {
    if (!state.isPlaying) return;
    // Schedule next frame immediately — decouple display cadence from async duration
    if (typeof requestAnimationFrame === 'function') {
        state.rafId = requestAnimationFrame(frame); // ← scheduled FIRST
    }
    const perfDebug = ensurePerfDebug();
    perfDebug.beginFrame();
    doAsyncWork()
        .finally(() => {
            perfDebug.endFrame();
            // NO rAF here anymore
        });
}
```

Effect: The display canvas now updates at the native vsync rate (60fps) regardless of how long the async update chain takes. The `.finally()` block is now diagnostics-only.

`cancelAnimationFrame(state.rafId)` in transport controls still works correctly — it cancels the most recently registered rAF ID.

---

### 3. `src/application/eVe/domains/mtrax/timeline/playback_frame_update_runtime.js`

**Change**: On Tauri, use the **synchronous** `evaluateRuntimeFrameState()` instead of the Worker-based async `evaluateRuntimeFrameStateAsync()`.

The Worker path adds 1-5ms of IPC latency per frame (postMessage round-trip). On Tauri with JSC (not V8), this is more expensive than in Chrome.

```javascript
const useWorkerEval = mtrackState.isPlaying && !(typeof isTauriRuntime === 'function' && isTauriRuntime());

let evalResult;
if (useWorkerEval) {
    evalResult = await evaluateRuntimeFrameStateAsync(...);
} else {
    evalResult = evaluateRuntimeFrameState(...);
}
```

### 4. `src/application/eVe/domains/mtrax/timeline/playback_position_bootstrap_runtime.js`

**Change**: Passes `isTauriRuntime` down to `createPlaybackFrameUpdateRuntime` so the Worker bypass can detect the runtime context.

---

## How to Detect a Regression

If the stutter returns, check in this order:

1. **Is the seek threshold still 2.0s on Tauri?**
   Search for `GPU_VIDEO_RATE_SYNC_SEEK_THRESHOLD_TAURI_S` in `mtrax_renderer_webgpu_adapter.js`. Must be `2.0` or higher.

2. **Is `requestAnimationFrame` still at the start of `frame()`?**
   In `play_runtime.js`, find the `frame(ts)` function. The `requestAnimationFrame(frame)` call must appear before the async chain, not inside `.finally()`.

3. **Is rate sync still disabled?**
   `GPU_VIDEO_RATE_SYNC_GAIN_TAURI` must be `0`. Any non-zero value will cause `video.playbackRate` to be adjusted 60 times/second → AVFoundation oscillation → stutter.

4. **Is the Worker bypass still active on Tauri?**
   In `playback_frame_update_runtime.js`, the `useWorkerEval` variable must be `false` when `isTauriRuntime()` is `true`.

## Diagnostic Probe

A frame-by-frame validation probe is available at `temp/tauri_video_frame_probe.mjs`.

Usage:
```bash
PROBE_URL="http://localhost:3000" PROBE_DURATION_MS=5000 PROBE_INTERVAL_MS=80 node temp/tauri_video_frame_probe.mjs
```

It captures video frames via CDP and reports if any two consecutive frames are identical (indicating a freeze/stutter). A healthy run should report 0 repeated frames.
