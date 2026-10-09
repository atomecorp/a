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

- Drain systems never write `RequestRedraw`; every wake (input or decoded video
  frame) requests the window's next animation frame once (`wake_web_renderer`,
  `src/frame_clock.rs`) → one `RedrawRequested` → one render.
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

## Follow-up regression (same day): interaction at 2 frames/s

The first correction kept input wakes on winit `WakeUp` user events. Without the
`RequestRedraw` chain, a `WakeUp` re-emitted from inside a tick (merged wakes,
`Last`) is queued behind `AboutToWait` and only processed on the loop's next
turn — the 500 ms heartbeat — while the in-flight flag merges every later wake
into it. Measured on Web with a media-heavy project: 70-150 wakes/s, **2 ticks/s**
during object zoom, rotation, pinch, view zoom and Mystic (pre-fix WASM: 30-48).
The morning gesture probe missed it because it measured JavaScript rAF pacing,
not Bevy ticks or presents.

Correction: wakes request an animation frame (guarded once per frame, re-armed
at tick start); a merged wake makes its tick request the next frame at `Last`
(otherwise rAF-driven animation renders every other frame, 30 frames/s).
Result: gestures 50-61 renders/s, Mystic 60/s after the first opening, idle
still 2/s. Measure **Bevy ticks and presents**, never JavaScript rAF alone.

## Second pass on the physical iPhone (2026-10-09)

Measured in the real WKWebView of an iPhone 17 Pro (Web Inspector driven from
Node, see `reference_ios_device_webview_js_via_appium_debugger`), Dashboard,
no finger on the screen for 8.7 min:

- Bevy: 2 renders/s (500 ms heartbeat), 0 wakes, wallpaper `<video>` paused.
- **The real continuous work was a profile poll**: `eVe/user/background.js`
  re-read the owner's whole profile every 1.2 s to notice a wallpaper change —
  `state-current/get` of the user atome, **214 KB per read because the
  `user_face` photo travels with it**, through the local Swift server (SQLite
  read + JSON encode, WebSocket, `JSON.parse` + GC). 94 MB moved in 8.7 min,
  ≈ 180 KB/s, forever. For an account without a photo on iOS (backend
  `tauri`), each read additionally ran the legacy-profile repair against
  atome.one (`auth.me` + remote read).
- No 5-minute import-cycle burst and no other timer appeared in that window;
  idle commits were three isolated bursts.

Corrections:

- The wallpaper follows the profile through events only:
  `squirrel:auth-checked` (every session change publishes the owner first),
  `eve:user-profile-updated` (save on this device), the synchronized
  `squirrel:atome-updated`/`-restored` of the owner's profile (applied from the
  patch itself, so the local store is never raced) and one re-read when the page
  becomes visible. Covered by `tests/eve/background_default_wallpaper_contract.test.mjs`
  (red on the polling watcher, green after).
- Settled workspace: `frame_clock.rs` keeps the 500 ms failsafe heartbeat for
  3 s after the last wake (work that completes without waking, e.g. a pipeline
  first needed by the last frame), then stretches it to 10 s; any wake still
  renders on the next frame. A playing APNG keeps control of the wait.

Still open: the logged-out login screen loops its logo light sweep
(`user_login_light_runtime.js`) at 60 renders/s forever; it should pause with
the wallpaper's inactivity freeze.

Not measurable here: native CPU per process on the device (`xctrace` lists the
iOS 27.2 phone as offline with Xcode 27.0). **To verify** on device: Xcode
Energy gauge on an idle Dashboard and project after rebuilding the app.

## Regression checks

- `tests/probes/bevy_web_frame_clock_cadence.probe.mjs` (real browser loop,
  quiet scene, rAF-driven wakes: one render per frame, idle ≤ 4 ticks/s; red on
  the 2-frames/s build, green after; since 2026-10-09 also a settled workspace
  renders ≤ 2 times in 10 s and a wake still renders within 100 ms).
- `tests/eve/background_default_wallpaper_contract.test.mjs` (no profile read
  on a timer; a synchronized profile patch applies without a read).
- `temp/perf_regression_2026-10-07/gestures.probe.mjs` (media-heavy project:
  ticks, presents and present gaps per gesture).

- `temp/perf_audit_2026-10/baseline.probe.mjs` (scenario rates, ticks/s,
  GPU calls), `ab_drag_idle.probe.mjs` (A/B with the pre-fix WASM served by
  route interception), `wallpaper_pause.probe.mjs` (Dashboard animates, project
  idle = heartbeat only, wallpaper resumes).
- Expected: Dashboard idle ≈ 12.5 renders/s (visible video), project idle with
  an opaque colour ≈ 2 renders/s, every queued op still rendered during a drag.
- iOS acceptance (to do on device): play a sound, stop, wait > 2 s, background
  the app → it must suspend; Xcode Energy gauge before/after.
