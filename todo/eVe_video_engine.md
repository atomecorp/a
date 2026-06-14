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
- Every task must have a dedicated validation suite before it is checked. The
  validation can be a focused automated test, an isolated probe, source audit,
  generated report, or build/check command, but the exact evidence must be
  recorded next to the completed task or in the owning evidence section.
- After each task is checked, report the remaining open task count and the
  remaining percentage of the whole plan before continuing with the next task.
  Use the checked/open task count from this file as the source of truth.
- For every remaining task, the validation suite must be known before the task
  is implemented. If a new task is added, add its validation suite in the same
  edit and do not check the task until that suite has produced recorded
  evidence.

## Validation suites for remaining tasks

Current progress after the accepted browser-floor validation decision:
115 checked tasks, 0 open tasks, 115 total tasks, 0% remaining.

Before any remaining task is checked, run or record the matching suite below and
copy the exact evidence next to the checked task:

- Current evidence, live `GPUExternalTexture` route: C1 promotion, C2 product
  API, C3 validation, source audit proving no live
  `copy_external_image_to_texture` product route remains, and a browser
  readback/probe report proving `texture_external` output in
  `canvas#eve_surface_project`.
- C1 promotion: source audit proving zero production imports from
  `temp/c1_wgpu_external_texture_backend_probe/`, `cargo check` for the touched
  Rust crates, `./platforms/web/bevy-renderer/build.sh`, persistent tests under
  `tests/`, and map updates for any ownership/API/rendering changes.
- C3 validation: `cargo check`, `cargo test`,
  `./platforms/web/bevy-renderer/build.sh`,
  `npm run test:run -- tests/eve/selected_project_media_playback_runtime.test.mjs`,
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs`, and
  `npm run check:syntax`.
- D z-index: compositor ordering test with at least two overlapping video
  tracks, plus a browser/readback probe proving visible order.
- D opacity: material/uniform test plus browser/readback probe proving alpha
  contribution without DOM overlay.
- D normal blend mode: compositor test proving source-over behavior with video
  plus non-video Atomes.
- D add, multiply, and screen blend modes: shader/material tests for each
  enabled mode plus a probe proving modes are unavailable, not silently
  fallbacked, when the compositor contract cannot support them.
- D crop/UV rectangles: transform/UV unit tests plus readback probe proving the
  expected cropped video area.
- D transform per track: projection and render tests proving translate, scale,
  resize, and rotation stay canonical-state driven and do not mutate during
  `pointermove`.
- D timeline fields: serialization/replay tests for start, duration, trim in,
  trim out, offset, speed, and loop, plus playback probes for at least trim and
  speed.
- D stream-count probe: maintained fluency reports for 1, 2, 4, and 10 project
  video streams with FPS, p95/p99, long-frame, video import, readback, redraw,
  and DPR metrics.
- D acceptance: Chrome local WebGPU fluency report proving 10 visible streams,
  playback p95 at the measured local browser RAF floor, no stable-playback RAF
  gap over 34 ms, drag/resize during playback p95 <= 18 ms, and no canvas-DPI
  quality loss. The original strict `p95 <= 18 ms` target was accepted by the
  user as validated when the application matched the local blank-browser RAF
  floor.
- E remove obsolete probes: source/file audit proving removed probes are not
  imported, referenced by scripts, or needed by recorded validation.
- E keep useful diagnostics under `temp/`: inventory report listing maintained
  diagnostics, purpose, owner, and last validation command.
- E `maps/CODEMAP.md`: map diff plus `rg` audit proving the documented owners
  match actual file/module ownership.
- E `maps/API_MAP.md`: map diff plus API/export audit proving exposed runtime
  surfaces and schemas match implementation.
- E `maps/ARCHITECTURE_MAP.md`: map diff plus architecture audit proving the
  rendering route, dependency direction, lifecycle, and no-fallback invariant.
- E `maps/DESIGN_MAP.md`: only run when visual/design contracts change; diff
  plus style/token audit proving no new undocumented design owner.
- E final validation: the full validation command list in Phase E plus
  `BEVY_FLUENCY_VIDEO_STREAMS=10 node temp/bevy_canvas_fluency_probe.mjs`.
- Definition of done, drag/resize: gesture performance suites and fluency
  evidence proving regressions are closed or explicitly documented.
- Definition of done, GPU-first live video: C1/C2/C3 evidence proving live
  playback no longer uses live RGBA copying.
- Definition of done, 10 streams: D stream-count and D acceptance reports.
- Definition of done, maps/tests: E map audits and final test evidence.
- Definition of done, final metrics: final metrics report containing average
  FPS, p50/p95/p99, long-frame counts, video imports, CPU readbacks, redraws,
  and canvas DPR behavior.

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
- [x] Rust Bevy video diagnostics remain isolated from the active live route.
  Evidence: `atome/renderers/bevy-core/src/video_diagnostics.rs` preserves
  structured copy/skip diagnostics for legacy/copy-pressure measurement, while
  `tests/eve/bevy_project_renderer_guards.test.mjs` now guards the external
  texture product route and rejects reintroducing the removed `video_texture`
  module.
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
  `atome/renderers/bevy-core/src/video_external_texture.rs`, and
  `atome/renderers/bevy-core/src/video_external_web.rs`.
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
- [x] Guard against a fake Phase C product API while backend, draw path, and
  exports were completed in separate steps.
  Evidence: `tests/eve/bevy_project_renderer_guards.test.mjs` now verifies the
  maintained `wgpu 27.0.1` backend fork wiring, the Bevy external-texture draw
  path, and the generated video-track wasm exports. The guard now requires
  `apply_atome_bevy_video_track`, `remove_atome_bevy_video_track`, and
  `update_atome_bevy_video_transform` to be wired to
  `VideoTrackApply`, `VideoTrackRemove`, and `VideoTrackTransform` ops rather
  than facade exports.
- [x] The web Bevy backend reports its actual video capability explicitly.
  Evidence: `platforms/web/bevy-renderer/src/lib.rs` exposes
  `read_web_video_backend_capabilities()` through
  `read_atome_bevy_video_backend_capabilities()` with schema
  `atome.bevy.web.video_backend.v6`, reporting target
  `gpu_external_texture_texture_external`, current product backend
  `gpu_external_texture_texture_external`, `current_backend_final: true`,
  `video_track_api_exposed: true`, browser
  `GPUDevice.importExternalTexture` availability, true Web `wgpu`
  external-texture create/source/resource support from the maintained backend
  fork, blocker `none`,
  `gpu_external_texture_import: true`, `texture_external_sampling: true`,
  `rgba_live_payload: false`, and `visible_dom_video_overlay: false`.
- [x] The legacy/copy-pressure diagnostic path exposes structured diagnostics.
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
- [x] Live project video uses `GPUExternalTexture` / `texture_external`.
  Evidence: the Bevy source path uses `AtomeVideoExternalTexture`,
  `create_external_texture`, `BindingResource::ExternalTexture`, and
  `assets/shaders/video_external.wgsl` with `texture_external`; C3 validation
  passes; and the browser visual probe at
  `temp/probe_reports/bevy_project_video_visual_probe/report.json` proves output
  in `canvas#eve_surface_project` with one project canvas, no visible DOM project
  media/video overlay, `live_video_backend:
  gpu_external_texture_texture_external`, `gpu_external_texture_import: true`,
  `texture_external_sampling: true`, `backend_blocker:
  none`, no page errors, and
  `screenshot_analysis.non_empty_ratio: 1`. The capture
  `temp/probe_reports/bevy_project_video_visual_probe/project_canvas.png` shows
  the imported video rendered inside the Bevy canvas.
- [x] The Phase C equivalent canonical owners exist.
  Current evidence: responsibility stays in the existing rendering chain
  `project_scene_runtime.js -> project_scene_bevy_projection_runtime.js ->
  bevy_web_renderer_runtime.js -> platforms/web/bevy-renderer ->
  atome/renderers/bevy-core`. Planned new modules were not created because the
  remaining work is Phase D compositing/timeline/performance, not a missing
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
  Evidence: the live source-backed route now uses an external-texture mesh path
  instead of Bevy `Image` frame uploads or `ImageData`/RGBA payloads.
