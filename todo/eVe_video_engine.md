# eVe Video Engine - Active Task Plan

## Status

This file is the active task plan for the eVe/Bevy/WebGPU video-engine work.
It replaces the previous mixed audit/performance/video notes with one checked,
evidence-driven execution list.

Task status rules:

- `[x]` means repository evidence proves the task is already done or this
  planning cleanup completed it.
- `[ ]` means the task is open.
- A task must not be checked only because it is planned, plausible, or partially
  started.
- When implementation advances, update this file in the same step and check only
  the tasks proven by source inspection, tests, probes, or generated reports.

## Non-negotiable target

Build an eVe/Bevy/WebGPU video engine capable of real-time project editing and
compositing:

- 10 simultaneous video streams in the Bevy project canvas.
- Stable 60 FPS at current canvas resolution and real device pixel ratio.
- Smooth Atome drag and resize with or without video playback.
- No live playback route based on `canvas 2D -> getImageData -> RGBA -> WASM`.
- Video rendered in `canvas#eve_surface_project`, without visible DOM video
  overlays.
- Full-resolution sharpness, without downscale caches hiding performance issues.
- One visible Bevy/WebGPU project canvas as the presentation surface.

## Architecture invariants

- Live project video must not cross `ImageData`, `Uint8Array RGBA`, or `Vec<u8>`
  for playback.
- Drag and resize are priority interaction paths and must remain independent from
  video work.
- Video compositing belongs in Bevy/WebGPU, not DOM and not an intermediate 2D
  canvas.
- Persistent mutations must not execute during `pointermove`.
- Any optimization stays only when it improves a reproducible measurement.
- No fallback renderer, compatibility shim, or parallel old/new product route may
  remain active.
- DOM remains a disposable projection only; canonical Atome state stays outside
  the DOM.

## Current repository evidence

- [x] Bevy project rendering is the active visible project canvas route.
  Evidence: `maps/CODEMAP.md`, `maps/ARCHITECTURE_MAP.md`,
  `eVe/domains/rendering/bevy_web_renderer_runtime.js`.
- [x] Direct drag transform routing exists through
  `apply_atome_bevy_transform`.
  Evidence: `eVe/domains/rendering/bevy_web_renderer_runtime.js`,
  `tests/eve/project_scene_gesture_performance.test.mjs`.
- [x] Video frame version tracking exists through
  `__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__`.
  Evidence: `eVe/domains/rendering/bevy_video_decode_source_runtime.js`,
  `tests/eve/bevy_video_decode_source_runtime.test.mjs`.
- [x] Rust Bevy video copy gating exists through `AtomeVideoFrameCopies`.
  Evidence: `atome/renderers/bevy-core/src/video_texture.rs`,
  `tests/eve/bevy_project_renderer_guards.test.mjs`.
- [x] Media preview has a WebGPU external texture implementation.
  Evidence: `eVe/domains/media/preview/webgpu_video_preview_renderer.js`.
- [x] This plan was reconciled with the current repository state.
  Evidence: source searches found the items above and the open gaps below.
- [x] `todo/WEBGPU_to_repair.md` exists and Phase A is closed.
  Evidence: `todo/WEBGPU_to_repair.md`.
- [x] A maintained external-video prototype probe exists at
  `temp/webgpu_external_video_probe.mjs`.
  Evidence: `temp/webgpu_external_video_probe.mjs` and
  `temp/probe_reports/webgpu_external_video_probe/report.json`.
- [x] A maintained Bevy fluency probe exists at
  `temp/bevy_canvas_fluency_probe.mjs`.
  Evidence: `temp/bevy_canvas_fluency_probe.mjs`,
  `temp/bevy_fluency_probe/`, and
  `temp/probe_reports/bevy_canvas_fluency_probe/report.json`.
