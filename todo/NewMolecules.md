# NewMolecules — Cahier des charges: the Molecule timeline editor, rebuilt on Bevy/WebGPU

Sibling spec of [`full_bevy_renderer.md`](./full_bevy_renderer.md). This document is the work backlog for reintegrating the **Molecule timeline editor** (the system formerly known as MTrax) entirely on the single Bevy/WebGPU project canvas `#eve_surface_project`, by **reusing** the already-present, mtrax-free building blocks rather than rewriting from zero.

Legend: `- [ ]` todo · `- [x]` done · `- [~]` in progress.

---

## 0. Decisions locked with the product owner (2026-06-19)
These came out of the post-deletion audit + a two-round scoping study. They are binding for this spec.

| # | Decision | Choice |
|---|----------|--------|
| D1 | **Foundation** | **REUSE** the parked kernel `eVe/intuition/tools/molecule/` (3098 L — functional, tested, guarded, no mtrax dependency, currently being wired). Build rendering + interaction on Bevy *on top of it*. Do **not** rewrite from zero. |
| D2 | **Data format** | **REUSE** the canonical format of `documentations/Molecules.md` (`eve.timeline` / `…automation` / `…effect`), already implemented in `tools/molecule/kernel/schemas.js`. |
| D3 | **API/MCP-first** | EVERY editor operation (cut/copy/paste/split/erase, move/trim, automation, track ops, transport…) is exposed as a programmatic **API + MCP tool** — scriptable, **batchable**, AI-drivable. No operation is UI-only. |
| D4 | **Modular tracks** | A **track-type registry** so new kinds (chords, tablature, script-launch, timeline-trigger, …) plug in without touching the core. |
| D5 | **Time model** | **Musical time (tempo / bars / beats) + seconds**, dual reference. **Kira stays the master clock**; video follows. |
| D6 | **History** | Every edit is a **reversible command on eVe's deterministic Time Machine log**; batched API/MCP calls are **atomic** (all-or-nothing → a single undo point). |
| D7 | **Phasing** | **v1 → v2** (ship a usable, fully-scriptable core editor first; advanced track types after). |

## 1. Non-negotiable invariants (inherited from `full_bevy_renderer.md` + `.codex/AGENTS.md`)
- **ONE renderer (Bevy/WebGPU), ONE canvas** `#eve_surface_project`. Every track/clip/overlay/handle renders there. No second surface, no DOM compositor beside Bevy, no offscreen→readback. (Menu/UI chrome is the only DOM exception.)
- **Kira is the sole audio engine + master clock**; video follows via `setBevyVideoDecodePlayback` seeks. No rate loop, no unmute.
- **No fallback, no patch/bricolage.** Clean, factored, modular code. Delete anything that can be deleted; reuse existing functions before writing new ones.
- **API/MCP parity**: anything the UI can do, the API + MCP can do, and vice-versa.
- Comments/docs in English; temp probes only under `./temp`; persistent tests only under `./tests`; Git read-only.

## 2. Foundation inventory — what already exists (REUSE, do not recreate)
### 2.1 The parked kernel `eVe/intuition/tools/molecule/` (3374 L) — to be **wired**
| Module | L | Provides |
|--------|---|----------|
| `kernel/reducers.js` | 498 | State transitions (the edit operations as pure reducers) |
| `kernel/schemas.js` | 220 | Data model = the `eve.timeline` format (D2) |
| `kernel/time_model.js` | 189 | Tempo map + seconds/musical dual-time conversion and snapshot normalization |
| `kernel/collisions.js`, `kernel/errors.js`, `kernel/index.js` | 142 | Overlap resolution, typed errors, public kernel exports |
| `track_types/index.js` | 122 | Track-type registry + built-in video/audio/image/text/automation definitions |
| `session/{session,registry,errors,index,timeline_operations}.js` | 700 | Session lifecycle, multi-session registry, timeline verb aliases, clipboard edits, and atomic operation batches |
| `persistence/index.js` | 165 | Load/save of molecule state |
| `recording/index.js` | 253 | Capture into the timeline |
| `gestures/index.js` | 120 | Interaction logic |
| `panel/index.js` | 264 | Legacy panel UI (evaluate vs Bevy overlay — see §7 open Q) |
| `media/index.js` | 139 | Media clip handling (note: still references a `canvas_webgpu_preview` channel to re-point at Bevy) |
| `nested/index.js`, `multi_instance/index.js` | 312 | Nested molecules + multiple instances |
| `runtime.js` | 240 | Entry `installMoleculeGroupTimelineRuntime` + open group timeline API bridge |
| `index.js` | 10 | `MOLECULE_ENGINE_ID='eve.molecule'`, schema v1, `status: 'guarded_bootstrap'` |

