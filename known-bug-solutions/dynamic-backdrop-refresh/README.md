# Dynamic backdrop refresh

## Symptom

In Tauri, Flower, the contextual side rail, or the bottom menu can retain white
or image pixels that are no longer beneath them. The defect is easiest to see
after resizing the window with Flower open or after dragging an image into and
then out of a glass menu.

## Confirmed cause

The glass shader previously mapped workspace coordinates through a size copied
into every resident `BackdropSurfaceMaterial`. That duplicate resize state could
lag behind the actual capture texture and clamp right-side Flower petals to the
old WebView edge. A content transform also crosses four reactive renderer stages:
workspace capture, horizontal Gaussian blur, vertical Gaussian blur, and final
presentation. One redraw can present an intermediate capture and then leave it
frozen until a later unrelated wake.

The issue is not a CSS `backdrop-filter`, DOM stacking, or a missing menu
reprojection. Adding a DOM blur surface would create a second visual authority
and would not repair the WebGPU capture lifecycle.

## Durable correction

- The one shared backdrop shader derives its sampling extent from the current
  capture texture dimensions and the shared capture downscale. Flower, the
  contextual rail, and the main menu therefore have no per-material WebView
  size to refresh or desynchronize.
- `bevy_web_renderer_runtime.js` detects active non-zero backdrop blur and
  reuses the existing bounded presentation-prime scheduler after direct
  transforms and settled diffs.
- Every presentation-prime retry, including the zero-delay retry, is dispatched
  through the owner window timer. This prevents a generated WASM/Winit closure
  from being re-entered while its callback is still active.
- Scenes without backdrop retain their single-redraw transform path; no
  continuous idle renderer is enabled.

## Regression evidence

- `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml`: 79 passed.
- `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml`: 27 passed.
- `cargo test --manifest-path platforms/desktop-tauri/Cargo.toml --features bevy_renderer_core bevy_backend::`: 14 passed.
- `npx vitest run tests/eve/bevy_project_renderer_guards.test.mjs`: 14 passed,
  including the active-backdrop transform prime.

## Required native acceptance

1. Start the rebuilt app through `scripts/run_tauri.sh` at compact size.
2. Open Flower over an image, resize to fullscreen, then return to compact size
   without closing Flower. Petal glass must track the image in both sizes.
3. Drag an image under the contextual side rail and then away. Its glass must
   acquire and release the white/image capture immediately.
4. Repeat under the bottom menu. Buttons above the image must become light and
   blurred; after moving the image away they must return to the workspace color
   with no stale white band.

The earlier 2026-09-16 screenshots predated the texture-owned sampling repair
and were invalidated by a later user reproduction. The final binary, shared
core, Web renderer, Tauri backend, and redraw-prime contracts pass, but this
exact visual sequence remains required after the macOS control session exposes
the native window again. Browser and iOS are outside this acceptance campaign.