- [x] Prove no visible DOM video overlay is used for project presentation.
  Evidence: the unified rendering contract allows hidden decode videos only
  under `#eve_bevy_video_decode_root` and rejects visible project video nodes.

### C1 - Backend prerequisite: Web `wgpu` external texture

This subsection must be completed before any product `AtomeVideoTrack` API,
multi-track compositor work, or final performance acceptance.

- [x] Create the isolated C1 proof directory
  `temp/c1_wgpu_external_texture_backend_probe/` on the current worktree, with
  no new Git branch, no production framework import, no wiring into the active
  Bevy renderer crate, and no inclusion in product builds.
- [x] Add dedicated isolated probe validation for the C1 proof, keeping it
  separate from the canonical test suite until the backend behavior is proven.
  Evidence:
  `temp/c1_wgpu_external_texture_backend_probe/c1_external_texture_backend_probe.mjs`
  writes
  `temp/c1_wgpu_external_texture_backend_probe/reports/c1_external_texture_backend_probe_report.json`.
  The report is `ok: true`, confirms `production_reference_count: 0`, renders
  60 hidden-video `GPUExternalTexture` imports/draws through WebGPU with
  non-empty readback, and audits local `wgpu` 27.0.1 plus 29.0.3 source gaps
  without changing production imports, crate wiring, or product builds.
- [x] Implement or adopt browser-media source support in the Web `wgpu`
  backend for `GPUExternalTexture` inside the isolated proof first.
  Evidence:
  `temp/c1_wgpu_external_texture_backend_probe/rust_web_external_texture_source/src/lib.rs`
  implements `import_video_external_texture(device, source, label)` with a real
  `web_sys::HtmlVideoElement` source and `GpuExternalTextureDescriptor::new`.
  Validation:
  `RUSTFLAGS="--cfg=web_sys_unstable_apis" cargo check --manifest-path temp/c1_wgpu_external_texture_backend_probe/rust_web_external_texture_source/Cargo.toml --target wasm32-unknown-unknown --offline --target-dir temp/c1_wgpu_external_texture_backend_probe/rust_web_external_texture_source/target`.
  Production `wgpu` and Bevy renderer crates remain unchanged.
- [x] Make the Web `wgpu` backend create `GPUExternalTexture` through
  `GPUDevice.importExternalTexture({ source })` instead of leaving
  `create_external_texture` unimplemented, without changing the production
  dependency graph before the promotion gate.
  Evidence: the isolated Rust proof calls
  `GpuDevice::import_external_texture(&descriptor)` and compiles for
  `wasm32-unknown-unknown` with the validation command above.
- [x] Make `BindingResource::ExternalTexture` map to the browser
  `GPUExternalTexture` when building Web bind groups in the isolated proof.
  Evidence: the isolated Rust proof implements
  `external_texture_bind_group_entry(binding, texture)` through
  `GpuBindGroupEntry::new_with_gpu_external_texture(...)` plus
  `external_texture_bind_group_entry_via_js_value(...)` through the same
  generic `JsValue` resource shape exposed by the vendored `wgpu` web backend,
  and compiles with the validation command above.
- [x] Implement the first Bevy-owned WGSL path that samples `texture_external`
  with `textureSampleBaseClampToEdge` in the isolated proof.
  Evidence:
  `temp/c1_wgpu_external_texture_backend_probe/rust_web_external_texture_source/assets/shaders/c1_video_external.wgsl`
  declares `texture_external` and samples it with
  `textureSampleBaseClampToEdge`.
  `temp/c1_wgpu_external_texture_backend_probe/rust_web_external_texture_source/src/lib.rs`
  exposes the shader through `bevy_shader::ShaderRef` without wiring it into
  production Bevy. Validation:
  `RUSTFLAGS="--cfg=web_sys_unstable_apis" cargo check --manifest-path temp/c1_wgpu_external_texture_backend_probe/rust_web_external_texture_source/Cargo.toml --target wasm32-unknown-unknown --offline --target-dir temp/c1_wgpu_external_texture_backend_probe/rust_web_external_texture_source/target`
  and
  `cargo run --manifest-path temp/c1_wgpu_external_texture_backend_probe/wgsl_shader_validation/Cargo.toml --offline --target-dir temp/c1_wgpu_external_texture_backend_probe/wgsl_shader_validation/target -- temp/c1_wgpu_external_texture_backend_probe/rust_web_external_texture_source/assets/shaders/c1_video_external.wgsl`.
- [x] Generate the isolated Web `wgpu` backend patch audit before attempting a
  Bevy proof canvas.
  Evidence:
  `temp/c1_wgpu_external_texture_backend_probe/wgpu_backend_patch_audit.mjs`
  writes
  `temp/c1_wgpu_external_texture_backend_probe/reports/wgpu_backend_patch_audit_report.json`.
  The report is `ok: true` and identifies the required backend patch points:
  browser-media source descriptor support, `WebExternalTexture` storage of
  `webgpu_sys::GpuExternalTexture`, Web `create_external_texture` mapping to
  `GPUDevice.importExternalTexture`, `BindingResource::ExternalTexture` mapping
  through the vendored generic `JsValue` bind-group resource setter, and
  lifecycle-safe `WebExternalTexture` destroy/drop behavior.
- [x] Build-check an isolated patched local `wgpu` candidate before attempting
  a Bevy proof canvas.
  Evidence:
  `temp/c1_wgpu_external_texture_backend_probe/local_crates/wgpu-27.0.1`
  and
  `temp/c1_wgpu_external_texture_backend_probe/local_crates/wgpu-types-27.0.1`
  contain the isolated candidate patch only under `temp/`. Validation:
  `cargo check --manifest-path temp/c1_wgpu_external_texture_backend_probe/local_crates/wgpu-27.0.1/Cargo.toml --target wasm32-unknown-unknown --no-default-features --features fragile-send-sync-non-atomic-wasm,webgpu,wgsl --target-dir temp/c1_wgpu_external_texture_backend_probe/local_crates/target`.
  The production Cargo graph and active Bevy renderer remain unchanged.
- [x] Validate patched public API usage with a browser video source.
  Evidence:
  `temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_api_usage/src/lib.rs`
  creates a patched `wgpu::ExternalTextureDescriptor` with
  `wgpu::ExternalImageSource::HTMLVideoElement(video)` and calls
  `device.create_external_texture(&descriptor, &[])`. Validation:
  `cargo check --manifest-path temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_api_usage/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_api_usage/target`.
- [x] Validate a patched local `wgpu` proof canvas before attempting the Bevy
  proof canvas.
  Evidence:
  `temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_canvas_probe/src/lib.rs`
  creates a WebGPU canvas surface with the isolated patched `wgpu`, imports a
  hidden `HtmlVideoElement` through `ExternalTextureDescriptor`, binds it as
  `BindingResource::ExternalTexture`, samples `texture_external`, copies the
  rendered surface texture to a diagnostic readback buffer, and returns
  non-empty GPU evidence. Validation:
  `cargo check --manifest-path temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_canvas_probe/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_canvas_probe/target`,
  `cargo build --manifest-path temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_canvas_probe/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_canvas_probe/target`,
  `/Users/jean-ericgodard/.cargo/bin/wasm-bindgen --target web --out-dir temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_canvas_probe/pkg temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_canvas_probe/target/wasm32-unknown-unknown/debug/c1_patched_wgpu_canvas_probe.wasm`,
  and
  `node temp/c1_wgpu_external_texture_backend_probe/patched_wgpu_canvas_probe_runner.mjs`.
  Report:
  `temp/c1_wgpu_external_texture_backend_probe/reports/patched_wgpu_canvas_probe_report.json`
  is `ok: true` with `readback_non_empty_ratio: 1`,
  `readback_luma_range: 754`, hidden video visibility `false`, and zero page
  errors. The headless screenshot path remains non-authoritative for this
  WebGPU canvas because it reports a transparent capture while the GPU readback
  proves the rendered surface content.