- [x] B5 isolation comparisons now cover mixed non-video content and videos
  with video-frame copies disabled.
  Evidence:
  `temp/probe_reports/bevy_canvas_fluency_probe_mixed_non_video10/report.json`
  and
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_copies_disabled/report.json`.
- [x] B5 now also has Chrome local WebGPU presentation reports.
  Evidence:
  `temp/probe_reports/bevy_canvas_fluency_probe_chrome_mixed_non_video10_webgpu/report.json`,
  `temp/probe_reports/bevy_canvas_fluency_probe_chrome_video10_webgpu/report.json`
  and
  `temp/probe_reports/bevy_canvas_fluency_probe_chrome_video10_copies_disabled_webgpu_v3/report.json`.
  With Google Chrome plus the existing WebGPU launch flags, Bevy drains the
  WASM op queue and applies redraws without WebGPU adapter errors.
  The mixed non-video baseline reaches `average_fps: 60.006` but still has
  `frame_p95_ms: 18.5`, so the final p95 miss is not caused by video copies
  alone.
- [x] Phase C canonical owners are identified without creating a side renderer.
  Evidence: `maps/CODEMAP.md`, `maps/API_MAP.md`,
  `maps/ARCHITECTURE_MAP.md`, `platforms/web/bevy-renderer/src/exports.rs`,
  and `atome/renderers/bevy-core/src/video_texture.rs`.
- [x] The current browser Bevy/wgpu backend limit for `GPUExternalTexture` is
  documented.
  Evidence: `wgpu-27.0.1/src/backend/webgpu.rs` leaves
  `create_external_texture` unimplemented for web, while
  `temp/webgpu_external_video_probe.mjs` proves the pure JavaScript WebGPU API
  can import and draw external video textures outside the Bevy product route.
  Additional evidence: pinned `wgpu::ExternalTextureDescriptor` is currently
  plane/`TextureView` based, not a direct `HTMLVideoElement` import path; the
  pinned API that accepts `HTMLVideoElement` remains the copy path.
- [x] Direct Bevy/wgpu upgrade is not enough to close Phase C.
  Evidence: `cargo search wgpu --limit 5` reports `wgpu 29.0.3`, `cargo search
  bevy --limit 5` reports `bevy 0.19.0-rc.3`, and local source inspection after
  `cargo info wgpu`, `cargo info bevy_render`, and `cargo info wgpu-types`
  shows `bevy_render 0.19.0-rc.3` depends on `wgpu 29.0.3` while
  `wgpu-29.0.3/src/backend/webgpu.rs` still leaves
  `create_external_texture` and `BindingResource::ExternalTexture`
  unimplemented for web. `wgpu-types-29.0.3` still exposes browser video
  sources only through `CopyExternalImageSourceInfo` / `ExternalImageSource`,
  not through the public `ExternalTextureDescriptor`.
- [x] Guard against a fake Phase C API while the pinned backend cannot draw
  external textures.
  Evidence: `tests/eve/bevy_project_renderer_guards.test.mjs` now verifies the
  pinned `wgpu 27.0.1` lock and rejects `apply_atome_bevy_video_track`,
  `remove_atome_bevy_video_track`, `update_atome_bevy_video_transform`, and
  `AtomeVideoTrack` facades until real backend support replaces the copy path.
- [x] The web Bevy backend reports its actual video capability explicitly.
  Evidence: `platforms/web/bevy-renderer/src/lib.rs` exposes
  `read_web_video_backend_capabilities()` through
  `read_atome_bevy_video_backend_capabilities()` with schema
  `atome.bevy.web.video_backend.v4`, reporting target
  `gpu_external_texture_texture_external`, current backend
  `copy_external_image_to_texture`, `current_backend_final: false`,
  `video_track_api_exposed: false`, browser
  `GPUDevice.importExternalTexture` availability, missing wgpu web
  `create_external_texture`, missing wgpu source descriptor and
  external-texture resource binding, blocker
  `wgpu_web_external_texture_source_and_resource_binding_unimplemented`,
  `gpu_external_texture_import: false`, `texture_external_sampling: false`,
  `rgba_live_payload: false`, and `visible_dom_video_overlay: false`.
- [x] The current non-final video copy path exposes structured diagnostics.
  Evidence: `atome/renderers/bevy-core/src/video_diagnostics.rs` owns copy and
  skip counters, `platforms/web/bevy-renderer/src/exports.rs` exposes
  `read_atome_bevy_video_copy_diagnostics()` and
  `reset_atome_bevy_video_copy_diagnostics()`, and
  `eVe/domains/rendering/bevy_wasm_diagnostics_runtime.js` attaches those
  readers to the shared Bevy perf diagnostics object.
- [x] The browser Bevy web runtime no longer owns media-resource and
  presentation scheduling details inline.
  Evidence: `eVe/domains/rendering/bevy_web_renderer_runtime.js` is reduced to
  the canvas/WASM startup and diff owner, while
  `eVe/domains/rendering/bevy_media_resource_runtime.js` owns media texture
  projection plus the deferred resource queue and
  `eVe/domains/rendering/bevy_web_presentation_runtime.js` owns redraw
  priming, WASM runner completion filtering, and video-frame redraw dispatch.
  `npm run test:run -- tests/eve/bevy_web_renderer_runtime.test.mjs
  tests/eve/bevy_project_renderer_guards.test.mjs` passes with 10 assertions.
- [x] Active Bevy canvas context diagnostics exist without a fallback renderer.
  Evidence: `eVe/domains/rendering/bevy_web_presentation_runtime.js` installs
  WebGPU/canvas context lost/restored listeners on the existing Bevy canvas,
  `eVe/domains/rendering/bevy_web_renderer_runtime.js` records the runtime
  context status exposed by `readBevyWebRendererState`, and
  `tests/eve/bevy_web_renderer_runtime.test.mjs` simulates lost/restored events
  while proving listener installation is idempotent.
- [x] Browser Bevy no longer relies on continuous Winit updates for the project
  canvas route.
  Evidence: `platforms/web/bevy-renderer/src/lib.rs` uses Bevy
  `WinitSettings::desktop_app()`, keeps explicit EventLoopProxy wakeups for
  queued ops/redraw/video-frame notifications, exposes accepted/applied
  video-frame redraw counters through web diagnostics, and
  `cargo test` in `platforms/web/bevy-renderer` passes the reactive Winit
  contract test.
- [x] The unified rendering contract is repaired for the current Bevy project
  route.
  Evidence:
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs` keeps the 14
  contract assertions split across bounded renderer-agnostic and project-scene
  suites after aligning the contract with hidden decode-only videos, direct
  Bevy style exports, gesture-frame plus final-set commits, and the current
  text mutation payload.
