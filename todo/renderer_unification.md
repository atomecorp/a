# Renderer Unification — Consolidate All Atome Video/Media Rendering onto Bevy

Status: Planning (no code yet)
Owner intent: One GPU renderer for all Atome content (project scene, media, previews). Everything except menu/UI chrome must render through Bevy + WebGPU canvas, and nothing else.
Authority: This plan is subordinate to `.codex/AGENTS.md`. If any action below conflicts with a rule there, stop and report the conflict; do not weaken the rule.

---

## 1. Objective and hard constraints

Goal: collapse the **four** independent WebGPU video/media render paths into the **single Bevy renderer**, delete the redundant code, and preserve every existing feature (scrub, seek, trim/offset/speed/loop, A/V sync, multi-clip compositing, transforms, opacity, crop, selection overlay, text layer, live camera preview, platform frame workarounds, health diagnostics).

Binding constraints (from the engagement brief + `.codex/AGENTS.md`):
- All Atome rendering (everything except menu/UI chrome) MUST use Bevy + WebGPU exclusively. No second renderer, no JS side compositor, no canvas-per-Atome.
- No fallback of any kind (runtime/data/control-flow). Missing dependencies must raise explicit errors. Only allowed fallbacks: `eveT(key, fallback)` and `ui.label_fallback`.
- Every touched file must be cleaned, factorized, and reduced; reuse existing functions instead of creating equivalents; delete dead/duplicated/unreachable code.
- WebGPU-first, DOM-minimal, canonical-state-outside-DOM, deterministic replay preserved.
- Git is read-only. Temp artifacts only under `./temp`. Persistent tests only under `./tests`.
- Update `maps/` when ownership, API, rendering contract, or structure changes.
- This whole plan is a `rendering change` + `cleanup/refactor` + `legacy removal` + `state/mutation` touchpoint → apply the strict union of AGENTS modules 01–07, and re-read `07-future-code-guardrails.md` before each coding step.

---

## 2. Current state — the four render paths

| # | Path | Owner files | Canvas / role | Frame upload | Target color space | Status |
|---|------|-------------|---------------|--------------|--------------------|--------|
| 1 | **Bevy project surface** (target) | `atome/renderers/bevy-core/assets/shaders/video_external.wgsl`, `src/video_external_texture.rs`, `src/video_external_web.rs`, `platforms/web/bevy-renderer/`, `atome/renderers/wgpu-web-external-texture/` | shared project canvas | `importExternalTexture` | sRGB (`bevy_default()`, non-HDR `Camera2d`) | Web-only; canonical target |
| 2 | **Molecule per-atome** | `eVe/core/media_engine/molecule.webgpu.js` (338 L), `molecule.api.js`, `eVe/intuition/runtime/media_mount_runtime.js` | `canvas[data-role="eve-media-api-webgpu-canvas"]` (one per Atome) | `copyExternalImageToTexture(new VideoFrame(...))` | non-sRGB (`getPreferredCanvasFormat`, `rgba8unorm`) | Redundant + forbidden canvas-per-Atome |
| 3 | **MTrax timeline preview** | `eVe/intuition/tools/core/mtrax_renderer_webgpu_adapter.js` (4551 L) | `mtrax-gpu-overlay` / `mtrax-c2d-overlay` / `mtrax-c2d-text-layer` | `copyExternalImageToTexture` | non-sRGB | Legacy MTrax; rich timeline logic |
| 4 | **Live recording preview** | `eVe/domains/media/preview/webgpu_video_preview_renderer.js` (427 L), `video_preview_renderer.js`, `eVe/domains/media/api/video_recording_controller.js` | `eve-video-preview-webgpu-canvas` | `importExternalTexture` | non-sRGB | Separate concern (camera stream) |

Why duplication exists today (evidence, not assumption):
- Bevy's external-texture video renderer is gated `#[cfg(target_arch = "wasm32")]` (`video_external_texture.rs:27-28`) and there is **no native equivalent** (no video path under `platforms/desktop-tauri/src` or `platforms/ios/bevy-renderer/src`). Native (Tauri/iOS) therefore relies on paths #2/#3.
- `maps/ARCHITECTURE_MAP.md:176` records the upstream gap: web `create_external_texture` / `BindingResource::ExternalTexture` are unimplemented in `wgpu 29.0.3` / `bevy_render 0.19.0-rc.3` trunk (checked 2026-06-13), which is why the maintained `wgpu 27.0.1` fork exists for the web Bevy path only.