- [x] Prove one imported video external texture is sampled in a WebGPU/Bevy
  proof canvas without a JavaScript side renderer or visible DOM overlay.
  Evidence:
  `temp/c1_wgpu_external_texture_backend_probe/patched_bevy_render_device_probe/src/lib.rs`
  uses an isolated Bevy `RenderDevice` proof canvas. The proof creates the
  WebGPU surface, converts the patched `wgpu::Device` into Bevy's
  `RenderDevice`, creates the bind-group layout, pipeline, sampler, bind group,
  command encoder, and readback buffer through Bevy render wrappers, imports the
  hidden `HtmlVideoElement` as `GPUExternalTexture`, binds it as
  `BindingResource::ExternalTexture`, samples `texture_external`, and presents
  through the WebGPU canvas. The only direct `wgpu_device()` access is the
  external-texture creation call because Bevy 0.18.1 does not yet wrap
  `create_external_texture`. Validation:
  `cargo check --manifest-path temp/c1_wgpu_external_texture_backend_probe/patched_bevy_render_device_probe/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/c1_wgpu_external_texture_backend_probe/patched_bevy_render_device_probe/target`,
  `cargo build --manifest-path temp/c1_wgpu_external_texture_backend_probe/patched_bevy_render_device_probe/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/c1_wgpu_external_texture_backend_probe/patched_bevy_render_device_probe/target`,
  `temp/c1_wgpu_external_texture_backend_probe/wasm_bindgen_cli_0_2_106/bin/wasm-bindgen --target web --out-dir temp/c1_wgpu_external_texture_backend_probe/patched_bevy_render_device_probe/pkg temp/c1_wgpu_external_texture_backend_probe/patched_bevy_render_device_probe/target/wasm32-unknown-unknown/debug/c1_patched_bevy_render_device_probe.wasm`,
  and
  `node temp/c1_wgpu_external_texture_backend_probe/patched_bevy_render_device_probe_runner.mjs`.
  Report:
  `temp/c1_wgpu_external_texture_backend_probe/reports/patched_bevy_render_device_probe_report.json`
  is `ok: true` with `pipeline_owner: "bevy_render_device"`,
  `readback_non_empty_ratio: 1`, `readback_luma_range: 755`, hidden video
  visibility `false`, and zero page errors. The headless screenshot path remains
  non-authoritative for this WebGPU canvas because it reports a transparent
  capture while GPU readback proves the rendered surface content.
- [x] Promote only the proven minimal backend path into the canonical Bevy/wgpu
  owners after the isolated proof passes, then update maps and persistent tests
  in the same promotion step.
  Evidence: `atome/renderers/wgpu-web-external-texture/` owns the maintained
  `wgpu 27.0.1` / `wgpu-types 27.0.1` backend fork, with production Cargo
  wiring in `atome/renderers/bevy-core/Cargo.toml` and
  `platforms/web/bevy-renderer/Cargo.toml`. The fork is documented in
  `atome/renderers/wgpu-web-external-texture/README.md` and is guarded by
  `tests/eve/bevy_project_renderer_guards.test.mjs`,
  `platforms/web/bevy-renderer/src/tests.rs`, `maps/CODEMAP.md`,
  `maps/API_MAP.md`, and `maps/ARCHITECTURE_MAP.md`. Validation:
  `cargo check --manifest-path atome/renderers/bevy-core/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/atome-bevy-core-c1-promotion-target`,
  `cargo check --manifest-path platforms/web/bevy-renderer/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/platforms-web-bevy-renderer-c1-promotion-target`,
  `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs`,
  `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml --target-dir temp/platforms-web-bevy-renderer-c1-test-target`, and
  `./platforms/web/bevy-renderer/build.sh` all pass. At this C1 checkpoint the
  product live route was kept non-final until C2 exposed the real track API and
  draw-frame import path.

### C2 - Product video-track API after backend proof

- [x] Define an `AtomeVideoTrack` payload or equivalent canonical track payload.
  Evidence: `atome/renderers/bevy-core/src/types.rs` defines
  `AtomeVideoTrack` with canonical id, source, logical position, logical size,
  and layer fields plus validation that rejects empty source/id, non-finite
  positions, and invalid sizes. Validation:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml atome_video_track --target-dir temp/atome-bevy-core-c2-track-test-target`,
  `cargo check --manifest-path platforms/web/bevy-renderer/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/platforms-web-bevy-renderer-c1-promotion-target`,
  and `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs`
  pass. The guard still rejects wasm video-track exports until the product draw
  path exists.
- [x] Implement a project video path that imports external textures in the frame
  where they are drawn.
  Evidence: `atome/renderers/bevy-core/src/video_external_texture.rs` defines
  the Bevy ECS component plus quad mesh helpers, video spawn/resource/transform
  now route through the external-texture mesh path, and
  `atome/renderers/bevy-core/src/video_texture.rs` was removed from the active
  route. Browser/WASM import and draw integration lives in
  `atome/renderers/bevy-core/src/video_external_web.rs`, which creates
  `GPUExternalTexture` resources with `create_external_texture`, binds them as
  `BindingResource::ExternalTexture`, records `bevy.video.external.import` and
  `bevy.video.external.draw`, and clears prepared external textures after the
  render pass. The shader
  `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` samples
  `texture_external` with `textureSampleBaseClampToEdge`. Validation:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml --target-dir temp/atome-bevy-core-c2-external-test-target-current`,
  `cargo check --manifest-path atome/renderers/bevy-core/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/atome-bevy-core-c2-external-wasm-target-current`,
  `cargo check --manifest-path platforms/web/bevy-renderer/Cargo.toml --target wasm32-unknown-unknown --target-dir temp/platforms-web-bevy-renderer-c1-promotion-target`,
  `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml --target-dir temp/platforms-web-bevy-renderer-c1-test-target`,
  `./platforms/web/bevy-renderer/build.sh`,
  `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs`,
  and
  `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs tests/eve/unified_rendering_contract.test.mjs tests/eve/project_scene_unified_rendering_contract.test.mjs`
  pass. Source audits find no active `copy_external_image_to_texture`,
  `AtomeVideoTexture`, or `video_texture` product module references outside
  negative guards and historical documentation.
- [x] Define or expose:
  `apply_atome_bevy_video_track(track)`,
  `remove_atome_bevy_video_track(id)`, and
  `update_atome_bevy_video_transform(id, transform)`.
  Evidence: `platforms/web/bevy-renderer/src/exports.rs` exposes all three
  wasm functions and decodes them into real `AtomeRenderOp::VideoTrackApply`,
  `AtomeRenderOp::VideoTrackRemove`, and
  `AtomeRenderOp::VideoTrackTransform` operations. Shared Rust handling lives
  in `atome/renderers/bevy-core/src/render_ops.rs`: `apply_video_track`
  validates `AtomeVideoTrack`, spawns or updates only video entities, keeps the
  external-texture component/mesh path active, updates source, transform, and
  layer, and rejects non-video transform targets. Generated exports are present
  in `atome/src/wasm/squirrel_bevy_renderer.js`,
  `atome/src/wasm/squirrel_bevy_renderer.d.ts`, and
  `atome/src/wasm/squirrel_bevy_renderer_bg.wasm.d.ts`. Validation:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml video --target-dir temp/atome-bevy-core-c2-video-track-test-target`,
  `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml video_backend_capabilities_report_external_texture_path_with_track_api --target-dir temp/platforms-web-bevy-renderer-c2-track-test-target`,
  `./platforms/web/bevy-renderer/build.sh`, and
  `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs` pass.

### C3 - Phase C validation

- [x] Validate with `cargo check`, `cargo test`,
  `./platforms/web/bevy-renderer/build.sh`,
  `npm run test:run -- tests/eve/selected_project_media_playback_runtime.test.mjs`,
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs`, and
  `npm run check:syntax`.
  Evidence: `cargo check --manifest-path
  atome/renderers/bevy-core/Cargo.toml --target wasm32-unknown-unknown`,
  `cargo check --manifest-path platforms/web/bevy-renderer/Cargo.toml --target
  wasm32-unknown-unknown`, full `cargo test` suites for
  `atome/renderers/bevy-core` (16 passed) and
  `platforms/web/bevy-renderer` (10 passed),
  `./platforms/web/bevy-renderer/build.sh`,
  `npm run test:run --
  tests/eve/selected_project_media_playback_runtime.test.mjs` (9 passed),
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs` (14 passed),
  `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs` (4
  passed), and `npm run check:syntax` (718 files) pass. Visual validation also
  passes with
  `ATOME_PLAYWRIGHT_HEADLESS=0 BEVY_FLUENCY_VIDEO_STREAMS=1
  BEVY_FLUENCY_REPORT_NAME=bevy_project_video_visual_probe node
  temp/bevy_project_video_visual_probe.mjs`; the report at
  `temp/probe_reports/bevy_project_video_visual_probe/report.json` shows one
  Bevy project canvas, no visible DOM project media/video overlay,
  `live_video_backend: gpu_external_texture_texture_external`,
  `video_track_api_exposed: true`, `texture_external_sampling: true`,
  `backend_blocker: none`,
  `screenshot_analysis.non_empty_ratio: 1`, and no page errors. The captured
  canvas at
  `temp/probe_reports/bevy_project_video_visual_probe/project_canvas.png` shows
  the imported video rendered inside `canvas#eve_surface_project`.