- [x] Live source-backed project video is guarded away from the RGBA resolver.
  Evidence: `tests/eve/bevy_project_renderer_guards.test.mjs` verifies that a
  live video without poster rejects with
  `bevy_media_texture_video_gpu_source_only` before any `drawImage` or
  `getImageData`, and that Bevy video resource updates bypass
  `withResolvedMediaTexture`.
- [ ] Live project video uses `GPUExternalTexture` / `texture_external`.
  Current evidence: the project path still uses
  `copy_external_image_to_texture`.
- [x] The Phase C equivalent canonical owners exist.
  Current evidence: responsibility stays in the existing rendering chain
  `project_scene_runtime.js -> project_scene_bevy_projection_runtime.js ->
  bevy_web_renderer_runtime.js -> platforms/web/bevy-renderer ->
  atome/renderers/bevy-core`. Planned new modules were not created because the
  present blocker is inside the current Bevy/wgpu web backend, not in a missing
  app-level JavaScript owner.

## Phase A - Audit gate

Objective: produce the repair audit before implementation expands.

- [x] Create `todo/WEBGPU_to_repair.md`.
- [x] Start the report with `# Audit WebGPU / Canvas / Bevy / Atomes`.
- [x] Inspect WebGPU adapter, device, queue, surface, error handling, device
  loss, context loss, and resource recreation.
