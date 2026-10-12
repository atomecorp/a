# iPad A12-class: uniform grey canvas although every boot state reads "ready"

## Symptom

On an iPad Pro 11" 2nd generation (iPad8,9, A12Z, iPadOS 26.1) the app shows a
uniform grey screen (≈ RGB 38) on every launch. The scene is complete (10 nodes,
first-launch cards present), boot milestones report `bevy.run_ready`,
`projection.bevy_ready` and `authentication_ready`, and no WASM panic is logged.
Newer iPhones/iPads and desktop browsers render normally.

Renderer diagnostics (`__EVE_BEVY_PERF__.readWebDiagnostics()`) give it away:
`update_ticks: 2`, `redraw_applied: 1`, and almost every `wake_calls` is a
`wake_send_failures` — the winit event loop is closed.

## Root cause (confirmed 2026-10-11)

The workspace blur pyramid (`atome/renderers/bevy-core/src/workspace_blur.rs`)
used Bevy 0.19's `core_pipeline::mip_generation` single-pass downsampler. Its
split layout still binds six write-only storage textures per compute pass. The
A12Z WebGPU adapter exposes `maxStorageTexturesPerShaderStage = 4` (the WebGPU
minimum), so wgpu raised:

```
Caught rendering error: Storage texture count(5) exceeded max count per stage(4)
Quitting the application due to Validation RenderError
```

Bevy's default `RenderErrorHandler` writes `AppExit::error()` on any render
error: the event loop exits after the first presented frame. The renderer had
no `bevy_log` subscriber, so nothing was printed, and JavaScript had no channel
to learn about it.

## Correction

- `workspace_blur_pyramid.rs` + `assets/shaders/backdrop_downsample.wgsl`: the
  pyramid is rendered with one colour-attachment pass per mip level, each texel
  averaging its integer 2×2 source block (`textureLoad`, the same filter as
  Bevy's SPD). No storage binding remains; the pyramid image drops
  `STORAGE_BINDING`. Both former `generate_mips_for_phase` call sites (capture
  after `upscaling`, ordered snapshot in `workspace_blur_composition.rs`) use it.
- `platforms/web/bevy-renderer/src/render_error.rs`: same quit policy as Bevy,
  but the first error is kept and exposed as `render_error` in
  `read_atome_bevy_web_diagnostics()`.
- `eVe/domains/rendering/bevy_web_presentation_runtime.js`: startup stability
  rejects with `bevy_renderer_render_error:<detail>` instead of publishing
  startup success.

## Rejected hypotheses

- WebKit permission/file warnings: unrelated.
- The old "unreachable" runner filter: removing it was correct but did not
  change the grey screen.
- A bilinear tap at the destination texel centre: with odd level sizes it drifts
  onto source texel centres and degrades into point sampling (stepped bands in
  the blur at DPR 1.5). Use integer 2×2 loads.

## Diagnosis method

Build the web renderer with Bevy's `bevy_log` feature temporarily; the iOS app
forwards `console.*` to native output (`[APP][js_console]`), readable with
`xcrun devicectl device process launch --console … -- -AtomeWebInspector`.
Remove the feature afterwards.

## Regression checks

- `cargo test --lib workspace_blur` in `atome/renderers/bevy-core`
  (pyramid has no `STORAGE_BINDING`, has `RENDER_ATTACHMENT`).
- `tests/eve/bevy_web_renderer_runtime_contract.test.mjs`: "rejects startup when
  a wgpu error stopped the presented renderer" (fails without the JS check).
- Real device: launch on the A12Z iPad, read diagnostics (`update_ticks` keeps
  growing, `wake_send_failures: 0`, `render_error: ""`), take a WDA screenshot,
  and tap a first-launch card.
- `tests/probes/bevy_backdrop_realtime_pixel_probe.mjs` for blur appearance
  (its 1 px alignment assertions already failed before this change; see
  FRAMEWORK_STATE).
