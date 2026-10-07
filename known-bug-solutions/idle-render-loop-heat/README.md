# Idle heat: the renderer keeps drawing while nothing visible changes

## Symptom

The iPhone heats up and drains its battery with the app open and untouched,
on the Dashboard or inside a project. Same signature in a desktop browser: the
GPU process and the renderer stay busy at idle.

## Measured signature (2026-10-07, Web, same WASM as WKWebView)

`read_atome_bevy_web_diagnostics()` over 20 s of idle Dashboard:
`wake_calls` 12.1/s, `update_ticks` 36.6/s — three full renders per wake —
with `GPUDevice.importExternalTexture` 37/s and the hidden `eVe.mp4` wallpaper
`<video>` playing. Inside a project, the same 37 renders/s although the
project's opaque colour hides the wallpaper completely.

## Confirmed causes

1. **Redundant redraws per wake** — `platforms/web/bevy-renderer`. The drain
   systems wrote `RequestRedraw` after applying queued work. The update that
   drains work already renders it (no pipelined rendering on the web), and
   bevy_winit reads `RequestRedraw` with a fresh cursor over the
   double-buffered messages, so one message produced two more identical
   renders. A `WakeUp` additionally makes bevy_winit request a window redraw.
2. **Decoder-paced video woke the loop like input.** Video frame
   notifications used the immediate `WakeUp` path (update + forced redraw).
3. **The default video wallpaper played under an opaque cover**
   (`bevy_surface_background_runtime.js`): decode + one render per frame for no
   visible pixel.
4. **iOS: the playback `AVAudioEngine` was never stopped** after the first
   play (`AppNativeAudioPlayback.swift`). An idle running engine renders
   silence on the realtime thread and, with `UIBackgroundModes: audio`, keeps
   the whole app awake in the background. Code-inspected; device validation
   pending.

## Correction

- Drain systems never write `RequestRedraw`; video frames call
  `request_frame_paced_web_redraw()` (`src/frame_clock.rs`) → one
  `RedrawRequested` on the next animation frame → one render per decoded frame.
- The wallpaper video pauses while the applied cover is opaque and resumes when
  uncovered (decoder, URL and playhead kept).
- iOS: `schedulePlaybackEngineIdlePauseLocked()` pauses the engine 2 s after
  the last voice; `ensureAudioEngineRunning()` cancels and restarts.

## Rejected hypotheses

- Duplicated rAF loops, timers or observers after panel open/close or project
  switches: none (8 cycles each, counters constant).
- Event-listener leak: Chrome's `JSEventListeners` stays at 340–780; ephemeral
  `AudioBufferSourceNode` listeners from the Web Kira stream inflated a naive
  add/remove counter.
- Lowering the frame rate or the video cap: forbidden as a fix (masks the
  multiplier); the 15 fps video cap was already in place.

## Regression checks

- `temp/perf_audit_2026-10/baseline.probe.mjs` (scenario rates, ticks/s,
  GPU calls), `ab_drag_idle.probe.mjs` (A/B with the pre-fix WASM served by
  route interception), `wallpaper_pause.probe.mjs` (Dashboard animates, project
  idle = heartbeat only, wallpaper resumes).
- Expected: Dashboard idle ≈ 12.5 renders/s (visible video), project idle with
  an opaque colour ≈ 2 renders/s, every queued op still rendered during a drag.
- iOS acceptance (to do on device): play a sound, stop, wait > 2 s, background
  the app → it must suspend; Xcode Energy gauge before/after.