- [x] Inspect canvas sizing, DPR, resize, viewport, focus, blur, zoom, and
  scroll behavior.
- [x] Inspect Bevy ECS architecture, schedules, resources, commands, assets,
  diagnostics, WASM constraints, and per-frame work.
- [x] Inspect Atome model, parsing, serialization, deserialization,
  interpretation, identity, state ownership, and mutation flow.
- [x] Inspect database and storage reads/writes, transactions, indexes,
  migrations, local/offline cache, and frame-critical access.
- [x] Inspect rastering, dirty regions, batching, instancing, culling, z-order,
  textures, redraw, zoom, and pan.
- [x] Inspect refresh strategy, `requestAnimationFrame`, redraw coalescing, Bevy
  redraw scheduling, and update loops.
- [x] Inspect reliability around invalid data, corrupt/empty database, async
  races, WASM/Rust panics, background tabs, and large volumes.
- [x] Include the mandatory sections `## 1. Resume executif` through
  `## 13. Conclusion technique`.
- [x] Include the required audit, critical issue, performance, reliability,
  prioritized repair, and hypothesis tables.
- [x] Document executed, failed, or skipped checks:
  `rg "webgpu|wgpu|canvas|bevy|atom|atoms|raster|render|texture|buffer|pipeline|database|db|storage|cache|dirty|resize|viewport|requestAnimationFrame"`,
  `cargo check`, `cargo test`,
  `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs`,
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs`,
  and `npm run check:syntax`.
- [x] Close Phase A only when the report cites exact files, functions, modules,
  facts, hypotheses, P0/P1/P2/P3 repairs, and validations.

## Phase B - Current Bevy performance stabilization

Objective: keep drag/resize professional while Bevy remains the only visible
project canvas renderer.

### B1 - Video copy gating

- [x] Expose video frame versions through
  `__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__`.
- [x] Keep a render-world cache of copied video frame versions.
- [x] Gate `copy_external_image_to_texture` so unchanged frames are skipped.
- [x] Keep regression coverage for the version/copy path.
- [x] Rerun validation:
  `npm run test:run -- tests/eve/bevy_video_decode_source_runtime.test.mjs`
  and `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs`.

### B2 - Redraw primes on transform

- [x] Detect transform-only diffs with `opsAreTransformOnly`.
- [x] Audit `schedulePresentationRedrawPrime(..., 'diff')` in
  `eVe/domains/rendering/bevy_web_renderer_runtime.js`.
- [x] Keep delayed redraw primes only for start, resize, spawn/resource/media
  priming, or another documented presentation need.
- [x] Ensure transform-only updates use one coalesced redraw and do not build a
  delayed redraw backlog.
- [x] Add or update a regression guard proving transform-only drag/resize does
  not schedule delayed redraw primes.
- [x] Validate with:
  `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs`.

### B3 - Direct drag transform path

- [x] Direct transform routing exists:
  `pointermove -> hit test runtime -> local prop calculation ->
  apply_atome_bevy_transform -> coalesced redraw`.
- [x] Existing tests cover direct transforms during drag.
- [x] Rerun validation:
  `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
  tests/eve/project_scene_multi_selection_transform.test.mjs
  tests/eve/project_scene_stale_drag_regression.test.mjs`.
- [x] Prove `pointermove` does not execute `Atome.commit`,
  `Atome.commitBatch`, network sync, full scene rebuild, video upload,
  `getImageData`, video decode, or texture create/destroy.

### B4 - Performance instrumentation

- [x] Restore or create `temp/bevy_canvas_fluency_probe.mjs` if no maintained
  probe owner exists elsewhere.
  Evidence: the executable entry point now delegates cohesive probe
  responsibilities to `temp/bevy_fluency_probe/` helpers so no maintained probe
  file remains above the normal module-size threshold.
- [x] Measure pointer event duration, `applyGestureFrame`, projection runtime,
  Virtual Scene diff, `apply_atome_bevy_transform`, Bevy redraw, operations per
  frame, redraw requests, video copies, skipped copies, GPU video imports, and
  GPU video draws.
  Evidence: the fluency probe now reads WASM video copy diagnostics, including
  per-reason skip counters, in addition to JavaScript performance counters.
- [x] Write probe output to
  `temp/probe_reports/bevy_canvas_fluency_probe/report.json` and
  `temp/probe_reports/bevy_canvas_fluency_probe/timeline.json`.
- [x] Report average FPS, frame p50/p95/p99, frames over 24/34/50 ms,
  `pointermove` count, transform patch count, commits during movement, video
  imports, CPU readbacks, redraws, canvas CSS size, pixel size, and DPR.

### B5 - Minimal isolation if performance remains below target

- [x] Compare Bevy scenes with shapes/images/text and no videos.
  Evidence:
  `temp/probe_reports/bevy_canvas_fluency_probe_mixed_non_video10/report.json`
  created 4 image, 3 shape, and 3 text records with `video_count: 0`.
- [x] Compare the same scene with videos present but video copies disabled.
  Evidence:
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_copies_disabled/report.json`
  imported 10 video records and disabled the video frame-version lookup during
  measurement.
