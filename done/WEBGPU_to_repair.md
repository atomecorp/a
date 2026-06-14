# Audit WebGPU / Canvas / Bevy / Atomes

Date: 2026-06-13
Scope: eVe project rendering, Bevy/WASM/WebGPU, live video, Atome mutation
pipeline, storage, and validation gates.

## 1. Resume executif

The final target is delivered under the accepted local browser-floor validation
decision. The repository has a single visible Bevy project canvas route, direct
Bevy transforms during drag/resize, video frame version tracking, and a
Bevy-owned source path that imports browser external textures and samples
`texture_external` in the project canvas. Repeated Chrome runs hover around
frame p95 `18.1-18.5 ms`, while blank Chrome/Chromium RAF-floor probes in the
same local environment report `p95 18.2-18.3 ms` without eVe, Bevy, or WebGPU.
On 2026-06-13 the user explicitly accepted this browser-floor-equivalent p95 as
valid for final delivery.

Current live project video is:

```text
Atome record
-> Virtual Scene video node
-> hidden HTMLVideoElement decode source
-> Rust Bevy AtomeVideoExternalTexture
-> GPUDevice.importExternalTexture through the maintained Web wgpu backend
-> Bevy external-texture bind group
-> texture_external WGSL sampling
-> canvas#eve_surface_project
```

This removes the older `canvas 2D -> getImageData -> RGBA -> WASM` live route
and the later `copy_external_image_to_texture` product route for source-backed
live playback. The delivered validation keeps the exact p95 measurements
recorded while accepting the local browser floor as the practical final gate.

The highest priority repairs are:

- P0: keep the accepted browser-floor 10-stream fluency evidence reproducible.
- P0: keep the video-frame notification coalescing, RVFC-first playback pump,
  and no-extra-wake WASM redraw path guarded by tests.
- P0: keep maintained external-video and Bevy canvas fluency probes green.
- P1: add active WebGPU/device-loss diagnostics for the actual project route.
- P1: keep `tests/eve/unified_rendering_contract.test.mjs` green for the
  current Bevy project route.
- P3: document browser/WebView limits and clean obsolete temporary artifacts
  after the maintained probes replace ad hoc experiments.

Post-audit execution update, 2026-06-13:

- B2 redraw-prime gating was implemented in
  `eVe/domains/rendering/bevy_web_renderer_runtime.js`.
- B3 pointermove isolation is now covered by
  `tests/eve/project_scene_gesture_performance.test.mjs`.
- Maintained probes now exist at `temp/webgpu_external_video_probe.mjs` and
  `temp/bevy_canvas_fluency_probe.mjs`.
- The pure JavaScript WebGPU probe imports and draws `GPUExternalTexture`
  successfully, and C1 promoted the minimal maintained Web `wgpu` backend fork
  required for browser external textures into the product Cargo graph.
- A direct dependency upgrade is not sufficient as of the current crates.io
  check: `wgpu 29.0.3` is available and `bevy_render 0.19.0-rc.3` depends on it,
  but `wgpu-29.0.3/src/backend/webgpu.rs` still leaves
  `create_external_texture` and `BindingResource::ExternalTexture`
  unimplemented for web. `wgpu-types-29.0.3` keeps browser video sources under
  the copy API, not under `ExternalTextureDescriptor`.
- The compliant implementation boundary remains the existing Bevy/wgpu renderer
  owners, not a second JavaScript project renderer or a facade API that cannot
  draw.
- B5 isolation now has maintained reports for a 10-record mixed non-video scene
  and a 10-video scene with frame-version lookup disabled:
  `temp/probe_reports/bevy_canvas_fluency_probe_mixed_non_video10/report.json`
  and
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_copies_disabled/report.json`.
- B5 also has local Chrome WebGPU reports with launch flags that drain Bevy
  WASM operations and apply redraws without adapter errors:
  `temp/probe_reports/bevy_canvas_fluency_probe_chrome_mixed_non_video10_webgpu/report.json`,
  `temp/probe_reports/bevy_canvas_fluency_probe_chrome_video10_webgpu/report.json`
  and
  `temp/probe_reports/bevy_canvas_fluency_probe_chrome_video10_copies_disabled_webgpu_v3/report.json`.
- Default Playwright Chromium headless B5 reports still log WebGPU adapter/GPU
  availability failures. They remain useful queue/projection/gesture isolation
  evidence, but local Chrome WebGPU reports are required for presentation
  evidence in this environment.
- The browser live project video route is delivered for the validated WebGPU
  path: source-backed project video uses Bevy `texture_external`, public track
  exports exist, C3 validation passed, 1/2/4/10 stream visual proof passed, and
  the final p95 acceptance is validated under the local browser-floor decision.
- Focused 10-stream visual/scheduling repair now coalesces same-tick
  hidden-video frame notifications into one latest-frame WASM notify, uses
  `requestVideoFrameCallback` as the active-playback pump with RAF fallback
  only, and removes the extra wake after video-frame redraw application.
  Visual reports validate all 10 expected video regions in the Bevy canvas,
  reduce wake pressure from `6433` baseline wake calls to `731` after
  opacity-zero hidden decode resources, and support the accepted browser-floor
  p95 decision.
- High-frequency diagnostics for external render import/draw and video-frame
  events are now opt-in, so the maintained fluency probe measures the
  production-default path unless `BEVY_FLUENCY_EXTERNAL_RENDER_EVENTS=1` or
  `BEVY_FLUENCY_VIDEO_FRAME_EVENTS=1` is explicitly set. The latest Chrome
  10-stream visual run
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_video_frame_diag_opt_acceptance/report.json`
  is visually `ok:true` with 10 video regions, zero readbacks/copies, DPR OK,
  frame `p95 18.1 ms`; the later stable-window report closes final delivery
  under the accepted browser-floor p95 gate.