## Phase D - Multi-track compositing and timeline preparation

Phase D starts after Phase C3 validated the backend external texture path and
the real product track API in the browser/runtime path.

- [x] Support z-index per video track.
  Evidence: `AtomeVideoExternalTexture` now carries the current compositor
  layer, video mesh entities opt out of automatic 2D batching, `apply_layer`
  updates both Bevy transform depth and the extracted video layer, and the
  external-video RenderApp queue sorts `texture_external` phase items by that
  layer. Validation:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml --target-dir temp/atome-bevy-core-c2-video-track-test-target`
  passed 17 tests; `cargo check --manifest-path
  atome/renderers/bevy-core/Cargo.toml --target wasm32-unknown-unknown
  --target-dir temp/atome-bevy-core-c2-external-wasm-target-current`
  passed; `./platforms/web/bevy-renderer/build.sh` rebuilt the wasm;
  `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml
  video_backend_capabilities_report_external_texture_path_with_track_api
  --target-dir temp/platforms-web-bevy-renderer-c3-capability-status-target`
  passed; `npm run test:run --
  tests/eve/bevy_project_renderer_guards.test.mjs
  tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs
  tests/eve/bevy_projection_adapter_contract.test.mjs
  tests/eve/bevy_web_renderer_runtime_contract.test.mjs` passed 34 tests.
  Browser visual proof:
  `ATOME_PLAYWRIGHT_HEADLESS=0
  ATOME_PROJECT_SCENE_VIDEO_A=tests/fixtures/media/2026-03-20-14-06-03.mp4
  ATOME_PROJECT_SCENE_VIDEO_B=tests/fixtures/media/WhatsApp_Video.mp4
  BEVY_FLUENCY_REPORT_NAME=bevy_project_video_zindex_probe node
  temp/bevy_project_video_zindex_probe.mjs` passed with report
  `temp/probe_reports/bevy_project_video_zindex_probe/report.json`,
  `ok:true`, two `ExternalTexture` draw ids in both stack states, draw order
  inverted after z-index inversion, `changed_ratio: 0.197396`,
  `mean_abs_delta: 12.457`, one `canvas#eve_surface_project`, no visible DOM
  video/project media nodes, `gpu_external_texture_import:true`,
  `texture_external_sampling:true`, and no page errors. Captures:
  `temp/probe_reports/bevy_project_video_zindex_probe/second_video_on_top.png`
  and
  `temp/probe_reports/bevy_project_video_zindex_probe/first_video_on_top.png`.
- [x] Support opacity per video track.
  Evidence: `AtomeRenderNode`, `AtomeStylePatch`, and `AtomeVideoTrack` now
  carry normalized opacity through the browser Bevy projection and the shared
  Rust core. `AtomeVideoExternalTexture` stores the current per-track opacity,
  `video_external_web.rs` binds a 16-byte `vec4<f32>` uniform per external
  video draw, and `video_external.wgsl` uses that uniform as the source alpha
  for the source-over blend. Validation passed:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml
  --target-dir temp/atome-bevy-core-d-video-opacity-test-target` (18 tests),
  `cargo check --manifest-path atome/renderers/bevy-core/Cargo.toml --target
  wasm32-unknown-unknown --target-dir
  temp/atome-bevy-core-d-video-opacity-wasm-target`,
  `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml
  --target-dir temp/platforms-web-bevy-renderer-c3-capability-status-target`
  (11 tests), `./platforms/web/bevy-renderer/build.sh`, and
  `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs
  tests/eve/bevy_projection_adapter_contract.test.mjs
  tests/eve/bevy_web_renderer_runtime_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs
  tests/eve/unified_rendering_contract.test.mjs` (5 files, 36 tests).
  Browser visual validation:
  `ATOME_PLAYWRIGHT_HEADLESS=0
  ATOME_PROJECT_SCENE_VIDEO_A=tests/fixtures/media/2026-03-20-14-06-03.mp4
  ATOME_PROJECT_SCENE_VIDEO_B=tests/fixtures/media/WhatsApp_Video.mp4
  BEVY_FLUENCY_REPORT_NAME=bevy_project_video_opacity_probe node
  temp/bevy_project_video_opacity_probe.mjs` passed with report
  `temp/probe_reports/bevy_project_video_opacity_probe/report.json`,
  `ok:true`, two `ExternalTexture` draw ids in opaque and translucent states,
  `opacity:0.35` visible in projection/runtime state, one
  `canvas#eve_surface_project`, no visible DOM video/project media nodes,
  `gpu_external_texture_import:true`, `texture_external_sampling:true`,
  `changed_ratio:0.175455`, `mean_abs_delta:8.604`, and no page errors.
  Captures:
  `temp/probe_reports/bevy_project_video_opacity_probe/top_video_opaque.png`
  and
  `temp/probe_reports/bevy_project_video_opacity_probe/top_video_opacity_035.png`.
- [x] Support normal blend mode.
  Evidence: the external-video pipeline uses Bevy
  `BlendState::ALPHA_BLENDING` and the per-video opacity uniform as source
  alpha, which is the expected source-over/normal composition path. Browser
  visual validation with a non-video Atome behind the video passed:
  `ATOME_PLAYWRIGHT_HEADLESS=0
  ATOME_PROJECT_SCENE_VIDEO=tests/fixtures/media/WhatsApp_Video.mp4
  BEVY_FLUENCY_REPORT_NAME=bevy_project_video_normal_blend_probe node
  temp/bevy_project_video_normal_blend_probe.mjs` produced
  `temp/probe_reports/bevy_project_video_normal_blend_probe/report.json`
  with `ok:true`, no page errors, one `canvas#eve_surface_project`, no visible
  DOM video/project media nodes, `gpu_external_texture_import:true`,
  `texture_external_sampling:true`, `shape_node_ok:true`,
  `video_node_ok:true`, `external_draw_ok:true`, `changed_ratio:0.1885`, and
  `mean_abs_delta:14.409`. Captures:
  `temp/probe_reports/bevy_project_video_normal_blend_probe/video_opaque_over_shape.png`
  and
  `temp/probe_reports/bevy_project_video_normal_blend_probe/video_normal_blend_over_shape.png`.
- [x] Support add, multiply, and screen blend modes if the canonical compositor
  contract supports them without fallback paths.
  Evidence: the current canonical Bevy project route supports only
  normal/source-over without a fallback compositor. Advanced `add`, `multiply`,
  and `screen` modes are therefore explicitly unavailable rather than silently
  rendered as normal. `bevy_projection_adapter.js` now rejects unsupported
  blend modes at initial payload mapping and style-patch mapping with
  `bevy_projection_blend_mode_unsupported:<id>:<mode>`. Validation:
  `npm run test:run -- tests/eve/bevy_projection_adapter_contract.test.mjs
  tests/eve/bevy_project_renderer_guards.test.mjs
  tests/eve/bevy_web_renderer_runtime_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs
  tests/eve/unified_rendering_contract.test.mjs` passed with 5 files and 37
  tests, including explicit rejection checks for `add`, `multiply`, and
  `screen`.
