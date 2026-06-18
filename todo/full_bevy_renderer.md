# Full Bevy Renderer — Cahier des charges (single Bevy/WebGPU render path)

Living tracker. One and only one render engine: **Bevy compiled to WASM, using WebGPU**, drawing on the single project canvas `#eve_surface_project`. Every micro-step is checked off here as it lands.

Legend: `- [ ]` todo · `- [x]` done · `- [~]` in progress.

## Invariants (non-negotiable — from `.codex/AGENTS.md` + engagement)
- ONE renderer (Bevy/WebGPU), ONE canvas. No 2nd Bevy surface, no offscreen→dialog readback, no JS WebGPU compositor beside Bevy.
- No fallback, no patch, no recopy/bricolage. Clean rewrite, then **complete deletion** of the old MTrax system.
- No transitional state: the old MTrax compositor is removed only once every feature runs on Bevy (atomic switch at M6).
- **Kira stays the sole audio + master clock**; video follows via the existing decode-source seeks (no rate loop, no unmute). A/V sync logic stays in `hmtracks_*`/`bevy_video_decode_source_runtime`.
- Comments/docs in English; temp probes only under `./temp`; persistent tests only under `./tests`; Git read-only.

## Already done (validated)
- [x] Color bug fixed — `video_external.wgsl` sRGB→linear + guard test.
- [x] Dead Rust `video_track` API removed (render_ops/types/exports/tests) — `cargo` green.
- [x] `molecule.webgpu.js` deleted — per-Atome visual → Bevy, Kira audio kept (molecule session audio-only).
- [x] `webgpu_video_preview_renderer.js` + `native_frame_video_preview_renderer.js` deleted — recording viewfinder → `<video>`/`<img>` UI; contract test 3/3.
- [x] **M1 — per-clip color filters in the Bevy video material** (brightness/contrast/saturate/grayscale/sepia/invert/hue). Validated end-to-end: live grayscale desaturates the real Bevy canvas; WGSL math 9/9 on GPU; Rust 18/18; adapter 18/18.

## Remaining target = MTrax timeline editor fully on Bevy, old system deleted.
Seam to rewire: `eVe/domains/mtrax/ui/docked_renderer_runtime.js` (`syncMtraxRendererTimeline`/`dispatchMtraxRendererFrame` currently drive `mtrax_renderer_webgpu_adapter.js`). Playback already renders the timeline on the project Bevy canvas (`project_playback_automation_bundle_runtime.js` → `setBevyVideoDecodePlayback` + Kira) — the editor's scrub/edit must use that same path, with MTrax's extra features rebuilt in Bevy.

---