- [x] Compare direct-transform-only scenes.
- [x] Compare WebKit, Tauri, Safari, and Chromium where applicable.
- [x] If the minimal case stutters, investigate Bevy/WASM/WebKit/Tauri
  integration, present mode, wake loop, and render-loop configuration.
  Evidence:
  `temp/probe_reports/bevy_canvas_fluency_probe/isolation_summary.json`.
  Caveat: default Playwright Chromium headless still reports
  `No available adapters` and `Unable to find a GPU`; the Chrome local WebGPU
  reports are the current presentation evidence.

### B6 - Reactive Bevy web loop

- [x] Replace default browser/WASM `WinitSettings::continuous()` with Bevy's
  reactive desktop-app Winit settings.
- [x] Preserve explicit EventLoopProxy wakeups for queued render ops, explicit
  redraw requests, and hidden video-frame notifications.
- [x] Expose accepted and applied video-frame redraw counters through the web
  diagnostics payload so idle/playback probes can separate wake pressure from
  copy pressure.
- [x] Guard the contract with Rust tests.
  Evidence: `cargo test` in `platforms/web/bevy-renderer` passes 10/10,
  including `web_renderer_uses_reactive_winit_updates_with_explicit_redraw_wakes`
  and `exported_video_frame_notification_requests_redraw`.
- [x] Capture a maintained post-repair probe report.
  Evidence:
  `temp/probe_reports/bevy_canvas_fluency_probe_reactive_video2_webgpu/report.json`
  completed with local Chrome/WebGPU and 2 video Atomes. It reported
  `average_fps: 59.613`, `frame_p95_ms: 18.6`, `wake_calls: 284`,
  `redraw_applied: 72`, `video_frame_notifications: 0`,
  `video_frame_redraws: 0`, `video_copies: 0`, and
  `skip_missing_frame_version: 160`. This validates the new diagnostics surface
  while keeping the final live-video backend open.
- [x] Selected project video playback activates hidden Bevy decode only through
  project timeline automation.
  Evidence: `tests/eve/project_video_timeline_playback_contract.test.mjs`
  verifies the selection-to-timeline chain with the real hidden Bevy decode
  source and `setBevyVideoDecodePlayback`, while
  `tests/eve/bevy_project_renderer_guards.test.mjs` keeps direct selected
  playback ownership forbidden.

