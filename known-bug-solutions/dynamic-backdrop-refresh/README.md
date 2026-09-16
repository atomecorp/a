# Dynamic backdrop refresh

## Symptom

In Tauri, Flower, the contextual side rail, or the bottom menu can retain white
or image pixels that are no longer beneath them. The defect is easiest to see
after resizing the window with Flower open or after dragging an image into and
then out of a glass menu.

## Confirmed cause

The glass shader maps workspace coordinates through the resident
`BackdropSurfaceMaterial.workspace_size`; that uniform must follow every logical
surface resize. A content transform also crosses four reactive renderer stages:
workspace capture, horizontal Gaussian blur, vertical Gaussian blur, and final
presentation. One redraw can present an intermediate capture and then leave it
frozen until a later unrelated wake.

The issue is not a CSS `backdrop-filter`, DOM stacking, or a missing menu
reprojection. Adding a DOM blur surface would create a second visual authority
and would not repair the WebGPU capture lifecycle.

## Durable correction

- `render_ops::apply_surface` updates resident backdrop workspace uniforms from
  the canonical logical surface size.
- `bevy_web_renderer_runtime.js` detects active non-zero backdrop blur and
  reuses the existing bounded presentation-prime scheduler after direct
  transforms and settled diffs.
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

This sequence passed in Tauri on 2026-09-16. Browser and iOS were outside that
acceptance campaign.