## M1 — Per-clip color filters in the Bevy video material ✅ COMPLETE
Goal: video/image nodes carry CSS-style filters (brightness, contrast, saturate, grayscale, sepia, invert, hue-rotate), applied in the Bevy material. Identity by default → zero regression until values are fed. **Done + validated end-to-end (live grayscale on the real Bevy canvas).**
Files: `video_external.wgsl`, `video_external_web.rs`, `video_external_texture.rs`, `types.rs`, `render_ops.rs`, `bevy_projection_adapter.js`, `render_atom.js`, `virtual_scene_contract.js`, `bevy_web_renderer_runtime.js`, `bevy_native_renderer_runtime.js`.
- [x] M1.1 WGSL: extend `video_params` to a struct (`base: vec4` opacity/brightness/contrast/saturate + `filters: vec4` grayscale/sepia/invert/hue); add filter functions applied to the sampled sRGB color before `srgb_to_linear`. _(written; runtime/naga validated in M1.6)_
- [x] M1.2 `video_external_web.rs`: replace the 16-byte opacity uniform with a 32-byte filter uniform builder (`video_params_bytes`); update bind-group entry/min size; feed values from the component (identity default). _(written; wasm-gated, compile-validated in M1.6 rebuild)_
- [x] M1.3 `video_external_texture.rs`: add `AtomeColorFilters` (identity default) field to `AtomeVideoExternalTexture` (ExtractComponent); `from_node` sets identity. _(`cargo:bevy:check` green)_
- [x] M1.4 `types.rs` + `render_ops.rs`: single `AtomeColorFilters` DTO (Deserialize, per-field identity defaults, `normalized()` clamp) on `AtomeRenderNode` + `AtomeStylePatch`; spawn (`from_node`) + `apply_style` apply it to the component; resource-patch path preserves current filters. `cargo:bevy:check` green; 18/18 bevy-core tests pass incl. 2 new filter tests (carry/clamp/identity + style update).
- [x] M1.5 `bevy_projection_adapter.js`: `normalizeColorFilters` (CSS units → Bevy shape, hue °→rad, clamp, identity→omit) + `toBevyFilterPayload` (always-object for live resets); node payload emits `filters`, style patch emits `filters` (identity on clear). Threaded through `render_atom.js` (`resolveColorFilter` reads mtrax-aligned aliases → `visual.filter`) + `virtual_scene_contract.js` (`node.filter` + style-diff projection). `check:syntax` 724 OK; adapter contract 18/18 (4 new filter tests); virtual_scene/unified/hit-order suites 35/35; no regression in "keeps existing projections identical".
- [x] M1.6 Validated: (a) `temp/color_probe/filter_run.mjs` — 9/9 WGSL `apply_color_filters` cases pass on the real GPU vs hand-computed expectations (identity/grayscale/saturate/invert/brightness/contrast/sepia/hue/composite). (b) `cargo:bevy:check` green. (c) `check:syntax` 724 OK. (d) wasm rebuilt clean (compiles the wasm-gated `video_external_web.rs` 32-byte uniform). (e) runtime no-regression: imported video renders correctly on `#eve_surface_project` (identity filters → unchanged, sRGB fix intact). (f) **end-to-end live**: `updateProjectSceneRecordByAtomeId({filter_grayscale:1})` desaturates the canvas (colorful→gray, frame-jitter-immune) via the real seam.
  - **Gap found+fixed by the real-mechanism probe** (`feedback_validate_real_mechanism`): the `updateStyle` consumer in `bevy_web_renderer_runtime.js` (and `bevy_native_renderer_runtime.js`) built `stylePayload` from a whitelist that dropped `filters`. Mapping was correct but the live style op never carried it. Added the `filters` pass-through to both. No new test failures (23/23 unchanged pass; 3 failing runtime tests are PRE-EXISTING — confirmed on pristine HEAD — about video decode/deferred/text, unrelated to filters).

## M2 — Built-in transitions in the Bevy material/timeline
Goal: cut/dissolve/fade/dip (opacity), slide (uv/offset), wipe (fragment mask), with curve/direction, per the timeline.
Files: `video_external.wgsl`, `video_external_web.rs`, `types.rs`, `bevy_projection_adapter.js`, timeline state.
- [ ] M2.1 WGSL: transition uniforms (kind, progress, direction, params) + fragment handling (opacity factor, slide offset, wipe mask).
- [ ] M2.2 Rust uniform/component carry transition params (identity/none default).
- [ ] M2.3 Projection: timeline transition state → Bevy node transition payload.
- [ ] M2.4 Validate: harness math + cargo + rebuild + probe (a 2-clip transition renders correctly).

## M3 — Editor scrub/edit/playhead → the project Bevy path
Goal: the mtrack editor's scrub/edit drives the SAME project-Bevy path as playback (no 2nd compositor). Dialog = DOM controls; the project canvas IS the preview.
Files: `docked_renderer_runtime.js`, `bevy_video_decode_source_runtime.js`, `project_playback_automation_bundle_runtime.js`, mtrax timeline runtimes (`play_runtime`, `playback_frame_update_runtime`, `preview_frame_dispatch_runtime`, `playhead_ui`).
- [ ] M3.1 Map every place the editor calls `syncMtraxRendererTimeline`/`dispatchMtraxRendererFrame`; identify the timeline→clip-node mapping.
- [ ] M3.2 Make scrub/edit drive `setBevyVideoDecodePlayback`/project-scene projection at the playhead (extend the playback path), so the composite shows on `#eve_surface_project`.
- [ ] M3.3 Ensure clip transforms/opacity/uv/filters/transitions flow to Bevy nodes from the timeline state.
- [ ] M3.4 Confirm Kira A/V sync unchanged (still driven by `hmtracks_*`; video follows).
- [ ] M3.5 Validate: scrub + montage playback render on the project canvas; A/V sync intact (web first; Tauri/iOS by user).