## Phase C - GPU-first live project video

Objective: replace live playback copying with:

```text
decoded video
-> GPUExternalTexture / native decoded texture
-> Bevy material or render node
-> WGSL compositing
-> canvas#eve_surface_project
```

The existing RGBA texture path may remain only for debug, poster frames, or
explicit non-live extraction. It must not be the live playback engine.

### Phase C strategic decision - Solution 2

Decision: choose solution 2, meaning backend-level Web `wgpu` external-texture
support must be implemented or adopted before any eVe/Bevy video-track facade
is exposed.

Option 1, waiting for upstream, is not the active plan because it leaves this
file blocked with no reliable delivery date. Option 3, moving the problem to a
native backend or visible HTML overlay, is not the browser/WASM product answer:
the web tools still need the project canvas path, and a visible HTML video above
Bevy would be a parallel renderer/fallback that breaks unified compositing,
effects, export, timeline, matrix preview, and the "all non-UI Atomes render in
Bevy GPU" rule.

The next compliant implementation boundary is therefore below eVe:

- add or adopt a real browser-media source route in `wgpu` for WebGPU
  external textures;
- make the Web backend create `GPUExternalTexture` through
  `GPUDevice.importExternalTexture({ source })` instead of leaving
  `create_external_texture` unimplemented;
- make `BindingResource::ExternalTexture` map to the browser
  `GPUExternalTexture` in Web bind groups;
- keep external textures scoped to the draw/frame lifetime required by the
  browser WebGPU API;
- only after that, expose `AtomeVideoTrack` and
  `apply_atome_bevy_video_track(...)` through `platforms/web/bevy-renderer/`.

Difficulty challenge: this is a high-risk backend task, not an eVe JavaScript
task. It crosses `wgpu` API design, the `BrowserWebGpu` backend,
`wasm-bindgen` WebGPU bindings, WebGPU external-texture lifetime rules, Bevy
material/render integration, shader validation, and browser compatibility. It
may require maintaining a local `wgpu` patch or fork until upstream carries the
feature. Treat it as a dedicated backend milestone with narrow proof first:
one imported video external texture sampled in the existing Bevy project canvas,
then the `AtomeVideoTrack` API, then multi-track/timeline work.

### Phase C production isolation rule

The risky C1 backend work must start outside the production framework route and
must not use a separate Git branch. All experimental files for this milestone
must live in one clearly identifiable isolated directory under `temp/`, named
`temp/c1_wgpu_external_texture_backend_probe/`, with dedicated probe scripts,
fixtures, and reports. That proof must not be imported by the eVe runtime, must
not be wired into `platforms/web/bevy-renderer`, must not change the active
crate dependency graph, and must not be part of the product build until the
promotion gate below passes.

Separated tests are mandatory while the work is experimental. Use only isolated
probe validation under `temp/` before promotion. Add persistent tests under
`tests/` only when the proven behavior is ready to become part of the canonical
framework contract. Do not expose product APIs, change app-level video routing,
or connect any experimental backend patch to the production canvas while the
proof is still incomplete.

Promotion into the framework is allowed only after the isolated proof shows a
real browser video source imported as `GPUExternalTexture`, sampled through a
Bevy-owned `texture_external` WGSL path, and presented in a WebGPU canvas
without a JavaScript side renderer, visible DOM video overlay, live RGBA
readback, fallback renderer, or parallel product route. At promotion time, move
only the proven minimal code into the canonical owners, update the maps if
ownership/API/rendering structure changes, and keep the isolated prototype out
of production.

### C0 - Guards and non-blocking architecture preparation

- [x] Identify the canonical owner before creating any new module.
- [x] Reuse existing owners when possible:
  `eVe/domains/rendering/bevy_web_renderer_runtime.js`,
  `eVe/domains/rendering/bevy_media_resource_runtime.js`,
  `eVe/domains/rendering/bevy_web_presentation_runtime.js`,
  `eVe/domains/rendering/bevy_video_decode_source_runtime.js`,
  `eVe/domains/media/preview/webgpu_video_preview_renderer.js`,
  `platforms/web/bevy-renderer/src/`, and
  `atome/renderers/bevy-core/src/`.