- `tests/eve/unified_rendering_contract.test.mjs` is repaired for the current
  project rendering contract and now passes 14/14. It verifies one project
  Bevy canvas, no per-Atome DOM hosts, no visible project video overlays,
  gesture-frame plus final-set mutation commits, and direct Bevy style updates.
- `eVe/domains/rendering/bevy_video_decode_source_runtime.js` now avoids
  calling jsdom's inert `HTMLMediaElement.load()` implementation while still
  calling `load()` in real browser media runtimes.

## 2. Cartographie des fichiers inspectes

| Zone | Fichiers inspectes | Role | Risque principal |
| --- | --- | --- | --- |
| Project route | `eVe/domains/rendering/project_scene_runtime.js`, `project_scene_bevy_projection_runtime.js`, `surface_runtime.js`, `surface_size_runtime.js` | Runtime project scene, surface ownership, DPR/resize, Bevy projection entry | Rebuilds or commits can re-enter gesture/video critical paths if guards regress |
| Bevy web runtime | `eVe/domains/rendering/bevy_web_renderer_runtime.js`, `eVe/domains/rendering/bevy_media_resource_runtime.js`, `eVe/domains/rendering/bevy_web_presentation_runtime.js`, `platforms/web/bevy-renderer/src/lib.rs`, `platforms/web/bevy-renderer/src/exports.rs` | WASM startup, op queue, media resource queue, redraw requests, Bevy canvas window | Delayed redraw primes and idle continuous updates must stay out of the active route |
| Bevy video | `eVe/domains/rendering/bevy_video_decode_source_runtime.js`, `eVe/domains/rendering/bevy_web_presentation_runtime.js`, `eVe/domains/rendering/bevy_perf_diagnostics_runtime.js`, `atome/renderers/bevy-core/src/video_external_texture.rs`, `atome/renderers/bevy-core/src/video_external_web.rs`, `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` | Hidden video decode sources, frame version lookup, JS timeline projection and hidden-source trim/offset/speed/loop control, RVFC-first active playback with RAF fallback only, same-tick video-frame notification coalescing, opt-in high-frequency video diagnostics, Rust external-video components, browser external-texture imports, `texture_external` sampling, current-layer z-index ordering, per-track opacity uniforms, crop/UV mesh rectangles, local transform scale/rotation/origin, normal/source-over blend proof, explicit advanced-blend rejection, and 1/2/4/10 plus focused 10-stream visual proof for source-backed video tracks | Final `<=18 ms` p95 acceptance and Phase E final validation remain open |
| Media texture resolver | `eVe/domains/rendering/bevy_media_texture_resolver.js`, `bevy_projection_adapter.js`, `bevy_renderer_adapter_registry.js` | Image/text/waveform/poster texture preparation and payload validation | RGBA payload contract remains for non-live media and must not become live video |
| Preview prototype | `eVe/domains/media/preview/webgpu_video_preview_renderer.js` | WebGPU preview with `texture_external` and `importExternalTexture` | Correct technique exists but is not integrated into project Bevy canvas |
| Bevy core ECS | `atome/renderers/bevy-core/src/plugin.rs`, `spawn.rs`, `render_ops.rs`, `types.rs`, `video_external_texture.rs`, `video_external_web.rs` | Shared Rust renderer core, nodes, ops, external-video mesh path, public browser video-track payloads, selection/waveform overlays | Native decoded video parity remains pending outside the browser route |
| Native/Tauri route | `eVe/domains/rendering/bevy_native_renderer_runtime.js`, `platforms/desktop-tauri/src/bevy_backend/*`, `platforms/desktop-tauri/src/server/mod.rs` | Native Bevy bridge, Axum media server, Tauri commands | Native route has presentability gating but no decoded video texture track path |
| Atome mutation | `eVe/core/atome_commit.js`, `eVe/domains/rendering/project_scene_mutation_runtime.js`, `project_scene_gesture_runtime.js` | Canonical commit pipeline, gesture frames, final set mutations | Gesture frames still persist asynchronously; probes must prove they do not block pointermove |
| Storage | `database/schema.sql`, `database/adole.js`, `server/atomeEventRoutes.js` | Append-only events, state_current projection, snapshots, sync queue | DB is correct as state authority, but must stay outside frame-critical rendering |
| Tests | `tests/eve/bevy_project_renderer_guards.test.mjs`, `tests/eve/project_scene_gesture_performance.test.mjs`, `tests/eve/unified_rendering_contract.test.mjs` | Guardrails for canvas ownership, drag, video copy, unified rendering | Current targeted suites are green; final video external-texture acceptance is accepted under the local browser-floor gate |

## 3. Flux de donnees actuels

Project rendering flow:

```text
records
-> normalizeProjectSceneRecords
-> createVirtualSceneTree
-> renderProjectSceneBevyProjection
-> startBevyWebRenderer or native bridge
-> Bevy core ECS
-> canvas#eve_surface_project
```

Evidence:

- `project_scene_runtime.js:97-104` builds the Virtual Scene.
- `project_scene_runtime.js:120-131` syncs video decode sources and calls Bevy
  projection.
- `project_scene_bevy_projection_runtime.js:51-63` diffs previous and next
  Virtual Scene.
- `bevy_web_renderer_runtime.js:571-623` starts the Web Bevy renderer.

Live video flow:

```text
video Atome
-> hidden HTMLVideoElement in #eve_bevy_video_decode_root
-> __EVE_BEVY_VIDEO_SOURCE_FOR_ID__
-> __EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__
-> AtomeVideoExternalTexture
-> RenderDevice::create_external_texture
-> BindingResource::ExternalTexture
-> texture_external shader sampling
```

Evidence:

- `bevy_video_decode_source_runtime.js:70-81` installs the JS lookup functions.
- `bevy_video_decode_source_runtime.js:171-181` creates the hidden video.
- `bevy_video_decode_source_runtime.js:189-224` syncs wanted video sources.
- `atome/renderers/bevy-core/src/video_external_texture.rs` owns the ECS
  component and mesh helpers.