Status confirmed by audit: imports **no** deleted mtrax code; `molecule_session_history` probe **passes**; guarded by `check_molecule_guardrails`. It is sound — it just is not connected to the runtime.

### 2.2 Already done on Bevy (reuse directly)
- **M1** per-clip color filters (`video_external.wgsl`, `types.rs`, `video_external_texture.rs`, `bevy_projection_adapter.js`).
- **M2** built-in transitions (fade/wipe/slide/dissolve/dip).
- **Decode playback**: `setBevyVideoDecodePlayback` (`bevy_video_decode_source_runtime.js`) drives video frames → external texture; Kira owns audio.

### 2.3 Surviving audio engine (do NOT touch as part of this work)
- `eVe/core/media_engine/molecule.{js,api,native,scenarios}.js` = the **Kira** audio-session engine (audio-only; video composited by Bevy). Distinct from the editor kernel above.

### 2.4 Wiring seam already reserved
- `eVe/intuition/runtime/layer_contract.js` already defines `intuition_molecule_layer` (role `molecule`) — the z-order slot on the project scene (consumed by `runtime/index.js`, `tool_genesis.js`, `preview_surface.js`).

## 3. Architecture pillars
### A. Track-type registry (D4 — the modularity backbone)
- A registry mapping `track_type → { schema, reducer ops, Bevy renderer, API/MCP verbs, hit-test, time-domain }`.
- Built-in (v1): `video`, `audio`, `image`, `text`, `automation`.
- Plug-in (v2): `chord`, `tablature`, `script_launch`, `timeline_trigger`, `waveform`(overlay).
- **Adding a track type = registering one module; the core stays closed for modification.**

### B. Data model (D2 + D5)
- Schemas reused/extended from `kernel/schemas.js`, format per `Molecules.md` (`eve.timeline` / automation / effect).
- **Dual time** on every time-bearing entity: `{ seconds, musical: { bar, beat, tick } }` resolved through a **tempo map** (BPM + time-signature changes). Seconds remain the render/seek truth (Kira clock); musical time is the editing/quantization layer for chord/tablature/automation.
- Persist through `persistence/` + the sanitized project store.

### C. API + MCP surface (D3 — every operation)
- **Reuse the existing tool plumbing**: `Agent.registerTool` in `atome/src/squirrel/ai/default_tools.js`, the runtime tool gateway (`invokeRuntimeDefaultTool` → `ui.*`), and the MCP ACL in `atome/src/squirrel/atome/mcp.js`. (These replace the deleted `eve.mtrack.clip.move/crop` tools.)
- **Namespaces**: AI tools `eve.timeline.*`; runtime tools `ui.timeline.*`.
- **Verb inventory (non-exhaustive, all batchable)**:
  - Clips: `clip.move`, `clip.trim`, `clip.split`, `clip.cut`, `clip.copy`, `clip.paste`, `clip.erase`, `clip.duplicate`.
  - Tracks: `track.add`, `track.remove`, `track.reorder`, `track.set_type`, `track.mute`, `track.solo`.
  - Automation: `automation.keyframe.add/move/edit/remove`, `automation.curve.set`.
  - Transport: `transport.play/pause/stop/scrub/seek` (musical or seconds).
  - Effects/transitions: `effect.set`, `transition.set` (reuse M1/M2).
  - Advanced (v2): `track.script.attach/launch`, `track.timeline.trigger`, `track.chord.set`, `track.tab.set`, `clip.timestretch`, `clip.set_speed`.
- **Batch**: `eve.timeline.batch([op, …])` is **atomic** (all-or-nothing) and produces **one** Time Machine entry (D6).
- Each tool carries `parameters` schema + `capabilities` + `risk_tier`, exposed over MCP with the existing confirmation/ACL policy (mirrors the calendar/bank/contacts tools).