The maintainers already committed to Bevy-only project rendering: `maps/ARCHITECTURE_MAP.md:176`, `maps/CODEMAP.md:1241`, `maps/API_MAP.md:336` all state the project video route must not be solved with a JS side compositor or a canvas-per-Atome, and that direct JS `GPUExternalTexture` paths are "diagnostics/reference only." This plan executes that committed direction.

---

## 3. What Bevy ALREADY provides (reuse, do not recreate)

Confirmed in `atome/renderers/bevy-core/src/render_ops.rs` + `types.rs` + the JS bridge:
- Render kinds already handled by Bevy: `video`, `image`, `audio_waveform`, `text`, `shape`.
- Video track API: `apply_atome_bevy_video_track`, `remove_atome_bevy_video_track`, `update_atome_bevy_video_transform` (`platforms/web/bevy-renderer/src/exports.rs`) → real `AtomeRenderOp::VideoTrackApply/Remove/Transform`.
- Per-track payload: id, source, position, size, layer (z-order), opacity, normalized `uv_rect` crop, local transform `scale` / `rotation` / `origin` (`types.rs` `AtomeVideoTrack` / `AtomeVideoTransform`).
- Timeline control already on the Bevy bridge: `eVe/domains/rendering/bevy_video_decode_source_runtime.js` applies trim seek, trim end/loop, offset, playback speed, status diagnostics, **RVFC-first** active playback pumping, RAF only where RVFC is missing.
- Frame-notification coalescing: `bevy_web_presentation_runtime.js`.
- Color correctness: `video_external.wgsl` now linearizes the sample before the sRGB target (guarded by `tests/eve/bevy_project_renderer_guards.test.mjs`).

Implication: most of MTrax/Molecule compositing semantics (multi-track, transform incl. rotation, opacity, crop, layering, source-over blend, trim/offset/speed/loop) already have a canonical Bevy owner. Consolidation is mostly **routing + deletion**, plus the native video path (Section 5) and a few features to relocate (Section 4).

---

## 4. Functionality inventory to PRESERVE (do not lose any of these)

From path #2 — `molecule.webgpu.js`:
- Multi-layer compositing with normalized `rect {x,y,w,h}` and per-layer `opacity`.
- Both **video** and **image (ImageBitmap)** layers.
- Premultiplied source-over blend; transparent clear.
- Layer-resource cache keyed by `layer.key/id`, with eviction of inactive layers.
- Adapter acquisition with power-preference retries (re-express as explicit error on failure, not a render fallback).

From path #3 — `mtrax_renderer_webgpu_adapter.js` (the richest; relocate, don't delete blindly):
- **Multi-clip timeline composition** (566+ clip references) with z-order/layering.
- **Playhead / scrub / seek** (incl. seek-only-when-behind logic to avoid seek storms).
- **Per-clip transform**: position, scale, **rotation**, origin.
- **Per-clip opacity**.
- **A/V sync**: Kira audio clock vs AVFoundation video clock drift handling via `playbackRate` proportional controller; muted GPU-source `<video>` on Tauri.
- **Tauri / WKWebView frame-rasterization workarounds** (in-flow sizing so the decoder produces real frames; black-frame avoidance).
- **Selection overlay** rendering + hit-testing in the preview surface.
- **Text layer** (`mtrax-c2d-text-layer`) and **C2D overlay** (`mtrax-c2d-overlay`) coexisting with the GPU overlay.
- **crossOrigin / `?token=` authenticated** media source loading (avoid tainted canvas / black reads).
- Composite + selection WGSL shaders.

From path #4 — `webgpu_video_preview_renderer.js`:
- **Live MediaStream** (camera) rendering before any project Atome exists.
- **Aspect-ratio letterbox crop** (crop uniform offset/scale).
- 30 fps throttle, ResizeObserver, DPR cap (1.5), max canvas edge 1280.
- **Black-frame health diagnostics** (tracks muted/ended, stagnant `currentTime`, paused/network state).
- Lifecycle: play/pause/stop, device + element teardown.
- External vs registry-owned stream ownership (`video_preview_renderer.js` acquire/release semantics — see `tests/eve/video_recording_preview_stream_contract.test.mjs`).

Any feature above that is NOT yet expressible through the Bevy video-track API becomes an explicit Bevy API addition (Section 6), implemented in the canonical Rust/Bevy owner first, then consumed.

---

## 5. The load-bearing blocker — native Bevy video path

Bevy video is web-only today. Before paths #2/#3 can be removed on Tauri/iOS, Bevy must render video natively. Open questions to resolve FIRST (investigation step, evidence-driven):