- [x] Support crop/UV rectangles.
  Evidence: `RenderAtom` now carries optional media `uvRect` and pixel
  `sourceRect`/`cropRect` crop payloads as canonical content, the Virtual Scene
  diff keeps previous resource content so crop removal can emit `uv_rect:null`,
  and `bevy_projection_adapter.js` maps normalized `uvRect` plus pixel
  `sourceRect`/`cropRect` into Bevy `uv_rect`. Rust `AtomeRenderNode`,
  `AtomeResourcePatch`, and `AtomeVideoTrack` carry optional crop data, while
  `AtomeVideoExternalTexture` and the video mesh helpers rebuild UVs for the
  cropped source rectangle without a DOM overlay or side renderer. Validation:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml
  --target-dir temp/atome-bevy-core-d-video-crop-uv-test-target` passed with 21
  tests; `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml
  --target-dir temp/platforms-web-bevy-renderer-d-video-crop-uv-test-target`
  passed with 11 tests; `cargo check --manifest-path
  atome/renderers/bevy-core/Cargo.toml --target wasm32-unknown-unknown
  --target-dir temp/atome-bevy-core-d-video-crop-uv-wasm-target` passed;
  `./platforms/web/bevy-renderer/build.sh` regenerated the browser WASM; and
  `npm run test:run -- tests/eve/bevy_projection_adapter_contract.test.mjs
  tests/eve/virtual_scene_phase1_contract.test.mjs
  tests/eve/unified_rendering_contract.test.mjs
  tests/eve/bevy_web_renderer_runtime.test.mjs
  tests/eve/bevy_web_renderer_runtime_contract.test.mjs
  tests/eve/bevy_project_renderer_guards.test.mjs` passed with 6 files and 53
  tests. Browser visual validation passed with
  `ATOME_PLAYWRIGHT_HEADLESS=0
  BEVY_FLUENCY_REPORT_NAME=bevy_project_video_crop_uv_probe node
  temp/bevy_project_video_crop_uv_probe.mjs`, producing
  `temp/probe_reports/bevy_project_video_crop_uv_probe/report.json` with
  `ok:true`, no page errors, one `canvas#eve_surface_project`, no visible DOM
  project media nodes, `gpu_external_texture_import:true`,
  `texture_external_sampling:true`, external draw for the video id, detected
  colored video bounds in both captures, `full_top_left_is_red:true`,
  `cropped_top_left_is_green:true`, `green_delta:73.12`, `red_delta:-56.51`,
  `changed_ratio:0.5`, and `mean_abs_delta:43.208`. Captures:
  `temp/probe_reports/bevy_project_video_crop_uv_probe/video_full_uv.png` and
  `temp/probe_reports/bevy_project_video_crop_uv_probe/video_right_half_uv.png`.
- [x] Support transform per track.
  Evidence: `RenderAtom` and the Virtual Scene already owned canonical
  `scaleX`, `scaleY`, `rotation`, `originX`, and `originY`; the Bevy projection
  adapter now forwards those values as `scale`, `rotation`, and `origin` in
  initial node payloads and transform patches. Direct live gesture transform
  patches preserve the same canonical transform fields without committing
  durable mutations during `pointermove`. Rust `AtomeRenderNode`,
  `AtomeTransformPatch`, `AtomeVideoTrack`, `AtomeVideoTransform`, and
  `AtomeVideoTransformPatch` now carry the transform fields with serde defaults,
  and Bevy stores them as a disposable ECS `AtomeLocalTransform` while applying
  rotation and scale through `Transform` using the canonical logical bounds.
  Surface resize and video resource updates preserve the derived local
  transform, so translate, resize, scale, and rotation remain in one Bevy route
  without DOM media overlays or side compositors. Validation:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml
  --target-dir temp/atome-bevy-core-d-video-transform-test-target` passed with
  22 tests; `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml
  --target-dir temp/platforms-web-bevy-renderer-d-video-transform-test-target`
  passed with 11 tests; `cargo check --manifest-path
  atome/renderers/bevy-core/Cargo.toml --target wasm32-unknown-unknown
  --target-dir temp/atome-bevy-core-d-video-transform-wasm-target` passed;
  `./platforms/web/bevy-renderer/build.sh` regenerated the browser WASM; and
  `npm run test:run -- tests/eve/bevy_projection_adapter_contract.test.mjs
  tests/eve/bevy_web_renderer_runtime_contract.test.mjs
  tests/eve/project_scene_gesture_performance.test.mjs
  tests/eve/bevy_project_renderer_guards.test.mjs
  tests/eve/virtual_scene_phase1_contract.test.mjs` passed with 5 files and 53
  tests. Browser visual validation passed with
  `ATOME_PLAYWRIGHT_HEADLESS=0
  BEVY_FLUENCY_REPORT_NAME=bevy_project_video_transform_probe node
  temp/bevy_project_video_transform_probe.mjs`, producing
  `temp/probe_reports/bevy_project_video_transform_probe/report.json` with
  `ok:true`, no page errors, one `canvas#eve_surface_project`, no visible DOM
  project media nodes, `gpu_external_texture_import:true`,
  `texture_external_sampling:true`, external draw for the video id, baseline
  colored video bounds `180x100`, transformed colored bounds `254x146`,
  `transformed_width_growth:1.411`, `transformed_height_growth:1.46`,
  `changed_ratio:0.276661`, and `mean_abs_delta:27.231`. Captures:
  `temp/probe_reports/bevy_project_video_transform_probe/video_transform_baseline.png`
  and
  `temp/probe_reports/bevy_project_video_transform_probe/video_transform_scaled_rotated.png`.
- [x] Prepare timeline fields: start, duration, trim in, trim out, offset, speed,
  and loop.
  Evidence: `RenderAtom` now normalizes video `content.timeline` from canonical
  Atome properties with `start`, `duration`, `trimIn`, `trimOut`, `offset`,
  `speed`, and `loop`; the Virtual Scene carries those fields through resource
  diffs; the Bevy projection adapter validates and forwards normalized video
  timeline payloads; and `bevy_video_decode_source_runtime.js` applies the
  timeline to the hidden decode element that feeds Bevy `GPUExternalTexture`,
  including trim seek, trim end enforcement, offset, playback speed, and loop
  inside the trimmed source window. Project playback now passes target
  timelines and playheads into `setBevyVideoDecodePlayback(...)` without
  creating a second renderer or visible DOM media route. Validation:
  `npm run test:run -- tests/eve/video_timeline_fields_contract.test.mjs
  tests/eve/bevy_video_decode_source_runtime.test.mjs
  tests/eve/project_video_timeline_playback_contract.test.mjs
  tests/eve/bevy_projection_adapter_contract.test.mjs
  tests/eve/virtual_scene_phase1_contract.test.mjs
  tests/eve/bevy_web_renderer_runtime_contract.test.mjs
  tests/eve/bevy_web_renderer_runtime.test.mjs
  tests/eve/bevy_project_renderer_guards.test.mjs
  tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs
  tests/eve/selected_project_media_playback_runtime.test.mjs` passed with 10
  files and 85 tests; `npm run check:syntax` passed with 719 files;
  `git diff --check` passed; and the browser visual probe passed with
  `ATOME_PLAYWRIGHT_HEADLESS=0
  BEVY_FLUENCY_REPORT_NAME=bevy_project_video_timeline_probe node
  temp/bevy_project_video_timeline_probe.mjs`. The probe report at
  `temp/probe_reports/bevy_project_video_timeline_probe/report.json` is
  `ok:true`, has no page errors, uses one `canvas#eve_surface_project`, has
  zero visible project media nodes and one hidden decode video, reports
  `gpu_external_texture_import:true` and `texture_external_sampling:true`,
  proves trim by seeking to `currentTime:2.049999` with detected blue video
  bounds `210x118` and sample RGB `90/103/255`, and proves speed by
  `playbackRate:2`, `currentTime:2.463236`, detected yellow video bounds
  `210x118`, and sample RGB `254/254/0`. Captures:
  `temp/probe_reports/bevy_project_video_timeline_probe/timeline_trim_blue.png`
  and
  `temp/probe_reports/bevy_project_video_timeline_probe/timeline_speed_after.png`.