- [x] Create new modules only if existing architecture cannot host the
  responsibility cleanly. Candidate names remain:
  `eVe/domains/media/bevy_video_engine_runtime.js`,
  `eVe/domains/media/bevy_video_timeline_runtime.js`,
  `eVe/domains/media/bevy_video_probe_runtime.js`,
  `eVe/domains/rendering/bevy_web_video_bridge.js`,
  `platforms/web/bevy-renderer/src/video_external.rs`,
  `platforms/web/bevy-renderer/src/video_compositor.rs`,
  `atome/renderers/bevy-core/src/video_compositor.rs`,
  `atome/renderers/bevy-core/src/video_track.rs`,
  `atome/renderers/bevy-core/src/video_material.rs`,
  and `atome/renderers/bevy-core/assets/shaders/video_external.wgsl`.
  Evidence: no new Phase C module was created; the app-level owner is known,
  and the missing capability is currently the Bevy/wgpu web external-texture
  backend. Creating a JavaScript sidecar renderer would violate the
  no-fallback/no-parallel-renderer invariant.
- [x] Keep image/sprite RGBA texture routing separate from live video routing.
  Evidence: browser RGBA texture resolution rejects source-backed video without
  a poster, while video resource patches are mapped by the dedicated video
  resource path.
- [x] Ensure project video presentation uses only `canvas#eve_surface_project`.
  Evidence: `tests/eve/project_scene_unified_rendering_contract.test.mjs`
  verifies one project Bevy canvas and no visible project video overlays.
- [x] Prove the live route does not call `getImageData`.
  Evidence: `tests/eve/bevy_project_renderer_guards.test.mjs` instruments the
  browser resolver and proves live source-backed video rejects before readback.
- [x] Prove the live route does not convert video frames into Bevy `Image` via
  RGBA.
  Evidence: the live route still uses Bevy `Image` plus
  `copy_external_image_to_texture`, but not an `ImageData`/RGBA payload.
- [x] Prove no visible DOM video overlay is used for project presentation.
  Evidence: the unified rendering contract allows hidden decode videos only
  under `#eve_bevy_video_decode_root` and rejects visible project video nodes.

### C1 - Backend prerequisite: Web `wgpu` external texture

This subsection must be completed before any product `AtomeVideoTrack` API,
multi-track compositor work, or final performance acceptance.

- [ ] Create the isolated C1 proof directory
  `temp/c1_wgpu_external_texture_backend_probe/` on the current worktree, with
  no new Git branch, no production framework import, no wiring into the active
  Bevy renderer crate, and no inclusion in product builds.
- [ ] Add dedicated isolated probe validation for the C1 proof, keeping it
  separate from the canonical test suite until the backend behavior is proven.
- [ ] Implement or adopt browser-media source support in the Web `wgpu`
  backend for `GPUExternalTexture` inside the isolated proof first.
- [ ] Make the Web `wgpu` backend create `GPUExternalTexture` through
  `GPUDevice.importExternalTexture({ source })` instead of leaving
  `create_external_texture` unimplemented, without changing the production
  dependency graph before the promotion gate.
- [ ] Make `BindingResource::ExternalTexture` map to the browser
  `GPUExternalTexture` when building Web bind groups in the isolated proof.
- [ ] Implement the first Bevy-owned WGSL path that samples `texture_external`
  with `textureSampleBaseClampToEdge` in the isolated proof.
- [ ] Prove one imported video external texture is sampled in a WebGPU/Bevy
  proof canvas without a JavaScript side renderer or visible DOM overlay.