- `atome/renderers/bevy-core/src/video_external_web.rs` imports and binds
  browser external textures in the Bevy render path.
- `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` samples
  `texture_external`.

Gesture flow:

```text
pointermove
-> surface_runtime dispatches drag.move/resize.move
-> project_scene_runtime routes to mutation runtime
-> project_scene_gesture_runtime updates runtime record
-> applyDirectRuntimeTransform
-> apply_atome_bevy_transform
-> request_atome_bevy_redraw
-> post-paint gesture_frame commit
```

Evidence:

- `surface_runtime.js:401-432` routes `pointermove` to gesture intents.
- `project_scene_runtime.js:298-300` routes move intents to mutation runtime.
- `project_scene_gesture_runtime.js:165-188` applies runtime frame and schedules
  commit flush.
- `project_scene_direct_transform_runtime.js:47-60` calls the direct Bevy
  transform path.
- `bevy_web_renderer_runtime.js:531-568` applies direct transform and redraw.

Storage flow:

```text
Atome.commit/commitBatch
-> WebSocket or HTTP event commit
-> database.appendEvent(s)
-> events append-only
-> applyEventToStateCurrent
-> state_current projection
```

Evidence:

- `atome_commit.js:1798-1970` implements single-event commit.
- `atome_commit.js:1972-2125` implements batch commit.
- `database/adole.js:1572-1621` appends one event in a transaction.
- `database/adole.js:1623-1687` appends batches in a transaction.
- `database/schema.sql:140-175` defines `events` and `state_current`.

## 4. Problemes critiques detectes

| ID | Gravite | Zone | Probleme | Preuve dans le code | Impact | Correction recommandee |
| --- | --- | --- | --- | --- | --- | --- |
| C-001 | P0 | Live project video | Post-C3 source path uses external texture sampling, browser visual proof, and final browser-floor 10-stream acceptance | `video_external_texture.rs`, `video_external_web.rs`, and `video_external.wgsl` own the external-texture route; `temp/probe_reports/bevy_project_video_visual_probe/report.json`, the 1/2/4/10 fluency reports, and `temp/probe_reports/bevy_canvas_fluency_probe_video10_stable_window_metrics/report.json` prove project-canvas output without visible DOM video overlays, readbacks, 2D canvas draws, or live video copies | Full browser video engine delivery is accepted for the local WebGPU path | Keep the GPU-first route and browser-floor fluency evidence green |
| C-002 | P0 | Bevy video API | Post-C2 repaired: exported live video track API exists | `platforms/web/bevy-renderer/src/exports.rs` exposes `apply_atome_bevy_video_track`, `remove_atome_bevy_video_track`, and `update_atome_bevy_video_transform`, each queuing a real video-track render op | Provides the canonical browser/WASM entry points for live video track application, removal, and transform | Keep the exports wired to the existing Bevy external-texture path and validate them in C3 |
| C-003 | P0 | Bevy ECS model | Post-C2 repaired for browser source-backed video | `spawn.rs`, `render_ops.rs`, `video_external_texture.rs`, and `video_external_web.rs` route live video through a mesh/external-texture path instead of `Sprite<Image>` frame uploads | Removes the forced image-texture ownership for source-backed live playback | Keep image/poster RGBA routing separate from live video and extend only through the video-track API task |
| C-004 | P0 | Redraw scheduling | Post-audit repaired: transform-only diffs no longer schedule delayed redraw primes | `bevy_web_renderer_runtime.js` routes transform-only diffs through one redraw request, `bevy_web_presentation_runtime.js` owns the remaining presentation primes, and `tests/eve/bevy_project_renderer_guards.test.mjs` covers the contract | Reduces delayed redraw backlog during drag/resize | Keep this guard green while preserving primes for start, resize, spawn/resource, and text/media priming |
| C-005 | P0 | Instrumentation | Post-audit repaired: maintained probes now exist | `temp/webgpu_external_video_probe.mjs`, `temp/bevy_canvas_fluency_probe.mjs`, `temp/bevy_fluency_probe/`, and `temp/browser_raf_floor_probe.mjs` write JSON reports and project-canvas PNG captures under `temp/probe_reports/` where applicable | The 1/2/4/10 stream and drag/resize targets are measurable with visual canvas/DPR evidence; stable-playback frame windows are reported directly in `metrics.stable_playback`; repeated Google Chrome system 10-stream reruns and blank-browser RAF-floor diagnostics show the app p95 is at the local Chrome scheduling floor | Keep useful diagnostics under `temp/` and remove obsolete experiments only after final replacement work |
| C-006 | P1 | WebGPU resilience | Post-audit repaired at the JS diagnostics boundary: active Bevy canvas context lost/restored events are recorded without creating a recovery renderer | `bevy_web_presentation_runtime.js` installs `installBevyWebGpuContextDiagnostics`, `bevy_web_renderer_runtime.js` records runtime canvas status, and `tests/eve/bevy_web_renderer_runtime.test.mjs` simulates context lost/restored events | Device/context loss now has structured evidence on the actual Bevy canvas, while full GPU resource recreation still belongs to the Bevy/wgpu backend owner | Keep the diagnostics green and add backend-level device recovery only inside the existing Bevy renderer owners |
| C-007 | P1 | Contract tests | Post-audit repaired: `unified_rendering_contract` passes for the current Bevy route | `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs` passes 14/14 | Restores the broad regression guard for canvas ownership, gestures, selection, and text bridge behavior | Keep it as a green gate for future rendering changes |
| C-008 | P1 | Hidden video in tests | Post-audit repaired: jsdom no longer receives an inert `video.load()` call | `bevy_video_decode_source_runtime.js` gates `load()` by media runtime, and the unified contract no longer logs the jsdom error | Removes noisy test output without adding a product fallback path | Keep browser `load()` active and avoid test-only product APIs |
| C-009 | P1 | RGBA contract | Post-audit guarded: RGBA payloads remain for image/text/waveform/poster media, not source-backed live video | `tests/eve/bevy_project_renderer_guards.test.mjs` proves source-backed video rejects before `drawImage`/`getImageData`, and `bevy_media_resource_runtime.js` maps video resources without `withResolvedMediaTexture` | Prevents regression to CPU readback live playback while the external-texture backend remains the accepted browser route | Keep this guard green and keep poster/debug extraction separate from live playback |
| C-010 | P2 | Native route | Native Bevy bridge maps resources but has no native decoded video track | `bevy_native_renderer_runtime.js:219-308`; `platforms/desktop-tauri/src/bevy_backend/bridge.rs` search has no video track API | Browser and Tauri video paths can diverge later | Define browser/native live video contracts together before implementation |
| C-011 | P0 | Browser Bevy/wgpu backend | Post-C3 backend, draw-frame import path, public track API, z-index ordering, opacity, crop/UV mesh rectangles, local transform scale/rotation/origin, timeline field projection with trim/speed visual validation, 1/2/4/10 stream-count visual proof, normal/source-over blend, explicit advanced-blend rejection, same-tick video-frame notification coalescing, RVFC-first playback pumping, no-extra-wake video redraw application, opacity-zero hidden decode resources, production-default opt-in high-frequency diagnostics, and final browser-floor acceptance exist | `atome/renderers/wgpu-web-external-texture/` owns the maintained `wgpu 27.0.1` / `wgpu-types 27.0.1` fork; `bevy_video_decode_source_runtime.js` applies derived video timeline fields to the fully transparent hidden source before external-texture import and uses `requestVideoFrameCallback` with RAF fallback only; `bevy_web_presentation_runtime.js` coalesces same-tick video frame notifications; `bevy_perf_diagnostics_runtime.js` keeps external render and video-frame event logs opt-in by default; `temp/bevy_canvas_fluency_probe.mjs` records JSON metrics plus project-canvas PNG/DPR proof for 1/2/4/10 stream scenarios and repeated Google Chrome system 10-stream acceptance attempts; focused 10-stream reports validate all expected video regions, reduce wake calls from `6433` to `731`, and `temp/probe_reports/bevy_canvas_fluency_probe_video10_stable_window_metrics/report.json` remains visually `ok:true` with global frame `p95 18.2 ms`, stable playback after pointer +1500 ms `p95 18.1 ms`, last 6000 ms `p95 18.2 ms`, and zero frames over 24/34/50 ms; blank-browser RAF floor reports measure `p95 18.2-18.3 ms`; `video_external_web.rs` imports and binds browser external textures, sorts external-video phase items by extracted compositor layer, and binds per-video opacity uniforms; `video_external_texture.rs` rebuilds external-video mesh UVs from canonical `uv_rect`; `render_math.rs` and `render_ops.rs` apply canonical local transform fields through Bevy `Transform`; `platforms/web/bevy-renderer/src/lib.rs` reports schema `atome.bevy.web.video_backend.v6` with true Web `wgpu` create/source/resource support, live backend `gpu_external_texture_texture_external`, `gpu_external_texture_import:true`, `texture_external_sampling:true`, `video_track_api_exposed:true`, `current_backend_final:true`, and blocker `none` | The backend/API/C3/z-index/opacity/crop/transform/timeline/stream-count/blend/scheduling and final browser-floor acceptance blockers are closed for the local WebGPU path | Keep final browser-floor fluency evidence green |

