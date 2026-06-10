# eVe Video Engine - Unified Rendering Audit, Bevy Performance, and GPU Video Plan

## Purpose

This file is the single active planning source for the rendering and video-engine work that was previously split across:

- `todo/full_rendering_audit.md`
- `todo/solve_Bevy_perf.md`
- `todo/eVe_video_engine.md`

Those files described one connected problem: the project canvas, Atome rendering, Bevy/WebGPU performance, and the future GPU-first video engine cannot be planned independently. This document keeps the audit gate, the current Bevy performance remediation, and the target video engine in one execution order.

## Non-negotiable target

Build an eVe/Bevy/WebGPU video engine capable of real-time editing and compositing:

- 10 simultaneous video streams in the Bevy project canvas.
- Stable 60 FPS at the current canvas resolution and real device pixel ratio.
- Smooth Atome drag and resize with or without video playback.
- No live playback route based on `canvas 2D -> getImageData -> RGBA -> WASM`.
- Video rendered in the Bevy canvas, without visible DOM video overlays.
- Full-resolution sharpness; no downscale cache used to hide performance problems.
- One visible Bevy/WebGPU project canvas as the presentation surface.

## Architectural rules

1. Live video must not cross `ImageData`, `Uint8Array RGBA`, or `Vec<u8>` for playback.
2. Drag and resize are priority interaction paths and must remain independent from video work.
3. Video compositing belongs in Bevy/WebGPU, not DOM, not an intermediate 2D canvas.
4. Persistent mutations must not execute during `pointermove`.
5. Any optimization must be kept only when it improves a reproducible measurement.
6. No fallback renderer, compatibility shim, or parallel old/new rendering path may become the product route.
7. The DOM remains disposable projection only; canonical Atome state stays outside the DOM.

## Current known state

Already implemented or largely treated:

- Bevy project rendering is the visible project canvas route.
- Direct drag transform exists through `apply_atome_bevy_transform`.
- `project_scene_direct_transform_runtime.js` applies direct runtime transform patches.
- `project_scene_gesture_performance.test.mjs` covers direct transforms during drag.
- `__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__` exists.
- `AtomeVideoFrameCopies` exists in the Rust Bevy texture path.
- Video texture copy is now version-gated so unchanged frames are not copied repeatedly.
- A temporary WebGPU external texture probe exists in `temp/webgpu_external_video_probe.mjs`.
- Media preview has a WebGPU external texture implementation in `eVe/domains/media/preview/webgpu_video_preview_renderer.js`.

Still open:

- The Bevy project renderer still uses `copy_external_image_to_texture` for live video texture upload.
- The Bevy project renderer does not yet use `GPUExternalTexture` / `texture_external` for live project video.
- `schedulePresentationRedrawPrime(..., 'diff')` still exists and must be audited for transform-only paths.
- The latest Bevy canvas fluency report with 10 streams was `ok:false`, with playback p95 above target and `gpu_video_import` / `gpu_video_draw` at 0 for the Bevy project path.
- `todo/WEBGPU_to_repair.md` has not been produced yet.

## Phase A - Global Rendering / Atome / Storage Audit

### Objective

Produce a precise, complete, actionable audit of the display, rendering, manipulation, storage, and reading strategy for Atomes.

This phase is analysis and documentation only. It must not modify application code.

### Deliverable

Create or update exactly:

```text
todo/WEBGPU_to_repair.md
```

The report must start with:

```text
# Audit WebGPU / Canvas / Bevy / Atomes
```

### Audit scope

Inspect and document:

- WebGPU adapter/device/queue/surface initialization.
- WebGPU error handling, device lost, context lost, and resource recreation.
- Canvas creation, sizing, DPR, resize, viewport, focus/blur, zoom, and scroll behavior.
- Bevy ECS architecture, schedules, systems, resources, commands, assets, diagnostics, WASM constraints, and per-frame work.
- Atome model, parsing, serialization, deserialization, interpretation, state ownership, identity, and mutation flow.
- Database and storage reads/writes, transactions, indexes, migrations, local/offline cache, and frame-critical access.
- Rastering, cache, dirty regions, dirty Atomes, batching, instancing, culling, z-order, textures, redraw, zoom, and pan.
- Refresh strategy, requestAnimationFrame use, redraw coalescing, Bevy redraw scheduling, and update loops.
- Reliability around invalid data, empty/corrupt database, async races, WASM/Rust panics, background tabs, and large volumes.

### Mandatory report structure

`todo/WEBGPU_to_repair.md` must contain:

1. `## 1. Resume executif`
2. `## 2. Cartographie des fichiers inspectes`
3. `## 3. Flux de donnees actuels`
4. `## 4. Problemes critiques detectes`
5. `## 5. Problemes de performance`
6. `## 6. Problemes de fiabilite`
7. `## 7. Analyse de la strategie actuelle d'affichage`
8. `## 8. Analyse de la strategie de stockage des atomes`
9. `## 9. Architecture recommandee`
10. `## 10. Plan de reparation priorise`
11. `## 11. Tests et instrumentation a ajouter`
12. `## 12. Liste des hypotheses a verifier`
13. `## 13. Conclusion technique`

### Mandatory tables

The report must include:

```text
| Zone | Fichiers inspectes | Role | Risque principal |
|---|---|---|---|
```

```text
| ID | Gravite | Zone | Probleme | Preuve dans le code | Impact | Correction recommandee |
|---|---|---|---|---|---|---|
```

```text
| ID | Zone | Symptome probable | Cause technique | Fichiers concernes | Correction | Gain attendu |
|---|---|---|---|---|---|---|
```

```text
| ID | Zone | Risque | Declencheur | Impact | Correction |
|---|---|---|---|---|---|
```

```text
| Priorite | Action | Fichiers concernes | Impact | Effort | Risque | Validation |
|---|---|---|---|---|---|---|
```

```text
| Hypothese | Pourquoi c'est suspect | Comment verifier |
|---|---|---|
```

### Anti-patterns to inspect first

1. Database reads during render loops.
2. Database writes on every micro-change without batch/debounce.
3. GPU texture recreation per frame.
4. GPU buffer recreation per frame.
5. Pipeline or bind group recreation without need.
6. Full re-rastering after small changes.
7. Systematic full redraws.
8. Missing dirty flags.
9. Missing memory cache for Atomes.
10. Missing GPU/raster cache.
11. Massive clones of Atome collections.
12. Repeated serialization/deserialization.
13. Direct database-to-render conversion without stable intermediate state.
14. Coupling between storage, Atome logic, and rendering.
15. Bevy systems running every frame without condition.
16. Incorrect canvas/WebGPU resize handling.
17. Missing device-lost strategy.
18. Duplicate state between database, ECS, memory, and GPU.
19. Fragile async handling.
20. Missing performance instrumentation.

### Commands and checks to document

Before finalizing `todo/WEBGPU_to_repair.md`, inspect the project with targeted source searches. When applicable and safe, document relevant command results or why they were not run:

```text
rg "webgpu|wgpu|canvas|bevy|atom|atoms|raster|render|texture|buffer|pipeline|database|db|storage|cache|dirty|resize|viewport|requestAnimationFrame"
cargo check
cargo test
npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
npm run check:syntax
```

### Phase A exit criteria

- `todo/WEBGPU_to_repair.md` exists.
- It cites exact files, functions, modules, and systems.
- It distinguishes facts from hypotheses.
- It gives prioritized P0/P1/P2/P3 repairs.
- It documents commands executed, failed, skipped, and why.
- It is precise enough to repair the system without repeating the audit.

## Phase B - Current Bevy Performance Stabilization

### Objective

Restore professional-level drag/resize fluidity with Bevy as the only visible project canvas renderer, without visible DOM rendering, without CPU video fallback for live playback, and without the old proprietary WebGPU renderer owning the canvas.

### B1 - Video copy gating

Status: largely treated, keep as regression guard.

Observed problem:

- Bevy copied `HTMLVideoElement` frames into Bevy textures during redraws.
- Drag forced redraws.
- If videos existed in the scene, frames could be recopied even when playback was stopped.

Required invariant:

- Copy video texture data only when a newly decoded frame is available.
- Use `__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__`.
- Keep a render-world cache of the last copied frame version for each video Atome.
- Do not call `copy_external_image_to_texture` if the frame has not changed.

Current evidence:

- `eVe/domains/rendering/bevy_video_decode_source_runtime.js` exposes `__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__`.
- `atome/renderers/bevy-core/src/video_texture.rs` owns `AtomeVideoFrameCopies`.
- `tests/eve/bevy_project_renderer_guards.test.mjs` guards the version/copy path.

Validation:

```text
npm run test:run -- tests/eve/bevy_video_decode_source_runtime.test.mjs
npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs
```

### B2 - Redraw primes on transform

Status: partially open.

Observed problem:

- `schedulePresentationRedrawPrime` schedules delayed redraws.
- It can still be called after diffs.
- Transform-heavy paths must not accumulate delayed redraws during drag/resize.

Required action:

- Keep redraw primes only for start, resize, spawn/resource/media priming, or another documented presentation need.
- For transform-only updates, use one coalesced redraw.
- Prove transform-only drag/resize does not create a delayed redraw backlog.

Validation:

```text
npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
BEVY_FLUENCY_VIDEO_STREAMS=1 node temp/bevy_canvas_fluency_probe.mjs
```

