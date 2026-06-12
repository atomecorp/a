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
- [ ] `todo/WEBGPU_to_repair.md` exists and Phase A is closed.
  Current evidence: the file is absent.
- [ ] A maintained external-video prototype probe exists at
  `temp/webgpu_external_video_probe.mjs`.
  Current evidence: the file is absent.
- [ ] A maintained Bevy fluency probe exists at
  `temp/bevy_canvas_fluency_probe.mjs`.
  Current evidence: the file is absent.
- [ ] Live project video uses `GPUExternalTexture` / `texture_external`.
  Current evidence: the project path still uses
  `copy_external_image_to_texture`.
- [ ] The Phase C modules or equivalent canonical owners exist.
  Current evidence: the planned files were not found in the repository.

## Phase A - Audit gate

Objective: produce the repair audit before implementation expands.

- [ ] Create `todo/WEBGPU_to_repair.md`.
- [ ] Start the report with `# Audit WebGPU / Canvas / Bevy / Atomes`.
- [ ] Inspect WebGPU adapter, device, queue, surface, error handling, device
  loss, context loss, and resource recreation.
- [ ] Inspect canvas sizing, DPR, resize, viewport, focus, blur, zoom, and
  scroll behavior.
- [ ] Inspect Bevy ECS architecture, schedules, resources, commands, assets,
  diagnostics, WASM constraints, and per-frame work.
- [ ] Inspect Atome model, parsing, serialization, deserialization,
  interpretation, identity, state ownership, and mutation flow.
- [ ] Inspect database and storage reads/writes, transactions, indexes,
  migrations, local/offline cache, and frame-critical access.
- [ ] Inspect rastering, dirty regions, batching, instancing, culling, z-order,
  textures, redraw, zoom, and pan.
- [ ] Inspect refresh strategy, `requestAnimationFrame`, redraw coalescing, Bevy
  redraw scheduling, and update loops.
- [ ] Inspect reliability around invalid data, corrupt/empty database, async
  races, WASM/Rust panics, background tabs, and large volumes.
- [ ] Include the mandatory sections `## 1. Resume executif` through
  `## 13. Conclusion technique`.
- [ ] Include the required audit, critical issue, performance, reliability,
  prioritized repair, and hypothesis tables.