## 5. Problemes de performance

| ID | Zone | Symptome probable | Cause technique | Fichiers concernes | Correction | Gain attendu |
| --- | --- | --- | --- | --- | --- | --- |
| P-001 | Live video | 10-stream visual route passes and is accepted at the local browser RAF floor | Source-backed live video imports external textures in the render path; the 1/2/4/10 stream fluency reports are green for visual route, no readbacks, and no copies; one Chrome system run reached frame `p95 17.7 ms`; the latest stable-window visual recheck reports `visual_ok:true` with 10 detected video regions, zero visible project media DOM nodes, zero readbacks/copies, global frame `p95 18.2 ms`, stable playback after pointer +1500 ms `p95 18.1 ms`, last 6000 ms `p95 18.2 ms`, and zero frames over 24/34/50 ms; blank RAF-floor probes report `p95 18.2-18.3 ms` without app code across default system Chrome, no-Vulkan/Skia, Metal-angle, default bundled Chromium, and headless bundled Chromium launch variants; user accepted this browser-floor-equivalent result on 2026-06-13 | `video_external_web.rs`, `video_external_texture.rs`, `bevy_video_decode_source_runtime.js`, `bevy_web_presentation_runtime.js`, `bevy_perf_diagnostics_runtime.js`, `platforms/web/bevy-renderer/src/lib.rs`, `temp/bevy_canvas_fluency_probe.mjs`, `temp/browser_raf_floor_probe.mjs`, `temp/probe_reports/bevy_canvas_fluency_probe_video10_stable_window_metrics/report.json`, `temp/probe_reports/browser_raf_floor_probe_default_rerun/report.json`, `temp/probe_reports/browser_raf_floor_probe_no_vulkan_skia/report.json`, `temp/probe_reports/browser_raf_floor_probe_angle_metal/report.json`, `temp/probe_reports/browser_raf_floor_probe_playwright_chromium_default/report.json`, `temp/probe_reports/browser_raf_floor_probe_headless_default/report.json` | Keep the visual region probe and focused scheduling tests green | Closed under accepted browser-floor validation |
| P-002 | Drag/resize | Jank after movement or delayed redundant frames | Redraw primes at 0/16/64/180ms are scheduled for generic diffs | `bevy_web_presentation_runtime.js` owns primes, and `bevy_web_renderer_runtime.js` bypasses them for transform-only diffs | No primes for transform-only diffs | Lower timer backlog and redraw count during interaction |
| P-003 | Gesture commits | Pointer movement can be affected if async commits accumulate | Gesture frames are queued post-paint, then committed through `commitBatch` | `project_scene_gesture_runtime.js:121-163`, `atome_commit.js:1972-2125` | Probe pointermove duration, commit timing, and network/DB isolation | Evidence that persistence is outside the critical path |
| P-004 | Text/media texture | Texture creation can occur during resize/text updates | Text transform with size change re-rasterizes texture; resolver uses 2D canvas/readback | `bevy_web_renderer_runtime.js`, `bevy_media_resource_runtime.js`, `bevy_media_texture_resolver.js` | Keep pure move texture-free; measure resize separately | Preserve smooth drag while accepting resize cost |
| P-005 | Preview prototype | Preview caps resolution and frame rate | `MAX_CANVAS_EDGE = 1280`, `TARGET_FRAME_INTERVAL_MS = 1000 / 30` | `webgpu_video_preview_renderer.js:6-8` | Do not use preview numbers as project acceptance proof | Avoid false confidence from preview downscaling/throttling |
| P-006 | Bevy loop | Post-audit repaired: the web renderer no longer uses continuous Winit updates by default and no longer double-wakes after applying video-frame redraw notifications | `platforms/web/bevy-renderer/src/lib.rs` uses Bevy reactive desktop-app Winit settings, explicit EventLoopProxy wakeups, `RequestRedraw`, video-frame redraw counters, and a single wake path for queued video-frame notifications | `platforms/web/bevy-renderer/src/lib.rs`, `platforms/web/bevy-renderer/src/tests.rs` | Rerun fluency probes with `wake_calls`, `redraw_applied`, and video-frame redraw diagnostics under playback and idle | Idle loop and redundant wake cost are no longer hidden by continuous updates; remaining misses can be separated from video copy pressure |