### D. Rendering on Bevy (the single canvas — §1 invariant)
| Track/feature | Bevy path |
|---|---|
| video / image clips | existing material path (M1 filters + M2 transitions) via `bevy_projection_adapter.js` + `setBevyVideoDecodePlayback` |
| selection / transform handles | new/extended `selection_overlay.rs` (M4) |
| audio waveform | new/extended `waveform_playback_overlay.rs` (M5.2) |
| text / karaoke | Bevy text route (M5.1) |
| chords / tablature | new Bevy overlays (v2), musical-time laid out |
| playhead / track grid | Bevy overlay driven by transport + tempo map |

All driven from kernel state → `virtual_scene_contract.js` diff → Bevy nodes (the existing projection chain). No DOM rendering of timeline content.

### E. Transport & clock (D5)
- Kira master clock; `setBevyVideoDecodePlayback` follows for video frames; scrub/seek drive both. Musical↔seconds via the tempo map. A/V-sync logic stays where `full_bevy_renderer.md` mandates (Kira + decode-source seeks).
- **Time-stretch**: clip speed / stretch-to-tempo *without pitch artifacts*, as a processing stage feeding Kira, backed by an **external library** (decision pending — §7, task V2.10). Tempo edits in musical time drive it.

### F. History (D6)
- Each kernel mutation emits a **reversible command** on eVe's Time Machine deterministic log (replayable identically). A `batch` wraps its ops into one atomic, single-undo entry. This is the contract that makes AI/script batch manipulation safe.

## 4. Phase v1 — Core editor on Bevy (usable + fully scriptable)
- [x] **V1.0 Finish the deletion (pre-work cleanup). DONE 2026-06-19.** Removed only the deleted-file contracts + the 2 orphaned `mtrack_perf_*` scripts + stale selectors + 249 build artifacts; kept the legitimate molecule-purity / anti-reintroduction guards. The audit had found stale tooling referencing deleted mtrax files that **broke governance**:
  - `scripts/check_molecule_guardrails.mjs` (l.13-14, 95-98) requires deleted `domains/mtrax/ui/{styles,preview_styles}.js` → `check:molecule-guardrails` **FAILS**. Re-point the contract at the new molecule surface (or drop it).
  - `scripts/check_no_fallbacks.mjs` carries the same stale contract → `check:no-fallbacks` **FAILS**. Fix.
  - Delete orphaned `scripts/mtrack_perf_guard.mjs` + `scripts/mtrack_perf_suite_summary.mjs`; fix `scripts/export_dom_subtrees.mjs:36` (`.eve-mtrack-timeline`).
  - Clear stale build artifacts (249 files under `platforms/**/target/**/eVe/domains/mtrax/`) via `cargo clean`/rebuild.
  - **Exit MET ✅**: `check:molecule-guardrails` (19) + `check:no-fallbacks` (19) + `check:mutation-ownership-guardrails` + `check:syntax` (673) + `export_dom_subtrees` test all green.