- [ ] Document executed, failed, or skipped checks:
  `rg "webgpu|wgpu|canvas|bevy|atom|atoms|raster|render|texture|buffer|pipeline|database|db|storage|cache|dirty|resize|viewport|requestAnimationFrame"`,
  `cargo check`, `cargo test`,
  `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs`,
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs`,
  and `npm run check:syntax`.
- [ ] Close Phase A only when the report cites exact files, functions, modules,
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
- [ ] Rerun validation:
  `npm run test:run -- tests/eve/bevy_video_decode_source_runtime.test.mjs`
  and `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs`.

### B2 - Redraw primes on transform

- [x] Detect transform-only diffs with `opsAreTransformOnly`.
- [ ] Audit `schedulePresentationRedrawPrime(..., 'diff')` in
  `eVe/domains/rendering/bevy_web_renderer_runtime.js`.
- [ ] Keep delayed redraw primes only for start, resize, spawn/resource/media
  priming, or another documented presentation need.
- [ ] Ensure transform-only updates use one coalesced redraw and do not build a
  delayed redraw backlog.
- [ ] Add or update a regression guard proving transform-only drag/resize does
  not schedule delayed redraw primes.
- [ ] Validate with:
  `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs`.

### B3 - Direct drag transform path

- [x] Direct transform routing exists:
  `pointermove -> hit test runtime -> local prop calculation ->
  apply_atome_bevy_transform -> coalesced redraw`.
- [x] Existing tests cover direct transforms during drag.
- [ ] Rerun validation:
  `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
  tests/eve/project_scene_multi_selection_transform.test.mjs
  tests/eve/project_scene_stale_drag_regression.test.mjs`.
- [ ] Prove `pointermove` does not execute `Atome.commit`,
  `Atome.commitBatch`, network sync, full scene rebuild, video upload,
  `getImageData`, video decode, or texture create/destroy.

### B4 - Performance instrumentation

- [ ] Restore or create `temp/bevy_canvas_fluency_probe.mjs` if no maintained
  probe owner exists elsewhere.
- [ ] Measure pointer event duration, `applyGestureFrame`, projection runtime,
  Virtual Scene diff, `apply_atome_bevy_transform`, Bevy redraw, operations per
  frame, redraw requests, video copies, skipped copies, GPU video imports, and
  GPU video draws.
- [ ] Write probe output to
  `temp/probe_reports/bevy_canvas_fluency_probe/report.json` and
  `temp/probe_reports/bevy_canvas_fluency_probe/timeline.json`.
- [ ] Report average FPS, frame p50/p95/p99, frames over 24/34/50 ms,
  `pointermove` count, transform patch count, commits during movement, video
  imports, CPU readbacks, redraws, canvas CSS size, pixel size, and DPR.

### B5 - Minimal isolation if performance remains below target

- [ ] Compare Bevy scenes with shapes/images/text and no videos.
- [ ] Compare the same scene with videos present but video copies disabled.
- [ ] Compare direct-transform-only scenes.
- [ ] Compare WebKit, Tauri, Safari, and Chromium where applicable.
- [ ] If the minimal case stutters, investigate Bevy/WASM/WebKit/Tauri
  integration, present mode, wake loop, and render-loop configuration.

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

- [ ] Identify the canonical owner before creating any new module.
- [ ] Reuse existing owners when possible:
  `eVe/domains/rendering/bevy_web_renderer_runtime.js`,
  `eVe/domains/rendering/bevy_video_decode_source_runtime.js`,
  `eVe/domains/media/preview/webgpu_video_preview_renderer.js`,
  `platforms/web/bevy-renderer/src/`, and
  `atome/renderers/bevy-core/src/`.
- [ ] Create new modules only if existing architecture cannot host the
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
- [ ] Define or expose:
  `apply_atome_bevy_video_track(track)`,
  `remove_atome_bevy_video_track(id)`, and
  `update_atome_bevy_video_transform(id, transform)`.
- [ ] Define an `AtomeVideoTrack` payload or equivalent canonical track payload.
- [ ] Implement a project video path that imports external textures in the frame
  where they are drawn.
- [ ] Implement a WGSL path that samples `texture_external` with
  `textureSampleBaseClampToEdge`.
- [ ] Keep image/sprite RGBA texture routing separate from live video routing.
- [ ] Ensure project video presentation uses only `canvas#eve_surface_project`.
- [ ] Prove the live route does not call `getImageData`.
- [ ] Prove the live route does not convert video frames into Bevy `Image` via
  RGBA.
- [ ] Prove no visible DOM video overlay is used for project presentation.
- [ ] Validate with `cargo check`, `cargo test`,
  `./platforms/web/bevy-renderer/build.sh`,
  `npm run test:run -- tests/eve/selected_project_media_playback_runtime.test.mjs`,
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs`, and
  `npm run check:syntax`.

## Phase D - Multi-track compositing and timeline preparation

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
- [ ] Document browser limits for `GPUExternalTexture`.
- [ ] Run final validation:
  `cargo test`, `cargo check`, `./platforms/web/bevy-renderer/build.sh`,
  `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
  tests/eve/project_scene_multi_selection_transform.test.mjs
  tests/eve/project_scene_stale_drag_regression.test.mjs`,
  `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
  tests/eve/render_surface_size_contract.test.mjs
  tests/eve/selected_project_media_playback_runtime.test.mjs`,
  `npm run check:syntax`, and
  `BEVY_FLUENCY_VIDEO_STREAMS=10 node temp/bevy_canvas_fluency_probe.mjs`.

## Definition of done

This plan is complete only when all items below are checked:

- [ ] `todo/WEBGPU_to_repair.md` exists and Phase A is closed.
- [ ] Bevy drag/resize regressions are closed or documented with evidence.
- [ ] Live project video playback uses a GPU-first route instead of live RGBA
  copying.
- [ ] 10 project video streams pass the Bevy canvas fluency probe.
- [ ] Maps and tests reflect the final architecture.
- [ ] Final metrics prove average FPS, p50/p95/p99, long-frame counts, video
  imports, CPU readbacks, redraws, and canvas DPR behavior.

Until all definition-of-done items are checked, 10 sharp project video streams at
stable 60 FPS are not delivered.