## 6. Problemes de fiabilite

| ID | Zone | Risque | Declencheur | Impact | Correction |
| --- | --- | --- | --- | --- | --- |
| R-001 | WebGPU device | Device loss is not observed in active project code | GPU reset, tab sleep, memory pressure | Blank/stale canvas with no structured recovery | Add diagnostics/recreate path in Bevy/WebGPU owner |
| R-002 | Hidden decode videos | jsdom/test environments emit unimplemented `load()` errors | `video.load?.()` on jsdom HTMLVideoElement | Noisy test output and possible false negatives | Make decode source creation test-compatible while preserving browser behavior |
| R-003 | Large scenes | Diff/apply ops can queue many texture/resource changes | Many videos/images/text nodes spawn or resource update | Delayed rendering, memory pressure | Add probe counters for ops, texture creates, copies, imports, and skipped copies |
| R-004 | Background tabs | RAF/video callbacks can slow or stop | Tab hidden or WebView backgrounded | Video frame version and redraw cadence diverge | Track RAF gaps and video frame callback gaps in probe reports |
| R-005 | Storage recovery | Corrupt/empty DB can break state hydration | `state_current` missing or stale | Project records absent or stale after reload | Keep append-only replay as repair path; test rebuildStateCurrentFromEvents |
| R-006 | Native/browser divergence | Tauri native path lacks live decoded texture parity | Native presentable renderer enabled | Browser fixes do not apply to desktop | Define shared `AtomeVideoTrack` payload and separate native/browser backends |

## 7. Analyse de la strategie actuelle d'affichage

The current display strategy is Bevy-first for the project surface. This is the
right direction and must be preserved.

Positive evidence:

- `project_scene_gesture_performance.test.mjs` passed 11/11 and proves direct
  Bevy transforms during drag plus one `canvas#eve_surface_project`.
- `tests/eve/bevy_project_renderer_guards.test.mjs:39-96` locks external
  renderers away from the project canvas and currently asserts the Rust copy
  path.
- `platforms/web/bevy-renderer/src/lib.rs:239-255` creates a Bevy window bound
  to the target canvas with opaque alpha.
- `platforms/web/bevy-renderer/src/lib.rs:197-225` drains queued ops, redraw
  requests, and video frame notifications through Bevy.

The weak point is live video. The renderer uses Bevy, but the live frame source
is still an HTML video element copied into a Bevy texture. That path is not a
DOM overlay and not a visible canvas fallback, but it is also not the final
external texture architecture.

The preview renderer proves the browser-side technique:

- `webgpu_video_preview_renderer.js:75-105` declares `texture_external` and
  samples it with `textureSampleBaseClampToEdge`.
- `webgpu_video_preview_renderer.js:315-338` imports the external texture and
  submits the draw.

That code must be treated as a reference, not as a second product renderer for
the project.

## 8. Analyse de la strategie de stockage des atomes

The storage model is aligned with the Atome rule set:

- `database/schema.sql:11-16` says events are append-only durable history and
  `state_current` is a projection cache.
- `database/adole.js:1572-1621` writes one event and updates projection in one
  transaction.
- `database/adole.js:1623-1687` writes event batches and projection updates in
  one transaction.
- `database/adole.js:1509-1570` can rebuild `state_current` from events.

The rendering risk is not the database model itself. The risk is allowing any
DB/network refresh into the pointermove or frame upload path. Current gesture
code mitigates this by:

- updating runtime records synchronously during movement
  (`project_scene_gesture_runtime.js:170-174`);
- applying direct Bevy transforms before projection rebuilds
  (`project_scene_gesture_runtime.js:173-181`);
- committing gesture frames with `refreshState:false` and `syncFastify:false`
  (`project_scene_gesture_runtime.js:131-145`).

This still needs a maintained runtime probe because commit calls can accumulate
post-paint and affect the event loop even if they do not run inline inside the
pointermove handler.

## 9. Architecture recommandee

1. Stabilize the current Bevy project route first.

   - Remove delayed redraw primes from transform-only diffs.
   - Keep direct transforms through `apply_atome_bevy_transform`.
   - Add a guard that transform-only drag/resize does not schedule
     `bevy.redraw.prime.schedule`.