## M4 — Selection overlay + hit-testing + control contract on Bevy
Goal: clip selection/transform handles + hit-testing on the Bevy canvas; keep emitting the MTrax control events.
Files: `selection_overlay.rs`, project-scene hit-test, `mtrax` preview interaction runtimes.
- [ ] M4.1 Selection/transform-handle overlay for timeline clips via `selection_overlay.rs`.
- [ ] M4.2 Hit-testing on the project canvas reproduces the clip AABB/handle geometry (uniform-scale + viewport-center origin parity).
- [ ] M4.3 Keep emitting `eve:mtrack-preview-object-selected` / `eve:mtrack-preview-transform` + `eveMtrackApi.applyClipVisualTool` from the canvas interaction.
- [ ] M4.4 Validate: select/drag/resize/wheel-scale/rotate a clip on the canvas drives the MTrax model.

## M5 — Karaoke/multiline text + waveform on Bevy
Files: Bevy text route (`render_ops.rs` text), `waveform_playback_overlay.rs`, `bevy_media_texture_resolver.js`.
- [ ] M5.1 Karaoke/multiline text (active-line bg, scroll, per-line weight/alpha) on the Bevy text route.
- [ ] M5.2 Timeline audio waveform → `waveform_playback_overlay.rs`.
- [ ] M5.3 Validate: a text/karaoke clip + an audio waveform render on the canvas.

## M6 — Delete the old MTrax system (atomic switch)
- [ ] M6.1 Switch `docked_renderer_runtime.js` fully to the Bevy path; make the mtrack dialog controls-only (remove the preview canvas/overlay).
- [ ] M6.2 Delete `mtrax_renderer_webgpu_adapter.js` (4551 L) + `mtrax_renderer_runtime.js` + `mtrax_renderer_adapter.js` + `mtrax_renderer_environment.js`.
- [ ] M6.3 Remove dead `mtrax-c2d-*`/`mtrax-gpu-overlay` selectors + preview-poster/export readback (replace with Bevy if still needed).
- [ ] M6.4 Update/remove `mtrax_renderer_*` tests; ensure suite green.

## M7 — Cross-platform validation of the unified renderer
- [ ] M7.1 Web (:3001): montage compositing + filters + transitions + selection + scrub + A/V sync on the project canvas.
- [ ] M7.2 Tauri (:3000) + iOS/AUv3: same, with Kira A/V sync verified on a looping montage (`feedback_validate_real_mechanism`).
- [ ] M7.3 `npm run check:m1` / relevant guardrails green.

## C — Closure
- [ ] C1 Remove remaining dead glue; reconcile selectors; delete `temp/` probes.
- [ ] C2 Update maps: `ARCHITECTURE_MAP.md`, `CODEMAP.md`, `API_MAP.md`, `DESIGN_MAP.md`.
- [ ] C3 Add guardrails: no per-Atome canvas, no JS WebGPU compositor beside Bevy, single render surface.
- [ ] C4 Optionally retire the dormant native-binary Bevy scaffold (`startBevyNativeRenderer` + bridge) if confirmed unused.

## Status log
- (start) Spec created. Next: M1.1.
- M1.1–M1.5 landed (WGSL filters, 32-byte uniform, component + DTO, node/style wiring, JS projection). Rust 18/18, adapter 18/18, syntax 724 OK. Next: M1.6.
- **M1 COMPLETE.** M1.6 validated incl. live grayscale on the real Bevy canvas via `updateProjectSceneRecordByAtomeId`. Real-mechanism probe caught + fixed a dropped-`filters` whitelist in the web/native `updateStyle` consumers. Next: M2 (transitions). **Remaining to finish the whole task: 6 increments — M2, M3, M4, M5, M6, M7 (+ C closure).**
- Known PRE-EXISTING failure (not M1): `tests/eve/project_scene_media_projection_filter.test.mjs` → "never switches to an external video renderer" expects 0 media DOM els but `bevy_video_decode_source_runtime.js` creates a decode `<video>`. Confirmed failing on pristine HEAD of the 3 JS files. Belongs to M3/M6 (decode/editor path fully on Bevy, remove DOM fallbacks).