- [x] **V1.1 Wire the kernel. DONE 2026-06-19.** `installMoleculeGroupTimelineRuntime(window)` is called from the `tool_genesis.js` boot block → API registered into the group-timeline registry consumed by `tool_genesis` + `group_visual_runtime`. Boot probe PASS (`window.eveMoleculeTimelineApi` = object, `getActiveGroupTimelineId()` = `''`, 0 console errors, Bevy canvas intact). _Layer binding + `canvas_webgpu_preview` re-point re-scoped to V1.5 (render-path); `moleculeStores` → V1.4._
- [x] **V1.2 Track-type registry. DONE 2026-06-19.** Added `track_types/index.js` as the pure registry owner with built-in `video/audio/image/text/automation` types, kept the existing aggregate `mixed` type explicit, and made `kernel/schemas.js` + `kernel/reducers.js` consume the registry for track kinds and clip compatibility. Validation: `node --test tests/probes/molecule_track_type_registry.test.mjs` PASS 3/3; `npm run test:molecule` PASS 4 suites; `npm run check:molecule-guardrails` PASS 20 files; `npm run check:no-fallbacks` PASS 20 files.
- [x] **V1.3 Dual time model. DONE 2026-06-19.** Added `kernel/time_model.js` as the pure tempo-map owner, with deterministic seconds↔musical conversion and `normalizeTimelineTimeModel(...)`; `kernel/schemas.js` now validates `timebase.tempo_map`, transport loop/playhead dual references, clip time references, and marker time references; reducers normalize edited timeline snapshots after clip/transport/marker/tempo edits; persistence reload/migration upgrades existing snapshots into the dual-time model. Validation: `node --test tests/probes/molecule_dual_time_model.test.mjs` PASS 4/4; `npm run test:molecule` PASS 5 suites; `npm run check:molecule-guardrails` PASS 21 files; `npm run check:no-fallbacks` PASS 21 files; `npm run check:syntax` PASS 735 files.
- [x] **V1.4 API + MCP surface. DONE 2026-06-19.** Session operations now normalize `eve.timeline.*` / `ui.timeline.*` verbs into the existing kernel reducers, expose `clip.copy/cut/paste/duplicate` through session-local clipboard state, and keep modifying batches atomic with one `molecule.batch` undo point. `window.eveMoleculeTimelineApi` exposes read/single-operation/batch APIs for the active group timeline; `atome/src/squirrel/ai/default_tools_timeline.js` registers `eve.timeline.*`; `eVe/intuition/tools/timeline_actions.js` registers canonical `ui.timeline.*` runtime tools outside the Molecule module; `mcp_security_policy.js` gates `eve.timeline.*` and `ui.timeline.*` with `timeline.read`/`timeline.write`. Validation: `node --test tests/probes/molecule_session_history.test.mjs atome/src/squirrel/ai/default_tools_timeline.test.mjs atome/src/squirrel/atome/mcp.timeline_policy.test.mjs` PASS 7/7; `node --test atome/src/squirrel/atome/mcp.security_surface.test.mjs atome/src/squirrel/atome/mcp.platform_surface.test.mjs` PASS 2/2; `npm run test:molecule` PASS 5 suites; `npm run check:molecule-guardrails` PASS 22 files; `npm run check:no-fallbacks` PASS 22 files; `npm run check:syntax` PASS 738 files.
- [x] **V1.5 Render** multitrack + clips + playhead + scrub on `#eve_surface_project` (M3); reuse M1/M2 for filters/transitions. **DONE 2026-06-20.** Pure projection owner `eVe/intuition/tools/molecule/render/timeline_scene.js` maps a timeline snapshot to flat render records (track lanes, clip blocks, single playhead) on the dedicated `molecule` layer via the canonical `virtual_scene_contract.js` seam (no renderer of its own; seconds drive x-layout per D5; clip blocks are `shape` records carrying `clip_kind` so the Bevy projection filter cannot drop source-less clips; per-clip filter/transition forward to the M1/M2 material path when present). Canvas wiring `eVe/intuition/runtime/molecule_timeline_scene_bridge.js` pushes the records onto `#eve_surface_project` through the new batch `project_scene_runtime.js` `updateProjectSceneRecords`, reconciling stale records and clearing on close; exposed as `window.eveMoleculeTimelineApi.renderTimelineScene`/`clearTimelineScene`. **Real-app validation** (`temp/molecule_timeline_render_probe.mjs`, visible Chromium + WebGPU): logged in sans compte, rendered a multitrack timeline onto the Bevy canvas (1 lane + 3 clip blocks + playhead, all on the `molecule` layer, in the project scene state), **scrub moved the playhead 0→240px** (3s×80px) confirmed in scene state and the two screenshots (`temp/molecule_timeline_render_playhead0.png`/`_playhead3.png`), clear removed all 5 records, 0 console errors. Node coverage `tests/probes/molecule_timeline_scene.test.mjs` + `molecule_timeline_scene_bridge.test.mjs` PASS 7/7; `npm run test:molecule` PASS 7 suites; Bevy/project-scene contracts 22/22; `check:molecule-guardrails` 23, `check:no-fallbacks` 23, `check:syntax` 740. _Note:_ clip blocks render as colored shapes; binding decoded media textures/waveforms into clips (video frames via the decode-source runtime, waveform overlay) rides on V2.2/media wiring, and full visual filter/transition validation needs a media-bound clip — the projection already forwards them to the existing M1/M2 material seam.
- [~] **V1.6 Selection + transform handles + hit-testing** on the canvas (M4) via `selection_overlay.rs` (uniform-scale + viewport-center origin parity). _Render side DONE 2026-06-20:_ because clip blocks are first-class project-scene records, selection visuals and hit-testing apply to them through the existing project-scene path with no new code — clip records are `selectable` while lanes/playhead are emitted `selectable:false`. Real-app validation `temp/molecule_timeline_selection_probe.mjs` (visible Chromium/WebGPU): clip `selectable:true`, lane/playhead `selectable:false`, selecting a clip via `window.__selectedAtomeIds` + re-render set `visual.selected:true`, and the screenshot `temp/molecule_timeline_selection.png` shows the dashed selection rectangle drawn on the selected clip on `#eve_surface_project`; 0 console errors. _Edit path now functional (2026-06-20):_ with the V1.8 store foundation in place, clip edits via the API (`applyGroupTimelineOperation` `clip.move`, real collision checks) apply through the session and re-render on the Bevy canvas — validated in `temp/molecule_timeline_session_edit_probe.mjs`. _Remaining for V1.6:_ wire on-canvas pointer drag of a clip block → `clip.move`/`clip.trim` (hit-test → drag gesture → API op), and `selection_overlay.rs` uniform-scale/viewport-center origin parity (M4 Rust).
- [ ] **V1.7 Automation** keyframes (data + render + API).
- [~] **V1.8 Time Machine integration** (reversible commands + atomic batch, D6). **Store foundation DONE 2026-06-20 (decision: canonical in the Atome).** Product owner chose option 1: a Molecule timeline persists canonically inside the Atome model. `eVe/intuition/runtime/molecule_stores.js` provides `window.Atome.moleculeStores` — `projectStore.saveTimeline` writes the snapshot as the owner group atome's `molecule_timeline` property via `window.Atome.commit` (one deterministic Time Machine entry per edit), `loadTimeline` reads it via `getStateCurrent`, `eventStore.append` emits each kernel history event on eVe's deterministic bus. Installed at boot in `tool_genesis_bootstrap_runtime.js`. `openGroupTimeline` now runs the real session, persists, and renders on the Bevy canvas; `onStateCommitted` re-persists + re-renders on every committed edit. **Real-app validation** `temp/molecule_timeline_session_edit_probe.mjs`: opened a group timeline (persist+render), applied `clip.move` (real collision detection rejected an overlapping target, accepted a free one), the clip re-rendered on the canvas (0→960px, screenshot `temp/molecule_session_after_move.png`), the session state reflected it, the edit emitted `molecule_timeline` set events into eVe's deterministic log on the owner atome (`setEventCount:6`, persisted `start:12`), and close cleared the overlay; 0 console errors. Node coverage `tests/probes/molecule_stores.test.mjs` PASS 5/5. **Undo/redo DONE 2026-06-20:** `undoGroupTimeline`/`redoGroupTimeline` added to the group API delegate to the session (which re-persists + re-renders via `onStateCommitted`); validated live in the same probe — undo returned the clip to 0px, redo back to 960px on the Bevy canvas, deterministic. _Remaining for V1.8:_ MCP/AI parity for undo/redo (`ui.timeline.undo`/`redo` + `eve.timeline.*`); live atomic single-undo batch validation (`applyBatch` atomicity is kernel-unit-covered by `molecule_session_history`).
- [ ] **V1.9 Validate**: drive a full edit session by **API + MCP + batch + an AI**; scrub/edit render on the canvas; Kira A/V sync intact; undo/redo deterministic; `check:*` green; boot probe + GPU probe.