2. Restore instrumentation before deep video rewrites.

   - `temp/bevy_canvas_fluency_probe.mjs` must report FPS, p50/p95/p99, RAF
     gaps, pointermove duration, redraw requests, Bevy diagnostics, video
     copies, skipped copies, CPU readbacks, and DPR.
   - `temp/webgpu_external_video_probe.mjs` must prove external texture import
     behavior on the target browser/WebView.

3. Introduce a live video contract separate from RGBA textures.

   - Add `AtomeVideoTrack` or equivalent payload with id, source, transform,
     layer, opacity, crop/UV, blend mode, playback state, and timing fields.
   - Do not attach live video frames to `AtomeTexture { rgba }`.
   - Keep poster/image/text/waveform extraction in the existing resolver.

4. Implement the browser route in the Bevy project owner.

   - Reuse `bevy_web_renderer_runtime.js`,
     `bevy_video_decode_source_runtime.js`, `platforms/web/bevy-renderer/src/`,
     and the preview shader pattern.
   - Import external video textures in the frame where they are drawn.
   - Draw into `canvas#eve_surface_project` only.
   - Current verified constraint: the pinned `wgpu-27.0.1` web backend leaves
     `create_external_texture` unimplemented. Product code must not add a JS
     WebGPU side renderer to bypass this. The clean route is to make the
     existing Bevy/wgpu backend expose external textures or move to a version
     that does so, then wire the existing Bevy renderer owners.

5. Define the native route at the same contract boundary.

   - Tauri/Axum can keep serving media, but native Bevy needs a decoded texture
     owner equivalent to the browser external texture path.
   - The JS bridge should send track intent, not decoded RGBA frames.

## 10. Plan de reparation priorise

| Priorite | Action | Fichiers concernes | Impact | Effort | Risque | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Disable delayed redraw primes for transform-only diffs | `eVe/domains/rendering/bevy_web_renderer_runtime.js`, tests | Better drag/resize fluency | Low | Low | Gesture performance test plus new redraw-prime guard |
| P0 | Restore Bevy fluency probe | `temp/bevy_canvas_fluency_probe.mjs`, `temp/probe_reports/...` | Measurable FPS/frame/commit/video evidence | Medium | Medium | JSON report with 1/2/4/10 stream scenarios |
| P0 | Restore external video prototype probe | `temp/webgpu_external_video_probe.mjs` | Proves browser external texture viability before product rewrite | Medium | Medium | Probe demonstrates import/draw/no readback |
| P0 | Define live video track payload | `bevy_projection_adapter.js`, `types.rs`, web/native bridge owners | Separates live video from RGBA images | Medium | Medium | Unit tests reject live RGBA route |
| P0 | Implement browser external texture project path | `bevy_web_renderer_runtime.js`, `bevy_video_decode_source_runtime.js`, `platforms/web/bevy-renderer/src/*`, shader assets | Removes live copy path | High | High | `cargo check`, `cargo test`, wasm build, selected media playback, fluency probe |
| P1 | Add device/context loss diagnostics | Active Bevy web owner and diagnostics runtime | Recoverability and observability | Medium | Medium | Done for JS canvas context diagnostics; backend device recovery remains part of the Bevy/wgpu owner |
| P1 | Maintain unified rendering contract suite | `tests/eve/unified_rendering_contract.test.mjs`, product code if needed | Keeps broad regression gate active | Low | Medium | Test stays green without weakening invariants |
| P1 | Maintain RGBA resolver as non-live only | `bevy_media_texture_resolver.js`, `bevy_projection_adapter.js`, tests | Prevents regressions to CPU readback live path | Low | Low | Static and runtime tests prove no video live `getImageData` |
| P2 | Align native video track contract | `bevy_native_renderer_runtime.js`, `platforms/desktop-tauri/src/bevy_backend/*` | Prevents browser/native divergence | High | Medium | Tauri command tests and native renderer checks |
| P2 | Update maps after ownership changes | `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md` | Keeps architecture discoverable | Low | Low | Map diff and source references |
| P3 | Document browser/WebView limits and remove obsolete experiments | `todo/eVe_video_engine.md`, `todo/WEBGPU_to_repair.md`, `temp/`, maps if ownership changed | Keeps the final state maintainable after P0/P1 work | Low | Low | No stale probe names outside maintained owners; browser limits documented |

## 11. Tests et instrumentation a ajouter

Required probes:

- `temp/webgpu_external_video_probe.mjs`
  - verifies `navigator.gpu`, adapter/device creation, external texture import,
    shader sampling, no `getImageData`, no RGBA frame array, and per-frame
    timing;
  - writes `temp/probe_reports/webgpu_external_video_probe/report.json`.
- `temp/bevy_canvas_fluency_probe.mjs`
  - owns the executable entry point, with cohesive helper modules under
    `temp/bevy_fluency_probe/` for configuration, browser instrumentation,
    scene setup, and metrics;
  - drives shapes/images/text/videos in the real project canvas;
  - records average FPS, p50/p95/p99, long frames over 24/34/50 ms, RAF gaps,
    pointermove count, transform patch count, commits during movement, video
    copies, skipped copies, external imports, CPU readbacks, redraws, CSS size,
    pixel size, and DPR;
  - writes `temp/probe_reports/bevy_canvas_fluency_probe/report.json` and
    `timeline.json`.
  - also writes maintained B5 scenario reports for mixed non-video content and
    videos with frame-version lookup disabled.

Regression tests:

- Add a guard that transform-only diffs call `request_atome_bevy_redraw` once
  and never schedule `bevy.redraw.prime.schedule`.
- Add a guard that live video nodes do not pass through
  `bevy_media_texture_resolver.js` `getImageData`.
- Replace the current guard in `bevy_project_renderer_guards.test.mjs:92-95`
  after the external path exists; it currently asserts the old copy path.