- [x] Prove 1, 2, 4, and 10 project video streams with the fluency probe.
  Evidence: `temp/bevy_canvas_fluency_probe.mjs` now writes
  `project_canvas.png` beside each JSON report and validates the real project
  canvas visually with PNG metrics, DOM media budget, hidden decode source
  count, and canvas DPR checks. Chrome local WebGPU visual runs passed:
  `ATOME_PLAYWRIGHT_HEADLESS=0 BEVY_FLUENCY_VIDEO_STREAMS=1
  BEVY_FLUENCY_REPORT_NAME=bevy_canvas_fluency_probe_video1_webgpu node
  temp/bevy_canvas_fluency_probe.mjs`,
  `ATOME_PLAYWRIGHT_HEADLESS=0 BEVY_FLUENCY_VIDEO_STREAMS=2
  BEVY_FLUENCY_REPORT_NAME=bevy_canvas_fluency_probe_video2_webgpu node
  temp/bevy_canvas_fluency_probe.mjs`,
  `ATOME_PLAYWRIGHT_HEADLESS=0 BEVY_FLUENCY_VIDEO_STREAMS=4
  BEVY_FLUENCY_REPORT_NAME=bevy_canvas_fluency_probe_video4_webgpu node
  temp/bevy_canvas_fluency_probe.mjs`, and
  `ATOME_PLAYWRIGHT_HEADLESS=0 BEVY_FLUENCY_VIDEO_STREAMS=10
  BEVY_FLUENCY_REPORT_NAME=bevy_canvas_fluency_probe_video10_webgpu_final node
  temp/bevy_canvas_fluency_probe.mjs`. Reports:
  `temp/probe_reports/bevy_canvas_fluency_probe_video1_webgpu/report.json`,
  `temp/probe_reports/bevy_canvas_fluency_probe_video2_webgpu/report.json`,
  `temp/probe_reports/bevy_canvas_fluency_probe_video4_webgpu/report.json`,
  and
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_webgpu_final/report.json`
  are all `ok:true`, have no page errors, use one `canvas#eve_surface_project`,
  have zero visible project media nodes, hidden decode video counts matching
  1/2/4/10 streams, zero CPU readbacks, zero 2D canvas draws, zero video copies,
  DPR-matched canvas pixels, and non-flat canvas screenshots. Measured
  FPS/p95/p99/RAF gaps: 1 stream `59.984 fps`, `p95 18.5 ms`,
  `p99 18.7 ms`, `over_34_ms 0`; 2 streams `59.956 fps`, `p95 18.7 ms`,
  `p99 18.7 ms`, `over_34_ms 0`; 4 streams `60.020 fps`,
  `p95 18.6 ms`, `p99 18.7 ms`, `over_34_ms 0`; 10 streams
  `59.952 fps`, `p95 18.6 ms`, `p99 18.7 ms`, `over_34_ms 0`,
  pointer `p95 1.5 ms`. This proves the stream-count/visual route. The later
  accepted browser-floor validation below closes the final strict p95 mismatch.
- [x] Acceptance: 10 visible streams, playback p95 accepted at the measured
  local browser RAF floor, no stable-playback RAF gap over 34 ms, drag/resize
  during playback p95 <= 18 ms, and no quality loss compared to canvas DPI.
  Current evidence: the strict Chrome system run
  `ATOME_PLAYWRIGHT_HEADLESS=0 BEVY_FLUENCY_BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  BEVY_FLUENCY_VIDEO_STREAMS=10
  BEVY_FLUENCY_REPORT_NAME=bevy_canvas_fluency_probe_video10_google_chrome_acceptance
  node temp/bevy_canvas_fluency_probe.mjs` passed with code 0. Report:
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_google_chrome_acceptance/report.json`.
  The report is `ok:true`, has no page errors, `stream_count:10`,
  `video_count:10`, `hidden_decode_videos:10`, zero visible project media DOM
  nodes, zero CPU readbacks, zero 2D canvas draws, zero video copies, one
  `canvas#eve_surface_project`, `gpu_external_texture_import:true`,
  `texture_external_sampling:true`, and a non-flat project-canvas screenshot at
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_google_chrome_acceptance/project_canvas.png`.
  Metrics: average `60.002 fps`, frame `p95 17.7 ms`, frame `p99 17.7 ms`,
  stable-playback `p95 17.7 ms`, stable-playback `over_34_ms 0`,
  pointer/drag `p95 2.2 ms`, screenshot `non_empty_ratio:1`,
  `luma_range:744`, `color_bucket_count:489`, and DPR checks pass.
  However the final-validation reruns are not stable enough to close this task:
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_final_validation_stable6s_unthrottled/report.json`
  is visually `ok:true`, keeps zero visible project media DOM nodes, zero CPU
  readbacks, zero 2D canvas draws, and zero video copies, but reports frame
  `p95 18.3 ms`; the short rerun
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_final_validation_unthrottled_short/report.json`
  reports frame `p95 18.5 ms`. Application counters during the long run are
  low (`projection_runtime max 2.5 ms`, `bevy_projection max 1.1 ms`,
  pointer `p95 1.3 ms`), so the then-open work was the last RAF/frame-p95
  stability gap, not the WebGPU route, DOM budget, readback path, or drag
  dispatch path.
  Additional focused 10-stream visual/performance evidence after playback
  scheduling repair: `bevy_web_presentation_runtime.js` coalesces same-tick
  hidden-video frame notifications into one latest-frame WASM notify with a
  redraw fallback only when no valid notify is sent;
  `bevy_video_decode_source_runtime.js` uses
  `requestVideoFrameCallback` as the primary active-playback pump and keeps RAF
  as fallback only; and `platforms/web/bevy-renderer/src/lib.rs` avoids the
  previous extra wake after applying video-frame redraw notifications. Targeted
  validation passed with `npm run test:run --
  tests/eve/bevy_project_renderer_guards.test.mjs`, `cargo test
  --manifest-path platforms/web/bevy-renderer/Cargo.toml --target-dir
  temp/platforms-web-bevy-renderer-video-wake-test-target
  exported_video_frame_notification_requests_redraw`, and
  `./platforms/web/bevy-renderer/build.sh`. Visual probe validation passed with
  all 10 expected video regions non-flat and visible in
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_blob_active_grid_mapped/project_canvas.png`,
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_rvfc_only_mapped/project_canvas.png`,
  and
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_solid_bg_mapped/project_canvas.png`.
  The diagnostic probe now imports one real video, creates nine page-local
  `blob:` clones for deterministic local playback, validates the centered
  `0.5` visual-region mapping region by region, and records browser scheduling
  state, RAF callback delay, `performance.now()` frame intervals, and long-task
  entries. Wake pressure dropped from the baseline
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_blob_active_grid_mapped/report.json`
  (`wake_calls 6433`, video notifications `4703`, frame `p95 18.3 ms`) to
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_rvfc_only_mapped/report.json`
  (`wake_calls 793`, video notifications `420`, frame `p95 18.1 ms`,
  `over_34_ms 0`, zero long tasks, zero CPU readbacks, zero 2D canvas draws,
  zero video copies). The stricter solid-background visual run
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_solid_bg_mapped/report.json`
  keeps the 10 videos clearly visible with the same zero readback/copy budget,
  but reports frame `p95 18.4 ms`, so this acceptance checkbox stayed open
  until the browser-floor decision below.
  Additional root-cause evidence: a Web Bevy `PresentMode::Fifo` experiment was
  built and measured in
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_fifo_acceptance/report.json`,
  but did not improve the final p95 (`18.3 ms`), so that source change was not
  retained. Hidden decode videos were then tightened from `opacity:0.001` to
  `opacity:0` so the browser has no reason to composite the disposable decode
  DOM resources; validation passed with
  `npm run test:run -- tests/eve/bevy_video_decode_source_runtime.test.mjs
  tests/eve/bevy_project_renderer_guards.test.mjs`. The Chrome visual probe
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_decode_opacity0_acceptance/report.json`
  remains visually `ok:true` with 10 visible video regions, zero page errors,
  zero long tasks, zero CPU readbacks, zero 2D canvas draws, zero video copies,
  DPR-matched canvas pixels, and lower wake pressure (`wake_calls 731`, video
  notifications `361`), but frame p95 is still `18.3 ms`. A blank Chrome RAF
  floor probe with the same browser executable, viewport, and launch flags,
  recorded at
  `temp/probe_reports/browser_raf_floor_chrome/report.json`, reports no eVe,
  no Bevy, no WebGPU scene, and still has RAF frame `p95 18.1 ms`,
  `p99 18.5 ms`, and `over_24_ms 0`. The remaining acceptance gap is therefore
  below the measured local Chrome RAF floor, not in the current project video
  route, copy/readback budget, visual output, drag path, or hidden DOM video
  compositing contract.
  Latest focused visual validation after disabling production-default
  high-frequency video diagnostics:
  `ATOME_PLAYWRIGHT_HEADLESS=0
  BEVY_FLUENCY_BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  BEVY_FLUENCY_VIDEO_STREAMS=10 BEVY_FLUENCY_STABLE_MS=6000
  BEVY_FLUENCY_REPORT_NAME=bevy_canvas_fluency_probe_video10_video_frame_diag_opt_acceptance
  node temp/bevy_canvas_fluency_probe.mjs` passed with code 0. Report:
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_video_frame_diag_opt_acceptance/report.json`;
  capture:
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_video_frame_diag_opt_acceptance/project_canvas.png`.
  It is visually `ok:true` with 10 non-flat video regions, one project canvas,
  zero visible project media DOM nodes, 10 hidden decode videos, no page/console
  errors, no long tasks, zero CPU readbacks, zero 2D canvas draws, zero video
  copies, DPR-matched canvas pixels, `average_fps 60.002`, frame `p50 16.7 ms`,
  frame `p95 18.1 ms`, frame `p99 18.5 ms`, `over_24_ms 0`, `over_34_ms 0`,
  pointer `p95 1.4 ms`, `wake_calls 750`, and video notifications `380`.
  `external_render_events:false` and `video_frame_events:false` confirm the
  probe measured the production-default path without high-frequency diagnostic
  event logging. This did not satisfy the original strict `p95 <= 18 ms` gate,
  but it contributes to the accepted browser-floor-equivalent evidence.
  Follow-up controlled RAF-floor diagnostics added
  `temp/browser_raf_floor_probe.mjs` and kept the framework untouched. Blank
  Google Chrome runs with the same executable and viewport report frame
  `p95 18.3 ms` with default flags
  (`temp/probe_reports/browser_raf_floor_probe_default_rerun/report.json`),
  `p95 18.3 ms` without `Vulkan,UseSkiaRenderer`
  (`temp/probe_reports/browser_raf_floor_probe_no_vulkan_skia/report.json`),
  and `p95 18.2 ms` with `--use-angle=metal`
  (`temp/probe_reports/browser_raf_floor_probe_angle_metal/report.json`).
  Playwright's default bundled Chromium without the system Chrome executable
  also reports `p95 18.3 ms`
  (`temp/probe_reports/browser_raf_floor_probe_playwright_chromium_default/report.json`).
  Headless bundled Chromium still reports `p95 18.2 ms`
  (`temp/probe_reports/browser_raf_floor_probe_headless_default/report.json`),
  so the gap is not limited to the headed system-Chrome display path.
  The probe now reports stable-playback frame windows directly from
  `temp/bevy_fluency_probe/metrics.mjs` instead of relying on ad hoc timeline
  parsing. The latest Bevy visual recheck
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_stable_window_metrics/report.json`
  and capture
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_stable_window_metrics/project_canvas.png`
  are visually `ok:true` with 10 detected video regions, zero visible project
  media DOM nodes, 10 hidden decode videos, no page/console errors, no long
  tasks, zero CPU readbacks, zero 2D canvas draws, zero video copies,
  DPR-matched canvas pixels, `average_fps 60.002`, pointer `p95 1.3 ms`,
  global frame `p95 18.2 ms`, stable playback after pointer +1500 ms
  `p95 18.1 ms`, last 6000 ms `p95 18.2 ms`, and zero frames over 24/34/50 ms.
  User decision on 2026-06-13: since the application p95 is at the measured
  local browser RAF floor and all visual/readback/copy/long-frame gates pass,
  this is acceptable and validated for this environment. The original strict
  `p95 <= 18 ms` number remains recorded as the initial target, but the final
  accepted gate is browser-floor-equivalent p95 with zero frames over 24/34/50
  ms and conforming Bevy-canvas visual output.
  Post-build validation after marking the backend final:
  `ATOME_PLAYWRIGHT_HEADLESS=0
  BEVY_FLUENCY_BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  BEVY_FLUENCY_VIDEO_STREAMS=10 BEVY_FLUENCY_STABLE_MS=6000
  BEVY_FLUENCY_REPORT_NAME=bevy_canvas_fluency_probe_video10_final_accepted_contract_chrome_stable6s
  node temp/bevy_canvas_fluency_probe.mjs` passed with code 0. Report:
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_final_accepted_contract_chrome_stable6s/report.json`;
  capture:
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_final_accepted_contract_chrome_stable6s/project_canvas.png`.
  The report is `ok:true` with `stream_count:10`, `video_count:10`, one
  `canvas#eve_surface_project`, no page/console errors, schema
  `atome.bevy.web.video_backend.v6`, `current_backend_final:true`,
  `backend_blocker:none`, zero CPU readbacks, zero 2D canvas draws, zero video
  copies, `average_fps 60.006`, global frame `p95 18.2 ms`, stable playback
  after pointer +1500 ms `p95 18.2 ms`, last 6000 ms `p95 18.2 ms`, zero frames
  over 24/34/50 ms, zero long tasks, and pointer `p95 1.6 ms`.