1. Does the Tauri build render the project via **wasm Bevy inside the webview** (same WebGPU context as `<video>`, so `importExternalTexture` works) or via **native wgpu** (`platforms/desktop-tauri` `bevy_renderer_core`, `bevy_native_renderer_runtime.js`)? This decides everything.
   - If webview-wasm: the web external-texture path may already work on Tauri/iOS webviews that support WebGPU + `importExternalTexture`; verify capability with `read_atome_bevy_video_backend_capabilities()`.
   - If native wgpu: `<video>` lives in the webview, Bevy in a separate native GPU context → no `importExternalTexture` across contexts. A native frame-upload path is required (e.g. `queue.write_texture` / `copyExternalImageToTexture`-equivalent from decoded frames), and the YUV→RGB + limited→full-range conversion must be done by wgpu (no browser). This is exactly what the `IDENTITY_YUV_CONVERSION` / `IDENTITY_GAMUT_CONVERSION` / transfer-function fields in `video_external_web.rs` scaffolded but never filled.
2. If native: source the correct BT.601/709 matrices + range expansion (same color-correctness class as the sRGB bug just fixed; verify with the same harness method under `temp/`).
3. Confirm whether the upstream wgpu gap (`maps/ARCHITECTURE_MAP.md:176`) still blocks a version bump, or whether the maintained fork must gain the native path too.

Do not delete any native video code until this path is implemented and validated on Tauri AND iOS.

---

## 6. Target architecture

- **One Bevy project surface** composites all project-scene Atomes (video/image/text/shape/waveform) — already the design per `maps/CODEMAP.md:1241`.
- **No canvas-per-Atome.** `eve-media-api-webgpu-canvas` is removed; media Atomes become Bevy nodes on the shared surface.
- **Preview surfaces** (timeline scrubber, recording preview) are either (a) Bevy nodes on the project surface, or (b) a distinct Bevy-owned render surface where a separate zone is genuinely required. AGENTS module 07 §1 allows "one matrix/preview rendering surface when visible" and "compositor-owned offscreen render targets" — so a second Bevy surface is compliant; a second *renderer* is not.
- **A/V sync, scrub, trim/offset/speed/loop** live in the canonical timeline/decode owners (extend `bevy_video_decode_source_runtime.js` and the Molecule timeline state), feeding Bevy — never a parallel compositor.
- **Selection / text overlay** for the timeline preview route through the existing Bevy overlay owners (`selection_overlay.rs`, the text WebGPU route), not a private C2D layer.
- **Live camera preview** feeds a Bevy node via `<video>.srcObject = stream` → external-texture import.

---

## 7. Staged execution plan

Each stage: smallest reproduction first, evidence-driven, validate before widening, remove dead code as you go, update maps, no fallback. Produce the AGENTS module 07 §11 progress report per numbered step.

### Stage 0 — DONE
- Single correct color path in Bevy (`video_external.wgsl` sRGB→linear) + regression guard. Keep as the validation baseline.

### Stage 1 — Web consolidation: remove Molecule per-Atome canvas (no native blocker)
1.1 Map every consumer that mounts media via `media_mount_runtime.js` / `molecule.api.js` → `createMoleculeWebGpuRenderer` and every reader of `eve-media-api-webgpu-canvas`.
1.2 Route those media Atomes through the Bevy project surface as video/image nodes (reuse `apply_atome_bevy_video_track` + image kind + `uv_rect`/opacity/transform). Add Bevy API only for genuinely missing features (e.g. image-layer parity) in the Rust owner first.
1.3 Delete `molecule.webgpu.js` and the per-Atome canvas creation; remove now-dead glue in `molecule.api.js` / `media_mount_runtime.js`.
1.4 Update probes that target `eve-media-api-webgpu-canvas` (`tests/probes/browser_media_acceptance_probe.js`, mtrack preview probes) to the Bevy surface.
1.5 Validate: `npm run probe:browser-media-acceptance`, `npm run probe:media-fixtures`, plus the color guard. Confirm zero canvas-per-Atome remains (DOM budget check, AGENTS §9).

### Stage 2 — Native Bevy video path (the real unlock)
2.1 Resolve Section 5 open questions with capability probes (`read_atome_bevy_video_backend_capabilities()`), under `./temp`.
2.2 Implement the native video upload + correct YUV/gamut/range conversion in `bevy-core` (fill the matrix/transfer fields; build the renderer for non-wasm targets). Reuse the existing `AtomeVideoExternalTexture` component/mesh/sort path; do not fork a second pipeline.
2.3 Validate color correctness natively with the harness method (recorded tv/untagged, tagged bt709, superman), Tauri + iOS.

