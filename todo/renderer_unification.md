# Renderer Unification — Consolidate All Atome Video/Media Rendering onto Bevy

Status: Approved — executing in validated increments.
Owner intent: One GPU renderer for all Atome content (project scene, media, previews). Everything except menu/UI chrome must render through Bevy + WebGPU canvas, and nothing else.
Authority: This plan is subordinate to `.codex/AGENTS.md`. If any action below conflicts with a rule there, stop and report the conflict; do not weaken the rule.

## VALIDATED DECISION (2026-06-16)
Target renderer = **Bevy compiled to WASM using the webview/browser WebGPU** (`startBevyWebRenderer` / `squirrel_bevy_renderer`), on **every** platform: browser, Tauri (Axum:3000), iOS, AUv3.
- Evidence the native-binary Bevy path is dormant everywhere: native rendering requires `window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true` (`bevy_native_renderer_runtime.js:127-135`), which is **never set** in the repo; `atome/documentations/bevy_integration.md:206` confirms "the visible project rendering path remains the Bevy WASM/WebGPU canvas" and the iOS native presenter reports `not_presentable`.
- Consequence: the Section 5 "native video" blocker is **MOOT**. `importExternalTexture` works on all targets, CSS `backdrop-filter` blur keeps working (single DOM+canvas layer), and consolidation is a pure **web/WASM** effort.
- The native-binary Bevy scaffold (`startBevyNativeRenderer`, `bevy_native_renderer_runtime.js`, `platforms/desktop-tauri` bevy bits, `platforms/ios/bevy-renderer`) is deliberate dormant scaffolding linked into iOS; **leave it intact** (it renders nothing and blocks nothing). Optionally retire later in Stage 5.

## Surgical constraints discovered (preserve, do not delete behavior)
- `molecule.js` is BOTH the audio engine (`webgpu+kira`) and the per-Atome visual renderer (`molecule.webgpu.js`). Only the **visual** path is redundant with Bevy; **audio must be preserved**.
- `mtrax_renderer_webgpu_adapter.js` owns A/V clock sync (Kira/AVFoundation drift via `playbackRate`), scrub/seek, per-clip transform+rotation+opacity, selection overlay, text layer, Tauri/WKWebView frame workarounds — all to be relocated to canonical owners, not dropped.
- The Bevy WASM project surface already renders project `video`/`image` atomes (projection adapter carries source + timeline trim/offset/speed; `bevy_video_decode_source_runtime.js` drives the hidden `<video>`; `video_external.wgsl` samples it). Validate each removal against the running app before deleting.

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

## 5. RESOLVED — native Bevy video is not needed

This was the feared blocker, now **dismissed by the VALIDATED DECISION above**: every platform runs the Bevy **WASM/WebGPU** path, the native-binary path is dormant (`__ATOME_NATIVE_BEVY_PRESENTABLE__` never set; `bevy_integration.md:206`). So there is no cross-GPU-context problem and no native-decode work. The questions below are retained only as the rationale for why native was dropped; they are not action items.

Original (now moot) open questions:

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

### Stage 2 — REMOVED (native Bevy video) per the VALIDATED DECISION
No native video work. All platforms use Bevy WASM/WebGPU, so Stages 1/3/4 are pure web/WASM consolidation with no native blocker.

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

---

# Migration Map & Sequenced Execution Spec (from multi-agent mapping, 2026-06-16)