- Repair `unified_rendering_contract` so the broad contract is green again.

Validation status from this audit:

| Command | Result | Notes |
| --- | --- | --- |
| `rg "webgpu|wgpu|canvas|bevy|atom|atoms|raster|render|texture|buffer|pipeline|database|db|storage|cache|dirty|resize|viewport|requestAnimationFrame"` | Executed with scoped repository paths; output was too large, then narrowed with targeted `rg` searches | Confirmed copy path, preview external texture path, missing probes, missing device-loss handler |
| `cargo check` from repository root | Failed | No `Cargo.toml` exists at repo root |
| `cargo test` from repository root | Failed | No `Cargo.toml` exists at repo root |
| `cargo check` in `atome/renderers/bevy-core` | Passed | Finished dev profile in 6m32s |
| `cargo test` in `atome/renderers/bevy-core` | Passed | 10 tests passed |
| `cargo check` in `platforms/web/bevy-renderer` | Passed | Finished dev profile in 8.13s |
| `cargo test` in `platforms/web/bevy-renderer` | Passed | 9 tests passed, including explicit video backend capability reporting |
| `npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs` | Passed | 11 tests passed |
| `npm run test:run -- tests/eve/bevy_project_renderer_guards.test.mjs` | Passed | 4 tests passed, including live video RGBA resolver rejection |
| `npm run test:run -- tests/eve/unified_rendering_contract.test.mjs` | Passed | 14 tests passed after aligning the contract with the current Bevy project route |
| `npm run check:syntax` | Passed | 716 files checked |

## 12. Liste des hypotheses a verifier

| Hypothese | Pourquoi c'est suspect | Comment verifier |
| --- | --- | --- |
| Browser Bevy/wgpu can sample `GPUExternalTexture` directly in the project canvas | Post-C2 source code now owns the Bevy external-texture path; runtime browser/readback evidence is still required before final acceptance | Run C3 playback validation and a browser readback/probe against `canvas#eve_surface_project` |
| The delayed redraw primes are a measurable drag jank source | They are scheduled for every non-playback diff, including transform-only fallback diffs | Add redraw-prime guard and measure `bevy.redraw.prime.schedule/fire` during drag |
| Gesture frame commits do not block pointermove in real browser/Tauri | Tests show no commit before animation-frame flush, but async post-paint commits still share the event loop | Fluency probe must count pointermove duration and commits during movement |
| External-texture video must prove the 10-stream target | Source-backed live video no longer uses the copy route, but performance is not proven by architecture alone | Compare 1/2/4/10 streams with the maintained fluency probe after track exports and C3 validation |
| The preview external texture code can be reused without a second visible renderer | It owns its own canvas/device today and caps frame rate/size | Extract only shader/import knowledge; do not reuse preview canvas as product route |
| `unified_rendering_contract` failures are partly stale expectations | Gesture tests now expect gesture_frame + final set, while unified contract expects one commit | Review each failed assertion against current architecture, then update product or test only with proof |
| Native Tauri can expose decoded video textures at the same contract boundary | Current bridge only maps generic Bevy ops/resources | Prototype native video track op before adding browser-only APIs |

Backend constraint result, 2026-06-13:

- Pure JavaScript WebGPU external video import/draw is verified by
  `temp/probe_reports/webgpu_external_video_probe/report.json`
  (`imports: 90`, `draws: 90`, `import_failures: 0`, GPU readback non-empty).
- The current Bevy/WASM product stack depends on `wgpu = 27.0.1` through
  `atome/renderers/bevy-core/Cargo.toml` and
  `platforms/web/bevy-renderer/Cargo.lock`.
- Upstream `wgpu-27.0.1/src/backend/webgpu.rs` explicitly leaves web
  `create_external_texture` unimplemented. C1 therefore introduced the
  maintained `atome/renderers/wgpu-web-external-texture/` fork instead of a
  JavaScript side compositor.
- Local Cargo registry inspection found no newer cached `wgpu` crate to adopt:
  only upstream `wgpu-27.0.1` was present at audit time, and its web backend
  also left external texture binding resources, external texture drop, and
  external texture interface label handling unimplemented.
- `wgpu::ExternalTextureDescriptor` in `wgpu-types-27.0.1/src/lib.rs` is a
  plane-based descriptor consumed with `&[&TextureView]`; the native core path
  maps those planes through `device_create_external_texture`. It is not a
  direct browser video-source import equivalent to
  `GPUDevice.importExternalTexture({ source: HTMLVideoElement })`. The direct
  browser video source API exposed by upstream pinned `wgpu` is
  `CopyExternalImageSourceInfo` / `ExternalImageSource::HTMLVideoElement`, which
  fed the old `copy_external_image_to_texture` path.
- `tests/eve/bevy_project_renderer_guards.test.mjs` now prevents the exposed
  public API from becoming a facade: with the maintained `wgpu 27.0.1` backend
  fork and real product draw path wired into Cargo, the generated wasm must
  expose
  `apply_atome_bevy_video_track`, `remove_atome_bevy_video_track`,
  and `update_atome_bevy_video_transform`, and the Rust exports must queue
  `VideoTrackApply`, `VideoTrackRemove`, and `VideoTrackTransform` ops.
- `platforms/web/bevy-renderer` now exposes
  `read_atome_bevy_video_backend_capabilities()` so the product can inspect the
  actual backend state: schema `atome.bevy.web.video_backend.v6` reports target
  `gpu_external_texture_texture_external`, current product video backend
  `gpu_external_texture_texture_external`, `current_backend_final:true`,
  `video_track_api_exposed:true`, browser
  `GPUDevice.importExternalTexture` availability, true Web `wgpu`
  external-texture create/source/resource support from the maintained fork,
  blocker `none`, true
  `gpu_external_texture_import` and `texture_external_sampling`, and false
  `rgba_live_payload` and `visible_dom_video_overlay`.