## 5. Phase v2 — Rich + advanced track types (modular plug-ins)
- [ ] **V2.1** Text / karaoke (active-line bg, scroll, per-line weight/alpha) — M5.1.
- [ ] **V2.2** Audio waveform overlay — `waveform_playback_overlay.rs` (M5.2).
- [ ] **V2.3** Recording into the timeline (wire `recording/`).
- [ ] **V2.4** Nested molecules + multi-instances (wire `nested/` + `multi_instance/`).
- [ ] **V2.5** **Script-launch track** — place + launch script objects from the timeline (capabilities/sandbox via MCP risk tiers).
- [ ] **V2.6** **Timeline-trigger track** — trigger other timelines from a timeline (sub-timeline scheduling).
- [ ] **V2.7** **Chord track** — chord symbols on musical time.
- [ ] **V2.8** **Tablature track** — fret/string notation on musical time.
- [ ] **V2.9** Validate each plug-in: API/MCP verbs + Bevy render + musical-time quantization; registry stays the only touch-point.
- [ ] **V2.10 Time-stretch** — integrate the chosen external library (§7) as a stretch/speed stage feeding Kira (no pitch artifacts, stretch-to-tempo); expose `clip.timestretch` / `clip.set_speed` over API + MCP; validate quality + A/V sync + latency on web (WASM) and native (Rust/Tauri/iOS).