## Phase E - Maps, cleanup, and final validation

- [x] Remove obsolete temporary probes and failed experiments.
  Evidence: generated build/cache outputs were removed from `temp/` while
  retaining probe scripts, source proof folders, fixtures, JSON reports, and PNG
  captures. Removed categories: top-level `temp/*target*`,
  `temp/c1_wgpu_external_texture_backend_probe/*/target`, `temp/DerivedData`,
  `temp/xcodebuild-derived`, `temp/manual-ios-bevy-build`, and
  `temp/manual-ios-bevy-device-build`. Post-final-build cleanup `du -sh temp`
  now reports `93M` after the latest retained probe reports; checks confirm no
  top-level `*target*`, `DerivedData`, `xcodebuild-derived`, or C1 nested
  `target` directories remain after cleaning the refresh validation target
  directories with `cargo clean --target-dir`.
- [x] Keep useful diagnostics under `temp/` only when intentionally maintained.
  Evidence: `temp/diagnostics_inventory.md` documents the maintained probe
  scripts, fixtures, source proof folder, report paths, owners, and the
  generated output categories removed during cleanup.
- [x] Update `maps/CODEMAP.md` when ownership or structure changes.
  Evidence: `maps/CODEMAP.md` documents video timeline projection ownership,
  hidden Bevy video decode timeline control, live external-texture ownership,
  and the current browser/WASM Bevy video API/export chain.
- [x] Update `maps/API_MAP.md` when exported APIs or runtime exposure change.
  Evidence: `maps/API_MAP.md` documents the video timeline projection payload,
  strict timeline validation, source-backed live video browser decode boundary,
  Bevy live video track exports, external-texture backend capabilities, and
  unsupported advanced blend rejection.
- [x] Update `maps/ARCHITECTURE_MAP.md` when lifecycle, ownership, dependency
  direction, or rendering route changes.
  Evidence: `maps/ARCHITECTURE_MAP.md` documents the browser/WASM Bevy live
  video ownership chain, timeline-hidden-source control, maintained
  external-texture backend fork, 1/2/4/10 fluency evidence, and remaining Phase
  E final-validation scope.
- [x] Update `maps/DESIGN_MAP.md` only if user-visible visual contracts, design
  tokens, or generated style ownership change.
  Evidence: no product-visible design token, generated style contract, or UI
  visual factory changed. The new `project_canvas.png` artifacts are temporary
  diagnostics under `temp/`, not product design output; `maps/DESIGN_MAP.md`
  therefore requires no content change.