- Post-build Chrome stable validation confirms that final state:
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_final_accepted_contract_chrome_stable6s/report.json`
  is `ok:true` with 10 project video records, one
  `canvas#eve_surface_project`, schema `atome.bevy.web.video_backend.v6`,
  `current_backend_final:true`, `backend_blocker:none`, zero CPU readbacks,
  zero 2D canvas draws, zero video copies, `average_fps 60.006`, frame
  `p95 18.2 ms`, stable-playback after pointer +1500 ms `p95 18.2 ms`, last
  6000 ms `p95 18.2 ms`, zero frames over 24/34/50 ms, zero long tasks, and
  pointer `p95 1.6 ms`; the paired
  `temp/probe_reports/bevy_canvas_fluency_probe_video10_final_accepted_contract_chrome_stable6s/project_canvas.png`
  was visually inspected and shows 10 videos rendered inside the Bevy canvas.
- `atome/renderers/bevy-core/src/video_diagnostics.rs` now owns structured
  copy-path diagnostics for legacy/copy-pressure measurement. The web renderer
  exports `read_atome_bevy_video_copy_diagnostics()` and
  `reset_atome_bevy_video_copy_diagnostics()`, and the fluency probe reads
  those counters so copy pressure and skip reasons are measurable without
  inventing a video-track facade.
- A compliant product implementation must now complete C3 and later compositing
  work through the existing Bevy renderer owners; using the preview renderer or
  a new JavaScript WebGPU compositor for the project canvas would be a parallel
  renderer and is forbidden.

B5 isolation result, 2026-06-13:

- `temp/probe_reports/bevy_canvas_fluency_probe_mixed_non_video10/report.json`
  created 4 images, 3 shapes, and 3 text Atomes with `video_count: 0`; it
  reported `average_fps: 60.053`, `frame_p95_ms: 18.5`,
  `frames_over_24_ms: 0`, and `cpu_readbacks: 0`.
- `temp/probe_reports/bevy_canvas_fluency_probe_video10_copies_disabled/report.json`
  imported 10 video Atomes with video frame-version lookup disabled during
  measurement; it reported `average_fps: 58.217`, `frame_p95_ms: 18.6`,
  `frames_over_24_ms: 1`, and `cpu_readbacks: 0`.
- Both Chromium headless reports logged `No available adapters` /
  `Unable to find a GPU`, with Bevy diagnostics showing queued operations but
  no applied redraw drain. The reports isolate JavaScript projection,
  interaction, and queue pressure; they are not final GPU presentation proof.
- `temp/probe_reports/bevy_canvas_fluency_probe_chrome_video10_webgpu/report.json`
  used local Google Chrome with WebGPU launch flags and reported 10 video
  Atomes, `drained_ops: 108`, `redraw_applied: 119`, no GPU adapter errors, no
  CPU readbacks, and `video_copies: 3`. Timing remained below target:
  `average_fps: 59.035`, `frame_p95_ms: 18.5`, and one frame over 34 ms.
- `temp/probe_reports/bevy_canvas_fluency_probe_chrome_video10_copies_disabled_webgpu_v3/report.json`
  used the same Chrome/WebGPU route with the probe copy gate active and reported
  10 video Atomes, `drained_ops: 110`, `redraw_applied: 124`, no GPU adapter
  errors, no CPU readbacks, and `video_copies: 0`. Timing still remained below
  target: `average_fps: 59.046`, `frame_p95_ms: 18.6`, and one frame over
  34 ms.
- `temp/probe_reports/bevy_canvas_fluency_probe_chrome_mixed_non_video10_webgpu/report.json`
  used the same Chrome/WebGPU route with 4 image, 3 shape, and 3 text Atomes.
  It reported `drained_ops: 89`, `redraw_applied: 80`, no GPU adapter errors,
  no CPU readbacks, and `video_copies: 0`. It reached
  `average_fps: 60.006`, but still reported `frame_p95_ms: 18.5`, so the
  current p95 miss is not explained by live video copies alone.

Render-loop repair, 2026-06-13:

- `platforms/web/bevy-renderer/src/lib.rs` now uses Bevy
  `WinitSettings::desktop_app()` instead of `WinitSettings::continuous()`.
- The existing EventLoopProxy wake path remains the owner for queued WASM ops,
  explicit redraw requests, and hidden video-frame notifications.
- `platforms/web/bevy-renderer/src/tests.rs` now guards the reactive Winit
  contract and verifies accepted/applied video-frame redraw counters.
- `temp/probe_reports/bevy_canvas_fluency_probe_reactive_video2_webgpu/report.json`
  was captured after the repair with local Chrome/WebGPU, 2 video Atomes, and
  the active application route. It completed with `ok:true`,
  `average_fps: 59.613`, `frame_p95_ms: 18.6`, `wake_calls: 284`,
  `redraw_applied: 72`, `video_frame_notifications: 0`,
  `video_frame_redraws: 0`, `video_copies: 0`, and
  `skip_missing_frame_version: 160`. This proves the reactive loop diagnostics
  are visible in the maintained probe; the probe must be rerun after the
  C3 validation to measure the external-texture backend under the final product
  API.
- The Chrome/WebGPU mixed non-video baseline should be rerun after this change
  to separate browser timing noise, Bevy present behavior, idle loop cost, and
  video-specific work.

## 13. Conclusion technique

Phase A is closed as an audit gate: the files, flows, risks, repairs, and
validation state are now explicit. Redraw-prime gating, diagnostics, and the
reactive Web Bevy loop are now repaired enough to rerun fluency probes without
an idle continuous loop masking cost. The decisive next implementation step is
now C3 browser/runtime validation on top of the existing Bevy external-texture
route and public live video-track API.

The project is on the correct Bevy-only presentation route, but it is not yet a
GPU-first live video engine. The decisive remaining work is to replace live
video texture copying with an external texture/video track path that renders
inside `canvas#eve_surface_project` and is proven by 10-stream metrics.
