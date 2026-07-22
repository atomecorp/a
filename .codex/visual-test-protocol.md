# Atome Visual Test Protocol

## Purpose

This runbook defines the reproducible visual acceptance procedure for the real
Atome code paths in test/debug mode:

- Web through Fastify on `http://localhost:3001`.
- Tauri Debug with its embedded Axum server on `http://127.0.0.1:3000`.
- iOS Debug installed on a physically connected iPhone.

It does not create an alternate debug UI. Interact only with the actual
WebGPU/Bevy UI that users receive. DOM and accessibility trees are diagnostic
surfaces; canonical state and visual acceptance must not be inferred from them
alone.

## Preconditions

1. Preserve unrelated worktree changes. Do not use Git write commands.
2. Use dedicated QA accounts and projects. Create at least two projects per
   platform (`QA <platform> A` and `QA <platform> B`).
3. Keep temporary scripts, screenshots, logs, Appium capabilities, and copied
   WebDriverAgent sources under `./temp` only.
4. Record the device orientation and viewport before coordinate diagnostics.
   Do not reuse portrait coordinates on a landscape iPhone.
5. Treat an observed error as confirmed only after a second reproduction, unless
   it prevents the application from starting.

## Runtime startup

### Web

```sh
scripts/run_fastify.sh
curl -sSI http://localhost:3001/ | head -12
```

Wait for the actual eVe shell, `window.__DEBUG__` or `#intuition`, and the
mounted Bevy main-menu tree before interacting. Do not use `DOMContentLoaded`,
`networkidle`, or DOM readiness as the acceptance gate.

Collect browser console messages, failed network requests, and Fastify output
from startup through the end of each scenario.

### Tauri

```sh
scripts/run_tauri.sh --test
curl -sS -D - http://127.0.0.1:3000/ -o /dev/null | head -30
```

If a sandboxed `curl` cannot reach port 3000 while the application is running,
repeat the read-only request with the required local-system permission. Verify
the listener with `lsof -Pan -p <squirrel-pid> -iTCP -sTCP:LISTEN`.

Collect the WebView console, Axum/Rust output, and any paired Fastify logs.

### iOS

Use the `atome` Xcode scheme in Debug and a physically connected, unlocked,
developer-mode iPhone. Device registration and a valid Apple Development
signature are required. iPhone Mirroring is not required.

```sh
xcrun devicectl device process launch \
  --device <COREDEVICE-ID> --terminate-existing one.atome.app
```

For visual control, use Appium with the XCUITest driver. The WebDriverAgent
must be signed by the same development team as the device. Keep any copied or
locally adjusted WebDriverAgent project under `./temp`; never modify Atome's
signing configuration to make the test harness work.

Useful checks:

```sh
xcrun devicectl device info lockState --device <COREDEVICE-ID>
xcrun devicectl device process launch --help
```

Launch Appium locally, create a session targeting `one.atome.app`, then use
only real XCUITest taps, touches, and scrolls. Capture a screenshot after every
state-changing action. XCUITest source is useful for visible native fields and
system alerts, but it is not proof that a WebGPU object is rendered.

Always collect Xcode/device console output. The following log classes are
particularly important:

- `[APP][js_console]` errors and warnings;
- native invoke failures;
- `AudioSchemeHandler` range and 404 errors;
- camera/microphone permission errors;
- WebGPU or Bevy renderer errors.

## Coordinate diagnostics on iOS

The iPhone can be in landscape. Appium coordinates are logical points, whereas
screenshots are normally 3x pixels. Convert only after accounting for the
WebView offset reported by the XCUITest source.

Use coordinates only to diagnose a canvas hit-test when semantic controls are
not exposed. First inspect the current screenshot and, where useful, the
accessibility source. Recalculate after any menu expansion: child palettes
shift the positions of later tools.

Never treat an approximate coordinate as a product result. Confirm every tap
with a fresh visual capture. A real XCUITest touch is valid test input; a
synthetic DOM event, forced click, or test-only API is not.

## Mandatory acceptance matrix

Run every row for Web, Tauri, and iOS. Record pass/fail, project and Atome IDs,
two reproduction attempts for failures, screenshots, and relevant logs.

| Scenario | Required visual and state evidence |
| --- | --- |
| New account and relaunch | New account is created through UI, survives restart, and can sign in again. |
| Project isolation | Projects A and B have no shared Atomes, previews, media, or playback state. |
| Video import | Import two fixtures into A. Open each three times. Verify motion, duration progression, non-transparent frames, active audio, stop/resume, natural end, and replay. |
| Audio recording | Start, visual preview remains visible, stop/finalize, exactly one readable Atome appears. Verify non-zero duration/level, stop/resume, natural end, and replay. |
| Video recording | Start, camera preview is visible, stop/finalize, exactly one non-transparent Atome appears. Verify image motion, audio, stop/resume, natural end, and replay. |
| Photo capture | Capture creates one non-transparent image Atome in the current project. |
| Flower entry | While recording, only the active tool remains with preview; Flower remains at bottom. Tapping preview finalizes, removes tool, and creates one readable Atome. |
| Main-menu entry | The audio/video flow has the same preview, close, commit, and readability invariants as Flower. |

For audio, proof requires non-zero duration, advancing playhead, detected end,
successful replay, and non-zero waveform/level evidence. For video, proof
requires advancing time, non-transparent changing frames, and active audio.

## Failure classification

Classify each distinct failure separately:

- capture permission or native acquisition;
- visual preview/Flower projection;
- capture stop or finalization;
- durable `commit`/`commitBatch` mutation;
- project ownership or cross-project leakage;
- media persistence and local URL resolution;
- WebGPU projection/rendering;
- playback, replay, or resource reuse.

Do not collapse an invisible preview, an empty Atome, a transparent Atome, a
duplicate Atome, a wrong-project Atome, and a single-playback failure into one
bug.

## Current iOS diagnostic signature

When the main-menu capture flow produces a black canvas with only a colored
dot, no Flower preview, and no readable created media, inspect this ownership
chain in order:

1. `eVe/intuition/tools/capture.js` — capture action and session transition.
2. `eVe/intuition/tools/capture_recording_feedback_runtime.js` — scope/frame
   subscription and visual session cleanup.
3. `eVe/intuition/ribbon/bevy_ui_main_menu_recording_visual_runtime.js` —
   recording visual state and render scheduling.
4. `eVe/intuition/ribbon/bevy_ui_main_menu_recording_visual_model.js` —
   audio scope/video preview overlay projection.
5. Native iOS camera/audio bridge and `AudioSchemeHandler` persistence logs.

This is a diagnostic route, not a permission to add a second renderer, DOM
proxy, or fallback capture path. Preserve the shared WebGPU compositor and the
canonical media commit pipeline.

## Reporting and completion

The final report must contain a `function x Web x Tauri x iOS` matrix with:

- status and severity;
- exact reproduction steps;
- project and Atome identifiers;
- screenshots and log excerpts;
- first diverging layer and code owner;
- observed startup/capture/first-render latency.

For every confirmed bug, provide the demonstrated cause, source-level repair
owner, required regression test, and validation plan. Do not state that visual
testing is complete until every matrix row is either passed with the required
evidence or reported as a reproduced failure with its evidence.