- [ ] Promote only the proven minimal backend path into the canonical Bevy/wgpu
  owners after the isolated proof passes, then update maps and persistent tests
  in the same promotion step.

### C2 - Product video-track API after backend proof

- [ ] Define an `AtomeVideoTrack` payload or equivalent canonical track payload.
- [ ] Define or expose:
  `apply_atome_bevy_video_track(track)`,
  `remove_atome_bevy_video_track(id)`, and
  `update_atome_bevy_video_transform(id, transform)`.
- [ ] Implement a project video path that imports external textures in the frame
  where they are drawn.

### C3 - Phase C validation

- [ ] Validate with `cargo check`, `cargo test`,
  `./platforms/web/bevy-renderer/build.sh`,
  `npm run test:run -- tests/eve/selected_project_media_playback_runtime.test.mjs`,
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs`, and
  `npm run check:syntax`.

## Phase D - Multi-track compositing and timeline preparation

Phase D must not start until Phase C1 proves the backend external texture path
and Phase C2 exposes the real product track API.

- [ ] Support z-index per video track.
- [ ] Support opacity per video track.
- [ ] Support normal blend mode.
- [ ] Support add, multiply, and screen blend modes if the canonical compositor
  contract supports them without fallback paths.
- [ ] Support crop/UV rectangles.
- [ ] Support transform per track.
- [ ] Prepare timeline fields: start, duration, trim in, trim out, offset, speed,
  and loop.
- [ ] Prove 1, 2, 4, and 10 project video streams with the fluency probe.
  Current evidence: Chrome local WebGPU 10-video reports render through Bevy
  with queue drain and redraws, but do not meet final timing acceptance. The
  matching mixed non-video baseline also misses the 18 ms p95 threshold.
- [ ] Acceptance: 10 visible streams, playback p95 <= 18 ms, no stable-playback
  RAF gap over 34 ms, drag/resize during playback p95 <= 18 ms, and no quality
  loss compared to canvas DPI.

## Phase E - Maps, cleanup, and final validation

- [ ] Remove obsolete temporary probes and failed experiments.
- [ ] Keep useful diagnostics under `temp/` only when intentionally maintained.
- [ ] Update `maps/CODEMAP.md` when ownership or structure changes.
- [ ] Update `maps/API_MAP.md` when exported APIs or runtime exposure change.
- [ ] Update `maps/ARCHITECTURE_MAP.md` when lifecycle, ownership, dependency
  direction, or rendering route changes.
- [ ] Update `maps/DESIGN_MAP.md` only if user-visible visual contracts, design
  tokens, or generated style ownership change.
- [x] Document browser limits for `GPUExternalTexture`.
- [ ] Run final validation:
  `cargo test`, `cargo check`, `./platforms/web/bevy-renderer/build.sh`,
  `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
  tests/eve/project_scene_multi_selection_transform.test.mjs
  tests/eve/project_scene_stale_drag_regression.test.mjs`,
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs
  tests/eve/render_surface_size_contract.test.mjs
  tests/eve/selected_project_media_playback_runtime.test.mjs`,
  `npm run check:syntax`, and
  `BEVY_FLUENCY_VIDEO_STREAMS=10 node temp/bevy_canvas_fluency_probe.mjs`.

## Definition of done

This plan is complete only when all items below are checked:

- [x] `todo/WEBGPU_to_repair.md` exists and Phase A is closed.
- [ ] Bevy drag/resize regressions are closed or documented with evidence.
- [ ] Live project video playback uses a GPU-first route instead of live RGBA
  copying.
- [ ] 10 project video streams pass the Bevy canvas fluency probe.
- [ ] Maps and tests reflect the final architecture.
- [ ] Final metrics prove average FPS, p50/p95/p99, long-frame counts, video
  imports, CPU readbacks, redraws, and canvas DPR behavior.

Until all definition-of-done items are checked, 10 sharp project video streams at
stable 60 FPS are not delivered.
