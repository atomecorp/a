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

A later Dashboard-to-project reproduction exposed the remaining alias gap:
liquid Flower/main-menu surfaces carry the same blur as
`material.procedural.background_blur_px`, while the active-glass redraw guard
recognized only `material.backdrop`. Style/scene changes could therefore take
the one-redraw fast path and freeze an intermediate Dashboard capture.

## Durable correction

- The one shared backdrop shader derives its sampling extent from the current
  capture texture dimensions and the shared capture downscale. Flower, the
  contextual rail, and the main menu therefore have no per-material WebView
  size to refresh or desynchronize.
- `bevy_web_renderer_runtime.js` detects active non-zero backdrop blur and
  reuses the existing bounded presentation-prime scheduler after direct
  transforms and settled diffs.
- The detector treats standard `material.backdrop` and liquid
  `material.procedural.background_blur_px` as the same active glass. No
  Dashboard-specific shader, capture, or redraw scheduler exists.
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

## Opaque dark glass while the window is resized (2026-10-08)

### Symptom

While a window edge is dragged (Tauri, reproduced in Chromium), every glass
card turns opaque dark gray for one or more frames, then returns to blurred
glass once the size settles. The thin gaps between cards keep showing the
colored workspace.

### Confirmed cause

`generate_workspace_blur_mips` copied the capture image into the blur pyramid
inside `Core2dSystems::PostProcess`. A Bevy camera draws into its intermediate
`ViewTarget`; the `upscaling` system blits that frame into the camera output
(the capture image) only after the post-process sets. The copy therefore always
read the previous frame's capture. Every resize allocates a new, zero-filled
capture, so the first frame sampled a black pyramid and the shader drew
`mix(black, tint)` at full alpha. Pixel proof: card top 34/255 and bottom
25/255, exactly the tint (16/255, alpha 0.26, fade 0.45) over black after sRGB
encoding.

This was not a double render or a DOM layer.

### Durable correction

- `workspace_blur_mip_pass()` schedules the copy and mip generation
  `.after(upscaling)`, so the pyramid always holds the frame captured in the
  same render. This also removes the permanent one-frame lag of the glass.
- `apply_surface` refreshes the per-material blur LOD only when the DPR
  changes. Before, every resized frame marked every glass and SDF material as
  modified and rebuilt its bind group.
- Guard: `blur_pyramid_copies_the_capture_after_this_frame_was_written` builds
  the real `Core2d` schedule with Bevy's `upscaling` and fails on the old
  `in_set(PostProcess)` wiring.
- Repro probe: `temp/glass_resize_dark/probe.mjs` (headed off-screen Chromium,
  24 resize steps). Before: 9/24 dark frames. After: 0/72 over three runs.