### Stage 3 — Migrate MTrax timeline preview onto Bevy and retire path #3
3.1 Express timeline composition (multi-clip, transform incl. rotation, opacity, layer, crop) through Bevy video-track ops; relocate A/V sync + scrub/seek to `bevy_video_decode_source_runtime.js` / Molecule timeline state.
3.2 Move selection overlay to `selection_overlay.rs`; move text layer to the Bevy WebGPU text route; remove `mtrax-c2d-*` private layers.
3.3 Preserve Tauri/WKWebView frame-rasterization handling by relocating it to the decode-source owner (not a renderer).
3.4 Progressively rename/remove legacy `MTrax` references per AGENTS module 03; delete `mtrax_renderer_webgpu_adapter.js` once parity is proven.
3.5 Validate: mtrack preview probes (`tests/probes/mtrack_*_video_preview_probe.test.mjs`), `video_recording_preview_stream_contract`, scrub/seek/sync behavior on web + Tauri + iOS.

### Stage 4 — Live recording preview onto Bevy (last; lowest coupling)
4.1 Feed the camera `MediaStream` to a Bevy node (or a Bevy-owned preview surface). Preserve aspect crop, fps throttle, DPR cap, and black-frame health diagnostics (relocate diagnostics to a Bevy-side owner).
4.2 Keep stream acquire/release ownership semantics (contract: `tests/eve/video_recording_preview_stream_contract.test.mjs`).
4.3 Delete `webgpu_video_preview_renderer.js` + dead glue once parity is proven.

### Stage 5 — Cleanup, maps, guardrails
5.1 Remove all dead code, unused imports, and now-orphaned runtimes left by Stages 1–4.
5.2 Update `maps/ARCHITECTURE_MAP.md`, `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/DESIGN_MAP.md` to describe the single Bevy route and the removed paths.
5.3 Add/extend guardrails: assert no `eve-media-api-webgpu-canvas`, no `mtrax_renderer_webgpu_adapter`, no JS WebGPU compositor besides Bevy; keep the color guard.
5.4 Final DOM-budget + WebGPU-route validation (AGENTS §9 / §13).

---

## 8. Validation matrix (per stage)

- Color: the `temp/` WebGPU harness method (recorded tv/untagged, tagged bt709, superman) on each platform that changed.
- Vitest: `tests/eve/bevy_project_renderer_guards.test.mjs`, `tests/eve/video_recording_preview_stream_contract.test.mjs`, plus `npm run check:m0` / `check:m1` as scope widens.
- Probes: `npm run probe:browser-media-acceptance`, `npm run probe:media-fixtures`, `tests/probes/mtrack_*_video_preview_probe.test.mjs`.
- Rust/Bevy: `npm run cargo:bevy:check`, `npm run cargo:bevy:test`, and a fresh `platforms/web/bevy-renderer/build.sh` after any shader/Rust change (the shader is `include_str!`-baked into the wasm).
- UI: real-interaction validation per `atome/documentations/how_debug_UI.md` (scrub, seek, resize, selection, playback) — not visual-only.
- DOM budget: zero visible canvas-per-Atome on the main rendering path.

---

## 9. Risks and open questions

- **Native strategy (Section 5)** is the gating unknown; Stage 2 may be large (native YUV color correctness). Resolve before any native deletion.
- **Multi-surface Bevy on web** (if previews need a separate zone) — confirm Bevy can own >1 canvas/surface in this setup.
- **A/V sync relocation** (Kira/AVFoundation drift) is real behavior; regressions here are user-visible. Migrate with dedicated tests before deleting MTrax.
- **Live-preview timing**: camera stream exists before the project scene; ensure a Bevy node/surface can render it without coupling to project lifecycle.
- **Authenticated sources** (`?token=`): preserve crossOrigin handling to avoid tainted/black frames.
- Do not let any stage introduce a temporary second path "until later" — AGENTS forbids transitional adapters/shims. Each stage must end compliant.

---

## 10. Maps to update when structure/API/contract changes
`maps/ARCHITECTURE_MAP.md`, `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/DESIGN_MAP.md`.

## 11. Definition of done
- Exactly one GPU renderer (Bevy) draws all Atome content on web, Tauri, and iOS.
- `molecule.webgpu.js`, `mtrax_renderer_webgpu_adapter.js`, `webgpu_video_preview_renderer.js` and their per-Atome canvases are deleted; no JS WebGPU compositor remains beside Bevy.
- Every preserved feature in Section 4 works, proven by tests/probes/real-interaction.
- No fallback paths; missing deps raise explicit errors.
- Maps and guardrails updated; all validations in Section 8 pass.