- [x] Document browser limits for `GPUExternalTexture`.
- [x] Run final validation:
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
  Current evidence: Rust and JS validation gates pass:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml --target-dir
  temp/atome-bevy-core-final-test-target` passed 22 tests;
  `cargo check --manifest-path atome/renderers/bevy-core/Cargo.toml --target
  wasm32-unknown-unknown --target-dir temp/atome-bevy-core-final-wasm-target`
  passed; `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml
  --target-dir temp/platforms-web-bevy-renderer-final-test-target` passed 11
  tests; `cargo check --manifest-path platforms/web/bevy-renderer/Cargo.toml
  --target wasm32-unknown-unknown --target-dir
  temp/platforms-web-bevy-renderer-final-wasm-target` passed;
  `./platforms/web/bevy-renderer/build.sh` passed; the drag/resize Vitest
  suite passed 3 files and 19 tests; the unified/surface/media suite passed 4
  files and 26 tests; `npm run check:syntax` passed with 719 files; and
  `git diff --check` passed. Latest focused revalidation after the
  opacity-zero hidden decode and map updates: `node --check
  eVe/domains/rendering/bevy_video_decode_source_runtime.js` passed;
  `npm run test:run --
  tests/eve/bevy_video_decode_source_runtime.test.mjs
  tests/eve/bevy_project_renderer_guards.test.mjs
  tests/eve/unified_rendering_contract.test.mjs
  tests/eve/selected_project_media_playback_runtime.test.mjs
  tests/eve/video_timeline_fields_contract.test.mjs` passed with 4 files and
  26 tests; `cargo test --manifest-path
  platforms/web/bevy-renderer/Cargo.toml --target-dir
  temp/platforms-web-bevy-renderer-video-wake-test-target
  exported_video_frame_notification_requests_redraw` passed; `npm run
  check:syntax` passed with 719 files; and `git diff --check` passed. This task
  is now accepted under the 2026-06-13 browser-floor decision because the final
  Google Chrome 10-stream fluency attempts are visually `ok:true` with zero
  visible project media DOM nodes, zero CPU readbacks, zero 2D canvas draws,
  zero video copies, and DPR-matched screenshots, but do not consistently meet
  the strict frame `p95 <= 18 ms` target. The long anti-throttled run
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_final_validation_stable6s_unthrottled/report.json`
  reports frame `p95 18.3 ms`; the short anti-throttled rerun
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_final_validation_unthrottled_short/report.json`
  reports frame `p95 18.5 ms`. The later focused visual/scheduling runs prove
  the expected Bevy canvas output and reduce video-frame wake pressure, with
  the best current report
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_rvfc_only_mapped/report.json`
  at frame `p95 18.1 ms`, but did not provide reproducible `<= 18 ms`
  strict acceptance. The later opacity-zero hidden decode run
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_decode_opacity0_acceptance/report.json`
  lowers wake pressure further while keeping the same visual/readback/copy
  guarantees, but reports frame `p95 18.3 ms`; the blank-browser floor report
  `temp/probe_reports/browser_raf_floor_chrome/report.json` reports RAF
  `p95 18.1 ms` without eVe or Bevy.
  Latest focused revalidation after diagnostic opt-in tightening:
  `node --check eVe/domains/rendering/bevy_perf_diagnostics_runtime.js`,
  `node --check eVe/domains/rendering/bevy_web_presentation_runtime.js`,
  `node --check eVe/domains/rendering/bevy_video_decode_source_runtime.js`,
  `node --check temp/bevy_fluency_probe/browser_probe.mjs`,
  `node --check temp/bevy_fluency_probe/config.mjs`, and
  `node --check temp/bevy_canvas_fluency_probe.mjs` passed;
  `npm run test:run --
  tests/eve/bevy_video_decode_source_runtime.test.mjs
  tests/eve/bevy_project_renderer_guards.test.mjs
  tests/eve/project_scene_gesture_performance.test.mjs
  tests/eve/video_timeline_fields_contract.test.mjs
  tests/governance/vitest_manifest_guard.test.mjs` passed with 5 files and
  32 tests; and the latest Chrome visual report
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_video_frame_diag_opt_acceptance/report.json`
  remains visually `ok:true` with frame `p95 18.1 ms`, so this final validation
  task is closed by the accepted browser-floor-equivalent gate. The `temp/`
  diagnostics are intentionally ignored by Git, so
  their browser-launch flag overrides and stable-window metric additions are
  validated by direct `node --check` plus real probe executions rather than by a
  tracked Vitest file importing ignored helpers. Latest final JS validation
  refresh after stable-window metrics: `npm run test:run --
  tests/eve/project_scene_gesture_performance.test.mjs
  tests/eve/project_scene_multi_selection_transform.test.mjs
  tests/eve/project_scene_stale_drag_regression.test.mjs` passed with 3 files
  and 19 tests; `npm run test:run --
  tests/eve/unified_rendering_contract.test.mjs
  tests/eve/project_scene_unified_rendering_contract.test.mjs
  tests/eve/render_surface_size_contract.test.mjs
  tests/eve/selected_project_media_playback_runtime.test.mjs` passed with 4
  files and 26 tests. Latest Rust/build refresh:
  `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml --target-dir
  temp/atome-bevy-core-refresh-test-target` passed 22 tests;
  `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml
  --target-dir temp/platforms-web-bevy-renderer-refresh-test-target` passed 11
  tests; `cargo check --manifest-path atome/renderers/bevy-core/Cargo.toml
  --target wasm32-unknown-unknown --target-dir
  temp/atome-bevy-core-refresh-wasm-target` passed; `cargo check
  --manifest-path platforms/web/bevy-renderer/Cargo.toml --target
  wasm32-unknown-unknown --target-dir
  temp/platforms-web-bevy-renderer-refresh-wasm-target` passed; and
  `./platforms/web/bevy-renderer/build.sh` passed, writing the WASM package to
  `atome/src/wasm`. This final validation is accepted under the browser-floor
  p95 decision above.

## Definition of done

This plan is complete only when all items below are checked:

- [x] `todo/WEBGPU_to_repair.md` exists and Phase A is closed.
- [x] Bevy drag/resize regressions are closed or documented with evidence.
  Evidence: `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
  tests/eve/project_scene_multi_selection_transform.test.mjs
  tests/eve/project_scene_stale_drag_regression.test.mjs` passed with 3 files
  and 19 tests. The final 10-stream probe attempts keep drag/pointer p95 low
  (`1.2-1.4 ms`) while playback runs.
- [x] Live project video playback uses a GPU-first route instead of live RGBA
  copying.
  Evidence: browser Bevy capabilities report
  `gpu_external_texture_import:true`, `texture_external_sampling:true`,
  `rgba_live_payload:false`, and `visible_dom_video_overlay:false`; the 1/2/4/10
  fluency reports and final attempts keep CPU readbacks, 2D canvas draws, and
  video copies at zero.
- [x] 10 project video streams pass the Bevy canvas fluency probe.
  Evidence: `temp/probe_reports/bevy_canvas_fluency_probe_video10_stable_window_metrics/report.json`
  is `ok:true` and visually `ok:true` with 10 detected video regions, one Bevy
  project canvas, zero visible project media DOM nodes, 10 hidden decode videos,
  zero CPU readbacks, zero 2D canvas draws, zero video copies, DPR-matched
  canvas pixels, `average_fps 60.002`, global frame `p95 18.2 ms`, stable
  playback after pointer +1500 ms `p95 18.1 ms`, last 6000 ms `p95 18.2 ms`,
  and zero frames over 24/34/50 ms. This is accepted because matching the local
  browser RAF floor was explicitly validated by the user on 2026-06-13.
- [x] Maps and tests reflect the final architecture.
  Evidence: `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md`,
  and `todo/WEBGPU_to_repair.md` document the GPU-first external-texture route,
  diagnostics, browser-floor acceptance decision, and final validation status.
  The refreshed JS, Rust, WASM check, build, syntax, and fluency validations are
  recorded above.
- [x] Final metrics prove average FPS, p50/p95/p99, long-frame counts, video
  imports, CPU readbacks, redraws, and canvas DPR behavior.
  Evidence: final accepted metrics are recorded in
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_stable_window_metrics/report.json`
  and summarized above: average FPS, p50/p95/p99, stable windows, long-frame
  counts, video imports, CPU readbacks, redraws, video copies, and canvas DPR
  all have explicit report values.

All definition-of-done items are checked. The 10 sharp project video streams are
delivered under the accepted browser-floor p95 validation decision.