### B3 - Direct drag transform path

Status: treated, keep as regression guard.

Required invariant:

```text
pointermove
-> hit test runtime
-> local prop calculation
-> apply_atome_bevy_transform
-> coalesced redraw
```

Forbidden during `pointermove`:

- `Atome.commit`
- `Atome.commitBatch`
- network sync
- full scene rebuild
- video upload
- `getImageData`
- video decode
- texture create/destroy

Current evidence:

- `eVe/domains/rendering/project_scene_direct_transform_runtime.js`
- `applyBevyWebRendererTransformPatch`
- `tests/eve/project_scene_gesture_performance.test.mjs`

Validation:

```text
npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
npm run test:run -- tests/eve/project_scene_multi_selection_transform.test.mjs
npm run test:run -- tests/eve/project_scene_stale_drag_regression.test.mjs
```

### B4 - Instrumentation if performance remains below target

Status: partially open.

Measure:

- pointer event duration
- `applyGestureFrame`
- projection runtime
- VirtualScene diff
- WASM `apply_atome_bevy_transform`
- Bevy redraw
- operations per frame
- redraw requests
- video copies performed
- video copies skipped
- GPU external video imports/draws

Output:

```text
temp/probe_reports/bevy_canvas_fluency_probe/report.json
temp/probe_reports/bevy_canvas_fluency_probe/timeline.json
```

Validation:

- Probe output reports FPS, video FPS, copy counts, redraw counts, frame p50/p95/p99, and gaps.

### B5 - Minimal Bevy isolation if the problem persists

Status: diagnostic fallback.

Create minimal comparison scenarios only if Phase B4 still shows unexplained gaps:

- Bevy scene with shapes/images/text, no videos.
- Same scene with videos present but video copies disabled.
- Same scene with direct transform only.
- Compare WebKit, Tauri, Safari, and Chromium.

Decision:

- If the minimal case still stutters, investigate Bevy/WASM/WebKit/Tauri integration, present mode, wake loop, and render loop configuration.

## Phase C - GPU-First Video Engine

### Objective

Replace live video playback copying with a GPU-first route:

```text
Decode video
-> GPUExternalTexture / native decoded texture
-> Bevy material or render node
-> WGSL compositing
-> Bevy project canvas
```

The existing RGBA texture path may remain only for debug, poster frame, or explicitly non-live extraction. It must not be the live playback engine.

### Target modules

```text
eVe/domains/media/bevy_video_engine_runtime.js
eVe/domains/media/bevy_video_timeline_runtime.js
eVe/domains/media/bevy_video_probe_runtime.js
eVe/domains/rendering/bevy_web_video_bridge.js
platforms/web/bevy-renderer/src/video_external.rs
platforms/web/bevy-renderer/src/video_compositor.rs
atome/renderers/bevy-core/src/video_compositor.rs
atome/renderers/bevy-core/src/video_track.rs
atome/renderers/bevy-core/src/video_material.rs
atome/renderers/bevy-core/assets/shaders/video_external.wgsl
```

Create these only if the existing architecture cannot host the responsibility cleanly. Before creating them, inspect maps and current rendering modules.

### Responsibilities

`bevy_video_engine_runtime.js`:

- Manage active video tracks.
- Manage play, pause, and stop.
- Manage `atome_id -> video source`.
- Expose a stable API to eVe.
- Never own drag/resize behavior.

`bevy_video_timeline_runtime.js`:

- Manage playhead, speed, loop, offset, trim in/out.
- Synchronize tracks.
- Prepare future multi-track editing.

`bevy_web_video_bridge.js`:

- Own web-specific `GPUExternalTexture` interaction.
- Import external textures in the frame where they are drawn.
- Manage bind group validity.
- Never call `getImageData`.

`video_external.rs`:

- Integrate web video resources into the Bevy renderer.
- Provide a dedicated video quad render path.
- Isolate web/WASM-specific code from portable core logic.

`video_compositor.rs`:

- Own z-order, opacity, transform, UV/crop, and blend-mode preparation.
- Stay compatible with future native Tauri/iOS decoded texture routes.

`video_external.wgsl`:

- Sample `texture_external`.
- Use `textureSampleBaseClampToEdge`.
- Apply color space, opacity, alpha, crop, and transform UV.

### C1 - WebGPU external texture prototype

Status: explored in `temp/webgpu_external_video_probe.mjs`, keep as proof and regression reference.

Acceptance:

- 10 videos visible in one WebGPU canvas.
- 60 FPS p95 <= 18 ms.
- No `getImageData`.
- No RGBA live upload.
- Full canvas/DPI sharpness.

Validation:

```text
node temp/webgpu_external_video_probe.mjs
```

### C2 - Bevy web renderer integration

Status: open.

Add or expose:

```text
apply_atome_bevy_video_track(track)
remove_atome_bevy_video_track(id)
update_atome_bevy_video_transform(id, transform)
```

Implement:

- `AtomeVideoTrack` type or equivalent canonical track payload.
- Dedicated video render node or pipeline.
- `video_external.wgsl`.
- Existing sprite/image path remains separate from video.
- Project video rendering stays in `canvas#eve_surface_project`.

Acceptance:

- A Bevy project video uses the external texture path.
- The live playback route does not call `getImageData`.
- The live playback route does not convert video frames into Bevy `Image` via RGBA.
- No visible DOM video is used for project presentation.

Validation:

```text
cargo check
cargo test
./platforms/web/bevy-renderer/build.sh
npm run test:run -- tests/eve/selected_project_media_playback_runtime.test.mjs
npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
npm run check:syntax
```

### C3 - Multi-track compositing

Status: open.

Implement:

- z-index per track
- opacity
- normal/add/multiply/screen blend modes if supported
- crop/UV rect
- transform per track
- timeline preparation: start, duration, trim in/out

Acceptance:

- 10 visible streams.
- Stable playback p95 <= 18 ms.
- No RAF gap > 34 ms in stable playback.
- Drag/resize during playback p95 <= 18 ms.
- No quality loss compared to canvas DPI.

Validation:

```text
BEVY_FLUENCY_VIDEO_STREAMS=1 node temp/bevy_canvas_fluency_probe.mjs
BEVY_FLUENCY_VIDEO_STREAMS=2 node temp/bevy_canvas_fluency_probe.mjs
BEVY_FLUENCY_VIDEO_STREAMS=4 node temp/bevy_canvas_fluency_probe.mjs
BEVY_FLUENCY_VIDEO_STREAMS=10 node temp/bevy_canvas_fluency_probe.mjs
```

### C4 - Quality, maps, and final cleanup

Status: open.

Actions:

- Remove obsolete temporary probes and failed experiments.
- Keep useful probes under `temp/` only when they remain intentional diagnostics.
- Update `maps/CODEMAP.md`.
- Update `maps/API_MAP.md`.
- Update `maps/ARCHITECTURE_MAP.md` when ownership or lifecycle changes.
- Update `maps/DESIGN_MAP.md` only if user-visible visual contracts or design tokens change.
- Document browser limits for `GPUExternalTexture`.

Final validation:

```text
cargo test
cargo check
./platforms/web/bevy-renderer/build.sh
npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs tests/eve/project_scene_multi_selection_transform.test.mjs tests/eve/project_scene_stale_drag_regression.test.mjs
npm run test:run -- tests/eve/unified_rendering_contract.test.mjs tests/eve/render_surface_size_contract.test.mjs tests/eve/selected_project_media_playback_runtime.test.mjs
npm run check:syntax
BEVY_FLUENCY_VIDEO_STREAMS=10 node temp/bevy_canvas_fluency_probe.mjs
```

## Required metrics in every progress report

- Average FPS.
- Frame p50/p95/p99.
- Number of frames > 24 ms.
- Number of frames > 34 ms.
- Number of frames > 50 ms.
- Number of `pointermove` events.
- Number of transform patches.
- Number of commits during movement.
- Number of video imports.
- Number of CPU readbacks.
- Number of redraws.
- Canvas CSS size and pixel size / DPR.

## Definition of fluid

Playback:

- p95 <= 18 ms.
- no gap > 34 ms over a 10 second stable sample.
- no CPU readback.

Drag/resize:

- p95 <= 18 ms.
- no commit during movement.
- no video operation during active interaction.
- no loss of pointer-to-Atome tracking.

Image quality:

- no downscale cache.
- video sampled at source resolution or at the resolution required by canvas DPI.
- no pixelation introduced by the engine.

## Known risks

- `GPUExternalTexture` availability depends on browser support.
- External textures expire quickly and must be imported in the current frame/draw window.
- CORS can block remote media.
- Bevy may require a specific wgpu render node for web video.
- Tauri and iOS need a different native decoded-texture path.
- If native Bevy commands exist without a presentable surface, the web canvas must remain the visible renderer.

## Final acceptance

This file is complete only when:

- `todo/WEBGPU_to_repair.md` exists and Phase A is closed.
- Current Bevy drag/resize performance regressions are closed or explicitly documented with evidence.
- Live project video playback uses a GPU-first route instead of RGBA live copying.
- 10 project video streams pass the Bevy canvas fluency probe.
- Maps and tests reflect the final architecture.

Until then, 10 sharp video streams at stable 60 FPS cannot be considered delivered.