## 6. Phase v3 — Cross-platform validation (M7)
- [ ] Web (:3001), Tauri (:3000), iOS/AUv3 parity: compositing + filters + transitions + selection + scrub + A/V sync on a looping molecule; Kira sample-accurate (`feedback_validate_real_mechanism`).

## 7. Open questions (resolve during the relevant phase)
- **Chord notation model**: chord symbols vs MIDI vs both? Rendering (text glyphs vs Bevy-drawn)?
- **Tablature model**: instrument tuning / string count / fret representation.
- **Script-launch security**: which scripts, what capabilities/sandbox — map to existing MCP risk tiers + ACL.
- **Panel UI**: reuse `tools/molecule/panel/` (DOM) for editor chrome, or rebuild as Bevy overlay? (UI chrome may legitimately stay DOM per the menu/UI exception; timeline *content* must be Bevy.)
- **Effect rack** beyond M1/M2: scope of `eve.timeline.effect`.
- **Time-stretch library (V2.10)**: decide between **Signalsmith Stretch**, **Bungee**, **Rubber Band** after a **complete audit** — current preference **Signalsmith**. Audit criteria: stretch + pitch/formant quality, latency, **license** (Rubber Band = GPL / commercial dual-license — check compatibility; Bungee = Apache-2.0; Signalsmith = MIT-style), **WASM + native build** feasibility (Rust/Tauri/iOS targets), and the **Kira integration** path (processing node vs pre-roll).

## 8. Validation strategy (per phase)
- Reuse + keep green `tests/molecule/run_molecule_tests.mjs` (mount/multitrack/session-history probes); add **API/MCP batch + atomicity** tests and an **AI-driven** edit test.
- A GPU probe under `./temp` for every new Bevy overlay (selection, waveform, chord, tab) — screenshot ground truth, not `drawImage` readback.
- Boot probe on the real app; `check:syntax`, `check:molecule-guardrails`, `check:no-fallbacks`, `cargo:bevy:check` green; existing deletion guard tests stay enforcing (they must keep asserting mtrax/old-renderer absence).

## 9. Seam map (where each piece plugs in)
- **Kernel/state/format**: `eVe/intuition/tools/molecule/` (reuse) · audio: `eVe/core/media_engine/molecule.*` (Kira).
- **Layer slot**: `eVe/intuition/runtime/layer_contract.js` (`intuition_molecule_layer`).
- **Projection chain**: `render_atom.js` → `virtual_scene_contract.js` → `bevy_projection_adapter.js` → `bevy_{web,native}_renderer_runtime.js` → Rust `apply_style`.
- **Material/render (Rust)**: `video_external.wgsl`, `types.rs`, `video_external_texture.rs`; new `selection_overlay.rs`, `waveform_playback_overlay.rs`.
- **Playback/clock**: `bevy_video_decode_source_runtime.js` (`setBevyVideoDecodePlayback`) + Kira.
- **API/MCP**: `atome/src/squirrel/ai/default_tools.js`, `atome/src/squirrel/atome/mcp.js`, the runtime tool gateway (`invokeRuntimeDefaultTool`, `tool_gateway.js`).

---

*Status: spec drafted 2026-06-19 from the post-deletion audit + owner study. No code written yet — implementation starts at V1.0 on approval.*