> Source: 7-agent read-only mapping (run wf_6506957b-089). Synthesis done in-thread (the workflow's synth/critique agents hit the account session limit). Increments ordered lowest-risk-first.

## A. Current architecture (ground truth)
- **Project scene = already Bevy WASM/WebGPU**, single shared canvas `#eve_surface_project`. Per-kind rendering proven (spawn.rs kind switch + adapter registry): `shape`→Sprite color, `text`→Text2d or CPU rich-text texture, `image`→Sprite RGBA (uv/sourceRect crop), `video`→**Mesh2d quad + GPU `texture_external`** sampled live in `video_external.wgsl` (sRGB→linear + opacity), `audio_waveform`→peaks texture + progress overlay. JS diff pipeline: `createVirtualSceneTree`→`diffVirtualSceneTrees`→`applyBevyWebRendererDiffs`→wasm `apply_atome_bevy_*`.
- **Video source = hidden muted `<video>` pool** in `eve_bevy_video_decode_root` (`bevy_video_decode_source_runtime.js`); Rust imports it via JS bridge `window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__`; frames pumped by `requestVideoFrameCallback`→`notify_atome_bevy_video_frame`→RequestRedraw.
- **Audio + A/V sync = Kira** (finding 4, classified `scaffold` — KEEP, do not delete): Kira is sole audio output + master clock; video follows via threshold-gated hard seeks in `position_runtime.js`/`hmtracks_*`; muted `<video>` invariant; **no `playbackRate` feedback loop**; per-frame order = position all clips → `await syncHmtracksNativeAudioPlayback`.
- **Redundant renderers still live:**
  - `molecule.webgpu.js` (per-Atome `.eve-media-canvas`) — `copyExternalImageToTexture`; mounted via `media_mount_runtime.mountMediaApiAtome` from `tool_genesis.js:842,1747-1751` + `group_visual_runtime.js:247` for image/video/audio creation, realtime rehydrate, group previews. `molecule.js` ALSO holds the Kira audio half (KEEP).
  - `mtrax_renderer_webgpu_adapter.js` (4551 L, `mtrax-gpu-overlay`) — MTrax timeline-editor preview compositor: multi-clip, transform+rotation+opacity, scrub/seek+drift, selection overlay, karaoke/multiline text, waveform, color filters, transitions, blend, hit-test, poster/export readback, WKWebView workaround, crossOrigin/token. Emits control events `eve:mtrack-preview-object-selected` / `eve:mtrack-preview-transform`.
  - `webgpu_video_preview_renderer.js` (web MediaStream) + `native_frame_video_preview_renderer.js` (iOS/AUv3 base64-JPEG stills) — live recording preview. (A third plain `<video srcObject>` panel path in `video_preview_panel_service.js` is non-WebGPU, separate.)
- **Native-binary Bevy = dormant** (`__ATOME_NATIVE_BEVY_PRESENTABLE__` never set). Leave intact.
- **Known gaps in the Bevy target** (must be built to absorb the above): (1) **no live MediaStream/srcObject node** — decode-source only makes `<video src=url>`; (2) **no multi-segment montage on one atome** — montage = multiple layered video atomes; (3) the `apply_video_track` Rust API (render_ops.rs:411-466, types.rs:282-429, exports.rs:133-165) is **unused by JS** and timeline-less → dead scaffolding, do not route through it.

## B. A/V-sync preservation plan (binding)
Kira stays the sole audio + master clock. The muted decode `<video>` stays the single video time source, slaved to the Kira playhead by the existing threshold-gated seek logic. When a redundant renderer is retired, its hidden `<video>` is **repurposed** as the Bevy `texture_external` source — preserving: `muted=true`, WKWebView contract (`clip-path:inset(100%)` + 320×240, never `opacity:0`/`visibility:hidden`/1×1), `crossOrigin='anonymous'`+`?token=` auth. No second clock, no WebAudio, no unmute, no `playbackRate` correction loop. Validate montage sync (multi-clip + loop) on web + Tauri + iOS per `feedback_validate_real_mechanism` (reproduce real drift+seek, not a mocked-clock probe).

## C. Ordered increments
- **Inc 0 — DONE:** `video_external.wgsl` sRGB→linear + guard (`tests/eve/bevy_project_renderer_guards.test.mjs`).
- **Inc 1 — Live recording preview/capture → plain UI viewfinder. (DONE)**
  - Per the no-2nd-Bevy-surface decision, the camera viewfinder is transient UI (not an Atome), so it became a non-WebGPU viewfinder instead of a Bevy surface: `video_preview_renderer.js` rewritten — web `MediaStream` → `<video srcObject>` (CSS `object-fit:cover`); native iOS/AUv3 pushed base64 JPEG frames → `<img>` updated per frame (the `window.__ATOME_NATIVE_VIDEO_PREVIEW_FRAME` registry is kept). Stream acquire/release ownership preserved.
  - Deleted: `webgpu_video_preview_renderer.js` + `native_frame_video_preview_renderer.js` (the two dedicated WebGPU preview renderers). No other consumers.
  - Validated: `check:syntax` ✅; `tests/eve/video_recording_preview_stream_contract.test.mjs` updated (stubbed DOM + stream-ownership assertions) → **3/3 pass**. Runtime camera viewfinder + recording → verify on :3001 (fake camera) + Tauri :3000.
- **Inc 2 — Molecule per-Atome → Bevy nodes. (DONE — visual removed, Kira audio kept)**
  - Runtime fact (probe via "entrez sans compte" + import): the active flow renders video on the single Bevy surface with `.eve-media-canvas: 0`, `[data-atome-id] hosts: 0`, `Molecule.media: n/a` → the molecule per-Atome path is LEGACY (not exercised by import).
  - Done: `molecule.js renderFrame` no-ops when there is no canvas (audio-only); `molecule.api.mountVisual` video branch → audio-only molecule session (no `.eve-media-canvas`, Kira session kept); image branch → renderer `bevy` (no canvas). Dead code removed: `createMoleculeWebGpuRenderer` import (severs molecule.api → molecule.webgpu), `createMountedImageBitmap`, `ensureVideoCanvasMount`/`ensureImageCanvasMount`. `ensureAudioMount` + Kira audio kept.
  - Validated: `npm run check:syntax` ✅; topology probe — import still renders on `#eve_surface_project`, zero molecule canvas, no page errors. JS is live on :3001/Tauri reload (no build).
  - NOT yet exercised at runtime (probe can't trigger them): the molecule-mounting flows themselves — `createAtomeElement` (tool-created media), `group_visual_runtime` previews, realtime rehydrate. Verify on :3001 + Tauri :3000 that those show video (Bevy) + play audio (Kira).
  - **DONE (deletion):** `molecule.js` session renderer removed — `this.renderer`/`createMoleculeWebGpuRenderer` import dropped, `mount()` stores canvas only, `renderFrame()` is a no-op, `dispose()` no longer touches a renderer. The session is now **purely audio (Kira)**. `eVe/core/media_engine/molecule.webgpu.js` **DELETED** (339 L) + its orphan, now-broken `molecule.test.mjs` deleted. Validated: `check:syntax` ✅; runtime probe — app loads without `molecule.webgpu.js`, import renders on the single Bevy surface, no per-Atome canvas, no page errors. (Coverage note: molecule's audio path lost its unrun orphan test; add a focused audio test to the vitest manifest if desired.)
- **Inc 3 — MTrax timeline editor → Bevy.** Relocate compositing (multi-clip/transform/rotation/opacity/crop/blend/filters/transitions) to Bevy material+ops; relocate scrub/seek/drift to decode-source/`hmtracks_*` (already the owner); selection→`selection_overlay.rs`; karaoke/multiline text→Bevy text route; waveform→`waveform_playback_overlay.rs`; **keep emitting** `eve:mtrack-preview-*` control events + `eveMtrackApi.applyClipVisualTool`; reproduce hit-test geometry exactly; poster/export via Bevy offscreen readback. Then delete `mtrax_renderer_webgpu_adapter.js` + runtime/adapter/environment glue. Risk: HIGH (montage A/V sync, hit-test parity, control contract). Validate: `tests/probes/mtrack_*_video_preview_probe.test.mjs` + real montage scrub/loop on web+Tauri+iOS.
- **Inc 4 — Cleanup + maps + guards.** Delete dead `apply_video_track` API (Rust+exports), dead `mtrax-c2d-*` selectors, stale `data-role` guards; reconcile the **`.eve-media-canvas` vs `eve-media-api-webgpu-canvas` discrepancy** (live code emits the class, not the data-role the probes/todo reference); update maps; add guards (no per-Atome canvas, no JS WebGPU compositor besides Bevy).

## D. Final deletions
`molecule.webgpu.js`; `mtrax_renderer_webgpu_adapter.js` (+ `mtrax_renderer_runtime.js`/`mtrax_renderer_adapter.js`/`mtrax_renderer_environment.js` glue + `*.host_cleanup.test.mjs`); `webgpu_video_preview_renderer.js` + `native_frame_video_preview_renderer.js`; Rust `apply_video_track`/`AtomeVideoTrack*`/`VideoTrack*` exports; dead `mtrax-c2d-*` selectors.

## E. Maps to update
`maps/ARCHITECTURE_MAP.md`, `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/DESIGN_MAP.md`.

## F. Open questions / risks to settle during execution
- **CONFIRMED CONSTRAINT — Bevy WASM is a SINGLETON (one app / one winit event loop / one canvas).** Evidence: `platforms/web/bevy-renderer/src/lib.rs` holds a single `WEB_EVENT_LOOP_PROXY`, one `WEB_PENDING_OPS`, one `WEB_PENDING_VIDEO_FRAMES`, one `WEB_DIAGNOSTICS` (all thread-local statics). `run_atome_bevy_renderer` cannot run a second concurrent Bevy app/surface. Implications:
  - **Project atomes** (image/video/text/shape/waveform) → render on the ONE Bevy project surface `#eve_surface_project`. ✅ Feasible — this is the Molecule per-Atome migration (Inc 2) and the import flow already proves it.
  - **Secondary preview surfaces** — the recording camera viewfinder (Inc 1) AND the MTrax timeline-editor preview (Inc 3, `mtrax-gpu-overlay`) — **cannot be a second Bevy surface** without re-architecting the wasm for multi-surface. This blocks the naive "preview → Bevy" path.
  - **Decision required for secondary previews (defer, not now):** either (A) re-architect Bevy WASM for multi-surface (large: multiple winit windows/apps or shared-device multi-target on web), or (B) accept them as non-project-Bevy concerns — recording viewfinder = plain `<video srcObject>` UI (camera is UI, not an atome; removes the 2 WebGPU preview renderers), and the MTrax multi-clip preview composited by a Bevy-owned offscreen target driven by the single app, or kept until (A).
  - **Therefore reorder execution:** do the FEASIBLE single-surface win first (Inc 2, Molecule per-Atome → project surface), and treat Inc 1/Inc 3 (secondary surfaces) as gated on the (A)/(B) decision above.
  - **DECISION (validated) — ONE renderer (Bevy/WebGPU), ONE canvas `#eve_surface_project`. No 2nd surface, no offscreen-to-dialog readback, no fallback.** Recording viewfinder → plain `<video srcObject>` UI (transient viewfinder, not an atome) → DONE. **MTrax timeline editor**: there is NO separate preview surface. The timeline composites directly on the single Bevy project canvas — exactly where timeline PLAYBACK already renders today (`project_playback_automation_bundle` → `setBevyVideoDecodePlayback` + Kira). The mtrack dialog keeps only DOM controls (tracks/clips/scrubber). The editor's scrub/edit must drive the SAME project-Bevy path as playback (not a 2nd compositor), and MTrax's compositing features (per-clip filters, transitions, karaoke text, selection overlay, waveform) are REWRITTEN into the Bevy renderer. Then the old MTrax WebGPU system is deleted entirely. Clean bottom-up rewrite, no bricolage/recopy.

  ### MTrax → Bevy clean rewrite — sub-steps (bottom-up; old system deleted only at the end)
  - **M1.** Bevy-core: per-clip color filters (brightness/contrast/saturate/grayscale/sepia/invert/hue) on the video/image material (extend `video_external.wgsl` + material uniforms).
  - **M2.** Bevy-core: built-in transitions (cut/dissolve/fade/dip → opacity, slide → offset, wipe → fragment mask) on the material/timeline.
  - **M3.** Editor scrub/edit/playhead → drive the project-Bevy path (extend `bevy_video_decode_source_runtime` / the automation bundle that already drives playback) so `docked_renderer_runtime.dispatchMtraxRendererFrame`/`syncMtraxRendererTimeline` show the composite on `#eve_surface_project`. UX: dialog = controls; canvas = preview.
  - **M4.** Selection overlay + hit-testing → `selection_overlay.rs` + canvas hit-test; keep emitting `eve:mtrack-preview-object-selected` / `eve:mtrack-preview-transform` + `eveMtrackApi.applyClipVisualTool`.
  - **M5.** Karaoke/multiline text → Bevy text route; waveform → `waveform_playback_overlay.rs`.
  - **M6.** Delete `mtrax_renderer_webgpu_adapter.js` (4551 L) + `mtrax_renderer_runtime.js` + `mtrax_renderer_adapter.js` + `mtrax_renderer_environment.js` + the dialog preview canvas + dead `mtrax-c2d-*` selectors. Make the dialog controls-only.
  - **M7.** Validate montage + Kira A/V sync on the project canvas (web + Tauri + iOS).
- Live MediaStream source kind end-to-end (decode-source + Rust import already accept any HTMLVideoElement via the bridge).
- Poster/export readback from a Bevy offscreen target (replaces `captureMtrackPreviewPosterDataUrl`).
- `backdrop-filter` blur stays valid (single DOM+canvas layer on web — OK in WASM mode).
- Karaoke / CSS color filters / transitions parity in the Bevy text+material route.
- Reconcile the `.eve-media-canvas` (live) vs `eve-media-api-webgpu-canvas` (probes/todo) selector mismatch so validation matches the real DOM.
